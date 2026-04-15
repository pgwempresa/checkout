/* ================================================================
   CheckoutPay — Admin UI Logic
   ================================================================ */

// ── Auth ──────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("admin_token") || ""; }
function logout()   { localStorage.removeItem("admin_token"); window.location.replace("/login"); }

if (!getToken()) window.location.replace("/login");

// ── State ─────────────────────────────────────────────────────
const state = { tab: "overview", data: null, timer: null };

// ── DOM refs ──────────────────────────────────────────────────
const $tab   = (id) => document.getElementById("panel-" + id);
const $toast = document.getElementById("toast");
const $live  = document.getElementById("topbar-live");

// ── Helpers ───────────────────────────────────────────────────
function esc(v) {
  return String(v ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function fmtMoney(cents, cur = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency: cur })
    .format((Number(cents)||0) / 100);
}

function fmtDate(v) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle:"short", timeStyle:"short" }).format(new Date(v));
}

function statusBadge(status) {
  const map = {
    connected:           ["badge-green",  "conectada"],
    receiving_orders:    ["badge-blue",   "recebendo"],
    awaiting_ping:       ["badge-amber",  "aguardando"],
    configuration_needed:["badge-red",    "config. pendente"],
    pending:             ["badge-amber",  "pendente"],
    paid:                ["badge-green",  "pago"],
    approved:            ["badge-green",  "aprovado"],
    failed:              ["badge-red",    "falhou"],
    cancelled:           ["badge-muted",  "cancelado"],
  };
  const [cls, label] = map[status] || ["badge-muted", status || "—"];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function connDot(status) {
  if (status === "connected") return `<span class="dot dot-green dot-pulse"></span>`;
  if (status === "receiving_orders") return `<span class="dot dot-blue dot-pulse"></span>`;
  if (status === "awaiting_ping")    return `<span class="dot dot-amber"></span>`;
  return `<span class="dot dot-red"></span>`;
}

function provBadge(p) {
  if (p.active)      return `<span class="badge badge-blue">ativa</span>`;
  if (!p.configured) return `<span class="badge badge-red">sem credenciais</span>`;
  return `<span class="badge badge-muted">configurada</span>`;
}

function runtimeLabel(rm) {
  if (!rm) return "—";
  if (rm.storageMode === "memory") return "sessão temporária";
  if (rm.storageMode === "file")   return "arquivo local";
  return "somente leitura";
}

function snippet(baseUrl, storeName, storeUrl) {
  const b = baseUrl  || window.location.origin;
  const n = storeName || "Minha Loja";
  const u = storeUrl  || "https://minhaloja.com.br";
  return [
    `<script src="${b}/checkout-client.js"><\/script>`,
    `<script>`,
    `  CheckoutClient.init({`,
    `    baseUrl:   "${b}",`,
    `    storeId:   "loja-principal",`,
    `    storeName: "${n}",`,
    `    storeUrl:  "${u}"`,
    `  });`,
    ``,
    `  // Chame isso ao finalizar o carrinho:`,
    `  async function finalizarCompra(cart, customer) {`,
    `    const result = await CheckoutClient.createCheckout({`,
    `      referenceId:   "PED-" + Date.now(),`,
    `      paymentMethod: "pix",`,
    `      customer,`,
    `      items: cart.map(i => ({`,
    `        id: i.id, name: i.name,`,
    `        quantity: i.qty,`,
    `        unitPrice: i.priceInCents`,
    `      })),`,
    `      shipping: { fee: 0 }`,
    `    });`,
    `    // result.transaction.qrCode  → código PIX`,
    `    // result.transaction.qrCodeBase64 → imagem`,
    `    return result.transaction;`,
    `  }`,
    `<\/script>`,
  ].join("\n");
}

// ── API ───────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${getToken()}`,
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) { logout(); return; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Falha na requisição");
  return data;
}

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, type = "") {
  $toast.textContent = msg;
  $toast.className = "toast is-visible" + (type ? " is-" + type : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { $toast.classList.remove("is-visible"); }, 2800);
}

