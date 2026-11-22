/**
 * "Before the cuts (2022–24) vs Now (2026–27 estimate)".
 * Pure functions — no DOM — so they can be unit-tested.
 *
 * Collective UK figures lead; the visitor's own share follows, using the same
 * proportional method as the main result: your share = T × UK amount ÷ E.
 */
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Multi-year pledge → GBP millions per year (assumes even disbursement). */
export function annualise({ total, years }) {
  return total / years;
}

/**
 * The UK's own published impact statement for a pledge, ready to display.
 * The quote is shown exactly as published, in quotation marks; a clause cut short
 * of the full sentence gets an ellipsis.
 */
export function impactStatement(impact) {
  if (!impact || !impact.quote || !impact._url) return null;
  const complete = /[.!?]$/.test(impact.quote);
  return {
    text: `“${impact.quote}${complete ? '' : '…'}”`,
    attribution: impact.attribution,
    url: impact._url,
  };
}

/**
 * Gavi and Global Fund pledges, annualised, before vs now, with the UK's own
 * published impact statement for the current pledge.
 * yourBefore / yourNow are GBP per year (null when no tax figure given).
 * Both sides use the latest published expenditure on services (E), so the
 * change in your share reflects the change in the pledge alone.
 */
export function pledgeComparison(figures, taxTotal = null) {
  const E = figures.aid.expenditureOnServices.value;          // GBP millions
  const share = (perYear) => (taxTotal == null ? null : taxTotal * perYear / E);

  return Object.entries(figures.aid.pledges)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, { name, before, now }]) => {
      const b = annualise(before);
      const n = annualise(now);
      return {
        key,
        name,
        before: { perYear: b, total: before.total, period: before.period },
        now:    { perYear: n, total: now.total, period: now.period },
        impact: impactStatement(now.impact),
        changePct: ((n - b) / b) * 100,
        yourBefore: share(b),
        yourNow:    share(n),
      };
    });
}

/**
 * UK mother and child health aid per year, before vs now, in GBP, for each of the two
 * estimates (core, and including wider basic health). No item counts: dividing the
 * whole budget by purchase prices would overstate real impact.
 * A side is null while its figure is still TODO — the 2026–27 side stays null
 * until the ONE data team's estimate is added to figures.json.
 */
export function childHealthComparison(figures, taxTotal = null) {
  const E = figures.aid.expenditureOnServices.value;          // GBP millions
  const nowOda = figures.aid.childHealthODA2026_27;

  const side = (oda) => {
    if (!oda || !isNum(oda.low) || !isNum(oda.high)) return null;
    return {
      low: oda.low,
      high: oda.high,
      yourPerYear: taxTotal == null ? null : { low: taxTotal * oda.low / E, high: taxTotal * oda.high / E },
    };
  };

  return {
    before: side(figures.aid.childHealthODA),
    now: side(nowOda),
    pendingLabel: nowOda?.displayLabel ?? 'Estimate pending',
  };
}
