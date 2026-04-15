import { cors } from "../lib/api/cors.js";
import { getActiveProviderId } from "../lib/providers/index.js";
import { getRuntimeInfo, getStoreConnectionStatus } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    let kvTestError = null;
    let kvTestSuccess = false;
    let rawKvGet = null;
    let kvGetOutput = null;
    let debugTrace = {};
    
    try {
        const { getStorageMode, getKvConfig } = await import("../lib/runtime/state.js");
        if (getStorageMode() === "redis") {
            const { url, token } = getKvConfig();
            debugTrace.kvConfig = { hasUrl: !!url, hasToken: !!token };
            if (!url || !token) {
                kvGetOutput = "Missing url or token inside state.js getKvConfig";
            } else {
                const fetchRes = await fetch(`${url}/pipeline`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify([["GET", "checkout:state"]])
                });
                const data = await fetchRes.json();
                kvGetOutput = data;
                
                const item = data?.[0]?.result;
                debugTrace.itemRaw = item;
                debugTrace.itemType = typeof item;
                if (item) {
                     try { debugTrace.parsed = JSON.parse(item); } catch(e) { debugTrace.parseError = e.message; }
                }
            }
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
            kvGetOutput,
            debugTrace,
            envKeys: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('UPSTASH') || k.includes('STORAGE') || k.includes('REST') || k.includes('TOKEN')).join(', ')
        },
        connection:     await getStoreConnectionStatus()
    });
}

export default cors(handler);
