# Born to Live Calculator

## Purpose
A public web tool supporting ONE's "Born to Live" UK petition. A visitor enters
their salary; the tool estimates how much of their tax becomes health aid reaching mothers and
children through UK aid, shows what that buys, and links to the petition.

## Model
- T = UK Income Tax + employee National Insurance (rUK and Scotland toggle)
- childHealthODA = 3-year average (2022–2024) UK health aid reaching mothers and children, summed directly from
  FCDO Statistics on International Development underlying data by sector code
  (scripts/compute_child_health.py). LOW = 13020, 12240, 12250, 12262 + Gavi core
  contributions (by channel of delivery); HIGH adds 12220, 13030, 12261
- E = total expenditure on services (HM Treasury PESA; the HMRC Annual Tax Summary denominator)
- C = T × childHealthODA ÷ E, converted to items (vaccine doses, bednets, ORS + zinc) using unit costs
- Two labelled estimates, side by side: "Core mother and child programmes" (LOW) and
  "Including wider basic health" (HIGH), each with one sentence on what it includes (src/model.js ESTIMATES).
  One unit cost per item
- Show a per-day figure (C / 365)
- Below 1 item a year, show "one [item] every X months" (years above 24 months; "less than one …
  in a lifetime of tax at this salary" above 100 years). Never show "0 [items]"
- Salary with zero tax (under the £12,570 personal allowance): friendly no-tax message instead of results
- Cite FCDO SID directly; mention OECD only where an OECD figure is actually used
- "Before the cuts (2022–24) vs Now (2026–27 estimate)" view (src/compare.js): UK-wide figures first,
  then the visitor's share; ends with the petition button. Gavi/Global Fund pledges annualised
  (total ÷ years). 2026–27 mother and child health aid is a placeholder ("estimate pending ONE data team",
  aid.childHealthODA2026_27) until the ONE data team supplies it. Never fill it with an invented number

## A/B test
- Randomly assign visitors to "numbers-led" or "story-led" result
- Track: variant, time on result, scroll depth, time to click, petition click
- Privacy-friendly analytics only (GoatCounter). Never store salary or personal data.

## Rules
- Never reintroduce Monte Carlo simulation, random draws, percentiles or probability claims
  (e.g. "80% of scenarios"). Uncertainty is shown only as the two labelled estimates
- Wording: "health aid reaching mothers and children" in sentences, "mother and child health aid"
  in short labels. Never "child health" for the aid figure (it includes reproductive health).
  Item names (vaccine doses, bednets, ORS + zinc) and code/key names stay as they are
- Every figure lives in data/figures.json with source URL, year and date accessed
- Never invent numbers. If a figure can't be sourced, leave a TODO
- Static site only: no server, no API keys
- Write tests for tax.js against HMRC worked examples
- Plain-English methodology page explaining every step
- Label as "built in support of the Born to Live petition", not an official ONE tool
- Disclaimer: illustrative estimate, not an official breakdown of your tax

## Structure
data/figures.json, src/tax.js, src/model.js, src/abtest.js, src/app.js,
index.html, methodology.html, tests/tax.test.js

## Hosting
GitHub Pages
