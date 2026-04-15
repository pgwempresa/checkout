const ALLOWED_ORIGINS = (process.env.CHECKOUT_STORE_URL || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

function resolveOrigin(reqOrigin) {
    if (!reqOrigin) return "*";
    if (ALLOWED_ORIGINS.length === 0) return "*";
    return ALLOWED_ORIGINS.some(o => reqOrigin.startsWith(o)) ? reqOrigin : ALLOWED_ORIGINS[0];
}

export function cors(handler) {
    return async (req, res) => {
        const origin = resolveOrigin(req.headers.origin);

        res.setHeader("Access-Control-Allow-Origin",  origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Max-Age",       "86400");

        if (req.method === "OPTIONS") {
            return res.status(204).end ? res.status(204).end() : res.status(204).json({});
        }

        return handler(req, res);
    };
}
