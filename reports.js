/*
 * Documentos para investidores (entrada do Pdf.reportPdf), em inglês ou
 * português conforme o idioma do cliente:
 *  - propertyDoc:   oferta de um imóvel
 *  - availableDoc:  lista dos imóveis disponíveis
 *  - statementDoc:  extrato do cliente (imóveis, pagamentos, retorno, empréstimos)
 * Funções puras: navegador (window.Reports) e Node (module.exports).
 */
(function (global) {
'use strict';
const Inv = (typeof module !== 'undefined' && module.exports) ? require('./investors.js') : global.Investors;

const T = {
  en: {
    locale: 'en-US',
    opportunity: 'Investment opportunity', available: 'Available investments', statement: 'Investor statement',
    generated: 'generated on', asOf: 'as of',
    location: 'Location', details: 'Details', builder: 'Builder', beds: 'bed', baths: 'bath', sqft: 'sq ft',
    estSaleDate: 'Estimated sale date', saleDate: 'Sale date', purchaseDate: 'Purchase date',
    investment: 'Investment summary', totalInvestment: 'Total investment', estSalePrice: 'Estimated sale price',
    salePrice: 'Sale price', estProfit: 'Estimated net profit', profit: 'Net profit', estRoi: 'Estimated return',
    roi: 'Return', land: 'Land', construction: 'Construction', other: 'Other costs',
    saleCosts: 'Selling costs', netProceeds: 'Net sale proceeds', estNetProceeds: 'Estimated net sale proceeds',
    annualized: 'Annualized return', estAnnualized: 'Estimated annualized return', holding: 'Holding period',
    months: 'months', schedule: 'Payment schedule', payments: 'Payments', description: 'Description',
    type: 'Type', due: 'Due', paidOn: 'Paid on', amount: 'Amount', status: 'Status',
    paid: 'Paid', pending: 'Pending', overdue: 'Overdue',
    kind: { land: 'Land', draw: 'Construction draw', other: 'Other' },
    property: 'Property', city: 'City', properties: 'Properties', noAvailable: 'No properties available at the moment.',
    committed: 'Total commitment', paidToDate: 'Paid to date', remaining: 'Remaining',
    propStatus: { available: 'Available', active: 'In progress', sold: 'Sold' },
    realized: 'Realized net profit',
    loans: 'Loans', loan: 'Loan', lender: 'Lender', startDate: 'Start date', loanStatement: 'Loan statement',
    loanSummary: 'Position', transactions: 'Transactions', rate: 'Interest rate', perYear: 'per year',
    advanced: 'Total advanced', repaid: 'Principal repaid', principal: 'Principal outstanding',
    interestAccrued: 'Interest accrued to date', interestPaid: 'Interest paid', interestDue: 'Interest due',
    totalOwed: 'Total owed', date: 'Date', balance: 'Principal balance', note: 'Note',
    entry: { advance: 'Funds advanced', principal: 'Principal repayment', interest: 'Interest payment' },
    noEntries: 'No transactions yet.', noPayments: 'No payments scheduled.',
    interestBasis: 'Simple interest on the outstanding principal, accrued daily (365-day year).',
    disclaimer: 'Projected sale prices, profits and returns are estimates based on current assumptions and are not a guarantee of future results.',
    contact: 'Contact',
  },
  pt: {
    locale: 'pt-BR',
    opportunity: 'Oportunidade de investimento', available: 'Investimentos disponíveis', statement: 'Extrato do investidor',
    generated: 'gerado em', asOf: 'posição em',
    location: 'Localização', details: 'Detalhes', builder: 'Construtor', beds: 'quartos', baths: 'banheiros', sqft: 'sq ft',
    estSaleDate: 'Data estimada de venda', saleDate: 'Data da venda', purchaseDate: 'Data da compra',
    investment: 'Resumo do investimento', totalInvestment: 'Investimento total', estSalePrice: 'Preço de venda estimado',
    salePrice: 'Preço de venda', estProfit: 'Lucro líquido estimado', profit: 'Lucro líquido', estRoi: 'Retorno estimado',
    roi: 'Retorno', land: 'Terreno', construction: 'Construção', other: 'Outros custos',
    saleCosts: 'Custos de venda', netProceeds: 'Venda líquida', estNetProceeds: 'Venda líquida estimada',
    annualized: 'Retorno anualizado', estAnnualized: 'Retorno anualizado estimado', holding: 'Prazo do investimento',
    months: 'meses', schedule: 'Cronograma de pagamentos', payments: 'Pagamentos', description: 'Descrição',
    type: 'Tipo', due: 'Vencimento', paidOn: 'Pago em', amount: 'Valor', status: 'Situação',
    paid: 'Pago', pending: 'Pendente', overdue: 'Atrasado',
    kind: { land: 'Terreno', draw: 'Draw da obra', other: 'Outro' },
    property: 'Imóvel', city: 'Cidade', properties: 'Imóveis', noAvailable: 'Nenhum imóvel disponível no momento.',
    committed: 'Compromisso total', paidToDate: 'Pago até hoje', remaining: 'A pagar',
    propStatus: { available: 'Disponível', active: 'Em andamento', sold: 'Vendido' },
    realized: 'Lucro líquido realizado',
    loans: 'Empréstimos', loan: 'Empréstimo', lender: 'Credor', startDate: 'Data de início', loanStatement: 'Extrato do empréstimo',
    loanSummary: 'Posição', transactions: 'Lançamentos', rate: 'Taxa de juros', perYear: 'ao ano',
    advanced: 'Total emprestado', repaid: 'Principal devolvido', principal: 'Principal em aberto',
    interestAccrued: 'Juros acumulados até hoje', interestPaid: 'Juros pagos', interestDue: 'Juros a pagar',
    totalOwed: 'Total devido', date: 'Data', balance: 'Saldo do principal', note: 'Obs.',
    entry: { advance: 'Aporte', principal: 'Devolução de principal', interest: 'Pagamento de juros' },
    noEntries: 'Nenhum lançamento ainda.', noPayments: 'Nenhum pagamento programado.',
    interestBasis: 'Juros simples sobre o principal em aberto, contados por dia (ano de 365 dias).',
    disclaimer: 'Preços de venda, lucros e retornos projetados são estimativas baseadas nas premissas atuais e não são garantia de resultados futuros.',
    contact: 'Contato',
  },
};

function fmt(lang) {
  const L = T[lang] || T.en;
  const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct1 = new Intl.NumberFormat(L.locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pct2 = new Intl.NumberFormat(L.locale, { style: 'percent', maximumFractionDigits: 2 });
  const dfmt = new Intl.DateTimeFormat(L.locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
  const n1 = new Intl.NumberFormat(L.locale, { maximumFractionDigits: 1 });
  return {
    L,
    money: (v) => usd0.format(v),
    money2: (v) => usd2.format(v),
    pct: (v) => pct1.format(v),
    pct2: (v) => pct2.format(v),
    num: (v) => n1.format(v),
    date: (iso) => { const t = Inv.parseDate(iso); return t == null ? '—' : dfmt.format(new Date(t)); },
  };
}
const sign = (v) => (v > 0.005 ? 'good' : v < -0.005 ? 'bad' : undefined);
const brand = (profile) => (profile && profile.company ? profile.company : 'InvestCalc');
function footer(F, profile) {
  const c = profile && profile.contact ? ` · ${F.L.contact}: ${profile.contact}` : '';
  return brand(profile) + c;
}

function detailsLine(p, F) {
  const parts = [];
  if (p.beds) parts.push(`${F.num(p.beds)} ${F.L.beds}`);
  if (p.baths) parts.push(`${F.num(p.baths)} ${F.L.baths}`);
  if (p.sqft) parts.push(`${new Intl.NumberFormat(F.L.locale).format(p.sqft)} ${F.L.sqft}`);
  return parts.join(' · ');
}
const locationLine = (p) => [p.address, p.city].filter(Boolean).join(', ');

/* blocos de um imóvel visto como oferta (sem dados de quem comprou) */
function offeringBlocks(p, r, F) {
  const L = F.L, blocks = [];
  const info = [];
  if (locationLine(p)) info.push([L.location, locationLine(p)]);
  if (detailsLine(p, F)) info.push([L.details, detailsLine(p, F)]);
  if (p.builder) info.push([L.builder, p.builder]);
  if (p.estSaleDate) info.push([L.estSaleDate, F.date(p.estSaleDate)]);
  if (info.length) blocks.push({ type: 'rows', rows: info });
  if (p.description) blocks.push({ type: 'text', text: p.description });

  blocks.push({ type: 'heading', text: L.investment });
  blocks.push({ type: 'tiles', tiles: [
    [L.totalInvestment, F.money(r.totalCost)],
    [L.estSalePrice, r.hasSale ? F.money(r.salePrice) : '—'],
    [L.estProfit, r.hasSale ? F.money(r.profit) : '—', sign(r.profit)],
    [L.estRoi, r.hasSale ? F.pct(r.roi) : '—', sign(r.roi)],
  ] });
  const rows = [];
  if (r.landCost) rows.push([L.land, F.money(r.landCost)]);
  if (r.constrCost) rows.push([L.construction, F.money(r.constrCost)]);
  if (r.otherCost) rows.push([L.other, F.money(r.otherCost)]);
  if (r.hasSale) {
    rows.push([`${L.saleCosts} (${F.pct2(r.saleCostPct)})`, F.money(r.saleCosts)]);
    rows.push([L.estNetProceeds, F.money(r.netSale)]);
    if (r.months != null) rows.push([L.holding, `${F.num(r.months)} ${L.months}`]);
    if (r.annualized != null) rows.push([L.estAnnualized, F.pct(r.annualized), sign(r.annualized)]);
  }
  if (rows.length) blocks.push({ type: 'rows', rows });
  return blocks;
}

function scheduleTable(p, F, withStatus, asOfIso) {
  const L = F.L;
  const asOf = Inv.parseDate(asOfIso || Inv.todayIso());
  const pays = (p.payments || []).filter((x) => Inv.num(x.amount) > 0);
  if (!withStatus) {
    return { type: 'table', empty: L.noPayments,
      cols: [{ label: L.description, x: 54, w: 190 }, { label: L.type, x: 260, w: 120 },
        { label: L.due, x: 400 }, { label: L.amount, x: 558, align: 'right' }],
      rows: pays.map((x) => [x.desc || L.kind[x.kind] || L.kind.other, L.kind[x.kind] || L.kind.other,
        F.date(x.dueDate), F.money(x.amount)]) };
  }
  return { type: 'table', empty: L.noPayments,
    cols: [{ label: L.description, x: 54, w: 170 }, { label: L.due, x: 235 }, { label: L.paidOn, x: 320 },
      { label: L.status, x: 405 }, { label: L.amount, x: 558, align: 'right' }],
    rows: pays.map((x) => {
      const late = !x.paidDate && x.dueDate && Inv.parseDate(x.dueDate) < asOf;
      return [x.desc || L.kind[x.kind] || L.kind.other, F.date(x.dueDate), F.date(x.paidDate),
        x.paidDate ? [L.paid, 'good'] : late ? [L.overdue, 'bad'] : L.pending, F.money(x.amount)];
    }) };
}

function propertyDoc(p, lang, profile) {
  const F = fmt(lang), L = F.L;
  const r = Inv.computeProperty(p);
  const blocks = offeringBlocks(p, r, F);
  blocks.push({ type: 'heading', text: L.schedule });
  blocks.push(scheduleTable(p, F, false));
  blocks.push({ type: 'text', text: L.disclaimer, size: 8, color: 'muted' });
  return {
    title: p.name || L.property,
    subtitle: `${brand(profile)} — ${L.opportunity} · ${L.generated} ${F.date(Inv.todayIso())}`,
    footer: footer(F, profile), blocks,
  };
}

function availableDoc(properties, lang, profile) {
  const F = fmt(lang), L = F.L;
  const list = properties.map((p) => ({ p, r: Inv.computeProperty(p) })).filter((x) => x.r.status === 'available');
  const blocks = [{
    type: 'table', empty: L.noAvailable,
    cols: [{ label: L.property, x: 54, w: 150 }, { label: L.city, x: 212, w: 88 },
      { label: L.totalInvestment, x: 384, align: 'right' }, { label: L.estSalePrice, x: 470, align: 'right' },
      { label: L.estRoi, x: 558, align: 'right' }],
    rows: list.map(({ p, r }) => [p.name || '—', p.city || '—', F.money(r.totalCost),
      r.hasSale ? F.money(r.salePrice) : '—', r.hasSale ? [F.pct(r.roi), sign(r.roi)] : '—']),
  }];
  for (const { p, r } of list) {
    blocks.push({ type: 'heading', text: p.name || L.property });
    blocks.push(...offeringBlocks(p, r, F).filter((b) => b.type !== 'heading'));
  }
  blocks.push({ type: 'text', text: L.disclaimer, size: 8, color: 'muted' });
  return {
    title: L.available,
    subtitle: `${brand(profile)} · ${L.generated} ${F.date(Inv.todayIso())}`,
    footer: footer(F, profile), blocks,
  };
}

/* blocos de um empréstimo: posição e extrato de lançamentos */
function loanBlocks(r, F) {
  const L = F.L;
  return [
    { type: 'rows', rows: [
      [L.rate, `${F.pct2(r.rate)} ${L.perYear}`],
      [L.advanced, F.money2(r.advanced)],
      [L.repaid, F.money2(r.repaid)],
      [L.principal, F.money2(r.principal)],
      [L.interestAccrued, F.money2(r.interestAccrued)],
      [L.interestPaid, F.money2(r.interestPaid)],
      [L.interestDue, F.money2(r.interestDue)],
      [L.totalOwed, F.money2(r.totalOwed)],
    ] },
    { type: 'table', empty: L.noEntries,
      cols: [{ label: L.date, x: 54 }, { label: L.type, x: 125, w: 150 },
        { label: L.amount, x: 365, align: 'right' }, { label: L.balance, x: 462, align: 'right' },
        { label: L.interestDue, x: 558, align: 'right' }],
      rows: r.rows.map((x) => [F.date(x.date), L.entry[x.type] || x.type, F.money2(x.amount),
        F.money2(x.balance), F.money2(x.interestDue)]) },
    { type: 'text', text: L.interestBasis, size: 8, color: 'muted' },
  ];
}

/* extrato de um único empréstimo, para enviar ao credor */
function loanDoc(client, loan, profile, asOfIso) {
  const F = fmt(client && client.lang === 'pt' ? 'pt' : 'en'), L = F.L;
  const asOf = asOfIso || Inv.todayIso();
  const r = Inv.computeLoan(loan, asOf);
  const blocks = [
    { type: 'rows', rows: [[L.lender, (client && client.name) || '—'], [L.startDate, F.date(r.firstDate)]] },
    { type: 'tiles', tiles: [
      [L.principal, F.money2(r.principal)],
      [L.interestPaid, F.money2(r.interestPaid)],
      [L.interestDue, F.money2(r.interestDue)],
      [L.totalOwed, F.money2(r.totalOwed)],
    ] },
    { type: 'heading', text: L.loanSummary },
    ...loanBlocks(r, F),
  ];
  blocks.splice(4, 0, { type: 'heading', text: L.transactions });
  return {
    title: loan.label || L.loan,
    subtitle: `${brand(profile)} — ${L.loanStatement} · ${L.asOf} ${F.date(asOf)}`,
    footer: footer(F, profile), blocks,
  };
}

function statementDoc(client, properties, loans, profile, asOfIso) {
  const lang = client.lang === 'pt' ? 'pt' : 'en';
  const F = fmt(lang), L = F.L;
  const asOf = asOfIso || Inv.todayIso();
  const S = Inv.clientSummary(client, properties, loans, asOf);
  const blocks = [];

  if (S.props.length) {
    blocks.push({ type: 'heading', text: L.properties });
    blocks.push({ type: 'tiles', tiles: [
      [L.committed, F.money(S.committed)],
      [L.paidToDate, F.money(S.paid)],
      [L.remaining, F.money(S.pending)],
      [L.estProfit, F.money(S.profit), sign(S.profit)],
    ] });
    for (const { p, r } of S.props) {
      blocks.push({ type: 'heading', text: p.name || L.property });
      const rows = [[L.status, L.propStatus[r.status]]];
      if (locationLine(p)) rows.push([L.location, locationLine(p)]);
      if (p.purchaseDate) rows.push([L.purchaseDate, F.date(p.purchaseDate)]);
      rows.push([L.totalInvestment, F.money(r.totalCost)]);
      rows.push([L.paidToDate, `${F.money(r.paid)} (${F.pct(r.paidPct)})`]);
      rows.push([L.remaining, F.money(r.pending)]);
      if (r.overdueAmount > 0) rows.push([L.overdue, F.money(r.overdueAmount), 'bad']);
      if (r.hasSale) {
        rows.push([r.sold ? L.salePrice : L.estSalePrice, F.money(r.salePrice)]);
        if (r.saleDate) rows.push([r.sold ? L.saleDate : L.estSaleDate, F.date(r.saleDate)]);
        rows.push([`${L.saleCosts} (${F.pct2(r.saleCostPct)})`, F.money(r.saleCosts)]);
        rows.push([r.sold ? L.netProceeds : L.estNetProceeds, F.money(r.netSale)]);
        rows.push([r.sold ? L.realized : L.estProfit, F.money(r.profit), sign(r.profit)]);
        rows.push([r.sold ? L.roi : L.estRoi, F.pct(r.roi), sign(r.roi)]);
        if (r.annualized != null) rows.push([r.sold ? L.annualized : L.estAnnualized, F.pct(r.annualized), sign(r.annualized)]);
      }
      blocks.push({ type: 'rows', rows });
      blocks.push(scheduleTable(p, F, true, asOf));
    }
  }

  if (S.loans.length) {
    blocks.push({ type: 'heading', text: L.loans });
    blocks.push({ type: 'tiles', tiles: [
      [L.principal, F.money2(S.principal)],
      [L.interestPaid, F.money2(S.interestPaid)],
      [L.interestDue, F.money2(S.interestDue)],
      [L.totalOwed, F.money2(S.totalOwed)],
    ] });
    for (const { l, r } of S.loans) {
      blocks.push({ type: 'heading', text: l.label || L.loan });
      blocks.push(...loanBlocks(r, F));
    }
  }

  if (S.props.some((x) => !x.r.sold)) blocks.push({ type: 'text', text: L.disclaimer, size: 8, color: 'muted' });
  return {
    title: client.name || '—',
    subtitle: `${brand(profile)} — ${L.statement} · ${L.asOf} ${F.date(asOf)}`,
    footer: footer(F, profile), blocks,
  };
}

const Reports = { propertyDoc, availableDoc, statementDoc, loanDoc };
if (typeof module !== 'undefined' && module.exports) module.exports = Reports;
else global.Reports = Reports;
})(typeof window !== 'undefined' ? window : globalThis);
