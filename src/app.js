import { calculateTax } from './tax.js';
import { runModel }     from './model.js';
import { describeItem, noTaxMessage, formatBigRange, formatGbpMillions, formatGbpSmall } from './format.js';
import { childHealthComparison, pledgeComparison } from './compare.js';
import { getVariant, trackEvent, attachScrollTracking, attachTimeTracking } from './abtest.js';

const ITEM_ICONS = [
  // vaccine — shield with medical cross
  `<svg class="item-icon" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <circle cx="18" cy="18" r="15" fill="currentColor" fill-opacity="0.1"/>
    <path d="M18 7 L27 11 L27 20 C27 25 18 29 18 29 C18 29 9 25 9 20 L9 11 Z"
          stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
    <line x1="18" y1="15" x2="18" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="14.5" y1="18.5" x2="21.5" y2="18.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,
  // bednet — tent outline with mesh dashes
  `<svg class="item-icon" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <circle cx="18" cy="18" r="15" fill="currentColor" fill-opacity="0.1"/>
    <path d="M8 27 L18 11 L28 27 Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
    <line x1="8" y1="27" x2="28" y2="27" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
    <line x1="13" y1="21" x2="23" y2="21" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-dasharray="2 2"/>
    <line x1="15" y1="24.5" x2="21" y2="24.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-dasharray="2 2"/>
  </svg>`,
  // ORS — water drop
  `<svg class="item-icon" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <circle cx="18" cy="18" r="15" fill="currentColor" fill-opacity="0.1"/>
    <path d="M18 8 C18 8 11 16.5 11 21.5 C11 25.6 14.1 29 18 29 C21.9 29 25 25.6 25 21.5 C25 16.5 18 8 18 8 Z"
          stroke="currentColor" stroke-width="1.75"/>
    <path d="M14 24 C14 24 15 27 18 27" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,
];

const ITEM_SHORT_NAMES    = ['vaccine doses', 'bednets', 'ORS + zinc treatments'];
const ITEM_SINGULAR_NAMES = ['vaccine dose', 'bednet', 'ORS + zinc treatment'];

let figures = null;
let variant = null;
let cleanupScroll = null;
let cleanupTime   = null;

async function init() {
  const res = await fetch('./data/figures.json');
  figures = await res.json();

  variant = getVariant();
  document.documentElement.dataset.variant = variant;

  document.getElementById('calculate-btn').addEventListener('click', onCalculate);
  document.getElementById('scotland-toggle').addEventListener('change', onCalculate);
  document.getElementById('petition-btn').addEventListener('click', () => {
    trackEvent('petition_click', { variant });
  });

  const url = figures.meta.petitionUrl.value;
  if (url && url !== 'TODO') {
    document.getElementById('petition-btn').href = url;
  }
}

function onCalculate() {
  const salaryInput = document.getElementById('salary').value.trim().replace(/,/g, '');
  const salary = parseFloat(salaryInput);
  if (!salary || salary <= 0) {
    showError('Please enter a valid annual salary.');
    return;
  }

  clearError();

  const region = document.getElementById('scotland-toggle').checked ? 'scotland' : 'ruk';
  const tax = calculateTax(salary, region, figures);

  const noTax = noTaxMessage(salary, tax.total, figures.tax.personalAllowance);
  if (noTax) {
    renderNoTax(noTax, region);
    return;
  }

  const model = runModel(tax.total, figures);

  if (!model) {
    showError('Some figures are not yet sourced (TODO). The model cannot run until all data is complete.');
    return;
  }

  renderResult(tax, model, salary, region);
}

function renderNoTax(message, region) {
  const resultEl = document.getElementById('result');
  resultEl.classList.add('no-tax');
  document.getElementById('no-tax-msg').textContent = message;
  renderComparison(null);   // UK figures only — no personal share to show
  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (cleanupScroll) cleanupScroll();
  if (cleanupTime)   cleanupTime();
  trackEvent('result_view', { variant, region });
  cleanupScroll = attachScrollTracking(variant);
  cleanupTime   = attachTimeTracking(variant, Date.now());
}

