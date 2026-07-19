/*
 * Testa a integridade estrutural do PDF gerado por pdfgen.js:
 * cabeçalho, trailer, offsets da tabela xref, páginas e conteúdo.
 * Rodar: node test/pdf.test.js
 */
'use strict';
const Pdf = require('../pdfgen.js');

let fails = 0;
function check(label, ok) {
  if (!ok) { fails++; console.log('FAIL ' + label); }
}

const meses = Array.from({ length: 50 }, (_, i) => `m${i + 1}`);
const doc = {
  title: 'Deal de Teste — Ação → ok',
  subtitle: 'InvestCalc · gerada em 19/07/2026',
  sections: [
    { heading: 'Premissas', rows: [['Preço do terreno', '$350,000'], ['Construção', '$576,000']] },
    { heading: 'Resultados', rows: [['Lucro projetado', '$184,768', 'good'], ['ROI', '-9,1%', 'bad']] },
  ],
  table: {
    heading: 'Sensibilidade',
    cols: [{ label: 'Cenário', x: 54 }, { label: 'Preço', x: 160 }],
    rows: [['-10%', '$1,170,000'], ['Base', '$1,300,000']],
    strongRow: 1,
  },
  charts: [
    { title: 'Exposição de caixa', xlabels: meses,
      series: [{ name: 'Exposição', color: 'blue', values: meses.map((_, i) => i * 1000) },
               { name: 'Saldo', color: 'green', values: meses.map((_, i) => 50000 - i * 500) }] },
    { title: 'Do investimento ao retorno', xlabels: meses,
      series: [{ name: 'Posição', color: 'blue', values: meses.map((_, i) => i * 2000 - 40000) }] },
  ],
  monthly: {
    heading: 'Cashflow mensal completo',
    cols: [{ label: 'Mês', x: 54 }, { label: 'Líquido', x: 200 }],
    rows: meses.map((m, i) => [m, [`$${i}`, i % 2 ? 'good' : 'bad']]),
  },
  footer: 'Gerado pelo InvestCalc.',
};

const bytes = Pdf.analysisPdf(doc);
const asStr = Buffer.from(bytes).toString('latin1');

check('começa com %PDF-1.4', asStr.startsWith('%PDF-1.4\n'));
check('termina com %%EOF', asStr.endsWith('%%EOF\n'));

// 1 resumo + 1 gráficos + 2 de cashflow (50 linhas, 42 por página) = 4 páginas
const pageCount = asStr.match(/\/Count (\d+)/);
check('4 páginas', pageCount && +pageCount[1] === 4);
check('4 objetos de página', (asStr.match(/\/Type \/Page /g) || []).length === 4);

// startxref aponta exatamente para a tabela xref
const sx = asStr.match(/startxref\n(\d+)\n%%EOF\n$/);
check('tem startxref', !!sx);
check('startxref aponta para "xref"', sx && asStr.slice(+sx[1], +sx[1] + 4) === 'xref');

// cada offset da xref aponta para "N 0 obj" (4 fixos + 2 por página = 12)
const xrefBlock = asStr.slice(+sx[1]);
const offsets = [...xrefBlock.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => +m[1]);
check('xref tem 12 objetos', offsets.length === 12);
offsets.forEach((off, i) => {
  check(`offset do obj ${i + 1} correto`, asStr.slice(off).startsWith(`${i + 1} 0 obj`));
});

// cada /Length bate com o tamanho real do stream
let pos = 0, streams = 0;
while (true) {
  const m = asStr.slice(pos).match(/<< \/Length (\d+) >>\nstream\n/);
  if (!m) break;
  const start = pos + m.index + m[0].length;
  const end = asStr.indexOf('\nendstream', start);
  check(`/Length do stream ${streams + 1} bate`, +m[1] === end - start);
  streams++;
  pos = end;
}
check('4 streams de conteúdo', streams === 4);

// gráficos: existem polylines (comando "l ... S") e retângulos de legenda ("re f")
check('tem polyline de gráfico', / l \S.* S\n/.test(asStr) || asStr.includes(' l S\n') || / \d+(\.\d+)? l /.test(asStr));
check('tem chip de legenda', asStr.includes(' re f'));

// conteúdo usa as duas fontes e tem texto cp1252
check('usa Helvetica e Helvetica-Bold', asStr.includes('/F1 ') && asStr.includes('/F2 '));
check('acentos codificados em WinAnsi', asStr.includes('Pre\xe7o do terreno'));
check('caractere fora do WinAnsi vira "?"', asStr.includes('A\xe7\xe3o ? ok'));

console.log(fails === 0 ? 'OK — PDF estruturalmente válido' : `${fails} teste(s) falharam`);
process.exit(fails ? 1 : 0);
