/**
 * UK Income Tax + National Insurance calculator.
 * All functions are pure — no DOM, no fetch. Pass figures in as arguments.
 * Bands are expressed as taxable income above the personal allowance.
 */

/**
 * Adjusted personal allowance, accounting for the £1-per-£2 taper
 * that reduces it to zero between paYearTaperStart and paYearTaperEnd.
 */
export function adjustedPersonalAllowance(salary, { personalAllowance, paYearTaperStart, paYearTaperEnd }) {
  if (salary <= paYearTaperStart) return personalAllowance;
  const reduction = Math.floor((salary - paYearTaperStart) / 2);
  return Math.max(0, personalAllowance - reduction);
}

/**
 * Income tax on taxable income, applied against an array of bands.
 * Each band: { upto: number|null, rate: number }
 * upto is the taxable-income ceiling for that band; null = no ceiling.
 */
export function calculateIncomeTax(taxableIncome, bands) {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let remaining = taxableIncome;
  let prev = 0;

  for (const band of bands) {
    const ceiling = band.upto ?? Infinity;
    const slice = Math.min(remaining, ceiling - prev);
    if (slice <= 0) break;
    tax += slice * band.rate;
    remaining -= slice;
    prev = ceiling;
    if (remaining <= 0) break;
  }

  return tax;
}

/**
 * Employee Class 1 National Insurance (annual approximation).
 * Same rates for rUK and Scotland.
 */
export function calculateNI(salary, { primaryThreshold, upperEarningsLimit, mainRate, upperRate }) {
  if (salary <= primaryThreshold) return 0;
  const main = Math.min(salary, upperEarningsLimit) - primaryThreshold;
  const upper = Math.max(0, salary - upperEarningsLimit);
  return main * mainRate + upper * upperRate;
}

/**
 * Combined tax calculation.
 * region: 'ruk' | 'scotland'
 * figures: the parsed figures.json object
 * Returns { incomeTax, ni, total } in GBP.
 */
export function calculateTax(salary, region, figures) {
  const { tax } = figures;
  const pa = adjustedPersonalAllowance(salary, tax);
  const taxableIncome = Math.max(0, salary - pa);
  const bands = region === 'scotland' ? tax.scotland.bands : tax.ruk.bands;
  const incomeTax = calculateIncomeTax(taxableIncome, bands);
  const ni = calculateNI(salary, tax.ni);
  return {
    incomeTax: Math.round(incomeTax * 100) / 100,
    ni: Math.round(ni * 100) / 100,
    total: Math.round((incomeTax + ni) * 100) / 100,
  };
}
