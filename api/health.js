import { getRuntimeInfo, getStoreConnectionStatus } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    return res.status(200).json({
        ok:             true,
        now:            new Date().toISOString(),
        runtime:        getRuntimeInfo(),
        connection:     await getStoreConnectionStatus()
    });
}

export default handler;
