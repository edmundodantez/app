/*
 * PDFs de apresentação de um imóvel para investidores, no padrão dos modelos
 * "Financiado vs À Vista" (resumo técnico, 2 páginas carta) e "Visão Geral"
 * (apresentação 16:9). Os números vêm de Investors.financingScenarios, que roda
 * o modelo do deal analyzer em cash e com construction loan.
 * Funções puras: navegador (window.Decks) e Node (module.exports).
 */
(function (global) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;
const Pdf = isNode ? require('./pdfgen.js') : global.Pdf;
const Inv = isNode ? require('./investors.js') : global.Investors;
const Mdl = isNode ? require('./model.js') : global.Model;

/* ===== Paleta ===== */
const GREEN = [0.106, 0.227, 0.184], GREEN2 = [0.141, 0.286, 0.235], GOLD = [0.659, 0.541, 0.31];
const CREAM = [0.953, 0.937, 0.902], INK = [0.12, 0.12, 0.12], GRAY = [0.36, 0.36, 0.36];
const MUTED = [0.56, 0.56, 0.56], RULE = [0.83, 0.83, 0.81], WHITE = [1, 1, 1], SOFT = [0.86, 0.9, 0.87];

/* ===== Tela de desenho com origem no canto superior esquerdo ===== */
function canvas(w, h) {
  const items = [];
  items.size = [w, h];
  const c = {
    items, w, h,
    text(x, y, s, o = {}) {
      const font = o.font || 'F1', size = o.size || 9;
      let str = String(s);
      if (o.maxW) while (str.length > 1 && Pdf.textWidth(str, font, size, o.cs) > o.maxW) str = str.slice(0, -2) + '…';
      const tw = Pdf.textWidth(str, font, size, o.cs);
      const tx = o.align === 'right' ? x - tw : o.align === 'center' ? x - tw / 2 : x;
      items.push({ t: 'text', x: tx, y: h - y, s: str, font, size, color: o.color || INK, cs: o.cs });
      return tw;
    },
    // parágrafo com quebra automática; devolve o y da linha seguinte
    para(x, y, width, s, o = {}) {
      const size = o.size || 9, lead = o.lead || size * 1.38;
      let lines = Pdf.wrapWidth(s, o.font || 'F1', size, width);
      if (o.maxLines && lines.length > o.maxLines) {
        lines = lines.slice(0, o.maxLines);
        lines[lines.length - 1] = lines[lines.length - 1].replace(/.{0,3}$/, '…');
      }
      for (const ln of lines) {
        c.text(o.align === 'center' ? x + width / 2 : o.align === 'right' ? x + width : x, y, ln, o);
        y += lead;
      }
      return y;
    },
    rect(x, y, w2, h2, color) { items.push({ t: 'rect', x, y: h - y - h2, w: w2, h: h2, color }); },
    rrect(x, y, w2, h2, r, fill, stroke, lw) { items.push({ t: 'rrect', x, y: h - y - h2, w: w2, h: h2, r, fill, stroke, lw }); },
    line(x1, y1, x2, y2, color, lw) { items.push({ t: 'line', x1, y1: h - y1, x2, y2: h - y2, w: lw || 0.5, color }); },
    poly(pts, color, lw) { items.push({ t: 'poly', pts: pts.map(([a, b]) => [a, h - b]), w: lw || 1.5, color }); },
  };
  return c;
}

/* ===== Formatação (números no padrão americano, como nos modelos) ===== */
const MONTHS = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const MONTHS_LONG = {
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function fmt(lang) {
  const L = lang === 'pt' ? 'pt' : 'en';
  const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const n1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const D = (t) => new Date(t);
  const money = (v) => (v < 0 ? '-$' : '$') + n0.format(Math.abs(Math.round(v)));
  const F = {
    L, money, num: (v) => n0.format(v),
    // $286K, $1.45M
    short: (v) => {
      const a = Math.abs(v), s = v < 0 ? '-' : '';
      if (a >= 999500) return s + '$' + (Math.round(a / 1e4) / 100).toFixed(2).replace(/0$/, '') + 'M';
      return s + '$' + Math.round(a / 1e3) + 'K';
    },
    k: (v) => (Math.round(v / 1e3) === 0 ? '—' : n0.format(Math.round(v / 1e3))),
    pct1: (v) => n1.format(v * 100) + '%',
    pct0: (v) => n0.format(v * 100) + '%',
    pctAuto: (v) => String(Number((v * 100).toFixed(2))) + '%',
    x: (v) => n1.format(v) + '×',
    day: (t) => (L === 'pt' ? `${D(t).getUTCDate()} ${MONTHS.pt[D(t).getUTCMonth()]} ${D(t).getUTCFullYear()}`
      : `${MONTHS.en[D(t).getUTCMonth()]} ${D(t).getUTCDate()}, ${D(t).getUTCFullYear()}`),
    my: (t) => `${MONTHS[L][D(t).getUTCMonth()]} ${D(t).getUTCFullYear()}`,
    myy: (t) => `${MONTHS[L][D(t).getUTCMonth()]} ${String(D(t).getUTCFullYear()).slice(2)}`,
    myLong: (t) => (L === 'pt' ? `${MONTHS_LONG.pt[D(t).getUTCMonth()]} de ${D(t).getUTCFullYear()}`
      : `${MONTHS_LONG.en[D(t).getUTCMonth()]} ${D(t).getUTCFullYear()}`),
    today: () => { const d = new Date(); return `${cap(MONTHS_LONG[L][d.getMonth()])} ${d.getFullYear()}`; },
  };
  return F;
}

/* ===== Textos ===== */
const TX = {
  pt: {
    summaryEyebrow: 'RESUMO DO INVESTIMENTO', closeSale: (a, b, m) => `Fechamento ${a} – Venda ${b} (~${m} meses)`,
    kCost: 'CUSTO TOTAL DO PROJETO', kCostSub: 'Terreno + construção', kPrice: 'PREÇO DE VENDA SUGERIDO',
    kProfit: 'LUCRO PROJETADO*', kProfitSub: 'Conforme a opção de financiamento', kRoi: 'RETORNO SOBRE O CAIXA',
    kRoiSub: 'À vista vs. financiado', kCash: 'CAIXA NECESSÁRIO', kCashSub: 'Pico, por opção',
    newHome: (sf) => (sf ? `Casa nova de ${sf} SF` : 'Casa nova'),
    cmpHead: 'COMPARAÇÃO DE FINANCIAMENTO — MESMO PROJETO, DUAS FORMAS DE CAPITALIZAR',
    optA: 'OPÇÃO A — FINANCIAMENTO', optB: 'OPÇÃO B — À VISTA',
    rAtClosing: 'Caixa necessário no fechamento', rPeak: 'Pico de caixa no negócio', rAvg: 'Capital médio investido',
    rFinCost: 'Custos de financiamento (taxas + juros)', rProfit: 'Lucro projetado*', rRoiPeak: 'Retorno sobre o pico de caixa investido',
    rAnnual: 'Retorno anualizado (simples)', rRoiAvg: 'Retorno sobre o capital médio investido', rBreakEven: 'Preço de venda de equilíbrio (break-even)',
    tradeHead: 'O TRADE-OFF',
    trade: (d) => `À vista gera mais dólares; o financiamento rende mais por dólar. Pagar à vista evita ${d.finCost} em taxas e juros, elevando o lucro total para ${d.profitB} e reduzindo o preço de equilíbrio para ${d.beB}. Em contrapartida, imobiliza cerca de ${d.mult} mais capital — ${d.peakB} no pico contra ${d.peakA}. Com o financiamento, cada dólar investido rende ${d.roiA} em vez de ${d.roiB}, e cerca de ${d.freed} permanecem livres para outras oportunidades.`,
    basicsHead: 'DADOS BÁSICOS DO PROJETO', bLand: 'Compra do terreno / orçamento de construção',
    bSize: 'Área construída / custo de construção', bNet: (p) => `Receita líquida da venda (após ${p} de custos de venda)`,
    bTerm: 'Prazo (do fechamento à venda)', perSf: 'por SF', months: (m) => `~${m} meses`,
    sensHead: 'SENSIBILIDADE DO PREÇO DE VENDA', scenario: 'CENÁRIO', price: 'PREÇO', aFin: 'A — FINANCIADO', bCash: 'B — À VISTA',
    profit: 'LUCRO', roi: 'ROI', base: 'Base',
    protectHead: 'Proteção contra queda:',
    protect: (d) => `a estrutura à vista atinge o equilíbrio em ${d.beB} (${d.beBpct} ${d.beBdir} do preço sugerido); a financiada, em ${d.beA} (${d.beApct} ${d.beAdir}). Com queda de 10% no preço, a opção financiada retorna ${d.roiA10} sobre o caixa e a opção à vista, ${d.roiB10}.`,
    below: 'abaixo', above: 'acima',
    foot1: (d) => `*O lucro projetado e as métricas de retorno baseiam-se no preço de venda sugerido de ${d.price} — uma estimativa, não um valor garantido ou avaliado. O lucro real dependerá do preço final, do cronograma e dos custos efetivos, podendo ser maior ou menor; veja a tabela de sensibilidade. A sensibilidade mantém os custos de financiamento do caso-base (variação apenas de preço). O ROI é medido sobre o pico de caixa investido (financiado: após o adiantamento do terreno); a opção à vista não considera taxas nem juros.`,
    p2Title: 'Cronograma, Desembolsos e Exposição de Caixa',
    finHead: 'OPÇÃO A — ESTRUTURA DO FINANCIAMENTO', fLoan: (p) => `Financiamento de construção (${p} do custo)`,
    fAdv: (p) => `— Adiantamento do terreno no fechamento (${p})`, fReimb: '— Reembolsos da construção', fRate: 'Taxa de juros',
    fFees: (p) => `Taxas do financiamento (${p} total, incl. seguro)`, fInterest: 'Juros totais do projeto',
    fDelay: 'Prazo de reembolso dos desembolsos', days: (n) => `${n} dias`,
    datesHead: 'DATAS-CHAVE (AMBAS AS OPÇÕES)', dStart: 'Início da construção', dClose: 'Fechamento do terreno',
    dPeakA: (v) => `Pico de caixa — Financiado: ${v}`, dPeakB: (v) => `Pico de caixa — À Vista: ${v}`, dDone: 'Último desembolso da obra', dSale: 'Venda prevista',
    drawsHead: 'CRONOGRAMA DE DESEMBOLSOS DA CONSTRUÇÃO (AMBAS AS OPÇÕES)', cPhase: 'FASE', cPct: '% ORÇ.', cPay: 'PAGAMENTO',
    cAmount: 'VALOR', cBank: 'BANCO REEMBOLSA (A)', drawsTotal: 'Total da construção', noReimb: 'na opção à vista, não há reembolsos',
    chartHead: 'CAIXA DO INVESTIDOR NO NEGÓCIO AO LONGO DO TEMPO — AMBAS AS OPÇÕES', peakCashLbl: (v) => `Pico à vista ${v}`,
    peakFinLbl: (v) => `Pico financiado ${v}`, sale: 'Venda',
    chartCap: (d) => `Opção A (financiado, barras): os reembolsos mantêm o caixa entre ${d.minA}–${d.maxA} ao longo dos ${d.n} meses de obra. Opção B (à vista, linha): sobe até ${d.peakB} em ${d.peakBDate}. Ambas devolvem todo o capital mais o lucro na venda de ${d.sale}.`,
    disc: (d) => `Opção A: financiamento de ${d.fin} do custo a ${d.rate}, taxas totais de ${d.fees}, adiantamento de ${d.adv} do terreno no fechamento, reembolso de ${d.reimb} dos desembolsos em ${d.delay} dias. Opção B: tudo pago à vista; sem taxas ou juros. Ambas assumem ${d.costs} de custos de venda e venda em ${d.sale} pelo preço sugerido de ${d.price}; os resultados dependem do preço final obtido. Apenas para fins informativos; não constitui oferta de valores mobiliários. As projeções são estimativas e podem variar.`,
    // apresentação
    project: (n) => `O Projeto ${n}`, overview: 'VISÃO GERAL DO INVESTIMENTO', footDoc: (n) => `${n} — Visão Geral do Investidor`,
    coverAuto: (d) => `Uma casa nova${d.sf ? `, com ${d.sf} SF` : ''}, construída do zero${d.where ? ` em ${d.where}` : ''}.`,
    coverLine2: (hasArea, hasComps) => `Esta visão geral apresenta ${hasArea ? 'o bairro, ' : ''}os números${hasComps ? ', as comparáveis que sustentam o preço' : ''} e as proteções.`,
    s2Title: 'A Oportunidade em Resumo', s2Lead: 'Compramos o terreno. Construímos uma casa nova. Vendemos. Ficamos com a diferença.',
    s2c1: (o) => `O custo de tudo — terreno${o ? ', outros custos' : ''} e construção`, s2c2: (sf) => `Preço sugerido de venda${sf ? ` — casa nova de ${sf} SF` : ''}`,
    s2c3: 'Lucro, conforme a forma de financiar (financiado ou à vista)',
    s2Para: (d) => `O projeto leva cerca de ${d.m} meses do fechamento do terreno até a venda. O preço sugerido é de ${d.price}${d.psf ? ` (${d.psf}/SF)` : ''}${d.comps ? ` — as vendas comparáveis que sustentam esse número estão adiante` : ''}. O restante desta visão geral explica os números e o que os protege.`,
    s2Foot: '*O preço de venda sugerido é uma estimativa, não um valor garantido ou avaliado. O resultado final dependerá do preço efetivamente obtido; veja a tabela de cenários adiante nesta apresentação.',
    whyTitle: (n) => `Por que ${n}?`,
    compsTitle: (v) => `O Que Sustenta o Preço de ${v}`, compsSub: 'Vendas e ofertas comparáveis na vizinhança (distâncias aproximadas):',
    hAddr: 'Endereço', hYear: 'Ano', hDist: 'Dist.', hStatus: 'Status', hPrice: 'Preço', hSf: 'SF', hPsf: '$/SF',
    compsAvg: (n) => `Média — comparáveis selecionadas (${n})`, thisProject: 'Este projeto — novo', suggested: 'Preço sugerido',
    posEyebrow: (below) => (below ? 'POSIÇÃO CONSERVADORA' : 'POSIÇÃO NO MERCADO'),
    posText: (d) => `${d.n} comparáveis de ${d.min} a ${d.max}/SF — média de ~${d.avg}/SF.`,
    posText2: (d) => `Nosso alvo de ${d.psf}/SF fica ~${d.diff} ${d.dir} da média.`,
    compsFoot: 'Fontes: registros públicos/MLS e levantamento do incorporador; distâncias aproximadas; não constitui avaliação.',
    buildTitle: 'O Que Vamos Construir', buildDefault: 'Casa nova, do zero',
    buildAuto: (d) => `Casa unifamiliar nova${d.sf ? ` de ${d.sf} SF` : ''}${d.where ? ` em ${d.where}` : ''}.`,
    buildCostHead: 'Custo de construção',
    buildCost: (d) => `${d.constr} no total${d.psf ? ` — ${d.psf} por pé quadrado` : ''} — pagos ao construtor em ${d.n} etapas definidas, cada uma vinculada a trabalho concluído.`,
    stagesHead: (n) => `As ${n} Etapas de Pagamento do Construtor`, buildNote: (d) => `Último desembolso em ${d.done}; venda prevista para ${d.sale}.`,
    moneyTitle: (v) => `Para Onde Vão os ${v}`, mLand: 'Compra do terreno', mLandSub: (w) => `Um terreno edificável${w ? ` em ${w}` : ''}`,
    mBuild: 'Construção da casa', mBuildSub: (d) => `Cronograma de ${d.n} etapas vinculado a trabalho concluído${d.sf ? ` — ${d.sf} SF a ${d.psf}/SF` : ''}`,
    mOther: 'Outros custos', mOtherSub: 'Fechamento, taxas e demais despesas do projeto',
    mTotal: (d) => `Total: ${d.total}. Na opção financiada, o financiamento adiciona ${d.finCost} em taxas e juros; à vista, nada. A venda deve gerar ${d.net} líquidos após ${d.costs} de custos de venda.`,
    optTitle: 'Duas Opções de Financiamento', optAHead: 'Opção A — Financiamento de Construção', optBHead: 'Opção B — À Vista',
    optAText: (d) => `O banco financia ${d.fin} do projeto, então usamos muito menos capital próprio. Em troca, os custos de financiamento somam ${d.finCost} em taxas e juros.`,
    optBText: (d) => `Sem banco. Comprometemos mais capital próprio, mas ficamos com os ${d.finCost} que o banco cobraria — e o processo é mais simples e rápido.`,
    oMax: (v) => `Capital máximo no negócio em qualquer momento: ${v}`, oProfitA: (v) => `Lucro após custos de financiamento: ${v}`,
    oProfitB: (v) => `Lucro (sem custos de financiamento): ${v}`, oRoi: (v) => `Retorno total sobre esse capital: ~${v} no projeto`, oAnn: (v) => `Retorno anual: ~${v} ao ano`,
    optNote: (d) => `À vista gera mais lucro total (${d.pB} vs. ${d.pA}); o financiamento faz cada dólar render mais (${d.rA} vs. ${d.rB}) e deixa cerca de ${d.freed} livres para outras oportunidades durante o projeto.`,
    monthTitle: (o) => `Caixa Mês a Mês — ${o}`, monthA: 'Opção A (Financiado)', monthB: 'Opção B (À Vista)',
    monthSub: '“Entra” é o capital que aportamos no mês (terreno, pagamentos ao construtor que adiantamos, taxas e juros); “Volta” é o dinheiro devolvido (reembolsos do banco e a venda). Valores em milhares de dólares; pequenas diferenças por arredondamento.',
    hMonth: 'Mês', hIn: 'Entra', hBack: 'Volta', hHeld: 'No Negócio',
    monthNote: (d) => `${d.peakDate} é o pico: ${d.peak} aplicados. Na venda de ${d.sale}, ${d.back} retornam — todo o capital mais o lucro de ${d.profit}.`,
    downTitle: 'Proteção Contra Queda', downSub: 'O preço de venda é a principal variável. Veja o que acontece em toda a faixa — nas duas opções:',
    hIfSells: 'Se a casa vender por…', hProfitA: 'Lucro (Financiado)', hProfitB: 'Lucro (À Vista)', hRoi: 'ROI',
    sAbove: (p) => `(${p} acima)`, sBelow: (p) => `(${p} abaixo)`, sTarget: '(nosso alvo)',
    downEyebrow: 'PROTEÇÃO EMBUTIDA',
    downBox: (d) => `A opção financiada atinge o equilíbrio em ${d.beA} (${d.beApct} ${d.beAdir} do alvo); à vista, em ${d.beB} (${d.beBpct} ${d.beBdir}).`,
    downNote: (d) => `O ROI é medido sobre o máximo de capital no negócio — ${d.peakA} financiado, ${d.peakB} à vista — ao longo dos ~${d.m} meses, mantendo os custos de financiamento do caso-base. Com o preço 10% abaixo do alvo, a opção financiada retorna ${d.roiA10} sobre o caixa.`,
    riskTitle: 'Principais Riscos — e Como os Administramos', r1: 'A construção custar mais que o planejado',
    r1t: (d) => `O orçamento de ${d.constr}${d.psf ? ` (${d.psf}/SF)` : ''} é um número bem fundamentado — não um preço garantido. Os pagamentos são liberados em ${d.n} etapas, cada uma vinculada a trabalho concluído, então problemas aparecem cedo.`,
    r2: 'O preço de venda é uma estimativa',
    r2t: (d) => `O alvo de ${d.price} baseia-se em ${d.comps ? 'vendas comparáveis reais da vizinhança' : 'nossa análise do mercado local'} — mas não em avaliação. O projeto permanece lucrativo até ${d.beA} no financiado e ${d.beB} à vista.`,
    r3: 'Uma casa, uma venda',
    r3t: (d) => `Tudo se conclui com uma única venda prevista para ${d.sale}. Um atraso na venda aumenta os juros na opção financiada e adia o retorno do capital nas duas opções.`,
    sumTitle: 'Resumo',
    sum1: (d) => `Compramos um terreno edificável${d.where ? ` em ${d.where}` : ''} por ${d.land}.`,
    sum2: (d) => `Construímos uma casa nova${d.sf ? ` com ${d.sf} SF` : ''} por ${d.constr}${d.psf ? ` (${d.psf}/SF)` : ''}, em ${d.n} etapas até ${d.done}.`,
    sum3: (d) => `Vendemos ao preço sugerido de ${d.price}${d.salePsf ? ` (${d.salePsf}/SF)` : ''} em ${d.sale}, com ${d.net} líquidos.`,
    sum4: (d) => `Financiado: lucro de ${d.pA} sobre pico de capital de ${d.peakA} (~${d.annA} ao ano). À vista: lucro de ${d.pB} sobre pico de ${d.peakB} (~${d.annB} ao ano).`,
    sumNote: 'Um resumo técnico completo (Financiado vs. À Vista), com todos os números por trás desta visão geral, está disponível mediante solicitação.',
    fileCmp: 'financiado-vs-a-vista', fileOv: 'visao-geral',
  },
  en: {
    summaryEyebrow: 'INVESTMENT SUMMARY', closeSale: (a, b, m) => `Closing ${a} – Sale ${b} (~${m} months)`,
    kCost: 'TOTAL PROJECT COST', kCostSub: 'Land + construction', kPrice: 'SUGGESTED SALE PRICE',
    kProfit: 'PROJECTED PROFIT*', kProfitSub: 'Depending on the financing option', kRoi: 'RETURN ON CASH',
    kRoiSub: 'All-cash vs. financed', kCash: 'CASH REQUIRED', kCashSub: 'Peak, by option',
    newHome: (sf) => (sf ? `New ${sf} SF home` : 'New home'),
    cmpHead: 'FINANCING COMPARISON — SAME PROJECT, TWO WAYS TO CAPITALIZE IT',
    optA: 'OPTION A — FINANCED', optB: 'OPTION B — ALL CASH',
    rAtClosing: 'Cash needed at closing', rPeak: 'Peak cash in the deal', rAvg: 'Average capital invested',
    rFinCost: 'Financing costs (fees + interest)', rProfit: 'Projected profit*', rRoiPeak: 'Return on peak cash invested',
    rAnnual: 'Annualized return (simple)', rRoiAvg: 'Return on average capital invested', rBreakEven: 'Break-even sale price',
    tradeHead: 'THE TRADE-OFF',
    trade: (d) => `All cash earns more dollars; financing earns more per dollar. Paying cash avoids ${d.finCost} in fees and interest, lifting total profit to ${d.profitB} and lowering the break-even price to ${d.beB}. In exchange, it ties up about ${d.mult} more capital — ${d.peakB} at peak versus ${d.peakA}. With financing, each dollar invested returns ${d.roiA} instead of ${d.roiB}, and about ${d.freed} stays free for other opportunities.`,
    basicsHead: 'PROJECT BASICS', bLand: 'Land purchase / construction budget',
    bSize: 'Built area / construction cost', bNet: (p) => `Net sale proceeds (after ${p} selling costs)`,
    bTerm: 'Term (closing to sale)', perSf: 'per SF', months: (m) => `~${m} months`,
    sensHead: 'SALE PRICE SENSITIVITY', scenario: 'SCENARIO', price: 'PRICE', aFin: 'A — FINANCED', bCash: 'B — ALL CASH',
    profit: 'PROFIT', roi: 'ROI', base: 'Base',
    protectHead: 'Downside protection:',
    protect: (d) => `the all-cash structure breaks even at ${d.beB} (${d.beBpct} ${d.beBdir} the suggested price); the financed one at ${d.beA} (${d.beApct} ${d.beAdir}). With a 10% price drop, the financed option returns ${d.roiA10} on cash and the all-cash option ${d.roiB10}.`,
    below: 'below', above: 'above',
    foot1: (d) => `*Projected profit and return metrics are based on the suggested sale price of ${d.price} — an estimate, not a guaranteed or appraised value. Actual profit will depend on the final price, schedule and actual costs, and may be higher or lower; see the sensitivity table. Sensitivity holds base-case financing costs (price change only). ROI is measured on peak cash invested (financed: after the land advance); the all-cash option carries no fees or interest.`,
    p2Title: 'Schedule, Draws and Cash Exposure',
    finHead: 'OPTION A — FINANCING STRUCTURE', fLoan: (p) => `Construction financing (${p} of cost)`,
    fAdv: (p) => `— Land advance at closing (${p})`, fReimb: '— Construction reimbursements', fRate: 'Interest rate',
    fFees: (p) => `Financing fees (${p} total, incl. insurance)`, fInterest: 'Total project interest',
    fDelay: 'Draw reimbursement period', days: (n) => `${n} days`,
    datesHead: 'KEY DATES (BOTH OPTIONS)', dStart: 'Construction start', dClose: 'Land closing',
    dPeakA: (v) => `Peak cash — Financed: ${v}`, dPeakB: (v) => `Peak cash — All Cash: ${v}`, dDone: 'Final construction draw', dSale: 'Expected sale',
    drawsHead: 'CONSTRUCTION DRAW SCHEDULE (BOTH OPTIONS)', cPhase: 'PHASE', cPct: '% BUDGET', cPay: 'PAYMENT',
    cAmount: 'AMOUNT', cBank: 'BANK REIMBURSES (A)', drawsTotal: 'Total construction', noReimb: 'no reimbursements in the all-cash option',
    chartHead: 'INVESTOR CASH IN THE DEAL OVER TIME — BOTH OPTIONS', peakCashLbl: (v) => `All-cash peak ${v}`,
    peakFinLbl: (v) => `Financed peak ${v}`, sale: 'Sale',
    chartCap: (d) => `Option A (financed, bars): reimbursements keep cash between ${d.minA}–${d.maxA} over the ${d.n} months of construction. Option B (all cash, line): rises to ${d.peakB} in ${d.peakBDate}. Both return all capital plus profit at the ${d.sale} sale.`,
    disc: (d) => `Option A: financing of ${d.fin} of cost at ${d.rate}, total fees of ${d.fees}, ${d.adv} land advance at closing, ${d.reimb} of draws reimbursed in ${d.delay} days. Option B: everything paid in cash; no fees or interest. Both assume ${d.costs} selling costs and a sale in ${d.sale} at the suggested price of ${d.price}; results depend on the final price obtained. For informational purposes only; not an offer of securities. Projections are estimates and may vary.`,
    project: (n) => `The ${n} Project`, overview: 'INVESTMENT OVERVIEW', footDoc: (n) => `${n} — Investor Overview`,
    coverAuto: (d) => `A new home${d.sf ? ` of ${d.sf} SF` : ''}, built from the ground up${d.where ? ` in ${d.where}` : ''}.`,
    coverLine2: (hasArea, hasComps) => `This overview covers ${hasArea ? 'the neighborhood, ' : ''}the numbers${hasComps ? ', the comparables that support the price' : ''} and the protections.`,
    s2Title: 'The Opportunity at a Glance', s2Lead: 'We buy the land. We build a new home. We sell. We keep the difference.',
    s2c1: (o) => `The cost of everything — land${o ? ', other costs' : ''} and construction`, s2c2: (sf) => `Suggested sale price${sf ? ` — new ${sf} SF home` : ''}`,
    s2c3: 'Profit, depending on how it is financed (financed or all cash)',
    s2Para: (d) => `The project takes about ${d.m} months from land closing to sale. The suggested price is ${d.price}${d.psf ? ` (${d.psf}/SF)` : ''}${d.comps ? ` — the comparable sales that support it appear later` : ''}. The rest of this overview explains the numbers and what protects them.`,
    s2Foot: '*The suggested sale price is an estimate, not a guaranteed or appraised value. The final result will depend on the price actually obtained; see the scenario table later in this presentation.',
    whyTitle: (n) => `Why ${n}?`,
    compsTitle: (v) => `What Supports the ${v} Price`, compsSub: 'Comparable sales and listings nearby (approximate distances):',
    hAddr: 'Address', hYear: 'Year', hDist: 'Dist.', hStatus: 'Status', hPrice: 'Price', hSf: 'SF', hPsf: '$/SF',
    compsAvg: (n) => `Average — selected comparables (${n})`, thisProject: 'This project — new', suggested: 'Suggested price',
    posEyebrow: (below) => (below ? 'CONSERVATIVE POSITION' : 'MARKET POSITION'),
    posText: (d) => `${d.n} comparables from ${d.min} to ${d.max}/SF — averaging ~${d.avg}/SF.`,
    posText2: (d) => `Our target of ${d.psf}/SF sits ~${d.diff} ${d.dir} the average.`,
    compsFoot: 'Sources: public records/MLS and developer research; approximate distances; not an appraisal.',
    buildTitle: 'What We Will Build', buildDefault: 'New home, from the ground up',
    buildAuto: (d) => `New single-family home${d.sf ? ` of ${d.sf} SF` : ''}${d.where ? ` in ${d.where}` : ''}.`,
    buildCostHead: 'Construction cost',
    buildCost: (d) => `${d.constr} in total${d.psf ? ` — ${d.psf} per square foot` : ''} — paid to the builder in ${d.n} defined stages, each tied to completed work.`,
    stagesHead: (n) => `The ${n} Builder Payment Stages`, buildNote: (d) => `Final draw in ${d.done}; sale expected in ${d.sale}.`,
    moneyTitle: (v) => `Where the ${v} Goes`, mLand: 'Land purchase', mLandSub: (w) => `A buildable lot${w ? ` in ${w}` : ''}`,
    mBuild: 'Home construction', mBuildSub: (d) => `${d.n}-stage schedule tied to completed work${d.sf ? ` — ${d.sf} SF at ${d.psf}/SF` : ''}`,
    mOther: 'Other costs', mOtherSub: 'Closing, fees and other project expenses',
    mTotal: (d) => `Total: ${d.total}. In the financed option, financing adds ${d.finCost} in fees and interest; all cash, nothing. The sale should net ${d.net} after ${d.costs} selling costs.`,
    optTitle: 'Two Financing Options', optAHead: 'Option A — Construction Financing', optBHead: 'Option B — All Cash',
    optAText: (d) => `The bank finances ${d.fin} of the project, so we use far less of our own capital. In exchange, financing costs total ${d.finCost} in fees and interest.`,
    optBText: (d) => `No bank. We commit more of our own capital, but keep the ${d.finCost} the bank would charge — and the process is simpler and faster.`,
    oMax: (v) => `Maximum capital in the deal at any time: ${v}`, oProfitA: (v) => `Profit after financing costs: ${v}`,
    oProfitB: (v) => `Profit (no financing costs): ${v}`, oRoi: (v) => `Total return on that capital: ~${v} for the project`, oAnn: (v) => `Annual return: ~${v} per year`,
    optNote: (d) => `All cash earns more total profit (${d.pB} vs. ${d.pA}); financing makes each dollar work harder (${d.rA} vs. ${d.rB}) and leaves about ${d.freed} free for other opportunities during the project.`,
    monthTitle: (o) => `Cash Month by Month — ${o}`, monthA: 'Option A (Financed)', monthB: 'Option B (All Cash)',
    monthSub: '“In” is the capital we put in during the month (land, builder payments we front, fees and interest); “Back” is money returned (bank reimbursements and the sale). Amounts in thousands of dollars; small differences due to rounding.',
    hMonth: 'Month', hIn: 'In', hBack: 'Back', hHeld: 'In the Deal',
    monthNote: (d) => `${d.peakDate} is the peak: ${d.peak} invested. At the ${d.sale} sale, ${d.back} comes back — all capital plus the ${d.profit} profit.`,
    downTitle: 'Downside Protection', downSub: 'Sale price is the main variable. Here is what happens across the range — in both options:',
    hIfSells: 'If the home sells for…', hProfitA: 'Profit (Financed)', hProfitB: 'Profit (All Cash)', hRoi: 'ROI',
    sAbove: (p) => `(${p} above)`, sBelow: (p) => `(${p} below)`, sTarget: '(our target)',
    downEyebrow: 'BUILT-IN PROTECTION',
    downBox: (d) => `The financed option breaks even at ${d.beA} (${d.beApct} ${d.beAdir} target); all cash, at ${d.beB} (${d.beBpct} ${d.beBdir}).`,
    downNote: (d) => `ROI is measured on the maximum capital in the deal — ${d.peakA} financed, ${d.peakB} all cash — over the ~${d.m} months, holding base-case financing costs. With the price 10% below target, the financed option returns ${d.roiA10} on cash.`,
    riskTitle: 'Key Risks — and How We Manage Them', r1: 'Construction costs more than planned',
    r1t: (d) => `The ${d.constr} budget${d.psf ? ` (${d.psf}/SF)` : ''} is a well-supported number — not a guaranteed price. Payments are released in ${d.n} stages, each tied to completed work, so problems surface early.`,
    r2: 'The sale price is an estimate',
    r2t: (d) => `The ${d.price} target is based on ${d.comps ? 'real comparable sales nearby' : 'our analysis of the local market'} — not on an appraisal. The project stays profitable down to ${d.beA} financed and ${d.beB} all cash.`,
    r3: 'One home, one sale',
    r3t: (d) => `Everything concludes with a single sale expected in ${d.sale}. A delayed sale increases interest in the financed option and postpones the return of capital in both.`,
    sumTitle: 'Summary',
    sum1: (d) => `We buy a buildable lot${d.where ? ` in ${d.where}` : ''} for ${d.land}.`,
    sum2: (d) => `We build a new home${d.sf ? ` of ${d.sf} SF` : ''} for ${d.constr}${d.psf ? ` (${d.psf}/SF)` : ''}, in ${d.n} stages through ${d.done}.`,
    sum3: (d) => `We sell at the suggested price of ${d.price}${d.salePsf ? ` (${d.salePsf}/SF)` : ''} in ${d.sale}, netting ${d.net}.`,
    sum4: (d) => `Financed: ${d.pA} profit on peak capital of ${d.peakA} (~${d.annA} per year). All cash: ${d.pB} profit on peak of ${d.peakB} (~${d.annB} per year).`,
    sumNote: 'A full technical summary (Financed vs. All Cash), with every number behind this overview, is available on request.',
    fileCmp: 'financed-vs-all-cash', fileOv: 'overview',
  },
};

/* ===== Dados comuns aos dois documentos ===== */
function pack(p, lang, profile, params) {
  const S = Inv.financingScenarios(p, params || Mdl.DEFAULT_PARAMS, Mdl);
  if (!S.ready) return S;
  const F = fmt(lang), T = TX[F.L], A = S.loan, B = S.cash, J = S.project;
  const dir = (be) => (be <= J.sale ? T.below : T.above);
  const off = (be) => F.pct0(Math.abs(1 - be / J.sale));
  const s10 = S.sensitivity.find((x) => Math.abs(x.scenario + 0.1) < 1e-9) || S.sensitivity[0];
  return {
    ready: true, S, F, T, A, B, J, p, s10,
    name: p.name || (F.L === 'pt' ? 'Imóvel' : 'Property'),
    where: p.area || p.city || '',
    brand: (profile && profile.company) || 'Investor Management',
    sf: J.sqft ? F.num(J.sqft) : '',
    psf: J.constrPerSqft != null ? F.money(J.constrPerSqft) : '',
    salePsf: J.salePerSqft != null ? F.money(J.salePerSqft) : '',
    be: { beA: F.money(A.breakEven), beB: F.money(B.breakEven), beApct: off(A.breakEven), beBpct: off(B.breakEven),
      beAdir: dir(A.breakEven), beBdir: dir(B.breakEven) },
    lo: (a, b) => Math.min(a, b), hi: (a, b) => Math.max(a, b),
  };
}
const range = (F, f, a, b) => { const x = f(Math.min(a, b)), y = f(Math.max(a, b)); return x === y ? x : `${x}–${y.replace(/^\$/, '$')}`; };

/* =====================================================
   Documento 1 — Financiado vs À Vista (carta, 2 páginas)
===================================================== */
function head(c, x, y, text, size) {
  const w = c.text(x, y, text, { font: 'F2', size: size || 9.5, color: GREEN });
  c.line(x, y + 5, x + w + 4, y + 5, GOLD, 1);
}
function comparisonPages(D) {
  const { F, T, A, B, J, S } = D;
  const M = 54, R = 558, W = R - M;

  /* ---- página 1 ---- */
  const c = canvas(612, 792);
  c.text(M, 54, T.summaryEyebrow, { font: 'F2', size: 6.5, color: GOLD, cs: 2.6 });
  let ts = 19;
  while (ts > 12 && Pdf.textWidth(D.name, 'F2', ts) > W) ts -= 0.5;
  c.text(M, 76, D.name, { font: 'F2', size: ts, color: GREEN, maxW: W });
  const sub = [D.p.tagline, D.p.city, T.closeSale(F.my(J.closing), F.my(J.saleDate), J.months - 1)].filter(Boolean).join('  ·  ');
  let y = c.para(M, 91, W, sub, { size: 8.5, color: GRAY, maxLines: 2 });
  c.line(M, y - 3, R, y - 3, GREEN, 1.8);
  y += 12;
  const tiles = [
    [T.kCost, F.money(J.totalCost), T.kCostSub],
    [T.kPrice, F.money(J.sale), T.newHome(D.sf)],
    [T.kProfit, range(F, F.short, A.profit, B.profit), T.kProfitSub],
    [T.kRoi, range(F, F.pct1, A.roi, B.roi).replace(/%–/, '–'), T.kRoiSub],
    [T.kCash, range(F, F.short, A.peakCash, B.peakCash), T.kCashSub],
  ];
  const tw = W / 5;
  tiles.forEach(([label, value, capn], i) => {
    const x = M + i * tw;
    c.para(x, y, tw - 12, label, { font: 'F2', size: 6, color: GOLD, lead: 7.5, maxLines: 2 });
    c.text(x, y + 28, value, { font: 'F2', size: 13.5, color: GREEN, maxW: tw - 6 });
    c.para(x, y + 39, tw - 12, capn, { size: 6.5, color: GRAY, lead: 8, maxLines: 2 });
  });
  y += 64;
  c.line(M, y, R, y, [0.85, 0.8, 0.68], 0.6);
  y += 20;
  head(c, M, y, T.cmpHead);
  y += 18;
  const cA = 355, cB = 493;
  c.text(cA, y, T.optA, { font: 'F2', size: 6.5, color: GRAY, align: 'center' });
  c.text(cB, y, T.optB, { font: 'F2', size: 6.5, color: GRAY, align: 'center' });
  c.line(M, y + 5, R, y + 5, RULE, 0.5);
  y += 18;
  const rows = [
    [T.rAtClosing, F.money(A.cashAtClosing), F.money(B.cashAtClosing)],
    [T.rPeak, `${F.money(A.peakCash)} (${F.my(A.peakDate)})`, `${F.money(B.peakCash)} (${F.my(B.peakDate)})`],
    [T.rAvg, F.money(A.avgCapital), F.money(B.avgCapital)],
    [T.rFinCost, F.money(A.financeCost), '—'],
    [T.rProfit, F.money(A.profit), F.money(B.profit), true],
    [T.rRoiPeak, F.pct1(A.roi), F.pct1(B.roi)],
    [T.rAnnual, F.pct1(A.annualized), F.pct1(B.annualized)],
    [T.rRoiAvg, F.pct1(A.roiAvg), F.pct1(B.roiAvg)],
    [T.rBreakEven, F.money(A.breakEven), F.money(B.breakEven)],
  ];
  for (const [label, a, b, strong] of rows) {
    if (strong) c.rect(M - 3, y - 10, W + 6, 14.5, CREAM);
    const font = strong ? 'F2' : 'F1';
    c.text(M, y, label, { font, size: 8.5 });
    c.text(cA, y, a, { font, size: 8.5, align: 'center' });
    c.text(cB, y, b, { font, size: 8.5, align: 'center' });
    y += 15.5;
  }
  y += 2;
  c.line(M, y, R, y, RULE, 0.5);
  y += 22;

  // coluna esquerda: trade-off e dados básicos
  const LX = M, LW = 222, RX = 310;
  head(c, LX, y, T.tradeHead);
  let ly = c.para(LX, y + 18, LW, T.trade({
    finCost: F.money(A.financeCost), profitB: F.money(B.profit), beB: F.money(B.breakEven),
    mult: F.x(A.peakCash > 0 ? B.peakCash / A.peakCash : 0), peakB: F.money(B.peakCash), peakA: F.money(A.peakCash),
    roiA: F.pct1(A.roi), roiB: F.pct1(B.roi), freed: F.money(Math.round((B.peakCash - A.peakCash) / 1000) * 1000),
  }), { size: 8.3, lead: 11.8 });
  ly += 10;
  head(c, LX, ly, T.basicsHead);
  ly += 17;
  const basics = [
    [T.bLand, `${F.money(J.land)} / ${F.money(J.constr)}`],
    J.sqft ? [T.bSize, `${D.sf} SF / ${D.psf} ${T.perSf}`] : null,
    [T.bNet(F.pctAuto(J.saleCostPct)), F.money(J.netSale)],
    [T.bTerm, T.months(J.months - 1)],
  ].filter(Boolean);
  for (const [label, value] of basics) {
    const end = c.para(LX, ly, 118, label, { size: 8, color: GRAY, lead: 10 });
    c.text(LX + LW, ly, value, { font: 'F2', size: 8, align: 'right' });
    ly = end + 6;
  }

  // coluna direita: sensibilidade
  head(c, RX, y, T.sensHead);
  let ry = y + 19;
  const sx = { sc: RX, price: RX + 45, pa: 463, ra: 494, pb: 531, rb: R };
  c.text(sx.sc, ry, T.scenario, { font: 'F2', size: 6, color: GRAY });
  c.text(sx.price, ry, T.price, { font: 'F2', size: 6, color: GRAY });
  c.text((sx.pa + sx.ra) / 2 - 12, ry, T.aFin, { font: 'F2', size: 6, color: GRAY, align: 'center' });
  c.text((sx.pb + sx.rb) / 2 - 12, ry, T.bCash, { font: 'F2', size: 6, color: GRAY, align: 'center' });
  ry += 9;
  for (const k of ['pa', 'pb']) c.text(sx[k], ry, T.profit, { font: 'F2', size: 5.5, color: GRAY, align: 'right' });
  for (const k of ['ra', 'rb']) c.text(sx[k], ry, T.roi, { font: 'F2', size: 5.5, color: GRAY, align: 'right' });
  c.line(RX, ry + 4, R, ry + 4, RULE, 0.5);
  ry += 15;
  for (const s of S.sensitivity) {
    const base = Math.abs(s.scenario) < 1e-9, font = base ? 'F2' : 'F1';
    if (base) c.rect(RX - 3, ry - 9.5, R - RX + 6, 13.5, CREAM);
    c.text(sx.sc, ry, base ? T.base : (s.scenario > 0 ? '+' : '–') + F.pct0(Math.abs(s.scenario)), { font, size: 7.5 });
    c.text(sx.price, ry, F.money(s.price), { font, size: 7.5 });
    c.text(sx.pa, ry, F.money(s.fin.profit), { font, size: 7.5, align: 'right' });
    c.text(sx.ra, ry, F.pct1(s.fin.roi), { font, size: 7.5, align: 'right' });
    c.text(sx.pb, ry, F.money(s.cash.profit), { font, size: 7.5, align: 'right' });
    c.text(sx.rb, ry, F.pct1(s.cash.roi), { font, size: 7.5, align: 'right' });
    ry += 14;
  }
  ry += 6;
  c.text(RX, ry, T.protectHead, { font: 'F2', size: 7.8 });
  c.para(RX, ry + 11, R - RX, T.protect(Object.assign({ roiA10: F.pct1(D.s10.fin.roi), roiB10: F.pct1(D.s10.cash.roi) }, D.be)),
    { size: 7.8, color: GRAY, lead: 10.8 });

  c.line(M, 690, R, 690, RULE, 0.5);
  c.para(M, 701, W, T.foot1({ price: F.money(J.sale) }), { size: 6.3, color: GRAY, lead: 8.3 });

  /* ---- página 2 ---- */
  const d = canvas(612, 792);
  d.text(M, 54, D.name.toUpperCase(), { font: 'F2', size: 6.5, color: GOLD, cs: 2.6, maxW: W });
  d.text(M, 76, T.p2Title, { font: 'F2', size: 16.5, color: GREEN, maxW: W });
  d.line(M, 86, R, 86, GREEN, 1.8);
  y = 106;
  const kv = (x, yy, label, value, bold) => {
    d.text(x, yy, label, { font: bold ? 'F2' : 'F1', size: 7.8, maxW: 180 });
    d.text(x + 222, yy, value, { font: 'F2', size: 8, align: 'right' });
  };
  head(d, M, y, T.finHead);
  head(d, RX, y, T.datesHead);
  const fin = [
    [T.fLoan(F.pct0(J.financedPct)), F.money(A.loanUsed), true],
    ['   ' + T.fAdv(F.pct0(A.landAdvPct)), F.money(A.landAdvance)],
    ['   ' + T.fReimb, F.money(A.reimbursed)],
    [T.fRate, F.pctAuto(A.rate)],
    [T.fFees(F.pctAuto(A.loanFeesPct)), F.money(A.loanFees)],
    [T.fInterest, F.money(A.interest)],
    [T.fDelay, T.days(A.reimbDelayDays)],
  ];
  const dates = [
    [T.dStart, F.day(J.constrStart)], [T.dClose, F.day(J.closing)],
    [T.dPeakA(F.money(A.peakCash)), F.day(A.peakDate)], [T.dPeakB(F.money(B.peakCash)), F.day(B.peakDate)],
    J.lastDraw ? [T.dDone, F.my(J.lastDraw)] : null, [T.dSale, F.my(J.saleDate)],
  ].filter(Boolean);
  fin.forEach(([l, v, b], i) => kv(M, y + 17 + i * 13, l, v, b));
  dates.forEach(([l, v], i) => kv(RX, y + 17 + i * 13, l, v));
  y += 17 + 7 * 13 + 12;

  head(d, M, y, T.drawsHead);
  y += 17;
  const dx = { n: M, phase: M + 19, pct: 262, pay: 310, amt: 432, bank: 446 };
  d.text(dx.n, y, '#', { font: 'F2', size: 6, color: GRAY });
  d.text(dx.phase, y, T.cPhase, { font: 'F2', size: 6, color: GRAY });
  d.text(dx.pct, y, T.cPct, { font: 'F2', size: 6, color: GRAY });
  d.text(dx.pay, y, T.cPay, { font: 'F2', size: 6, color: GRAY });
  d.text(dx.amt, y, T.cAmount, { font: 'F2', size: 6, color: GRAY, align: 'right' });
  d.text(dx.bank, y, T.cBank, { font: 'F2', size: 6, color: GRAY });
  d.line(M, y + 4, R, y + 4, RULE, 0.5);
  y += 14;
  const dstep = S.draws.length > 8 ? 10.5 : 12;
  S.draws.forEach((r, i) => {
    d.text(dx.n, y, String(i + 1), { size: 7.5 });
    d.text(dx.phase, y, r.desc, { size: 7.5, maxW: 180 });
    d.text(dx.pct, y, F.pctAuto(r.pct), { size: 7.5 });
    d.text(dx.pay, y, r.payDate != null ? F.day(r.payDate) : '—', { size: 7.5 });
    d.text(dx.amt, y, F.money(r.amount), { size: 7.5, align: 'right' });
    d.text(dx.bank, y, r.reimbDate != null ? F.day(r.reimbDate) : '—', { size: 7.5, color: GRAY });
    y += dstep;
  });
  d.rect(M - 3, y - 9, W + 6, 12.5, CREAM);
  d.text(dx.phase, y, T.drawsTotal, { font: 'F2', size: 7.5 });
  d.text(dx.pct, y, '100%', { font: 'F2', size: 7.5 });
  d.text(dx.amt, y, F.money(J.constr), { font: 'F2', size: 7.5, align: 'right' });
  d.text(dx.bank, y, T.noReimb, { size: 7, color: GRAY });
  y += 26;

  /* gráfico: barras = financiado, linha = à vista */
  head(d, M, y, T.chartHead);
  const top = y + 30, plotH = 112, x0 = 84, x1 = R;
  const mo = S.monthly, n = mo.length;
  const maxV = Math.max(B.peakCash, A.peakCash, 1);
  const rawStep = maxV / 4.5, mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rawStep);
  const yMax = Math.ceil(maxV / step) * step;
  const py = (v) => top + plotH - (v / yMax) * plotH;
  const slot = (x1 - x0) / n, px = (i) => x0 + slot * (i + 0.5);
  for (let v = step; v <= yMax + step / 2; v += step) {
    d.line(x0 - 4, py(v), x1, py(v), RULE, 0.4);
    d.text(x0 - 8, py(v) + 2.5, F.short(v), { size: 6, color: MUTED, align: 'right' });
  }
  let peakI = 0;
  mo.forEach((m, i) => { if (m.fin.held > mo[peakI].fin.held) peakI = i; });
  mo.forEach((m, i) => {
    if (m.fin.held <= 0) return;
    const bh = (m.fin.held / yMax) * plotH;
    d.rect(px(i) - slot * 0.33, top + plotH - bh, slot * 0.66, bh, i === peakI ? GOLD : GREEN);
  });
  d.line(x0 - 4, top + plotH, x1, top + plotH, GRAY, 0.6);
  // linha em degraus da opção à vista, descendo a zero na venda
  const pts = [];
  mo.forEach((m, i) => {
    const v = i === n - 1 ? 0 : m.cash.held;
    if (i === n - 1) pts.push([px(i) - slot * 0.5, py(mo[i - 1] ? mo[i - 1].cash.held : 0)]);
    pts.push([px(i), py(v)]);
  });
  d.poly(pts, GOLD, 1.6);
  let peakB = 0;
  mo.forEach((m, i) => { if (m.cash.held > mo[peakB].cash.held) peakB = i; });
  d.text(Math.min(px(peakB), x1 - 4), py(mo[peakB].cash.held) - 6, T.peakCashLbl(F.short(B.peakCash)), { font: 'F2', size: 6.5, color: GOLD, align: 'right' });
  d.text(Math.max(x0 + 40, Math.min(px(peakI), x1 - 40)), py(mo[peakI].fin.held) - 6, T.peakFinLbl(F.short(A.peakCash)), { font: 'F2', size: 6.5, color: GREEN, align: 'center' });
  const every = Math.max(1, Math.ceil(n / 10));
  mo.forEach((m, i) => {
    if (i === n - 1) d.text(px(i), top + plotH + 10, T.sale, { font: 'F2', size: 6, color: GREEN, align: 'center' });
    else if (i % every === 0 && i < n - 1 - every / 2) d.text(px(i), top + plotH + 10, F.myy(m.start), { size: 6, color: MUTED, align: 'center' });
  });
  y = top + plotH + 26;
  const held = mo.slice(0, -1).map((m) => m.fin.held).filter((v) => v > 0);
  y = d.para(M, y, W, T.chartCap({
    minA: F.short(Math.min(...held)), maxA: F.short(Math.max(...held)), n: n - 1,
    peakB: F.money(B.peakCash), peakBDate: F.my(B.peakDate), sale: F.my(J.saleDate),
  }), { size: 7.6, lead: 10.4 });
  d.para(M, y + 8, W, T.disc({
    fin: F.pct0(J.financedPct), rate: F.pctAuto(A.rate), fees: F.pctAuto(A.loanFeesPct), adv: F.pct0(A.landAdvPct),
    reimb: F.pct0(A.reimbPct), delay: A.reimbDelayDays, costs: F.pctAuto(J.saleCostPct), sale: F.my(J.saleDate), price: F.money(J.sale),
  }), { size: 6.3, color: GRAY, lead: 8.3 });
  return [c.items, d.items];
}

/* =====================================================
   Documento 2 — Visão Geral (apresentação 16:9)
===================================================== */
const SW = 960, SH = 540, SX = 40;
function slide(D, pages, dark) {
  const c = canvas(SW, SH);
  if (dark) c.rect(0, 0, SW, SH, GREEN);
  c.dark = dark;
  pages.push(c);
  return c;
}
function slideTitle(c, text) {
  let size = 25;
  while (size > 16 && Pdf.textWidth(text, 'F3', size) > SW - 2 * SX) size -= 1;
  c.text(SX, 68, text, { font: 'F3', size, color: c.dark ? WHITE : GREEN });
}
function slideFooters(D, pages) {
  pages.forEach((c, i) => {
    if (i === 0) return;
    const w = c.text(SX, 522, D.brand.toUpperCase(), { font: 'F2', size: 6.5, color: GOLD });
    c.text(SX + w + 6, 522, `|  ${D.T.footDoc(D.name)}  |  ${D.F.today()}`, { size: 6.5, color: c.dark ? SOFT : MUTED, maxW: 700 });
    c.text(SW - SX, 522, String(i + 1), { size: 6.5, color: c.dark ? SOFT : MUTED, align: 'right' });
  });
}
function tableHeader(c, x, y, w, h, cols) {
  c.rect(x, y, w, h, GREEN);
  for (const col of cols) {
    c.text(col.align === 'right' ? col.x - 6 : col.align === 'center' ? col.x : col.x + 6, y + h / 2 + 2.5, col.label,
      { font: 'F2', size: col.size || 7.5, color: WHITE, align: col.align });
  }
}

function overviewPages(D) {
  const { F, T, A, B, J, S, p } = D;
  const pages = [];
  const comps = (p.comps || []).filter((x) => x.address && Inv.num(x.price) > 0).slice(0, 9);
  const hls = [[p.hl1t, p.hl1x], [p.hl2t, p.hl2x], [p.hl3t, p.hl3x]].filter(([t, x]) => t || x);
  const hasArea = !!(p.areaText || hls.length || p.buyerText);
  const nDraws = S.draws.length;
  const common = {
    constr: F.money(J.constr), psf: D.psf, n: nDraws, sf: D.sf, where: D.where, price: F.money(J.sale),
    sale: F.myLong(J.saleDate), done: J.lastDraw ? F.myLong(J.lastDraw) : F.myLong(J.saleDate), net: F.money(J.netSale),
    land: F.money(J.land), salePsf: D.salePsf, finCost: F.money(A.financeCost), costs: F.pctAuto(J.saleCostPct),
    comps: comps.length > 0,
  };

  /* 1 — capa */
  let c = slide(D, pages, true);
  c.rrect(32, 32, SW - 64, SH - 64, 8, null, GOLD, 1);
  c.text(64, 80, D.brand.toUpperCase(), { font: 'F2', size: 9, color: GOLD, cs: 3 });
  const coverTitle = T.project(p.area || D.name);
  let cs = 31;
  while (cs > 18 && Pdf.textWidth(coverTitle, 'F3', cs) > SW - 128) cs -= 1;
  c.text(64, 212, coverTitle, { font: 'F3', size: cs, color: WHITE });
  c.text(64, 262, T.overview, { font: 'F2', size: 13, color: GOLD, cs: 2.4 });
  let y = c.para(64, 316, 820, p.description || T.coverAuto(common), { size: 11, color: WHITE, lead: 16, maxLines: 4 });
  c.para(64, y, 820, T.coverLine2(hasArea, comps.length > 0), { size: 11, color: WHITE, lead: 16 });
  c.text(64, 470, [p.city, T.closeSale(F.my(J.closing), F.my(J.saleDate), J.months - 1), F.today()].filter(Boolean).join('   |   '),
    { size: 8, color: SOFT, maxW: SW - 128 });

  /* 2 — a oportunidade em resumo */
  c = slide(D, pages);
  slideTitle(c, T.s2Title);
  c.para(SX, 126, SW - 2 * SX, T.s2Lead, { font: 'F3', size: 17, color: INK, lead: 23 });
  const cards = [
    [F.money(J.totalCost), T.s2c1(J.other > 0)],
    [F.money(J.sale), T.s2c2(D.sf)],
    [range(F, F.short, A.profit, B.profit), T.s2c3],
  ];
  cards.forEach(([big, small], i) => {
    const x = SX + i * 302;
    c.rrect(x, 190, 280, 138, 6, CREAM, GOLD, 0.8);
    c.text(x + 140, 250, big, { font: 'F3', size: 22, color: INK, align: 'center' });
    c.para(x + 22, 284, 236, small, { size: 8.5, color: GRAY, align: 'center', lead: 11.5, maxLines: 3 });
  });
  c.para(SX, 384, SW - 2 * SX, T.s2Para({ m: J.months - 1, price: F.money(J.sale), psf: D.salePsf, comps: comps.length > 0 }),
    { size: 10.5, color: INK, lead: 15.5 });
  c.para(SX, 472, SW - 2 * SX, T.s2Foot, { font: 'F4', size: 7.2, color: MUTED, lead: 9.5 });

  /* 3 — por que este bairro (só com os textos preenchidos) */
  if (hasArea) {
    c = slide(D, pages, true);
    slideTitle(c, T.whyTitle(p.area || p.city || D.name));
    if (p.areaText) c.para(SX, 132, SW - 2 * SX, p.areaText, { size: 10.5, color: WHITE, lead: 15.5, maxLines: 5 });
    const cw = (SW - 2 * SX - (hls.length - 1) * 22) / Math.max(1, hls.length);
    hls.forEach(([title, text], i) => {
      const x = SX + i * (cw + 22);
      c.rrect(x, 216, cw, 144, 6, GREEN2, GOLD, 0.8);
      let hs = 17;
      while (hs > 10 && Pdf.textWidth(title || '', 'F3', hs) > cw - 30) hs -= 1;
      c.text(x + cw / 2, 274, title || '', { font: 'F3', size: hs, color: GOLD, align: 'center' });
      c.para(x + 20, 314, cw - 40, text || '', { size: 8.5, color: WHITE, align: 'center', lead: 11.5, maxLines: 3 });
    });
    if (p.buyerText) c.para(SX, hls.length ? 412 : 250, SW - 2 * SX, p.buyerText, { font: 'F4', size: 10.5, color: SOFT, lead: 15.5, maxLines: 4 });
  }

  /* 4 — comparáveis (só com comparáveis cadastradas) */
  if (comps.length) {
    c = slide(D, pages);
    slideTitle(c, T.compsTitle(F.money(J.sale)));
    c.text(SX, 110, T.compsSub, { size: 8.5, color: INK });
    const tx = SX, twid = 615;
    const cols = [
      { label: T.hAddr, x: tx }, { label: T.hYear, x: tx + 208 }, { label: T.hDist, x: tx + 252 }, { label: T.hStatus, x: tx + 320 },
      { label: T.hPrice, x: tx + 520, align: 'right' }, { label: T.hSf, x: tx + 568, align: 'right' }, { label: T.hPsf, x: tx + twid, align: 'right' },
    ];
    const inAvg = comps.filter((x) => x.inAvg !== false && Inv.num(x.sqft) > 0);
    const nRows = comps.length + (inAvg.length > 1 ? 1 : 0) + 1;
    const rh = Math.min(27, 330 / (nRows + 1));
    let ty = 128;
    tableHeader(c, tx, ty, twid, rh, cols);
    ty += rh;
    const rowText = (cells, o) => cells.forEach((cell, i) => {
      if (cell === '' || cell == null) return;
      const col = cols[i];
      c.text(col.align === 'right' ? col.x - 6 : col.x + 6, ty + rh / 2 + 2.5, cell,
        Object.assign({ size: 7.5, align: col.align, maxW: i === 0 ? 200 : i === 3 ? 130 : undefined }, o));
    });
    const psfOf = (x) => (Inv.num(x.sqft) > 0 ? Inv.num(x.price) / Inv.num(x.sqft) : null);
    for (const x of comps) {
      c.line(tx, ty + rh, tx + twid, ty + rh, RULE, 0.5);
      rowText([x.address, x.year || '', x.dist || '', x.status || '', F.money(Inv.num(x.price)),
        Inv.num(x.sqft) ? F.num(Inv.num(x.sqft)) : '', psfOf(x) != null ? F.money(psfOf(x)) : ''], {});
      ty += rh;
    }
    const psfs = inAvg.map(psfOf);
    const avgPsf = psfs.length ? psfs.reduce((s, v) => s + v, 0) / psfs.length : null;
    if (inAvg.length > 1) {
      c.rect(tx, ty, twid, rh, CREAM);
      rowText([T.compsAvg(inAvg.length), '', '', '', F.money(inAvg.reduce((s, x) => s + Inv.num(x.price), 0) / inAvg.length), '', '~' + F.money(avgPsf)], { font: 'F2' });
      ty += rh;
    }
    c.rect(tx, ty, twid, rh, GREEN);
    rowText([T.thisProject, String(new Date(J.lastDraw || J.saleDate).getUTCFullYear()), '', T.suggested, F.money(J.sale), D.sf, D.salePsf],
      { font: 'F2', color: WHITE });
    c.line(tx, 128, tx, ty + rh, RULE, 0.5);
    c.line(tx + twid, 128, tx + twid, ty + rh, RULE, 0.5);
    if (avgPsf != null && J.salePerSqft != null) {
      const below = J.salePerSqft <= avgPsf;
      c.rrect(680, 128, 240, 250, 6, GREEN);
      c.text(696, 232, T.posEyebrow(below), { font: 'F2', size: 7, color: GOLD, cs: 2 });
      const by = c.para(700, 268, 200, T.posText({ n: inAvg.length, min: F.money(Math.min(...psfs)), max: F.money(Math.max(...psfs)), avg: F.money(avgPsf) }),
        { size: 8.5, color: WHITE, align: 'center', lead: 12 });
      c.para(700, by + 12, 200, T.posText2({ psf: D.salePsf, diff: F.pct0(Math.abs(1 - J.salePerSqft / avgPsf)), dir: below ? T.below : T.above }),
        { size: 8.5, color: WHITE, align: 'center', lead: 12 });
    }
    c.para(SX, 488, SW - 2 * SX, T.compsFoot, { font: 'F4', size: 7.2, color: MUTED, lead: 9.5 });
  }

  /* 5 — o que vamos construir */
  c = slide(D, pages);
  slideTitle(c, T.buildTitle);
  c.rrect(SX, 128, 425, 184, 6, CREAM, GOLD, 0.8);
  c.text(SX + 22, 200, p.tagline || T.buildDefault, { font: 'F3', size: 14, color: INK, maxW: 380 });
  c.para(SX + 22, 220, 380, p.description || T.buildAuto(common), { size: 9, color: GRAY, lead: 12.5, maxLines: 6 });
  c.rrect(SX, 330, 425, 165, 6, GREEN);
  c.text(SX + 22, 392, T.buildCostHead, { font: 'F3', size: 14, color: GOLD });
  c.para(SX + 22, 412, 380, T.buildCost(common), { size: 9, color: WHITE, lead: 12.5 });
  c.text(500, 146, T.stagesHead(nDraws), { font: 'F3', size: 12, color: INK });
  const sh = Math.min(34, 300 / Math.max(1, nDraws));
  let sy = 160;
  S.draws.forEach((r, i) => {
    c.rrect(500, sy, 420, sh, 0, null, RULE, 0.5);
    c.line(738, sy, 738, sy + sh, RULE, 0.5);
    const mid = sy + sh / 2 + 2.5;
    c.text(508, mid, `${i + 1}. ${r.desc}`, { size: 8, maxW: 222 });
    c.text(820, mid, r.payDate != null ? F.my(r.payDate) : '—', { size: 8, align: 'right' });
    c.text(912, mid, F.money(r.amount), { size: 8, align: 'right' });
    sy += sh;
  });
  c.text(500, sy + 16, T.buildNote(common), { font: 'F4', size: 8, color: MUTED });

  /* 6 — para onde vai o dinheiro */
  c = slide(D, pages);
  slideTitle(c, T.moneyTitle(F.money(J.totalCost)));
  const blocks = [
    [F.money(J.land), T.mLand, T.mLandSub(D.where)],
    [F.money(J.constr), T.mBuild, T.mBuildSub({ n: nDraws, sf: D.sf, psf: D.psf })],
    J.other > 0 ? [F.money(J.other), T.mOther, T.mOtherSub] : null,
  ].filter(Boolean);
  const bh = blocks.length === 3 ? 84 : 112, gap = blocks.length === 3 ? 14 : 24;
  blocks.forEach(([amount, title, text], i) => {
    const by = 128 + i * (bh + gap);
    c.rrect(SX, by, 188, bh, 6, GREEN);
    c.text(SX + 94, by + bh / 2 + 7, amount, { font: 'F3', size: 20, color: GOLD, align: 'center' });
    c.text(SX + 206, by + bh / 2 - 8, title, { font: 'F3', size: 13, color: INK });
    c.para(SX + 206, by + bh / 2 + 14, 660, text, { size: 9.5, color: GRAY, lead: 13 });
  });
  c.rrect(SX, 416, SW - 2 * SX, 70, 6, CREAM);
  c.para(SX + 20, 446, SW - 2 * SX - 40, T.mTotal({ total: F.money(J.totalCost), finCost: common.finCost, net: common.net, costs: common.costs }),
    { size: 9.5, color: INK, lead: 14 });

  /* 7 — duas opções de financiamento */
  c = slide(D, pages, true);
  slideTitle(c, T.optTitle);
  const opt = (x, title, text, lines) => {
    c.rrect(x, 118, 430, 314, 6, GREEN2, GOLD, 0.8);
    c.text(x + 22, 160, title, { font: 'F3', size: 14, color: GOLD });
    c.para(x + 22, 226, 386, text, { size: 9.5, color: WHITE, lead: 13.5 });
    lines.forEach((ln, i) => c.text(x + 22, 312 + i * 24, ln, { font: 'F2', size: 9.5, color: WHITE, maxW: 386 }));
  };
  opt(SX, T.optAHead, T.optAText({ fin: F.pct0(J.financedPct), finCost: common.finCost }),
    [T.oMax(F.short(A.peakCash)), T.oProfitA(F.money(A.profit)), T.oRoi(F.pct0(A.roi)), T.oAnn(F.pct0(A.annualized))]);
  opt(SX + 450, T.optBHead, T.optBText({ finCost: common.finCost }),
    [T.oMax(F.short(B.peakCash)), T.oProfitB(F.money(B.profit)), T.oRoi(F.pct0(B.roi)), T.oAnn(F.pct0(B.annualized))]);
  c.para(SX, 462, SW - 2 * SX, T.optNote({ pB: F.short(B.profit), pA: F.short(A.profit), rA: F.pct0(A.roi), rB: F.pct0(B.roi),
    freed: F.short(B.peakCash - A.peakCash) }), { font: 'F4', size: 10, color: SOFT, lead: 14.5 });

  /* 8 e 9 — caixa mês a mês, uma página por opção */
  const monthSlide = (key, label, X) => {
    c = slide(D, pages);
    slideTitle(c, T.monthTitle(label));
    c.para(SX, 100, SW - 2 * SX, T.monthSub, { size: 7.8, color: INK, lead: 10.5 });
    const mo = S.monthly, half = Math.ceil(mo.length / 2);
    const rh = Math.min(28, 318 / (half + 1)), fs = Math.max(6, Math.min(8, rh * 0.42));
    let peak = 0;
    mo.forEach((m, i) => { if (m[key].held > mo[peak][key].held) peak = i; });
    [0, 1].forEach((side) => {
      const x = SX + side * 455, w = 430;
      const cols = [{ label: T.hMonth, x }, { label: T.hIn, x: x + 210, align: 'right' },
        { label: T.hBack, x: x + 300, align: 'right' }, { label: T.hHeld, x: x + w, align: 'right' }];
      let ty = 132;
      tableHeader(c, x, ty, w, rh, cols.map((k) => Object.assign({ size: fs }, k)));
      ty += rh;
      mo.slice(side * half, (side + 1) * half).forEach((m, k) => {
        const i = side * half + k, strong = i === peak || i === mo.length - 1;
        if (strong) c.rect(x, ty, w, rh, CREAM);
        c.rrect(x, ty, w, rh, 0, null, RULE, 0.5);
        const o = { size: fs, font: strong ? 'F2' : 'F1' }, mid = ty + rh / 2 + fs * 0.32;
        c.text(x + 6, mid, F.myy(m.start), o);
        c.text(x + 204, mid, F.k(m[key].put), Object.assign({ align: 'right' }, o));
        c.text(x + 294, mid, F.k(m[key].back), Object.assign({ align: 'right' }, o));
        c.text(x + w - 6, mid, i === mo.length - 1 ? '0' : F.k(m[key].held), Object.assign({ align: 'right' }, o));
        ty += rh;
      });
    });
    c.para(SX, 478, SW - 2 * SX, T.monthNote({ peakDate: cap(F.my(X.peakDate)), peak: F.short(X.peakCash), sale: F.my(J.saleDate),
      back: F.short(mo[mo.length - 1][key].back), profit: F.money(X.profit) }), { size: 8.5, color: INK, lead: 12 });
  };
  monthSlide('fin', T.monthA, A);
  monthSlide('cash', T.monthB, B);

  /* 10 — proteção contra queda */
  c = slide(D, pages);
  slideTitle(c, T.downTitle);
  c.text(SX, 124, T.downSub, { size: 10, color: INK });
  const dcols = [{ label: T.hIfSells, x: SX }, { label: T.hProfitA, x: SX + 280, align: 'center' }, { label: T.hRoi, x: SX + 372, align: 'center' },
    { label: T.hProfitB, x: SX + 462, align: 'center' }, { label: T.hRoi, x: SX + 590, align: 'center' }];
  let dy = 150;
  const dW = 645, dh = 38;
  tableHeader(c, SX, dy, dW, dh, dcols);
  dy += dh;
  for (const s of S.sensitivity.slice().reverse()) {
    const base = Math.abs(s.scenario) < 1e-9;
    if (base) c.rect(SX, dy, dW, dh, CREAM);
    c.rrect(SX, dy, dW, dh, 0, null, RULE, 0.5);
    const mid = dy + dh / 2 + 3, tag = base ? T.sTarget : s.scenario > 0 ? T.sAbove(F.pct0(s.scenario)) : T.sBelow(F.pct0(-s.scenario));
    c.text(SX + 6, mid, `${F.money(s.price)}  ${tag}`, { size: 8.5 });
    c.text(dcols[1].x, mid, F.money(s.fin.profit), { size: 8.5, align: 'center' });
    c.text(dcols[2].x, mid, F.pct0(s.fin.roi), { size: 8.5, align: 'center' });
    c.text(dcols[3].x, mid, F.money(s.cash.profit), { size: 8.5, align: 'center' });
    c.text(dcols[4].x, mid, F.pct0(s.cash.roi), { size: 8.5, align: 'center' });
    dy += dh;
  }
  c.rrect(705, 150, 215, dh * 6, 6, GREEN);
  c.text(720, 226, T.downEyebrow, { font: 'F2', size: 7, color: GOLD, cs: 2 });
  c.para(722, 262, 181, T.downBox(D.be), { size: 8.8, color: WHITE, align: 'center', lead: 12.5 });
  c.para(SX, 432, SW - 2 * SX, T.downNote({ peakA: F.short(A.peakCash), peakB: F.short(B.peakCash), m: J.months - 1, roiA10: F.pct0(D.s10.fin.roi) }),
    { size: 10, color: INK, lead: 14.5 });

  /* 11 — riscos */
  c = slide(D, pages, true);
  slideTitle(c, T.riskTitle);
  const riskD = Object.assign({}, common, D.be);
  [[T.r1, T.r1t(riskD)], [T.r2, T.r2t(riskD)], [T.r3, T.r3t(riskD)]].forEach(([h, t], i) => {
    const ry = 180 + i * 112;
    c.text(SX, ry, h, { font: 'F2', size: 10.5, color: GOLD });
    c.para(SX, ry + 16, SW - 2 * SX - 40, t, { size: 9.5, color: WHITE, lead: 13.5 });
  });

  /* 12 — resumo */
  c = slide(D, pages);
  slideTitle(c, T.sumTitle);
  const sums = [T.sum1(common), T.sum2(common), T.sum3(common), T.sum4({
    pA: F.money(A.profit), peakA: F.short(A.peakCash), annA: F.pct0(A.annualized),
    pB: F.money(B.profit), peakB: F.short(B.peakCash), annB: F.pct0(B.annualized) })];
  sums.forEach((t, i) => {
    const sy2 = 132 + i * 80;
    c.rrect(SX + 14, sy2, 30, 30, 15, GREEN, GOLD, 1);
    c.text(SX + 29, sy2 + 19, String(i + 1), { font: 'F3', size: 12, color: GOLD, align: 'center' });
    c.para(SX + 66, sy2 + 13, SW - 2 * SX - 100, t, { size: 10.5, color: INK, lead: 15 });
  });
  c.para(SX, 480, SW - 2 * SX, T.sumNote, { font: 'F4', size: 8.5, color: MUTED, lead: 11.5 });

  slideFooters(D, pages);
  return pages.map((x) => x.items);
}

/* ===== API ===== */
function comparisonPdf(p, lang, profile, params) {
  const D = pack(p, lang, profile, params);
  return D.ready ? Pdf.buildPdf(comparisonPages(D), { extFonts: true }) : null;
}
function overviewPdf(p, lang, profile, params) {
  const D = pack(p, lang, profile, params);
  return D.ready ? Pdf.buildPdf(overviewPages(D), { extFonts: true }) : null;
}
const fileBase = (kind, lang) => TX[lang === 'pt' ? 'pt' : 'en'][kind === 'overview' ? 'fileOv' : 'fileCmp'];

const Decks = { comparisonPdf, overviewPdf, fileBase };
if (isNode) module.exports = Decks;
else global.Decks = Decks;
})(typeof window !== 'undefined' ? window : globalThis);
