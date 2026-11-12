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
  '×': 0xD7, '•': 0x95, '°': 0xB0, '\u00a0': 0xA0, 'È': 0xC8, 'Ü': 0xDC, 'Ñ': 0xD1,
};

// larguras (1/1000 em) dos bytes 32..255 em cada fonte base-14 usada:
// F1 Helvetica, F2 Helvetica-Bold, F3 Times-Bold, F4 Helvetica-Oblique
const FONT_W = {"F1":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,750,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,0,737,552,400,549,333,333,333,576,537,333,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500],"F2":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,750,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,0,737,552,400,549,333,333,333,576,556,333,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,549,611,611,611,611,611,556,611,556],"F3":[250,333,555,500,500,1000,833,278,333,333,500,570,250,333,250,278,500,500,500,500,500,500,500,500,500,500,333,333,570,570,570,500,930,722,667,722,722,667,611,778,778,389,500,778,667,944,722,778,611,778,722,556,667,722,722,1000,722,722,667,333,278,333,581,500,333,500,556,444,556,444,333,500,556,278,333,556,278,833,556,500,556,556,444,389,333,556,500,722,500,500,444,394,220,394,520,778,500,0,333,500,500,1000,500,500,333,1000,556,333,1000,0,667,0,0,333,333,500,500,350,500,1000,333,1000,389,333,722,0,444,722,250,333,500,500,500,500,220,500,333,747,300,500,570,0,747,500,400,549,300,300,333,576,540,334,333,300,330,500,750,750,750,500,722,722,722,722,722,722,1000,722,667,667,667,667,389,389,389,389,722,722,778,778,778,778,778,570,778,722,722,722,722,722,611,556,500,500,500,500,500,500,722,444,444,444,444,444,278,278,278,278,500,556,500,500,500,500,500,549,500,556,556,556,556,500,556,500],"F4":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,750,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,0,737,552,400,549,333,333,333,576,537,333,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,549,611,556,556,556,556,500,556,500]};
// largura real de um texto, para centralizar, alinhar à direita e quebrar linhas
function textWidth(str, font, size, cs) {
  const tab = FONT_W[font] || FONT_W.F1;
  let w = 0, n = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    const b = code <= 0x7E ? code : (CP1252[ch] ?? 0x3F);
    w += tab[b - 32] || 500;
    n++;
  }
  return (w / 1000) * size + (cs || 0) * n;
}
function wrapWidth(text, font, size, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (line && textWidth(next, font, size) > maxW) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

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
 *  { t:'rrect', x, y, w, h, r, fill:[r,g,b], stroke:[r,g,b], lw }   — cantos arredondados
 * Texto aceita cs (espaçamento entre letras). Retorna Uint8Array de um PDF com N páginas,
 * Letter (612×792) por padrão; uma página pode definir items.size = [largura, altura].
 * opts.extFonts acrescenta F3 (Times-Bold) e F4 (Helvetica-Oblique).
 */
function buildPdf(pages, opts) {
  const ext = !!(opts && opts.extFonts);
  const streams = pages.map((items) => {
    const content = [];
    for (const it of items) {
      if (it.t === 'text') {
        const [r, g, b] = it.color || [0, 0, 0];
        content.push(...ascii(`BT /${it.font || 'F1'} ${it.size || 10} Tf ${N(it.cs || 0)} Tc ${N(r)} ${N(g)} ${N(b)} rg 1 0 0 1 ${N(it.x)} ${N(it.y)} Tm (`));
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
      } else if (it.t === 'rrect') {
        const { x, y, w, h } = it;
        const rad = Math.min(it.r || 0, w / 2, h / 2), k = rad * 0.5523;
        let d = '';
        if (it.fill) d += `${N(it.fill[0])} ${N(it.fill[1])} ${N(it.fill[2])} rg `;
        if (it.stroke) d += `${N(it.stroke[0])} ${N(it.stroke[1])} ${N(it.stroke[2])} RG ${N(it.lw || 0.75)} w `;
        d += `${N(x + rad)} ${N(y)} m ${N(x + w - rad)} ${N(y)} l `
          + `${N(x + w - rad + k)} ${N(y)} ${N(x + w)} ${N(y + rad - k)} ${N(x + w)} ${N(y + rad)} c `
          + `${N(x + w)} ${N(y + h - rad)} l `
          + `${N(x + w)} ${N(y + h - rad + k)} ${N(x + w - rad + k)} ${N(y + h)} ${N(x + w - rad)} ${N(y + h)} c `
          + `${N(x + rad)} ${N(y + h)} l `
          + `${N(x + rad - k)} ${N(y + h)} ${N(x)} ${N(y + h - rad + k)} ${N(x)} ${N(y + h - rad)} c `
          + `${N(x)} ${N(y + rad)} l `
          + `${N(x)} ${N(y + rad - k)} ${N(x + rad - k)} ${N(y)} ${N(x + rad)} ${N(y)} c h `;
        content.push(...ascii(d + (it.fill && it.stroke ? 'B' : it.fill ? 'f' : 'S') + '\n'));
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
  // fontes extras ficam depois das páginas, para não mudar a numeração dos objetos existentes
  const f3 = 5 + 2 * pages.length, f4 = f3 + 1;
  const fontRes = '/F1 3 0 R /F2 4 0 R' + (ext ? ` /F3 ${f3} 0 R /F4 ${f4} 0 R` : '');
  pages.forEach((items, i) => {
    const [pw, ph] = items.size || [612, 792];
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${N(pw)} ${N(ph)}] `
      + `/Resources << /Font << ${fontRes} >> >> /Contents ${6 + 2 * i} 0 R >>`);
    objects.push({ stream: streams[i] });
  });
  if (ext) {
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  }

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

/* ===== Relatório genérico em blocos, com quebra de página automática ===== */
// larguras reais da Helvetica (em) para números e pontuação: alinha colunas à direita
const NUM_W = { '$': 0.556, ',': 0.278, '.': 0.278, ' ': 0.278, '-': 0.333, '%': 0.889,
  '(': 0.333, ')': 0.333, '/': 0.278, ':': 0.278, '+': 0.584, '—': 1, '–': 0.556 };
function measure(s, size, bold) {
  let w = 0;
  for (const ch of String(s)) {
    if (ch >= '0' && ch <= '9') w += 0.556;
    else if (NUM_W[ch] != null) w += NUM_W[ch];
    else if (ch >= 'A' && ch <= 'Z') w += bold ? 0.72 : 0.68;
    else w += bold ? 0.56 : 0.52;
  }
  return w * size;
}
function wrapText(text, maxChars) {
  const lines = [];
  for (const para of String(text).split(/\n/)) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (line && (line + ' ' + word).length > maxChars) { lines.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    lines.push(line);
  }
  return lines;
}
function clip(s, maxW, size, bold) {
  let str = String(s);
  if (measure(str, size, bold) <= maxW) return str;
  while (str.length > 1 && measure(str + '…', size, bold) > maxW) str = str.slice(0, -1);
  return str.trimEnd() + '…';
}

/*
 * doc: { title, subtitle, footer, blocks: [
 *   { type:'heading', text }
 *   { type:'rows', rows: [[label, value, color?]] }
 *   { type:'tiles', tiles: [[label, value, color?]] }          — até 4 por linha
 *   { type:'table', cols: [{label, x, align?:'right', w?}], rows, strongRows?: [i], empty? }
 *   { type:'text', text, size?, color?:'muted' }
 *   { type:'gap', h } ] }
 * Em colunas align:'right', x é a borda direita da coluna.
 */
function reportPdf(doc) {
  const pages = [];
  let items, y;
  const BOTTOM = 62;
  const newPage = () => {
    items = [];
    pages.push(items);
    if (pages.length === 1) {
      y = 792 - 64;
      items.push({ t: 'text', x: M, y, s: doc.title, font: 'F2', size: doc.title.length > 40 ? 14 : 18 });
      y -= 16;
      items.push({ t: 'text', x: M, y, s: doc.subtitle, size: 9, color: MUTED });
      y -= 8;
      items.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 1, color: RULE });
      y -= 26;
    } else {
      y = pageHeader(items, doc.title + ' · ' + doc.subtitle);
    }
  };
  const need = (h) => { if (y - h < BOTTOM) newPage(); };
  newPage();

  const cellAt = (col, text, size, bold, color) => {
    const s = col.w ? clip(text, col.w, size, bold) : String(text);
    const x = col.align === 'right' ? col.x - measure(s, size, bold) : col.x;
    items.push({ t: 'text', x, y, s, font: bold ? 'F2' : 'F1', size, color });
  };

  for (const b of doc.blocks) {
    if (b.type === 'heading') {
      need(70);
      y = sectionHeading(items, y, b.text);
    } else if (b.type === 'rows') {
      for (const [label, value, color] of b.rows) {
        need(16);
        const vx = String(value).length > 44 ? 190 : 285;
        items.push({ t: 'text', x: M, y, s: label, size: 9, color: GRAY });
        items.push({ t: 'text', x: vx, y, s: clip(value, RIGHT - vx, 10), size: 10, color: valColor(color) });
        y -= 15.5;
      }
      y -= 10;
    } else if (b.type === 'tiles') {
      const per = Math.min(4, b.tiles.length);
      const w = (RIGHT - M) / per;
      for (let i = 0; i < b.tiles.length; i += per) {
        need(46);
        b.tiles.slice(i, i + per).forEach(([label, value, color], k) => {
          const x = M + k * w;
          items.push({ t: 'text', x, y, s: clip(label, w - 8, 8), size: 8, color: MUTED });
          items.push({ t: 'text', x, y: y - 16, s: clip(value, w - 8, 13, true), font: 'F2', size: 13, color: valColor(color) });
        });
        y -= 42;
      }
    } else if (b.type === 'table') {
      const header = () => {
        for (const col of b.cols) cellAt(col, col.label, 8, false, MUTED);
        y -= 5;
        items.push({ t: 'line', x1: M, y1: y, x2: RIGHT, y2: y, w: 0.4, color: RULE });
        y -= 12;
      };
      need(48);
      header();
      if (!b.rows.length && b.empty) {
        items.push({ t: 'text', x: M, y, s: b.empty, size: 9, color: MUTED });
        y -= 14;
      }
      b.rows.forEach((row, ri) => {
        if (y - 14 < BOTTOM) { newPage(); header(); }
        const strong = (b.strongRows || []).includes(ri);
        row.forEach((cell, ci) => {
          const [text, color] = Array.isArray(cell) ? cell : [cell, undefined];
          cellAt(b.cols[ci], text, 9, strong, valColor(color));
        });
        y -= 14;
      });
      y -= 12;
    } else if (b.type === 'text') {
      const size = b.size || 9;
      for (const line of wrapText(b.text, Math.floor((RIGHT - M) / (size * 0.5)))) {
        need(size + 4);
        items.push({ t: 'text', x: M, y, s: line, size, color: b.color === 'muted' ? MUTED : GRAY });
        y -= size + 3.5;
      }
      y -= 8;
    } else if (b.type === 'gap') {
      y -= b.h || 10;
    }
  }

  pages.forEach((p, i) => {
    p.push({ t: 'line', x1: M, y1: 50, x2: RIGHT, y2: 50, w: 0.4, color: RULE });
    if (doc.footer) p.push({ t: 'text', x: M, y: 38, s: clip(doc.footer, RIGHT - M - 50, 7.5), size: 7.5, color: MUTED });
    const pg = `${i + 1} / ${pages.length}`;
    p.push({ t: 'text', x: RIGHT - measure(pg, 7.5), y: 38, s: pg, size: 7.5, color: MUTED });
  });
  return buildPdf(pages);
}

const Pdf = { buildPdf, analysisPdf, reportPdf, textWidth, wrapWidth };
if (typeof module !== 'undefined' && module.exports) module.exports = Pdf;
else global.Pdf = Pdf;
})(typeof window !== 'undefined' ? window : globalThis);
