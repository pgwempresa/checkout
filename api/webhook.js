import { createHmac, timingSafeEqual } from "crypto";
import { cors } from "../lib/api/cors.js";
import { updateOrderStatus, listRecentOrders } from "../lib/runtime/state.js";
import { sendPaymentConfirmed } from "../lib/notifications/email.js";

function verifyWebhookSignature(req) {
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) return true; // verificação desativada quando WEBHOOK_SECRET não está configurado

    const signature = String(req.headers["x-webhook-signature"] || req.headers["x-signature"] || "").trim();
    if (!signature) return false;

    const rawBody = typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body || {});
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

    try {
        return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
        return false;
    }
}

async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    if (!verifyWebhookSignature(req)) {
        return res.status(401).json({ message: "Assinatura do webhook inválida." });
    }

    try {
        const body = req.body || {};

        // Normalize fields from different providers
        const transactionId = String(
            body.id || body.transactionId || body.transaction_id || ""
        ).trim();

        const status = String(
            body.status || body.currentStatus || body.current_status || ""
        ).trim().toLowerCase();

        if (transactionId && status) {
            await updateOrderStatus(transactionId, status);

            // Send email notification for paid/approved payments
            if (["paid", "approved", "captured"].includes(status)) {
                const orders = await listRecentOrders();
                const order = orders.find(o => o.transactionId === transactionId || o.id === transactionId);
                sendPaymentConfirmed({
                    transactionId,
                    referenceId:  order?.referenceId  || body.referenceId  || "",
                    amount:       order?.amount       || body.amount       || 0,
                    currency:     order?.currency     || body.currency     || "BRL",
                    provider:     order?.provider     || body.provider     || "",
                    customerName: order?.customerName || body.customerName || ""
                }).catch(err => console.error("Email notification error:", err.message));
            }
        }

        // Forward to store webhook if configured
        const storeWebhook = process.env.CHECKOUT_STORE_WEBHOOK_URL;
        if (storeWebhook) {
            fetch(storeWebhook, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...body, _source: "checkout-pay" })
            }).catch((err) => {
                console.error("Store webhook forward error:", err.message);
            });
        }

        return res.status(200).json({ received: true, transactionId, status });
    } catch (error) {
        console.error("Webhook error:", error.message);
        return res.status(500).json({ message: "Erro ao processar webhook" });
    }
}

export default cors(handler);
