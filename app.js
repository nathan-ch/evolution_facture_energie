// Energy escalation presets (% per year). Values are editable by the user via override.
const ENERGY_ESCALATION_PRESETS = {
  electricite: 3.0,
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

function formatPercent(value) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value) + '%';
}

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

function renderBaseResults(evolution) {
  const section = document.getElementById('base-results-section');
  const tbody = document.querySelector('#base-results-table tbody');
  tbody.innerHTML = '';

  // Hide comparison section
  document.getElementById('comparison-results-section').hidden = true;
  
  // Update key metrics
  updateBaseMetrics(evolution);
  
  // Draw chart
  drawChart(evolution, 'base-results-chart', 'base-chart-legend');
  
  // Fill table
  evolution.rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    const detail = row.details
      .map((d) => `${formatNumber(d.kwh, 0)} kWh ${ENERGY_LABELS[d.energy]} × ${formatNumber(d.unitPriceYear, 4)} €/kWh`)
      .join('<br/>');
    
    const previousTotal = index > 0 ? evolution.rows[index - 1].total : row.total;
    const evolutionPct = index > 0 ? ((row.total - previousTotal) / previousTotal) * 100 : 0;
    const evolutionText = index === 0 ? '—' : `${formatCurrency0(row.total - previousTotal)} (${evolutionPct >= 0 ? '+' : ''}${formatNumber(evolutionPct, 1)}%)`;
    const evolutionClass = index > 0 ? (evolutionPct > 0 ? 'evolution-up' : (evolutionPct < 0 ? 'evolution-down' : '')) : '';
    
    tr.innerHTML = `
      <td><strong>${row.year}</strong></td>
      <td><strong>${formatCurrency0(row.total)}</strong></td>
      <td class="${evolutionClass}">${evolutionText}</td>
      <td>${detail}</td>
    `;
    tbody.appendChild(tr);
  });

  section.hidden = false;
}

function renderComparisonResults(baseEvolution, scenarioEvolution) {
  const section = document.getElementById('comparison-results-section');
  const tbody = document.querySelector('#comparison-table tbody');
  tbody.innerHTML = '';

  // Hide base section
  document.getElementById('base-results-section').hidden = true;
  
  // Update comparison metrics
  updateComparisonMetrics(baseEvolution, scenarioEvolution);
  
  // Draw combined chart instead of separate charts
  drawCombinedChart(baseEvolution, scenarioEvolution);
  
  // Fill comparison table
  const maxYears = Math.max(baseEvolution.rows.length, scenarioEvolution.rows.length);
  for (let i = 0; i < maxYears; i += 1) {
    const baseRow = baseEvolution.rows[i];
    const scenarioRow = scenarioEvolution.rows[i];
    
    if (!baseRow || !scenarioRow) continue;
    
    const tr = document.createElement('tr');
    const baseDetail = baseRow.details
      .map((d) => `${formatNumber(d.kwh, 0)} kWh ${ENERGY_LABELS[d.energy]}`)
      .join('<br/>');
    const scenarioDetail = scenarioRow.details
      .map((d) => `${formatNumber(d.kwh, 0)} kWh ${ENERGY_LABELS[d.energy]}`)
      .join('<br/>');
    
    const economy = baseRow.total - scenarioRow.total; // Positive = economy
    const economyClass = economy > 0 ? 'economy-positive' : (economy < 0 ? 'economy-negative' : '');
    const economyText = economy === 0 ? '—' : `${formatCurrency0(Math.abs(economy))} ${economy > 0 ? '✓' : '✗'}`;
    
    tr.innerHTML = `
      <td><strong>${baseRow.year}</strong></td>
      <td><strong>${formatCurrency0(baseRow.total)}</strong></td>
      <td><strong>${formatCurrency0(scenarioRow.total)}</strong></td>
      <td class="${economyClass}"><strong>${economyText}</strong></td>
      <td>${baseDetail}</td>
      <td>${scenarioDetail}</td>
    `;
    tbody.appendChild(tr);
  }

  section.hidden = false;
}

