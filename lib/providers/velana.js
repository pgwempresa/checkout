import { createHttpError } from "../checkout/errors.js";

function getVelanaSecretKey() {
    const secretKey = process.env.VELANA_SECRET_KEY;
    if (!secretKey) {
        throw createHttpError(500, "VELANA_SECRET_KEY nao configurada no ambiente");
    }

    return secretKey;
}

function getAuthHeader(secretKey) {
    return `Basic ${Buffer.from(`${secretKey}:x`).toString("base64")}`;
}

function mapItems(items) {
    if (!Array.isArray(items)) return [];

    return items.map((item) => ({
        title:     item.title || item.name || "Produto",
        unitPrice: item.unitPrice,
        quantity:  item.quantity,
        tangible:  item.tangible !== false
    }));
}

function mapVelanaPayload(payload) {
    return {
        amount:        payload.amount,
        paymentMethod: payload.paymentMethod,
        currency:      payload.currency,
        customer:      payload.customer,
        shipping:      payload.shipping,
        items:         mapItems(payload.items),
        postbackUrl:   payload.postbackUrl || process.env.CHECKOUT_POSTBACK_URL,
        metadata:      typeof payload.metadata === "string" ? payload.metadata : JSON.stringify(payload.metadata || {})
    };
}

function normalizeVelanaResponse(data) {
    const pix = data?.pix || {};
    const qrCode = pix.qrcode || data?.qrCode || "";
    const qrCodeBase64 = pix.qrCodeBase64 || data?.qrCodeBase64 || "";

    return {
        ...data,
        id: data?.id || null,
        status: data?.status || null,
        qrCode,
        qrCodeBase64
    };
}

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

export const velanaProvider = {
    id: "velana",
    label: "Velana",
    implemented: true,
    supports: ["pix"],
    credentials: ["VELANA_SECRET_KEY"],
    description: "Adapter legado da Velana para manter compatibilidade com sua operacao atual.",
    isConfigured() {
        return Boolean(process.env.VELANA_SECRET_KEY);
    },
    async createTransaction(payload) {
        const secretKey = getVelanaSecretKey();
        const response = await fetch("https://api.velana.com.br/v1/transactions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: getAuthHeader(secretKey)
            },
            body: JSON.stringify(mapVelanaPayload(payload))
        });

        const data = await parseJson(response);

        if (!response.ok) {
            console.error("Velana transaction error", {
                status: response.status,
                data
            });

            throw createHttpError(response.status, data?.message || "Erro ao criar transacao na Velana", data);
        }

        return normalizeVelanaResponse(data);
    },
    async getTransactionStatus(transactionId) {
        const secretKey = getVelanaSecretKey();
        const response = await fetch(`https://api.velana.com.br/v1/transactions/${transactionId}`, {
            method: "GET",
            headers: {
                Accept: "application/json",
                Authorization: getAuthHeader(secretKey)
            }
        });

        const data = await parseJson(response);

        if (!response.ok) {
            console.error("Velana status error", {
                status: response.status,
                transactionId,
                data
            });

            throw createHttpError(response.status, data?.message || "Erro ao consultar transacao na Velana", data);
        }

        return normalizeVelanaResponse(data);
    }
};
