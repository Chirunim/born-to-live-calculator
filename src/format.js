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

/** Short form for a range end: "every 20 months" below 1 a year, else "2 a year". */
function formatRangeEnd(n) {
  if (isCapped(n)) return `more than ${CAP_YEARS} years`;
  return n >= 1 ? `${Math.round(n).toLocaleString('en-GB')} a year` : formatInterval(n);
}

/**
 * Build the text for one item card from its 10th/50th/90th percentile yearly counts.
 * mode 'count'     — every percentile rounds to at least 1: the usual "p10–p90" range.
 * mode 'frequency' — some of the range is below 1: describe it as a frequency.
 */
export function describeItem({ p10, p50, p90 }, singular, plural) {
  const r = (n) => Math.round(n).toLocaleString('en-GB');

  if (Math.round(p10) >= 1) {
    const same = Math.round(p10) === Math.round(p90);
    return {
      mode: 'count',
      headline: same ? r(p50) : `${r(p10)}–${r(p90)}`,
      label: same && Math.round(p50) === 1 ? singular : plural,
      detail: same ? 'typical' : `~${r(p50)} typical`,
    };
  }

  const low = formatRangeEnd(p90);   // most items = shortest wait
  const high = formatRangeEnd(p10);
  return {
    mode: 'frequency',
    headline: capitalise(formatItemAmount(p50, singular, plural)),
    label: null,  // headline already names the item
    detail: low === high
      ? (isCapped(p50) ? '' : 'typical')
      : `typical · range: ${low} to ${high}`,
  };
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

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
