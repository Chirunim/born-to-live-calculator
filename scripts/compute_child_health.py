#!/usr/bin/env python3
"""
Compute UK child health ODA from FCDO Statistics on International Development.

Reads: data/raw/Data-underlying-SID-2017-2024.ods
Outputs: 3-year average (2022-2024) for LOW and HIGH child health ODA (GBP millions).

LOW  = CRS purpose codes 13020, 12240, 12250, 12262
     + multilateral core contributions where channel of delivery is Gavi
       (recorded as "Global Alliance for Vaccines and Immunization" in FCDO data)
HIGH = LOW + codes 12220, 13030, 12261

HeadlineMeasureofODA is summed directly (no %sector weighting); each project-sector
row already carries its sector-allocated ODA amount.

Expected: LOW ~486m, HIGH ~661m
"""

import sys
from pathlib import Path

import pandas as pd

ROOT     = Path(__file__).resolve().parent.parent
ODS_PATH = ROOT / "data" / "raw" / "Data-underlying-SID-2017-2024.ods"

YEARS      = {2022, 2023, 2024}
LOW_CODES  = {13020, 12240, 12250, 12262}
HIGH_EXTRA = {12220, 13030, 12261}
HIGH_CODES = LOW_CODES | HIGH_EXTRA

# UK contributions to Gavi appear as "Global Alliance for Vaccines and Immunization"
# in FCDO channel data. We match this directly; IFFIM (International Finance Facility
# for Immunisation) is a separate bond-issuing vehicle and not included here.
GAVI_CHANNEL_PATTERN = r"global alliance for vaccines"


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


if __name__ == "__main__":
    main()
