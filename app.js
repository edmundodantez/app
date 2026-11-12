'use strict';
/* global Model, Seed, Pdf, Cloud, Investors, renderInvestors, invNav */

/* ===== Estado ===== */
const STORE_KEY = 'investcalc-re-v1';
const clone = (o) => JSON.parse(JSON.stringify(o));

// migra estados salvos com o modelo de fees antigo (origination/docs/uw/appraisal separados)
function migrate(s) {
  if (s.params.loanFeesPct === undefined) {
    s.params.loanFeesPct = Model.DEFAULT_PARAMS.loanFeesPct;
    if (s.params.reimbDelayDays === 7) s.params.reimbDelayDays = Model.DEFAULT_PARAMS.reimbDelayDays;
    for (const k of ['origPct', 'docsFee', 'uwPct', 'appraisal']) delete s.params[k];
    for (const d of s.deals) {
      if (d.loanFeesPct === undefined) d.loanFeesPct = null;
      for (const k of ['origPct', 'docsFee', 'uwPct', 'appraisal']) delete d[k];
    }
  }
  if (!s.calc) s.calc = freshCalcDeal();
  // dados de investidores (imóveis ofertados, clientes, empréstimos de credores)
  for (const k of ['properties', 'clients', 'loans']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.profile) s.profile = { company: '', contact: '' };
  return s;
}
function freshCalcDeal() {
  return Seed.makeDeal({ id: 'calc', name: 'Análise avulsa', status: 'Active' });
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.params && Array.isArray(s.deals)) return migrate(s);
  } catch { /* estado corrompido: recomeça da seed */ }
  return null;
}
let state = loadState()
  || migrate({ params: clone(Model.DEFAULT_PARAMS), deals: clone(Seed.SEED_DEALS), calc: freshCalcDeal() });
let currentDealId = null;

// grava só no aparelho
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* sem espaço */ }
}
// grava no aparelho e agenda o envio para a nuvem (se conectada)
function save() {
  persist();
  if (typeof Cloud !== 'undefined') Cloud.markDirty();
}
// troca o estado inteiro (dados vindos da nuvem ou de um backup)
function replaceState(s) {
  if (!s || !s.params || !Array.isArray(s.deals)) throw new Error('formato');
  state = migrate(s);
  currentDealId = null;
  persist();
}

/* ===== Formatação ===== */
const fmtUSD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtPct1 = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPct2 = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const fmtMonthShort = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'short' });
const fmtDateFull = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });

const money = (v) => fmtUSD.format(v);
const monthLabel = (t) => fmtMonthShort.format(new Date(t)).replace('.', '')
  + '/' + String(new Date(t).getUTCFullYear()).slice(2);
const dateLabel = (t) => (t == null ? '—' : fmtDateFull.format(new Date(t)));

function compactUSD(v) {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return sign + '$' + fmtNum.format(abs / 1e6) + 'M';
  if (abs >= 1e3) return sign + '$' + fmtNum.format(abs / 1e3) + 'k';
  return sign + '$' + fmtNum.format(abs);
}

// aceita "625000", "625,000", "625.000,50", "10,5", "92.5"
function parseNum(str) {
  if (typeof str !== 'string') return NaN;
  let s = str.trim().replace(/[^\d.,\-]/g, '');
  if (!s) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    // os dois separadores presentes: o último é o decimal
    const dec = Math.max(lc, ld);
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1).replace(/[.,]/g, '');
  } else if (lc > -1 || ld > -1) {
    // um só separador: com 3 dígitos depois (ou repetido) é milhar, senão decimal
    const sep = lc > -1 ? ',' : '.';
    const parts = s.split(sep);
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    s = thousands ? parts.join('') : parts.join('.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ===== Tabs ===== */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.tab !== btn.dataset.target; });
    hideTooltip();
    updateChrome(btn.dataset.target);
    renderTab(btn.dataset.target);
    window.scrollTo(0, 0);
  });
});
const goTab = (tab) => document.querySelector(`.tab-btn[data-target="${tab}"]`).click();
document.querySelectorAll('.cloud-pill').forEach((b) => b.addEventListener('click', () => goTab('config')));

/* ===== Moldura: título da página e marca ===== */
const PAGE_TITLES = {
  dash: 'Início', inv: 'Clientes e imóveis', deals: 'Deals', master: 'Cashflow',
  calc: 'Calculadora', config: 'Ajustes',
};
const PAGE_SUBS = {
  inv: 'Imóveis para ofertar, investidores e credores',
  deals: 'Seus projetos e o modelo de cada um',
  master: 'Caixa consolidado de todos os deals ativos',
  calc: 'Análise avulsa de um deal',
  config: 'Parâmetros, PDFs, nuvem e backup',
};
const fmtDateLong = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
function updateChrome(tab) {
  const t = tab || (document.querySelector('.tab-btn.active') || {}).dataset?.target || 'dash';
  const company = (state.profile && state.profile.company) || 'InvestCalc';
  document.querySelectorAll('.brand-name').forEach((el) => { el.textContent = company; });
  const h = new Date().getHours();
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  document.getElementById('page-title').textContent = t === 'dash' ? hello : PAGE_TITLES[t];
  const today = fmtDateLong.format(new Date());
  document.getElementById('page-sub').textContent = t === 'dash'
    ? today.charAt(0).toUpperCase() + today.slice(1) : PAGE_SUBS[t];
}

function renderTab(tab) {
  if (tab === 'calc') renderCalc();
  else if (tab === 'dash') renderDashboard();
  else if (tab === 'deals') renderDealsTab();
  else if (tab === 'master') renderMaster();
  else if (tab === 'inv') renderInvestors();
  else if (tab === 'config') renderConfig();
}
function renderAllVisible() {
  const active = document.querySelector('.tab-btn.active');
  if (active) renderTab(active.dataset.target);
}

