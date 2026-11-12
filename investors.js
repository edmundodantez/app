/*
 * Modelo de investidores — imóveis ofertados a clientes, pagamentos (terreno e
 * draws ao construtor), retorno do cliente e empréstimos de credores com
 * amortização de principal. Funções puras: rodam no navegador (window.Investors)
 * e no Node (module.exports) para os testes.
 */
(function (global) {
'use strict';

const DAY = 86400000;
const num = (v) => (Number.isFinite(+v) ? +v : 0);

function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
}
function isoDate(t) {
  return new Date(t).toISOString().slice(0, 10);
}
const todayIso = () => {
  const d = new Date();
  return isoDate(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

let seq = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ===== Fábricas ===== */
const makeProperty = (over) => Object.assign({
  id: newId('prop'), name: '', address: '', city: '', description: '',
  beds: null, baths: null, sqft: null, lotSize: '', builder: '',
  // plano do investimento (como no deal analyzer)
  landPrice: null, constrPerSqft: null, constrBudget: null, otherCosts: null,
  landDate: null, constrStart: null, numDraws: 7,
  // apresentação (PDF Visão Geral): textos do bairro, destaques e vendas comparáveis
  tagline: '', area: '', areaText: '', buyerText: '',
  hl1t: '', hl1x: '', hl2t: '', hl2x: '', hl3t: '', hl3x: '',
  comps: [],               // { id, address, year, dist, status, price, sqft, inAvg }
  estSalePrice: 0, saleCostPct: 0.08, estSaleDate: null,
  clientId: null, purchaseDate: null,
  payments: [],            // { id, kind:'land'|'draw'|'other', desc, amount, dueDate, paidDate }
  soldPrice: null, soldDate: null,
  notes: '',
}, over);

const makeComp = (over) => Object.assign({
  id: newId('cmp'), address: '', year: '', dist: '', status: '', price: 0, sqft: 0, inAvg: true,
}, over);

const makePayment = (over) => Object.assign({
  id: newId('pay'), kind: 'draw', desc: '', amount: 0, dueDate: null, paidDate: null,
}, over);

const makeClient = (over) => Object.assign({
  id: newId('cli'), name: '', email: '', phone: '',
  kind: 'investor',        // 'investor' (compra imóveis) | 'lender' (empresta dinheiro)
  lang: 'en',              // idioma dos PDFs: 'en' | 'pt'
  looking: true, budgetMax: null, location: '', notes: '',
}, over);

const makeLoan = (over) => Object.assign({
  id: newId('loan'), clientId: null, label: '', rate: 0.10, notes: '',
  entries: [],             // { id, date, type:'advance'|'principal'|'interest', amount, note }
}, over);

const makeEntry = (over) => Object.assign({
  id: newId('ent'), date: null, type: 'advance', amount: 0, note: '',
}, over);

/* Cronograma inicial: terreno + N draws iguais, um por mês a partir de startIso. */
function buildSchedule({ land, constr, draws, landDate, startIso }) {
  const out = [];
  if (num(land) > 0) out.push(makePayment({ kind: 'land', desc: 'Land', amount: num(land), dueDate: landDate || null }));
  const n = Math.max(0, Math.round(num(draws)));
  if (n > 0 && num(constr) > 0) {
    const each = Math.floor((num(constr) / n) * 100) / 100;
    const start = parseDate(startIso);
    for (let i = 0; i < n; i++) {
      const amount = i === n - 1 ? Math.round((num(constr) - each * (n - 1)) * 100) / 100 : each;
      let due = null;
      if (start != null) {
        const d = new Date(start);
        const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1));
        const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
        due = isoDate(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last)));
      }
      out.push(makePayment({ kind: 'draw', desc: `Draw ${i + 1}`, amount, dueDate: due }));
    }
  }
  return out;
}

/* Plano do investimento: terreno, construção (orçamento fixo ou sq ft × $/sq ft) e outros custos. */
function planOf(p) {
  const land = num(p.landPrice);
  const fixed = p.constrBudget !== null && p.constrBudget !== undefined && p.constrBudget !== '';
  const constrAuto = num(p.sqft) * num(p.constrPerSqft);
  const constr = fixed ? num(p.constrBudget) : constrAuto;
  const other = num(p.otherCosts);
  return { land, constr, constrAuto, other, total: land + constr + other };
}

const addMonths = (t, n) => {
  const d = new Date(t);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last));
};

