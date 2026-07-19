/*
 * Gerador de PDF mínimo, sem dependências — texto Helvetica (base-14,
 * WinAnsi), linhas, retângulos e gráficos vetoriais em múltiplas páginas.
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
const N = (v) => (Math.round(v * 100) / 100).toString();

/*
 * Cada página é uma lista de operações (origem no canto inferior esquerdo):
 *  { t:'text', x, y, s, font:'F1'|'F2', size, color:[r,g,b] }
 *  { t:'line', x1, y1, x2, y2, w, color:[r,g,b] }
 *  { t:'poly', pts:[[x,y],...], w, color:[r,g,b] }
 *  { t:'rect', x, y, w, h, color:[r,g,b] }
 * Retorna Uint8Array de um PDF Letter (612×792) com N páginas.
 */
function buildPdf(pages) {
  const streams = pages.map((items) => {
    const content = [];
    for (const it of items) {
      if (it.t === 'text') {
        const [r, g, b] = it.color || [0, 0, 0];
        content.push(...ascii(`BT /${it.font || 'F1'} ${it.size || 10} Tf ${N(r)} ${N(g)} ${N(b)} rg 1 0 0 1 ${N(it.x)} ${N(it.y)} Tm (`));
        content.push(...encodeText(it.s));
        content.push(...ascii(') Tj ET\n'));
      } else if (it.t === 'line') {
        const [r, g, b] = it.color || [0, 0, 0];
        content.push(...ascii(`${N(r)} ${N(g)} ${N(b)} RG ${N(it.w || 0.75)} w ${N(it.x1)} ${N(it.y1)} m ${N(it.x2)} ${N(it.y2)} l S\n`));
      } else if (it.t === 'poly' && it.pts.length > 1) {
        const [r, g, b] = it.color || [0, 0, 0];
        let d = `${N(r)} ${N(g)} ${N(b)} RG ${N(it.w || 1.5)} w 1 j 1 J `;
        it.pts.forEach(([x, y], i) => { d += `${N(x)} ${N(y)} ${i ? 'l' : 'm'} `; });
        content.push(...ascii(d + 'S\n'));
      } else if (it.t === 'rect') {
        const [r, g, b] = it.color || [0, 0, 0];
        content.push(...ascii(`${N(r)} ${N(g)} ${N(b)} rg ${N(it.x)} ${N(it.y)} ${N(it.w)} ${N(it.h)} re f\n`));
      }
    }
    return content;
  });

  // objetos: 1 catálogo, 2 pages, 3 F1, 4 F2, depois [página, conteúdo] por página
  const kids = pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((_, i) => {
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
    objects.push({ stream: streams[i] });
  });

  const bytes = [];
  const offsets = [0];
  bytes.push(...ascii('%PDF-1.4\n'));
  objects.forEach((obj, i) => {
    offsets.push(bytes.length);
    const num = i + 1;
    if (typeof obj === 'object') {
      bytes.push(...ascii(`${num} 0 obj\n<< /Length ${obj.stream.length} >>\nstream\n`));
      bytes.push(...obj.stream);
      bytes.push(...ascii('\nendstream\nendobj\n'));
    } else {
      bytes.push(...ascii(`${num} 0 obj\n${obj}\nendobj\n`));
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

/* ===== Paleta / medidas ===== */
const M = 54, RIGHT = 612 - M;
const GRAY = [0.35, 0.35, 0.35], MUTED = [0.55, 0.55, 0.55];
const GOOD = [0.05, 0.45, 0.05], BAD = [0.78, 0.2, 0.2];
const RULE = [0.82, 0.82, 0.80];
const BLUE = [0.16, 0.47, 0.84], GREEN = [0, 0.51, 0];
const valColor = (c) => (c === 'good' ? GOOD : c === 'bad' ? BAD : [0, 0, 0]);
const textW = (s, size) => String(s).length * size * 0.5; // largura aproximada (Helvetica)

function fmtCompact(v) {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1e6) return sign + '$' + (Math.round(abs / 1e5) / 10) + 'M';
  if (abs >= 1e3) return sign + '$' + Math.round(abs / 1e3) + 'k';
  return sign + '$' + Math.round(abs);
}

function sectionHeading(items, y, text) {
  items.push({ t: 'text', x: M, y, s: text, font: 'F2', size: 11.5 });
  items.push({ t: 'line', x1: M, y1: y - 6, x2: RIGHT, y2: y - 6, w: 0.6, color: RULE });
  return y - 21;
}

function pageHeader(items, subtitle) {
  items.push({ t: 'text', x: M, y: 792 - 40, s: subtitle, size: 8, color: MUTED });
  items.push({ t: 'line', x1: M, y1: 792 - 46, x2: RIGHT, y2: 792 - 46, w: 0.6, color: RULE });
  return 792 - 70;
}

/*
 * Desenha um gráfico de linhas. chart: { title, series:[{name, color, values}],
 * xlabels: [string por ponto] } — plot ancorado em (x0,y0) com w×h.
 */
function drawChart(items, x0, y0, w, h, chart) {
  let y = y0 + h + 26;
  items.push({ t: 'text', x: x0, y, s: chart.title, font: 'F2', size: 10.5 });
  // legenda (só com 2+ séries)
  if (chart.series.length > 1) {
    let lx = x0;
    y -= 14;
    for (const s of chart.series) {
      items.push({ t: 'rect', x: lx, y: y - 1, w: 7, h: 7, color: s.color });
      items.push({ t: 'text', x: lx + 11, y, s: s.name, size: 8, color: GRAY });
      lx += 11 + textW(s.name, 8) + 16;
    }
  } else {
    y -= 14;
  }

  let dataMin = 0, dataMax = 1;
  for (const s of chart.series) for (const v of s.values) {
    dataMin = Math.min(dataMin, v); dataMax = Math.max(dataMax, v);
  }
  const rawStep = (dataMax - dataMin) / 4 || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rawStep) || rawStep;
  const yMin = Math.floor(dataMin / step) * step;
  const yMax = Math.ceil(dataMax / step) * step || step;
  const n = chart.series[0].values.length;

  const px = (i) => x0 + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const py = (v) => y0 + ((v - yMin) / (yMax - yMin)) * h;

  for (let v = yMin; v <= yMax + step / 2; v += step) {
    const isZero = Math.abs(v) < step / 1e6;
    items.push({ t: 'line', x1: x0, y1: py(v), x2: x0 + w, y2: py(v), w: isZero ? 0.9 : 0.4, color: isZero ? GRAY : RULE });
    items.push({ t: 'text', x: x0 + w + 6, y: py(v) - 3, s: fmtCompact(v), size: 7.5, color: MUTED });
  }
  const xEvery = Math.max(1, Math.ceil(n / 7));
  for (let i = 0; i < n; i += xEvery) {
    items.push({ t: 'text', x: px(i) - 10, y: y0 - 12, s: chart.xlabels[i], size: 7.5, color: MUTED });
  }
  for (const s of chart.series) {
    items.push({ t: 'poly', pts: s.values.map((v, i) => [px(i), py(v)]), w: 1.5, color: s.color });
  }
}

/*
 * doc: { title, subtitle,
 *   sections: [{ heading, rows: [[label, value, color?]] }],
 *   table: { heading, cols: [{label,x}], rows, strongRow },
 *   charts: [{ title, series: [{name, color:'blue'|'green', values}], xlabels }],
 *   monthly: { heading, cols: [{label,x}], rows },
 *   footer }
 */
function analysisPdf(doc) {
  const pages = [];

  /* ---- página 1: resumo ---- */
  const p1 = [];
  let y = 792 - 64;
  p1.push({ t: 'text', x: M, y, s: doc.title, font: 'F2', size: doc.title.length > 40 ? 14 : 18 });
  y -= 16;
  p1.push({ t: 'text', x: M, y, s: doc.subtitle, size: 9, color: MUTED });
  y -= 8;
  p1.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 1, color: RULE });
  y -= 24;

  for (const sec of doc.sections) {
    y = sectionHeading(p1, y, sec.heading);
    for (const [label, value, color] of sec.rows) {
      // valores longos começam mais à esquerda para não estourar a margem direita
      const vx = String(value).length > 40 ? 170 : 285;
      p1.push({ t: 'text', x: M, y, s: label, size: 9, color: GRAY });
      p1.push({ t: 'text', x: vx, y, s: value, size: 10, color: valColor(color) });
      y -= 15.5;
    }
    y -= 12;
  }

  if (doc.table) {
    y = sectionHeading(p1, y, doc.table.heading) + 7;
    for (const col of doc.table.cols) p1.push({ t: 'text', x: col.x, y, s: col.label, size: 8.5, color: MUTED });
    y -= 5;
    p1.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 0.4, color: RULE });
    y -= 12;
    doc.table.rows.forEach((row, ri) => {
      const strong = ri === doc.table.strongRow;
      row.forEach((cell, ci) => {
        const [text, color] = Array.isArray(cell) ? cell : [cell, undefined];
        p1.push({ t: 'text', x: doc.table.cols[ci].x, y, s: text, font: strong ? 'F2' : 'F1', size: 9.5, color: valColor(color) });
      });
      y -= 14.5;
    });
  }
  if (doc.footer) p1.push({ t: 'text', x: M, y: 40, s: doc.footer, size: 8, color: MUTED });
  pages.push(p1);

  /* ---- página 2: gráficos ---- */
  if (doc.charts && doc.charts.length) {
    const p2 = [];
    let top = pageHeader(p2, doc.subtitle + ' · gráficos');
    const chartW = RIGHT - M - 44; // espaço à direita para os rótulos do eixo
    const chartH = 190;
    for (const chart of doc.charts.slice(0, 2)) {
      const plotBottom = top - 40 - chartH;
      const colors = { blue: BLUE, green: GREEN };
      drawChart(p2, M, plotBottom, chartW, chartH, {
        title: chart.title,
        xlabels: chart.xlabels,
        series: chart.series.map((s) => ({ name: s.name, values: s.values, color: colors[s.color] || BLUE })),
      });
      top = plotBottom - 52;
    }
    pages.push(p2);
  }

  /* ---- páginas 3+: cashflow mensal ---- */
  if (doc.monthly && doc.monthly.rows.length) {
    const perPage = 42;
    for (let start = 0; start < doc.monthly.rows.length; start += perPage) {
      const chunk = doc.monthly.rows.slice(start, start + perPage);
      const p = [];
      let py = pageHeader(p, doc.subtitle + ' · cashflow mensal');
      if (start === 0) py = sectionHeading(p, py, doc.monthly.heading) + 7;
      for (const col of doc.monthly.cols) p.push({ t: 'text', x: col.x, y: py, s: col.label, size: 8, color: MUTED });
      py -= 5;
      p.push({ t: 'line', x1: M, y1: py, x2: RIGHT, y2: py, w: 0.4, color: RULE });
      py -= 11;
      for (const row of chunk) {
        row.forEach((cell, ci) => {
          const [text, color] = Array.isArray(cell) ? cell : [cell, undefined];
          p.push({ t: 'text', x: doc.monthly.cols[ci].x, y: py, s: text, size: 8, color: valColor(color) });
        });
        py -= 12.5;
      }
      pages.push(p);
    }
  }

  return buildPdf(pages);
}

const Pdf = { buildPdf, analysisPdf };
if (typeof module !== 'undefined' && module.exports) module.exports = Pdf;
else global.Pdf = Pdf;
})(typeof window !== 'undefined' ? window : globalThis);
