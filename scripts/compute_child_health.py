#!/usr/bin/env python3
"""
Compute UK child health ODA from FCDO Statistics on International Development.

Reads: data/raw/Data-underlying-SID-2017-2024.ods
Outputs: 3-year average (2022-2024) for LOW and HIGH child health ODA (GBP millions).

LOW  = sector codes (SpecificSectorCode) 13020, 12240, 12250, 12262
     + multilateral core contributions where channel of delivery is Gavi
       (recorded as "Global Alliance for Vaccines and Immunization" in FCDO data)
HIGH = LOW + codes 12220, 13030, 12261

HeadlineMeasureofODA is summed directly (no %sector weighting); each project-sector
row already carries its sector-allocated ODA amount.

Expected: LOW ~486m, HIGH ~661m

Also prints a Muskoka2 preview (data/figures.json muskoka.coefficients); it does not change
the live figures. Run with --preview to write docs/muskoka2_preview.md.
"""

import json
import sys
from pathlib import Path

import pandas as pd

ROOT     = Path(__file__).resolve().parent.parent
ODS_PATH = ROOT / "data" / "raw" / "Data-underlying-SID-2017-2024.ods"
FIGURES  = ROOT / "data" / "figures.json"

YEARS      = {2022, 2023, 2024}
LOW_CODES  = {13020, 12240, 12250, 12262}
HIGH_EXTRA = {12220, 13030, 12261}
HIGH_CODES = LOW_CODES | HIGH_EXTRA

# UK contributions to Gavi appear as "Global Alliance for Vaccines and Immunization"
# in FCDO channel data. We match this directly; IFFIM (International Finance Facility
# for Immunisation) is a separate bond-issuing vehicle and not included here.
GAVI_CHANNEL_PATTERN = r"global alliance for vaccines"
GLOBAL_FUND_PATTERN  = r"global fund"
IFFIM_CHANNEL_PATTERN = r"international finance facility for immunisation"
PREVIEW_PATH = ROOT / "docs" / "muskoka2_preview.md"


def load_data() -> pd.DataFrame:
    print(f"Reading {ODS_PATH.name} ...")
    all_sheets: dict = pd.read_excel(ODS_PATH, sheet_name=None, engine="odf", dtype=str)
    print(f"Sheets: {list(all_sheets.keys())}")
    for name, sheet in all_sheets.items():
        norm = {c.strip().replace(" ", "").lower() for c in sheet.columns}
        if "headlinemeasureofoda" in norm:
            print(f"Using sheet '{name}' - {len(sheet):,} rows")
            return sheet
    for name, sheet in all_sheets.items():
        print(f"  '{name}': {list(sheet.columns[:12])} ...")
    sys.exit("ERROR: no sheet contains 'HeadlineMeasureofODA'")


def col_map(df: pd.DataFrame) -> dict:
    return {c.strip().replace(" ", "").lower(): c for c in df.columns}