/*
 * Cronograma de pagamentos a partir do plano: terreno na compra, outros custos
 * junto, e a construção em draws. Se drawSchedule (o cronograma padrão dos
 * deals: % e mês de cada draw) tiver exatamente numDraws etapas somando 100%,
 * usa essas % e meses a partir do início da obra; senão, draws iguais por mês.
 */
function planSchedule(p, drawSchedule) {
  const plan = planOf(p);
  const out = [];
  if (plan.land > 0) out.push(makePayment({ kind: 'land', desc: 'Land', amount: plan.land, dueDate: p.landDate || null }));
  if (plan.other > 0) out.push(makePayment({ kind: 'other', desc: 'Other costs', amount: plan.other, dueDate: p.landDate || null }));
  const n = Math.max(1, Math.round(num(p.numDraws)) || 1);
  if (plan.constr > 0) {
    const start = parseDate(p.constrStart);
    const std = (drawSchedule || []).filter((d) => num(d.pct) > 0);
    const useStd = std.length === n && Math.abs(std.reduce((s, d) => s + num(d.pct), 0) - 1) < 1e-6;
    let left = plan.constr;
    for (let i = 0; i < n; i++) {
      const share = useStd ? num(std[i].pct) : 1 / n;
      const amount = i === n - 1 ? Math.round(left * 100) / 100 : Math.round(plan.constr * share * 100) / 100;
      left -= amount;
      const months = useStd ? Math.trunc(num(std[i].offset)) : i;
      out.push(makePayment({ kind: 'draw', desc: useStd && std[i].desc ? std[i].desc : `Draw ${i + 1}`, amount,
        dueDate: start != null ? isoDate(addMonths(start, months)) : null }));
    }
  }
  return out;
}

/* ===== XIRR (taxa anual que zera o VPL de fluxos datados) ===== */
function xirr(flows) {
  if (flows.length < 2) return null;
  if (!flows.some((f) => f.v > 0) || !flows.some((f) => f.v < 0)) return null;
  const t0 = Math.min(...flows.map((f) => f.t));
  if (flows.every((f) => f.t === t0)) return null;
  const npv = (r) => flows.reduce((s, f) => s + f.v / Math.pow(1 + r, (f.t - t0) / (365 * DAY)), 0);
  let lo = -0.9999, hi = 1000;
  let flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
    if (hi - lo < 1e-9) break;
  }
  return (lo + hi) / 2;
}

/* ===== Imóvel: custo, pagamentos e retorno (estimado ou realizado) ===== */
function computeProperty(p, asOfIso) {
  const asOf = parseDate(asOfIso || todayIso());
  const pays = (p.payments || []).map((x) => Object.assign({}, x, { amount: num(x.amount) }));
  const sumIf = (f) => pays.reduce((s, x) => s + (f(x) ? x.amount : 0), 0);

  // com cronograma lançado, ele manda; sem cronograma, vale o plano do investimento
  const plan = planOf(p);
  const hasSchedule = pays.some((x) => x.amount > 0);
  const totalCost = hasSchedule ? sumIf(() => true) : plan.total;
  const paid = sumIf((x) => !!x.paidDate);
  const unpaid = pays.filter((x) => !x.paidDate && x.amount > 0);
  const overdue = unpaid.filter((x) => x.dueDate && parseDate(x.dueDate) < asOf);
  const upcoming = unpaid.filter((x) => x.dueDate).sort((a, b) => parseDate(a.dueDate) - parseDate(b.dueDate));

  const sold = !!p.soldDate && num(p.soldPrice) > 0;
  const salePrice = sold ? num(p.soldPrice) : num(p.estSalePrice);
  const saleCostPct = num(p.saleCostPct);
  const saleCosts = salePrice * saleCostPct;
  const netSale = salePrice - saleCosts;
  const hasSale = salePrice > 0;
  const profit = hasSale ? netSale - totalCost : 0;
  const roi = hasSale && totalCost > 0 ? profit / totalCost : 0;
  const saleDate = sold ? p.soldDate : (p.estSaleDate || null);

  // taxa anualizada: cada pagamento na data paga (ou prevista) e a venda líquida no fim
  let annualized = null, months = null;
  const dated = pays.filter((x) => x.amount > 0).map((x) => ({ t: parseDate(x.paidDate || x.dueDate), v: -x.amount }));
  if (hasSale && saleDate && dated.length && dated.every((f) => f.t != null)) {
    const tSale = parseDate(saleDate);
    annualized = xirr(dated.concat([{ t: tSale, v: netSale }]));
    months = Math.max(0, (tSale - Math.min(...dated.map((f) => f.t))) / DAY / 30.4375);
  }

  return {
    status: sold ? 'sold' : (p.clientId ? 'active' : 'available'),
    sold, totalCost, paid, pending: totalCost - paid,
    landCost: hasSchedule ? sumIf((x) => x.kind === 'land') : plan.land,
    constrCost: hasSchedule ? sumIf((x) => x.kind === 'draw') : plan.constr,
    otherCost: hasSchedule ? sumIf((x) => x.kind !== 'land' && x.kind !== 'draw') : plan.other,
    plan, hasSchedule,
    // cronograma lançado diferente do plano (ex.: plano alterado depois de gerar o cronograma)
    scheduleDiff: hasSchedule && plan.total > 0 ? Math.round((sumIf(() => true) - plan.total) * 100) / 100 : 0,
    sqft: num(p.sqft),
    paidPct: totalCost > 0 ? paid / totalCost : 0,
    overdue, overdueAmount: overdue.reduce((s, x) => s + x.amount, 0),
    nextDue: upcoming[0] || null,
    salePrice, saleCostPct, saleCosts, netSale, saleDate, hasSale,
    profit, roi, annualized, months,
    constrPerSqft: num(p.sqft) > 0 ? (hasSchedule ? sumIf((x) => x.kind === 'draw') : plan.constr) / num(p.sqft) : null,
    costPerSqft: num(p.sqft) > 0 ? totalCost / num(p.sqft) : null,
    salePerSqft: num(p.sqft) > 0 && hasSale ? salePrice / num(p.sqft) : null,
  };
}

