/*
 * Motor de cálculo — porta fiel das fórmulas de Edmundo_Cashflow.xlsx.
 * Cada KPI mantém o "endereço" da célula de origem (G4..G28 das abas de deal)
 * para facilitar a conferência contra a planilha.
 * Funciona no navegador (window.Model) e no Node (module.exports) para testes.
 */
(function (global) {
'use strict';

/* ===== Datas (UTC, granularidade de dia — semântica do Excel) ===== */
const DAY = 86400000;

function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}
function isoDate(t) {
  if (t == null) return null;
  const D = new Date(t);
  return D.toISOString().slice(0, 10);
}
function firstOfMonth(t) {
  const D = new Date(t);
  return Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), 1);
}
// EDATE do Excel: soma meses, limitando o dia ao fim do mês destino
function edate(t, n) {
  const D = new Date(t);
  const y = D.getUTCFullYear(), m = D.getUTCMonth(), day = D.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + n + 1, 0)).getUTCDate();
  return Date.UTC(y, m + n, Math.min(day, lastDay));
}
function eomonth(t) {
  const D = new Date(t);
  return Date.UTC(D.getUTCFullYear(), D.getUTCMonth() + 1, 0);
}
const addDays = (t, n) => t + n * DAY;
// DATEDIF(a,b,"m") do Excel: meses completos
function datedifM(a, b) {
  const A = new Date(a), B = new Date(b);
  let m = (B.getUTCFullYear() - A.getUTCFullYear()) * 12 + (B.getUTCMonth() - A.getUTCMonth());
  if (B.getUTCDate() < A.getUTCDate()) m--;
  return m;
}

/* ===== Defaults globais (aba Parameters) ===== */
const DEFAULT_PARAMS = {
  startingCash: 600000,       // B4
  reimbDelayDays: 7,          // B5
  landAdvPct: 0.6,            // B6
  ltc: 0.85,                  // B7
  rate: 0.0925,               // B8
  origPct: 0.025,             // B9
  docsFee: 2500,              // B10
  uwPct: 0.001,               // B11
  appraisal: 550,             // B12
  insurance: 1500,            // B13
  saleCostPct: 0.08,          // B14
  reimbPct: 1,                // B15
  drawSchedule: [             // A19:E26
    { desc: 'Builder Contract / Mobilization', pct: 0.05, offset: 0 },
    { desc: 'Permit / Site Prep',              pct: 0.15, offset: 4 },
    { desc: 'Foundation / Slab',               pct: 0.15, offset: 5 },
    { desc: 'Framing',                         pct: 0.20, offset: 6 },
    { desc: 'MEP / Dry-In',                    pct: 0.20, offset: 7 },
    { desc: 'Interior Finishes',               pct: 0.15, offset: 8 },
    { desc: 'Final / CO',                      pct: 0.10, offset: 9 },
    { desc: 'Draw 8',  pct: 0, offset: 0 },
    { desc: 'Draw 9',  pct: 0, offset: 0 },
    { desc: 'Draw 10', pct: 0, offset: 0 },
  ],
};

const MAX_MONTHS = 60; // linhas 52..111 / 8..67 da planilha

// campo vazio no deal => usa o default global (célula azul ligada à aba Parameters)
const val = (v, dflt) => (v === null || v === undefined || v === '' ? dflt : v);

