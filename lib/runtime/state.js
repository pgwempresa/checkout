import fs from "fs";
import path from "path";

import { createHttpError } from "../checkout/errors.js";

const MEMORY_KEY = "__CHECKOUT_RUNTIME_STATE__";
const REDIS_STATE_KEY = "checkout:state";
const REDIS_SESSION_PREFIX = "checkout:session:";
const MAX_ORDERS = 25;

// ── Helpers ───────────────────────────────────────────────────
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function toIsoNow() { return new Date().toISOString(); }

function getDefaultState() {
    return {
        activeProvider: null,
        providerUpdatedAt: null,
        storeConnection: {
            storeId: "", storeName: "", storeUrl: "",
            source: "", lastPingAt: null, lastPath: "", notes: ""
        },
        recentOrders: [],
        stores: []
    };
}

function normalizeShape(raw) {
    const v = (raw && typeof raw === "object") ? raw : {};
    return {
        ...getDefaultState(), ...v,
        storeConnection: {
            ...getDefaultState().storeConnection,
            ...(v.storeConnection && typeof v.storeConnection === "object" ? v.storeConnection : {})
        },
        recentOrders: Array.isArray(v.recentOrders) ? v.recentOrders : [],
        stores: Array.isArray(v.stores) ? v.stores : []
    };
}

function trimOrders(orders) {
    return [...orders]
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, MAX_ORDERS);
}

// ── Storage mode ──────────────────────────────────────────────
export function getStorageMode() {
    const explicit = String(process.env.CHECKOUT_STORAGE_MODE || "").trim().toLowerCase();
    if (explicit === "readonly") return "readonly";
    if (explicit === "file")     return "file";
    if (explicit === "redis")    return "redis";
    if (explicit === "memory")   return "memory";
    // Auto-detect Redis if Vercel KV or Upstash env vars present
    if (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL) return "redis";
    return "memory";
}

export function isRuntimeWritable() { return getStorageMode() !== "readonly"; }

export function getRuntimeInfo() {
    const mode = getStorageMode();
    return {
        storageMode: mode,
        writable: isRuntimeWritable(),
        stateFilePath: mode === "file" ? (process.env.CHECKOUT_STATE_FILE || "/tmp/checkout-pay-state.json") : null
    };
}

// ── Redis / Vercel KV (Upstash REST) ──────────────────────────
export function getKvConfig() {
    return {
        url:   process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.STORAGE_REST_API_URL || "",
        token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.STORAGE_REST_API_TOKEN || ""
    };
}