/* ===== Empréstimo de credor =====
 * Juros simples sobre o principal em aberto, contados por dia (ano de 365 dias).
 * 'advance' aumenta o principal, 'principal' devolve principal, 'interest' paga juros.
 */
function computeLoan(loan, asOfIso) {
  const asOf = parseDate(asOfIso || todayIso());
  const rate = num(loan.rate);
  const entries = (loan.entries || [])
    .map((e, i) => ({ e, i, t: parseDate(e.date), amount: num(e.amount) }))
    .filter((x) => x.t != null && x.amount !== 0)
    .sort((a, b) => a.t - b.t || a.i - b.i);

  let bal = 0, accrued = 0, interestPaid = 0, advanced = 0, repaid = 0, last = null;
  const rows = [];
  let future = 0;
  for (const x of entries) {
    if (x.t > asOf) { future++; continue; }
    if (last != null) accrued += bal * rate * ((x.t - last) / DAY) / 365;
    last = x.t;
    if (x.e.type === 'advance') { bal += x.amount; advanced += x.amount; }
    else if (x.e.type === 'principal') { bal -= x.amount; repaid += x.amount; }
    else if (x.e.type === 'interest') { interestPaid += x.amount; }
    rows.push({
      id: x.e.id, date: x.e.date, type: x.e.type, amount: x.amount, note: x.e.note || '',
      balance: bal, interestAccrued: accrued, interestDue: accrued - interestPaid,
    });
  }
  if (last != null && asOf > last) accrued += bal * rate * ((asOf - last) / DAY) / 365;

  const interestDue = accrued - interestPaid;
  return {
    rate, rows, futureEntries: future,
    firstDate: rows.length ? rows[0].date : null,
    advanced, repaid, principal: bal,
    interestAccrued: accrued, interestPaid, interestDue,
    totalOwed: bal + interestDue,
    monthlyInterest: bal * rate / 12,
  };
}

/* ===== Cash × financiado (modelo do Single Deal Analyzer) =====
 * Roda o mesmo imóvel pelo modelo dos deals (Model.computeDeal) duas vezes:
 * tudo em cash e com construction loan (LTC, land advance, reembolso dos draws,
 * loan fees e juros). Os draws vêm do cronograma do imóvel (ou do plano, se
 * ainda não houver cronograma). "Outros custos" não existem na planilha: entram
 * como caixa próprio nos dois cenários.
 */
