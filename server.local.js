import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

// Auto-load .env file
(function loadDotEnv() {
    const envPath = join(fileURLToPath(new URL(".", import.meta.url)), ".env");
    if (!existsSync(envPath)) return;
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (key && !(key in process.env)) process.env[key] = val;
    }
})();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

const STATIC_ROUTES = {
    "/":                 "index.html",
    "/login":            "login.html",
    "/checkout":         "checkout.html",
    "/preview":          "preview.html",
    "/checkout-client.js": "checkout-client.js"
};

function parseBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString();
            try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
        });
    });
}

function serveStatic(res, filePath) {
    const ext = extname(filePath);
    const mime = MIME[ext] || "application/octet-stream";
    try {
        const content = readFileSync(filePath);
        res.writeHead(200, { "Content-Type": mime });
        res.end(content);
    } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("404 Not Found");
    }
}

function makeRes(nodeRes) {
    let code = 200;
    const extra = {};
    const res = {
        status(c) { code = c; return this; },
        setHeader(k, v) { extra[k] = v; return this; },
        end(body = "") {
            const headers = { "Access-Control-Allow-Origin": "*", ...extra };
            nodeRes.writeHead(code, headers);
            nodeRes.end(body);
        },
        json(data) {
            nodeRes.writeHead(code, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                ...extra
            });
            nodeRes.end(JSON.stringify(data));
        }
    };
    return res;
}

async function loadHandler(pathname) {
    // /api/admin/dashboard -> api/admin/dashboard.js
    const rel = pathname.replace(/^\//, "") + ".js";
    const full = join(__dirname, rel);
    if (existsSync(full)) {
        const mod = await import(full);
        return mod.default || null;
    }
    return null;
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" });
        res.end();
        return;
    }

    // API routes
    if (pathname.startsWith("/api/")) {
        req.body = await parseBody(req);
        req.query = Object.fromEntries(url.searchParams.entries());
        req.headers = req.headers;

        const handler = await loadHandler(pathname).catch(() => null);

        if (handler) {
            try {
                await handler(req, makeRes(res));
            } catch (err) {
                console.error("Handler error:", err);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: err.message }));
            }
            return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Rota nao encontrada: " + pathname }));
        return;
    }

    // Static file routes
    const mapped = STATIC_ROUTES[pathname];
    if (mapped) {
        serveStatic(res, join(__dirname, mapped));
        return;
    }

    // Assets and other files
    const filePath = join(__dirname, pathname.slice(1));
    if (existsSync(filePath)) {
        serveStatic(res, filePath);
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
});

server.listen(PORT, () => {
    console.log("");
    console.log("  Servidor rodando:");
    console.log(`  → http://localhost:${PORT}/login   (admin login)`);
    console.log(`  → http://localhost:${PORT}/        (painel)`);
    console.log("");
    console.log("  Variavel ADMIN_PASSWORD:", process.env.ADMIN_PASSWORD ? "✓ configurada" : "⚠ nao definida (defina no .env)");
    console.log("");
});
