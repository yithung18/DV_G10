// ============================================================
// state.js — Global shared state for all charts
// Every chart reads from and writes to this object.
// ============================================================

const state = {
    // ── Global filters (controlled by the top control panel) ──
    selectedYear:    2023,
    selectedRegion:  "All",
    selectedHDIGroup: "All",      // "VH" | "H" | "M" | "L" | "All"

    // ── Country selection (cross-chart linking) ──────────────
    selectedCountry:   null,      // iso3 code e.g. "MYS" — clicking a bubble highlights a line
    selectedCountries: [],        // multi-select for radar chart (up to 3)

    // ── V3 Line Chart specific ────────────────────────────────
    // Countries shown as lines in V3 (iso3 codes)
    lineChartCountries: ["MYS", "CHN", "IND", "USA", "NOR", "NGA", "BRA", "DEU"],

    // Which metric to show on V3 Y-axis
    // "gii" | "pr_f" | "lfpr_f"
    selectedMetric: "gii",

    // Year range resulting from V3 brush selection (used to annotate/filter other charts)
    brushedYearRange: [1990, 2023],
};

// ── updateAll ────────────────────────────────────────────────
// Call whenever state changes — triggers a re-render of every registered chart.
function updateAll() {
    if (typeof updateChoropleth  === "function") updateChoropleth();
    if (typeof updateBarChart    === "function") updateBarChart();
    if (typeof updateLineChart   === "function") updateLineChart();
    if (typeof updateScatter     === "function") updateScatter();
    if (typeof updateRadar       === "function") updateRadar();
    if (typeof updateAreaChart   === "function") updateAreaChart();
}

// ── Data type conversion ─────────────────────────────────────
// Used in d3.csv() row conversion callback
function parseRow(d) {
    let hdicode = d.hdicode;
    if (hdicode === "Very High") hdicode = "VH";
    else if (hdicode === "High") hdicode = "H";
    else if (hdicode === "Medium") hdicode = "M";
    else if (hdicode === "Low") hdicode = "L";

    return {
        iso3:          d.iso3,
        country:       d.country,
        hdicode:       hdicode,
        region:        d.region,
        hdi_rank_2023: +d.hdi_rank_2023 || null,
        gii_rank_2023: +d.gii_rank_2023 || null,
        gdi_group_2023:+d.gdi_group_2023 || null,
        year:          +d.year,

        // GII components
        gii:   +d.gii   || null,
        mmr:   +d.mmr   || null,
        abr:   +d.abr   || null,
        pr_f:  +d.pr_f  || null,
        pr_m:  +d.pr_m  || null,
        se_f:  +d.se_f  || null,
        se_m:  +d.se_m  || null,
        lfpr_f:+d.lfpr_f|| null,
        lfpr_m:+d.lfpr_m|| null,

        // GDI components
        gdi:    +d.gdi    || null,
        hdi_f:  +d.hdi_f  || null,
        hdi_m:  +d.hdi_m  || null,
        le_f:   +d.le_f   || null,
        le_m:   +d.le_m   || null,
        eys_f:  +d.eys_f  || null,
        eys_m:  +d.eys_m  || null,
        mys_f:  +d.mys_f  || null,
        mys_m:  +d.mys_m  || null,
        gni_pc_f: +d.gni_pc_f || null,
        gni_pc_m: +d.gni_pc_m || null,

        // Overall HDI
        hdi:      +d.hdi      || null,
        le:       +d.le       || null,
        eys:      +d.eys      || null,
        mys:      +d.mys      || null,
        gnipc:    +d.gnipc    || null,
        pop_total:+d.pop_total|| null,
    };
}