// ── Tabs ──────────────────────────────────────────────────────
function setTab(id) {
  state.tab = id;
  document.querySelectorAll(".tab-item").forEach(b => b.classList.toggle("is-active", b.dataset.tab === id));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("is-active", p.id === "panel-" + id));
}

// ── Topbar live indicator ─────────────────────────────────────
function renderTopbar(d) {
  if (!d) return;
  const active = d.providers?.find(p => p.active);
  $live.innerHTML = `
    ${connDot(d.connection?.status)}
    <span style="color:var(--text-d);font-size:11px;margin-left:2px;">${esc(d.connection?.status || "—")}</span>
    <span style="color:var(--border-s);margin:0 6px;">|</span>
    <span style="font-size:11px;color:var(--text-d);">${esc(active?.label || d.service?.activeProvider || "—")}</span>
  `;
}

// ── Render: Overview ──────────────────────────────────────────
function renderOverview(d) {
  const { service, connection, providers, orders } = d;
  const active = providers.find(p => p.active);

  $tab("overview").innerHTML = `
    <div class="sec-head fu">
      <div>
        <p class="sec-label">Resumo operacional</p>
        <h2 class="sec-title">Visão Geral</h2>
      </div>
      <div class="sec-actions">
        <button class="btn btn-secondary" data-action="simulate-ping">Simular ping da loja</button>
      </div>
    </div>

    <div class="metrics fu fu-2">
      <div class="metric">
        <div class="metric-label">URL do checkout</div>
        <div class="metric-value" style="font-size:13px;word-break:break-all;">${esc(service.publicUrl || window.location.origin)}</div>
        <div class="metric-sub">Base pública</div>
      </div>
      <div class="metric">
        <div class="metric-label">Último ping</div>
        <div class="metric-value" style="font-size:16px;">${esc(fmtDate(connection.lastPingAt))}</div>
        <div class="metric-sub">Heartbeat da loja</div>
      </div>
      <div class="metric">
        <div class="metric-label">Adquirente ativa</div>
        <div class="metric-value" style="font-size:18px;">${esc(active?.label || service.activeProvider)}</div>
        <div class="metric-sub">Processamento ativo</div>
      </div>
      <div class="metric">
        <div class="metric-label">Pedidos</div>
        <div class="metric-value">${orders.length}</div>
        <div class="metric-sub">Registrados no painel</div>
      </div>
    </div>

    <div class="grid-2 fu fu-3">
      <div class="card">
        <div class="card-title">
          ${connDot(connection.status)}
          Saúde da conexão
        </div>
        <div class="status-list">
          <div class="status-item">
            <span class="si-dot">${connDot(connection.status)}</span>
            <div>
              <strong class="si-label">Status: ${statusBadge(connection.status)}</strong>
              <span class="si-sub">${esc(connection.summary)}</span>
            </div>
          </div>
          <div class="status-item">
            <span class="si-dot"><span class="dot dot-blue"></span></span>
            <div>
              <strong class="si-label">${esc(connection.storeName)}</strong>
              <span class="si-sub">${esc(connection.storeUrl || "CHECKOUT_STORE_URL não definida")}</span>
            </div>
          </div>
          <div class="status-item">
            <span class="si-dot"><span class="dot dot-blue"></span></span>
            <div>
              <strong class="si-label">Checkout: ${esc(service.publicUrl || window.location.origin)}</strong>
              <span class="si-sub">Último caminho: ${esc(connection.lastPath || "/")}</span>
            </div>
          </div>
          <div class="status-item">
            <span class="si-dot"><span class="dot dot-blue"></span></span>
            <div>
              <strong class="si-label">Runtime: ${esc(runtimeLabel(service.runtime))}</strong>
              <span class="si-sub">${service.runtime?.writable ? "Troca de adquirente habilitada pelo painel" : "Troca bloqueada — use env ou conecte persistência"}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Últimos pedidos</div>
        ${orders.length ? `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${orders.slice(0,4).map(o => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
                <div style="min-width:0;">
                  <div class="ord-ref">${esc(o.referenceId || o.transactionId || o.id)}</div>
                  <div class="ord-cust">${esc(o.customerName || o.customerEmail || "—")}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;">
                  <div style="font-family:var(--mono);font-size:12px;font-weight:600;">${esc(fmtMoney(o.amount, o.currency))}</div>
                  <div style="font-size:10px;color:var(--text-m);margin-top:2px;">${statusBadge(o.status)}</div>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="empty"><div class="empty-title">Sem pedidos ainda</div><p>Quando sua loja chamar /api/checkout, os pedidos aparecem aqui.</p></div>`}
      </div>
    </div>
  `;
}

// ── Render: Orders ────────────────────────────────────────────
function renderOrders(d) {
  const orders = d.orders || [];

  $tab("orders").innerHTML = `
    <div class="sec-head fu">
      <div>
        <p class="sec-label">Histórico</p>
        <h2 class="sec-title">Pedidos</h2>
      </div>
    </div>

    ${orders.length ? `
      <div class="orders-wrap fu fu-2">
        <div class="orders-head">
          <span>Referência</span>
          <span>Valor</span>
          <span>Adquirente</span>
          <span>Status</span>
          <span>Data</span>
        </div>
        ${orders.map(o => `
          <div class="order-row">
            <div>
              <span class="ord-ref">${esc(o.referenceId || o.transactionId || o.id)}</span>
              <span class="ord-cust">${esc(o.customerName || o.customerEmail || "—")}</span>
            </div>
            <span class="ord-amount">${esc(fmtMoney(o.amount, o.currency))}</span>
            <span class="badge badge-blue mono" style="font-size:10px;">${esc(o.provider)}</span>
            ${statusBadge(o.status)}
            <span class="ord-date">${esc(fmtDate(o.createdAt))}</span>
          </div>
        `).join("")}
      </div>
    ` : `
      <div class="empty fu fu-2">
        <div class="empty-title">Nenhum pedido registrado</div>
        <p>Integre sua loja com o checkout-client.js e chame /api/checkout para ver os pedidos aqui.</p>
      </div>
    `}
  `;
}

// ── Render: Providers ─────────────────────────────────────────
function renderProviders(d) {
  const { providers, service } = d;
  const writable = service.runtime?.writable;

  $tab("providers").innerHTML = `
    <div class="sec-head fu">
      <div>
        <p class="sec-label">Gateways</p>
        <h2 class="sec-title">Adquirentes</h2>
      </div>
    </div>

    <div class="providers-grid fu fu-2">
      ${providers.map(p => `
        <div class="provider-card ${p.active ? "is-active" : ""}">
          <div class="prov-header">
            ${provBadge(p)}
            ${p.active ? `<span class="dot dot-green dot-pulse" style="margin-left:auto;"></span>` : ""}
          </div>
          <div class="prov-name">${esc(p.label)}</div>
          <div class="prov-desc">${esc(p.description || "Gateway de pagamento integrado ao checkout.")}</div>
          <div class="prov-methods">
            ${(p.supports || []).map(m => `<span class="method-tag">${esc(m)}</span>`).join("")}
          </div>
          ${(p.credentials || []).length ? `
            <div class="prov-creds">
              ${p.credentials.map(c => `<span class="cred-tag">${esc(c)}</span>`).join("")}
            </div>
          ` : ""}
          <div class="prov-footer">
            <button
              class="btn ${p.active ? "btn-primary" : "btn-secondary"}"
              data-action="switch-provider"
              data-provider-id="${esc(p.id)}"
              ${p.active || !writable ? "disabled" : ""}
            >${p.active ? "Em uso agora" : writable ? "Ativar" : "Bloqueado"}</button>
            ${p.docsUrl ? `<a class="btn btn-ghost" href="${esc(p.docsUrl)}" target="_blank" rel="noreferrer">Docs →</a>` : ""}
          </div>
        </div>
      `).join("")}
    </div>

    <p class="muted mt-12 fu fu-3">
      Runtime: <strong style="color:var(--text-m);">${esc(runtimeLabel(service.runtime))}</strong>.
      ${writable ? "Troca de adquirente ativa pelo painel." : "Para trocar pelo painel, use CHECKOUT_STORAGE_MODE=memory ou conecte um banco."}
    </p>
  `;
}

// ── Render: Store ─────────────────────────────────────────────
function renderStore(d) {
  const { service, connection } = d;

  $tab("store").innerHTML = `
    <div class="sec-head fu">
      <div>
        <p class="sec-label">Integração</p>
        <h2 class="sec-title">Loja HTML</h2>
      </div>
    </div>

    <div class="grid-2 fu fu-2">
      <div class="card">
        <div class="card-title">${connDot(connection.status)} Status da conexão</div>
        <div class="status-list">
          <div class="status-item">
            <span class="si-dot">${connDot(connection.status)}</span>
            <div>
              <strong class="si-label">${esc(connection.storeName)}</strong>
              <span class="si-sub">ID: ${esc(connection.storeId)}</span>
            </div>
          </div>
          <div class="status-item">
            <span class="si-dot"><span class="dot dot-blue"></span></span>
            <div>
              <strong class="si-label">URL da loja</strong>
              <span class="si-sub">${esc(connection.storeUrl || "Não definida — configure CHECKOUT_STORE_URL")}</span>
            </div>
          </div>
          <div class="status-item">
            <span class="si-dot"><span class="dot dot-blue"></span></span>
            <div>
              <strong class="si-label">Último heartbeat</strong>
              <span class="si-sub">${esc(fmtDate(connection.lastPingAt))} — origem: ${esc(connection.source)}</span>
            </div>
          </div>
          <div class="status-item">
            <span class="si-dot"><span class="dot dot-blue"></span></span>
            <div>
              <strong class="si-label">Runtime atual</strong>
              <span class="si-sub">${esc(runtimeLabel(service.runtime))} — ${service.runtime?.writable ? "troca habilitada" : "troca bloqueada"}</span>
            </div>
          </div>
        </div>
        <div style="margin-top:14px;">
          ${statusBadge(connection.status)}
          <p class="muted mt-8">${esc(connection.summary)}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Checklist de configuração</div>
        <div class="check-list">
          <div class="check-item">
            <span class="check-icon">✓</span>
            <div>
              <span class="check-title">URL pública do checkout</span>
              <span class="check-desc">${esc(service.publicUrl || "Defina CHECKOUT_PUBLIC_URL para gerar links corretos.")}</span>
            </div>
          </div>
          <div class="check-item">
            <span class="check-icon">✓</span>
            <div>
              <span class="check-title">URL da sua loja HTML</span>
              <span class="check-desc">${esc(connection.storeUrl || service.storeUrl || "Defina CHECKOUT_STORE_URL com a URL da sua loja.")}</span>
            </div>
          </div>
          <div class="check-item">
            <span class="check-icon">✓</span>
            <div>
              <span class="check-title">Script bridge incluído</span>
              <span class="check-desc">Adicione checkout-client.js na sua loja para enviar heartbeats e criar pedidos.</span>
            </div>
          </div>
          <div class="check-item">
            <span class="check-icon">✓</span>
            <div>
              <span class="check-title">Credenciais da adquirente</span>
              <span class="check-desc">Configure VELANA_SECRET_KEY ou BESTFY_SECRET_KEY no .env conforme a adquirente ativa.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Render: Integration ───────────────────────────────────────
function renderIntegration(d) {
  const { service, connection } = d;
  const code = snippet(service.publicUrl, connection.storeName, connection.storeUrl || service.storeUrl);

  $tab("integration").innerHTML = `
    <div class="sec-head fu">
      <div>
        <p class="sec-label">Snippet</p>
        <h2 class="sec-title">Integrar na Loja HTML</h2>
      </div>
      <div class="sec-actions">
        <button class="btn btn-secondary" data-action="copy-snippet">Copiar código</button>
      </div>
    </div>

    <div class="grid-2 fu fu-2">
      <div class="card">
        <div class="card-title">Como conectar em 3 passos</div>
        <div class="check-list">
          <div class="check-item">
            <span class="check-icon">1</span>
            <div>
              <span class="check-title">Inclua o script na sua loja</span>
              <span class="check-desc">Aponte para <code style="font-family:var(--mono);font-size:10px;background:var(--surface-h);padding:1px 4px;border-radius:3px;">${esc(service.publicUrl || window.location.origin)}/checkout-client.js</code></span>
            </div>
          </div>
          <div class="check-item">
            <span class="check-icon">2</span>
            <div>
              <span class="check-title">Inicialize com os dados da sua loja</span>
              <span class="check-desc">Chame <code style="font-family:var(--mono);font-size:10px;background:var(--surface-h);padding:1px 4px;border-radius:3px;">CheckoutClient.init({...})</code> para registrar o heartbeat automático.</span>
            </div>
          </div>
          <div class="check-item">
            <span class="check-icon">3</span>
            <div>
              <span class="check-title">Finalize o pedido pelo carrinho</span>
              <span class="check-desc">Chame <code style="font-family:var(--mono);font-size:10px;background:var(--surface-h);padding:1px 4px;border-radius:3px;">createCheckout({items, customer})</code> e mostre o QR code retornado.</span>
            </div>
          </div>
        </div>

        <div class="divider"></div>

        <div style="font-size:12px;color:var(--text-m);line-height:1.65;">
          <p>A adquirente é transparente para sua loja — ela sempre chama o mesmo endpoint.</p>
          <p class="mt-8">Para trocar de Velana para Bestfy, basta clicar em <strong style="color:var(--text);">Ativar</strong> na aba <strong style="color:var(--text);">Adquirentes</strong> sem alterar nenhum código na loja.</p>
        </div>
      </div>

      <div class="code-block">
        <div class="code-chrome">
          <div class="chrome-dots">
            <div class="chrome-dot"></div>
            <div class="chrome-dot"></div>
            <div class="chrome-dot"></div>
          </div>
          <span class="chrome-label">sua-loja.html</span>
          <button class="btn btn-ghost" style="font-size:10px;padding:3px 8px;" data-action="copy-snippet">copiar</button>
        </div>
        <pre><code id="integration-code">${esc(code)}</code></pre>
      </div>
    </div>
  `;
}

// ── Render: Analytics ─────────────────────────────────────────
function renderAnalytics(d) {
  const orders = d.orders || [];

  // Last 7 days
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    days.push(dt.toISOString().slice(0, 10));
  }
  const dayLabels = days.map(d => {
    const [,m,day] = d.split("-"); return `${day}/${m}`;
  });

  const byDay = Object.fromEntries(days.map(d => [d, { count: 0, revenue: 0 }]));
  orders.forEach(o => {
    const day = (o.createdAt || "").slice(0, 10);
    if (byDay[day]) { byDay[day].count++; byDay[day].revenue += (o.amount || 0); }
  });

  const byStatus = {};
  orders.forEach(o => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; });

  const byProvider = {};
  orders.forEach(o => {
    if (!byProvider[o.provider]) byProvider[o.provider] = { count: 0, revenue: 0 };
    byProvider[o.provider].count++;
    byProvider[o.provider].revenue += (o.amount || 0);
  });

  const totalRevenue = orders.reduce((s, o) => s + (o.amount || 0), 0);
  const paidOrders = orders.filter(o => ["paid","approved","captured"].includes(o.status));
  const convRate = orders.length ? Math.round(paidOrders.length / orders.length * 100) : 0;
  const avgTicket = paidOrders.length ? Math.round(paidOrders.reduce((s,o) => s + (o.amount||0), 0) / paidOrders.length) : 0;

  $tab("analytics").innerHTML = `
    <div class="sec-head fu">
      <div><p class="sec-label">Métricas</p><h2 class="sec-title">Analytics</h2></div>
    </div>

    <div class="metrics fu fu-2">
      <div class="metric">
        <div class="metric-label">Receita total</div>
        <div class="metric-value">${fmtMoney(totalRevenue)}</div>
        <div class="metric-sub">${orders.length} pedidos registrados</div>
      </div>
      <div class="metric">
        <div class="metric-label">Ticket médio</div>
        <div class="metric-value">${fmtMoney(avgTicket)}</div>
        <div class="metric-sub">Pedidos pagos</div>
      </div>
      <div class="metric">
        <div class="metric-label">Taxa de conversão</div>
        <div class="metric-value">${convRate}%</div>
        <div class="metric-sub">${paidOrders.length} de ${orders.length} pagos</div>
      </div>
      <div class="metric">
        <div class="metric-label">Adquirentes</div>
        <div class="metric-value">${Object.keys(byProvider).length || "—"}</div>
        <div class="metric-sub">Com pedidos registrados</div>
      </div>
    </div>

    <div class="charts-grid fu fu-3">
      <div class="chart-card" style="grid-column: span 2;">
        <div class="card-title">Volume diário — últimos 7 dias</div>
        <canvas id="chart-daily"></canvas>
      </div>
      <div class="chart-card">
        <div class="card-title">Por status</div>
        <canvas id="chart-status"></canvas>
      </div>
      <div class="chart-card">
        <div class="card-title">Por adquirente</div>
        <canvas id="chart-provider"></canvas>
      </div>
    </div>
  `;

  // Chart defaults
  const defaultFont = { family: "'Inter', sans-serif", size: 11 };
  const gridColor   = "rgba(255,255,255,0.06)";
  const textColor   = "rgba(221,225,245,0.45)";

  // Daily chart
  const ctxDaily = document.getElementById("chart-daily")?.getContext("2d");
  if (ctxDaily && window.Chart) {
    new Chart(ctxDaily, {
      type: "bar",
      data: {
        labels: dayLabels,
        datasets: [
          {
            label: "Receita (R$)",
            data: days.map(d => (byDay[d].revenue / 100).toFixed(2)),
            backgroundColor: "rgba(59,130,246,0.6)",
            borderColor: "#3b82f6",
            borderWidth: 1, borderRadius: 6, yAxisID: "yRevenue"
          },
          {
            label: "Pedidos",
            data: days.map(d => byDay[d].count),
            backgroundColor: "rgba(139,92,246,0.4)",
            borderColor: "#8b5cf6",
            borderWidth: 1, borderRadius: 6, type: "line",
            fill: false, tension: 0.4, yAxisID: "yCount",
            pointRadius: 4, pointBackgroundColor: "#8b5cf6"
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: { legend: { labels: { color: textColor, font: defaultFont } } },
        scales: {
          x: { ticks: { color: textColor, font: defaultFont }, grid: { color: gridColor } },
          yRevenue: { position: "left",  ticks: { color: textColor, font: defaultFont, callback: v => "R$" + v }, grid: { color: gridColor } },
          yCount:   { position: "right", ticks: { color: textColor, font: defaultFont, stepSize: 1 }, grid: { display: false } }
        }
      }
    });
  }

  // Status donut
  const ctxStatus = document.getElementById("chart-status")?.getContext("2d");
  if (ctxStatus && window.Chart && Object.keys(byStatus).length) {
    const statusColors = { paid:"#10b981", approved:"#10b981", pending:"#f59e0b", failed:"#f43f5e", cancelled:"#6b7280", captured:"#3b82f6" };
    const labels = Object.keys(byStatus);
    new Chart(ctxStatus, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: labels.map(l => byStatus[l]),
          backgroundColor: labels.map(l => statusColors[l] || "#6b7280"),
          borderColor: "#04040f", borderWidth: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { position: "bottom", labels: { color: textColor, font: defaultFont, padding: 12 } }
        },
        cutout: "65%"
      }
    });
  } else if (ctxStatus) {
    ctxStatus.canvas.parentElement.innerHTML += '<div class="empty" style="margin-top:12px;"><div class="empty-title">Sem dados</div><p>Pedidos aparecerão aqui após o primeiro checkout.</p></div>';
  }

  // Provider bar
  const ctxProvider = document.getElementById("chart-provider")?.getContext("2d");
  if (ctxProvider && window.Chart && Object.keys(byProvider).length) {
    const labels = Object.keys(byProvider);
    new Chart(ctxProvider, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Pedidos",
          data: labels.map(l => byProvider[l].count),
          backgroundColor: ["rgba(59,130,246,0.7)","rgba(139,92,246,0.7)","rgba(34,211,238,0.7)"],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: defaultFont, stepSize: 1 }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: defaultFont }, grid: { display: false } }
        }
      }
    });
  } else if (ctxProvider) {
    ctxProvider.canvas.parentElement.innerHTML += '<div class="empty" style="margin-top:12px;"><div class="empty-title">Sem dados</div></div>';
  }
}

// ── Render: Stores ────────────────────────────────────────────
function renderStores(d) {
  const stores = d.stores || [];

  $tab("stores").innerHTML = `
    <div class="sec-head fu">
      <div><p class="sec-label">Multi-loja</p><h2 class="sec-title">Lojas conectadas</h2></div>
    </div>

    <div class="add-store-form fu">
      <div class="card-title">Adicionar nova loja</div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Nome da loja</label>
          <input class="form-input" id="new-store-name" placeholder="Ex: Loja do João" />
        </div>
        <div class="form-field">
          <label class="form-label">URL da loja</label>
          <input class="form-input" id="new-store-url" placeholder="https://lojadojoao.com.br" />
        </div>
      </div>
      <button class="btn btn-primary" data-action="create-store">Criar loja + gerar API key</button>
    </div>

    ${stores.length ? `
      <div class="stores-grid fu fu-2">
        ${stores.map(s => `
          <div class="store-card ${s.enabled === false ? "is-disabled" : ""}">
            <div class="flex-between">
              <span class="badge ${s.enabled !== false ? "badge-green" : "badge-muted"}">${s.enabled !== false ? "ativa" : "desativada"}</span>
              <span class="muted" style="font-size:10px;">${esc(s.id)}</span>
            </div>
            <div class="store-name">${esc(s.name)}</div>
            <div class="store-url">${esc(s.url || "—")}</div>

            <div class="form-label mt-8" style="margin-bottom:5px;">API Key</div>
            <div class="store-key" data-action="copy-key" data-key="${esc(s.apiKey)}" title="Clique para copiar">
              ${esc(s.apiKey)}
            </div>

            <div class="muted mt-4" style="margin-bottom:10px;">
              Adquirente: <strong style="color:var(--text)">${esc(s.activeProvider || "padrão do sistema")}</strong>
              · Criada em ${esc(fmtDate(s.createdAt))}
            </div>

            <div class="store-actions">
              <button class="btn btn-secondary" data-action="regen-key" data-store-id="${esc(s.id)}" title="Gera nova API key">🔄 Nova key</button>
              <button class="btn btn-ghost" data-action="toggle-store" data-store-id="${esc(s.id)}" data-enabled="${s.enabled !== false}">
                ${s.enabled !== false ? "Desativar" : "Ativar"}
              </button>
              <button class="btn btn-ghost" style="color:var(--red);" data-action="delete-store" data-store-id="${esc(s.id)}" data-store-name="${esc(s.name)}">Remover</button>
            </div>
          </div>
        `).join("")}
      </div>
    ` : `
      <div class="empty fu fu-2">
        <div class="empty-title">Nenhuma loja cadastrada</div>
        <p>Adicione lojas acima para ter API keys individuais e rastreamento por loja.</p>
      </div>
    `}

    <div class="card mt-16 fu fu-3" style="margin-top:16px;">
      <div class="card-title">Como usar a API key na sua loja</div>
      <div class="check-list">
        <div class="check-item">
          <span class="check-icon">1</span>
          <div>
            <span class="check-title">Inclua a API key no init</span>
            <span class="check-desc"><code style="font-family:var(--mono);font-size:10px;background:var(--surface-h);padding:1px 4px;border-radius:3px;">CheckoutClient.init({ ..., storeKey: "cpay_live_..." })</code></span>
          </div>
        </div>
        <div class="check-item">
          <span class="check-icon">2</span>
          <div>
            <span class="check-title">Ou passe direto no checkout</span>
            <span class="check-desc"><code style="font-family:var(--mono);font-size:10px;background:var(--surface-h);padding:1px 4px;border-radius:3px;">CheckoutClient.createCheckout({ ..., storeKey: "cpay_live_..." })</code></span>
          </div>
        </div>
        <div class="check-item">
          <span class="check-icon">3</span>
          <div>
            <span class="check-title">Pedidos aparecem vinculados à loja</span>
            <span class="check-desc">Filtre os pedidos por loja na aba Pedidos.</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Render all ────────────────────────────────────────────────
function render() {
  if (!state.data) return;
  renderTopbar(state.data);
  renderOverview(state.data);
  renderOrders(state.data);
  renderProviders(state.data);
  renderStore(state.data);
  renderIntegration(state.data);
  renderAnalytics(state.data);
  renderStores(state.data);
}

// ── Refresh ───────────────────────────────────────────────────
async function refresh(showMsg = false) {
  try {
    const data = await api("/api/admin/dashboard");
    if (!data) return;
    state.data = data;
    render();
    if (showMsg) toast("Painel atualizado.", "ok");
  } catch (err) {
    toast(err.message, "error");
  }
}

// ── Actions ───────────────────────────────────────────────────
async function simulatePing() {
  try {
    await api("/api/admin/store", {
      method: "POST",
      body: JSON.stringify({
        storeId:   "demo-html-store",
        storeName: "Loja HTML Demo",
        storeUrl:  window.location.origin,
        path:      "/simulacao",
        source:    "admin-simulation"
      })
    });
    await refresh();
    toast("Ping simulado com sucesso.", "ok");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function switchProvider(id) {
  try {
    const res = await api("/api/admin/provider", {
      method: "POST",
      body: JSON.stringify({ providerId: id })
    });
    await refresh();
    toast(res?.message || "Adquirente atualizada.", "ok");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function copySnippet() {
  const el = document.getElementById("integration-code");
  try {
    await navigator.clipboard.writeText(el?.textContent || "");
    toast("Snippet copiado!", "ok");
  } catch {
    toast("Não foi possível copiar.", "error");
  }
}

// ── Events ────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-tab]");
  if (tab) { setTab(tab.dataset.tab); return; }

  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action } = btn.dataset;

  if (action === "refresh")         refresh(true);
  if (action === "simulate-ping")   simulatePing();
  if (action === "copy-snippet")    copySnippet();
  if (action === "logout")          logout();
  if (action === "switch-provider") switchProvider(btn.dataset.providerId);

  if (action === "create-store") {
    const name = document.getElementById("new-store-name")?.value?.trim();
    const url  = document.getElementById("new-store-url")?.value?.trim();
    if (!name) { toast("Nome da loja é obrigatório", "error"); return; }
    api("/api/admin/stores", { method: "POST", body: JSON.stringify({ name, url }) })
      .then(() => { refresh(false); toast("Loja criada!", "ok"); })
      .catch(e => toast(e.message, "error"));
  }

  if (action === "delete-store") {
    const storeId   = btn.dataset.storeId;
    const storeName = btn.dataset.storeName;
    if (!confirm(`Remover "${storeName}"?`)) return;
    api("/api/admin/stores", { method: "DELETE", body: JSON.stringify({ id: storeId }) })
      .then(() => { refresh(false); toast("Loja removida.", "ok"); })
      .catch(e => toast(e.message, "error"));
  }

  if (action === "regen-key") {
    const storeId = btn.dataset.storeId;
    api("/api/admin/stores", { method: "PATCH", body: JSON.stringify({ id: storeId, regenerateKey: true }) })
      .then(() => { refresh(false); toast("Nova API key gerada!", "ok"); })
      .catch(e => toast(e.message, "error"));
  }

  if (action === "toggle-store") {
    const storeId = btn.dataset.storeId;
    const enabled = btn.dataset.enabled === "true";
    api("/api/admin/stores", { method: "PATCH", body: JSON.stringify({ id: storeId, enabled: !enabled }) })
      .then(() => { refresh(false); toast(`Loja ${!enabled ? "ativada" : "desativada"}.`, "ok"); })
      .catch(e => toast(e.message, "error"));
  }

  if (action === "copy-key") {
    const key = btn.dataset.key;
    navigator.clipboard.writeText(key).then(() => toast("API key copiada!", "ok")).catch(() => toast("Erro ao copiar.", "error"));
  }
});

// ── Boot ──────────────────────────────────────────────────────
async function boot() {
  setTab(state.tab);
  await refresh();
  state.timer = setInterval(refresh, 30000);
}

boot();
