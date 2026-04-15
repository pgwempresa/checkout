import { getRuntimeInfo, getStoreConnectionStatus } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    let kvTestError = null;
    let kvTestSuccess = false;
    let rawKvGet = null;
    try {
        const url = process.env.KV_REST_API_URL || process.env.STORAGE_REST_API_URL;
        const token = process.env.KV_REST_API_TOKEN || process.env.STORAGE_REST_API_TOKEN;
        if(url && token) {
            const fetchRes = await fetch(`${url}/pipeline`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify([["SET", "test_ping", "ping"], ["GET", "test_ping"]])
            });
            const data = await fetchRes.json();
            kvTestSuccess = true;
            kvTestError = JSON.stringify(data);
        } else {
            kvTestError = "Missing url or token";
        }
    } catch(err) {
        kvTestError = err.message;
    }

    return res.status(200).json({
        ok:             true,
        now:            new Date().toISOString(),
        activeProvider: await getActiveProviderId(),
        runtime:        { 
            ...getRuntimeInfo(), 
            kvTestSuccess,
            kvTestError,
            rawKvGet,
            envKeys: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('UPSTASH') || k.includes('STORAGE') || k.includes('REST') || k.includes('TOKEN')).join(', ')
        },
        connection:     await getStoreConnectionStatus()
    });
}

export default cors(handler);
