import { describe, it, expect } from 'vitest';
import {
  adjustedPersonalAllowance,
  calculateIncomeTax,
  calculateNI,
  calculateTax,
} from '../src/tax.js';

// Minimal figures object mirroring figures.json structure — 2024-25 rates.
const figures = {
  tax: {
    personalAllowance: 12570,
    paYearTaperStart: 100000,
    paYearTaperEnd: 125140,
    ruk: {
      bands: [
        { upto: 37700,  rate: 0.20 },
        { upto: 125140, rate: 0.40 },
        { upto: null,   rate: 0.45 },
      ],
    },
    scotland: {
      bands: [
        { upto: 2306,   rate: 0.19 },
        { upto: 13991,  rate: 0.20 },
        { upto: 31092,  rate: 0.21 },
        { upto: 62430,  rate: 0.42 },
        { upto: 112570, rate: 0.45 },
        { upto: null,   rate: 0.48 },
      ],
    },
    ni: {
      primaryThreshold:    12570,
      upperEarningsLimit:  50270,
      mainRate:  0.08,
      upperRate: 0.02,
    },
  },
};

const { tax } = figures;

// ---------------------------------------------------------------------------
// adjustedPersonalAllowance
// ---------------------------------------------------------------------------
describe('adjustedPersonalAllowance', () => {
  it('returns full PA below taper', () => {
    expect(adjustedPersonalAllowance(50000, tax)).toBe(12570);
  });

  it('returns full PA at exactly taper start', () => {
    expect(adjustedPersonalAllowance(100000, tax)).toBe(12570);
  });

  it('reduces PA by £1 per £2 above taper start', () => {
    // £110,000 → reduction = (110000 - 100000) / 2 = 5000; PA = 7570
    expect(adjustedPersonalAllowance(110000, tax)).toBe(7570);
  });

  it('returns 0 at and above taper end', () => {
    expect(adjustedPersonalAllowance(125140, tax)).toBe(0);
    expect(adjustedPersonalAllowance(150000, tax)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateNI  (Class 1 employee, 2024-25: 8% / 2%)
// ---------------------------------------------------------------------------
describe('calculateNI', () => {
  it('returns 0 below primary threshold', () => {
    expect(calculateNI(10000, tax.ni)).toBe(0);
  });

  it('returns 0 at exactly the primary threshold', () => {
    expect(calculateNI(12570, tax.ni)).toBe(0);
  });

  it('applies main rate only between thresholds', () => {
    // £30,000: (30000 - 12570) × 8% = 17430 × 0.08 = 1394.40
    expect(calculateNI(30000, tax.ni)).toBeCloseTo(1394.40, 2);
  });

  it('applies main + upper rate above UEL', () => {
    // £60,000: (50270 - 12570) × 8% + (60000 - 50270) × 2%
    //        = 37700 × 0.08 + 9730 × 0.02
    //        = 3016 + 194.60 = 3210.60
    expect(calculateNI(60000, tax.ni)).toBeCloseTo(3210.60, 2);
  });
});

// ---------------------------------------------------------------------------
// calculateIncomeTax  — rUK
// ---------------------------------------------------------------------------
describe('calculateIncomeTax — rUK', () => {
  it('returns 0 for zero taxable income', () => {
    expect(calculateIncomeTax(0, tax.ruk.bands)).toBe(0);
  });

  it('applies basic rate only', () => {
    // taxable income £17,430 (salary £30,000, full PA)
    // 17430 × 20% = 3486
    expect(calculateIncomeTax(17430, tax.ruk.bands)).toBeCloseTo(3486, 2);
  });

  it('applies basic + higher rate', () => {
    // taxable income £47,430 (salary £60,000, full PA)
    // 37700 × 20% + 9730 × 40% = 7540 + 3892 = 11432
    expect(calculateIncomeTax(47430, tax.ruk.bands)).toBeCloseTo(11432, 2);
  });

  it('applies all three rates', () => {
    // taxable income = £150,000 (salary £150,000, PA = 0 due to taper)
    // 37700 × 20% + 87440 × 40% + 24860 × 45%
    // = 7540 + 34976 + 11187 = 53703
    expect(calculateIncomeTax(150000, tax.ruk.bands)).toBeCloseTo(53703, 2);
  });
});

// ---------------------------------------------------------------------------
// calculateTax — rUK end-to-end (rounded pence)
// ---------------------------------------------------------------------------
describe('calculateTax — rUK', () => {
  it('salary below personal allowance → zero tax', () => {
    const r = calculateTax(10000, 'ruk', figures);
    expect(r.incomeTax).toBe(0);
    expect(r.ni).toBe(0);
    expect(r.total).toBe(0);
  });

  it('salary £20,000 — basic rate', () => {
    // IT: 7430 × 20% = 1486
    // NI: 7430 × 8% = 594.40
    const r = calculateTax(20000, 'ruk', figures);
    expect(r.incomeTax).toBeCloseTo(1486, 2);
    expect(r.ni).toBeCloseTo(594.40, 2);
    expect(r.total).toBeCloseTo(2080.40, 2);
  });

  it('salary £30,000 — basic rate', () => {
    // IT: 17430 × 20% = 3486
    // NI: 17430 × 8% = 1394.40
    const r = calculateTax(30000, 'ruk', figures);
    expect(r.incomeTax).toBeCloseTo(3486, 2);
    expect(r.ni).toBeCloseTo(1394.40, 2);
    expect(r.total).toBeCloseTo(4880.40, 2);
  });

  it('salary £60,000 — higher rate', () => {
    // IT: 37700 × 20% + 9730 × 40% = 7540 + 3892 = 11432
    // NI: 37700 × 8% + 9730 × 2% = 3016 + 194.60 = 3210.60
    const r = calculateTax(60000, 'ruk', figures);
    expect(r.incomeTax).toBeCloseTo(11432, 2);
    expect(r.ni).toBeCloseTo(3210.60, 2);
    expect(r.total).toBeCloseTo(14642.60, 2);
  });

  it('salary £110,000 — PA taper zone', () => {
    // PA: 12570 - (10000/2) = 7570
    // Taxable: 110000 - 7570 = 102430
    // IT: 37700 × 20% + 64730 × 40% = 7540 + 25892 = 33432
    // NI: 37700 × 8% + 59730 × 2% = 3016 + 1194.60 = 4210.60
    const r = calculateTax(110000, 'ruk', figures);
    expect(r.incomeTax).toBeCloseTo(33432, 2);
    expect(r.ni).toBeCloseTo(4210.60, 2);
    expect(r.total).toBeCloseTo(37642.60, 2);
  });

  it('salary £150,000 — additional rate, PA = 0', () => {
    // IT: 37700×20% + 87440×40% + 24860×45% = 7540 + 34976 + 11187 = 53703
    // NI: 37700×8% + 99730×2% = 3016 + 1994.60 = 5010.60
    const r = calculateTax(150000, 'ruk', figures);
    expect(r.incomeTax).toBeCloseTo(53703, 2);
    expect(r.ni).toBeCloseTo(5010.60, 2);
    expect(r.total).toBeCloseTo(58713.60, 2);
  });
});

// ---------------------------------------------------------------------------
// calculateTax — Scotland
// NI is identical to rUK; only income tax differs.
// ---------------------------------------------------------------------------
describe('calculateTax — Scotland', () => {
  it('salary £30,000', () => {
    // Taxable: 17430
    // Starter:      2306 × 19% =  438.14
    // Basic:       11685 × 20% = 2337.00
    // Intermediate: 3439 × 21% =  722.19
    // IT total: 3497.33
    // NI: same as rUK = 1394.40
    const r = calculateTax(30000, 'scotland', figures);
    expect(r.incomeTax).toBeCloseTo(3497.33, 2);
    expect(r.ni).toBeCloseTo(1394.40, 2);
  });

  it('salary £60,000', () => {
    // Taxable: 47430
    // Starter:      2306 × 19% =  438.14
    // Basic:       11685 × 20% = 2337.00
    // Intermediate:17101 × 21% = 3591.21
    // Higher:      16338 × 42% = 6861.96
    // IT total: 13228.31
    // NI: 3210.60
    const r = calculateTax(60000, 'scotland', figures);
    expect(r.incomeTax).toBeCloseTo(13228.31, 2);
    expect(r.ni).toBeCloseTo(3210.60, 2);
  });

  it('NI matches rUK at same salary', () => {
    const ruk = calculateTax(45000, 'ruk', figures);
    const scot = calculateTax(45000, 'scotland', figures);
    expect(scot.ni).toBe(ruk.ni);
  });
});
