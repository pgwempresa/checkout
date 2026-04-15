import { getActiveProviderId, listProviders } from "../lib/providers/index.js";
import { getRuntimeInfo } from "../lib/runtime/state.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    return res.status(200).json({
        activeProvider: getActiveProviderId(),
        providers: listProviders(),
        runtime: getRuntimeInfo()
    });
}
