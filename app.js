// Energy escalation presets (% per year). Values are editable by the user via override.
const ENERGY_ESCALATION_PRESETS = {
  electricite: 4.0,
  gaz: 3.0,
  fioul: 3,
  granule: 2,
  plaquette: 2,
  propane: 3,
};

const ENERGY_LABELS = {
  electricite: 'Électricité',
  gaz: 'Gaz',
  fioul: 'Fioul',
  granule: 'Granulé',
  plaquette: 'Plaquette',
  propane: 'Propane',
};

function parseNumber(input) {
  if (input === '' || input === null || input === undefined) return NaN;
  const normalized = String(input).replace(',', '.');
  return Number(normalized);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatNumber(value, digits = 4) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}

function formatCurrency0(value) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

// Given initial bill for summed consumptions, derive base unit price.
// rows: [{ kwh, energy, unitPrice }]

// Compute evolution over years with escalation applied to the variable share only.
function computeEvolution({ startYear, years, rows, escalationPctByEnergy }) {
  const rowsOut = [];
  for (let i = 0; i <= years; i += 1) {
    const year = startYear + i;
    let total = 0;
    const details = rows.map((r) => {
      const escalationPct = escalationPctByEnergy[r.energy];
      const esc = (Math.max(escalationPct ?? 0, -99.9)) / 100;
      const unitPriceYear = r.unitPrice * Math.pow(1 + esc, i);
      const cost = unitPriceYear * r.kwh;
      total += cost;
      return { ...r, unitPriceYear, cost };
    });
    rowsOut.push({ year, total, details });
  }
  return { rows: rowsOut };
}

function renderResults({ escalationPct, evolution, perEnergyEsc }) {
  const section = document.getElementById('results-section');
  const tbody = document.querySelector('#results-table tbody');
  tbody.innerHTML = '';
  const metaEsc = document.getElementById('meta-escalation');
  if (metaEsc) metaEsc.textContent = String(escalationPct);
  const mapEl = document.getElementById('meta-escalation-map');
  if (mapEl && perEnergyEsc) {
    const parts = Object.keys(perEnergyEsc).map((k) => `${ENERGY_LABELS[k]} ${perEnergyEsc[k]}%`);
    mapEl.textContent = parts.join(' · ');
  }

  evolution.rows.forEach((row) => {
    const tr = document.createElement('tr');
    const detail = row.details
      .map((d) => `${formatNumber(d.kwh, 0)} kWh ${d.energy} × ${formatNumber(d.unitPriceYear, 6)} €/kWh = ${formatCurrency(d.cost)}`)
      .join('<br/>');
    tr.innerHTML = `
      <td>${row.year}</td>
      <td>${formatCurrency0(row.total)}</td>
      <td>${detail}</td>
    `;
    tbody.appendChild(tr);
  });

  section.hidden = false;
  document.getElementById('export-csv').disabled = false;
  drawChart(evolution);
  updateFactorCard(evolution);
  updatePriceCards(evolution);
  updateSurplusCard(evolution);
  syncChartHeight();
}

function toCSV({ escalationPct, evolution }) {
  const header = [
    'Inflation energie (%/an)',
    'Annee',
    'Total facture (EUR)',
    'Details (kWh|energie|EUR_kWh|cout)'
  ];
  const lines = [header.join(';')];
  evolution.rows.forEach((row) => {
    const details = row.details
      .map((d) => `${d.kwh}|${d.energy}|${d.unitPriceYear.toString().replace('.', ',')}|${d.cost.toFixed(2).replace('.', ',')}`)
      .join(' / ');
    lines.push([
      escalationPct,
      row.year,
      row.total.toFixed(2).replace('.', ','),
      details
    ].join(';'));
  });
  return lines.join('\n');
}

