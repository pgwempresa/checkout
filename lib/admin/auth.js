import { createHmac, timingSafeEqual } from "crypto";

function getSecret() {
    return String(process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || "changeme").trim();
}

function getDayStamp() {
    return new Date().toISOString().slice(0, 10);
}

export function generateAdminToken(password) {
    const secret = getSecret();
    return createHmac("sha256", secret)
        .update(String(password) + ":" + getDayStamp())
        .digest("hex");
}

export function verifyAdminToken(token) {
    if (!token || typeof token !== "string") return false;
    const password = String(process.env.ADMIN_PASSWORD || "").trim();
    if (!password) return false;

    const expected = generateAdminToken(password);

    try {
        return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    } catch {
        return false;
    }
}

export function requireAdminAuth(req, res) {
    const auth = String(req.headers["authorization"] || "");
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    if (!verifyAdminToken(token)) {
        res.status(401).json({ message: "Nao autorizado. Faca login no painel." });
        return false;
    }

    return true;
}
