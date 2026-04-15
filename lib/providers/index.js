import { createHttpError } from "../checkout/errors.js";
import { getRuntimeProviderId } from "../runtime/state.js";
import { bestfyProvider } from "./bestfy.js";
import { velanaProvider } from "./velana.js";
import { texaspayProvider } from "./texaspay.js";

const providers = {
    velana: velanaProvider,
    bestfy: bestfyProvider,
    texaspay: texaspayProvider
};

function normalizeId(v) {
    if (!v) return "velana";
    return String(v).trim().toLowerCase();
}

export async function listProviders() {
    const activeId = await getActiveProviderId();
    return Object.values(providers).map((p) => ({
        id:          p.id,
        label:       p.label,
        active:      p.id === activeId,
        implemented: p.implemented,
        configured:  p.isConfigured(),
        supports:    p.supports,
        docsUrl:     p.docsUrl || "",
        credentials: p.credentials || [],
        description: p.description || ""
    }));
}

export async function getActiveProviderId() {
    const fallback = process.env.CHECKOUT_ACTIVE_PROVIDER || "velana";
    return normalizeId(await getRuntimeProviderId(fallback));
}

export async function getActiveProvider() {
    const id = await getActiveProviderId();
    const provider = providers[id];
    if (!provider) {
        throw createHttpError(
            500,
            `Adquirente inválida: ${id}. Use: ${Object.keys(providers).join(", ")}`
        );
    }
    return provider;
}

export function getProviderById(id) {
    return providers[normalizeId(id)] || null;
}
