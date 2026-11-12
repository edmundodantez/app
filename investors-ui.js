'use strict';
/* global Investors, Reports, Pdf, Model, state, save, esc, money, parseNum, fmtNum, fmtPct1, fmtPct2,
   dateLabel, sharePdf, slugify, pnl, pnlPct */

/*
 * Aba Investidores: imóveis ofertados, clientes (investidores e credores),
 * pagamentos/draws, retorno do cliente, empréstimos com amortização e PDFs.
 * Usa o estado e os helpers de app.js; os cálculos vêm de investors.js.
 */
const invNav = { seg: 'props', propId: null, clientId: null, loanId: null };
const fmtUSD2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money2 = (v) => fmtUSD2.format(v);
const isoLabel = (iso) => dateLabel(Investors.parseDate(iso));

const PROP_STATUS = { available: 'Disponível', active: 'Com cliente', sold: 'Vendido' };
const CLIENT_KIND = { investor: 'Investidor', lender: 'Credor', both: 'Investidor e credor' };
const PAY_KIND = [['land', 'Terreno'], ['draw', 'Draw (construtor)'], ['other', 'Outro']];
const ENTRY_TYPE = [['advance', 'Aporte (recebi)'], ['principal', 'Devolução de principal'], ['interest', 'Pagamento de juros']];
const isInvestor = (c) => c.kind !== 'lender';
const isLender = (c) => c.kind === 'lender' || c.kind === 'both';
const clientName = (id) => { const c = state.clients.find((x) => x.id === id); return c ? (c.name || '(sem nome)') : null; };