function updateBaseMetrics(evolution) {
  const first = evolution.rows[0]?.total ?? 0;
  const last = evolution.rows[evolution.rows.length - 1]?.total ?? 0;
  const years = evolution.rows.length - 1;
  
  // Calculate cumulative total
  let cumulativeTotal = 0;
  evolution.rows.forEach(row => {
    cumulativeTotal += row.total;
  });
  
  const annualAverage = cumulativeTotal / evolution.rows.length;
  const totalGrowth = first > 0 ? ((last - first) / first) * 100 : 0;
  const cagr = first > 0 ? (Math.pow(last / first, 1 / years) - 1) * 100 : 0;
  
  // Update metrics
  document.getElementById('base-total-cost').textContent = formatCurrency0(cumulativeTotal);
  document.getElementById('base-annual-average').textContent = `${formatCurrency0(annualAverage)} / an en moyenne`;
  document.getElementById('base-first-year').textContent = formatCurrency0(first);
  document.getElementById('base-last-year').textContent = formatCurrency0(last);
  document.getElementById('base-growth').textContent = `${totalGrowth >= 0 ? '+' : ''}${formatNumber(totalGrowth, 1)}%`;
  document.getElementById('base-cagr').textContent = formatPercent(cagr);
}

function updateComparisonMetrics(baseEvolution, scenarioEvolution) {
  // Calculate cumulative totals
  let baseCumulative = 0;
  let scenarioCumulative = 0;
  
  baseEvolution.rows.forEach(row => { baseCumulative += row.total; });
  scenarioEvolution.rows.forEach(row => { scenarioCumulative += row.total; });
  
  const baseFirst = baseEvolution.rows[0]?.total ?? 0;
  const baseLast = baseEvolution.rows[baseEvolution.rows.length - 1]?.total ?? 0;
  const scenarioFirst = scenarioEvolution.rows[0]?.total ?? 0;
  const scenarioLast = scenarioEvolution.rows[scenarioEvolution.rows.length - 1]?.total ?? 0;
  const years = baseEvolution.rows.length - 1;
  
  const baseCagr = baseFirst > 0 ? (Math.pow(baseLast / baseFirst, 1 / years) - 1) * 100 : 0;
  const scenarioCagr = scenarioFirst > 0 ? (Math.pow(scenarioLast / scenarioFirst, 1 / years) - 1) * 100 : 0;
  
  const difference = baseCumulative - scenarioCumulative; // Positive = economy
  const differencePct = baseCumulative > 0 ? (difference / baseCumulative) * 100 : 0;
  
  // Update comparison metrics
  document.getElementById('comp-base-total').textContent = formatCurrency0(baseCumulative);
  document.getElementById('comp-base-first').textContent = formatCurrency0(baseFirst);
  document.getElementById('comp-base-last').textContent = formatCurrency0(baseLast);
  document.getElementById('comp-base-cagr').textContent = formatPercent(baseCagr);
  
  document.getElementById('comp-scenario-total').textContent = formatCurrency0(scenarioCumulative);
  document.getElementById('comp-scenario-first').textContent = formatCurrency0(scenarioFirst);
  document.getElementById('comp-scenario-last').textContent = formatCurrency0(scenarioLast);
  document.getElementById('comp-scenario-cagr').textContent = formatPercent(scenarioCagr);
  
  document.getElementById('comp-difference').textContent = formatCurrency0(Math.abs(difference));
  document.getElementById('comp-difference').className = `metric-value ${difference > 0 ? 'economy' : 'loss'}`;
  document.getElementById('comp-years').textContent = baseEvolution.rows.length -1;
  document.getElementById('comp-percentage').textContent = `${difference > 0 ? 'Économie' : 'Surcoût'} de ${formatNumber(Math.abs(differencePct), 1)}%`;
}

function drawChart(evolution, svgId, legendId) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const legend = document.getElementById(legendId);
  if (legend) legend.innerHTML = '';

  const width = 800;
  const height = 400;
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
      const segment = row.details[idx].cost;
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

