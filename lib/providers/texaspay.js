import { createHttpError } from "../checkout/errors.js";

const BASE_URL = "https://api.fastsoftbrasil.com";

function getKeys() {
    const secretKey = process.env.TEXASPAY_SECRET_KEY;
    const publicKey = process.env.TEXASPAY_PUBLIC_KEY;
    if (!secretKey) {
        throw createHttpError(500, "TEXASPAY_SECRET_KEY nao configurada no ambiente");
    }
    return { secretKey, publicKey };
}

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

function normalizeResponse(data) {
    // Normalize different field names the API might return
    const pix = data?.pix || data?.pixData || {};
    const qrCode     = pix.qrcode     || pix.emv         || data?.qrCode     || data?.emv     || "";
    const qrCodeBase64 = pix.qrCodeBase64 || pix.imageBase64 || data?.qrCodeBase64 || data?.imageBase64 || "";

    return {
        ...data,
        id:           data?.id           || data?.transactionId || data?.transaction_id || null,
        status:       data?.status       || data?.currentStatus  || null,
        qrCode,
        qrCodeBase64
    };
}

export const texaspayProvider = {
    id: "texaspay",
    label: "TexasPay",
    implemented: true,
    docsUrl: "https://developers.fastsoftbrasil.com/docs/api/user-transaction-controller-create-transaction",
    supports: ["pix"],
    credentials: ["TEXASPAY_SECRET_KEY", "TEXASPAY_PUBLIC_KEY"],
    description: "TexasPay (FastSoft Brasil) — adquirente com suporte a PIX.",
    isConfigured() {
        return Boolean(process.env.TEXASPAY_SECRET_KEY);
    },

    async createTransaction(payload) {
        const { secretKey, publicKey } = getKeys();

        // Map generic checkout payload to TexasPay/FastSoft format
        const body = {
            amount:        payload.amount,
            paymentMethod: payload.paymentMethod || payload.method || "pix",
            customer: {
                name:  payload.customer?.name     || payload.customerName  || "",
                email: payload.customer?.email    || payload.customerEmail || "",
                document: {
                    type:   "cpf",
                    number: (payload.customer?.cpf || payload.customer?.document?.number || payload.customer?.document || payload.customerDocument || "").replace(/\D/g, "")
                },
                phone: payload.customer?.phone || payload.customerPhone || ""
            },
            items: Array.isArray(payload.items) && payload.items.length > 0
                ? payload.items.map(i => ({
                    title:     i.name      || i.title   || "Produto",
                    quantity:  i.quantity  || 1,
                    unitPrice: i.unitPrice || i.unit_price || i.price || payload.amount,
                    tangible:  true
                }))
                : [{ title: "Produto", quantity: 1, unitPrice: payload.amount, tangible: true }],
            pix: { expiresInSeconds: 1800 }, // 30 min
            webhookUrl: process.env.CHECKOUT_PUBLIC_URL
                ? `${process.env.CHECKOUT_PUBLIC_URL}/api/webhook` : undefined
        };

        // Auth: Basic base64("x:SECRET_KEY") — format required by FastSoft API
        const basicToken = Buffer.from(`x:${secretKey}`).toString("base64");
        const response = await fetch(`${BASE_URL}/api/user/transactions`, {
            method: "POST",
            headers: {
                "Content-Type":  "application/json",
                "Accept":        "application/json",
                "Authorization": `Basic ${basicToken}`
            },
            body: JSON.stringify(body)
        });

        const data = await parseJson(response);

        if (!response.ok) {
            console.error("TexasPay createTransaction error", { status: response.status, data });
            throw createHttpError(response.status, data?.message || data?.error || "Erro ao criar transacao na TexasPay", data);
        }

        return normalizeResponse(data);
    },

    async getTransactionStatus(transactionId) {
        const { secretKey } = getKeys();

        const basicToken = Buffer.from(`x:${secretKey}`).toString("base64");
        const response = await fetch(`${BASE_URL}/api/user/transactions/${transactionId}`, {
            method: "GET",
            headers: {
                "Accept":        "application/json",
                "Authorization": `Basic ${basicToken}`
            }
        });

        const data = await parseJson(response);

        if (!response.ok) {
            console.error("TexasPay getStatus error", { status: response.status, transactionId, data });
            throw createHttpError(response.status, data?.message || data?.error || "Erro ao consultar transacao na TexasPay", data);
        }

        return normalizeResponse(data);
    }
};
