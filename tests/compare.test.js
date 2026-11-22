import { describe, it, expect } from 'vitest';
import { annualise, pledgeComparison, childHealthComparison, impactStatement } from '../src/compare.js';
import { formatGbpMillions, formatGbpSmall } from '../src/format.js';
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

  it('pledge totals show exactly: £1.25bn, £1.65bn, £1bn, £850m', () => {
    expect([1250, 1650, 1000, 850].map(formatGbpMillions)).toEqual(['£1.25bn', '£1.65bn', '£1bn', '£850m']);
  });
});

describe('UK mother and child health aid before the cuts', () => {
  const { before } = childHealthComparison(figures, null);

  it('is shown in £ only: core £486.4m to wider £661.3m', () => {
    expect(before).toMatchObject({ low: 486.4, high: 661.3 });
    expect([before.low, before.high].map(formatGbpMillions)).toEqual(['£486m', '£661m']);
  });

  it('has no collective item counts (they would overstate impact)', () => {
    expect(before).not.toHaveProperty('items');
  });

  it('has no personal share without a tax figure', () => {
    expect(before.yourPerYear).toBeNull();
  });
});

describe('UK published impact statements for current pledges', () => {
  const [gavi, gf] = pledgeComparison(figures);

  it('Gavi: gov.uk press release, quoted in full', () => {
    expect(gavi.impact.text).toBe('“Today’s pledge will help Gavi in their mission to protect up to 500 million children between 2026 to 2030 and save up to 8 million more lives.”');
    expect(gavi.impact.url).toBe('https://www.gov.uk/government/news/uk-partners-with-gavi-to-help-save-up-to-eight-million-lives-by-2030');
    expect(gavi.now).toMatchObject({ total: 1250, period: '2026–2030' });
  });

  it('Global Fund: Global Fund press release, opening clause with an ellipsis', () => {
    expect(gf.impact.text).toBe('“Our investment over the next three years will help to save up to 1.3 million lives…”');
    expect(gf.impact.url).toMatch(/^https:\/\/www\.theglobalfund\.org\/en\/news\/2025\/2025-11-11-/);
    expect(gf.now).toMatchObject({ total: 850, period: '2026–2028' });
  });

  it('each statement has a source, publication date and accessed date', () => {
    for (const key of ['gavi', 'globalFund']) {
      const i = figures.aid.pledges[key].now.impact;
      expect(i.attribution).toBeTruthy();
      expect(i._published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(i._accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('is null when no statement is recorded', () => {
    expect(impactStatement(undefined)).toBeNull();
    expect(impactStatement({ quote: 'x.' })).toBeNull();   // no URL, not shown
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
