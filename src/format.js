/**
 * Display formatting for item counts and the no-tax message.
 * Pure functions — no DOM — so they can be unit-tested.
 */

/** Waits longer than this read as "less than one … in a lifetime of tax". */
export const CAP_YEARS = 100;

function intervalYears(n) {
  return Math.round((Math.round(12 / n) / 12) * 10) / 10;
}

const isCapped = (n) => n > 0 && n < 1 && intervalYears(n) > CAP_YEARS;

/**
 * Describe a yearly number of items in plain English.
 *   n >= 1  → "7 ORS + zinc treatments" (rounded, never below 1)
 *   n <  1  → "one bednet every 18 months", or "every 2.2 years" above 24 months
 *   wait > CAP_YEARS → "less than one bednet in a lifetime of tax at this salary"
 * Returns null for n <= 0 (nothing to show), so "0 items" can never be rendered.
 */
export function formatItemAmount(n, singular, plural) {
  if (!(n > 0)) return null;

  if (n >= 1) {
    const count = Math.round(n);
    return `${count.toLocaleString('en-GB')} ${count === 1 ? singular : plural}`;
  }
  if (isCapped(n)) return `less than one ${singular} in a lifetime of tax at this salary`;
  return `one ${singular} ${formatInterval(n)}`;
}

/**
 * "every 18 months" / "every 2.2 years" for n < 1 item a year.
 * Months rounded to whole months; above 24 months shown as years (1 dp).
 */
export function formatInterval(n) {
  const months = Math.round(12 / n);
  if (months <= 24) return `every ${months} months`;
  const years = Math.round((months / 12) * 10) / 10;
  return `every ${years.toLocaleString('en-GB')} years`;
}

/**
 * One item line for one estimate, e.g. "7 ORS + zinc treatments" or
 * "One bednet every 18 months". null when there is nothing to show (never "0 …").
 */
export function describeItem(count, singular, plural) {
  return capitalise(formatItemAmount(count, singular, plural));
}

/**
 * Friendly message when the visitor pays no Income Tax or NI, else null.
 * Triggers below the personal allowance (and whenever total tax is zero).
 */
export function noTaxMessage(salary, taxTotal, personalAllowance) {
  if (salary >= personalAllowance && taxTotal > 0) return null;  // salary < PA ⇒ total is 0 too
  const pa = '£' + personalAllowance.toLocaleString('en-GB');
  return `Good news: on a salary of ${pa} or less you don't pay any Income Tax, ` +
    `so there's no tax contribution to show. You can still add your name to the petition below.`;
}

/** GBP millions → "£330m" / "£1bn" / "£1.25bn" (up to 3 significant figures, so pledges show exactly). */
export function formatGbpMillions(m) {
  if (m >= 1000) return `£${Number((m / 1000).toPrecision(3)).toLocaleString('en-GB')}bn`;
  return `£${Math.round(m).toLocaleString('en-GB')}m`;
}

/** Small yearly GBP amounts: "38p", "£1.43". */
export function formatGbpSmall(n) {
  if (n < 0.01) return 'less than 1p';
  if (n < 1) return `${Math.round(n * 100)}p`;
  return `£${n.toFixed(2)}`;
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
