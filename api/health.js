import { cors } from "../lib/api/cors.js";
import { getActiveProviderId } from "../lib/providers/index.js";
import { getRuntimeInfo, getStoreConnectionStatus } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    return res.status(200).json({
        ok:             true,
        now:            new Date().toISOString(),
        activeProvider: await getActiveProviderId(),
        runtime:        { 
            ...getRuntimeInfo(), 
            envKeys: Object.keys(process.env).filter(k => k.includes('KV') || k.includes('UPSTASH') || k.includes('STORAGE') || k.includes('REST') || k.includes('TOKEN')).join(', ')
        },
        connection:     await getStoreConnectionStatus()
    });
}

export default cors(handler);
