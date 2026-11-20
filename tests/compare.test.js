import { describe, it, expect } from 'vitest';
import { annualise, pledgeComparison, childHealthComparison } from '../src/compare.js';
import { formatBigCount, formatBigRange, formatGbpMillions, formatGbpSmall } from '../src/format.js';
import { calculateTax } from '../src/tax.js';
import figures from '../data/figures.json';

const midpoint = () => 0.5;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
describe('pledge figures', () => {
  const { pledges } = figures.aid;

  it('match the gov.uk announcements', () => {
    expect(pledges.gavi.before).toMatchObject({ total: 1650, period: '2021–2025', years: 5 });
    expect(pledges.gavi.now).toMatchObject({ total: 1250, period: '2026–2030', years: 5 });
    expect(pledges.globalFund.before).toMatchObject({ total: 1000, period: '2023–2025', years: 3 });
    expect(pledges.globalFund.now).toMatchObject({ total: 850, period: '2026–2028', years: 3 });
  });

  it('each cite a gov.uk URL with an accessed date', () => {
    for (const key of ['gavi', 'globalFund']) {
      for (const side of ['before', 'now']) {
        const p = pledges[key][side];
        expect(p._url).toMatch(/^https:\/\/www\.gov\.uk\//);
        expect(p._accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe('2026–27 child health aid placeholder', () => {
  const ph = figures.aid.childHealthODA2026_27;

  it('is clearly labelled and not invented', () => {
    expect(ph.low).toBe('TODO');
    expect(ph.high).toBe('TODO');
    expect(ph.displayLabel).toBe('Estimate pending ONE data team');
  });

  it('shows the pending label instead of a number', () => {
    const ch = childHealthComparison(figures, 4880.40, midpoint);
    expect(ch.now).toBeNull();
    expect(ch.pendingLabel).toBe('Estimate pending ONE data team');
  });

  it('fills in automatically once a figure is added', () => {
    // Test-only fixture: reuse the 2022–24 figure so no number is invented
    const { low, high } = figures.aid.childHealthODA;
    const filled = { ...figures, aid: { ...figures.aid, childHealthODA2026_27: { ...figures.aid.childHealthODA2026_27, low, high } } };
    const ch = childHealthComparison(filled, 4880.40, midpoint);
    expect(ch.now).not.toBeNull();
    expect(ch.now.yourPerYear).toBeCloseTo(ch.before.yourPerYear, 10);
  });
});

// ---------------------------------------------------------------------------
// Collective UK figures
// ---------------------------------------------------------------------------
describe('pledges annualised', () => {
  it('total ÷ years', () => {
    expect(annualise({ total: 1650, years: 5 })).toBe(330);
    expect(annualise({ total: 850, years: 3 })).toBeCloseTo(283.33, 2);
  });

  it('Gavi £330m → £250m a year (−24%); Global Fund £333m → £283m (−15%)', () => {
    const [gavi, gf] = pledgeComparison(figures);
    expect(gavi).toMatchObject({ key: 'gavi', before: { perYear: 330 }, now: { perYear: 250 } });
    expect(gavi.changePct).toBeCloseTo(-24.24, 2);
    expect(gf.before.perYear).toBeCloseTo(333.33, 2);
    expect(gf.now.perYear).toBeCloseTo(283.33, 2);
    expect(gf.changePct).toBeCloseTo(-15, 5);
    expect([gavi, gf].map((p) => formatGbpMillions(p.now.perYear))).toEqual(['£250m', '£283m']);
  });
});

describe('UK child health aid before the cuts (midpoint draws)', () => {
  // £573.85m ÷ vaccine £1.27953 = 448.5m; ÷ bednet £3.74015 = 153.4m
  const { before } = childHealthComparison(figures, null, midpoint);

  it('equals the whole 2022–24 child health budget', () => {
    expect(before.items[0].p50 / 1e6).toBeCloseTo(448.49, 1);
    expect(before.items[1].p50 / 1e6).toBeCloseTo(153.43, 1);
    expect(formatBigCount(before.items[0].p50)).toBe('450 million');
    expect(formatBigCount(before.items[1].p50)).toBe('150 million');
  });

  it('has no personal share without a tax figure', () => {
    expect(before.yourPerYear).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The visitor's share — £30,000 rUK, tax £4,880.40
// ---------------------------------------------------------------------------
describe('£30,000 visitor share', () => {
  const T = calculateTax(30000, 'ruk', figures).total;

  it('tax is £4,880.40', () => {
    expect(T).toBeCloseTo(4880.40, 2);
  });

  it('child health £2.42 a year before; now pending', () => {
    const ch = childHealthComparison(figures, T, midpoint);
    expect(formatGbpSmall(ch.before.yourPerYear)).toBe('£2.42');
    expect(ch.now).toBeNull();
  });

  it('Gavi £1.39 → £1.06; Global Fund £1.41 → £1.20', () => {
    const [gavi, gf] = pledgeComparison(figures, T);
    expect([gavi.yourBefore, gavi.yourNow, gf.yourBefore, gf.yourNow].map(formatGbpSmall))
      .toEqual(['£1.39', '£1.06', '£1.41', '£1.20']);
  });
});

describe('formatBigRange', () => {
  it('shares the unit when both ends match', () => {
    expect(formatBigRange(312e6, 798e6)).toBe('310–800 million');
  });
  it('names both units when they differ', () => {
    expect(formatBigRange(850e6, 1.12e9)).toBe('850 million–1.1 billion');
  });
  it('collapses an identical range', () => {
    expect(formatBigRange(448e6, 452e6)).toBe('450 million');
  });
});
