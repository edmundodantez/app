/*
 * Gerador de PDF mínimo, sem dependências — o suficiente para o resumo de
 * análise de um deal: texto Helvetica (base-14, WinAnsi), linhas e cores.
 * Funciona no navegador (window.Pdf) e no Node (module.exports) para testes.
 */
(function (global) {
'use strict';

// mapa dos caracteres não-ASCII que usamos → byte cp1252 (WinAnsiEncoding)
const CP1252 = {
  'á': 0xE1, 'à': 0xE0, 'â': 0xE2, 'ã': 0xE3, 'ä': 0xE4,
  'é': 0xE9, 'è': 0xE8, 'ê': 0xEA, 'ë': 0xEB,
  'í': 0xED, 'ì': 0xEC, 'î': 0xEE, 'ï': 0xEF,
  'ó': 0xF3, 'ò': 0xF2, 'ô': 0xF4, 'õ': 0xF5, 'ö': 0xF6,
  'ú': 0xFA, 'ù': 0xF9, 'û': 0xFB, 'ü': 0xFC,
  'ç': 0xE7, 'ñ': 0xF1,
  'Á': 0xC1, 'À': 0xC0, 'Â': 0xC2, 'Ã': 0xC3, 'É': 0xC9, 'Ê': 0xCA,
  'Í': 0xCD, 'Ó': 0xD3, 'Ô': 0xD4, 'Õ': 0xD5, 'Ú': 0xDA, 'Ç': 0xC7,
  '—': 0x97, '–': 0x96, '·': 0xB7, 'º': 0xBA, 'ª': 0xAA, '±': 0xB1,
  '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '…': 0x85,
};

function encodeText(str) {
  // escapa os metacaracteres de string do PDF e converte para bytes cp1252
  const out = [];
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    let b;
    if (ch === '\\' || ch === '(' || ch === ')') { out.push(0x5C); b = code; }
    else if (code <= 0x7E) b = code;
    else b = CP1252[ch] ?? 0x3F; // '?' para o que não existir no WinAnsi
    out.push(b);
  }
  return out;
}

const ascii = (str) => Array.from(str, (c) => c.charCodeAt(0) & 0xFF);

/*
 * items: lista de operações na página (origem no canto inferior esquerdo):
 *  { t:'text', x, y, s, font:'F1'|'F2', size, color:[r,g,b] }
 *  { t:'line', x1, y1, x2, y2, w, color:[r,g,b] }
 * Retorna Uint8Array de um PDF Letter (612×792) de uma página.
 */
function buildPdf(items) {
  const content = [];
  for (const it of items) {
    if (it.t === 'text') {
      const [r, g, b] = it.color || [0, 0, 0];
      content.push(...ascii(`BT /${it.font || 'F1'} ${it.size || 10} Tf ${r} ${g} ${b} rg 1 0 0 1 ${it.x} ${it.y} Tm (`));
      content.push(...encodeText(it.s));
      content.push(...ascii(') Tj ET\n'));
    } else if (it.t === 'line') {
      const [r, g, b] = it.color || [0, 0, 0];
      content.push(...ascii(`${r} ${g} ${b} RG ${it.w || 0.75} w ${it.x1} ${it.y1} m ${it.x2} ${it.y2} l S\n`));
    }
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    null, // 4: content stream (montado abaixo)
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  const bytes = [];
  const offsets = [0];
  bytes.push(...ascii('%PDF-1.4\n'));
  objects.forEach((dict, i) => {
    offsets.push(bytes.length);
    const num = i + 1;
    if (dict === null) {
      bytes.push(...ascii(`${num} 0 obj\n<< /Length ${content.length} >>\nstream\n`));
      bytes.push(...content);
      bytes.push(...ascii('\nendstream\nendobj\n'));
    } else {
      bytes.push(...ascii(`${num} 0 obj\n${dict}\nendobj\n`));
    }
  });

  const xrefPos = bytes.length;
  bytes.push(...ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (let i = 1; i <= objects.length; i++) {
    bytes.push(...ascii(String(offsets[i]).padStart(10, '0') + ' 00000 n \n'));
  }
  bytes.push(...ascii(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`));
  return new Uint8Array(bytes);
}

/*
 * doc: { title, subtitle, sections: [{ heading, rows: [[label, value, color?]] }],
 *        table: { heading, cols: [{ label, x }], rows: [[..]], strongRow }, footer }
 * color: 'good' | 'bad' | undefined
 */
function analysisPdf(doc) {
  const M = 54, RIGHT = 612 - M;
  const GRAY = [0.35, 0.35, 0.35], MUTED = [0.55, 0.55, 0.55];
  const GOOD = [0.05, 0.45, 0.05], BAD = [0.78, 0.2, 0.2];
  const RULE = [0.82, 0.82, 0.80];
  const items = [];
  let y = 792 - 64;

  items.push({ t: 'text', x: M, y, s: doc.title, font: 'F2', size: doc.title.length > 40 ? 14 : 18 });
  y -= 16;
  items.push({ t: 'text', x: M, y, s: doc.subtitle, size: 9, color: MUTED });
  y -= 8;
  items.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 1, color: RULE });
  y -= 24;

  const valColor = (c) => (c === 'good' ? GOOD : c === 'bad' ? BAD : [0, 0, 0]);

  for (const sec of doc.sections) {
    items.push({ t: 'text', x: M, y, s: sec.heading, font: 'F2', size: 11.5 });
    y -= 6;
    items.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 0.6, color: RULE });
    y -= 15;
    for (const [label, value, color] of sec.rows) {
      // valores longos começam mais à esquerda para não estourar a margem direita
      const vx = String(value).length > 40 ? 170 : 285;
      items.push({ t: 'text', x: M, y, s: label, size: 9, color: GRAY });
      items.push({ t: 'text', x: vx, y, s: value, size: 10, color: valColor(color) });
      y -= 15.5;
    }
    y -= 12;
  }

  if (doc.table) {
    items.push({ t: 'text', x: M, y, s: doc.table.heading, font: 'F2', size: 11.5 });
    y -= 6;
    items.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 0.6, color: RULE });
    y -= 14;
    for (const col of doc.table.cols) {
      items.push({ t: 'text', x: col.x, y, s: col.label, size: 8.5, color: MUTED });
    }
    y -= 5;
    items.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 0.4, color: RULE });
    y -= 12;
    doc.table.rows.forEach((row, ri) => {
      const strong = ri === doc.table.strongRow;
      row.forEach((cell, ci) => {
        const [text, color] = Array.isArray(cell) ? cell : [cell, undefined];
        items.push({
          t: 'text', x: doc.table.cols[ci].x, y, s: text,
          font: strong ? 'F2' : 'F1', size: 9.5, color: valColor(color),
        });
      });
      y -= 14.5;
    });
  }

  if (doc.footer) {
    items.push({ t: 'text', x: M, y: 40, s: doc.footer, size: 8, color: MUTED });
  }
  return buildPdf(items);
}

const Pdf = { buildPdf, analysisPdf };
if (typeof module !== 'undefined' && module.exports) module.exports = Pdf;
else global.Pdf = Pdf;
})(typeof window !== 'undefined' ? window : globalThis);