/* =====================================================
   Gráfico de linhas (suporta valores negativos)
===================================================== */
function renderLineChart(holder, legendEl, series, dates) {
  const W = 600, H = 280;
  const pad = { top: 12, right: 14, bottom: 26, left: 8 };
  const n = dates.length;
  if (!n) { holder.innerHTML = ''; if (legendEl) legendEl.innerHTML = ''; return; }

  let dataMin = 0, dataMax = 1;
  for (const s of series) for (const v of s.values) { dataMin = Math.min(dataMin, v); dataMax = Math.max(dataMax, v); }
  const rawStep = (dataMax - dataMin) / 4 || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rawStep) || rawStep;
  const yMin = Math.floor(dataMin / step) * step;
  const yMax = Math.ceil(dataMax / step) * step || step;

  const gridColor = cssVar('--grid'), baseColor = cssVar('--baseline'), mutedColor = cssVar('--text-muted');
  const yTicks = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) yTicks.push(v);
  pad.right = 10 + Math.max(...yTicks.map((v) => compactUSD(v).length)) * 6.6;

  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const x = (i) => pad.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => pad.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const v of yTicks) {
    const isZero = Math.abs(v) < step / 1e6;
    svg += `<line x1="${pad.left}" y1="${y(v)}" x2="${pad.left + plotW}" y2="${y(v)}" stroke="${isZero ? baseColor : gridColor}" stroke-width="1"/>`;
    svg += `<text x="${W - 4}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="${mutedColor}" font-family="system-ui,sans-serif">${compactUSD(v)}</text>`;
  }
  const xEvery = Math.max(1, Math.ceil(n / 6));
  for (let i = 0; i < n; i += xEvery) {
    svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : 'middle'}" font-size="10" fill="${mutedColor}" font-family="system-ui,sans-serif">${monthLabel(dates[i])}</text>`;
  }
  for (const s of series) {
    let d = '';
    for (let i = 0; i < n; i++) d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s.values[i]).toFixed(1);
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  svg += `<line class="ch-cross" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + plotH}" stroke="${baseColor}" stroke-width="1" visibility="hidden"/>`;
  series.forEach((s, k) => {
    svg += `<circle class="ch-dot" data-k="${k}" r="4" fill="${s.color}" stroke="${cssVar('--surface-1')}" stroke-width="2" visibility="hidden"/>`;
  });
  svg += '</svg>';
  holder.innerHTML = svg;

  if (legendEl) {
    legendEl.innerHTML = series.length > 1
      ? series.map((s) => `<span class="key"><span class="chip" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')
      : '';
  }

  const svgEl = holder.querySelector('svg');
  const onHover = (ev) => {
    const rect = svgEl.getBoundingClientRect();
    const px = (ev.clientX - rect.left) * (W / rect.width);
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.left) / plotW) * (n - 1))));
    const cx = x(i);
    const cross = svgEl.querySelector('.ch-cross');
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    svgEl.querySelectorAll('.ch-dot').forEach((dot) => {
      const k = +dot.dataset.k;
      dot.setAttribute('cx', cx);
      dot.setAttribute('cy', y(series[k].values[i]));
      dot.setAttribute('visibility', 'visible');
    });
    const tt = document.getElementById('tooltip');
    tt.innerHTML = `<div class="tt-title">${monthLabel(dates[i])}</div>` + series.map((s) =>
      `<div class="tt-row"><span class="k"><span class="chip" style="background:${s.color}"></span>${esc(s.name)}</span>` +
      `<span class="v">${money(s.values[i])}</span></div>`).join('');
    tt.hidden = false;
    const ttW = tt.offsetWidth;
    let left = ev.clientX + 14;
    if (left + ttW > window.innerWidth - 8) left = ev.clientX - ttW - 14;
    tt.style.left = Math.max(8, left) + 'px';
    tt.style.top = Math.max(8, rect.top + 10) + 'px';
  };
  svgEl.addEventListener('pointermove', onHover);
  svgEl.addEventListener('pointerdown', onHover);
  svgEl.addEventListener('pointerleave', hideTooltip);
}

function hideTooltip() {
  const tt = document.getElementById('tooltip');
  if (tt) tt.hidden = true;
  document.querySelectorAll('.ch-cross, .ch-dot').forEach((el) => el.setAttribute('visibility', 'hidden'));
}

/* =====================================================
   Dashboard
===================================================== */
function statusDot(status) {
  return `<span class="dot ${status === 'Active' ? 'dot-on' : 'dot-off'}"></span>`;
}
function pnl(v) {
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return `<span class="${cls}">${money(v)}</span>`;
}
function pnlPct(v) {
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : '';
  return `<span class="${cls}">${fmtPct1.format(v)}</span>`;
}

const ICONS = {
  profit: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  people: '<circle cx="9" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.3c2 .8 3.5 2.8 3.5 5.700" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9.500 10v8M14.500 10v8M19 10v8M3 20h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  warn: '<path d="M12 4l9 16H3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
function kpi(ic, label, value, sub) {
  return `<div class="kpi"><span class="kpi-icon">${icon(ic)}</span>
    <span class="kpi-label">${esc(label)}</span><span class="kpi-value">${value}</span>
    <span class="kpi-sub">${sub}</span></div>`;
}

function renderDashboard() {
  const el = document.getElementById('tab-dash');
  const d = Model.computeDashboard(state.deals, state.params);
  const today = Investors.todayIso();
  const O = Investors.overview(state.properties, state.clients, state.loans, today);
  const nameOf = (id) => { const c = state.clients.find((x) => x.id === id); return c ? (c.name || '(sem nome)') : ''; };
  const dayLabel = (iso) => dateLabel(Investors.parseDate(iso));

  // próximos pagamentos de clientes (terreno e draws ainda não pagos), vencidos primeiro
  const due = [];
  for (const p of state.properties) {
    if (!p.clientId || (p.soldDate && p.soldPrice)) continue;
    for (const x of p.payments || []) {
      if (!x.paidDate && x.dueDate && Number(x.amount) > 0) due.push({ p, x, late: x.dueDate < today });
    }
  }
  due.sort((a, b) => a.x.dueDate.localeCompare(b.x.dueDate));
  const loans = state.loans.map((l) => ({ l, r: Investors.computeLoan(l, today) })).filter((x) => x.r.rows.length);

  // imóveis disponíveis e clientes procurando, com quantos combinam entre si (orçamento e região)
  const avail = state.properties.map((p) => ({ p, r: Investors.computeProperty(p, today) }))
    .filter((x) => x.r.status === 'available');
  const seekers = state.clients.filter((c) => c.kind !== 'lender' && c.looking);
  const fits = (n, one, many) => (n ? `${n} ${n === 1 ? one : many}` : 'nenhum compatível');
  const availRows = avail.map(({ p, r }) => ({ p, r,
    n: seekers.filter((c) => Investors.propertyMatchesClient(p, c, r)).length }));
  const seekerRows = seekers.map((c) => ({ c,
    n: avail.filter(({ p, r }) => Investors.propertyMatchesClient(p, c, r)).length }));

  const shortfall = d.lowestBalance < 0
    ? `<div class="warn-box">${icon('warn')}<span>O caixa projetado fica <b>negativo</b> (mínimo de <b>${money(d.lowestBalance)}</b>).
       Com ${money(d.startingCash)} iniciais, faltam <b>${money(-d.lowestBalance)}</b> no pior mês.</span></div>`
    : '';

  el.innerHTML = `
    <div class="quick-row">
      <button class="mini-btn primary" data-quick="prop">+ Imóvel</button>
      <button class="mini-btn" data-quick="client">+ Cliente</button>
      <button class="mini-btn" data-quick="calc">Analisar deal</button>
    </div>
    ${shortfall}
    <div class="kpi-grid">
      ${kpi('profit', 'Lucro projetado dos deals', pnl(d.totalProfit), `${d.activeDeals} deal(s) ativo(s) · ROI ${fmtPct1.format(d.roiPeak)} s/ pico`)}
      ${kpi('cash', 'Menor saldo de caixa', pnl(d.lowestBalance), `Caixa inicial ${money(d.startingCash)}`)}
      ${kpi('people', 'Capital de clientes em obras', money(O.clientCapitalPaid), `${O.active} imóvel(is) com cliente · ${O.available} disponível(is)`)}
      ${kpi('bank', 'Devo a credores', money(O.principal), `Juros a pagar hoje ${money(O.interestDue)}`)}
    </div>
    <div class="dash-pair">
      <div class="card">
        <div class="card-head"><h2>Imóveis disponíveis <span class="count">${avail.length}</span></h2>
          <button class="mini-btn" data-go="inv">Ver imóveis</button></div>
        ${availRows.length ? `<div class="rows">${availRows.slice(0, 6).map(({ p, r, n }) => `
          <button class="row-item" data-prop="${esc(p.id)}">
            <span class="row-main"><b>${esc(p.name || '(sem nome)')}</b>
              <small>${esc([p.city, fits(n, 'cliente compatível', 'clientes compatíveis')].filter(Boolean).join(' · '))}</small></span>
            <span class="row-side"><b>${money(r.totalCost)}</b>
              <small>${r.hasSale ? `retorno est. ${fmtPct1.format(r.roi)}` : 'sem preço de venda'}</small></span>
          </button>`).join('')}</div>
          ${availRows.length > 6 ? `<p class="hint">+ ${availRows.length - 6} outro(s) imóvel(is) disponível(is).</p>` : ''}`
          : '<p class="empty">Nenhum imóvel disponível no momento.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h2>Clientes procurando <span class="count">${seekers.length}</span></h2>
          <button class="mini-btn" data-go="inv" data-seg="clients">Ver clientes</button></div>
        ${seekerRows.length ? `<div class="rows">${seekerRows.slice(0, 6).map(({ c, n }) => `
          <button class="row-item" data-client-open="${esc(c.id)}">
            <span class="row-main"><b>${esc(c.name || '(sem nome)')}</b>
              <small>${esc(c.location || 'qualquer região')}</small></span>
            <span class="row-side"><b>${c.budgetMax ? 'até ' + money(c.budgetMax) : 'sem limite'}</b>
              <small>${fits(n, 'imóvel compatível', 'imóveis compatíveis')}</small></span>
          </button>`).join('')}</div>
          ${seekerRows.length > 6 ? `<p class="hint">+ ${seekerRows.length - 6} outro(s) cliente(s) procurando.</p>` : ''}`
          : '<p class="empty">Nenhum cliente procurando imóvel no momento.</p>'}
      </div>
    </div>
    <div class="dash-grid">
      <div class="dash-stack">
      <div class="card">
        <div class="card-head"><h2>Próximos pagamentos</h2>
          <button class="mini-btn" data-go="inv">Ver imóveis</button></div>
        ${due.length ? `<div class="rows">${due.slice(0, 6).map(({ p, x, late }) => `
          <button class="row-item" data-prop="${esc(p.id)}">
            <span class="row-main"><b>${esc(x.desc || 'Pagamento')}</b>
              <small>${esc(p.name || '(sem nome)')} · ${esc(nameOf(p.clientId))}</small></span>
            <span class="row-side"><b>${money(Number(x.amount))}</b>
              <small>${late ? `<span class="badge late">${icon('warn')}Atrasado</span> ` : ''}${dayLabel(x.dueDate)}</small></span>
          </button>`).join('')}</div>
          ${due.length > 6 ? `<p class="hint">+ ${due.length - 6} outro(s) pagamento(s) em aberto.</p>` : ''}`
          : '<p class="empty">Nenhum pagamento de cliente em aberto.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h2>Credores</h2><button class="mini-btn" data-go="inv" data-seg="clients">Ver clientes</button></div>
        ${loans.length ? `<div class="rows">${loans.map(({ l, r }) => `
          <button class="row-item" data-loan="${esc(l.id)}" data-client="${esc(l.clientId)}">
            <span class="row-main"><b>${esc(nameOf(l.clientId) || 'Credor')}</b>
              <small>${esc(l.label || 'Empréstimo')} · ${fmtPct2.format(r.rate)} a.a.</small></span>
            <span class="row-side"><b>${money(r.principal)}</b><small>juros ${money(r.interestDue)}</small></span>
          </button>`).join('')}</div>
          <p class="hint">Juros de aproximadamente ${money(O.monthlyInterest)} por mês no saldo atual.</p>`
          : '<p class="empty">Nenhum empréstimo lançado.</p>'}
      </div>
      </div>
      <div class="card span-2">
        <div class="card-head"><h2>Deals</h2><button class="mini-btn" data-go="deals">Ver todos</button></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Deal</th><th>Lucro</th><th>ROI</th><th>Venda</th></tr></thead>
          <tbody>
            ${state.deals.map((deal, i) => {
              const r = d.master.results[i];
              return `<tr class="row-link" data-deal="${esc(deal.id)}">
                <td>${statusDot(deal.status)} ${esc(deal.name || '(sem nome)')}</td>
                <td>${deal.status === 'Active' ? pnl(r.profit) : '—'}</td>
                <td>${deal.status === 'Active' ? pnlPct(r.headlineROI) : '—'}</td>
                <td>${deal.saleDate ? monthLabel(Model.parseDate(deal.saleDate)) : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>
      </div>
    </div>`;

  const openInv = (nav) => { Object.assign(invNav, { propId: null, clientId: null, loanId: null }, nav); goTab('inv'); };
  el.querySelectorAll('.row-link').forEach((tr) => tr.addEventListener('click', () => openDeal(tr.dataset.deal)));
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'inv') openInv({ seg: b.dataset.seg || 'props' }); else goTab(b.dataset.go);
  }));
  el.querySelectorAll('[data-prop]').forEach((b) => b.addEventListener('click', () => openInv({ seg: 'props', propId: b.dataset.prop })));
  el.querySelectorAll('[data-client-open]').forEach((b) => b.addEventListener('click', () =>
    openInv({ seg: 'clients', clientId: b.dataset.clientOpen })));
  el.querySelectorAll('[data-loan]').forEach((b) => b.addEventListener('click', () =>
    openInv({ seg: 'clients', clientId: b.dataset.client, loanId: b.dataset.loan })));
  el.querySelectorAll('[data-quick]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.quick === 'calc') { goTab('calc'); return; }
    if (b.dataset.quick === 'prop') {
      const p = Investors.makeProperty({ name: 'Novo imóvel', saleCostPct: state.params.saleCostPct });
      state.properties.push(p); save(); openInv({ seg: 'props', propId: p.id });
    } else {
      const c = Investors.makeClient({ name: 'Novo cliente' });
      state.clients.push(c); save(); openInv({ seg: 'clients', clientId: c.id });
    }
  }));
}

