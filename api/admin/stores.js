import { requireAdminAuth } from "../../lib/admin/auth.js";
import { getErrorResponse } from "../../lib/checkout/errors.js";
import { listStores, createStore, updateStore, deleteStore, regenerateStoreKey } from "../../lib/stores/index.js";

export default async function handler(req, res) {
    if (!requireAdminAuth(req, res)) return;

    try {
        if (req.method === "GET") {
            return res.status(200).json({ stores: await listStores() });
        }

        if (req.method === "POST") {
            const { name, url, activeProvider } = req.body || {};
            const store = await createStore({ name, url, activeProvider });
            return res.status(201).json({ store });
        }

        if (req.method === "PATCH") {
            const { id, ...data } = req.body || {};
            if (!id) return res.status(400).json({ message: "id é obrigatório" });

            if (data.regenerateKey) {
                const store = await regenerateStoreKey(id);
                return res.status(200).json({ store });
            }

            const store = await updateStore(id, data);
            return res.status(200).json({ store });
        }

        if (req.method === "DELETE") {
            const { id } = req.body || {};
            if (!id) return res.status(400).json({ message: "id é obrigatório" });
            await deleteStore(id);
            return res.status(200).json({ message: "Loja removida" });
        }

        return res.status(405).json({ message: "Method Not Allowed" });
    } catch (error) {
        const r = getErrorResponse(error, "Erro ao gerenciar lojas");
        return res.status(r.status).json(r.body);
    }
}
