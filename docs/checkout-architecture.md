## Como usar este checkout

Sua loja HTML nao deve mais montar payload especifico de adquirente. Ela deve enviar apenas os dados do carrinho e do cliente para `POST /api/checkout`.

### Exemplo de payload

```json
{
  "referenceId": "PED-1001",
  "paymentMethod": "pix",
  "customer": {
    "name": "Maria Silva",
    "email": "maria@email.com",
    "phone": "11999999999",
    "document": {
      "type": "cpf",
      "number": "12345678901"
    },
    "address": {
      "street": "Rua Exemplo",
      "streetNumber": "123",
      "neighborhood": "Centro",
      "city": "Sao Paulo",
      "state": "SP",
      "zipCode": "01001000",
      "country": "BR"
    }
  },
  "shipping": {
    "fee": 1290
  },
  "items": [
    {
      "id": "camiseta-preta-m",
      "name": "Camiseta Preta M",
      "quantity": 2,
      "unitPrice": 6990
    }
  ],
  "metadata": {
    "source": "loja-html"
  }
}
```

### Resposta esperada

O endpoint devolve a adquirente ativa, o resumo do pedido e o retorno normalizado da transacao. O frontend deve ler `transaction.id`, `transaction.status`, `transaction.qrCode` e `transaction.qrCodeBase64`.

### Como sua loja HTML integra

1. Cada produto da loja precisa ter um `id` estavel.
2. O carrinho do frontend monta um array `items`.
3. No clique em finalizar compra, seu HTML faz `fetch("/api/checkout", { method: "POST", body: JSON.stringify(payload) })`.
4. O frontend renderiza o QR Code e passa a consultar `GET /api/status?id=...`.

### Como trocar de adquirente

Hoje a adquirente ativa vem de `CHECKOUT_ACTIVE_PROVIDER`. A troca sem mexer no frontend ja esta pronta.

Para troca em tempo real por painel, o proximo passo e salvar isso em banco:

1. Tabela `checkout_settings` com `active_provider`.
2. Tabela `orders` com status, valor, cliente e payload.
3. Tabela `payment_attempts` para guardar o retorno de cada adquirente.
4. Webhook das adquirentes atualizando o status do pedido.

Sem banco, Vercel nao consegue manter painel de pedidos nem configuracao persistente entre execucoes.