/* ===== Campos de formulário ===== */
function fld(label, inner, wide) {
  return `<label class="field${wide ? ' wide' : ''}"><span>${esc(label)}</span><div class="input-wrap">${inner}</div></label>`;
}
function fmtVal(v, type) {
  if (v === null || v === undefined || v === '') return '';
  return type === 'pct' ? fmtNum.format(v * 100) : String(v);
}
function inp(obj, k, type, ph) {
  if (type === 'date') return `<input type="date" data-f="${k}" data-type="date" value="${esc(obj[k] || '')}">`;
  if (type === 'area') return `<textarea data-f="${k}" data-type="text" rows="3" placeholder="${esc(ph || '')}">${esc(obj[k] || '')}</textarea>`;
  if (type === 'text') return `<input type="text" data-f="${k}" data-type="text" value="${esc(obj[k] || '')}" placeholder="${esc(ph || '')}" autocomplete="off">`;
  return `<input type="text" inputmode="decimal" data-f="${k}" data-type="${type}" value="${esc(fmtVal(obj[k], type))}" placeholder="${esc(ph || '')}" autocomplete="off">`
    + (type === 'pct' ? '<span class="suffix">%</span>' : '');
}
function sel(obj, k, opts, type) {
  return `<select data-f="${k}" data-type="${type || 'select'}">${opts.map(([v, l]) =>
    `<option value="${esc(v)}" ${String(obj[k] ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
function readInput(input, type) {
  if (type === 'text' || type === 'select') return { v: input.value };
  if (type === 'date' || type === 'ref') return { v: input.value || null };
  if (type === 'bool') return { v: input.value === '1' };
  const raw = input.value.trim();
  if (raw === '') return { v: null };
  const n = parseNum(raw);
  if (!Number.isFinite(n)) return null;
  return { v: type === 'pct' ? n / 100 : n };
}
// liga os inputs [data-f] de root ao objeto; onChange(k, final) — final=true no evento change
function bindForm(root, obj, onChange) {
  root.querySelectorAll('[data-f]').forEach((input) => {
    const handler = (final) => () => {
      const got = readInput(input, input.dataset.type);
      if (!got) return;
      obj[input.dataset.f] = got.v;
      save();
      if (onChange) onChange(input.dataset.f, final);
    };
    input.addEventListener('change', handler(true));
    if (input.tagName === 'TEXTAREA' || (input.tagName === 'INPUT' && input.type === 'text')) {
      input.addEventListener('input', handler(false));
    }
  });
}
// liga os inputs [data-row][data-rk] de uma tabela às linhas de list (por id)
function bindRows(root, list, onChange) {
  root.querySelectorAll('[data-row]').forEach((input) => {
    const handler = () => {
      const row = list.find((x) => x.id === input.dataset.row);
      const got = row && readInput(input, input.dataset.type);
      if (!got) return;
      row[input.dataset.rk] = input.dataset.type === 'money' ? (got.v ?? 0) : got.v;
      save();
      onChange();
    };
    input.addEventListener('change', handler);
    if (input.tagName === 'INPUT' && input.type === 'text') input.addEventListener('input', handler);
  });
}
const rowInp = (row, k, type, size) => (type === 'date'
  ? `<input type="date" data-row="${esc(row.id)}" data-rk="${k}" data-type="date" value="${esc(row[k] || '')}">`
  : `<input type="text" ${type === 'money' ? 'inputmode="decimal"' : ''} data-row="${esc(row.id)}" data-rk="${k}" data-type="${type}" value="${esc(type === 'money' ? (row[k] ? String(row[k]) : '') : (row[k] || ''))}" size="${size || 8}" autocomplete="off">`);
const rowSel = (row, k, opts) => `<select data-row="${esc(row.id)}" data-rk="${k}" data-type="select">${opts.map(([v, l]) =>
  `<option value="${v}" ${row[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

const tile = (label, value, small) =>
  `<div class="stat-tile${small ? ' small' : ''}"><span class="stat-label">${esc(label)}</span><span class="stat-value">${value}</span></div>`;
const kvRow = (label, value) => `<tr><td>${esc(label)}</td><td>${value}</td></tr>`;
const chip = (text, cls) => `<span class="chip-tag ${cls || ''}">${esc(text)}</span>`;
const langSelect = (id, lang) => `<select class="lang-select" id="${id}" aria-label="Idioma do PDF">
  <option value="en" ${lang !== 'pt' ? 'selected' : ''}>PDF em inglês</option>
  <option value="pt" ${lang === 'pt' ? 'selected' : ''}>PDF em português</option></select>`;

/* ===== Entrada da aba ===== */
function renderInvestors() {
  const el = document.getElementById('tab-inv');
  const prop = state.properties.find((p) => p.id === invNav.propId);
  const client = state.clients.find((c) => c.id === invNav.clientId);
  const loan = client && state.loans.find((l) => l.id === invNav.loanId && l.clientId === client.id);
  if (prop) renderPropertyDetail(el, prop);
  else if (loan) renderLoanDetail(el, client, loan);
  else if (client) renderClientDetail(el, client);
  else renderInvestorsHome(el);
}
function invGo(nav) {
  Object.assign(invNav, { propId: null, clientId: null, loanId: null }, nav);
  renderInvestors();
  window.scrollTo(0, 0);
}

/* ===== Home: resumo + listas ===== */
function renderInvestorsHome(el) {
  const O = Investors.overview(state.properties, state.clients, state.loans);
  const seg = invNav.seg;
  el.innerHTML = `
    <div class="card">
      <h2>Clientes e imóveis</h2>
      <div class="stat-row">
        ${tile('Imóveis disponíveis', O.available, true)}
        ${tile('Com cliente', O.active, true)}
        ${tile('Clientes procurando', O.looking, true)}
      </div>
      <div class="stat-row">
        ${tile('Devo a credores (principal)', money(O.principal))}
        ${tile('Juros a pagar hoje', money(O.interestDue))}
      </div>
      ${O.overdueAmount > 0 ? `<div class="warn-box">Há <b>${money(O.overdueAmount)}</b> em pagamentos de clientes vencidos e não marcados como pagos.</div>` : ''}
      <div class="seg" role="tablist">
        <button class="seg-btn ${seg === 'props' ? 'on' : ''}" data-seg="props">Imóveis (${state.properties.length})</button>
        <button class="seg-btn ${seg === 'clients' ? 'on' : ''}" data-seg="clients">Clientes (${state.clients.length})</button>
      </div>
    </div>
    <div id="inv-list"></div>`;
  el.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => invGo({ seg: b.dataset.seg })));
  if (seg === 'clients') renderClientList(el.querySelector('#inv-list'));
  else renderPropertyList(el.querySelector('#inv-list'));
}

function propLine(p, r) {
  const parts = [`Custo ${money(r.totalCost)}`];
  if (r.hasSale) parts.push(`${r.sold ? 'vendido por' : 'venda est.'} ${money(r.salePrice)}`, `retorno ${fmtPct1.format(r.roi)}`);
  if (r.status === 'active') parts.push(`pago ${fmtPct1.format(r.paidPct)}`);
  return parts.join(' · ');
}
function propItem(p, r) {
  const who = r.status !== 'available' ? clientName(p.clientId) : null;
  return `<button class="deal-item" data-prop="${esc(p.id)}">
    <span class="deal-item-top"><span class="deal-name">${esc(p.name || '(sem nome)')}</span>
      ${chip(PROP_STATUS[r.status], 'st-' + r.status)}</span>
    <span class="deal-item-bottom">${esc([p.city, who].filter(Boolean).join(' · '))}${p.city || who ? '<br>' : ''}${esc(propLine(p, r))}</span>
  </button>`;
}

function renderPropertyList(holder) {
  const order = { available: 0, active: 1, sold: 2 };
  const list = state.properties.map((p) => ({ p, r: Investors.computeProperty(p) }))
    .sort((a, b) => order[a.r.status] - order[b.r.status]);
  const deals = state.deals.filter((d) => d.status === 'Active');
  holder.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>Imóveis</h2>
        <button class="mini-btn primary" id="add-prop">+ Novo imóvel</button>
      </div>
      ${list.length ? `<div class="deal-list">${list.map(({ p, r }) => propItem(p, r)).join('')}</div>`
        : '<p class="hint">Nenhum imóvel ainda. Cadastre os imóveis disponíveis para oferecer aos clientes.</p>'}
      ${deals.length ? `<div class="row-gap wrap" style="margin-top:12px">
        <select class="lang-select" id="from-deal"><option value="">Criar a partir de um deal…</option>
          ${deals.map((d) => `<option value="${esc(d.id)}">${esc(d.name || '(sem nome)')}</option>`).join('')}</select>
      </div>` : ''}
    </div>
    <div class="card">
      <h2>PDF dos investimentos disponíveis</h2>
      <p class="hint">Um PDF com todos os imóveis disponíveis (resumo, custos e retorno estimado) para enviar a quem está procurando.</p>
      <div class="row-gap wrap">
        ${langSelect('avail-lang', 'en')}
        <button class="mini-btn" id="avail-pdf">Compartilhar PDF</button>
      </div>
    </div>`;
  holder.querySelector('#add-prop').addEventListener('click', () => {
    const p = Investors.makeProperty({ name: 'Novo imóvel', saleCostPct: state.params.saleCostPct });
    state.properties.push(p);
    save();
    invGo({ propId: p.id });
  });
  const fromDeal = holder.querySelector('#from-deal');
  if (fromDeal) fromDeal.addEventListener('change', () => {
    const deal = state.deals.find((d) => d.id === fromDeal.value);
    if (!deal) return;
    const p = propertyFromDeal(deal);
    state.properties.push(p);
    save();
    invGo({ propId: p.id });
  });
  holder.querySelectorAll('[data-prop]').forEach((b) => b.addEventListener('click', () => invGo({ propId: b.dataset.prop })));
  holder.querySelector('#avail-pdf').addEventListener('click', () => {
    const lang = holder.querySelector('#avail-lang').value;
    if (!list.some((x) => x.r.status === 'available')) { alert('Nenhum imóvel disponível para listar.'); return; }
    sharePdf(Pdf.reportPdf(Reports.availableDoc(state.properties, lang, state.profile)),
      lang === 'pt' ? 'investimentos-disponiveis.pdf' : 'available-investments.pdf',
      lang === 'pt' ? 'Investimentos disponíveis' : 'Available investments');
  });
}

// copia terreno, draws (datas e valores do modelo), preço e data de venda de um deal do Investor Management
function propertyFromDeal(deal) {
  const r = Model.computeDeal(deal, state.params);
  const payments = [];
  if (deal.land > 0) payments.push(Investors.makePayment({ kind: 'land', desc: 'Land', amount: deal.land, dueDate: deal.closing || null }));
  for (const d of r.drawRows) {
    if (d.isOn && d.amount > 0) {
      payments.push(Investors.makePayment({ kind: 'draw', desc: d.desc, amount: Math.round(d.amount * 100) / 100,
        dueDate: d.payDate != null ? Investors.isoDate(d.payDate) : null,
        paidDate: d.paid ? Investors.isoDate(d.payDate) : null }));
    }
  }
  return Investors.makeProperty({
    name: deal.name || 'Novo imóvel', estSalePrice: deal.sale || 0, saleCostPct: r.resolved.saleCostPct,
    estSaleDate: deal.saleDate || null, payments,
  });
}

// Liga um imóvel disponível a um cliente: o imóvel sai dos disponíveis e o
// cliente deixa de constar como "procurando", porque já pegou esse imóvel.
function assignProperty(p, c) {
  p.clientId = c.id;
  if (!p.purchaseDate) p.purchaseDate = Investors.todayIso();
  c.looking = false;
  save();
}

/* ===== Imóvel ===== */
function paymentsTable(p) {
  if (!p.payments.length) return '<p class="hint">Nenhum pagamento. Adicione o terreno e os draws, ou gere o cronograma abaixo.</p>';
  return `<div class="table-wrap"><table class="draw-editor pay-editor">
    <thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Pago em</th><th></th></tr></thead>
    <tbody>${p.payments.map((x) => `<tr>
      <td data-label="Tipo">${rowSel(x, 'kind', PAY_KIND)}</td>
      <td data-label="Descrição">${rowInp(x, 'desc', 'text', 12)}</td>
      <td data-label="Valor">${rowInp(x, 'amount', 'money', 8)}</td>
      <td data-label="Vencimento">${rowInp(x, 'dueDate', 'date')}</td>
      <td data-label="Pago em">${rowInp(x, 'paidDate', 'date')}</td>
      <td class="cell-del"><button type="button" class="x-btn" data-del="${esc(x.id)}" aria-label="Remover pagamento">× <span>Remover</span></button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderPropertyDetail(el, p) {
  const clientOpts = [['', '— Disponível (sem cliente) —']].concat(
    state.clients.filter(isInvestor).map((c) => [c.id, c.name || '(sem nome)']));
  const owner = state.clients.find((c) => c.id === p.clientId);
  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <button class="mini-btn" id="inv-back">‹ Imóveis</button>
        <button class="mini-btn danger" id="del-prop">Excluir</button>
      </div>
      <h2 class="deal-title">${esc(p.name || '(sem nome)')}</h2>
      <div class="row-gap wrap" style="margin:8px 0 4px">
        ${langSelect('prop-lang', owner ? owner.lang : 'en')}
        <button class="mini-btn" id="prop-pdf">Compartilhar PDF da oferta</button>
      </div>
      <form id="prop-form" onsubmit="return false">
        <h3 class="form-sec">Imóvel</h3>
        <div class="field-grid">
          ${fld('Nome', inp(p, 'name', 'text'))}
          ${fld('Cidade', inp(p, 'city', 'text'))}
          ${fld('Endereço', inp(p, 'address', 'text'), true)}
          ${fld('Quartos', inp(p, 'beds', 'num'))}
          ${fld('Banheiros', inp(p, 'baths', 'num'))}
          ${fld('Área (sq ft)', inp(p, 'sqft', 'num'))}
          ${fld('Construtor', inp(p, 'builder', 'text'))}
          ${fld('Descrição (sai no PDF)', inp(p, 'description', 'area'), true)}
        </div>
        <h3 class="form-sec">Venda estimada</h3>
        <div class="field-grid">
          ${fld('Preço de venda estimado', inp(p, 'estSalePrice', 'money'))}
          ${fld('Custos de venda', inp(p, 'saleCostPct', 'pct'))}
          ${fld('Data estimada de venda', inp(p, 'estSaleDate', 'date'))}
        </div>
        <h3 class="form-sec">Cliente</h3>
        <div class="field-grid">
          ${fld('Comprado por', sel(p, 'clientId', clientOpts, 'ref'))}
          ${fld('Data da compra', inp(p, 'purchaseDate', 'date'))}
        </div>
        <h3 class="form-sec">Venda realizada</h3>
        <p class="hint">Preencha quando o imóvel for vendido: o retorno passa de estimado para realizado.</p>
        <div class="field-grid">
          ${fld('Preço de venda real', inp(p, 'soldPrice', 'money'))}
          ${fld('Data da venda', inp(p, 'soldDate', 'date'))}
          ${fld('Notas internas (não saem no PDF)', inp(p, 'notes', 'area'), true)}
        </div>
      </form>
    </div>
    <div class="card">
      <h2>Pagamentos</h2>
      <p class="hint">Terreno e draws que o cliente paga ao construtor. Preencha "Pago em" quando cada um for pago.</p>
      <div id="pay-table">${paymentsTable(p)}</div>
      <button class="ghost-btn" id="add-pay">+ Adicionar pagamento</button>
      <details>
        <summary>Gerar cronograma (terreno + draws iguais por mês)</summary>
        <div class="field-grid" id="gen-form">
          ${fld('Preço do terreno', '<input type="text" inputmode="decimal" id="gen-land" autocomplete="off">')}
          ${fld('Pagamento do terreno', '<input type="date" id="gen-land-date">')}
          ${fld('Orçamento da construção', '<input type="text" inputmode="decimal" id="gen-constr" autocomplete="off">')}
          ${fld('Número de draws', '<input type="text" inputmode="numeric" id="gen-n" value="7" autocomplete="off">')}
          ${fld('Data do 1º draw', '<input type="date" id="gen-start">')}
        </div>
        <button class="ghost-btn" id="gen-go">Gerar cronograma</button>
      </details>
    </div>
    <div id="prop-results"></div>`;

  const results = el.querySelector('#prop-results');
  const refresh = () => renderPropertyResults(results, p);
  const bindPayRows = () => {
    const holder = el.querySelector('#pay-table');
    bindRows(holder, p.payments, refresh);
    holder.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      p.payments = p.payments.filter((x) => x.id !== b.dataset.del);
      save(); redrawPays();
    }));
  };
  const redrawPays = () => { el.querySelector('#pay-table').innerHTML = paymentsTable(p); bindPayRows(); refresh(); };

  bindForm(el.querySelector('#prop-form'), p, (k, final) => {
    if (k === 'name') el.querySelector('.deal-title').textContent = p.name || '(sem nome)';
    if (k === 'clientId' && final) {
      const c = state.clients.find((x) => x.id === p.clientId);
      if (c) assignProperty(p, c);
      renderPropertyDetail(el, p);
      return;
    }
    refresh();
  });
  bindPayRows();
  refresh();

  el.querySelector('#inv-back').addEventListener('click', () => invGo({ seg: 'props' }));
  el.querySelector('#del-prop').addEventListener('click', () => {
    if (confirm(`Excluir o imóvel "${p.name}" e todos os pagamentos dele?`)) {
      state.properties = state.properties.filter((x) => x.id !== p.id);
      save(); invGo({ seg: 'props' });
    }
  });
  el.querySelector('#add-pay').addEventListener('click', () => {
    const n = p.payments.filter((x) => x.kind === 'draw').length + 1;
    p.payments.push(Investors.makePayment({ desc: `Draw ${n}` }));
    save(); redrawPays();
  });
  el.querySelector('#gen-go').addEventListener('click', () => {
    const land = parseNum(el.querySelector('#gen-land').value) || 0;
    const constr = parseNum(el.querySelector('#gen-constr').value) || 0;
    const draws = parseNum(el.querySelector('#gen-n').value) || 0;
    if (land <= 0 && constr <= 0) { alert('Informe o preço do terreno e/ou o orçamento da construção.'); return; }
    if (p.payments.length && !confirm('Substituir os pagamentos atuais deste imóvel pelo novo cronograma?')) return;
    p.payments = Investors.buildSchedule({ land, constr, draws,
      landDate: el.querySelector('#gen-land-date').value || null, startIso: el.querySelector('#gen-start').value || null });
    save(); redrawPays();
  });
  el.querySelector('#prop-pdf').addEventListener('click', () => {
    const lang = el.querySelector('#prop-lang').value;
    sharePdf(Pdf.reportPdf(Reports.propertyDoc(p, lang, state.profile)),
      (lang === 'pt' ? 'oferta-' : 'offering-') + slugify(p.name, 'imovel') + '.pdf', p.name || 'Imóvel');
  });
}

function renderPropertyResults(holder, p) {
  const r = Investors.computeProperty(p);
  const est = r.sold ? '' : ' estimado';
  const matches = r.status === 'available'
    ? state.clients.filter((c) => isInvestor(c) && c.looking && Investors.propertyMatchesClient(p, c, r)) : [];
  holder.innerHTML = `
    <div class="card">
      <div class="row-between"><h2>Retorno${est}</h2>${chip(PROP_STATUS[r.status], 'st-' + r.status)}</div>
      ${r.overdueAmount > 0 ? `<div class="warn-box">${r.overdue.length} pagamento(s) vencido(s) sem data de pagamento: <b>${money(r.overdueAmount)}</b>.</div>` : ''}
      <div class="stat-row">
        ${tile('Investimento total', money(r.totalCost))}
        ${tile('Lucro líquido' + est, r.hasSale ? pnl(r.profit) : '—')}
      </div>
      <div class="stat-row">
        ${tile('Retorno' + est, r.hasSale ? pnlPct(r.roi) : '—', true)}
        ${tile('Anualizado', r.annualized != null ? pnlPct(r.annualized) : '—', true)}
        ${tile('Pago até hoje', fmtPct1.format(r.paidPct), true)}
      </div>
      <div class="table-wrap"><table class="kv-table kv-wrap"><tbody>
        ${kvRow('Terreno', money(r.landCost))}
        ${kvRow('Construção (draws)', money(r.constrCost))}
        ${r.otherCost ? kvRow('Outros custos', money(r.otherCost)) : ''}
        ${kvRow('Pago pelo cliente', money(r.paid))}
        ${kvRow('A pagar', money(r.pending))}
        ${r.nextDue ? kvRow('Próximo vencimento', `${esc(r.nextDue.desc || 'Pagamento')} · ${isoLabel(r.nextDue.dueDate)} · ${money(r.nextDue.amount)}`) : ''}
        ${r.hasSale ? kvRow(r.sold ? 'Preço de venda' : 'Preço de venda estimado', money(r.salePrice))
          + kvRow(`Custos de venda (${fmtPct2.format(r.saleCostPct)})`, money(r.saleCosts))
          + kvRow('Venda líquida', money(r.netSale)) : ''}
        ${r.months != null ? kvRow('Prazo', `${fmtNum.format(Math.round(r.months * 10) / 10)} meses`) : ''}
      </tbody></table></div>
      ${r.hasSale ? '' : '<p class="hint">Informe o preço de venda estimado para calcular o retorno.</p>'}
      ${r.hasSale && r.annualized == null ? '<p class="hint">Para o retorno anualizado, preencha a data de cada pagamento e a data de venda.</p>' : ''}
    </div>
    ${r.status === 'available' ? `<div class="card">
      <h2>Clientes procurando</h2>
      ${matches.length ? `<p class="hint">Clientes cujo orçamento e região combinam com este imóvel.</p>
        <div class="deal-list">${matches.map((c) => `<div class="deal-item static">
          <span class="deal-item-top"><span class="deal-name">${esc(c.name || '(sem nome)')}</span>
            <button class="mini-btn" data-open-client="${esc(c.id)}">Abrir</button>
            <button class="mini-btn" data-assign="${esc(c.id)}">Atribuir</button></span>
          <span class="deal-item-bottom">${esc([c.budgetMax ? 'até ' + money(c.budgetMax) : null, c.location].filter(Boolean).join(' · ') || 'sem restrições')}</span>
        </div>`).join('')}</div>`
        : '<p class="hint">Nenhum cliente procurando combina com este imóvel (orçamento e região).</p>'}
    </div>` : ''}`;
  holder.querySelectorAll('[data-open-client]').forEach((b) => b.addEventListener('click', () => invGo({ seg: 'clients', clientId: b.dataset.openClient })));
  holder.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => {
    const c = state.clients.find((x) => x.id === b.dataset.assign);
    if (!c || !confirm(`Atribuir "${p.name}" a ${c.name}? O imóvel sai dos disponíveis e o cliente deixa de constar como procurando.`)) return;
    assignProperty(p, c);
    renderInvestors();
  }));
}

