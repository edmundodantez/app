'use strict';
/* global Model, Seed */

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
  || { params: clone(Model.DEFAULT_PARAMS), deals: clone(Seed.SEED_DEALS), calc: freshCalcDeal() };
let currentDealId = null;

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* sem espaço */ }
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
    renderTab(btn.dataset.target);
  });
});

function renderTab(tab) {
  if (tab === 'calc') renderCalc();
  else if (tab === 'dash') renderDashboard();
  else if (tab === 'deals') renderDealsTab();
  else if (tab === 'master') renderMaster();
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
    svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${mutedColor}" font-family="system-ui,sans-serif">${monthLabel(dates[i])}</text>`;
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

function renderDashboard() {
  const el = document.getElementById('tab-dash');
  const d = Model.computeDashboard(state.deals, state.params);

  const shortfall = d.lowestBalance < 0
    ? `<div class="warn-box">⚠️ O caixa projetado fica <b>negativo</b> (mínimo de <b>${money(d.lowestBalance)}</b>).
       Com ${money(d.startingCash)} iniciais, faltam <b>${money(-d.lowestBalance)}</b> no pior mês.</div>`
    : '';

  el.innerHTML = `
    <div class="card">
      <h2>Portfólio</h2>
      ${shortfall}
      <div class="stat-row">
        <div class="stat-tile"><span class="stat-label">Lucro total projetado</span><span class="stat-value">${pnl(d.totalProfit)}</span></div>
        <div class="stat-tile"><span class="stat-label">Pico de exposição de caixa</span><span class="stat-value">${money(d.peakExposure)}</span></div>
      </div>
      <div class="stat-row">
        <div class="stat-tile small"><span class="stat-label">Caixa inicial</span><span class="stat-value">${money(d.startingCash)}</span></div>
        <div class="stat-tile small"><span class="stat-label">Deals ativos</span><span class="stat-value">${d.activeDeals}</span></div>
        <div class="stat-tile small"><span class="stat-label">Menor saldo</span><span class="stat-value">${pnl(d.lowestBalance)}</span></div>
      </div>
      <div class="stat-row">
        <div class="stat-tile small"><span class="stat-label">Custo dos projetos</span><span class="stat-value">${money(d.totalProjectCost)}</span></div>
        <div class="stat-tile small"><span class="stat-label">Juros totais</span><span class="stat-value">${money(d.totalInterest)}</span></div>
        <div class="stat-tile small"><span class="stat-label">ROI s/ pico</span><span class="stat-value">${pnlPct(d.roiPeak)}</span></div>
      </div>
    </div>
    <div class="card">
      <h2>Deals</h2>
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
      <p class="hint">Toque em um deal para abrir. Lucro e ROI vêm do modelo de cada deal (ROI na base configurada).</p>
    </div>`;

  el.querySelectorAll('.row-link').forEach((tr) => {
    tr.addEventListener('click', () => openDeal(tr.dataset.deal));
  });
}

function openDeal(id) {
  currentDealId = id;
  document.querySelector('.tab-btn[data-target="deals"]').click();
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
        <button class="mini-btn" id="add-deal">+ Novo deal</button>
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
   Compartilhar análise (Web Share API → AirDrop, Mail, etc.)
===================================================== */
function buildShareSummary(deal, r) {
  const L = [];
  const pct = (v) => fmtPct1.format(v);
  L.push('InvestCalc — Análise de deal');
  L.push(deal.name || '(sem nome)');
  L.push('Gerada em ' + fmtDateFull.format(new Date()));
  L.push('');
  L.push('PREMISSAS');
  L.push('Terreno: ' + money(deal.land || 0));
  L.push('Construção: ' + money(deal.constr || 0));
  L.push('Venda esperada: ' + money(deal.sale || 0));
  L.push('Financiamento: ' + (r.cash ? 'Cash (recursos próprios)'
    : `Construction Loan (LTC ${pct(r.resolved.ltc)}, juros ${pct(r.resolved.rate)} a.a., fees ${pct(r.resolved.loanFeesPct)} all-in)`));
  if (!r.cash && deal.advTiming === 'Delayed') {
    L.push(`Land advance com atraso de ${deal.advDelayMo || 0} mês(es)`);
  }
  L.push(`Datas: closing ${dateLabel(Model.parseDate(deal.closing))} · obra ${dateLabel(Model.parseDate(deal.constrStart))} · venda ${dateLabel(Model.parseDate(deal.saleDate))}`);
  L.push(`Período: ${r.holdingMonths} meses · Custos de venda: ${pct(r.resolved.saleCostPct)}`);
  L.push('');
  L.push('RESULTADOS');
  L.push('Lucro projetado: ' + money(r.profit));
  L.push(`ROI (${deal.basis === 'Peak Cash' ? 'peak cash' : deal.basis === 'Average Capital Deployed' ? 'capital médio' : 'após land reimb.'}): ` + pct(r.headlineROI));
  L.push('ROI anualizado: ' + pct(r.annualizedROI));
  L.push('Margem sobre a venda: ' + pct(r.margin));
  L.push('Pico de caixa próprio: ' + money(r.peakExposure));
  if (!r.cash) {
    L.push('Pico incl. draw float: ' + money(r.peakWithFloat));
    L.push('Land advance: ' + money(r.landAdvance));
    L.push('Fees no closing: ' + money(r.loanFees));
    L.push('Juros totais: ' + money(r.totalInterest));
  }
  L.push('Caixa necessário no closing: ' + money(r.initialCashAtClosing));
  L.push('Capital médio investido: ' + money(r.avgCapital));
  L.push('Break-even (venda): ' + money(r.breakEven));
  L.push('');
  L.push('SENSIBILIDADE DO PREÇO DE VENDA');
  for (const s of r.sensitivity) {
    const tag = s.scenario === 0 ? 'Base' : (s.scenario > 0 ? '+' : '') + fmtNum.format(s.scenario * 100) + '%';
    L.push(`${tag}: ${money(s.price)} → lucro ${money(s.profit)} (ROI ${pct(s.roi)})`);
  }
  return L.join('\n');
}

async function shareAnalysis(deal) {
  const r = Model.computeDeal(deal, state.params);
  if (!r.active || !deal.closing || !deal.saleDate) {
    alert('Complete a análise antes de compartilhar (status Ativo e datas de closing e venda).');
    return;
  }
  const text = buildShareSummary(deal, r);
  const title = 'Análise — ' + (deal.name || 'deal');
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; /* cancelado pelo usuário */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    alert('Resumo copiado para a área de transferência.');
  } catch {
    prompt('Copie o resumo:', text);
  }
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
        <button class="mini-btn" id="calc-add">+ Salvar no cashflow</button>
        <button class="mini-btn" id="calc-share">
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 3l-4 4M12 3l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Compartilhar
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
      <h2>Dados</h2>
      <div class="row-gap wrap">
        <button class="mini-btn" id="export-json">Exportar dados</button>
        <button class="mini-btn" id="import-json">Importar dados</button>
        <button class="mini-btn danger" id="reset-seed">Restaurar planilha original</button>
      </div>
      <input type="file" id="import-file" accept="application/json" hidden>
      <p class="hint">Exportar gera um arquivo JSON com todos os deals e parâmetros (backup ou transferência entre aparelhos). Restaurar volta aos 10 deals importados de Edmundo_Cashflow.xlsx.</p>
    </div>`;

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
        const s = JSON.parse(txt);
        if (!s.params || !Array.isArray(s.deals)) throw new Error('formato');
        state = s;
        save();
        renderConfig();
        alert('Dados importados.');
      } catch {
        alert('Arquivo inválido — use um JSON exportado pelo InvestCalc.');
      }
    });
  });
  el.querySelector('#reset-seed').addEventListener('click', () => {
    if (confirm('Substituir TODOS os dados atuais pelos deals originais da planilha?')) {
      state = { params: clone(Model.DEFAULT_PARAMS), deals: clone(Seed.SEED_DEALS), calc: freshCalcDeal() };
      save();
      currentDealId = null;
      renderConfig();
    }
  });
}

/* ===== Início ===== */
save();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAllVisible);
renderCalc();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
