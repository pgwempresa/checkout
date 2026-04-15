import { cors } from "../../lib/api/cors.js";
import { getStoreConnectionStatus, recordStorePing, getStorageMode } from "../../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method === "GET") {
        return res.status(200).json({
            connection: await getStoreConnectionStatus()
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const startConnection = await getStoreConnectionStatus();
    
    let connection = null;
    let debugTrace = { startConnection };
    
    try {
        connection = await recordStorePing(req.body || {});
    } catch(err) {
        debugTrace.recordPingError = err.message;
        debugTrace.recordPingStack = err.stack;
    }

    try {
        const { default: debugUrl } = await import("url");
        const { getKvConfig } = await import("../../lib/runtime/state.js");
        const { url, token } = getKvConfig();
        
        debugTrace.url = url?.substring(0, 15) + "...";
        debugTrace.token = !!token;
        
        if (getStorageMode() === "redis") {
            const getRes = await fetch(`${url}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify([["GET", "checkout:state"]])
            });
            const getData = await getRes.json();
            debugTrace.kvGetResult = getData;
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
