/*
 * Testa o modelo de investidores (investors.js) com valores conferidos à mão
 * e a geração dos PDFs de oferta e extrato (reports.js + pdfgen.js).
 * Rodar: node test/investors.test.js
 */
'use strict';
const Inv = require('../investors.js');
const Reports = require('../reports.js');
const Pdf = require('../pdfgen.js');

let fails = 0;
const check = (label, ok) => { if (!ok) { fails++; console.log('FAIL ' + label); } };
const near = (label, a, b, tol = 0.005) => check(`${label}: ${a} ≠ ${b}`, Math.abs(a - b) <= tol);

/* ---- XIRR ---- */
near('xirr 10%', Inv.xirr([{ t: Date.UTC(2026, 0, 1), v: -100 }, { t: Date.UTC(2027, 0, 1), v: 110 }]), 0.10, 1e-6);
check('xirr sem entrada', Inv.xirr([{ t: 0, v: -100 }, { t: 1e10, v: -5 }]) === null);

/* ---- imóvel ---- */
const prop = Inv.makeProperty({
  id: 'p1', name: '216 Caladium', city: 'Ocala', clientId: 'c1',
  estSalePrice: 300000, saleCostPct: 0.08, estSaleDate: '2027-01-01',
  payments: [
    { id: 'a', kind: 'land', desc: 'Land', amount: 100000, dueDate: '2026-01-01', paidDate: '2026-01-01' },
    { id: 'b', kind: 'draw', desc: 'Draw 1', amount: 50000, dueDate: '2026-03-01', paidDate: '2026-03-05' },
    { id: 'c', kind: 'draw', desc: 'Draw 2', amount: 50000, dueDate: '2026-05-01', paidDate: null },
  ],
});
let r = Inv.computeProperty(prop, '2026-06-01');
near('custo total', r.totalCost, 200000);
near('pago', r.paid, 150000);
near('a pagar', r.pending, 50000);
near('atrasado', r.overdueAmount, 50000);
near('venda líquida', r.netSale, 276000);
near('lucro estimado', r.profit, 76000);
near('roi', r.roi, 0.38, 1e-9);
check('status em andamento', r.status === 'active');
check('anualizado plausível', r.annualized > 0.38 && r.annualized < 0.7);
r = Inv.computeProperty(prop, '2026-04-01');
near('nada atrasado antes do vencimento', r.overdueAmount, 0);
check('próximo vencimento', r.nextDue && r.nextDue.id === 'c');

const sold = Object.assign({}, prop, { soldPrice: 320000, soldDate: '2026-12-01' });
r = Inv.computeProperty(sold, '2027-02-01');
check('status vendido', r.status === 'sold');
near('lucro realizado', r.profit, 320000 * 0.92 - 200000);

const avail = Inv.makeProperty({ id: 'p2', name: 'Pine St', city: 'Bradenton', estSalePrice: 440000,
  payments: Inv.buildSchedule({ land: 80000, constr: 264000, draws: 7, landDate: '2026-06-30', startIso: '2026-07-31' }) });
r = Inv.computeProperty(avail, '2026-06-01');
check('disponível', r.status === 'available');
near('cronograma soma o orçamento', r.totalCost, 344000);
check('8 parcelas', avail.payments.length === 8);
check('dia 31 cai no fim do mês curto', avail.payments[3].dueDate === '2026-09-30');
near('draws somam a obra', r.constrCost, 264000);

/* ---- plano do investimento (terreno + sq ft × $/sq ft + outros) ---- */
const planned = Inv.makeProperty({ id: 'p3', name: 'Plan', landPrice: 80000, sqft: 1650, constrPerSqft: 160, otherCosts: 5000,
  estSalePrice: 440000, saleCostPct: 0.08, landDate: '2026-06-30', constrStart: '2026-07-15', numDraws: 7 });
