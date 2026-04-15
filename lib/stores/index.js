import { randomBytes } from "crypto";
import { getRuntimeState } from "../runtime/state.js";
import { saveStoresInState } from "../runtime/state.js";

function generateApiKey() {
    return "cpay_live_" + randomBytes(20).toString("hex");
}

export async function listStores() {
    const s = await getRuntimeState();
    return Array.isArray(s.stores) ? s.stores : [];
}

export async function getStoreById(id) {
    return (await listStores()).find(s => s.id === id) || null;
}

export async function getStoreByApiKey(apiKey) {
    if (!apiKey) return null;
    return (await listStores()).find(s => s.apiKey === apiKey && s.enabled !== false) || null;
}

export async function createStore({ name, url, activeProvider = null }) {
    if (!name) throw new Error("name é obrigatório");
    const store = {
        id:             "store_" + randomBytes(6).toString("hex"),
        name:           String(name).trim(),
        url:            String(url || "").trim(),
        apiKey:         generateApiKey(),
        activeProvider: activeProvider || null,
        enabled:        true,
        createdAt:      new Date().toISOString()
    };
    await saveStoresInState([...(await listStores()), store]);
    return store;
}

export async function updateStore(id, data) {
    const stores = await listStores();
    const idx    = stores.findIndex(s => s.id === id);
    if (idx < 0) throw new Error("Loja não encontrada");
    const next = [...stores];
    next[idx] = { ...stores[idx], ...data, id, updatedAt: new Date().toISOString() };
    await saveStoresInState(next);
    return next[idx];
}

export async function deleteStore(id) {
    await saveStoresInState((await listStores()).filter(s => s.id !== id));
}

export async function regenerateStoreKey(id) {
    return updateStore(id, { apiKey: generateApiKey() });
}