/* ===== Cálculo de um deal (aba de deal, células G4..G28 + linhas 33..42 e 52..111) ===== */
function computeDeal(deal, params) {
  const P = Object.assign({}, DEFAULT_PARAMS, params || {});
  const active = deal.status === 'Active';
  const cash = deal.financing === 'Cash';

  const ltc = val(deal.ltc, P.ltc);
  const landAdvPct = val(deal.landAdvPct, P.landAdvPct);
  const reimbPct = val(deal.reimbPct, P.reimbPct);
  const reimbDelayDays = val(deal.reimbDelayDays, P.reimbDelayDays);
  const rate = val(deal.rate, P.rate);
  const origPct = val(deal.origPct, P.origPct);
  const docsFee = val(deal.docsFee, P.docsFee);
  const uwPct = val(deal.uwPct, P.uwPct);
  const appraisal = val(deal.appraisal, P.appraisal);
  const insurance = val(deal.insurance, P.insurance);
  const saleCostPct = val(deal.saleCostPct, P.saleCostPct);
  const holdCost = deal.holdCost || 0;
  const numDraws = deal.numDraws || 0;
  const basis = deal.basis || 'After Land Reimbursement';

  const closing = parseDate(deal.closing);
  const constrStart = parseDate(deal.constrStart);
  const saleDate = parseDate(deal.saleDate);
  const land = deal.land || 0;
  const constr = deal.constr || 0;
  const sale = deal.sale || 0;

  const G4 = active ? land + constr : 0;                                   // Total Project Cost
  const G5 = (!active || cash) ? 0 : G4 * ltc;                             // Max Loan (LTC)
  const G6 = (!active || cash) ? 0 : Math.min(land * landAdvPct, G5);      // Land Advance
  const G9 = (!active || cash) ? 0 : Math.max(0, G5 - G6);                 // Capacity Left

  // Draws (linhas 33..42)
  const drawRows = [];
  let reimbCum = 0;
  for (let i = 0; i < 10; i++) {
    const src = (deal.draws && deal.draws[i]) || {};
    const dflt = P.drawSchedule[i] || { desc: 'Draw ' + (i + 1), pct: 0, offset: 0 };
    const desc = val(src.desc, dflt.desc);
    const pct = val(src.pct, dflt.pct);
    const offset = val(src.offset, dflt.offset);
    const isOn = active && (i + 1) <= numDraws;                            // C
    const override = parseDate(src.dateOverride);
    const payDate = override != null ? override
      : (isOn && constrStart != null ? edate(constrStart, Math.trunc(offset)) : null); // F
    const amount = !isOn ? 0
      : (src.amountOverride != null && src.amountOverride !== '' ? src.amountOverride : constr * pct); // G
    const reimbDate = (amount > 0 && payDate != null) ? addDays(payDate, reimbDelayDays) : null; // H
    const reimb = (cash || amount <= 0) ? 0
      : Math.min(amount * reimbPct, Math.max(0, G9 - reimbCum));           // I
    reimbCum += reimb;
    drawRows.push({ num: i + 1, desc, pct, offset, isOn, payDate, amount, reimbDate, reimb });
  }
  const sumReimb = reimbCum;

  const G28 = (!active || cash) ? 0 : G6 + sumReimb;                       // Loan Fee Basis
  const G7 = (!active || cash) ? 0
    : (G6 + sumReimb) * origPct + docsFee + G4 * uwPct + appraisal + insurance; // Loan Fees at Closing
  const G17 = (!active || cash || closing == null) ? null
    : (deal.advTiming === 'Delayed' ? edate(closing, deal.advDelayMo || 0) : closing); // Land Adv Receipt
  const G19 = (!active || closing == null || saleDate == null) ? 0
    : datedifM(firstOfMonth(closing), saleDate) + 1;                       // Holding (months)
  const G8 = !active ? 0
    : land + G7 - ((!cash && deal.advTiming !== 'Delayed') ? G6 : 0);      // Initial Cash at Closing
  const G10 = (cash || constr <= 0) ? 0 : G9 / constr;                     // Max Reimbursable %

  // Timeline mensal (linhas 52..111)
  const nMonths = Math.min(MAX_MONTHS, G19);
  const netSalePrice = sale * (1 - saleCostPct);
  const months = [];
  let Mprev = 0, Nprev = 0;
  for (let m = 1; m <= nMonths; m++) {
    const start = edate(firstOfMonth(closing), m - 1);
    const end = Math.min(eomonth(start), saleDate);
    const inPeriod = (t) => t != null && t >= start && t <= end;
    const D = inPeriod(closing) ? land + G7 : 0;                            // Land/Fees Out
    const E = drawRows.reduce((s, r) => s + (inPeriod(r.payDate) ? r.amount : 0), 0); // Builder Out
    const I = cash ? 0
      : (inPeriod(G17) ? G6 : 0)
        + drawRows.reduce((s, r) => s + (r.reimb > 0 && inPeriod(r.reimbDate) ? r.reimb : 0), 0); // Bank Reimb In
    const Pbal = cash ? 0 : Nprev + I;                                      // Pre-Sale Loan Bal.
    const F = cash ? 0 : (rate / 12) * ((Nprev + Pbal) / 2);                // Interest Out
    const G = cash ? 0 : (inPeriod(saleDate) ? Math.max(0, Pbal - netSalePrice) : 0); // Sale Shortfall
    const H = D + E + F + G + holdCost;                                     // Total Out
    const J = inPeriod(saleDate) ? Math.max(0, netSalePrice - Pbal) : 0;    // Net Sale In
    const K = I + J;
    const L = K - H;                                                        // Net Cashflow
    const M = Mprev + L;                                                    // Cumulative
    const N = cash ? 0 : (inPeriod(saleDate) ? 0 : Pbal);                   // Loan Bal End
    const O = Math.max(0, -M);                                              // Cash Exposure
    const Q = (G17 == null) ? 0 : (end >= G17 ? O : 0);                     // helper pós-land-adv
    months.push({ m, start, end, D, E, F, G, H, I, J, K, L, M, N, O, P: Pbal, Q });
    Mprev = M; Nprev = N;
  }

  const G11 = cash ? 0 : months.reduce((s, r) => s + r.F, 0);               // Total Interest
  const G12 = active ? holdCost * G19 : 0;                                  // Total Holding Costs
  const G13 = active ? months.reduce((s, r) => Math.max(s, r.O), 0) : 0;    // Peak Cash Exposure
  const G14 = !active ? 0
    : (G17 == null ? G13 : months.reduce((s, r) => Math.max(s, r.Q), 0));   // Peak After Land Reimb
  const posO = months.filter((r) => r.O > 0);
  const G15 = active && posO.length ? posO.reduce((s, r) => s + r.O, 0) / posO.length : 0; // Avg Capital
  let G16 = null;                                                           // Date of Peak
  if (active && months.length) {
    let best = months[0];
    for (const r of months) if (r.O > best.O) best = r;
    G16 = best.end;
  }
  let G18 = null;                                                           // First Reimbursement Date
  if (active && !cash) {
    let t = Infinity;
    if (G6 > 0 && G17 != null) t = Math.min(t, G17);
    for (const r of drawRows) if (r.reimb > 0 && r.reimbDate != null) t = Math.min(t, r.reimbDate);
    G18 = t === Infinity ? null : t;
  }
  const G20 = active ? netSalePrice - (land + constr) - G7 - G11 - G12 : 0; // Profit Before Tax
  const G21 = (active && sale > 0) ? G20 / sale : 0;                        // Margin %
  const G22 = (active && saleCostPct < 1)
    ? (land + constr + G7 + G11 + G12) / (1 - saleCostPct) : 0;             // Break-even Price
  const G23 = G13 > 0 ? G20 / G13 : 0;                                      // ROI Peak
  const G24 = G14 > 0 ? G20 / G14 : 0;                                      // ROI After Land Reimb
  const G25 = G15 > 0 ? G20 / G15 : 0;                                      // ROI Avg Capital
  const G26 = basis === 'Peak Cash' ? G23
    : basis === 'After Land Reimbursement' ? G24 : G25;                     // Headline ROI
  const G27 = G19 > 0 ? G26 * 12 / G19 : 0;                                 // Annualized ROI

  // Sensibilidade (I4:L9 — juros mantidos no cenário base)
  const sensitivity = [-0.10, -0.05, 0, 0.05, 0.10].map((s) => {
    const price = sale * (1 + s);
    const profit = active ? price * (1 - saleCostPct) - (land + constr) - G7 - G11 - G12 : 0;
    const roi = basis === 'Peak Cash' ? (G13 > 0 ? profit / G13 : 0)
      : basis === 'After Land Reimbursement' ? (G14 > 0 ? profit / G14 : 0)
      : (G15 > 0 ? profit / G15 : 0);
    return { scenario: s, price, profit, roi };
  });

  // Verificações (C44:D45)
  const drawPctCheck = drawRows.reduce((s, r) => s + (r.isOn ? r.pct : 0), 0);
  const budgetCheck = drawRows.reduce((s, r) => s + r.amount, 0) - constr;

  return {
    active, cash, resolved: {
      ltc, landAdvPct, reimbPct, reimbDelayDays, rate, origPct, docsFee, uwPct,
      appraisal, insurance, saleCostPct, holdCost, numDraws, basis,
    },
    totalProjectCost: G4, maxLoan: G5, landAdvance: G6, loanFees: G7,
    initialCashAtClosing: G8, capacityLeft: G9, maxReimbPct: G10,
    totalInterest: G11, totalHolding: G12, peakExposure: G13,
    peakAfterLandReimb: G14, avgCapital: G15, peakDate: G16,
    landAdvReceiptDate: G17, firstReimbDate: G18, holdingMonths: G19,
    profit: G20, margin: G21, breakEven: G22, roiPeak: G23,
    roiAfterLandReimb: G24, roiAvgCapital: G25, headlineROI: G26,
    annualizedROI: G27, loanFeeBasis: G28,
    drawRows, months, sensitivity, drawPctCheck, budgetCheck,
  };
}