def main() -> None:
    df   = load_data()
    cmap = col_map(df)

    year_col     = cmap.get("year")
    oda_col      = cmap.get("headlinemeasureofoda")
    purpose_col  = (cmap.get("specificsectorcode")
                    or cmap.get("purposecode"))
    channel_col  = cmap.get("channelofdelivery")
    bilateral_col = (cmap.get("bimultibreakdown")
                     or cmap.get("bilateralmultilateral"))

    missing = [k for k, v in [
        ("year", year_col), ("HeadlineMeasureofODA", oda_col), ("SpecificSectorCode", purpose_col)
    ] if v is None]
    if missing:
        sys.exit(f"ERROR: required columns not found: {missing}\nAll cols: {list(df.columns)}")

    df[year_col]    = pd.to_numeric(df[year_col],    errors="coerce")
    df[oda_col]     = pd.to_numeric(df[oda_col],     errors="coerce").fillna(0.0)
    df[purpose_col] = pd.to_numeric(df[purpose_col], errors="coerce")

    df = df[df[year_col].isin(YEARS)].copy()
    print(f"Rows in 2022-2024: {len(df):,}")

    # --- Gavi rows diagnostic
    if channel_col:
        gavi_all = df[df[channel_col].astype(str).str.contains(GAVI_CHANNEL_PATTERN, case=False, na=False)]
        print(f"\nAll Gavi-related channel rows (all years): {len(gavi_all):,}")
        if len(gavi_all):
            ch_oda = gavi_all.groupby(channel_col)[oda_col].sum() / 1_000
            for ch, oda in ch_oda.sort_values(ascending=False).items():
                if bilateral_col:
                    bm = gavi_all.loc[gavi_all[channel_col] == ch, bilateral_col].value_counts().to_dict()
                else:
                    bm = {}
                print(f"  {oda:8.1f}m  '{ch}'  BiMulti={bm}")

    # --- Per-code ODA
    print(f"\nODA by purpose code (2022-2024 total raw, GBP millions):")
    for code in sorted(LOW_CODES | HIGH_EXTRA):
        subset = df[df[purpose_col] == code]
        oda = subset[oda_col].sum() / 1_000
        marker = " [LOW]" if code in LOW_CODES else " [HIGH extra]"
        print(f"  {code}: {oda:6.1f}m{marker}")

    # --- Main computation
    results: dict = {}
    for year in sorted(YEARS):
        dy = df[df[year_col] == year]

        if channel_col:
            gavi_mask = dy[channel_col].astype(str).str.contains(GAVI_CHANNEL_PATTERN, case=False, na=False)
        else:
            gavi_mask = pd.Series(False, index=dy.index)

        if bilateral_col:
            multi_mask = dy[bilateral_col].astype(str).str.lower().str.contains(r"multilateral", na=False)
            gavi_mask = gavi_mask & multi_mask

        gavi_m = dy.loc[gavi_mask, oda_col].sum() / 1_000
        low_m  = dy.loc[dy[purpose_col].isin(LOW_CODES)  | gavi_mask, oda_col].sum() / 1_000
        high_m = dy.loc[dy[purpose_col].isin(HIGH_CODES) | gavi_mask, oda_col].sum() / 1_000
        results[year] = dict(low=low_m, high=high_m, gavi=gavi_m)
        print(f"  {year}: Gavi={gavi_m:.1f}m  LOW={low_m:.1f}m  HIGH={high_m:.1f}m")

    avg_low  = sum(r["low"]  for r in results.values()) / len(YEARS)
    avg_high = sum(r["high"] for r in results.values()) / len(YEARS)

    print(f"\n{'='*55}")
    print(f"3-year averages (2022-2024):")
    print(f"  LOW  = GBP {avg_low:.1f}m   (expected ~486m)")
    print(f"  HIGH = GBP {avg_high:.1f}m   (expected ~661m)")
    for label, actual, exp in [("LOW", avg_low, 486), ("HIGH", avg_high, 661)]:
        if abs(actual - exp) > 30:
            print(f"  *** {label} differs by GBP {abs(actual - exp):.0f}m - verify filters ***")

    print(f"\nUpdate data/figures.json -> aid.childHealthODA:")
    print(f'  "low":  {round(avg_low, 1)},')
    print(f'  "high": {round(avg_high, 1)}')

    muskoka(df, year_col, oda_col, purpose_col, channel_col, bilateral_col,
            preview_path=PREVIEW_PATH if "--preview" in sys.argv else None)


