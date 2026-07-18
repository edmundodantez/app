'use strict';

/* ===== Helpers ===== */
const $ = (id) => document.getElementById(id);

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtPct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtNum = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function parseNum(str) {
  if (typeof str !== 'string') return NaN;
  const clean = str.trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : NaN;
}

function compactBRL(v) {
  const abs = Math.abs(v);
  if (abs >= 1e9) return 'R$ ' + fmtNum.format(v / 1e9) + ' bi';
  if (abs >= 1e6) return 'R$ ' + fmtNum.format(v / 1e6) + ' mi';
  if (abs >= 1e3) return 'R$ ' + fmtNum.format(v / 1e3) + ' mil';
  return fmtBRL0.format(v);
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ===== Persistence ===== */
const PERSIST_IDS = [
  'jc-inicial', 'jc-mensal', 'jc-taxa', 'jc-taxa-unidade', 'jc-prazo', 'jc-prazo-unidade',
  'rf-valor', 'rf-prazo', 'rf-cdi', 'rf-cdb-pct', 'rf-lci-pct',
  'ac-cotacao', 'ac-dpa', 'ac-lpa', 'ac-vpa', 'ac-yield',
];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem('investcalc') || '{}');
    for (const id of PERSIST_IDS) {
      if (saved[id] != null && $(id)) $(id).value = saved[id];
    }
  } catch { /* estado corrompido: ignora e usa padrões */ }
}

function saveState() {
  const out = {};
  for (const id of PERSIST_IDS) { if ($(id)) out[id] = $(id).value; }
  try { localStorage.setItem('investcalc', JSON.stringify(out)); } catch { /* sem espaço: segue sem persistir */ }
}

/* ===== Tabs ===== */
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.hidden = p.dataset.tab !== btn.dataset.target;
    });
    hideTooltip();
  });
});

/* =====================================================
   1) Juros compostos
===================================================== */
function calcJuros() {
  const inicial = parseNum($('jc-inicial').value);
  const mensal = parseNum($('jc-mensal').value);
  const taxa = parseNum($('jc-taxa').value);
  const prazo = parseNum($('jc-prazo').value);
  if (!Number.isFinite(inicial) || !Number.isFinite(mensal) || !Number.isFinite(taxa) || !Number.isFinite(prazo) || prazo <= 0) {
    return null;
  }

  const taxaMes = $('jc-taxa-unidade').value === 'aa'
    ? Math.pow(1 + taxa / 100, 1 / 12) - 1
    : taxa / 100;
  const meses = Math.min(1200, Math.round($('jc-prazo-unidade').value === 'anos' ? prazo * 12 : prazo));
  if (meses <= 0) return null;

  const acumulado = [inicial];
  const investido = [inicial];
  let saldo = inicial;
  for (let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + taxaMes) + mensal;
    acumulado.push(saldo);
    investido.push(inicial + mensal * m);
  }
  return { meses, acumulado, investido };
}

function renderJuros() {
  const r = calcJuros();
  if (!r) return;
  const fim = r.meses;
  $('jc-final').textContent = fmtBRL0.format(r.acumulado[fim]);
  $('jc-investido').textContent = fmtBRL0.format(r.investido[fim]);
  $('jc-juros').textContent = fmtBRL0.format(r.acumulado[fim] - r.investido[fim]);

  renderLineChart($('jc-chart'), $('jc-legend'), [
    { name: 'Acumulado', color: cssVar('--series-1'), values: r.acumulado },
    { name: 'Investido', color: cssVar('--series-2'), values: r.investido },
  ]);

  const tbody = $('jc-tabela').querySelector('tbody');
  tbody.innerHTML = '';
  const passoAnos = Math.max(1, Math.floor(r.meses / 12 / 30)); // limita a ~30 linhas
  for (let ano = 1; ano * 12 <= r.meses; ano += passoAnos) {
    const m = ano * 12;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${ano}</td><td>${fmtBRL0.format(r.investido[m])}</td>` +
      `<td>${fmtBRL0.format(r.acumulado[m] - r.investido[m])}</td><td>${fmtBRL0.format(r.acumulado[m])}</td>`;
    tbody.appendChild(tr);
  }
  if (r.meses % 12 !== 0 || r.meses < 12) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmtNum.format(r.meses / 12)}</td><td>${fmtBRL0.format(r.investido[fim])}</td>` +
      `<td>${fmtBRL0.format(r.acumulado[fim] - r.investido[fim])}</td><td>${fmtBRL0.format(r.acumulado[fim])}</td>`;
    tbody.appendChild(tr);
  }
}