/* ===== Clientes ===== */
function renderClientList(holder) {
  const list = state.clients.map((c) => ({ c, s: Investors.clientSummary(c, state.properties, state.loans) }));
  holder.innerHTML = `
    <div class="card">
      <div class="row-between">
        <h2>Clientes</h2>
        <button class="mini-btn primary" id="add-client">+ Novo cliente</button>
      </div>
      ${list.length ? `<div class="deal-list">${list.map(({ c, s }) => {
        const parts = [];
        if (s.props.length) parts.push(`${s.props.length} imóvel(is) · pago ${money(s.paid)} de ${money(s.committed)}`);
        if (s.loans.length) parts.push(`principal ${money(s.principal)} · juros a pagar ${money(s.interestDue)}`);
        if (!parts.length) parts.push(isInvestor(c) && c.looking
          ? 'Procurando' + (c.budgetMax ? ` até ${money(c.budgetMax)}` : '') + (c.location ? ` · ${c.location}` : '') : 'Sem movimentos');
        return `<button class="deal-item" data-client="${esc(c.id)}">
          <span class="deal-item-top"><span class="deal-name">${esc(c.name || '(sem nome)')}</span>
            ${chip(CLIENT_KIND[c.kind] || CLIENT_KIND.investor, 'k-' + c.kind)}</span>
          <span class="deal-item-bottom">${parts.map(esc).join('<br>')}</span>
        </button>`;
      }).join('')}</div>`
        : '<p class="hint">Nenhum cliente ainda. Cadastre quem procura imóveis para investir e quem empresta dinheiro.</p>'}
    </div>`;
  holder.querySelector('#add-client').addEventListener('click', () => {
    const c = Investors.makeClient({ name: 'Novo cliente' });
    state.clients.push(c);
    save();
    invGo({ seg: 'clients', clientId: c.id });
  });
  holder.querySelectorAll('[data-client]').forEach((b) => b.addEventListener('click', () => invGo({ seg: 'clients', clientId: b.dataset.client })));
}

