import { cors } from "../../lib/api/cors.js";
import { getStoreConnectionStatus, recordStorePing } from "../../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method === "GET") {
        return res.status(200).json({
            connection: await getStoreConnectionStatus()
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const connection = await recordStorePing(req.body || {});

    return res.status(200).json({
        message: "Sinal da loja recebido com sucesso",
        connection
    });
}

export default cors(handler);
