# Born to Live Calculator

## Purpose
A public web tool supporting ONE's "Born to Live" UK petition. A visitor enters
their salary; the tool estimates how much of their tax reaches child health
through UK aid, shows what that buys, and links to the petition.

## Model
- T = UK Income Tax + employee National Insurance (rUK and Scotland toggle)
- a = UK ODA / Total Managed Expenditure (HMRC Annual Tax Summary method)
- h = health aid / total aid (FCDO Statistics on International Development)
- c = share of health aid for maternal, newborn and child health, vaccines, nutrition (OECD CRS)
- C = T × a × h × c, converted to items (vaccine doses, bednets, ORS) using unit costs
- Monte Carlo (10,000 draws) over low/high ranges for c and unit costs; show 10th–90th percentile
- Show a per-day figure (C / 365)

## A/B test
- Randomly assign visitors to "numbers-led" or "story-led" result
- Track: variant, time on result, scroll depth, time to click, petition click
- Privacy-friendly analytics only (GoatCounter). Never store salary or personal data.

## Rules
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