function renderClientDetail(el, c) {
  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <button class="mini-btn" id="inv-back">‹ Clientes</button>
        <button class="mini-btn danger" id="del-client">Excluir</button>
      </div>
      <h2 class="deal-title">${esc(c.name || '(sem nome)')}</h2>
      <div class="row-gap wrap" style="margin:8px 0 4px">
        <button class="mini-btn" id="client-pdf">Compartilhar extrato em PDF</button>
      </div>
      <form id="client-form" onsubmit="return false">
        <div class="field-grid">
          ${fld('Nome', inp(c, 'name', 'text'))}
          ${fld('Tipo', sel(c, 'kind', Object.entries(CLIENT_KIND)))}
          ${fld('E-mail', inp(c, 'email', 'text'))}
          ${fld('Telefone', inp(c, 'phone', 'text'))}
          ${fld('Idioma dos PDFs', sel(c, 'lang', [['en', 'Inglês'], ['pt', 'Português']]))}
          ${isInvestor(c) ? fld('Procurando imóvel?', `<select data-f="looking" data-type="bool">
              <option value="1" ${c.looking ? 'selected' : ''}>Sim</option><option value="0" ${c.looking ? '' : 'selected'}>Não</option></select>`)
            + fld('Orçamento máximo', inp(c, 'budgetMax', 'money', 'sem limite'))
            + fld('Região de interesse', inp(c, 'location', 'text', 'ex.: Ocala, Bradenton')) : ''}
          ${fld('Notas', inp(c, 'notes', 'area'), true)}
        </div>
      </form>
    </div>
    <div id="client-results"></div>`;
  const results = el.querySelector('#client-results');
  bindForm(el.querySelector('#client-form'), c, (k, final) => {
    if (k === 'name') el.querySelector('.deal-title').textContent = c.name || '(sem nome)';
    if (k === 'kind' && final) { renderClientDetail(el, c); return; }
    if (k !== 'name' && k !== 'notes' && k !== 'email' && k !== 'phone') renderClientResults(results, c);
  });
  renderClientResults(results, c);

  el.querySelector('#inv-back').addEventListener('click', () => invGo({ seg: 'clients' }));
  el.querySelector('#del-client').addEventListener('click', () => {
    const nP = state.properties.filter((p) => p.clientId === c.id).length;
    const nL = state.loans.filter((l) => l.clientId === c.id).length;
    const extra = (nP ? ` Os ${nP} imóvel(is) dele voltam a ficar sem cliente.` : '') + (nL ? ` Os ${nL} empréstimo(s) dele serão apagados.` : '');
    if (confirm(`Excluir o cliente "${c.name}"?${extra}`)) {
      for (const p of state.properties) if (p.clientId === c.id) p.clientId = null;
      state.loans = state.loans.filter((l) => l.clientId !== c.id);
      state.clients = state.clients.filter((x) => x.id !== c.id);
      save(); invGo({ seg: 'clients' });
    }
  });
  el.querySelector('#client-pdf').addEventListener('click', () => {
    const S = Investors.clientSummary(c, state.properties, state.loans);
    if (!S.props.length && !S.loans.length) { alert('Este cliente ainda não tem imóveis nem empréstimos para o extrato.'); return; }
    sharePdf(Pdf.reportPdf(Reports.statementDoc(c, state.properties, state.loans, state.profile)),
      (c.lang === 'pt' ? 'extrato-' : 'statement-') + slugify(c.name, 'cliente') + '.pdf', c.name || 'Extrato');
  });
}

function renderClientResults(holder, c) {
  const S = Investors.clientSummary(c, state.properties, state.loans);
  const showProps = isInvestor(c) || S.props.length > 0;
  const showLoans = isLender(c) || S.loans.length > 0;
  // todos os imóveis disponíveis, com os que combinam com o cliente (orçamento e região) primeiro
  const avail = !isInvestor(c) ? [] : state.properties.map((p) => ({ p, r: Investors.computeProperty(p) }))
    .filter(({ r }) => r.status === 'available')
    .map((x) => Object.assign(x, { fit: Investors.propertyMatchesClient(x.p, c, x.r) }))
    .sort((a, b) => Number(b.fit) - Number(a.fit));
  const availList = avail.length ? `<div class="deal-list">${avail.map(({ p, r, fit }) => `<div class="deal-item static">
      <span class="deal-item-top"><span class="deal-name">${esc(p.name || '(sem nome)')}</span>
        ${fit ? chip('Compatível', 'st-available') : chip('Fora do perfil')}</span>
      <span class="deal-item-bottom">${esc([p.city, propLine(p, r)].filter(Boolean).join(' · '))}</span>
      <span class="row-gap wrap item-actions">
        <button class="mini-btn primary" data-assign="${esc(p.id)}">Atribuir a este cliente</button>
        <button class="mini-btn" data-offer="${esc(p.id)}">PDF da oferta</button>
        <button class="mini-btn" data-prop="${esc(p.id)}">Abrir</button>
      </span>
    </div>`).join('')}</div>`
    : '<p class="hint">Nenhum imóvel disponível no momento. Cadastre um em Imóveis.</p>';
  const assignCard = !isInvestor(c) ? '' : (c.looking
    ? `<div class="card">
        <h2>Atribuir um imóvel disponível</h2>
        <p class="hint">Ao atribuir, o imóvel sai dos disponíveis e este cliente deixa de constar como procurando.
          "Compatível" = dentro do orçamento e da região de interesse.</p>
        ${availList}
      </div>`
    : `<div class="card"><details>
        <summary>Atribuir outro imóvel disponível (${avail.length})</summary>
        <p class="hint">Este cliente não está procurando no momento, mas você pode atribuir mais um imóvel a ele.</p>
        ${availList}
      </details></div>`);
  let html = c.looking ? assignCard : '';
  if (showProps) {
    html += `<div class="card">
      <h2>Imóveis do cliente</h2>
      ${S.props.length ? `
        <div class="stat-row">
          ${tile('Pago até hoje', money(S.paid))}
          ${tile('A pagar', money(S.pending))}
        </div>
        <div class="stat-row">
          ${tile('Lucro estimado / realizado', pnl(S.profit))}
          ${tile('Retorno', pnlPct(S.roi))}
        </div>
        ${S.overdueAmount > 0 ? `<div class="warn-box">Pagamentos vencidos sem data de pagamento: <b>${money(S.overdueAmount)}</b>.</div>` : ''}
        <div class="deal-list">${S.props.map(({ p, r }) => propItem(p, r)).join('')}</div>`
        : '<p class="hint">Nenhum imóvel atribuído a este cliente.</p>'}
    </div>`;
    if (!c.looking) html += assignCard;
  }
  if (showLoans) {
    html += `<div class="card">
      <div class="row-between"><h2>Empréstimos</h2><button class="mini-btn primary" id="add-loan">+ Novo empréstimo</button></div>
      ${S.loans.length ? `
        <div class="stat-row">
          ${tile('Principal em aberto', money2(S.principal))}
          ${tile('Juros a pagar hoje', money2(S.interestDue))}
        </div>
        <div class="deal-list">${S.loans.map(({ l, r }) => `<div class="deal-item static">
          <span class="deal-item-top"><span class="deal-name">${esc(l.label || 'Empréstimo')}</span>
            <span class="deal-fin">${fmtPct2.format(r.rate)} a.a.</span></span>
          <span class="deal-item-bottom">Principal ${money2(r.principal)} de ${money2(r.advanced)} · juros a pagar ${money2(r.interestDue)}</span>
          <span class="row-gap wrap item-actions">
            <button class="mini-btn" data-loan="${esc(l.id)}">Abrir</button>
            <button class="mini-btn" data-loan-pdf="${esc(l.id)}">Extrato em PDF</button>
          </span>
        </div>`).join('')}</div>`
        : '<p class="hint">Nenhum empréstimo. Crie um para lançar os aportes, as devoluções de principal e os juros pagos.</p>'}
    </div>`;
  }
  holder.innerHTML = html;
  holder.querySelectorAll('[data-prop]').forEach((b) => b.addEventListener('click', () => invGo({ seg: 'props', propId: b.dataset.prop })));
  holder.querySelectorAll('[data-loan]').forEach((b) => b.addEventListener('click', () => invGo({ seg: 'clients', clientId: c.id, loanId: b.dataset.loan })));
  holder.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => {
    const p = state.properties.find((x) => x.id === b.dataset.assign);
    if (!p || !confirm(`Atribuir "${p.name}" a ${c.name}? O imóvel sai dos disponíveis e o cliente deixa de constar como procurando.`)) return;
    assignProperty(p, c);
    renderInvestors(); // redesenha o formulário: "Procurando imóvel?" passa para Não
  }));
  holder.querySelectorAll('[data-offer]').forEach((b) => b.addEventListener('click', () => {
    const p = state.properties.find((x) => x.id === b.dataset.offer);
    if (!p) return;
    sharePdf(Pdf.reportPdf(Reports.propertyDoc(p, c.lang, state.profile)),
      (c.lang === 'pt' ? 'oferta-' : 'offering-') + slugify(p.name, 'imovel') + '.pdf', p.name || 'Imóvel');
  }));
  holder.querySelectorAll('[data-loan-pdf]').forEach((b) => b.addEventListener('click', () => {
    const l = state.loans.find((x) => x.id === b.dataset.loanPdf);
    if (l) shareLoanPdf(c, l, c.lang);
  }));
  const addLoan = holder.querySelector('#add-loan');
  if (addLoan) addLoan.addEventListener('click', () => {
    const n = state.loans.filter((l) => l.clientId === c.id).length + 1;
    const l = Investors.makeLoan({ clientId: c.id, label: `Empréstimo ${n}` });
    state.loans.push(l);
    save();
    invGo({ seg: 'clients', clientId: c.id, loanId: l.id });
  });
}

/* ===== Empréstimo ===== */
// extrato de um único empréstimo, no idioma escolhido, para enviar ao credor
function shareLoanPdf(c, l, lang) {
  if (!Investors.computeLoan(l).rows.length) { alert('Lance pelo menos o aporte antes de gerar o extrato.'); return; }
  sharePdf(Pdf.reportPdf(Reports.loanDoc(Object.assign({}, c, { lang }), l, state.profile)),
    (lang === 'pt' ? 'extrato-' : 'statement-') + slugify(`${c.name} ${l.label}`, 'emprestimo') + '.pdf', l.label || 'Empréstimo');
}

function entriesTable(l) {
  if (!l.entries.length) return '<p class="hint">Nenhum lançamento. Comece pelo aporte (o dinheiro que você recebeu).</p>';
  return `<div class="table-wrap"><table class="draw-editor pay-editor">
    <thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Obs.</th><th></th></tr></thead>
    <tbody>${l.entries.map((x) => `<tr>
      <td data-label="Data">${rowInp(x, 'date', 'date')}</td>
      <td data-label="Tipo">${rowSel(x, 'type', ENTRY_TYPE)}</td>
      <td data-label="Valor">${rowInp(x, 'amount', 'money', 9)}</td>
      <td data-label="Obs.">${rowInp(x, 'note', 'text', 12)}</td>
      <td class="cell-del"><button type="button" class="x-btn" data-del="${esc(x.id)}" aria-label="Remover lançamento">× <span>Remover</span></button></td>
    </tr>`).join('')}</tbody></table></div>`;
}

function renderLoanDetail(el, c, l) {
  el.innerHTML = `
    <div class="card">
      <div class="row-between">
        <button class="mini-btn" id="inv-back">‹ ${esc(c.name || 'Cliente')}</button>
        <button class="mini-btn danger" id="del-loan">Excluir</button>
      </div>
      <h2 class="deal-title">${esc(l.label || 'Empréstimo')}</h2>
      <div class="row-gap wrap" style="margin:8px 0 4px">
        ${langSelect('loan-lang', c.lang)}
        <button class="mini-btn" id="loan-pdf">Compartilhar extrato em PDF</button>
      </div>
      <form id="loan-form" onsubmit="return false">
        <div class="field-grid">
          ${fld('Descrição', inp(l, 'label', 'text'))}
          ${fld('Juros ao ano', inp(l, 'rate', 'pct'))}
          ${fld('Notas', inp(l, 'notes', 'area'), true)}
        </div>
      </form>
      <p class="hint">Juros simples sobre o principal em aberto, contados por dia. Cada devolução de principal reduz os juros dali em diante.</p>
    </div>
    <div class="card">
      <h2>Lançamentos</h2>
      <div id="ent-table">${entriesTable(l)}</div>
      <div class="row-gap wrap">
        <button class="mini-btn" data-add="advance">+ Aporte</button>
        <button class="mini-btn" data-add="principal">+ Devolução de principal</button>
        <button class="mini-btn" data-add="interest">+ Juros pagos</button>
      </div>
    </div>
    <div id="loan-results"></div>`;
  const results = el.querySelector('#loan-results');
  const refresh = () => renderLoanResults(results, l);
  const bindEntries = () => {
    const holder = el.querySelector('#ent-table');
    bindRows(holder, l.entries, refresh);
    holder.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      l.entries = l.entries.filter((x) => x.id !== b.dataset.del);
      save(); redraw();
    }));
  };
  const redraw = () => { el.querySelector('#ent-table').innerHTML = entriesTable(l); bindEntries(); refresh(); };
  bindForm(el.querySelector('#loan-form'), l, (k) => {
    if (k === 'label') el.querySelector('.deal-title').textContent = l.label || 'Empréstimo';
    refresh();
  });
  bindEntries();
  refresh();

  el.querySelector('#inv-back').addEventListener('click', () => invGo({ seg: 'clients', clientId: c.id }));
  el.querySelector('#del-loan').addEventListener('click', () => {
    if (confirm(`Excluir "${l.label}" e todos os lançamentos dele?`)) {
      state.loans = state.loans.filter((x) => x.id !== l.id);
      save(); invGo({ seg: 'clients', clientId: c.id });
    }
  });
  el.querySelector('#loan-pdf').addEventListener('click', () => shareLoanPdf(c, l, el.querySelector('#loan-lang').value));
  el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    l.entries.push(Investors.makeEntry({ type: b.dataset.add, date: Investors.todayIso() }));
    save(); redraw();
  }));
}

function renderLoanResults(holder, l) {
  const r = Investors.computeLoan(l);
  const typeLabel = { advance: 'Aporte', principal: 'Devolução', interest: 'Juros pagos' };
  holder.innerHTML = `
    <div class="card">
      <h2>Posição hoje</h2>
      <div class="stat-row">
        ${tile('Principal em aberto', money2(r.principal))}
        ${tile('Juros a pagar', money2(r.interestDue))}
      </div>
      <div class="stat-row">
        ${tile('Total devido', money2(r.totalOwed), true)}
        ${tile('Juros por mês (aprox.)', money2(r.monthlyInterest), true)}
      </div>
      <div class="table-wrap"><table class="kv-table kv-wrap"><tbody>
        ${kvRow('Total recebido (aportes)', money2(r.advanced))}
        ${kvRow('Principal devolvido', money2(r.repaid))}
        ${kvRow('Juros acumulados até hoje', money2(r.interestAccrued))}
        ${kvRow('Juros já pagos', money2(r.interestPaid))}
      </tbody></table></div>
      ${r.futureEntries ? `<p class="hint">${r.futureEntries} lançamento(s) com data futura ainda não entram no saldo.</p>` : ''}
    </div>
    ${r.rows.length ? `<div class="card">
      <h2>Extrato</h2>
      <div class="table-wrap"><table class="ledger">
        <thead><tr><th>Data</th><th>Lançamento</th><th>Valor</th><th>Principal</th><th>Juros a pagar</th></tr></thead>
        <tbody>${r.rows.map((x) => `<tr>
          <td>${isoLabel(x.date)}</td><td>${esc(typeLabel[x.type] || x.type)}</td>
          <td>${money2(x.amount)}</td><td>${money2(x.balance)}</td><td>${money2(x.interestDue)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}`;
}
