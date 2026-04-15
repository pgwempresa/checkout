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
    
    // Direct Upstash test
    try {
        const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
        const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN;
        
        if (url && token) {
            // SET test exactly like kvSet
            const testObj = { storeConnection: { status: "test", lastPingAt: new Date().toISOString() } };
            const cmdSet = ["SET", "checkout_pay_state_v1", JSON.stringify(testObj)];
            
            const setRes = await fetch(`${url}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify([cmdSet])
            });
            debugTrace.setResponse = await setRes.text();
            
            // GET test exactly like kvGet
            const getRes = await fetch(`${url}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify([["GET", "checkout_pay_state_v1"]])
            });
            const getJson = await getRes.json();
            debugTrace.getResponse = getJson;
            
            const item = getJson?.[0]?.result;
            debugTrace.itemRaw = item;
            debugTrace.itemType = typeof item;
            
            try {
                const parsed = JSON.parse(item);
                debugTrace.parsed = parsed;
                debugTrace.parsedType = typeof parsed;
            } catch(e) {
                debugTrace.parseError = e.message;
            }
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
