function clonePayload(raw) {
    if (raw == null || typeof raw !== "object") return {};

    if (typeof structuredClone === "function") {
        return structuredClone(raw);
    }

    return JSON.parse(JSON.stringify(raw));
}

export function collectStringValues(value, results = [], seen = new WeakSet()) {
    if (value == null) return results;

    if (typeof value === "string") {
        results.push(value.trim());
        return results;
    }

    if (typeof value !== "object") return results;
    if (seen.has(value)) return results;
    seen.add(value);

    if (Array.isArray(value)) {
        value.forEach((item) => collectStringValues(item, results, seen));
        return results;
    }

    Object.values(value).forEach((item) => collectStringValues(item, results, seen));
    return results;
}

export function looksLikePixCode(value) {
    if (!value || typeof value !== "string") return false;
    const normalized = value.replace(/\s+/g, "");
    return normalized.startsWith("000201") && normalized.length > 40;
}

export function looksLikeBase64Image(value) {
    if (!value || typeof value !== "string") return false;
    if (value.startsWith("data:image/")) return true;
    return /^[A-Za-z0-9+/=\s]+$/.test(value) && value.replace(/\s+/g, "").length > 300;
}

export function extractPixDetails(source) {
    const values = collectStringValues(source);
    const pixCode = values.find(looksLikePixCode) || "";
    const qrImage = values.find(looksLikeBase64Image) || "";
    return { pixCode, qrImage };
}

export function digitsOnly(value) {
    if (value == null) return "";
    return String(value).replace(/\D/g, "");
}

export function normalizeState(value) {
    if (value == null) return "";
    const normalized = String(value).replace(/[^a-zA-Z]/g, "").toUpperCase();
    return normalized.slice(0, 2);
}

export function normalizePaymentMethod(value) {
    if (!value) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "pix") return "pix";
    if (normalized === "boleto") return "boleto";
    if (normalized === "credit_card" || normalized === "credit-card" || normalized === "creditcard") return "credit_card";
    return normalized;
}

export function normalizeDocumentType(value) {
    if (!value) return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "cpf") return "cpf";
    if (normalized === "cnpj") return "cnpj";
    return normalized;
}

export function inferDocumentTypeFromNumber(documentNumber) {
    const digits = digitsOnly(documentNumber);
    if (digits.length === 11) return "cpf";
    if (digits.length === 14) return "cnpj";
    return "";
}

export function normalizeStreetNumber(value) {
    const cleaned = String(value ?? "").trim();
    if (!cleaned) return "s/n";
    return cleaned.slice(0, 150);
}

export function toAmountInCents(value) {
    if (value == null || value === "") return null;

    if (typeof value === "number") {
        if (!Number.isFinite(value)) return null;
        return Number.isInteger(value) ? Math.round(value) : Math.round(value * 100);
    }

    const raw = String(value).trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) {
        return Math.round(Number(raw));
    }

    let normalized = raw.replace(/\s+/g, "");

    if (normalized.includes(",") && normalized.includes(".")) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
        return Math.round(Number(normalized) * 100);
    }

    if (normalized.includes(",")) {
        return Math.round(Number(normalized.replace(",", ".")) * 100);
    }

    const parts = normalized.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
        return Math.round(Number(normalized) * 100);
    }

    return Math.round(Number(normalized.replace(/\./g, "")));
}

function toPositiveInteger(value, fallback = 1) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function normalizeCurrency(value) {
    if (!value) return "BRL";
    return String(value).trim().toUpperCase();
}

export function normalizeItem(item, index) {
    const quantity = toPositiveInteger(item?.quantity, 1);
    const unitPrice = toAmountInCents(item?.unitPrice ?? item?.price ?? item?.unit_amount);
    const fallbackAmount = toAmountInCents(item?.amount ?? item?.totalAmount ?? item?.total);
    const totalAmount = unitPrice != null ? unitPrice * quantity : fallbackAmount;
    const safeAmount = totalAmount != null ? totalAmount : 0;
    const safeUnitPrice = unitPrice != null ? unitPrice : quantity > 0 ? Math.round(safeAmount / quantity) : safeAmount;
    const productId = String(item?.id ?? item?.sku ?? item?.productId ?? `item-${index + 1}`).trim();
    const name = String(item?.name ?? item?.title ?? `Item ${index + 1}`).trim();

    return {
        id: productId,
        sku: String(item?.sku ?? item?.id ?? item?.productId ?? "").trim(),
        name,
        quantity,
        unitPrice: safeUnitPrice,
        amount: safeAmount
    };
}

