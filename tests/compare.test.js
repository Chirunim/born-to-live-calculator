import { describe, it, expect } from 'vitest';
import { annualise, pledgeComparison, childHealthComparison } from '../src/compare.js';
import { formatBigRange, formatGbpMillions, formatGbpSmall } from '../src/format.js';
import { calculateTax } from '../src/tax.js';
import figures from '../data/figures.json';

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

describe('2026–27 mother and child health aid placeholder', () => {
  const ph = figures.aid.childHealthODA2026_27;

  it('is clearly labelled and not invented', () => {
    expect(ph.low).toBe('TODO');
    expect(ph.high).toBe('TODO');
    expect(ph.displayLabel).toBe('Estimate pending ONE data team');
  });

  it('shows the pending label instead of a number', () => {
    const ch = childHealthComparison(figures, 4880.40);
    expect(ch.now).toBeNull();
    expect(ch.pendingLabel).toBe('Estimate pending ONE data team');
  });

  it('fills in automatically once a figure is added', () => {
    // Test-only fixture: reuse the 2022–24 figure so no number is invented
    const { low, high } = figures.aid.childHealthODA;
    const filled = { ...figures, aid: { ...figures.aid, childHealthODA2026_27: { ...figures.aid.childHealthODA2026_27, low, high } } };
    const ch = childHealthComparison(filled, 4880.40);
    expect(ch.now).not.toBeNull();
    expect(ch.now.yourPerYear).toEqual(ch.before.yourPerYear);
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

describe('UK mother and child health aid before the cuts', () => {
  // Core £486.4m, wider £661.3m ÷ vaccine course £2.00787 = 242.2m / 329.4m children;
  // ÷ bednet £1.52756 = 318.4m / 432.9m
  const { before } = childHealthComparison(figures, null);

  it('is the whole 2022–24 budget, for each estimate', () => {
    const [vax, net] = before.items;
    expect(vax.low / 1e6).toBeCloseTo(242.25, 1);
    expect(vax.high / 1e6).toBeCloseTo(329.35, 1);
    expect(net.low / 1e6).toBeCloseTo(318.42, 1);
    expect(net.high / 1e6).toBeCloseTo(432.91, 1);
    expect(formatBigRange(vax.low, vax.high)).toBe('240–330 million');
    expect(formatBigRange(net.low, net.high)).toBe('320–430 million');
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

  it('mother and child health aid £2.05–£2.79 a year before; now pending', () => {
    const ch = childHealthComparison(figures, T);
    expect(formatGbpSmall(ch.before.yourPerYear.low)).toBe('£2.05');
    expect(formatGbpSmall(ch.before.yourPerYear.high)).toBe('£2.79');
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
