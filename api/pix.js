import { cors } from "../lib/api/cors.js";
import { rateLimit } from "../lib/api/rate-limit.js";
import { getErrorResponse } from "../lib/checkout/errors.js";
import { normalizeProviderPayload } from "../lib/checkout/normalize.js";
import { getActiveProvider } from "../lib/providers/index.js";
import { recordOrderAttempt, saveTransactionSession } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    try {
        const provider = await getActiveProvider();
        const payload = normalizeProviderPayload(req.body);
        const data = await provider.createTransaction(payload);

        await recordOrderAttempt({
            id:            data.id,
            transactionId: data.id,
            referenceId:   payload.referenceId,
            provider:      provider.id,
            amount:        payload.amount,
            currency:      payload.currency,
            status:        data.status || "pending",
            customer:      payload.customer,
            items:         payload.items
        });

        if (data.id) {
            await saveTransactionSession(data.id, {
                transactionId: data.id,
                referenceId:   payload.referenceId,
                amount:        payload.amount,
                currency:      payload.currency,
                provider:      provider.id,
                paymentMethod: "pix",
                qrCode:        data.qrCode       || "",
                qrCodeBase64:  data.qrCodeBase64 || "",
                status:        data.status       || "pending"
            });
        }

        return res.status(200).json({ ...data, provider: provider.id });
    } catch (error) {
        const response = getErrorResponse(error, "Erro interno ao comunicar com a adquirente");
        return res.status(response.status).json(response.body);
    }
}

export default cors(rateLimit({ max: 15, windowSec: 60 })(handler));