def muskoka(df, year_col, oda_col, purpose_col, channel_col, bilateral_col, preview_path=None) -> None:
    """Print the 2022-24 average with and without Muskoka2 shares (figures.json muskoka.coefficients).
    Each row goes to one bucket, in this order: Gavi core, IFFIm core (multilateral rows on those
    channels), Global Fund channel (pending, left out), then sector code.
    Prints only; does not change the live figures. With preview_path, also writes a Markdown table."""
    figs    = json.loads(FIGURES.read_text(encoding="utf-8"))
    coef    = figs["muskoka"]["coefficients"]
    live    = figs["aid"]["childHealthODA"]
    shares  = {int(k): v for k, v in coef["sectorCodes"].items()}
    pending = {int(k): v for k, v in coef["pending"]["sectorCodes"].items()}
    iffim   = coef["iffimCore"]
    n_years = len(YEARS)

    ch    = df[channel_col].astype(str) if channel_col else pd.Series("", index=df.index)
    multi = (df[bilateral_col].astype(str).str.lower().str.contains("multilateral", na=False)
             if bilateral_col else pd.Series(True, index=df.index))
    gavi  = ch.str.contains(GAVI_CHANNEL_PATTERN, case=False, na=False) & multi
    iff   = ch.str.contains(IFFIM_CHANNEL_PATTERN, case=False, na=False) & multi & ~gavi
    gf    = ch.str.contains(GLOBAL_FUND_PATTERN, case=False, na=False) & ~gavi & ~iff
    rest  = df[~gavi & ~iff & ~gf]

    avg = lambda rows: rows[oda_col].sum() / 1_000 / n_years   # GBP millions per year

    # (label, without, share, note)
    lines = [("Gavi core contributions", avg(df[gavi]), coef["gaviCore"], ""),
             ("IFFIm core contributions", avg(df[iff]), iffim["value"], iffim["_status"])]
    lines += [(str(code), avg(rest[rest[purpose_col] == code]), share, "")
              for code, share in sorted(shares.items(), key=lambda kv: (-kv[1], kv[0]))]
    total_raw  = sum(raw for _, raw, _, _ in lines)
    total_with = sum(raw * share for _, raw, share, _ in lines)

    left_out = [(f"{code} {name}", avg(rest[rest[purpose_col] == code])) for code, name in pending.items()]
    left_out.append((f"Global Fund ({coef['pending']['channels']['globalFund']})", avg(df[gf])))
    other = avg(rest[~rest[purpose_col].isin(set(shares) | set(pending))])

    print(f"\n{'='*72}\nMuskoka2 shares, 2022-2024 average, GBP millions per year")
    print(f"Source: {coef['_source']} ({coef['_year']})\n")
    print(f"{'Item':<44}{'Without':>9}{'Share':>8}{'With':>9}")
    for label, raw, share, note in lines:
        print(f"{label:<44}{raw:9.1f}{share:8.1%}{raw*share:9.1f}" + (f"  ({note})" if note else ""))
    print(f"{'Total with Muskoka2 shares':<44}{total_raw:9.1f}{'':>8}{total_with:9.1f}")
    print(f"\nLeft out: {coef['pending']['_status']} (TODO)")
    for label, raw in left_out:
        print(f"  {label:<42}{raw:9.1f}")
    print(f"\n{'All other codes (0%)':<44}{other:9.1f}")
    for name, mask in [("Gavi", gavi), ("IFFIm", iff)]:
        codes = sorted(int(c) for c in df.loc[mask, purpose_col].dropna().unique())
        print(f"{name} core rows by sector code: {codes}")

    if preview_path:
        md = [
            "# Muskoka2 preview: UK health aid reaching mothers and children",
            "",
            "Preview only. The calculator's live figures are unchanged "
            f"(core £{live['low']}m, wider £{live['high']}m a year).",
            "",
            f"- **Data:** FCDO Statistics on International Development, data underlying SID 2017–2024, "
            f"average of 2022, 2023 and 2024, £ millions a year.",
            f"- **Shares:** {coef['_source']}, {coef['_year']}. <{coef['_url']}> (accessed {coef['_accessed']}).",
            "- **Method:** each row counts once. Gavi and IFFIm core contributions are matched by channel of "
            "delivery (multilateral rows); Global Fund rows by channel; everything else by sector code. "
            "Codes not listed count at 0%.",
            "- Generated by `scripts/compute_child_health.py --preview`.",
            "",
            "## With and without Muskoka2 shares",
            "",
            "| Item | Without (£m) | Share | With (£m) | Note |",
            "|---|---:|---:|---:|---|",
        ]
        md += [f"| {label} | {raw:,.1f} | {share:.1%} | {raw*share:,.1f} | {note} |"
               for label, raw, share, note in lines]
        md += [f"| **Total** | **{total_raw:,.1f}** | | **{total_with:,.1f}** | |", "",
               f"All other sector codes count at 0% (£{other:,.1f}m a year without shares).", "",
               f"## Left out for now: {coef['pending']['_status']}", "",
               "Not in the total above until the ONE data team supplies shares.", "",
               "| Item | Without (£m) |", "|---|---:|"]
        md += [f"| {label} | {raw:,.1f} |" for label, raw in left_out]
        lo_total = sum(raw for _, raw in left_out)
        gf_raw   = left_out[-1][1]
        md += ["", "### Why these are left out", "",
               "Muskoka2 gives most codes one fixed share. For these five the flow chart says \"varies\": "
               "the share reaching mothers and children depends on where the money goes and who carries "
               "the disease there. Using any number before the ONE data team supplies the shares would mean "
               "inventing one. How each share would be built (to be confirmed by the ONE data team):", "",
               "- **Malaria (12262):** the share of each country's malaria burden in children under 5 and "
               "pregnant women.",
               "- **HIV (13040):** the share going to mothers, children and preventing mother-to-child "
               "transmission.",
               "- **TB (12263):** the child and maternal share of TB in each country (most TB is in adults).",
               "- **General budget support (51010):** not health money. It would need each government's "
               "health share of spending, then the mother and child share of that.",
               "- **Global Fund:** covers HIV, TB and malaria for all ages. Its share would come from its "
               "split across the three diseases, then the mother and child share of each.", "",
               f"**What this means for the total.** Leaving them out counts them at 0%, so the "
               f"£{total_with:,.1f}m total is likely too low. Counting all five at 100% would add "
               f"£{lo_total:,.1f}m, which is far too high because much of this spending reaches adults. "
               f"The true figure is in between. The Global Fund (£{gf_raw:,.1f}m) decides most of it; the "
               f"other four add £{lo_total - gf_raw:,.1f}m between them even at 100%."]
        by_year = df[gavi].groupby(year_col)[oda_col].sum() / 1_000
        gavi_years = ", ".join(f"{int(y)}: £{by_year.get(y, 0.0):,.1f}m" for y in sorted(YEARS))
        md += ["", "## Notes", "",
               f"- Gavi core contributions by year ({gavi_years}). There is no 2022 row in the FCDO data, "
               "which lowers the three-year average.",
               f"- IFFIm is counted at Gavi's {iffim['value']:.0%}: {iffim['_status']}.", ""]
        preview_path.parent.mkdir(parents=True, exist_ok=True)
        preview_path.write_text("\n".join(md), encoding="utf-8")
        print(f"\nWrote {preview_path.relative_to(ROOT)}")

if __name__ == "__main__":
    main()
