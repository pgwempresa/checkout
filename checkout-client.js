(function attachCheckoutClient(global) {
    function inferBaseUrl() {
        const currentScript = document.currentScript;
        if (currentScript && currentScript.src) {
            try {
                return new URL(currentScript.src).origin;
            } catch (error) {
                return window.location.origin;
            }
        }

        return window.location.origin;
    }

    const state = {
        baseUrl: inferBaseUrl(),
        storeId: "html-store",
        storeName: document.title || "Loja HTML",
        storeUrl: window.location.origin
    };

    async function request(path, options) {
        const response = await fetch(`${state.baseUrl}${path}`, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options?.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const error = new Error(data?.message || `Erro ao chamar ${path}`);
            error.status = response.status;
            error.details = data;
            throw error;
        }

        return data;
    }

    async function ping(payload = {}) {
        return request("/api/admin/store", {
            method: "POST",
            body: JSON.stringify({
                storeId: payload.storeId || state.storeId,
                storeName: payload.storeName || state.storeName,
                storeUrl: payload.storeUrl || state.storeUrl,
                path: payload.path || window.location.pathname,
                source: payload.source || "checkout-client",
                notes: payload.notes || ""
            })
        });
    }

    async function createCheckout(payload) {
        return request("/api/checkout", {
            method: "POST",
            body: JSON.stringify(payload)
        });
    }

    async function getStatus(transactionId) {
        return request(`/api/status?id=${encodeURIComponent(transactionId)}`, {
            method: "GET",
            headers: {}
        });
    }

    async function getDashboard() {
        return request("/api/admin/dashboard", {
            method: "GET",
            headers: {}
        });
    }

    function init(config = {}) {
        Object.assign(state, config);

        if (config.autoPing === false) {
            return Promise.resolve({ initialized: true, autoPing: false, baseUrl: state.baseUrl });
        }

        return ping({
            storeId: state.storeId,
            storeName: state.storeName,
            storeUrl: state.storeUrl,
            path: window.location.pathname,
            source: "checkout-client:init"
        }).catch((error) => ({
            initialized: true,
            autoPing: true,
            failed: true,
            message: error.message
        }));
    }

    function redirectToCheckout(transaction, referenceId) {
        if (!transaction || !transaction.id) {
            console.error("CheckoutClient.redirectToCheckout: transaction.id ausente");
            return;
        }

        const base = state.baseUrl || window.location.origin;
        const params = new URLSearchParams({
            tid:    transaction.id,
            ref:    referenceId || transaction.referenceId || "",
            amount: String(transaction.amount || 0),
            method: transaction.paymentMethod || "pix",
            store:  state.storeUrl || window.location.origin
        });

        window.location.href = `${base}/checkout?${params.toString()}`;
    }

    global.CheckoutClient = {
        init,
        ping,
        createCheckout,
        getStatus,
        getDashboard,
        redirectToCheckout,
        getConfig() {
            return { ...state };
        }
    };
})(window);
