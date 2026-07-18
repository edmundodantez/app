/*
 * Dados iniciais: os 10 deals de Edmundo_Cashflow.xlsx, extraídos da planilha.
 * Campos com null usam o default global (equivalente às células ligadas à aba Parameters).
 */
(function (global) {
'use strict';

const D = (over) => Object.assign({
  name: '', status: 'Inactive',
  closing: null, constrStart: null, saleDate: null,
  land: 0, constr: 0, sale: 0,
  ltc: null, landAdvPct: null, reimbPct: null, reimbDelayDays: null,
  rate: null, origPct: null, docsFee: null, uwPct: null, appraisal: null,
  insurance: null, saleCostPct: null,
  numDraws: 7, financing: 'Construction Loan',
  advTiming: 'At Closing', advDelayMo: 0, holdCost: 0,
  basis: 'After Land Reimbursement',
  draws: [],
}, over);

const SEED_DEALS = [
  D({
    id: 'goodrich', name: '1780 Goodrich Ave', status: 'Inactive',
    closing: '2026-07-30', constrStart: '2026-08-15', saleDate: '2027-12-01',
    land: 625000, constr: 540000, sale: 1650000, reimbDelayDays: 30,
    draws: [
      {}, { dateOverride: '2026-08-30' }, { dateOverride: '2026-09-30' },
      { dateOverride: '2026-10-30' }, { dateOverride: '2026-11-30' },
      { dateOverride: '2026-12-30' }, { dateOverride: '2027-02-28' },
    ],
  }),
  D({
    id: 'sw50th', name: '15280 SW 50TH AVENUE RD', status: 'Active',
    closing: '2026-04-01', constrStart: '2026-04-01', saleDate: '2026-09-01',
    land: 45000, constr: 210000, sale: 310000, numDraws: 5,
    draws: [
      { pct: 0.15, offset: 0 }, { pct: 0.25, offset: 0 }, { pct: 0.20, offset: 1 },
      { pct: 0.20, offset: 1.5, dateOverride: '2026-05-16' },
      { pct: 0.20, offset: 7, dateOverride: '2026-06-15' },
    ],
  }),
  D({
    id: 'caladium', name: '216 CALADIUM', status: 'Active',
    closing: '2026-05-15', constrStart: '2026-06-10', saleDate: '2027-09-01',
    land: 130000, constr: 370000, sale: 560000,
  }),
  D({
    id: 'bradenton', name: 'BRADENTON', status: 'Active',
    closing: '2026-06-01', constrStart: '2026-06-01', saleDate: '2026-12-01',
    land: 0, constr: 308588, sale: 391992, numDraws: 5, financing: 'Cash',
    draws: [
      { amountOverride: 203288 },
      { dateOverride: '2026-07-01', amountOverride: 26325 },
      { dateOverride: '2026-08-01', amountOverride: 26325 },
      { dateOverride: '2026-09-01', amountOverride: 26325 },
      { dateOverride: '2026-10-01', amountOverride: 26325 },
    ],
  }),
  D({
    id: 'pine', name: '313 PINE ST', status: 'Active',
    closing: '2026-06-30', constrStart: '2026-07-15', saleDate: '2027-06-01',
    land: 80000, constr: 264000, sale: 440000, advTiming: 'Delayed', advDelayMo: 0,
  }),
  D({
    id: 'deal06', name: 'Deal06', status: 'Active',
    closing: '2026-07-14', constrStart: '2026-07-30', saleDate: '2027-12-01',
    land: 950000, constr: 1650000, sale: 4200000, advDelayMo: 4,
  }),
  D({
    id: 'deal07', name: 'Deal07', status: 'Active',
    closing: '2026-06-30', constrStart: '2026-07-30', saleDate: '2027-12-01',
    land: 145000, constr: 370000, sale: 750000,
  }),
  D({ id: 'deal08', name: 'Deal08', status: 'Inactive' }),
  D({
    id: 'deal09', name: 'Deal09', status: 'Active',
    closing: '2026-07-15', constrStart: '2026-07-20', saleDate: '2027-07-20',
    land: 350000, constr: 576000, sale: 1300000, financing: 'Cash', advDelayMo: 4,
  }),
  D({
    id: 'deal10', name: 'Deal10', status: 'Active',
    closing: '2023-10-16', constrStart: '2023-11-01', saleDate: '2026-06-16',
    land: 400000, constr: 395000, sale: 1300000, financing: 'Cash',
  }),
];

const Seed = { SEED_DEALS, makeDeal: D };
if (typeof module !== 'undefined' && module.exports) module.exports = Seed;
else global.Seed = Seed;
})(typeof window !== 'undefined' ? window : globalThis);
