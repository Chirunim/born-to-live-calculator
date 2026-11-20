import { describe, it, expect } from 'vitest';
import { formatItemAmount, formatInterval, describeItem, noTaxMessage } from '../src/format.js';
import { calculateTax } from '../src/tax.js';
import { runModel } from '../src/model.js';
import figures from '../data/figures.json';

const SINGULAR = ['vaccine dose', 'bednet', 'ORS + zinc treatment'];
const PLURAL   = ['vaccine doses', 'bednets', 'ORS + zinc treatments'];
const PA = figures.tax.personalAllowance;

// Every Monte Carlo draw at the midpoint of its range → p10 = p50 = p90,
// so results can be checked by hand.
const midpoint = () => 0.5;

function cards(salary, rng = midpoint) {
  const tax = calculateTax(salary, 'ruk', figures);
  const model = runModel(tax.total, figures, rng);
  return model.items.map((item, i) => describeItem(item, SINGULAR[i], PLURAL[i]));
}

// Everything the visitor would read on a card
const text = (c) => [c.headline, c.label, c.detail].filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// formatInterval / formatItemAmount
// ---------------------------------------------------------------------------
describe('formatInterval', () => {
  it('rounds to whole months', () => {
    expect(formatInterval(0.99)).toBe('every 12 months');   // 12.12 → 12
    expect(formatInterval(0.7)).toBe('every 17 months');    // 17.14 → 17
  });

  it('stays in months up to and including 24', () => {
    expect(formatInterval(0.5)).toBe('every 24 months');
  });

  it('switches to years above 24 months', () => {
    expect(formatInterval(12 / 25)).toBe('every 2.1 years'); // 25 months
    expect(formatInterval(0.25)).toBe('every 4 years');      // 48 months
  });
});

describe('formatItemAmount', () => {
  it('uses a frequency below 1 a year', () => {
    expect(formatItemAmount(0.5, 'bednet', 'bednets')).toBe('one bednet every 24 months');
  });

  it('uses a count at 1 or more, with singular for 1', () => {
    expect(formatItemAmount(1.4, 'bednet', 'bednets')).toBe('1 bednet');
    expect(formatItemAmount(1.6, 'bednet', 'bednets')).toBe('2 bednets');
  });

  it('never returns "0 …"', () => {
    expect(formatItemAmount(0, 'bednet', 'bednets')).toBeNull();
    expect(formatItemAmount(0.01, 'bednet', 'bednets')).toBe('one bednet every 100 years');
  });
});

describe('100-year cap', () => {
  const LIFETIME = 'less than one bednet in a lifetime of tax at this salary';

  it('shows exactly 100 years uncapped', () => {
    expect(formatItemAmount(0.01, 'bednet', 'bednets')).toBe('one bednet every 100 years');
  });

  it('caps anything over 100 years', () => {
    expect(formatItemAmount(12 / 1201, 'bednet', 'bednets')).toBe(LIFETIME); // 1,201 months = 100.1 years
    expect(formatItemAmount(0.0001, 'bednet', 'bednets')).toBe(LIFETIME);
  });

  it('caps the card headline and drops "typical" when the whole range is capped', () => {
    const c = describeItem({ p10: 0.001, p50: 0.002, p90: 0.003 }, 'bednet', 'bednets');
    expect(c).toMatchObject({ mode: 'frequency', headline: 'Less than one bednet in a lifetime of tax at this salary', detail: '' });
  });

  it('caps only the end of the range that needs it', () => {
    const c = describeItem({ p10: 0.005, p50: 0.02, p90: 0.05 }, 'bednet', 'bednets');
    expect(c.headline).toBe('One bednet every 50 years');
    expect(c.detail).toBe('typical · range: every 20 years to more than 100 years');
  });

  it('£12,571 (tax £0.28) — every item capped, no five-figure years', () => {
    for (const c of cards(12571)) {
      expect(c.headline).toMatch(/^Less than one .* in a lifetime of tax at this salary$/);
      expect(text(c)).not.toMatch(/\d,\d{3}(\.\d)? years/);
    }
  });
});

// ---------------------------------------------------------------------------
// Worked salaries (rUK 2026-27, current figures.json)
// C = tax × (childHealthODA midpoint 573.85 ÷ 1,156,400); unit costs at range
// midpoints × 0.7874: vaccine £1.27953, bednet £3.74015, ORS + zinc £0.25197
// ---------------------------------------------------------------------------
describe('£12,000 — below the personal allowance', () => {
  it('pays no tax and gets the friendly message', () => {
    const tax = calculateTax(12000, 'ruk', figures);
    expect(tax.total).toBe(0);
    const msg = noTaxMessage(12000, tax.total, PA);
    expect(msg).toContain("you don't pay any Income Tax");
    expect(msg).toContain('£12,570');
  });

  it('applies in Scotland too', () => {
    const tax = calculateTax(12000, 'scotland', figures);
    expect(noTaxMessage(12000, tax.total, PA)).not.toBeNull();
  });
});

describe('£15,000', () => {
  // Tax 680.40 → C = £0.33764
  it('shows no friendly message', () => {
    const tax = calculateTax(15000, 'ruk', figures);
    expect(tax.total).toBeCloseTo(680.40, 2);
    expect(noTaxMessage(15000, tax.total, PA)).toBeNull();
  });

  it('vaccine: 0.264 a year → 45 months → every 3.8 years', () => {
    expect(cards(15000)[0]).toMatchObject({ mode: 'frequency', headline: 'One vaccine dose every 3.8 years' });
  });

  it('bednet: 0.0903 a year → 133 months → every 11.1 years', () => {
    expect(cards(15000)[1]).toMatchObject({ mode: 'frequency', headline: 'One bednet every 11.1 years' });
  });

  it('ORS + zinc: 1.34 a year → 1, singular', () => {
    expect(cards(15000)[2]).toMatchObject({ mode: 'count', headline: '1', label: 'ORS + zinc treatment' });
  });
});

describe('£25,000', () => {
  // Tax 3,480.40 → C = £1.72711
  it('vaccine: 1.35 a year → 1, singular', () => {
    expect(cards(25000)[0]).toMatchObject({ mode: 'count', headline: '1', label: 'vaccine dose' });
  });

  it('bednet: 0.462 a year → 26 months → every 2.2 years', () => {
    expect(cards(25000)[1]).toMatchObject({ mode: 'frequency', headline: 'One bednet every 2.2 years' });
  });

  it('ORS + zinc: 6.85 a year → 7', () => {
    expect(cards(25000)[2]).toMatchObject({ mode: 'count', headline: '7', label: 'ORS + zinc treatments' });
  });
});

describe('never shows "0 items" with real Monte Carlo draws', () => {
  for (const salary of [12571, 13000, 15000, 25000, 60000]) {
    it(`£${salary.toLocaleString('en-GB')}`, () => {
      for (const c of cards(salary, Math.random)) {
        expect(text(c)).not.toMatch(/(^|[^\d.,])0(?![\d.,])/);
        expect(text(c)).not.toMatch(/every 0 /);
      }
    });
  }
});
