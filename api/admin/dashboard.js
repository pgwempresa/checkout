import { requireAdminAuth } from "../../lib/admin/auth.js";
import { getActiveProviderId, listProviders } from "../../lib/providers/index.js";
import { getRuntimeInfo, getStoreConnectionStatus, listRecentOrders } from "../../lib/runtime/state.js";
import { listStores } from "../../lib/stores/index.js";

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    if (!requireAdminAuth(req, res)) return;

    return res.status(200).json({
        generatedAt: new Date().toISOString(),
        service: {
            title:          process.env.CHECKOUT_APP_NAME || "CheckoutPay",
            publicUrl:      process.env.CHECKOUT_PUBLIC_URL  || "",
            storeName:      process.env.CHECKOUT_STORE_NAME  || "",
            storeUrl:       process.env.CHECKOUT_STORE_URL   || "",
            activeProvider: await getActiveProviderId(),
            runtime:        getRuntimeInfo()
        },
        connection: await getStoreConnectionStatus(),
        providers:  await listProviders(),
        orders:     await listRecentOrders(),
        stores:     await listStores()
    });
}