export function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map((item, index) => normalizeItem(item, index))
        .filter((item) => item.quantity > 0 && item.amount >= 0);
}

export function sumItemsAmount(items) {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
}

function normalizeAddress(address) {
    if (!address || typeof address !== "object") return address;

    return {
        ...address,
        zipCode: digitsOnly(address.zipCode),
        state: normalizeState(address.state),
        streetNumber: normalizeStreetNumber(address.streetNumber),
        country: address.country || "BR"
    };
}

export function normalizeProviderPayload(raw) {
    const payload = clonePayload(raw);

    payload.paymentMethod = normalizePaymentMethod(payload.paymentMethod);

    if (payload.customer?.document) {
        payload.customer.document.number = digitsOnly(payload.customer.document.number);
        const normalizedType = normalizeDocumentType(payload.customer.document.type);
        payload.customer.document.type = normalizedType || inferDocumentTypeFromNumber(payload.customer.document.number) || payload.customer.document.type;
    }

    if (payload.customer) {
        payload.customer.phone = digitsOnly(payload.customer.phone);
        if (payload.customer.email) payload.customer.email = String(payload.customer.email).trim().toLowerCase();
        if (payload.customer.name) payload.customer.name = String(payload.customer.name).trim();
        if (payload.customer.address) payload.customer.address = normalizeAddress(payload.customer.address);
    }

    if (payload.shipping) {
        if (payload.shipping.address) payload.shipping.address = normalizeAddress(payload.shipping.address);

        if (payload.shipping.fee != null) {
            const normalizedFee = toAmountInCents(payload.shipping.fee);
            if (normalizedFee != null) payload.shipping.fee = normalizedFee;
        }
    }

    if (Array.isArray(payload.items)) {
        payload.items = normalizeItems(payload.items);
    }

    if (payload.currency) {
        payload.currency = normalizeCurrency(payload.currency);
    }

    if (payload.amount != null) {
        const amountNumber = toAmountInCents(payload.amount);
        payload.amount = amountNumber != null ? amountNumber : payload.amount;
    }

    return payload;
}

export function normalizeCheckoutRequest(raw) {
    const payload = clonePayload(raw);
    const items = normalizeItems(payload.items || payload.cart?.items || []);
    const amountFromItems = sumItemsAmount(items);
    const normalizedAmount = toAmountInCents(payload.amount);
    const amount = normalizedAmount != null ? normalizedAmount : amountFromItems;
    const shippingFee = toAmountInCents(payload.shipping?.fee);

    return {
        referenceId: String(payload.referenceId || payload.orderId || payload.merchantOrderId || "").trim(),
        paymentMethod: normalizePaymentMethod(payload.paymentMethod || "pix") || "pix",
        currency: normalizeCurrency(payload.currency),
        amount,
        items,
        shipping: payload.shipping
            ? {
                ...payload.shipping,
                fee: shippingFee != null ? shippingFee : payload.shipping.fee,
                address: payload.shipping.address ? normalizeAddress(payload.shipping.address) : payload.shipping.address
            }
            : undefined,
        customer: normalizeProviderPayload({ customer: payload.customer }).customer,
        metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
        raw: payload
    };
}

export function buildProviderPayload(checkout) {
    const payload = normalizeProviderPayload({
        ...checkout.raw,
        referenceId: checkout.referenceId,
        paymentMethod: checkout.paymentMethod,
        currency: checkout.currency,
        amount: checkout.amount,
        items: checkout.items,
        shipping: checkout.shipping,
        customer: checkout.customer
    });

    if (payload.amount == null && Array.isArray(payload.items)) {
        payload.amount = sumItemsAmount(payload.items);
    }

    return payload;
}