function financingScenarios(p, params, Model, asOfIso) {
  const r = computeProperty(p, asOfIso);
  // os termos do financiamento são sempre os mesmos (aba Ajustes); as taxas já incluem o seguro
  const P = Object.assign({}, Model.DEFAULT_PARAMS, params || {}, { insurance: 0 });
  const pays = r.hasSchedule ? (p.payments || []) : planSchedule(p, P.drawSchedule);
  const dateOf = (x) => x.paidDate || x.dueDate || null;
  const landPay = pays.find((x) => x.kind === 'land' && num(x.amount) > 0);
  let draws = pays.filter((x) => x.kind === 'draw' && num(x.amount) > 0)
    .map((x) => ({ desc: x.desc || 'Draw', amountOverride: num(x.amount), dateOverride: dateOf(x) }));
  if (draws.length > 10) { // o modelo tem 10 draws: junta os excedentes no último
    const extra = draws.slice(9);
    draws = draws.slice(0, 9).concat([{ desc: 'Draws 10+', dateOverride: extra[extra.length - 1].dateOverride,
      amountOverride: extra.reduce((s, x) => s + x.amountOverride, 0) }]);
  }
  const firstDraw = draws.map((d) => d.dateOverride).filter(Boolean).sort()[0] || null;
  const closing = (landPay && dateOf(landPay)) || p.landDate || p.constrStart || firstDraw;
  const constrStart = p.constrStart || firstDraw || closing;
  const missing = [];
  if (!r.hasSale) missing.push('sale');
  if (!r.saleDate) missing.push('saleDate');
  if (!closing) missing.push('landDate');
  if (r.constrCost > 0 && !constrStart && draws.some((d) => !d.dateOverride)) missing.push('constrStart');
  if (r.landCost + r.constrCost <= 0) missing.push('cost');
  if (missing.length) return { ready: false, missing };

  const other = r.otherCost;
  const raw = {};
  const run = (financing) => {
    const R = Model.computeDeal({
      status: 'Active', financing, closing, constrStart, saleDate: r.saleDate,
      land: r.landCost, constr: r.constrCost, sale: r.salePrice,
      ltc: null, rate: null, loanFeesPct: null,
      landAdvPct: null, reimbPct: null, reimbDelayDays: null, insurance: null,
      saleCostPct: r.saleCostPct, numDraws: draws.length, draws,
      advTiming: 'At Closing', advDelayMo: 0, holdCost: 0, basis: 'After Land Reimbursement',
    }, P);
    raw[financing] = R;
    const profit = R.profit - other;
    const basis = R.peakAfterLandReimb + other;
    const roi = basis > 0 ? profit / basis : 0;
    const avgCapital = R.avgCapital + other;
    const reimbursed = R.drawRows.reduce((s, d) => s + d.reimb, 0);
    return {
      financing, profit, roi,
      annualized: R.holdingMonths > 0 ? roi * 12 / R.holdingMonths : 0,
      cashAtClosing: R.initialCashAtClosing + other,
      peakCash: R.peakExposure + other, basis, peakDate: R.peakDate,
      avgCapital, roiAvg: avgCapital > 0 ? profit / avgCapital : 0,
      maxLoan: R.maxLoan, landAdvance: R.landAdvance, reimbursed, loanUsed: R.landAdvance + reimbursed,
      loanFees: R.loanFees, interest: R.totalInterest, financeCost: R.loanFees + R.totalInterest,
      breakEven: r.saleCostPct < 1 ? R.breakEven + other / (1 - r.saleCostPct) : 0,
      months: R.holdingMonths, margin: r.salePrice > 0 ? profit / r.salePrice : 0,
      ltc: R.resolved.ltc, rate: R.resolved.rate, loanFeesPct: R.resolved.loanFeesPct,
      landAdvPct: R.resolved.landAdvPct, reimbPct: R.resolved.reimbPct, reimbDelayDays: R.resolved.reimbDelayDays,
    };
  };
  const cash = run('Cash'), loan = run('Construction Loan');
  const A = raw['Construction Loan'], B = raw.Cash;
  const totalCost = r.landCost + r.constrCost + other;
  return {
    ready: true, cash, loan,
    // dados do projeto e séries para a comparação e os PDFs
    project: {
      land: r.landCost, constr: r.constrCost, other, totalCost, sale: r.salePrice, saleCostPct: r.saleCostPct,
      netSale: r.netSale, sqft: num(p.sqft), constrPerSqft: r.constrPerSqft, salePerSqft: r.salePerSqft,
      closing: parseDate(closing), constrStart: parseDate(constrStart), saleDate: parseDate(r.saleDate),
      months: A.holdingMonths,
      lastDraw: A.drawRows.reduce((t, d) => (d.isOn && d.payDate != null ? Math.max(t, d.payDate) : t), 0) || null,
      financedPct: totalCost > 0 ? loan.loanUsed / totalCost : 0,
    },
    draws: A.drawRows.filter((d) => d.isOn && d.amount > 0).map((d) => ({
      num: d.num, desc: d.desc, pct: r.constrCost > 0 ? d.amount / r.constrCost : 0,
      payDate: d.payDate, amount: d.amount, reimbDate: d.reimb > 0 ? d.reimbDate : null, reimb: d.reimb,
    })),
    // caixa do investidor mês a mês: quanto entra, quanto volta e quanto fica no negócio
    monthly: A.months.map((mA, i) => {
      const mB = B.months[i];
      const add = i === 0 ? other : 0, last = i === A.months.length - 1;
      return { start: mA.start, end: mA.end,
        fin: { put: mA.H + add, back: mA.K, held: last ? 0 : mA.O + other },
        cash: { put: mB.H + add, back: mB.K, held: last ? 0 : mB.O + other } };
    }),
    sensitivity: A.sensitivity.map((sA, i) => {
      const sB = B.sensitivity[i];
      const pf = (s, base) => { const profit = s.profit - other; return { profit, roi: base > 0 ? profit / base : 0 }; };
      return { scenario: sA.scenario, price: sA.price, fin: pf(sA, loan.basis), cash: pf(sB, cash.basis) };
    }),
  };
}