function download(filename, data, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('energy-form');
  const exportBtn = document.getElementById('export-csv');

  const rowsContainer = document.getElementById('rows');
  const addRowBtn = document.getElementById('add-row');

  function makeRow(initial = { kwh: '', energy: 'electricite', unitPrice: '' }) {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = `
      <input type="number" min="0" step="1" placeholder="kWh" class="kwh" value="${initial.kwh}">
      <select class="energy">
        <option value="electricite">Électricité</option>
        <option value="gaz">Gaz naturel</option>
        <option value="fioul">Fioul</option>
        <option value="granule">Granulé</option>
        <option value="plaquette">Plaquette</option>
        <option value="propane">Propane</option>
      </select>
      <input type="number" min="0" step="0.0001" placeholder="€/kWh" class="unitPrice" value="${initial.unitPrice}">
      <button type="button" class="remove">Supprimer</button>
    `;
    div.querySelector('.energy').value = initial.energy;
    div.querySelector('.remove').addEventListener('click', () => div.remove());
    rowsContainer.appendChild(div);
  }

  addRowBtn.addEventListener('click', () => makeRow());
  // Seed with one empty row
  makeRow();

  // Prefill per-type inflation inputs with presets
  const prefillIds = {
    electricite: 'esc-electricite',
    gaz: 'esc-gaz',
    fioul: 'esc-fioul',
    granule: 'esc-granule',
    plaquette: 'esc-plaquette',
    propane: 'esc-propane',
  };
  for (const key in prefillIds) {
    const el = document.getElementById(prefillIds[key]);
    if (el) el.value = String(ENERGY_ESCALATION_PRESETS[key]);
  }

  let lastExportData = null;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const rows = Array.from(rowsContainer.querySelectorAll('.row')).map((div) => {
      const kwh = parseNumber(div.querySelector('.kwh').value);
      const energy = div.querySelector('.energy').value;
      const unitPrice = parseNumber(div.querySelector('.unitPrice').value);
      return { kwh, energy, unitPrice };
    }).filter((r) => Number.isFinite(r.kwh) && r.kwh > 0 && Number.isFinite(r.unitPrice) && r.unitPrice >= 0);

    const startYear = Number(document.getElementById('start-year').value);
    const years = Number(document.getElementById('years').value);
    // Read per-type overrides
    const perTypeInputs = {
      electricite: document.getElementById('esc-electricite').value,
      gaz: document.getElementById('esc-gaz').value,
      fioul: document.getElementById('esc-fioul').value,
      granule: document.getElementById('esc-granule').value,
      plaquette: document.getElementById('esc-plaquette').value,
      propane: document.getElementById('esc-propane').value,
    };
    // Precedence: per-type input if set -> preset
    const perEnergyEsc = Object.fromEntries(Object.keys(ENERGY_ESCALATION_PRESETS).map((key) => {
      const perVal = perTypeInputs[key];
      const val = perVal !== '' ? Number(perVal) : ENERGY_ESCALATION_PRESETS[key];
      return [key, val];
    }));

    if (!rows.length) {
      alert('Veuillez ajouter au moins une ligne valide (kWh et €/kWh).');
      return;
    }
    if (!Number.isFinite(years) || years < 0 || years > 50) {
      alert('Nombre d\'années invalide.');
      return;
    }
    // Validate all chosen escalations
    for (const k in perEnergyEsc) {
      const v = perEnergyEsc[k];
      if (!Number.isFinite(v) || v < -50 || v > 100) {
        alert("Inflation énergie invalide (entre -50 et 100).");
        return;
      }
    }

    const evolution = computeEvolution({ startYear, years, rows, escalationPctByEnergy: perEnergyEsc });

    const usedMode = 'par type';
    renderResults({ escalationPct: usedMode, evolution, perEnergyEsc });
    lastExportData = { escalationPct: usedMode, evolution };
  });

  exportBtn.addEventListener('click', () => {
    if (!lastExportData) return;
    const csv = toCSV(lastExportData);
    download('evolution_facture.csv', csv, 'text/csv;charset=utf-8');
  });
});