function openDeal(id) {
  currentDealId = id;
  goTab('deals');
}

/* =====================================================
   Deals — lista e detalhe
===================================================== */
function renderDealsTab() {
  const el = document.getElementById('tab-deals');
  const deal = state.deals.find((d) => d.id === currentDealId);
  if (deal) renderDealDetail(el, deal);
  else renderDealList(el);
}

function renderDealList(el) {
  const results = state.deals.map((d) => Model.computeDeal(d, state.params));
  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>Deals</h2>
        <button class="mini-btn primary" id="add-deal">+ Novo deal</button>
      </div>
      <div class="deal-list">
        ${state.deals.map((deal, i) => {
          const r = results[i];
          return `<button class="deal-item" data-deal="${esc(deal.id)}">
            <span class="deal-item-top">${statusDot(deal.status)}<span class="deal-name">${esc(deal.name || '(sem nome)')}</span>
              <span class="deal-fin">${deal.financing === 'Cash' ? 'Cash' : 'Loan'}</span></span>
            <span class="deal-item-bottom">
              ${deal.status === 'Active'
                ? `Lucro ${money(r.profit)} · ROI ${fmtPct1.format(r.headlineROI)} · venda ${deal.saleDate ? monthLabel(Model.parseDate(deal.saleDate)) : '—'}`
                : 'Inativo'}
            </span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  el.querySelector('#add-deal').addEventListener('click', () => {
    const deal = Seed.makeDeal({ id: 'deal-' + Date.now(), name: 'Novo deal', status: 'Active' });
    state.deals.push(deal);
    save();
    currentDealId = deal.id;
    renderDealsTab();
  });
  el.querySelectorAll('.deal-item').forEach((b) => {
    b.addEventListener('click', () => { currentDealId = b.dataset.deal; renderDealsTab(); });
  });
}

/* ---- formulário do deal ---- */
const DEAL_FIELDS = [
  { sec: 'Básico' },
  { k: 'name', label: 'Nome do deal', type: 'text' },
  { k: 'status', label: 'Status', type: 'select', opts: [['Active', 'Ativo'], ['Inactive', 'Inativo']] },
  { k: 'closing', label: 'Closing (compra)', type: 'date' },
  { k: 'constrStart', label: 'Início da construção', type: 'date' },
  { k: 'saleDate', label: 'Venda / refi esperada', type: 'date' },
  { sec: 'Valores' },
  { k: 'land', label: 'Preço do terreno', type: 'money' },
  { k: 'constr', label: 'Orçamento de construção', type: 'money' },
  { k: 'sale', label: 'Preço de venda esperado', type: 'money' },
  { sec: 'Financiamento' },
  { k: 'financing', label: 'Tipo de financiamento', type: 'select', opts: [['Construction Loan', 'Empréstimo de construção'], ['Cash', 'Cash (recursos próprios)']] },
  { k: 'ltc', label: 'LTC', type: 'pct', dflt: 'ltc' },
  { k: 'landAdvPct', label: 'Land advance (% do terreno)', type: 'pct', dflt: 'landAdvPct' },
  { k: 'advTiming', label: 'Land advance pago', type: 'select', opts: [['At Closing', 'No closing'], ['Delayed', 'Com atraso']] },
  { k: 'advDelayMo', label: 'Atraso do land advance (meses)', type: 'num' },
  { k: 'reimbPct', label: 'Reembolso dos draws', type: 'pct', dflt: 'reimbPct' },
  { k: 'reimbDelayDays', label: 'Prazo de reembolso (dias)', type: 'num', dflt: 'reimbDelayDays' },
  { k: 'rate', label: 'Juros anuais', type: 'pct', dflt: 'rate' },
  { k: 'loanFeesPct', label: 'Loan fees all-in (% do empréstimo)', type: 'pct', dflt: 'loanFeesPct' },
  { k: 'insurance', label: 'Seguro (no closing)', type: 'money', dflt: 'insurance' },
  { sec: 'Venda, custos e retorno' },
  { k: 'saleCostPct', label: 'Custos de venda', type: 'pct', dflt: 'saleCostPct' },
  { k: 'holdCost', label: 'Custo de manutenção ($/mês)', type: 'money' },
  { k: 'basis', label: 'Base do ROI (headline)', type: 'select', opts: [['Peak Cash', 'Peak cash'], ['After Land Reimbursement', 'Após land reimbursement'], ['Average Capital Deployed', 'Capital médio']] },
  { k: 'numDraws', label: 'Número de draws', type: 'num' },
];

function fieldInput(f, deal) {
  const v = deal[f.k];
  if (f.type === 'select') {
    return `<select data-k="${f.k}">${f.opts.map(([ov, ol]) =>
      `<option value="${esc(ov)}" ${v === ov ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  }
  if (f.type === 'date') {
    return `<input type="date" data-k="${f.k}" value="${esc(v || '')}">`;
  }
  const dflt = f.dflt != null ? state.params[f.dflt] : null;
  let shown = '', ph = '';
  if (f.type === 'pct') {
    shown = (v === null || v === undefined) ? '' : fmtNum.format(v * 100);
    ph = dflt != null ? `padrão ${fmtNum.format(dflt * 100)}%` : '';
  } else if (f.type === 'money' || f.type === 'num') {
    shown = (v === null || v === undefined) ? '' : String(v);
    ph = dflt != null ? `padrão ${f.type === 'money' ? money(dflt) : fmtNum.format(dflt)}` : '';
  } else {
    shown = v || '';
  }
  const mode = f.type === 'text' ? 'text' : 'decimal';
  return `<input type="text" inputmode="${mode}" data-k="${f.k}" data-type="${f.type}" value="${esc(shown)}" placeholder="${esc(ph)}" autocomplete="off">`;
}

function dealFormHtml(deal) {
  let html = '', open = false;
  for (const f of DEAL_FIELDS) {
    if (f.sec) {
      if (open) html += '</div>';
      html += `<h3 class="form-sec">${esc(f.sec)}</h3><div class="field-grid">`;
      open = true;
    } else {
      html += `<label class="field"><span>${esc(f.label)}</span><div class="input-wrap">${fieldInput(f, deal)}</div></label>`;
    }
  }
  if (open) html += '</div>';
  return html;
}

function dealEditorBody(deal) {
  return `
      <p class="hint">Campos em branco usam o padrão global (aba Ajustes) — igual às células azuis ligadas à aba Parameters da planilha.</p>
      <form class="deal-form">${dealFormHtml(deal)}</form>
      <h3 class="form-sec">Draws (cronograma da obra)</h3>
      <p class="hint">%/mês em branco usam o cronograma padrão. "Valor fixo" e "data fixa" sobrescrevem o cálculo, como na planilha.</p>
      <div class="table-wrap">
        <table class="draw-editor">
          <thead><tr><th>#</th><th>Descrição</th><th>%</th><th>Mês</th><th>Valor fixo</th><th>Data fixa</th></tr></thead>
          <tbody>
            ${Array.from({ length: 10 }, (_, i) => {
              const dr = (deal.draws && deal.draws[i]) || {};
              const sched = state.params.drawSchedule[i] || { desc: 'Draw ' + (i + 1), pct: 0, offset: 0 };
              const off = i + 1 > deal.numDraws ? ' class="draw-off"' : '';
              return `<tr${off}>
                <td>${i + 1}</td>
                <td><input type="text" data-draw="${i}" data-dk="desc" value="${esc(dr.desc ?? '')}" placeholder="${esc(sched.desc)}"></td>
                <td><input type="text" inputmode="decimal" data-draw="${i}" data-dk="pct" value="${dr.pct != null ? esc(fmtNum.format(dr.pct * 100)) : ''}" placeholder="${esc(fmtNum.format(sched.pct * 100))}" size="4"></td>
                <td><input type="text" inputmode="decimal" data-draw="${i}" data-dk="offset" value="${dr.offset != null ? esc(String(dr.offset)) : ''}" placeholder="${esc(String(sched.offset))}" size="3"></td>
                <td><input type="text" inputmode="decimal" data-draw="${i}" data-dk="amountOverride" value="${dr.amountOverride != null ? esc(String(dr.amountOverride)) : ''}" placeholder="auto" size="8"></td>
                <td><input type="date" data-draw="${i}" data-dk="dateOverride" value="${esc(dr.dateOverride || '')}"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
}

function attachDealEditor(root, deal, onChange) {
  const readField = (input) => {
    const k = input.dataset.k;
    const f = DEAL_FIELDS.find((x) => x.k === k);
    if (!f) return;
    if (f.type === 'select' || f.type === 'date') { deal[k] = input.value || null; return; }
    if (f.type === 'text') { deal[k] = input.value; return; }
    const raw = input.value.trim();
    if (raw === '') { deal[k] = (f.dflt != null) ? null : 0; return; }
    const n = parseNum(raw);
    if (!Number.isFinite(n)) return;
    deal[k] = f.type === 'pct' ? n / 100 : n;
  };
  const readDraw = (input) => {
    const i = +input.dataset.draw, dk = input.dataset.dk;
    deal.draws = deal.draws || [];
    while (deal.draws.length <= i) deal.draws.push({});
    const raw = input.value.trim();
    if (dk === 'desc' || dk === 'dateOverride') { deal.draws[i][dk] = raw || null; return; }
    if (raw === '') { deal.draws[i][dk] = null; return; }
    const n = parseNum(raw);
    if (!Number.isFinite(n)) return;
    deal.draws[i][dk] = dk === 'pct' ? n / 100 : n;
  };
  root.querySelectorAll('.deal-form [data-k], .draw-editor [data-draw]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.dataset.k) readField(input); else readDraw(input);
      onChange();
    });
    if (input.tagName === 'INPUT' && input.type === 'text') {
      input.addEventListener('input', () => {
        if (input.dataset.k) readField(input); else readDraw(input);
        onChange();
      });
    }
  });
}

function renderDealDetail(el, deal) {
  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <button class="mini-btn" id="back-deals">‹ Deals</button>
        <div class="row-gap">
          <button class="mini-btn" id="dup-deal">Duplicar</button>
          <button class="mini-btn danger" id="del-deal">Excluir</button>
        </div>
      </div>
      <h2 class="deal-title">${esc(deal.name || '(sem nome)')}</h2>
      ${dealEditorBody(deal)}
    </div>
    <div class="deal-results"></div>`;

  el.querySelector('#back-deals').addEventListener('click', () => { currentDealId = null; renderDealsTab(); });
  el.querySelector('#del-deal').addEventListener('click', () => {
    if (confirm(`Excluir o deal "${deal.name}"?`)) {
      state.deals = state.deals.filter((d) => d.id !== deal.id);
      save(); currentDealId = null; renderDealsTab();
    }
  });
  el.querySelector('#dup-deal').addEventListener('click', () => {
    const copy = clone(deal);
    copy.id = 'deal-' + Date.now();
    copy.name = deal.name + ' (cópia)';
    state.deals.push(copy);
    save(); currentDealId = copy.id; renderDealsTab();
  });

  const resultsEl = el.querySelector('.deal-results');
  attachDealEditor(el, deal, () => {
    save();
    el.querySelector('.deal-title').textContent = deal.name || '(sem nome)';
    renderDealResults(deal, resultsEl);
  });
  renderDealResults(deal, resultsEl);
}

/* =====================================================
   Compartilhar análise em PDF (Web Share API → AirDrop, Mail, etc.)
===================================================== */
function buildAnalysisDoc(deal, r) {
  const pct = (v) => fmtPct1.format(v);
  const sign = (v) => (v > 0 ? 'good' : v < 0 ? 'bad' : undefined);
  const basisLabel = deal.basis === 'Peak Cash' ? 'peak cash'
    : deal.basis === 'Average Capital Deployed' ? 'capital médio' : 'após land reimb.';

  const premissas = [
    ['Preço do terreno', money(deal.land || 0)],
    ['Orçamento de construção', money(deal.constr || 0)],
    ['Preço de venda esperado', money(deal.sale || 0)],
    ['Financiamento', r.cash ? 'Cash (recursos próprios)'
      : `Construction Loan — LTC ${pct(r.resolved.ltc)} · juros ${pct(r.resolved.rate)} a.a. · fees ${pct(r.resolved.loanFeesPct)} all-in`],
    ['Datas', `closing ${dateLabel(Model.parseDate(deal.closing))} · obra ${dateLabel(Model.parseDate(deal.constrStart))} · venda ${dateLabel(Model.parseDate(deal.saleDate))}`],
    ['Período / custos de venda', `${r.holdingMonths} meses · ${pct(r.resolved.saleCostPct)} na venda`],
  ];
  if (!r.cash && deal.advTiming === 'Delayed') {
    premissas.push(['Land advance', `com atraso de ${deal.advDelayMo || 0} mês(es)`]);
  }

  const resultados = [
    ['Lucro projetado', money(r.profit), sign(r.profit)],
    [`ROI (${basisLabel})`, pct(r.headlineROI), sign(r.headlineROI)],
    ['ROI anualizado', pct(r.annualizedROI), sign(r.annualizedROI)],
    ['Margem sobre a venda', pct(r.margin), sign(r.margin)],
    ['Pico de caixa próprio', money(r.peakExposure)],
  ];
  if (!r.cash) {
    resultados.push(
      ['Pico incl. draw float (pior caso)', money(r.peakWithFloat)],
      ['Land advance', money(r.landAdvance)],
      ['Fees no closing', money(r.loanFees)],
      ['Juros totais (interest-only)', money(r.totalInterest)],
    );
  }
  resultados.push(
    ['Caixa necessário no closing', money(r.initialCashAtClosing)],
    ['Capital médio investido', money(r.avgCapital)],
    ['Break-even (preço de venda)', money(r.breakEven)],
  );

  return {
    title: deal.name || '(sem nome)',
    subtitle: `InvestCalc — Análise de deal · gerada em ${fmtDateFull.format(new Date())}`,
    sections: [
      { heading: 'Premissas', rows: premissas },
      { heading: 'Resultados', rows: resultados },
    ],
    table: {
      heading: 'Sensibilidade do preço de venda',
      cols: [
        { label: 'Cenário', x: 54 },
        { label: 'Preço', x: 160 },
        { label: 'Lucro', x: 300 },
        { label: 'ROI', x: 460 },
      ],
      rows: r.sensitivity.map((s) => [
        s.scenario === 0 ? 'Base' : (s.scenario > 0 ? '+' : '') + fmtNum.format(s.scenario * 100) + '%',
        money(s.price),
        [money(s.profit), sign(s.profit)],
        [fmtPct1.format(s.roi), sign(s.roi)],
      ]),
      strongRow: r.sensitivity.findIndex((s) => s.scenario === 0),
    },
    footer: 'Juros mantidos no cenário base na sensibilidade (efeito só do preço). Gerado pelo InvestCalc.',
    charts: [
      {
        title: 'Exposição de caixa mês a mês',
        xlabels: r.months.map((m) => monthLabel(m.start)),
        series: r.cash
          ? [{ name: 'Exposição de caixa', color: 'blue', values: r.months.map((m) => m.O) }]
          : [
            { name: 'Exposição de caixa', color: 'blue', values: r.months.map((m) => m.O) },
            { name: 'Saldo do empréstimo', color: 'green', values: r.months.map((m) => m.N) },
          ],
      },
      {
        title: 'Do investimento ao retorno — posição líquida acumulada',
        xlabels: r.months.map((m) => monthLabel(m.start)),
        series: [{ name: 'Posição acumulada', color: 'blue', values: r.months.map((m) => m.M) }],
      },
    ],
    monthly: {
      heading: 'Cashflow mensal completo',
      cols: [
        { label: 'Mês', x: 54 },
        { label: 'Saídas', x: 105 },
        { label: 'Entradas', x: 185 },
        { label: 'Líquido', x: 265 },
        { label: 'Acumulado', x: 345 },
        { label: 'Exposição', x: 425 },
        { label: 'Saldo empr.', x: 500 },
      ],
      rows: r.months.map((m) => [
        monthLabel(m.start),
        money(m.H),
        money(m.K),
        [money(m.L), m.L > 0 ? 'good' : m.L < 0 ? 'bad' : undefined],
        money(m.M),
        money(m.O),
        r.cash ? '—' : money(m.N),
      ]),
    },
  };
}

async function shareAnalysis(deal) {
  const r = Model.computeDeal(deal, state.params);
  if (!r.active || !deal.closing || !deal.saleDate) {
    alert('Complete a análise antes de compartilhar (status Ativo e datas de closing e venda).');
    return;
  }
  const bytes = Pdf.analysisPdf(buildAnalysisDoc(deal, r));
  await sharePdf(bytes, 'analise-' + slugify(deal.name, 'deal') + '.pdf', 'Análise — ' + (deal.name || 'deal'));
}

function slugify(name, fallback) {
  return (name || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || fallback;
}

// abre a folha de compartilhamento com o PDF; sem ela (ex.: computador), baixa o arquivo
async function sharePdf(bytes, filename, title) {
  const file = new File([bytes], filename, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) { if (e && e.name === 'AbortError') return; /* cancelado pelo usuário */ }
  }
  // sem folha de compartilhamento (ex.: computador): baixa o PDF
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* =====================================================
   Calculadora (análise avulsa — não entra no cashflow)
===================================================== */
function renderCalc() {
  const el = document.getElementById('tab-calc');
  const deal = state.calc;
  el.innerHTML = `
    <div class="card">
      <h2>Calculadora</h2>
      <p class="hint">Analise um deal avulso. Nada daqui entra no Dashboard nem no Cashflow —
        só se você tocar em <b>Salvar no cashflow</b>, que copia esta análise para a lista de deals.</p>
      <div class="row-gap wrap" style="margin-bottom:4px">
        <button class="mini-btn primary" id="calc-add">+ Salvar no cashflow</button>
        <button class="mini-btn" id="calc-share">
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 3l-4 4M12 3l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Compartilhar PDF
        </button>
        <button class="mini-btn danger" id="calc-clear">Limpar</button>
      </div>
      ${dealEditorBody(deal)}
    </div>
    <div class="deal-results"></div>`;

  el.querySelector('#calc-add').addEventListener('click', () => {
    const copy = clone(deal);
    copy.id = 'deal-' + Date.now();
    if (!copy.name || copy.name === 'Análise avulsa') copy.name = 'Novo deal';
    state.deals.push(copy);
    save();
    currentDealId = copy.id;
    document.querySelector('.tab-btn[data-target="deals"]').click();
  });
  el.querySelector('#calc-share').addEventListener('click', () => shareAnalysis(deal));
  el.querySelector('#calc-clear').addEventListener('click', () => {
    if (confirm('Limpar a calculadora e voltar aos valores padrão?')) {
      state.calc = freshCalcDeal();
      save();
      renderCalc();
    }
  });

  const resultsEl = el.querySelector('.deal-results');
  attachDealEditor(el, deal, () => { save(); renderDealResults(deal, resultsEl); });
  renderDealResults(deal, resultsEl);
}

function kv(label, value) {
  return `<tr><td>${esc(label)}</td><td>${value}</td></tr>`;
}

function renderDealResults(deal, holder) {
  if (!holder) return;
  const r = Model.computeDeal(deal, state.params);

  if (!r.active) {
    holder.innerHTML = '<div class="card"><p class="hint">Deal inativo — mude o status para <b>Ativo</b> para calcular. (Deals inativos não entram no Dashboard nem no Cashflow consolidado.)</p></div>';
    return;
  }
  if (!deal.closing || !deal.saleDate) {
    holder.innerHTML = '<div class="card"><p class="hint">Preencha as datas de closing e venda para calcular a linha do tempo.</p></div>';
    return;
  }

  const warns = [];
  if (Math.abs(r.budgetCheck) > 0.5) {
    warns.push(`Os draws somam ${money(r.budgetCheck + (deal.constr || 0))}, mas o orçamento é ${money(deal.constr || 0)} (diferença de ${money(r.budgetCheck)}).`);
  } else if (Math.abs(r.drawPctCheck - 1) > 0.001
      && !(deal.draws || []).some((d, i) => i < deal.numDraws && d && d.amountOverride != null)) {
    warns.push(`Os percentuais dos draws ativos somam ${fmtPct1.format(r.drawPctCheck)} (deveriam somar 100%).`);
  }

  const basisLabel = { 'Peak Cash': 'peak cash', 'After Land Reimbursement': 'após land reimb.', 'Average Capital Deployed': 'capital médio' }[r.resolved.basis];

  holder.innerHTML = `
    <div class="card">
      ${warns.map((w) => `<div class="warn-box">⚠️ ${w}</div>`).join('')}
      <div class="stat-row">
        <div class="stat-tile"><span class="stat-label">Lucro projetado</span><span class="stat-value">${pnl(r.profit)}</span></div>
        <div class="stat-tile"><span class="stat-label">ROI (${basisLabel})</span><span class="stat-value">${pnlPct(r.headlineROI)}</span></div>
      </div>
      <div class="stat-row">
        <div class="stat-tile small"><span class="stat-label">ROI anualizado</span><span class="stat-value">${pnlPct(r.annualizedROI)}</span></div>
        <div class="stat-tile small"><span class="stat-label">Pico de caixa próprio</span><span class="stat-value">${money(r.peakExposure)}</span></div>
        <div class="stat-tile small"><span class="stat-label">Margem s/ venda</span><span class="stat-value">${pnlPct(r.margin)}</span></div>
      </div>
      <div class="viz-root">
        <div class="chart-legend deal-legend"></div>
        <div class="chart-holder deal-chart"></div>
      </div>
    </div>

    <div class="card">
      <h2>Indicadores</h2>
      <div class="table-wrap"><table class="kv-table"><tbody>
        ${kv('Custo total do projeto', money(r.totalProjectCost))}
        ${r.cash ? kv('Financiamento', 'Cash — sem empréstimo, fees ou juros') : `
          ${kv('Empréstimo máx. (LTC ' + fmtPct1.format(r.resolved.ltc) + ')', money(r.maxLoan))}
          ${kv('Land advance', money(r.landAdvance) + (r.landAdvReceiptDate ? ' em ' + dateLabel(r.landAdvReceiptDate) : ''))}
          ${kv('Fees no closing (' + fmtPct1.format(r.resolved.loanFeesPct) + ' all-in + seguro)', money(r.loanFees))}
          ${kv('Juros totais (interest-only)', money(r.totalInterest))}
          ${kv('Capacidade p/ reembolsos', money(r.capacityLeft))}
          ${kv('1º reembolso', dateLabel(r.firstReimbDate))}
          ${kv('Pico incl. draw float (pior caso)', money(r.peakWithFloat))}
        `}
        ${kv('Caixa necessário no closing', money(r.initialCashAtClosing))}
        ${kv('Pico de caixa após land reimb.', money(r.peakAfterLandReimb))}
        ${kv('Capital médio investido', money(r.avgCapital))}
        ${kv('Data do pico de exposição', dateLabel(r.peakDate))}
        ${kv('Custos de manutenção', money(r.totalHolding))}
        ${kv('Período (meses)', String(r.holdingMonths))}
        ${kv('Break-even (preço de venda)', money(r.breakEven))}
        ${kv('ROI s/ peak cash', pnlPct(r.roiPeak))}
        ${kv('ROI após land reimb.', pnlPct(r.roiAfterLandReimb))}
        ${kv('ROI s/ capital médio', pnlPct(r.roiAvgCapital))}
      </tbody></table></div>
    </div>

    <div class="card">
      <h2>Sensibilidade do preço de venda</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Cenário</th><th>Preço</th><th>Lucro</th><th>ROI</th></tr></thead>
        <tbody>${r.sensitivity.map((s) => `<tr${s.scenario === 0 ? ' class="row-strong"' : ''}>
          <td>${s.scenario === 0 ? 'Base' : (s.scenario > 0 ? '+' : '') + fmtNum.format(s.scenario * 100) + '%'}</td>
          <td>${money(s.price)}</td><td>${pnl(s.profit)}</td><td>${pnlPct(s.roi)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <p class="hint">Juros mantidos no cenário base (efeito só do preço), como na planilha.</p>
    </div>

    <div class="card">
      <details>
        <summary>Draw schedule calculado</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Draw</th><th>Pagamento</th><th>Valor</th><th>Reembolso</th><th>Valor reemb.</th></tr></thead>
          <tbody>${r.drawRows.filter((d) => d.isOn).map((d) => `<tr>
            <td>${d.num}</td><td>${esc(d.desc)}</td><td>${dateLabel(d.payDate)}</td><td>${money(d.amount)}</td>
            <td>${dateLabel(d.reimbDate)}</td><td>${r.cash ? '—' : money(d.reimb)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </details>
      <details>
        <summary>Cashflow mensal</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Saídas</th><th>Entradas</th><th>Líquido</th><th>Exposição</th><th>Saldo empréstimo</th></tr></thead>
          <tbody>${r.months.map((m) => `<tr>
            <td>${monthLabel(m.start)}</td><td>${money(m.H)}</td><td>${money(m.K)}</td>
            <td>${pnl(m.L)}</td><td>${money(m.O)}</td><td>${r.cash ? '—' : money(m.N)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </details>
    </div>`;

  const series = [{ name: 'Exposição de caixa', color: cssVar('--series-1'), values: r.months.map((m) => m.O) }];
  if (!r.cash) series.push({ name: 'Saldo do empréstimo', color: cssVar('--series-2'), values: r.months.map((m) => m.N) });
  renderLineChart(
    holder.querySelector('.deal-chart'),
    holder.querySelector('.deal-legend'),
    series,
    r.months.map((m) => m.start)
  );
}

/* =====================================================
   Master Cashflow
===================================================== */
function renderMaster() {
  const el = document.getElementById('tab-master');
  const master = Model.computeMaster(state.deals, state.params);
  if (!master.months.length) {
    el.innerHTML = '<div class="card"><h2>Cashflow consolidado</h2><p class="hint">Nenhum deal ativo com datas preenchidas.</p></div>';
    return;
  }
  const peakExp = master.months.reduce((s, m) => Math.max(s, m.exposure), 0);
  const minBal = Math.min(...master.months.map((m) => m.balance));
  const endBal = master.months[master.months.length - 1].balance;
  const activeIdx = state.deals.map((d, i) => i).filter((i) => state.deals[i].status === 'Active');

  el.innerHTML = `
    <div class="card">
      <h2>Cashflow consolidado</h2>
      <p class="hint">Todos os deals ativos, de ${monthLabel(master.months[0].start)} até ${monthLabel(master.months[master.months.length - 1].start)}, partindo de ${money(master.params.startingCash)} de caixa.</p>
      <div class="stat-row">
        <div class="stat-tile"><span class="stat-label">Saldo final projetado</span><span class="stat-value">${pnl(endBal)}</span></div>
        <div class="stat-tile"><span class="stat-label">Menor saldo</span><span class="stat-value">${pnl(minBal)}</span></div>
        <div class="stat-tile"><span class="stat-label">Pico de exposição</span><span class="stat-value">${money(peakExp)}</span></div>
      </div>
      <div class="viz-root">
        <div class="chart-legend" id="master-legend"></div>
        <div class="chart-holder" id="master-chart"></div>
      </div>
      <p class="hint">Saldo de caixa projetado mês a mês. A linha forte marca o zero — abaixo dela falta caixa.</p>
    </div>
    <div class="card">
      <details open>
        <summary>Tabela mensal</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th><th>Cashflow</th><th>Saldo</th><th>Exposição</th></tr></thead>
          <tbody>${master.months.map((m) => `<tr>
            <td>${monthLabel(m.start)}</td><td>${pnl(m.net)}</td><td>${pnl(m.balance)}</td><td>${money(m.exposure)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </details>
      <details>
        <summary>Por deal (cashflow líquido mensal)</summary>
        <div class="table-wrap"><table>
          <thead><tr><th>Mês</th>${activeIdx.map((i) => `<th>${esc(state.deals[i].name)}</th>`).join('')}</tr></thead>
          <tbody>${master.months.map((m) => `<tr>
            <td>${monthLabel(m.start)}</td>${activeIdx.map((i) => `<td>${m.perDeal[i] ? pnl(m.perDeal[i]) : '—'}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table></div>
      </details>
    </div>`;

  renderLineChart(
    document.getElementById('master-chart'),
    document.getElementById('master-legend'),
    [{ name: 'Saldo de caixa projetado', color: cssVar('--series-1'), values: master.months.map((m) => m.balance) }],
    master.months.map((m) => m.start)
  );
}

/* =====================================================
   Ajustes (Parameters)
===================================================== */
const PARAM_FIELDS = [
  { k: 'startingCash', label: 'Caixa disponível inicial', type: 'money' },
  { k: 'ltc', label: 'LTC padrão', type: 'pct' },
  { k: 'landAdvPct', label: 'Land advance no closing', type: 'pct' },
  { k: 'rate', label: 'Juros anuais padrão', type: 'pct' },
  { k: 'loanFeesPct', label: 'Loan fees all-in (orig.+docs+uw+appraisal)', type: 'pct' },
  { k: 'insurance', label: 'Seguro', type: 'money' },
  { k: 'saleCostPct', label: 'Custos de venda', type: 'pct' },
  { k: 'reimbPct', label: 'Reembolso dos draws', type: 'pct' },
  { k: 'reimbDelayDays', label: 'Prazo de reembolso (dias)', type: 'num' },
];

function renderConfig() {
  const el = document.getElementById('tab-config');
  const P = state.params;
  el.innerHTML = `
    <div class="card">
      <h2>Parâmetros globais</h2>
      <p class="hint">Valem para todos os deals que não tenham valor próprio preenchido (equivalente à aba Parameters).</p>
      <div class="field-grid">
        ${PARAM_FIELDS.map((f) => `<label class="field"><span>${esc(f.label)}</span>
          <div class="input-wrap"><input type="text" inputmode="decimal" data-pk="${f.k}" data-type="${f.type}"
            value="${esc(f.type === 'pct' ? fmtNum.format(P[f.k] * 100) : String(P[f.k]))}" autocomplete="off">
            ${f.type === 'pct' ? '<span class="suffix">%</span>' : ''}</div></label>`).join('')}
      </div>
    </div>
    <div class="card">
      <h2>Cronograma padrão de draws</h2>
      <div class="table-wrap"><table class="draw-editor">
        <thead><tr><th>#</th><th>Descrição</th><th>% da obra</th><th>Mês</th></tr></thead>
        <tbody>${P.drawSchedule.slice(0, 7).map((d, i) => `<tr>
          <td>${i + 1}</td>
          <td><input type="text" data-ds="${i}" data-dk="desc" value="${esc(d.desc)}"></td>
          <td><input type="text" inputmode="decimal" data-ds="${i}" data-dk="pct" value="${esc(fmtNum.format(d.pct * 100))}" size="4"></td>
          <td><input type="text" inputmode="decimal" data-ds="${i}" data-dk="offset" value="${esc(String(d.offset))}" size="3"></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>PDFs para investidores</h2>
      <p class="hint">Aparecem no cabeçalho e no rodapé das ofertas e dos extratos enviados aos clientes.</p>
      <div class="field-grid">
        <label class="field"><span>Nome da empresa</span><div class="input-wrap">
          <input type="text" data-prof="company" value="${esc(state.profile.company)}" placeholder="InvestCalc" autocomplete="off"></div></label>
        <label class="field"><span>Contato (telefone ou e-mail)</span><div class="input-wrap">
          <input type="text" data-prof="contact" value="${esc(state.profile.contact)}" autocomplete="off"></div></label>
      </div>
    </div>
    <div class="card" id="cloud-card"></div>
    <div class="card">
      <h2>Dados</h2>
      <div class="row-gap wrap">
        <button class="mini-btn" id="export-json">Exportar dados</button>
        <button class="mini-btn" id="import-json">Importar dados</button>
        <button class="mini-btn danger" id="reset-seed">Restaurar planilha original</button>
      </div>
      <input type="file" id="import-file" accept="application/json" hidden>
      <p class="hint">Exportar gera um arquivo JSON com tudo — deals, parâmetros, imóveis, clientes e empréstimos (backup). Restaurar volta aos 10 deals e parâmetros de Edmundo_Cashflow.xlsx; imóveis, clientes e empréstimos não são apagados.</p>
    </div>`;

  if (typeof Cloud !== 'undefined') Cloud.renderCard(el.querySelector('#cloud-card'));
  el.querySelectorAll('[data-prof]').forEach((input) => {
    input.addEventListener('change', () => { state.profile[input.dataset.prof] = input.value.trim(); save(); updateChrome(); });
  });

  el.querySelectorAll('[data-pk]').forEach((input) => {
    input.addEventListener('change', () => {
      const n = parseNum(input.value);
      if (!Number.isFinite(n)) return;
      state.params[input.dataset.pk] = input.dataset.type === 'pct' ? n / 100 : n;
      save();
    });
  });
  el.querySelectorAll('[data-ds]').forEach((input) => {
    input.addEventListener('change', () => {
      const i = +input.dataset.ds, dk = input.dataset.dk;
      if (dk === 'desc') { state.params.drawSchedule[i].desc = input.value; }
      else {
        const n = parseNum(input.value);
        if (!Number.isFinite(n)) return;
        state.params.drawSchedule[i][dk] = dk === 'pct' ? n / 100 : n;
      }
      save();
    });
  });
  el.querySelector('#export-json').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'investcalc-dados.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  el.querySelector('#import-json').addEventListener('click', () => el.querySelector('#import-file').click());
  el.querySelector('#import-file').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    file.text().then((txt) => {
      try {
        replaceState(JSON.parse(txt));
        save();
        renderConfig();
        alert('Dados importados.');
      } catch {
        alert('Arquivo inválido — use um JSON exportado pelo InvestCalc.');
      }
    });
  });
  el.querySelector('#reset-seed').addEventListener('click', () => {
    if (confirm('Substituir os deals e parâmetros atuais pelos originais da planilha? (Imóveis, clientes e empréstimos são mantidos.)')) {
      Object.assign(state, { params: clone(Model.DEFAULT_PARAMS), deals: clone(Seed.SEED_DEALS), calc: freshCalcDeal() });
      save();
      currentDealId = null;
      renderConfig();
    }
  });
}

/* ===== Início ===== */
persist();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAllVisible);
updateChrome('dash');
renderDashboard();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