/* ===== Master Cashflow (consolidado) ===== */
function computeMaster(deals, params) {
  const P = Object.assign({}, DEFAULT_PARAMS, params || {});
  const activeDeals = deals.filter((d) => d.status === 'Active' && d.closing && d.saleDate);
  const results = deals.map((d) => computeDeal(d, P));

  if (!activeDeals.length) {
    return { start: null, end: null, months: [], results, params: P };
  }
  const start = Math.min(...activeDeals.map((d) => parseDate(d.closing)));
  const end = Math.max(...activeDeals.map((d) => parseDate(d.saleDate)));
  const nMonths = Math.min(MAX_MONTHS, datedifM(firstOfMonth(start), end) + 1);

  // indexa o net mensal de cada deal pelo mês-calendário do início do período
  const keyed = results.map((r) => {
    const map = new Map();
    for (const row of r.months) {
      const D = new Date(row.start);
      map.set(D.getUTCFullYear() * 12 + D.getUTCMonth(), row.L);
    }
    return map;
  });

  const months = [];
  let bal = P.startingCash;
  for (let m = 1; m <= nMonths; m++) {
    const mStart = edate(firstOfMonth(start), m - 1);
    const D = new Date(mStart);
    const key = D.getUTCFullYear() * 12 + D.getUTCMonth();
    const perDeal = keyed.map((map) => map.get(key) || 0);
    const net = perDeal.reduce((s, v) => s + v, 0);
    bal += net;
    months.push({
      m, start: mStart, end: Math.min(eomonth(mStart), end),
      perDeal, net, balance: bal,
      exposure: Math.max(0, P.startingCash - bal),
    });
  }
  return { start, end, months, results, params: P };
}

