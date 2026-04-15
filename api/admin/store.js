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

    let debugTrace = {};
    const connection = await recordStorePing(req.body || {});
    
    // Manual test of kvSet and kvGet for the specific state key
    try {
        const { getStorageMode, getKvConfig } = await import("../../lib/runtime/state.js");
        if (getStorageMode() === "redis") {
            const { url, token } = getKvConfig();
            
            // Raw GET test
            const getRes = await fetch(`${url}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify([["GET", "checkout_pay_state_v1"]])
            });
            const getData = await getRes.json();
            
            debugTrace.rawGet = getData;
        }
    } catch(err) {
        debugTrace.error = err.message;
    }

    return res.status(200).json({
        message: "Sinal da loja recebido com sucesso",
        connection,
        debugTrace
    });
}

export default cors(handler);
