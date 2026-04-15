import { cors } from "../lib/api/cors.js";
import { getErrorResponse } from "../lib/checkout/errors.js";
import { getActiveProvider } from "../lib/providers/index.js";
import { getTransactionSession } from "../lib/runtime/state.js";

async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const { id } = req.query;
    if (!id) return res.status(400).json({ message: "Transaction ID is required" });

    try {
        const provider = await getActiveProvider();
        const data = await provider.getTransactionStatus(id);

        // Enrich with saved session data (qrCode may not come back on status check)
        const session = await getTransactionSession(id);

        return res.status(200).json({
            ...data,
            qrCode:       data.qrCode       || session?.qrCode       || "",
            qrCodeBase64: data.qrCodeBase64 || session?.qrCodeBase64 || "",
            referenceId:  data.referenceId  || session?.referenceId  || "",
            amount:       data.amount       ?? session?.amount       ?? 0,
            currency:     data.currency     || session?.currency     || "BRL",
            provider:     provider.id
        });
    } catch (error) {
        const response = getErrorResponse(error, "Erro interno ao consultar status na adquirente");
        return res.status(response.status).json(response.body);
    }
}

export default cors(handler);
