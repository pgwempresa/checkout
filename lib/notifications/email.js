// Sends email via Resend REST API (https://resend.com)
// No SDK needed — just fetch.
// Set RESEND_API_KEY, NOTIFY_EMAIL_FROM, NOTIFY_EMAIL_TO in .env

export async function sendPaymentConfirmed({ transactionId, referenceId, amount, currency = "BRL", provider, customerName }) {
    const apiKey   = process.env.RESEND_API_KEY;
    const from     = process.env.NOTIFY_EMAIL_FROM || "pagamentos@checkoutpay.com.br";
    const to       = process.env.NOTIFY_EMAIL_TO;

    if (!apiKey || !to) return { skipped: true, reason: "RESEND_API_KEY ou NOTIFY_EMAIL_TO não configurado" };

    const amountFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format((amount || 0) / 100);
    const now       = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#04040f;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#04040f;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0c0c1e;border:1px solid rgba(255,255,255,0.09);border-radius:20px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:28px 32px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(255,255,255,0.15);border-radius:10px;width:36px;height:36px;text-align:center;vertical-align:middle;font-size:18px;">⚡</td>
                <td style="padding-left:12px;color:#fff;font-size:18px;font-weight:700;letter-spacing:-0.03em;">CheckoutPay</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <div style="width:56px;height:56px;background:rgba(16,185,129,0.12);border:2px solid rgba(16,185,129,0.3);border-radius:50%;text-align:center;line-height:56px;font-size:22px;margin-bottom:20px;">✓</div>

            <h1 style="color:#10b981;font-size:22px;font-weight:800;letter-spacing:-0.04em;margin:0 0 8px;">Pagamento confirmado!</h1>
            <p style="color:rgba(221,225,245,0.6);font-size:14px;margin:0 0 28px;line-height:1.6;">
              Um novo pagamento foi aprovado e registrado no CheckoutPay.
            </p>

            <!-- Amount highlight -->
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:20px;margin-bottom:20px;text-align:center;">
              <div style="color:rgba(221,225,245,0.45);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Valor pago</div>
              <div style="color:#dde1f5;font-size:32px;font-weight:800;letter-spacing:-0.04em;font-family:'Courier New',monospace;">${amountFmt}</div>
            </div>

            <!-- Details table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.07);border-radius:12px;overflow:hidden;">
              ${[
                ["Referência",      referenceId  || "—"],
                ["ID da Transação", transactionId || "—"],
                ["Adquirente",      provider      || "—"],
                ["Cliente",         customerName  || "—"],
                ["Data/hora",       now]
              ].map(([label, value], i) => `
              <tr style="border-top:${i ? "1px solid rgba(255,255,255,0.06)" : "none"};">
                <td style="padding:10px 14px;color:rgba(221,225,245,0.4);font-size:12px;width:40%;">${label}</td>
                <td style="padding:10px 14px;color:#dde1f5;font-size:12px;font-family:'Courier New',monospace;">${value}</td>
              </tr>`).join("")}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid rgba(255,255,255,0.06);">
            <p style="color:rgba(221,225,245,0.25);font-size:11px;margin:0;text-align:center;">
              Enviado pelo CheckoutPay · Notificação automática
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                from,
                to:      Array.isArray(to) ? to : to.split(",").map(e => e.trim()),
                subject: `✓ Pagamento confirmado — ${amountFmt}`,
                html
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error("Resend error:", data);
            return { ok: false, error: data };
        }
        return { ok: true, id: data.id };
    } catch (err) {
        console.error("Email send error:", err.message);
        return { ok: false, error: err.message };
    }
}
