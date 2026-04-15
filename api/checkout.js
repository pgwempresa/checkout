import { cors } from "../lib/api/cors.js";
import { rateLimit } from "../lib/api/rate-limit.js";
import { createHttpError, getErrorResponse } from "../lib/checkout/errors.js";
import { buildProviderPayload, normalizeCheckoutRequest } from "../lib/checkout/normalize.js";
import { getActiveProvider } from "../lib/providers/index.js";
import { recordOrderAttempt, saveTransactionSession } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    try {
        const checkout = normalizeCheckoutRequest(req.body);

        if (!checkout.customer?.name || !checkout.customer?.email) {
            throw createHttpError(400, "customer.name e customer.email são obrigatórios");
        }

        if (!checkout.amount || checkout.amount <= 0) {
            throw createHttpError(400, "amount deve ser maior que zero");
        }

        const provider = await getActiveProvider();
        const providerPayload = buildProviderPayload(checkout);
        const transaction = await provider.createTransaction(providerPayload);

        await recordOrderAttempt({
            id:            transaction.id,
            transactionId: transaction.id,
            referenceId:   checkout.referenceId,
            provider:      provider.id,
            amount:        checkout.amount,
            currency:      checkout.currency,
            status:        transaction.status || "pending",
            customer:      checkout.customer,
            items:         checkout.items
        });

        // Persist session so checkout page can retrieve QR code
        if (transaction.id) {
            await saveTransactionSession(transaction.id, {
                transactionId: transaction.id,
                referenceId:   checkout.referenceId,
                amount:        checkout.amount,
                currency:      checkout.currency,
                provider:      provider.id,
                paymentMethod: checkout.paymentMethod,
                qrCode:        transaction.qrCode        || "",
                qrCodeBase64:  transaction.qrCodeBase64  || "",
                status:        transaction.status        || "pending",
                customerName:  checkout.customer?.name   || ""
            });
        }

        return res.status(200).json({
            provider:    provider.id,
            referenceId: checkout.referenceId || null,
            amount:      checkout.amount,
            currency:    checkout.currency,
            items:       checkout.items,
            transaction,
            checkoutUrl: transaction.id
                ? `${process.env.CHECKOUT_PUBLIC_URL || ""}/checkout?tid=${transaction.id}&ref=${encodeURIComponent(checkout.referenceId || "")}&amount=${checkout.amount}&method=${checkout.paymentMethod}`
                : null
        });
    } catch (error) {
        const response = getErrorResponse(error, "Erro interno ao iniciar checkout");
        return res.status(response.status).json(response.body);
    }
}

export default cors(rateLimit({ max: 15, windowSec: 60 })(handler));
