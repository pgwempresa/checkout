import { requireAdminAuth } from "../../lib/admin/auth.js";
import { getActiveProviderId, getProviderById, listProviders } from "../../lib/providers/index.js";
import { createHttpError, getErrorResponse } from "../../lib/checkout/errors.js";
import { getRuntimeInfo, setRuntimeProviderId } from "../../lib/runtime/state.js";

export default async function handler(req, res) {
    if (!requireAdminAuth(req, res)) return;

    if (req.method === "GET") {
        return res.status(200).json({
            activeProvider: await getActiveProviderId(),
            providers:      await listProviders(),
            runtime:        getRuntimeInfo()
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    try {
        const id = String(req.body?.providerId || "").trim().toLowerCase();
        const provider = getProviderById(id);

        if (!provider) {
            throw createHttpError(400, `Adquirente inválida: ${id}`);
        }

        await setRuntimeProviderId(provider.id);

        return res.status(200).json({
            message:        `Adquirente ativa atualizada para ${provider.label}`,
            activeProvider: await getActiveProviderId(),
            providers:      await listProviders(),
            runtime:        getRuntimeInfo()
        });
    } catch (error) {
        const response = getErrorResponse(error, "Não foi possível alterar a adquirente ativa");
        return res.status(response.status).json(response.body);
    }
}