function renderResult(tax, model, salary, region) {
  const resultEl = document.getElementById('result');
  resultEl.classList.remove('no-tax');

  // Tax summary
  document.getElementById('res-income-tax').textContent = fmt(tax.incomeTax);
  document.getElementById('res-ni').textContent          = fmt(tax.ni);
  document.getElementById('res-total-tax').textContent   = fmt(tax.total);

  // Annual contribution + per-day
  // Both variant blocks carry their own copy of these figures
  const annual = model.perDayGbp * 365;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const suffix of ['', '-story']) {
    const annualEl = document.getElementById(`res-annual${suffix}`);
    if (annualEl) {
      if (reduceMotion) annualEl.textContent = fmtAnnual(annual);
      else              countUp(annualEl, annual);
    }
    const perDayEl = document.getElementById(`res-per-day${suffix}`);
    if (perDayEl) perDayEl.textContent = fmtSmall(model.perDayGbp);
  }

  // Items — write both variant blocks
  renderItems(model.items, 'numbers');
  renderItems(model.items, 'story');

  renderComparison(tax.total);

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Stagger-animate the icon cards
  requestAnimationFrame(animateCards);

  // Analytics
  if (cleanupScroll) cleanupScroll();
  if (cleanupTime)   cleanupTime();
  trackEvent('result_view', { variant, region });
  cleanupScroll = attachScrollTracking(variant);
  cleanupTime   = attachTimeTracking(variant, Date.now());
}

function renderItems(items, v) {
  const grid = document.getElementById(`items-${v}`);
  grid.innerHTML = items.map((item, i) => {
    const plural   = ITEM_SHORT_NAMES[i] ?? item.names;
    const singular = ITEM_SINGULAR_NAMES[i] ?? item.name;
    const d = describeItem(item, singular, plural);
    return `
    <div class="item-card">
      ${ITEM_ICONS[i] ?? ''}
      <div class="item-range ${d.mode}">${d.headline}</div>
      ${d.label ? `<div class="item-name">${d.label}</div>` : ''}
      ${d.detail ? `<div class="item-median">${d.detail}</div>` : ''}
    </div>`;
  }).join('');
}

// Before the cuts (2022–24) vs Now (2026–27 estimate)
function renderComparison(taxTotal) {
  const ch = childHealthComparison(figures, taxTotal);
  const pledges = pledgeComparison(figures, taxTotal);

  // Collective UK mother and child health aid
  const odaText = (side) => `${formatGbpMillions(side.low)}–${formatGbpMillions(side.high)}`;
  const itemsText = (side) => {
    const [vax, net] = side.items;
    return `≈ ${formatBigRange(vax.p10, vax.p90)} vaccine doses, or ${formatBigRange(net.p10, net.p90)} bednets`;
  };
  document.getElementById('cmp-oda-before').textContent = ch.before ? odaText(ch.before) : '—';
  document.getElementById('cmp-oda-before-items').textContent = ch.before ? itemsText(ch.before) : '';
  document.getElementById('cmp-oda-now-cell').classList.toggle('pending', !ch.now);
  document.getElementById('cmp-oda-now').textContent = ch.now ? odaText(ch.now) : ch.pendingLabel;
  document.getElementById('cmp-oda-now-items').textContent = ch.now ? itemsText(ch.now) : '';

  // Pledges
  const pct = (p) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(Math.round(p))}%`;
  document.querySelector('#cmp-pledges tbody').innerHTML = pledges.map((p) => `
    <tr>
      <th scope="row">${p.name}</th>
      <td>${formatGbpMillions(p.before.perYear)}<small>${p.before.period}</small></td>
      <td>${formatGbpMillions(p.now.perYear)}<small>${p.now.period}</small></td>
      <td class="compare-down">${pct(p.changePct)}</td>
    </tr>`).join('');

  // The visitor's own share
  if (taxTotal == null) return;
  const rows = [
    ['Mother and child health aid',
      ch.before ? formatGbpSmall(ch.before.yourPerYear) : '—',
      ch.now ? formatGbpSmall(ch.now.yourPerYear) : 'Pending'],
    ...pledges.map((p) => [p.name, formatGbpSmall(p.yourBefore), formatGbpSmall(p.yourNow)]),
  ];
  document.querySelector('#cmp-yours tbody').innerHTML = rows.map(([name, b, n]) => `
    <tr><th scope="row">${name}</th><td>${b}</td><td>${n}</td></tr>`).join('');
}

function fmt(n) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSmall(n) {
  if (n < 0.01) return 'less than 1p';
  if (n < 1)    return Math.round(n * 100) + 'p';
  return '£' + n.toFixed(2);
}

function fmtAnnual(n) {
  if (n < 0.01) return 'less than 1p';
  if (n < 1)    return Math.round(n * 100) + 'p';
  return '£' + n.toFixed(2);
}

function countUp(el, target, duration = 900) {
  const start = performance.now();
  function step(now) {
    const t      = Math.min((now - start) / duration, 1);
    const eased  = 1 - Math.pow(1 - t, 3);
    el.textContent = fmtAnnual(target * eased);
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = fmtAnnual(target);
  }
  requestAnimationFrame(step);
}

function animateCards() {
  document.querySelectorAll('.item-card').forEach((card, i) => {
    setTimeout(() => card.classList.add('visible'), i * 100);
  });
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.hidden = false;
}

function clearError() {
  document.getElementById('error-msg').hidden = true;
}

init();
