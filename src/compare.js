/**
 * "Before the cuts (2022–24) vs Now (2026–27 estimate)".
 * Pure functions — no DOM — so they can be unit-tested.
 *
 * Collective UK figures lead; the visitor's own share follows, using the same
 * proportional method as the main result: your share = T × UK amount ÷ E.
 */
import { runModel } from './model.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Multi-year pledge → GBP millions per year (assumes even disbursement). */
export function annualise({ total, years }) {
  return total / years;
}

/**
 * Gavi and Global Fund pledges, annualised, before vs now.
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
        before: { perYear: b, period: before.period },
        now:    { perYear: n, period: now.period },
        changePct: ((n - b) / b) * 100,
        yourBefore: share(b),
        yourNow:    share(n),
      };
    });
}

/**
 * UK child health aid per year, before vs now, as GBP and item equivalents.
 * A side is null while its figure is still TODO — the 2026–27 side stays null
 * until the ONE data team's estimate is added to figures.json.
 */
export function childHealthComparison(figures, taxTotal = null, rng = Math.random) {
  const E = figures.aid.expenditureOnServices.value;          // GBP millions
  const nowOda = figures.aid.childHealthODA2026_27;

  const side = (oda) => {
    if (!oda || !isNum(oda.low) || !isNum(oda.high)) return null;
    const f = { ...figures, aid: { ...figures.aid, childHealthODA: oda } };
    // With T = E (in GBP), C = T × ODA ÷ E is the whole UK child health budget
    const collective = runModel(E * 1e6, f, rng);
    if (!collective) return null;
    const mid = (oda.low + oda.high) / 2;
    return {
      low: oda.low,
      high: oda.high,
      items: collective.items,
      yourPerYear: taxTotal == null ? null : taxTotal * mid / E,
    };
  };

  return {
    before: side(figures.aid.childHealthODA),
    now: side(nowOda),
    pendingLabel: nowOda?.displayLabel ?? 'Estimate pending',
  };
}