r = Inv.computeProperty(planned, '2026-06-01');
near('plano: construção = sq ft × preço', r.constrCost, 264000);
near('plano: investimento total', r.totalCost, 349000);
near('plano: lucro', r.profit, 440000 * 0.92 - 349000);
check('plano: sem cronograma', !r.hasSchedule && r.status === 'available' && r.scheduleDiff === 0);
near('plano: venda por sq ft', r.salePerSqft, 440000 / 1650, 0.01);
check('plano: casa com cliente pelo custo planejado', Inv.propertyMatchesClient(planned, Inv.makeClient({ budgetMax: 350000 }))
  && !Inv.propertyMatchesClient(planned, Inv.makeClient({ budgetMax: 340000 })));
near('plano: orçamento fixo vale mais que sq ft', Inv.computeProperty(Object.assign({}, planned, { constrBudget: 300000 })).constrCost, 300000);
const STD = [[0.05, 0], [0.15, 4], [0.15, 5], [0.20, 6], [0.20, 7], [0.15, 8], [0.10, 9]].map(([pct, offset], i) => ({ desc: 'Etapa ' + (i + 1), pct, offset }));
let sched = Inv.planSchedule(planned, STD);
check('cronograma: terreno + outros + 7 draws', sched.length === 9 && sched[0].kind === 'land' && sched[1].kind === 'other');
near('cronograma: soma o plano', sched.reduce((s, x) => s + x.amount, 0), 349000);
check('cronograma: usa etapas padrão', sched[2].desc === 'Etapa 1' && sched[2].amount === 13200 && sched[3].dueDate === '2026-11-15');
r = Inv.computeProperty(Object.assign({}, planned, { payments: sched }), '2026-06-01');
check('cronograma: bate com o plano e calcula anualizado', r.hasSchedule && r.scheduleDiff === 0 && r.annualized == null);
sched = Inv.planSchedule(Object.assign({}, planned, { numDraws: 4 }), STD);
check('cronograma: outro nº de draws → iguais por mês', sched.filter((x) => x.kind === 'draw').length === 4
  && sched[2].amount === 66000 && sched[5].dueDate === '2026-10-15');
r = Inv.computeProperty(Object.assign({}, planned, { payments: sched, landPrice: 90000 }), '2026-06-01');
near('cronograma diferente do plano é sinalizado', r.scheduleDiff, -10000);

/* ---- empréstimo com amortização ---- */
const loan = Inv.makeLoan({ id: 'l1', clientId: 'c2', label: 'Loan A', rate: 0.12, entries: [
  { id: 'e2', date: '2026-04-01', type: 'principal', amount: 40000 },
  { id: 'e1', date: '2026-01-01', type: 'advance', amount: 100000 },
  { id: 'e3', date: '2026-04-01', type: 'interest', amount: 2000 },
  { id: 'e4', date: '2026-12-01', type: 'principal', amount: 60000 },
] });
let lr = Inv.computeLoan(loan, '2026-07-01');
near('principal em aberto', lr.principal, 60000);
near('juros acumulados', lr.interestAccrued, 100000 * 0.12 * 90 / 365 + 60000 * 0.12 * 91 / 365);
near('juros pagos', lr.interestPaid, 2000);
near('juros a pagar', lr.interestDue, 4753.97 - 2000, 0.01);
near('total devido', lr.totalOwed, 60000 + 2753.97, 0.01);
near('juros mensais', lr.monthlyInterest, 600);
check('lançamento futuro fora do saldo', lr.futureEntries === 1 && lr.rows.length === 3);
near('saldo após amortização', lr.rows[1].balance, 60000);
lr = Inv.computeLoan(loan, '2026-12-31');
near('quitado', lr.principal, 0);
near('juros param com principal zero',
  lr.interestAccrued, 100000 * 0.12 * 90 / 365 + 60000 * 0.12 * 244 / 365, 0.01);
near('empréstimo vazio', Inv.computeLoan(Inv.makeLoan(), '2026-07-01').totalOwed, 0);

/* ---- casamento e resumos ---- */
const investor = Inv.makeClient({ id: 'c1', name: 'Ana Souza', kind: 'investor', lang: 'pt', budgetMax: 350000, location: 'Bradenton, Sarasota' });
const lender = Inv.makeClient({ id: 'c2', name: 'John Lender', kind: 'lender', lang: 'en' });
check('casa por orçamento e cidade', Inv.propertyMatchesClient(avail, investor));
check('orçamento baixo não casa', !Inv.propertyMatchesClient(avail, Object.assign({}, investor, { budgetMax: 300000 })));
check('cidade errada não casa', !Inv.propertyMatchesClient(avail, Object.assign({}, investor, { location: 'Miami' })));
check('imóvel com cliente não casa', !Inv.propertyMatchesClient(prop, investor));