/* ===== Casamento cliente × imóvel disponível ===== */
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function propertyMatchesClient(p, client, r) {
  const res = r || computeProperty(p);
  if (res.status !== 'available') return false;
  // o orçamento do cliente é só para o terreno
  const budget = num(client.budgetMax);
  if (budget > 0 && res.landCost > budget) return false;
  const wanted = fold(client.location).split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
  if (!wanted.length) return true;
  const where = fold(`${p.city} ${p.address} ${p.name}`);
  return wanted.some((w) => where.includes(w));
}

/* ===== Resumo por cliente e geral ===== */
function clientSummary(client, properties, loans, asOfIso) {
  const props = properties.filter((p) => p.clientId === client.id).map((p) => ({ p, r: computeProperty(p, asOfIso) }));
  const lns = loans.filter((l) => l.clientId === client.id).map((l) => ({ l, r: computeLoan(l, asOfIso) }));
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const withSale = props.filter((x) => x.r.hasSale);
  const cost = sum(withSale, (x) => x.r.totalCost);
  return {
    props, loans: lns,
    committed: sum(props, (x) => x.r.totalCost),
    paid: sum(props, (x) => x.r.paid),
    pending: sum(props, (x) => x.r.pending),
    overdueAmount: sum(props, (x) => x.r.overdueAmount),
    profit: sum(withSale, (x) => x.r.profit),
    realizedProfit: sum(props.filter((x) => x.r.sold), (x) => x.r.profit),
    roi: cost > 0 ? sum(withSale, (x) => x.r.profit) / cost : 0,
    principal: sum(lns, (x) => x.r.principal),
    interestDue: sum(lns, (x) => x.r.interestDue),
    interestPaid: sum(lns, (x) => x.r.interestPaid),
    totalOwed: sum(lns, (x) => x.r.totalOwed),
  };
}

function overview(properties, clients, loans, asOfIso) {
  const pr = properties.map((p) => computeProperty(p, asOfIso));
  const lr = loans.map((l) => computeLoan(l, asOfIso));
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  return {
    available: pr.filter((r) => r.status === 'available').length,
    active: pr.filter((r) => r.status === 'active').length,
    sold: pr.filter((r) => r.status === 'sold').length,
    investors: clients.filter((c) => c.kind !== 'lender').length,
    lenders: clients.filter((c) => c.kind === 'lender').length,
    looking: clients.filter((c) => c.kind !== 'lender' && c.looking).length,
    clientCapitalPaid: sum(pr.filter((r) => r.status === 'active'), (r) => r.paid),
    overdueAmount: sum(pr.filter((r) => r.status === 'active'), (r) => r.overdueAmount),
    principal: sum(lr, (r) => r.principal),
    interestDue: sum(lr, (r) => r.interestDue),
    monthlyInterest: sum(lr, (r) => r.monthlyInterest),
  };
}

const Investors = {
  parseDate, isoDate, todayIso, newId, num,
  makeProperty, makeComp, makePayment, makeClient, makeLoan, makeEntry, buildSchedule, planOf, planSchedule,
  financingScenarios, xirr, computeProperty, computeLoan, propertyMatchesClient, clientSummary, overview,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Investors;
else global.Investors = Investors;
})(typeof window !== 'undefined' ? window : globalThis);
