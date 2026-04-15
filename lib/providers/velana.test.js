import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";

// Helper para criar um mock de fetch global
function mockFetch(status, body) {
    return mock.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    }));
}

describe("velanaProvider", () => {
    let velanaProvider;

    before(async () => {
        ({ velanaProvider } = await import("./velana.js"));
    });

    describe("isConfigured", () => {
        it("retorna false quando VELANA_SECRET_KEY não está definida", () => {
            delete process.env.VELANA_SECRET_KEY;
            assert.equal(velanaProvider.isConfigured(), false);
        });

        it("retorna true quando VELANA_SECRET_KEY está definida", () => {
            process.env.VELANA_SECRET_KEY = "test-key";
            assert.equal(velanaProvider.isConfigured(), true);
        });
    });

    describe("createTransaction", () => {
        before(() => {
            process.env.VELANA_SECRET_KEY = "test-key";
        });

        it("chama a API correta com Authorization Basic", async () => {
            const fetchMock = mockFetch(200, { id: "txn_1", status: "pending", pix: { qrcode: "000201", qrCodeBase64: "abc==" } });
            global.fetch = fetchMock;

            const result = await velanaProvider.createTransaction({ amount: 100 });

            assert.equal(fetchMock.mock.calls.length, 1);
            const [url, options] = fetchMock.mock.calls[0].arguments;
            assert.equal(url, "https://api.velana.com.br/v1/transactions");
            assert.equal(options.method, "POST");
            assert.match(options.headers.Authorization, /^Basic /);
            assert.equal(options.headers["Content-Type"], "application/json");

            assert.equal(result.id, "txn_1");
            assert.equal(result.qrCode, "000201");
            assert.equal(result.qrCodeBase64, "abc==");
        });

        it("normaliza resposta com campo qrCode no nível raiz", async () => {
            global.fetch = mockFetch(200, { id: "txn_2", status: "pending", qrCode: "pix-code", qrCodeBase64: "base64==" });

            const result = await velanaProvider.createTransaction({ amount: 50 });

            assert.equal(result.qrCode, "pix-code");
            assert.equal(result.qrCodeBase64, "base64==");
        });

        it("lança HttpError quando a API retorna erro", async () => {
            global.fetch = mockFetch(422, { message: "Valor inválido" });

            await assert.rejects(
                () => velanaProvider.createTransaction({ amount: -1 }),
                (err) => {
                    assert.equal(err.status, 422);
                    assert.equal(err.message, "Valor inválido");
                    return true;
                }
            );
        });

        it("lança erro 500 quando VELANA_SECRET_KEY não está definida", async () => {
            delete process.env.VELANA_SECRET_KEY;

            await assert.rejects(
                () => velanaProvider.createTransaction({ amount: 100 }),
                (err) => {
                    assert.equal(err.status, 500);
                    assert.match(err.message, /VELANA_SECRET_KEY/);
                    return true;
                }
            );

            process.env.VELANA_SECRET_KEY = "test-key";
        });
    });

    describe("getTransactionStatus", () => {
        before(() => {
            process.env.VELANA_SECRET_KEY = "test-key";
        });

        it("chama a URL correta com o transactionId", async () => {
            const fetchMock = mockFetch(200, { id: "txn_1", status: "paid" });
            global.fetch = fetchMock;

            const result = await velanaProvider.getTransactionStatus("txn_1");

            const [url] = fetchMock.mock.calls[0].arguments;
            assert.equal(url, "https://api.velana.com.br/v1/transactions/txn_1");
            assert.equal(result.id, "txn_1");
            assert.equal(result.status, "paid");
        });

        it("lança HttpError quando transação não encontrada", async () => {
            global.fetch = mockFetch(404, { message: "Transação não encontrada" });

            await assert.rejects(
                () => velanaProvider.getTransactionStatus("inexistente"),
                (err) => {
                    assert.equal(err.status, 404);
                    return true;
                }
            );
        });

        it("usa mensagem padrão quando API retorna erro sem message", async () => {
            global.fetch = mockFetch(500, {});

            await assert.rejects(
                () => velanaProvider.getTransactionStatus("txn_x"),
                (err) => {
                    assert.equal(err.status, 500);
                    assert.match(err.message, /Velana/i);
                    return true;
                }
            );
        });
    });

    after(() => {
        delete process.env.VELANA_SECRET_KEY;
        delete global.fetch;
    });
});