const S = Inv.clientSummary(investor, [prop, avail], [loan], '2026-06-01');
check('resumo: 1 imóvel, 0 empréstimos', S.props.length === 1 && S.loans.length === 0);
near('resumo: pago', S.paid, 150000);
const O = Inv.overview([prop, avail, sold], [investor, lender], [loan], '2026-07-01');
check('visão geral', O.available === 1 && O.active === 1 && O.sold === 1 && O.investors === 1 && O.lenders === 1);
near('visão geral: principal', O.principal, 60000);

/* ---- PDFs ---- */
const profile = { company: 'Dantez Homes', contact: '(555) 010-0100' };
const docs = {
  oferta: Reports.propertyDoc(Object.assign({}, avail, { description: 'Casa nova de 3 quartos. '.repeat(20), beds: 3, baths: 2, sqft: 1650, lotSize: '0.25 acre' }), 'en', profile),
  ofertaPlano: Reports.propertyDoc(planned, 'pt', profile),
  disponiveis: Reports.availableDoc([prop, avail], 'pt', profile),
  extratoPt: Reports.statementDoc(investor, [prop, sold, avail], [loan], profile, '2026-06-01'),
  extratoEn: Reports.statementDoc(lender, [prop], [Object.assign({}, loan, {
    entries: Array.from({ length: 70 }, (_, i) => ({ id: 'x' + i, date: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}`, type: i ? 'principal' : 'advance', amount: i ? 100 : 100000 })) })], profile, '2026-07-01'),
};
docs.emprestimoEn = Reports.loanDoc(lender, loan, profile, '2026-07-01');
docs.emprestimoPt = Reports.loanDoc(Object.assign({}, lender, { lang: 'pt' }), loan, profile, '2026-07-01');
check('extrato do empréstimo: título e credor', docs.emprestimoEn.title === 'Loan A'
  && docs.emprestimoEn.blocks[0].rows[0][1] === 'John Lender');
check('extrato do empréstimo: total devido', docs.emprestimoEn.blocks[1].tiles[3][1] === '$62,753.97');
check('extrato do empréstimo: só lançamentos até a data',
  docs.emprestimoEn.blocks.find((b) => b.type === 'table').rows.length === 3);
check('extrato do empréstimo em português', /Extrato do empréstimo/.test(docs.emprestimoPt.subtitle));
const outDir = process.argv[2];
for (const [name, doc] of Object.entries(docs)) {
  const bytes = Pdf.reportPdf(doc);
  const txt = Buffer.from(bytes).toString('latin1');
  check(`${name}: cabeçalho`, txt.startsWith('%PDF-1.4'));
  check(`${name}: EOF`, txt.trimEnd().endsWith('%%EOF'));
  const xref = +/startxref\n(\d+)/.exec(txt)[1];
  check(`${name}: xref`, txt.slice(xref, xref + 4) === 'xref');
  const offs = [...txt.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => +m[1]);
  check(`${name}: offsets`, offs.every((o, i) => txt.slice(o).startsWith(`${i + 1} 0 obj`)));
  if (outDir) require('fs').writeFileSync(`${outDir}/${name}.pdf`, bytes);
}
check('extrato longo pagina', (Buffer.from(Pdf.reportPdf(docs.extratoEn)).toString('latin1').match(/\/Type \/Page /g) || []).length >= 2);
check('extrato em português', docs.extratoPt.blocks.some((b) => b.text === 'Imóveis'));
check('extrato em inglês', docs.extratoEn.blocks.some((b) => b.text === 'Loans'));
check('extrato não mistura clientes', !docs.extratoEn.blocks.some((b) => b.text === '216 Caladium'));

console.log(fails ? `${fails} falha(s)` : 'OK — investidores, empréstimos e PDFs');
process.exit(fails ? 1 : 0);
