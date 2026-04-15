## Painel administrativo

O arquivo `/index.html` virou a entrada do painel. Ele consome:

- `GET /api/admin/dashboard`
- `POST /api/admin/store`
- `POST /api/admin/provider`

### Abas do painel

- Visao geral: mostra saude do checkout, loja, pedidos e adquirente ativa.
- Loja: valida heartbeat da loja HTML e checklist de integracao.
- Pedidos: lista as ultimas tentativas recebidas pela API.
- Adquirentes: mostra quem esta ativa e o status de configuracao.
- Integracao: entrega um snippet pronto para sua loja HTML.

### Variaveis de ambiente recomendadas

- `CHECKOUT_PUBLIC_URL`: URL publica do deploy do checkout.
- `CHECKOUT_STORE_NAME`: nome exibido para sua loja.
- `CHECKOUT_STORE_URL`: URL da loja HTML.
- `CHECKOUT_ACTIVE_PROVIDER`: provider padrao, ex: `velana` ou `bestfy`.
- `CHECKOUT_STORAGE_MODE`: `memory`, `readonly` ou `file`.
- `CHECKOUT_STATE_FILE`: caminho do arquivo quando usar `file`.
- `VELANA_SECRET_KEY`: credencial da Velana.
- `BESTFY_SECRET_KEY`: credencial da Bestfy.
- `CHECKOUT_POSTBACK_URL`: webhook comum para gateways que suportam postback.

### Observacao importante

`memory` e util para teste rapido e demonstracao. Em producao na Vercel, para pedidos, heartbeat e troca de adquirente persistirem de verdade, substitua isso por banco ou KV.
