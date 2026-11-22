/**
 * Aid model: two labelled estimates, no simulation.
 * C = T × (childHealthODA ÷ expenditureOnServices), then converted to items via unit costs.
 * One estimate per definition of mother and child health aid (LOW and HIGH in figures.json).
 */

/** The two estimates shown to visitors, in display order. */
export const ESTIMATES = [
  {
    key: 'low',
    label: 'Core mother and child programmes',
    includes: 'Reproductive health care, basic nutrition, infectious disease and malaria control, ' +
      'plus UK core funding for Gavi, the Vaccine Alliance.',
  },
  {
    key: 'high',
    label: 'Including wider basic health',
    includes: 'Everything in the core estimate, plus basic health care, family planning and health education.',
  },
];

const isMissing = (v) => v === 'TODO' || v === null || v === undefined;

/**
 * One unit cost in USD. Uses the item's single published `value`.
 * Interim, until single published prices are added (Step B): the midpoint of the
 * existing low/high range, so no new number is introduced.
 */
export function unitCostUsd(cost) {
  if (typeof cost.value === 'number') return cost.value;
  if (typeof cost.low === 'number' && typeof cost.high === 'number') return (cost.low + cost.high) / 2;
  return 'TODO';
}

/**
 * Run the model.
 *
 * @param {number} taxTotal - Total UK tax paid (GBP), from calculateTax().total
 * @param {object} figures  - Parsed figures.json
 * @returns {{ estimates: Array<{key,label,includes,odaGbpM,annualGbp,perDayGbp,
 *            items: Array<{key,name,names,unit,count}>}> } | null}
 *   count is the unrounded yearly number of items (fractions matter below 1, see format.js).
 *   Returns null if any required figure is still TODO.
 */
export function runModel(taxTotal, figures) {
  const { aid, costs, meta } = figures;
  const E = aid.expenditureOnServices.value;  // GBP millions
  const usdGbp = meta.usdGbp.value;

  const itemDefs = ['vaccineDtp', 'bednet', 'orsTreatment'].map((key) => ({
    key, ...costs[key], costUsd: unitCostUsd(costs[key]),
  }));

  const required = [E, usdGbp, ...ESTIMATES.map(({ key }) => aid.childHealthODA[key]), ...itemDefs.map((d) => d.costUsd)];
  if (required.some(isMissing)) return null;

  const estimates = ESTIMATES.map(({ key, label, includes }) => {
    const odaGbpM = aid.childHealthODA[key];
    const annualGbp = taxTotal * (odaGbpM / E);  // GBP reaching mother and child health aid
    return {
      key, label, includes, odaGbpM, annualGbp,
      perDayGbp: annualGbp / 365,
      items: itemDefs.map((d) => ({
        key: d.key,
        name: d.itemLabel,
        names: d.itemLabelPlural,
        unit: d.unit,
        count: annualGbp / (d.costUsd * usdGbp),
      })),
    };
  });

  return { estimates };
}