/* ===== Dashboard (com as somas nas colunas certas) ===== */
function computeDashboard(deals, params) {
  const master = computeMaster(deals, params);
  const R = master.results;
  const sum = (f) => R.reduce((s, r) => s + f(r), 0);
  const totalProfit = sum((r) => r.profit);
  const peakExposure = master.months.reduce((s, r) => Math.max(s, r.exposure), 0);
  const lowestBalance = master.months.length
    ? Math.min(...master.months.map((r) => r.balance)) : master.params.startingCash;
  const sumPeakAfterLand = sum((r) => r.peakAfterLandReimb);
  return {
    master,
    startingCash: master.params.startingCash,
    activeDeals: deals.filter((d) => d.status === 'Active').length,
    totalProjectCost: sum((r) => r.totalProjectCost),
    totalLoanCapacity: sum((r) => r.maxLoan),
    peakExposure, lowestBalance,
    totalInterest: sum((r) => r.totalInterest),
    totalHolding: sum((r) => r.totalHolding),
    totalProfit,
    roiPeak: peakExposure > 0 ? totalProfit / peakExposure : 0,
    roiAfterLandReimb: sumPeakAfterLand > 0 ? totalProfit / sumPeakAfterLand : 0,
  };
}

const Model = {
  DEFAULT_PARAMS, MAX_MONTHS,
  parseDate, isoDate, edate, eomonth, firstOfMonth, addDays, datedifM,
  computeDeal, computeMaster, computeDashboard,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Model;
else global.Model = Model;
})(typeof window !== 'undefined' ? window : globalThis);
