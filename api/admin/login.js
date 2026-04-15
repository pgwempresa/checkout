import { generateAdminToken } from "../../lib/admin/auth.js";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const configuredPassword = String(process.env.ADMIN_PASSWORD || "").trim();

    if (!configuredPassword) {
        return res.status(503).json({
            message: "ADMIN_PASSWORD nao configurado. Defina a variavel de ambiente antes de acessar o painel."
        });
    }

    const provided = String(req.body?.password || "").trim();

    if (provided !== configuredPassword) {
        return res.status(401).json({ message: "Senha incorreta." });
    }

    const token = generateAdminToken(configuredPassword);
    return res.status(200).json({ token });
}