$('jc-toggle-tabela').addEventListener('click', () => {
  const wrap = $('jc-tabela-wrap');
  wrap.hidden = !wrap.hidden;
  $('jc-toggle-tabela').textContent = wrap.hidden ? 'Ver tabela ano a ano' : 'Ocultar tabela';
  $('jc-toggle-tabela').setAttribute('aria-expanded', String(!wrap.hidden));
});

/* ===== Gráfico de linhas (SVG) ===== */
const chartState = { series: null, geo: null };

function renderLineChart(holder, legendEl, series) {
  const W = 600, H = 300;
  const pad = { top: 12, right: 14, bottom: 26, left: 8 };
  const n = series[0].values.length;
  const maxV = Math.max(...series.map((s) => s.values[s.values.length - 1]), 1);

  // escala Y "bonita": arredonda o teto para um passo limpo
  const rawStep = maxV / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= rawStep) || rawStep;
  const yMax = step * Math.ceil(maxV / step);

  const gridColor = cssVar('--grid');
  const baseColor = cssVar('--baseline');
  const mutedColor = cssVar('--text-muted');

  // largura reservada aos rótulos do eixo Y (direita)
  const yLabels = [];
  for (let v = step; v <= yMax + 1e-9; v += step) yLabels.push(v);
  pad.right = 8 + Math.max(...yLabels.map((v) => compactBRL(v).length)) * 6.4;

  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const x = (i) => pad.left + (i / (n - 1)) * plotW;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Evolução do patrimônio">`;

  for (const v of yLabels) {
    svg += `<line x1="${pad.left}" y1="${y(v)}" x2="${pad.left + plotW}" y2="${y(v)}" stroke="${gridColor}" stroke-width="1"/>`;
    svg += `<text x="${W - 4}" y="${y(v) + 3}" text-anchor="end" font-size="10" fill="${mutedColor}" font-family="system-ui,sans-serif">${compactBRL(v)}</text>`;
  }
  svg += `<line x1="${pad.left}" y1="${y(0)}" x2="${pad.left + plotW}" y2="${y(0)}" stroke="${baseColor}" stroke-width="1"/>`;

  // marcas do eixo X em anos
  const anos = (n - 1) / 12;
  const xStep = anos > 20 ? 60 : anos > 8 ? 24 : anos > 3 ? 12 : anos > 1 ? 6 : 3;
  for (let m = xStep; m < n; m += xStep) {
    const label = m % 12 === 0 ? `${m / 12}a` : `${m}m`;
    svg += `<text x="${x(m)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${mutedColor}" font-family="system-ui,sans-serif">${label}</text>`;
  }

  for (const s of series) {
    let d = '';
    const stride = Math.max(1, Math.floor(n / 300));
    for (let i = 0; i < n; i += stride) d += (d ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s.values[i]).toFixed(1);
    if ((n - 1) % stride !== 0) d += 'L' + x(n - 1).toFixed(1) + ' ' + y(s.values[n - 1]).toFixed(1);
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  svg += `<line id="jc-crosshair" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + plotH}" stroke="${baseColor}" stroke-width="1" visibility="hidden"/>`;
  for (let k = 0; k < series.length; k++) {
    svg += `<circle id="jc-dot-${k}" r="4" fill="${series[k].color}" stroke="${cssVar('--surface-1')}" stroke-width="2" visibility="hidden"/>`;
  }
  svg += '</svg>';
  holder.innerHTML = svg;

  legendEl.innerHTML = series.map((s) =>
    `<span class="key"><span class="chip" style="background:${s.color}"></span>${s.name}</span>`).join('');

  chartState.series = series;
  chartState.geo = { W, H, pad, plotW, plotH, n, x, y };

  const svgEl = holder.querySelector('svg');
  svgEl.addEventListener('pointermove', onChartHover);
  svgEl.addEventListener('pointerdown', onChartHover);
  svgEl.addEventListener('pointerleave', hideTooltip);
}

