/*
 * Valida o motor (model.js) contra os valores calculados pela planilha
 * Edmundo_Cashflow.xlsx (cache do Excel, lido via openpyxl).
 * Rodar: node test/model.test.js
 */
'use strict';
const Model = require('../model.js');
const { SEED_DEALS } = require('../seed.js');

// Valores esperados: aba Dashboard (colunas corretas) + células G das abas de deal
const EXPECTED = {
  'sw50th':    { cost: 255000, maxLoan: 216750, peak: 55009.45313, peakALR: 55009.45313, avg: 43699.70313, interest: 8206.484375, profit: 11769.76563, roiPeak: 0.2139589644, annual: 0.4279179289 },
  'caladium':  { cost: 500000, maxLoan: 425000, peak: 123119.375, peakALR: 123119.375, avg: 85355.92831, interest: 35720.41667, profit: -36195.41667, roiPeak: -0.2939863581, annual: -0.2075197822 },
  'bradenton': { cost: 308588, maxLoan: 0, peak: 308588, peakALR: 308588, avg: 264713, interest: 0, profit: 52044.64, roiPeak: 0.1686541278, annual: 0.289121362 },
  'pine':      { cost: 344000, maxLoan: 292400, peak: 76888.125, peakALR: 76888.125, avg: 52103.24653, interest: 15338.04167, profit: 33257.95833, roiPeak: 0.4325499982, annual: 0.3992769215 },
  'deal06':    { cost: 2600000, maxLoan: 2210000, peak: 818389.8438, peakALR: 818389.8438, avg: 619436.106, interest: 209223.4375, profit: 992376.5625, roiPeak: 1.212596381, annual: 0.8083975871 },
  'deal07':    { cost: 515000, maxLoan: 437750, peak: 156632.4479, peakALR: 156632.4479, avg: 116064.0061, interest: 41097.94271, profit: 117893.3073, roiPeak: 0.7526748695, annual: 0.4753736018 },
  'deal09':    { cost: 926000, maxLoan: 0, peak: 926000, peakALR: 926000, avg: 635600, interest: 0, profit: 270000, roiPeak: 0.2915766739, annual: 0.269147699 },
  'deal10':    { cost: 795000, maxLoan: 0, peak: 795000, peakALR: 795000, avg: 707976.5625, interest: 0, profit: 401000, roiPeak: 0.5044025157, annual: 0.1834190966 },
  'goodrich':  { cost: 0, maxLoan: 0, peak: 0, peakALR: 0, avg: 0, interest: 0, profit: 0, roiPeak: 0, annual: 0 },
  'deal08':    { cost: 0, maxLoan: 0, peak: 0, peakALR: 0, avg: 0, interest: 0, profit: 0, roiPeak: 0, annual: 0 },
};

// Portfólio (Dashboard B10/B11 + Master Cashflow)
const EXPECTED_PORTFOLIO = {
  peakExposure: 1452338.969,     // MAX('Master Cashflow'!P8:P67)
  lowestBalance: -852338.9694,   // MIN('Master Cashflow'!O8:O67)
  timelineStart: '2023-10-01',
  timelineEnd: '2027-12-01',
  totalProjectCost: 6243588,
  totalLoanCapacity: 3581900,
  totalInterest: 309586.3229,
  totalProfit: 1842146.817,      // soma dos lucros (Dashboard soma a coluna errada; aqui, a certa)
};

let fails = 0;
function check(label, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${got}, want ${want}`); }
  return ok;
}

for (const deal of SEED_DEALS) {
  const e = EXPECTED[deal.id];
  const r = Model.computeDeal(deal, Model.DEFAULT_PARAMS);
  check(`${deal.id}.cost`, r.totalProjectCost, e.cost);
  check(`${deal.id}.maxLoan`, r.maxLoan, e.maxLoan);
  check(`${deal.id}.peak`, r.peakExposure, e.peak);
  check(`${deal.id}.peakALR`, r.peakAfterLandReimb, e.peakALR);
  check(`${deal.id}.avg`, r.avgCapital, e.avg);
  check(`${deal.id}.interest`, r.totalInterest, e.interest);
  check(`${deal.id}.profit`, r.profit, e.profit);
  check(`${deal.id}.roiPeak`, r.roiPeak, e.roiPeak, 1e-6);
  check(`${deal.id}.annual`, r.annualizedROI, e.annual, 1e-6);
}

const dash = Model.computeDashboard(SEED_DEALS, Model.DEFAULT_PARAMS);
check('portfolio.peakExposure', dash.peakExposure, EXPECTED_PORTFOLIO.peakExposure);
check('portfolio.lowestBalance', dash.lowestBalance, EXPECTED_PORTFOLIO.lowestBalance);
check('portfolio.totalProjectCost', dash.totalProjectCost, EXPECTED_PORTFOLIO.totalProjectCost);
check('portfolio.totalLoanCapacity', dash.totalLoanCapacity, EXPECTED_PORTFOLIO.totalLoanCapacity);
check('portfolio.totalInterest', dash.totalInterest, EXPECTED_PORTFOLIO.totalInterest);
check('portfolio.totalProfit', dash.totalProfit, EXPECTED_PORTFOLIO.totalProfit);
if (Model.isoDate(dash.master.months[0].start) !== EXPECTED_PORTFOLIO.timelineStart) {
  fails++; console.log('FAIL timelineStart:', Model.isoDate(dash.master.months[0].start));
}
const lastMonth = dash.master.months[dash.master.months.length - 1];
if (Model.isoDate(lastMonth.end) !== EXPECTED_PORTFOLIO.timelineEnd) {
  fails++; console.log('FAIL timelineEnd:', Model.isoDate(lastMonth.end));
}

// Sanidade extra: mês 1 do Master deve ser -400.000 (terreno do Deal10), como na planilha
check('master.month1.net', dash.master.months[0].net, -400000);
check('master.month2.net', dash.master.months[1].net, -19750);

console.log(fails === 0 ? `OK — todos os testes passaram (${SEED_DEALS.length} deals + portfólio)` : `${fails} teste(s) falharam`);
process.exit(fails ? 1 : 0);
