import { calculateTax } from './tax.js';
import { runModel }     from './model.js';
import { getVariant, trackEvent, attachScrollTracking, attachTimeTracking } from './abtest.js';

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
  const model = runModel(tax.total, figures);

  if (!model) {
    showError('Some figures are not yet sourced (TODO). The model cannot run until all data is complete.');
    return;
  }

  renderResult(tax, model, salary, region);
}

function renderResult(tax, model, salary, region) {
  const resultEl = document.getElementById('result');

  // Tax summary
  document.getElementById('res-income-tax').textContent = fmt(tax.incomeTax);
  document.getElementById('res-ni').textContent          = fmt(tax.ni);
  document.getElementById('res-total-tax').textContent   = fmt(tax.total);

  // Per-day
  document.getElementById('res-per-day').textContent = fmtSmall(model.perDayGbp);

  // Items — write both variant blocks
  renderItems(model.items, 'numbers');
  renderItems(model.items, 'story');

  resultEl.hidden = false;
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Analytics
  if (cleanupScroll) cleanupScroll();
  if (cleanupTime)   cleanupTime();
  trackEvent('result_view', { variant, region });
  cleanupScroll = attachScrollTracking(variant);
  cleanupTime   = attachTimeTracking(variant, Date.now());
}

function renderItems(items, v) {
  const list = document.getElementById(`items-${v}`);
  list.innerHTML = items.map(item => `
    <li>
      <strong>${item.p10.toLocaleString()}–${item.p90.toLocaleString()}</strong>
      ${item.names}
      <span class="median">(~${item.p50.toLocaleString()} typical)</span>
    </li>
  `).join('');
}

function fmt(n) {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSmall(n) {
  if (n < 0.01) return 'less than 1p';
  if (n < 1)    return Math.round(n * 100) + 'p';
  return '£' + n.toFixed(2);
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
