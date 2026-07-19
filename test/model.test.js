/*
 * Valida o motor (model.js) contra os valores calculados pelo Excel.
 * Ground truth:
 *  - Single_Deal_Analyzer2.xlsx (modelo novo): deal de exemplo com Construction
 *    Loan — exercita land advance, draws, fee all-in 5%, juros e draw float.
 *  - Edmundo_Cashflow.xlsx (modelo antigo): deals em Cash, cujos números não
 *    dependem da lógica de fees/reembolso que mudou entre as versões.
 * Rodar: node test/model.test.js
 */
'use strict';
const Model = require('../model.js');
const { SEED_DEALS, makeDeal } = require('../seed.js');

let fails = 0;
function check(label, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${got}, want ${want}`); }
  return ok;
}
function checkDate(label, got, want) {
  if (Model.isoDate(got) !== want) { fails++; console.log(`FAIL ${label}: got ${Model.isoDate(got)}, want ${want}`); }
}

/* ===== 1) Deal de exemplo da Single_Deal_Analyzer2 (Construction Loan) ===== */
const exampleDeal = makeDeal({
  id: 'example', name: '313 PINE ST (exemplo)', status: 'Active',
  closing: '2026-07-15', constrStart: '2026-07-20', saleDate: '2027-07-20',
  land: 350000, constr: 576000, sale: 1300000, advDelayMo: 4,
});
const ex = Model.computeDeal(exampleDeal, Model.DEFAULT_PARAMS);
check('exemplo.cost (G4)', ex.totalProjectCost, 926000);
check('exemplo.maxLoan (G5)', ex.maxLoan, 787100);
check('exemplo.landAdvance (G6)', ex.landAdvance, 210000);
check('exemplo.loanFees (G7)', ex.loanFees, 40800);
check('exemplo.initialCash (G8)', ex.initialCashAtClosing, 180800);
check('exemplo.capacityLeft (G9)', ex.capacityLeft, 577100);
check('exemplo.maxReimbPct (G10)', ex.maxReimbPct, 1.001909722, 1e-6);
check('exemplo.interest (G11)', ex.totalInterest, 44432.375);
check('exemplo.peak (G13)', ex.peakExposure, 312691.625);
check('exemplo.peakALR (G14)', ex.peakAfterLandReimb, 312691.625);
check('exemplo.avgCapital (G15)', ex.avgCapital, 243831.25);
checkDate('exemplo.landAdvReceipt (G17)', ex.landAdvReceiptDate, '2026-07-15');
checkDate('exemplo.firstReimb (G18)', ex.firstReimbDate, '2026-07-15');
check('exemplo.holdingMonths (G19)', ex.holdingMonths, 13);
check('exemplo.profit (G20)', ex.profit, 184767.625);
check('exemplo.margin (G21)', ex.margin, 0.1421289423, 1e-6);
check('exemplo.breakEven (G22)', ex.breakEven, 1099165.625);
check('exemplo.roiPeak (G23)', ex.roiPeak, 0.5908940638, 1e-6);
check('exemplo.annualized (G27)', ex.annualizedROI, 0.5454406742, 1e-6);
check('exemplo.loanFeeBasis (G28)', ex.loanFeeBasis, 786000);
check('exemplo.peakWithFloat (G30)', ex.peakWithFloat, 312691.625);
check('exemplo.sens-10.profit (K5)', ex.sensitivity[0].profit, 65167.625);
check('exemplo.sens-10.roi (L5)', ex.sensitivity[0].roi, 0.2084086038, 1e-6);
check('exemplo.sens+10.profit (K9)', ex.sensitivity[4].profit, 304367.625);
check('exemplo.sens+10.roi (L9)', ex.sensitivity[4].roi, 0.9733795237, 1e-6);

/* ===== 2) Deals em Cash (valores do Edmundo_Cashflow.xlsx — sem fees/juros) ===== */
const CASH_EXPECTED = {
  'bradenton': { cost: 308588, peak: 308588, avg: 264713, profit: 52044.64, roiPeak: 0.1686541278, annual: 0.289121362 },
  'deal09':    { cost: 926000, peak: 926000, avg: 635600, profit: 270000, roiPeak: 0.2915766739, annual: 0.269147699 },
  'deal10':    { cost: 795000, peak: 795000, avg: 707976.5625, profit: 401000, roiPeak: 0.5044025157, annual: 0.1834190966 },
};
for (const deal of SEED_DEALS) {
  const e = CASH_EXPECTED[deal.id];
  if (!e) continue;
  const r = Model.computeDeal(deal, Model.DEFAULT_PARAMS);
  check(`${deal.id}.cost`, r.totalProjectCost, e.cost);
  check(`${deal.id}.peak`, r.peakExposure, e.peak);
  check(`${deal.id}.avg`, r.avgCapital, e.avg);
  check(`${deal.id}.interest`, r.totalInterest, 0);
  check(`${deal.id}.profit`, r.profit, e.profit);
  check(`${deal.id}.roiPeak`, r.roiPeak, e.roiPeak, 1e-6);
  check(`${deal.id}.annual`, r.annualizedROI, e.annual, 1e-6);
}

/* ===== 3) Deals inativos zeram tudo ===== */
for (const id of ['goodrich', 'deal08']) {
  const r = Model.computeDeal(SEED_DEALS.find((d) => d.id === id), Model.DEFAULT_PARAMS);
  check(`${id}.cost`, r.totalProjectCost, 0);
  check(`${id}.profit`, r.profit, 0);
  check(`${id}.peak`, r.peakExposure, 0);
}

/* ===== 4) Invariantes do portfólio ===== */
const dash = Model.computeDashboard(SEED_DEALS, Model.DEFAULT_PARAMS);
const months = dash.master.months;
checkDate('portfolio.timelineStart', months[0].start, '2023-10-01');
checkDate('portfolio.timelineEnd', months[months.length - 1].end, '2027-12-01');
// mês 1 e 2 vêm do Deal10 (cash): terreno 400k e draw 1 (5% de 395k)
check('master.month1.net', months[0].net, -400000);
check('master.month2.net', months[1].net, -19750);
// tudo liquida dentro da janela: saldo final = caixa inicial + lucro total
check('master.finalBalance = startingCash + totalProfit',
  months[months.length - 1].balance, dash.startingCash + dash.totalProfit);
// exposição do pior mês bate com o menor saldo
check('portfolio.peakExposure = startingCash - lowestBalance',
  dash.peakExposure, dash.startingCash - dash.lowestBalance);

console.log(fails === 0
  ? 'OK — todos os testes passaram (exemplo do modelo novo + deals cash + invariantes)'
  : `${fails} teste(s) falharam`);
process.exit(fails ? 1 : 0);
