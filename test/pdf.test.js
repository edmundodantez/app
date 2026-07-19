/*
 * Testa a integridade estrutural do PDF gerado por pdfgen.js:
 * cabeçalho, trailer, offsets da tabela xref e presença do conteúdo.
 * Rodar: node test/pdf.test.js
 */
'use strict';
const Pdf = require('../pdfgen.js');

let fails = 0;
function check(label, ok) {
  if (!ok) { fails++; console.log('FAIL ' + label); }
}

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
  footer: 'Gerado pelo InvestCalc.',
};

const bytes = Pdf.analysisPdf(doc);
const asStr = Buffer.from(bytes).toString('latin1');

check('começa com %PDF-1.4', asStr.startsWith('%PDF-1.4\n'));
check('termina com %%EOF', asStr.endsWith('%%EOF\n'));

// startxref aponta exatamente para a tabela xref
const sx = asStr.match(/startxref\n(\d+)\n%%EOF\n$/);
check('tem startxref', !!sx);
check('startxref aponta para "xref"', sx && asStr.slice(+sx[1], +sx[1] + 4) === 'xref');

// cada offset da xref aponta para "N 0 obj"
const xrefBlock = asStr.slice(+sx[1]);
const offsets = [...xrefBlock.matchAll(/^(\d{10}) 00000 n /gm)].map((m) => +m[1]);
check('xref tem 6 objetos', offsets.length === 6);
offsets.forEach((off, i) => {
  check(`offset do obj ${i + 1} correto`, asStr.slice(off).startsWith(`${i + 1} 0 obj`));
});

// /Length do stream de conteúdo bate com o tamanho real
const lenMatch = asStr.match(/<< \/Length (\d+) >>\nstream\n/);
const streamStart = asStr.indexOf('stream\n') + 'stream\n'.length;
const streamEnd = asStr.indexOf('\nendstream');
check('/Length bate com o stream', lenMatch && +lenMatch[1] === streamEnd - streamStart);

// conteúdo usa as duas fontes e tem texto cp1252 (ç de "Preço" = 0xE7)
check('usa Helvetica e Helvetica-Bold', asStr.includes('/F1 ') && asStr.includes('/F2 '));
check('acentos codificados em WinAnsi', asStr.includes('Pre\xe7o do terreno'));
check('caractere fora do WinAnsi vira "?"', asStr.includes('A\xe7\xe3o ? ok'));

console.log(fails === 0 ? 'OK — PDF estruturalmente válido' : `${fails} teste(s) falharam`);
process.exit(fails ? 1 : 0);
