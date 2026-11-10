/**
 * Aid model + Monte Carlo simulation.
 * C = T × (childHealthODA ÷ expenditureOnServices), then converted to items via unit costs.
 * Returns p10/p50/p90 percentiles from 10,000 draws.
 */

const N_DRAWS = 10_000;

function uniform(low, high) {
  return low + Math.random() * (high - low);
}

function percentile(sorted, p) {
  const idx = Math.floor(p * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/**
 * Run the Monte Carlo model.
 *
 * @param {number} taxTotal - Total UK tax paid (GBP), from calculateTax().total
 * @param {object} figures  - Parsed figures.json
 * @returns {{ items: Array<{name,unit,p10,p50,p90}>, perDayGbp: number } | null}
 *   Returns null if any required figure is still TODO.
 */
export function runModel(taxTotal, figures) {
  const { aid, costs, meta } = figures;

  const tme       = aid.expenditureOnServices.value;  // GBP millions
  const childLow  = aid.childHealthODA.low;            // GBP millions
  const childHigh = aid.childHealthODA.high;           // GBP millions

  if ([tme, childLow, childHigh].some(v => v === 'TODO' || v === null)) {
    return null;
  }

  const usdGbp = meta.usdGbp.value;

  const itemDefs = [
    { key: 'vaccineDtp',    ...costs.vaccineDtp },
    { key: 'bednet',        ...costs.bednet },
    { key: 'orsTreatment',  ...costs.orsTreatment },
  ];

  const draws = itemDefs.map(() => []);

  for (let i = 0; i < N_DRAWS; i++) {
    const childOda = uniform(childLow, childHigh);  // GBP millions — varies LOW↔HIGH
    const C = taxTotal * (childOda / tme);           // GBP reaching child health

    for (let j = 0; j < itemDefs.length; j++) {
      const { low, high } = itemDefs[j];
      const costGbp = uniform(low, high) * usdGbp;
      draws[j].push(C / costGbp);
    }
  }

  const items = itemDefs.map((def, j) => {
    const sorted = draws[j].slice().sort((x, y) => x - y);
    return {
      name:  def.itemLabel,
      names: def.itemLabelPlural,
      unit:  def.unit,
      p10:   Math.round(percentile(sorted, 0.10)),
      p50:   Math.round(percentile(sorted, 0.50)),
      p90:   Math.round(percentile(sorted, 0.90)),
    };
  });

  const perDayGbp = (taxTotal * ((childLow + childHigh) / 2) / tme) / 365;

  return { items, perDayGbp };
}
