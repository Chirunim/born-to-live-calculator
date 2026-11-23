import { describe, it, expect } from 'vitest';
import { formatItemAmount, formatInterval, describeItem, noTaxMessage } from '../src/format.js';
import { calculateTax } from '../src/tax.js';
import { runModel, unitCostUsd } from '../src/model.js';
import figures from '../data/figures.json';

const SINGULAR = ['child fully vaccinated (3 doses)', 'bednet', 'ORS + zinc treatment'];
const PLURAL   = ['children fully vaccinated (3 doses each)', 'bednets', 'ORS + zinc treatments'];
const PA = figures.tax.personalAllowance;

// Item lines for one estimate ('low' = core, 'high' = including wider basic health)
function lines(salary, key) {
  const tax = calculateTax(salary, 'ruk', figures);
  const est = runModel(tax.total, figures).estimates.find((e) => e.key === key);
  return est.items.map((item, i) => describeItem(item.count, SINGULAR[i], PLURAL[i]));
}

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

  it('capitalises the item line', () => {
    expect(describeItem(0.0001, 'bednet', 'bednets')).toBe('Less than one bednet in a lifetime of tax at this salary');
    expect(describeItem(0.02, 'bednet', 'bednets')).toBe('One bednet every 50 years');
  });

  it('£12,571 (tax £0.28) — every item capped in both estimates, no five-figure years', () => {
    for (const key of ['low', 'high']) {
      for (const line of lines(12571, key)) {
        expect(line).toMatch(/^Less than one .* in a lifetime of tax at this salary$/);
        expect(line).not.toMatch(/\d,\d{3}(\.\d)? years/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Worked salaries (rUK 2026-27, current figures.json)
// C = tax × childHealthODA ÷ 1,156,400, with LOW = 486.4 (core) and HIGH = 661.3
// (including wider basic health). Unit costs (UNICEF purchase prices) × 0.7874:
// vaccine course $2.55 = £2.00787, bednet $1.94 = £1.52756, ORS + zinc $0.225 = £0.17717
// ---------------------------------------------------------------------------
describe('unit costs (UNICEF purchase prices)', () => {
  const { costs } = figures;

  it('vaccine: $0.85 per dose × 3 doses = $2.55 for one fully vaccinated child', () => {
    expect(costs.vaccineDtp).toMatchObject({ pricePerDose: 0.85, dosesPerCourse: 3 });
    expect(unitCostUsd(costs.vaccineDtp)).toBeCloseTo(2.55, 10);
  });

  it('bednet: $1.94 (UNICEF weighted average price, 2021)', () => {
    expect(unitCostUsd(costs.bednet)).toBe(1.94);
    expect(costs.bednet._year).toBe('2021');
  });

  it('ORS + zinc course (co-pack S1580022): 2 × $0.079 + 10 × $0.0067 = $0.225', () => {
    const [ors, zinc] = costs.orsTreatment.components;
    expect(ors).toMatchObject({ productCode: 'S1561120', packPrice: 7.90, packSize: 100, quantity: 2 });
    expect(zinc).toMatchObject({ productCode: 'S1580020', packPrice: 0.67, packSize: 100, quantity: 10 });
    expect(costs.orsTreatment.courseDefinition.productCode).toBe('S1580022');
    for (const c of [ors, zinc]) {
      expect(c._url).toMatch(/^https:\/\/supplyhub\.unicef\.org\/product-detail\?q=[A-Za-z0-9]+$/);
    }
    expect(unitCostUsd(costs.orsTreatment)).toBeCloseTo(0.225, 10);
  });

  it('all three are purchase prices with a source, URL, year and accessed date', () => {
    for (const key of ['vaccineDtp', 'bednet', 'orsTreatment']) {
      const c = costs[key];
      expect(c._basis).toBe('purchase');
      expect(c._url).toMatch(/^https:\/\//);
      expect(c._source).toMatch(/UNICEF/);
      expect(c._year).toMatch(/^\d{4}$/);
      expect(c._accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c).not.toHaveProperty('low');
      expect(c).not.toHaveProperty('high');
    }
  });

  it('a missing component makes the cost TODO, not a wrong number', () => {
    expect(unitCostUsd({ components: [{ packPrice: 'TODO', packSize: 100, quantity: 2 }] })).toBe('TODO');
    expect(unitCostUsd({ pricePerDose: 'TODO', dosesPerCourse: 3 })).toBe('TODO');
  });
});

describe('runModel', () => {
  const T = calculateTax(30000, 'ruk', figures).total;   // £4,880.40
  const { estimates } = runModel(T, figures);

  it('returns exactly two labelled estimates, core first', () => {
    expect(estimates.map((e) => e.key)).toEqual(['low', 'high']);
    expect(estimates.map((e) => e.label)).toEqual(['Core mother and child programmes', 'Including wider basic health']);
    for (const e of estimates) expect(e.includes).toMatch(/\.$/);
  });

  it('£30,000: £2.05 core, £2.79 including wider basic health', () => {
    expect(estimates[0].annualGbp).toBeCloseTo(2.05277, 4);
    expect(estimates[1].annualGbp).toBeCloseTo(2.79091, 4);
    expect(estimates[0].perDayGbp).toBeCloseTo(2.05277 / 365, 6);
  });

  it('is deterministic — same input, same output', () => {
    expect(runModel(T, figures)).toEqual(runModel(T, figures));
  });

  it('returns null while a figure is TODO', () => {
    const f = { ...figures, aid: { ...figures.aid, childHealthODA: { ...figures.aid.childHealthODA, high: 'TODO' } } };
    expect(runModel(T, f)).toBeNull();
  });
});

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

describe('£15,000 (tax £680.40)', () => {
  it('shows no friendly message', () => {
    const tax = calculateTax(15000, 'ruk', figures);
    expect(tax.total).toBeCloseTo(680.40, 2);
    expect(noTaxMessage(15000, tax.total, PA)).toBeNull();
  });

  it('core (C = £0.28619): child vaccinated every 7 years, bednet every 5.3 years, 2 ORS + zinc', () => {
    // 0.1425 children a year → 84 months; 0.1873 nets → 64 months; 1.62 courses
    expect(lines(15000, 'low')).toEqual([
      'One child fully vaccinated (3 doses) every 7 years', 'One bednet every 5.3 years', '2 ORS + zinc treatments',
    ]);
  });

  it('wider (C = £0.38909): child vaccinated every 5.2 years, bednet every 3.9 years, 2 ORS + zinc', () => {
    expect(lines(15000, 'high')).toEqual([
      'One child fully vaccinated (3 doses) every 5.2 years', 'One bednet every 3.9 years', '2 ORS + zinc treatments',
    ]);
  });
});

describe('£25,000 (tax £3,480.40)', () => {
  it('core (C = £1.46391): child vaccinated every 16 months, bednet every 13 months, 8 ORS + zinc', () => {
    expect(lines(25000, 'low')).toEqual([
      'One child fully vaccinated (3 doses) every 16 months', 'One bednet every 13 months', '8 ORS + zinc treatments',
    ]);
  });

  it('wider (C = £1.99030): child vaccinated every 12 months, 1 bednet, 11 ORS + zinc', () => {
    expect(lines(25000, 'high')).toEqual([
      'One child fully vaccinated (3 doses) every 12 months', '1 bednet', '11 ORS + zinc treatments',
    ]);
  });
});

describe('£30,000 (tax £4,880.40)', () => {
  it('core: 1 child fully vaccinated, 1 bednet, 12 ORS + zinc', () => {
    expect(lines(30000, 'low')).toEqual(['1 child fully vaccinated (3 doses)', '1 bednet', '12 ORS + zinc treatments']);
  });

  it('wider: 1 child fully vaccinated, 2 bednets, 16 ORS + zinc', () => {
    expect(lines(30000, 'high')).toEqual(['1 child fully vaccinated (3 doses)', '2 bednets', '16 ORS + zinc treatments']);
  });
});

describe('never shows "0 items"', () => {
  for (const salary of [12571, 13000, 15000, 25000, 60000]) {
    it(`£${salary.toLocaleString('en-GB')}`, () => {
      for (const key of ['low', 'high']) {
        for (const line of lines(salary, key)) {
          expect(line).not.toMatch(/(^|[^\d.,])0(?![\d.,])/);
          expect(line).not.toMatch(/every 0 /);
        }
      }
    });
  }
});