function drawCombinedChart(baseEvolution, scenarioEvolution) {
  const svg = document.getElementById('combined-results-chart');
  if (!svg) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const legend = document.getElementById('combined-chart-legend');
  if (legend) legend.innerHTML = '';

  const width = 800;
  const height = 450;
  const margin = { top: 20, right: 20, bottom: 30, left: 60 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Combine years from both evolutions
  const years = baseEvolution.rows.map((r) => r.year);
  const baseTotals = baseEvolution.rows.map((r) => r.total);
  const scenarioTotals = scenarioEvolution.rows.map((r) => r.total);
  
  // Find max value for scaling
  const maxVal = Math.max(...baseTotals, ...scenarioTotals, 1);

  const x = (year) => {
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
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

  // Draw base scenario line
  const basePoints = baseEvolution.rows.map((row, i) => `${x(row.year)} ${y(row.total)}`).join(' L ');
  const basePath = `M ${basePoints}`;
  svg.appendChild(make('path', { 
    d: basePath, 
    fill: 'none', 
    stroke: '#3b82f6', 
    'stroke-width': 3,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }));

  // Draw scenario line
  const scenarioPoints = scenarioEvolution.rows.map((row, i) => `${x(row.year)} ${y(row.total)}`).join(' L ');
  const scenarioPath = `M ${scenarioPoints}`;
  svg.appendChild(make('path', { 
    d: scenarioPath, 
    fill: 'none', 
    stroke: '#8b5cf6', 
    'stroke-width': 3,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-dasharray': '5,5'
  }));

  // Add data points for base scenario
  baseEvolution.rows.forEach((row) => {
    const circle = make('circle', {
      cx: x(row.year),
      cy: y(row.total),
      r: 4,
      fill: '#3b82f6',
      stroke: '#ffffff',
      'stroke-width': 2
    });
    svg.appendChild(circle);
  });

  // Add data points for scenario
  scenarioEvolution.rows.forEach((row) => {
    const circle = make('circle', {
      cx: x(row.year),
      cy: y(row.total),
      r: 4,
      fill: '#8b5cf6',
      stroke: '#ffffff',
      'stroke-width': 2
    });
    svg.appendChild(circle);
  });

  // Add legend
  if (legend) {
    const scenarios = [
      { label: 'Scénario Base', color: '#3b82f6', dash: false },
      { label: 'Scénario Alternatif', color: '#8b5cf6', dash: true }
    ];
    
    scenarios.forEach(scenario => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = scenario.color;
      if (scenario.dash) {
        sw.style.background = 'repeating-linear-gradient(90deg, ' + scenario.color + ', ' + scenario.color + ' 3px, transparent 3px, transparent 6px)';
      }
      
      const label = document.createElement('span');
      label.textContent = scenario.label;
      label.style.fontWeight = '500';
      
      item.appendChild(sw);
      item.appendChild(label);
      legend.appendChild(item);
    });
  }

  // Add difference shading between lines
  baseEvolution.rows.forEach((baseRow, i) => {
    const scenarioRow = scenarioEvolution.rows[i];
    if (scenarioRow && baseRow.total !== scenarioRow.total) {
      const xPos = x(baseRow.year);
      const yBase = y(baseRow.total);
      const yScenario = y(scenarioRow.total);
      
      const isEconomy = baseRow.total > scenarioRow.total;
      const path = `M ${xPos} ${yBase} L ${xPos} ${yScenario}`;
      
      svg.appendChild(make('path', {
        d: path,
        stroke: isEconomy ? '#10b981' : '#ef4444',
        'stroke-width': 2,
        'stroke-opacity': 0.3
      }));
    }
  });
}

// ... (le code précédent reste identique)

document.addEventListener('DOMContentLoaded', () => {
  const calculateAllBtn = document.getElementById('calculate-all');
  const exportBtn = document.getElementById('export-csv');
  const enableScenarioCheckbox = document.getElementById('enable-scenario');

  const rowsContainer = document.getElementById('rows');
  const scenarioRowsContainer = document.getElementById('scenario-rows');
  const scenarioContent = document.getElementById('scenario-content');
  const addRowBtn = document.getElementById('add-row');
  const addScenarioRowBtn = document.getElementById('add-scenario-row');

  function makeRow(initial = { kwh: '', energy: 'electricite', unitPrice: '' }, container) {
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
    container.appendChild(div);
  }

  addRowBtn.addEventListener('click', () => makeRow({}, rowsContainer));
  addScenarioRowBtn.addEventListener('click', () => makeRow({}, scenarioRowsContainer));
  
  // Seed with one empty row in base section
  makeRow({}, rowsContainer);

  // Toggle scenario section
  enableScenarioCheckbox.addEventListener('change', (e) => {
    scenarioContent.hidden = !e.target.checked;
    if (e.target.checked && scenarioRowsContainer.children.length === 0) {
      makeRow({}, scenarioRowsContainer);
    }
  });

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

  function calculateBaseScenario() {
    const rows = Array.from(rowsContainer.querySelectorAll('.row')).map((div) => {
      const kwh = parseNumber(div.querySelector('.kwh').value);
      const energy = div.querySelector('.energy').value;
      const unitPrice = parseNumber(div.querySelector('.unitPrice').value);
      return { kwh, energy, unitPrice };
    }).filter((r) => Number.isFinite(r.kwh) && r.kwh > 0 && Number.isFinite(r.unitPrice) && r.unitPrice >= 0);

    const startYear = Number(document.getElementById('start-year').value);
    const years = Number(document.getElementById('years').value);
    
    const perTypeInputs = {
      electricite: document.getElementById('esc-electricite').value,
      gaz: document.getElementById('esc-gaz').value,
      fioul: document.getElementById('esc-fioul').value,
      granule: document.getElementById('esc-granule').value,
      plaquette: document.getElementById('esc-plaquette').value,
      propane: document.getElementById('esc-propane').value,
    };
    
    const perEnergyEsc = Object.fromEntries(Object.keys(ENERGY_ESCALATION_PRESETS).map((key) => {
      const perVal = perTypeInputs[key];
      const val = perVal !== '' ? Number(perVal) : ENERGY_ESCALATION_PRESETS[key];
      return [key, val];
    }));

    if (!rows.length) {
      alert('Veuillez ajouter au moins une ligne valide (kWh et €/kWh) dans la consommation de base.');
      return null;
    }
    if (!Number.isFinite(years) || years < 0 || years > 50) {
      alert('Nombre d\'années invalide.');
      return null;
    }
    
    for (const k in perEnergyEsc) {
      const v = perEnergyEsc[k];
      if (!Number.isFinite(v) || v < -50 || v > 100) {
        alert("Inflation énergie invalide (entre -50 et 100).");
        return null;
      }
    }

    return computeEvolution({ startYear, years, rows, escalationPctByEnergy: perEnergyEsc });
  }

  function calculateScenario() {
    const rows = Array.from(scenarioRowsContainer.querySelectorAll('.row')).map((div) => {
      const kwh = parseNumber(div.querySelector('.kwh').value);
      const energy = div.querySelector('.energy').value;
      const unitPrice = parseNumber(div.querySelector('.unitPrice').value);
      return { kwh, energy, unitPrice };
    }).filter((r) => Number.isFinite(r.kwh) && r.kwh > 0 && Number.isFinite(r.unitPrice) && r.unitPrice >= 0);

    const startYear = Number(document.getElementById('start-year').value);
    const years = Number(document.getElementById('years').value);
    
    const perTypeInputs = {
      electricite: document.getElementById('esc-electricite').value,
      gaz: document.getElementById('esc-gaz').value,
      fioul: document.getElementById('esc-fioul').value,
      granule: document.getElementById('esc-granule').value,
      plaquette: document.getElementById('esc-plaquette').value,
      propane: document.getElementById('esc-propane').value,
    };
    
    const perEnergyEsc = Object.fromEntries(Object.keys(ENERGY_ESCALATION_PRESETS).map((key) => {
      const perVal = perTypeInputs[key];
      const val = perVal !== '' ? Number(perVal) : ENERGY_ESCALATION_PRESETS[key];
      return [key, val];
    }));

    if (!rows.length) {
      alert('Veuillez ajouter au moins une ligne valide (kWh et €/kWh) dans le scénario.');
      return null;
    }

    return computeEvolution({ startYear, years, rows, escalationPctByEnergy: perEnergyEsc });
  }

  calculateAllBtn.addEventListener('click', () => {
    // Calcul du scénario de base (toujours requis)
    const baseEvolution = calculateBaseScenario();
    if (!baseEvolution) return;
    
    // Vérifier si le scénario est activé
    const isScenarioEnabled = enableScenarioCheckbox.checked;
    
    if (isScenarioEnabled) {
      // Calcul du scénario alternatif
      const scenarioEvolution = calculateScenario();
      if (scenarioEvolution) {
        // Afficher la comparaison si le scénario est valide
        renderComparisonResults(baseEvolution, scenarioEvolution);
      }
      // Si scenarioEvolution est null, l'alerte a déjà été affichée par calculateScenario()
    } else {
      // Scénario non activé : afficher seulement les résultats de base
      renderBaseResults(baseEvolution);
    }
    
    exportBtn.disabled = false;
  });

  exportBtn.addEventListener('click', () => {
    alert("L'export CSV sera implémenté");
  });
});