async function kvGet(key) {
    const { url, token } = getKvConfig();
    if (!url || !token) return null;
    try {
        const res = await fetch(`${url}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify([["GET", key]])
        });
        const data = await res.json();
        const item = data?.[0]?.result;
        if (!item) return null;
        try { return JSON.parse(item); } catch { return item; }
    } catch (err) {
        console.error("KV get error:", key, err.message);
        return null; // SILENT FAILURE
    }
}

async function kvSet(key, value, ttl = null) {
    const { url, token } = getKvConfig();
    if (!url || !token) return;
    try {
        const cmd = ttl
            ? ["SET", key, JSON.stringify(value), "EX", ttl]
            : ["SET", key, JSON.stringify(value)];
        const res = await fetch(`${url}/pipeline`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify([cmd])
        });
        const data = await res.json();
        if (data?.[0]?.error) throw new Error("Upstash error: " + data[0].error);
    } catch (err) {
        console.error("KV set error:", key, err.message);
        throw err;
    }
}

// ── File storage ──────────────────────────────────────────────
function getFilePath() {
    return process.env.CHECKOUT_STATE_FILE || "/tmp/checkout-pay-state.json";
}

function readFromFile() {
    const fp = getFilePath();
    if (!fs.existsSync(fp)) return getDefaultState();
    try { return normalizeShape(JSON.parse(fs.readFileSync(fp, "utf8"))); }
    catch { return getDefaultState(); }
}

function writeToFile(state) {
    const fp = getFilePath();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(state, null, 2), "utf8");
}

// ── Memory storage ────────────────────────────────────────────
function getMemory() {
    if (!globalThis[MEMORY_KEY]) globalThis[MEMORY_KEY] = getDefaultState();
    return globalThis[MEMORY_KEY];
}

// ── Core load/save ────────────────────────────────────────────
async function loadState() {
    const mode = getStorageMode();
    if (mode === "redis")  return normalizeShape(await kvGet(REDIS_STATE_KEY) || getDefaultState());
    if (mode === "file")   return readFromFile();
    if (mode === "memory") return normalizeShape(getMemory());
    return getDefaultState();
}

async function saveState(next) {
    const mode = getStorageMode();
    const normalized = normalizeShape(next);

    if (mode === "readonly") {
        throw createHttpError(
            409,
            "Painel em modo somente leitura. Configure CHECKOUT_STORAGE_MODE=memory ou conecte um banco."
        );
    }
    if (mode === "redis") { await kvSet(REDIS_STATE_KEY, normalized); return normalized; }
    if (mode === "file")  { writeToFile(normalized); return normalized; }

    globalThis[MEMORY_KEY] = normalized;
    return normalized;
}

// ── Public API ────────────────────────────────────────────────
export async function getRuntimeState() {
    return loadState();
}

export async function getRuntimeProviderId(fallback) {
    const state = await loadState();
    return state.activeProvider || fallback;
}

export async function setRuntimeProviderId(id) {
    const current = await loadState();
    return saveState({ ...current, activeProvider: id, providerUpdatedAt: toIsoNow() });
}

export async function recordStorePing(payload = {}) {
    if (!isRuntimeWritable()) return getStoreConnectionStatus();

    const current = await loadState();
    const next = {
        ...current,
        storeConnection: {
            ...current.storeConnection,
            storeId:    String(payload.storeId    || current.storeConnection.storeId    || "html-store").trim(),
            storeName:  String(payload.storeName  || current.storeConnection.storeName  || process.env.CHECKOUT_STORE_NAME || "Loja HTML").trim(),
            storeUrl:   String(payload.storeUrl   || current.storeConnection.storeUrl   || process.env.CHECKOUT_STORE_URL  || "").trim(),
            source:     String(payload.source     || current.storeConnection.source     || "storefront").trim(),
            lastPingAt: toIsoNow(),
            lastPath:   String(payload.path       || payload.lastPath || "").trim(),
            notes:      String(payload.notes || "").trim()
        }
    };
    await saveState(next);
    return getStoreConnectionStatus();
}

export async function recordOrderAttempt(order = {}) {
    if (!isRuntimeWritable()) return null;

    const current = await loadState();
    const entry = {
        id:            String(order.id || order.transactionId || order.referenceId || `ord_${Date.now()}`).trim(),
        referenceId:   String(order.referenceId   || "").trim(),
        transactionId: String(order.transactionId || "").trim(),
        provider:      String(order.provider || "").trim(),
        amount:        Number.isFinite(Number(order.amount)) ? Number(order.amount) : 0,
        currency:      String(order.currency || "BRL").trim().toUpperCase(),
        status:        String(order.status || "pending").trim(),
        customerName:  String(order.customerName  || order.customer?.name  || "").trim(),
        customerEmail: String(order.customerEmail || order.customer?.email || "").trim().toLowerCase(),
        itemsCount:    Array.isArray(order.items)
            ? order.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)
            : Number(order.itemsCount) || 0,
        createdAt: toIsoNow()
    };

    await saveState({
        ...current,
        recentOrders: trimOrders([entry, ...current.recentOrders])
    });
    return entry;
}

export async function updateOrderStatus(transactionId, status) {
    if (!isRuntimeWritable() || !transactionId) return;
    const current = await loadState();
    const orders = current.recentOrders.map(o =>
        (o.transactionId === transactionId || o.id === transactionId)
            ? { ...o, status, updatedAt: toIsoNow() }
            : o
    );
    await saveState({ ...current, recentOrders: orders });
}

export async function listRecentOrders() {
    return (await loadState()).recentOrders;
}

// ── Transaction sessions (store qrCode for checkout page) ─────
export async function saveTransactionSession(transactionId, data) {
    const mode = getStorageMode();

    if (mode === "redis") {
        await kvSet(`${REDIS_SESSION_PREFIX}${transactionId}`, data, 7200); // 2h TTL
        return;
    }

    // For memory/file: store inline in state
    if (!isRuntimeWritable()) return;
    const current = await loadState();
    const sessions = current.sessions || {};
    sessions[transactionId] = { ...data, savedAt: toIsoNow() };
    // Keep only last 50 sessions
    const keys = Object.keys(sessions);
    if (keys.length > 50) delete sessions[keys[0]];
    await saveState({ ...current, sessions });
}

export async function getTransactionSession(transactionId) {
    const mode = getStorageMode();

    if (mode === "redis") {
        return kvGet(`${REDIS_SESSION_PREFIX}${transactionId}`);
    }

    const current = await loadState();
    return (current.sessions || {})[transactionId] || null;
}

export async function saveStoresInState(stores) {
    if (!isRuntimeWritable()) return;
    const current = await loadState();
    await saveState({ ...current, stores: Array.isArray(stores) ? stores : [] });
}

// ── Store connection status ───────────────────────────────────
export async function getStoreConnectionStatus() {
    const state = await loadState();
    const sc = state.storeConnection;
    const publicUrl  = String(process.env.CHECKOUT_PUBLIC_URL  || "").trim().replace(/\/$/, "");
    const storeName  = sc.storeName || String(process.env.CHECKOUT_STORE_NAME || "").trim();
    const storeUrl   = (sc.storeUrl || String(process.env.CHECKOUT_STORE_URL || "").trim()).replace(/\/$/, "");

    const msSince = sc.lastPingAt ? Date.now() - new Date(sc.lastPingAt).getTime() : null;
    const secondsSincePing = (msSince != null && Number.isFinite(msSince) && msSince >= 0)
        ? Math.floor(msSince / 1000) : null;

    let status  = "pending";
    let summary = "Configure a URL da loja e conecte o script bridge para receber sinais da loja HTML.";

    if (!publicUrl || !storeUrl) {
        status  = "configuration_needed";
        summary = "Faltam variáveis básicas. Defina CHECKOUT_PUBLIC_URL e CHECKOUT_STORE_URL.";
    } else if (secondsSincePing != null && secondsSincePing <= 600) {
        status  = "connected";
        summary = "Sua loja enviou um heartbeat recente para o checkout.";
    } else if (state.recentOrders.length > 0) {
        status  = "receiving_orders";
        summary = "O checkout está recebendo pedidos, mas sem heartbeat recente.";
    } else {
        status  = "awaiting_ping";
        summary = "Configuração base existe, mas o painel ainda não recebeu um ping da loja HTML.";
    }

    return {
        status, summary,
        storeId:          sc.storeId || "html-store",
        storeName:        storeName  || "Sua Loja",
        storeUrl,
        checkoutUrl:      publicUrl,
        source:           sc.source  || "storefront",
        lastPingAt:       sc.lastPingAt,
        secondsSincePing,
        lastPath:         sc.lastPath || "",
        recentOrdersCount: state.recentOrders.length
    };
}