function onChartHover(ev) {
  const { series, geo } = chartState;
  if (!series) return;
  const svgEl = ev.currentTarget;
  const rect = svgEl.getBoundingClientRect();
  const scaleX = geo.W / rect.width;
  const px = (ev.clientX - rect.left) * scaleX;
  const i = Math.max(0, Math.min(geo.n - 1, Math.round(((px - geo.pad.left) / geo.plotW) * (geo.n - 1))));

  const cx = geo.x(i);
  const cross = svgEl.querySelector('#jc-crosshair');
  cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
  cross.setAttribute('visibility', 'visible');
  series.forEach((s, k) => {
    const dot = svgEl.querySelector('#jc-dot-' + k);
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', geo.y(s.values[i]));
    dot.setAttribute('visibility', 'visible');
  });

  const anos = Math.floor(i / 12), meses = i % 12;
  const quando = i === 0 ? 'Início'
    : (anos ? `${anos} ano${anos > 1 ? 's' : ''}` : '') + (anos && meses ? ' e ' : '') + (meses ? `${meses} ${meses > 1 ? 'meses' : 'mês'}` : '');
  const tt = $('tooltip');
  tt.innerHTML = `<div class="tt-title">${quando}</div>` + series.map((s) =>
    `<div class="tt-row"><span class="k"><span class="chip" style="background:${s.color}"></span>${s.name}</span>` +
    `<span class="v">${fmtBRL0.format(s.values[i])}</span></div>`).join('');
  tt.hidden = false;

  const ttW = tt.offsetWidth;
  let left = ev.clientX + 14;
  if (left + ttW > window.innerWidth - 8) left = ev.clientX - ttW - 14;
  tt.style.left = Math.max(8, left) + 'px';
  tt.style.top = Math.max(8, rect.top + 10) + 'px';
}

function hideTooltip() {
  $('tooltip').hidden = true;
  document.querySelectorAll('#jc-crosshair, [id^="jc-dot-"]').forEach((el) => el.setAttribute('visibility', 'hidden'));
}

/* =====================================================
   2) Renda fixa
===================================================== */
function aliquotaIR(dias) {
  if (dias <= 180) return 0.225;
  if (dias <= 360) return 0.20;
  if (dias <= 720) return 0.175;
  return 0.15;
}