function drawChart(evolution) {
  const svg = document.getElementById('results-chart');
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const legend = document.getElementById('chart-legend');
  if (legend) legend.innerHTML = '';

  const width = 800;
  const height = 320;
  const margin = { top: 20, right: 20, bottom: 30, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const years = evolution.rows.map((r) => r.year);
  const totals = evolution.rows.map((r) => r.total);
  const energyKeys = evolution.rows[0]?.details?.map((d) => d.energy) || [];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const maxVal = Math.max(...totals, 1);

  const x = (year) => {
    if (maxYear === minYear) return margin.left + innerW / 2;
    return margin.left + ((year - minYear) / (maxYear - minYear)) * innerW;
  };
  const y = (val) => margin.top + innerH - (val / maxVal) * innerH;

  const make = (name, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  };

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  // Axes
  svg.appendChild(make('line', { x1: margin.left, y1: y(0), x2: margin.left + innerW, y2: y(0), stroke: '#e5e7eb' }));
  svg.appendChild(make('line', { x1: margin.left, y1: margin.top, x2: margin.left, y2: margin.top + innerH, stroke: '#e5e7eb' }));

  // Y ticks (5)
  for (let i = 0; i <= 5; i += 1) {
    const v = (i / 5) * maxVal;
    const yy = y(v);
    svg.appendChild(make('line', { x1: margin.left, y1: yy, x2: margin.left + innerW, y2: yy, stroke: '#f3f4f6' }));
    const label = make('text', { x: margin.left - 8, y: yy + 4, 'text-anchor': 'end', fill: '#6b7280', 'font-size': '11' });
    label.textContent = formatCurrency0(v);
    svg.appendChild(label);
  }

  // X ticks (years)
  years.forEach((yr) => {
    const xx = x(yr);
    svg.appendChild(make('line', { x1: xx, y1: margin.top + innerH, x2: xx, y2: margin.top + innerH + 6, stroke: '#e5e7eb' }));
    const label = make('text', { x: xx, y: margin.top + innerH + 20, 'text-anchor': 'middle', fill: '#6b7280', 'font-size': '11' });
    label.textContent = String(yr);
    svg.appendChild(label);
  });

  // Build stacked areas by energy order
  const palette = {
    electricite: '#60a5fa',
    gaz: '#22c55e',
    fioul: '#f59e0b',
    granule: '#a78bfa',
    plaquette: '#14b8a6',
    propane: '#ef4444',
  };
  const stackBase = evolution.rows.map(() => 0);
  energyKeys.forEach((key, idx) => {
    const topPoints = [];
    const bottomPoints = [];
    evolution.rows.forEach((row, i) => {
      const segment = row.details[idx].cost; // cost for this energy at year
      const yBottom = y(stackBase[i]);
      const yTop = y(stackBase[i] + segment);
      topPoints.push(`${x(row.year)} ${yTop}`);
      bottomPoints.push(`${x(row.year)} ${yBottom}`);
      stackBase[i] += segment;
    });
    const path = `M ${topPoints[0]} L ${topPoints.slice(1).join(' L ')} L ${bottomPoints.reverse().join(' L ')} Z`;
    svg.appendChild(make('path', { d: path, fill: palette[key] || '#8884d8', 'fill-opacity': 0.5, stroke: palette[key] || '#8884d8', 'stroke-opacity': 0.8, 'stroke-width': 1 }));
    if (legend) {
      const item = document.createElement('div');
      item.className = 'legend-item';
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = palette[key] || '#8884d8';
      const label = document.createElement('span');
      label.textContent = ENERGY_LABELS[key] || key;
      item.appendChild(sw);
      item.appendChild(label);
      legend.appendChild(item);
    }
  });
}

function updateFactorCard(evolution) {
  const card = document.getElementById('factor-card');
  if (!card) return;
  const first = evolution.rows[0]?.total ?? 0;
  const last = evolution.rows[evolution.rows.length - 1]?.total ?? 0;
  const years = (evolution.rows.length - 1) || 1;
  const factor = first > 0 ? last / first : 0;
  const pct = first > 0 ? ((last - first) / first) * 100 : 0;
  const cagr = first > 0 ? (Math.pow(last / first, 1 / years) - 1) * 100 : 0;
  const factorEl = document.getElementById('factor-value');
  const subEl = document.getElementById('factor-sub');
  if (factorEl) factorEl.textContent = factor ? `×${formatNumber(factor, 1)}` : '—';
  if (subEl) subEl.textContent = `${pct >= 0 ? '+' : ''}${formatNumber(pct, 0)}% sur ${years} an(s) · ${formatNumber(cagr, 0)}%/an`;
}

function updatePriceCards(evolution) {
  const first = evolution.rows[0]?.total ?? 0;
  const last = evolution.rows[evolution.rows.length - 1]?.total ?? 0;
  const years = (evolution.rows.length - 1) || 1;
  const p0 = document.getElementById('price0-value');
  const p0s = document.getElementById('price0-sub');
  const px = document.getElementById('pricex-value');
  const pxs = document.getElementById('pricex-sub');
  if (p0) p0.textContent = formatCurrency0(first);
  if (px) px.textContent = formatCurrency0(last);
  if (p0s) p0s.textContent = 'Total annuel année 1';
  if (pxs) pxs.textContent = `Total annuel année ${years}`;
}

function updateSurplusCard(evolution) {
  const card = document.getElementById('surplus-card');
  if (!card) return;

  const first = evolution.rows[0]?.total ?? 0;
  if (first <= 0) return;

  // Calcul du surplus cumulé
  let surplus = 0;
  for (let i = 1; i < evolution.rows.length; i++) {
    const total = evolution.rows[i]?.total ?? 0;
    surplus += (total - first);
  }

  const valueEl = document.getElementById('surplus-value');
  const subEl = document.getElementById('surplus-sub');

  valueEl.textContent = formatCurrency0(surplus);
  subEl.textContent = `Somme des hausses sur ${evolution.rows.length - 1} an(s)`;
}

// Ensure the chart matches the height of the stats column for a clean layout
function syncChartHeight() {
  const row = document.querySelector('.chart-row');
  const stats = document.querySelector('.stats-col');
  const wrapper = document.querySelector('.chart-wrapper');
  if (!row || !stats || !wrapper) return;
  // If we are stacked (single column), let the chart pick a reasonable height
  const isStacked = getComputedStyle(row).gridTemplateColumns.split(' ').length === 1;
  if (isStacked) {
    wrapper.style.height = '360px';
  } else {
    wrapper.style.height = `${stats.getBoundingClientRect().height}px`;
  }
}