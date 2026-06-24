"""
CDS6324 Data Visualization – SDG 5 Gender Equality
Preprocessing Script: Wide → Long Format
Source: UNDP Human Development Report 2025
        HDR25_Composite_indices_complete_time_series.csv
Output: HDR25_SDG5_long_format.csv
        7,004 rows (206 countries × 34 years) × 34 columns
"""

import pandas as pd

# ── 1. Load raw file ──────────────────────────────────────────────────────────
df = pd.read_csv(
    "HDR25_Composite_indices_complete_time_series.csv",
    encoding="latin1"   # UNDP file uses latin-1, not utf-8
)
print(f"Raw file loaded: {df.shape[0]} countries × {df.shape[1]} columns")

# ── 2. Define columns ─────────────────────────────────────────────────────────
# Static identifiers — one value per country, no year suffix
STATIC_COLS = [
    "iso3",           # 3-letter country code (join key)
    "country",        # Full country name
    "hdicode",        # HDI group: VH / H / M / L
    "region",         # UNDP world region
    "hdi_rank_2023",  # HDI rank in 2023
    "gii_rank_2023",  # GII rank in 2023
    "gdi_group_2023", # GDI group 1–5 (gender parity tier)
]

# SDG-5-relevant indicators (columns exist as {indicator}_{year})
INDICATORS = {
    # ── GII core components ───────────────────────────────
    "gii":     "Gender Inequality Index (0=equal, 1=unequal)",
    "mmr":     "Maternal Mortality Ratio (per 100,000 live births)",
    "abr":     "Adolescent Birth Rate (per 1,000 women aged 15-19)",
    "pr_f":    "Parliament seats held by women (%)",
    "pr_m":    "Parliament seats held by men (%)",
    "se_f":    "Secondary education, female (% aged 25+)",
    "se_m":    "Secondary education, male (% aged 25+)",
    "lfpr_f":  "Labour force participation rate, female (% aged 15+)",
    "lfpr_m":  "Labour force participation rate, male (% aged 15+)",
    # ── GDI gender-disaggregated components ──────────────
    "gdi":      "Gender Development Index (female HDI / male HDI)",
    "hdi_f":    "HDI – female",
    "hdi_m":    "HDI – male",
    "le_f":     "Life expectancy – female (years)",
    "le_m":     "Life expectancy – male (years)",
    "eys_f":    "Expected years of schooling – female",
    "eys_m":    "Expected years of schooling – male",
    "mys_f":    "Mean years of schooling – female",
    "mys_m":    "Mean years of schooling – male",
    "gni_pc_f": "GNI per capita – female (2021 PPP $)",
    "gni_pc_m": "GNI per capita – male (2021 PPP $)",
    # ── HDI context (overall, not gender-disaggregated) ──
    "hdi":      "Human Development Index (overall)",
    "le":       "Life expectancy (overall, years)",
    "eys":      "Expected years of schooling (overall)",
    "mys":      "Mean years of schooling (overall)",
    "gnipc":    "GNI per capita (overall, 2021 PPP $)",
    "pop_total":"Total population",
}

# ── 3. Reshape: wide → long (one row per country per year) ───────────────────
YEARS = list(range(1990, 2024))  # 34 years: 1990–2023
frames = []

for year in YEARS:
    chunk = df[STATIC_COLS].copy()
    chunk["year"] = year
    for ind in INDICATORS:
        col_name = f"{ind}_{year}"
        chunk[ind] = df[col_name] if col_name in df.columns else None
    frames.append(chunk)

df_long = pd.concat(frames, ignore_index=True)
df_long = df_long.sort_values(["iso3", "year"]).reset_index(drop=True)

# ── 4. Clean missing values ───────────────────────────────────────────────────
# UNDP encodes missing as '..' — replace with NaN
df_long.replace("..", pd.NA, inplace=True)

# Convert all indicator columns to numeric
for col in INDICATORS:
    df_long[col] = pd.to_numeric(df_long[col], errors="coerce")

# ── 5. Save ───────────────────────────────────────────────────────────────────
output_path = "HDR25_SDG5_long_format_preprocessed.csv"
df_long.to_csv(output_path, index=False, encoding="utf-8")

# ── 6. Summary ────────────────────────────────────────────────────────────────
print(f"\nOutput saved: {output_path}")
print(f"Shape: {df_long.shape[0]:,} rows × {df_long.shape[1]} columns")
print(f"Countries: {df_long['country'].nunique()}")
print(f"Years: {df_long['year'].min()} – {df_long['year'].max()}")
print(f"\nColumn reference:")
for ind, desc in INDICATORS.items():
    non_null = df_long[ind].notna().sum()
    print(f"  {ind:<12} {non_null:>5} non-null values   {desc}")
