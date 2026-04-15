// Rate limiter — usa Redis se disponível, senão memória local
// Redis: funciona em serverless (Vercel) pois persiste entre instâncias
// Memória: funciona apenas em servidor único (dev / VPS)

const memStore = new Map();

// ── KV helpers (inline para evitar dependência circular) ──────
function getKv() {
    return {
        url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || "",
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ""
    };
}

async function redisIncr(key, ttlSeconds) {
    const { url, token } = getKv();
    if (!url || !token) return null;
    try {
        // Pipeline: INCR key + EXPIRE key ttl (only set expire on first hit)
        const res = await fetch(`${url}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify([
                ["INCR", key],
                ["EXPIRE", key, ttlSeconds, "NX"] // NX = só seta se não existir
            ])
        });
        const [[{ result: count }]] = await res.json();
        return Number(count);
    } catch {
        return null;
    }
}

// ── Memory fallback ───────────────────────────────────────────
function memIncr(key, windowMs) {
    const now = Date.now();
    const entry = memStore.get(key);

    if (!entry || now > entry.resetAt) {
        memStore.set(key, { count: 1, resetAt: now + windowMs });
        return 1;
    }

    entry.count += 1;
    return entry.count;
}

// ── Main middleware factory ───────────────────────────────────
export function rateLimit({ max = 20, windowSec = 60, message } = {}) {
    return (handler) => async (req, res) => {
        const ip = (
            req.headers["x-forwarded-for"]?.split(",")[0] ||
            req.socket?.remoteAddress ||
            "unknown"
        ).trim();

        const route = (req.url || "").split("?")[0];
        const key   = `rl:${ip}:${route}`;

        // Try Redis first
        let count = await redisIncr(key, windowSec);

        // Fallback to memory
        if (count === null) {
            count = memIncr(key, windowSec * 1000);
        }

        if (count > max) {
            return res.status(429).json({
                message: message || "Muitas tentativas. Aguarde antes de tentar novamente.",
                retryAfter: windowSec
            });
        }

        res.setHeader("X-RateLimit-Limit",     String(max));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - count)));

        return handler(req, res);
    };
}
