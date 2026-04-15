import { createHttpError } from "../checkout/errors.js";

function getBestfySecretKey() {
    const secretKey = process.env.BESTFY_SECRET_KEY || process.env.BESTFY_API_KEY;
    if (!secretKey) {
        throw createHttpError(500, "BESTFY_SECRET_KEY ou BESTFY_API_KEY nao configurada no ambiente");
    }

    return secretKey;
}

function getAuthHeader(secretKey) {
    return `Basic ${Buffer.from(`${secretKey}:x`).toString("base64")}`;
}

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

function mapItems(items) {
    if (!Array.isArray(items)) return [];

    return items.map((item) => ({
        title: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        tangible: item.tangible !== false
    }));
}

function mapBestfyPayload(payload) {
    return {
        amount: payload.amount,
        paymentMethod: payload.paymentMethod,
        customer: payload.customer,
        shipping: payload.shipping,
        items: mapItems(payload.items),
        installments: payload.installments,
        card: payload.card,
        boleto: payload.boleto,
        pix: payload.pix,
        postbackUrl: payload.postbackUrl || process.env.CHECKOUT_POSTBACK_URL,
        metadata: typeof payload.metadata === "string" ? payload.metadata : JSON.stringify(payload.metadata || {}),
        ip: payload.ip,
        splits: payload.splits
    };
}

function normalizeBestfyResponse(data) {
    const pix = data?.pix || {};

    return {
        ...data,
        id: data?.id || null,
        status: data?.status || null,
        qrCode: pix.qrcode || data?.qrCode || "",
        qrCodeBase64: data?.qrCodeBase64 || "",
        secureUrl: data?.secureUrl || ""
    };
}

export const bestfyProvider = {
    id: "bestfy",
    label: "Bestfy",
    implemented: true,
    supports: ["pix", "boleto", "credit_card"],
    docsUrl: "https://bestfy.readme.io/reference/introducao",
    credentials: ["BESTFY_SECRET_KEY"],
    description: "Gateway com suporte a transacoes diretas e checkout hospedado.",
    isConfigured() {
        return Boolean(process.env.BESTFY_SECRET_KEY || process.env.BESTFY_API_KEY);
    },
    async createTransaction(payload) {
        const secretKey = getBestfySecretKey();
        const response = await fetch("https://api.bestfybr.com.br/v1/transactions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: getAuthHeader(secretKey)
            },
            body: JSON.stringify(mapBestfyPayload(payload))
        });

        const data = await parseJson(response);

        if (!response.ok) {
            console.error("Bestfy transaction error", {
                status: response.status,
                data
            });

            throw createHttpError(response.status, data?.message || "Erro ao criar transacao na Bestfy", data);
        }

        return normalizeBestfyResponse(data);
    },
    async getTransactionStatus(transactionId) {
        const secretKey = getBestfySecretKey();
        const response = await fetch(`https://api.bestfybr.com.br/v1/transactions/${transactionId}`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: getAuthHeader(secretKey)
            }
        });

        const data = await parseJson(response);

        if (!response.ok) {
            console.error("Bestfy status error", {
                status: response.status,
                transactionId,
                data
            });

            throw createHttpError(response.status, data?.message || "Erro ao consultar transacao na Bestfy", data);
        }

        return normalizeBestfyResponse(data);
    }
};