function renderRendaFixa() {
  const valor = parseNum($('rf-valor').value);
  const prazoMeses = parseNum($('rf-prazo').value);
  const cdi = parseNum($('rf-cdi').value);
  const cdbPct = parseNum($('rf-cdb-pct').value);
  const lciPct = parseNum($('rf-lci-pct').value);
  if (![valor, prazoMeses, cdi, cdbPct, lciPct].every(Number.isFinite) || valor <= 0 || prazoMeses <= 0) return;

  const anos = prazoMeses / 12;
  const dias = Math.round(prazoMeses * 30);
  const ir = aliquotaIR(dias);

  const bruto = (taxaAA) => valor * Math.pow(1 + taxaAA / 100, anos);

  // Poupança: 0,5% a.m. + TR se Selic > 8,5% a.a.; senão 70% da Selic. TR ≈ 0.
  const poupancaAA = cdi > 8.5 ? (Math.pow(1.005, 12) - 1) * 100 : cdi * 0.7;

  const itens = [
    { nome: `CDB ${fmtNum.format(cdbPct)}% CDI`, bruto: bruto(cdi * cdbPct / 100), tributado: true },
    { nome: `LCI/LCA ${fmtNum.format(lciPct)}% CDI`, bruto: bruto(cdi * lciPct / 100), tributado: false },
    { nome: 'Tesouro Selic', bruto: bruto(cdi), tributado: true },
    { nome: 'Poupança', bruto: bruto(poupancaAA), tributado: false },
  ];
  for (const it of itens) {
    it.imposto = it.tributado ? (it.bruto - valor) * ir : 0;
    it.liquido = it.bruto - it.imposto;
    it.rendPct = it.liquido / valor - 1;
  }
  itens.sort((a, b) => b.liquido - a.liquido);

  $('rf-ir-note').textContent =
    `IR regressivo para ${prazoMeses} meses (~${dias} dias): ${fmtNum.format(ir * 100)}% sobre o rendimento ` +
    `de CDB e Tesouro. LCI/LCA e poupança são isentos.`;

  const maxLiq = itens[0].liquido;
  $('rf-bars').innerHTML = itens.map((it) => {
    const w = (it.liquido / maxLiq) * 100;
    const label = fmtBRL0.format(it.liquido);
    const inside = w > 55;
    return `<div class="bar-row"><span class="bar-label">${it.nome}</span>` +
      `<div class="bar-track"><div class="bar-fill" style="width:${w.toFixed(1)}%"></div>` +
      `<span class="bar-value" style="${inside ? `right:${(100 - w).toFixed(1)}%;padding-right:6px;color:#fff` : `left:${w.toFixed(1)}%;padding-left:6px`}">${label}</span>` +
      `</div></div>`;
  }).join('');

  const tbody = $('rf-tabela').querySelector('tbody');
  tbody.innerHTML = itens.map((it) =>
    `<tr><td>${it.nome}</td><td>${fmtBRL0.format(it.bruto)}</td>` +
    `<td>${it.imposto ? fmtBRL0.format(it.imposto) : '—'}</td>` +
    `<td>${fmtBRL0.format(it.liquido)}</td><td>${fmtPct.format(it.rendPct)}</td></tr>`).join('');
}

/* =====================================================
   3) Ações
===================================================== */
function setDelta(el, precoRef, cotacao) {
  if (!Number.isFinite(precoRef) || precoRef <= 0 || !Number.isFinite(cotacao) || cotacao <= 0) {
    el.textContent = '';
    return;
  }
  const margem = precoRef / cotacao - 1; // quanto a referência está acima da cotação
  const up = margem >= 0;
  el.classList.toggle('up', up);
  el.classList.toggle('down', !up);
  el.textContent = up
    ? `↑ desconto de ${fmtPct.format(margem)}`
    : `↓ ágio de ${fmtPct.format(-margem)}`;
}

function renderAcoes() {
  const cotacao = parseNum($('ac-cotacao').value);
  const dpa = parseNum($('ac-dpa').value);
  const lpa = parseNum($('ac-lpa').value);
  const vpa = parseNum($('ac-vpa').value);
  const yieldDesejado = parseNum($('ac-yield').value);

  const bazin = dpa > 0 && yieldDesejado > 0 ? dpa / (yieldDesejado / 100) : NaN;
  const graham = lpa > 0 && vpa > 0 ? Math.sqrt(22.5 * lpa * vpa) : NaN;

  $('ac-bazin').textContent = Number.isFinite(bazin) ? fmtBRL.format(bazin) : '—';
  $('ac-graham').textContent = Number.isFinite(graham) ? fmtBRL.format(graham) : '—';
  setDelta($('ac-bazin-delta'), bazin, cotacao);
  setDelta($('ac-graham-delta'), graham, cotacao);

  $('ac-dy').textContent = cotacao > 0 && dpa >= 0 ? fmtPct.format(dpa / cotacao) : '—';
  $('ac-pl').textContent = cotacao > 0 && lpa > 0 ? fmtNum.format(cotacao / lpa) : '—';
  $('ac-pvp').textContent = cotacao > 0 && vpa > 0 ? fmtNum.format(cotacao / vpa) : '—';
}

/* ===== Wire-up ===== */
function renderAll() {
  renderJuros();
  renderRendaFixa();
  renderAcoes();
}

document.querySelectorAll('input, select').forEach((el) => {
  el.addEventListener('input', () => { saveState(); renderAll(); });
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderAll);

loadState();
renderAll();

/* ===== Service worker (offline) ===== */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
