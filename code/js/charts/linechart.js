// ============================================================
// linechart.js — V3: Multi-Line Chart with Brush
// ============================================================
// Shows gender indicator trends over time (1990–2023)
// for multiple countries, with a brush for zooming.
//
// Metrics available on Y-axis:
//   gii   — Gender Inequality Index (0 = equal, 1 = unequal)
//   pr_f  — Women in Parliament (%)
//   lfpr_f— Female Labour Force Participation Rate (%)
// ============================================================

(function () {
    "use strict";  // Immediately Invoked Function Expression (all the variables are private and cannot be accessed outside this function)

    // ── Module-level variables ──────────────────────────────
    let _allData = [];

    // SVG / DOM references
    let svg, focusG, contextG, clipId;
    let xFocus, yFocus, xContext, yContext;
    let xAxisFocusG, yAxisFocusG;
    let lineGenerator, contextLineGenerator, contextAreaGenerator;
    let brushBehavior;
    let currentXDomain; // tracks current zoomed domain

    const METRIC_CONFIG = {
        gii: {
            label: "Gender Inequality Index (GII)",  // text shown in Y-axis
            format: d => d.toFixed(3),
            unit: "",
            domain: [0, 0.92],
            lower_is_better: true, //sort countries best → worst correctly (GII lower = more equal, so want lowest first)

        },
        pr_f: {
            label: "Women in Parliament (%)",
            format: d => d.toFixed(1) + "%",
            unit: "%",
            domain: [0, 65],
            lower_is_better: false,
        },
        lfpr_f: {
            label: "Female Labour Participation (%)",
            format: d => d.toFixed(1) + "%",
            unit: "%",
            domain: [0, 90],
            lower_is_better: false,
        },
    };

    // Color palette for country lines
    const LINE_COLORS = [
        "#63b3ed", // blue
        "#38d9a9", // teal
        "#f6ad55", // orange
        "#b794f4", // purple
        "#f687b3", // pink
        "#68d391", // green
        "#fc8181", // red
        "#76e4f7", // cyan
        "#faf089", // yellow
        "#a0aec0", // gray
    ];

    // ── Margins & Dimensions ────────────────────────────────
    const MARGIN = { top: 20, right: 100, bottom: 30, left: 52 };
    const CONTEXT_HEIGHT = 55;
    const CONTEXT_MARGIN = { top: 6, bottom: 20 };

    // ── Tooltip ─────────────────────────────────────────────
    let tooltip;

    function ensureTooltip() {
        if (!tooltip) {
            tooltip = d3.select("body").append("div")
                .attr("class", "d3-tooltip")
                .attr("id", "linechart-tooltip")
                .attr("role", "tooltip");
        }
        return tooltip;
    }

    function showTooltip(event, html) {
        const tt = ensureTooltip();
        tt.html(html).classed("visible", true);
        positionTooltip(event);
    }

    function positionTooltip(event) { // Smart positioning: flips left if near screen edge
        const tt = ensureTooltip();
        const node = tt.node();
        const w = node.offsetWidth, h = node.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        let x = event.clientX + 14, y = event.clientY - 10;
        if (x + w > vw - 10) x = event.clientX - w - 14;
        if (y + h > vh - 10) y = event.clientY - h - 10;
        tt.style("left", x + "px").style("top", y + "px");
    }

    function hideTooltip() {
        ensureTooltip().classed("visible", false);
    }

    // ── Colour Scale ───────────────────────────────────────
    let colorScale;

    function buildColorScale(countries) {
        colorScale = d3.scaleOrdinal() // maps category → colour
            .domain(countries)
            .range(LINE_COLORS); // assign each country a different colour from the LINE_COLORS
    }

    // ── Container Size ────────────────────────────────────
    function getContainerSize() { 
        const el = document.getElementById("chart-line-card");
        if (!el) return { width: 700, height: 380 };
        const rect = el.getBoundingClientRect();
        return {
            width: Math.max(rect.width - 40, 300),
            height: Math.max(rect.height - 90, 200),
        };
    }

    // ── Country label data (country name from iso3) ──────────
    const ISO_TO_NAME = {};
    function buildIsoMap(data) {
        data.forEach(d => { ISO_TO_NAME[d.iso3] = d.country; });
    } // Builds a lookup dictionary: { "MYS": "Malaysia", "CHN": "China", ... }

    // ── init ─────────────────────────────────────────────────
    function initLineChart(data) {
        _allData = data;  // store the dataset
        buildIsoMap(data); // build iso3 <-> country name map

        const container = d3.select("#chart-line-card");
        if (container.empty()) { console.warn("initLineChart: #chart-line-card not found"); return; }

        ensureTooltip();  // create tooltip element if not exist
        buildColorScale(state.lineChartCountries); // create colour scale for line chart

        // Wire up card controls
        const metricSel = document.getElementById("line-metric-select");
        if (metricSel) {
            metricSel.value = state.selectedMetric;
            // if metric changes, update state and redraw chart
            metricSel.addEventListener("change", () => {  
                state.selectedMetric = metricSel.value;
                updateLineChart();
            });
        }

        const countrySel = document.getElementById("line-country-select");
        if (countrySel) {
            // Populate all 206 countires as options
            const allCountries = [...new Set(data.map(d => d.iso3))].sort((a, b) => {
                const na = ISO_TO_NAME[a] || a;
                const nb = ISO_TO_NAME[b] || b;
                return na.localeCompare(nb);
            });
            countrySel.innerHTML = "";
            allCountries.forEach(iso => {
                const opt = document.createElement("option");
                opt.value = iso;
                opt.textContent = ISO_TO_NAME[iso] || iso;
                if (state.lineChartCountries.includes(iso)) opt.selected = true;
                countrySel.appendChild(opt);
            });

            countrySel.addEventListener("change", () => {
                state.lineChartCountries = [...countrySel.selectedOptions].map(o => o.value);
                buildColorScale(state.lineChartCountries);
                updateLineChart();
            });
        }

        _buildSVG();
        updateLineChart();
    }

    // ── Build SVG skeleton ───────────────────────────────────
    function _buildSVG() {
        const { width, height } = getContainerSize();
        const svgWrap = d3.select("#line-svg-wrap");
        if (svgWrap.empty()) return;

        svgWrap.selectAll("*").remove();

        const totalH = height + CONTEXT_HEIGHT + CONTEXT_MARGIN.top + CONTEXT_MARGIN.bottom;
        const focusH = height;

        clipId = "line-clip-" + Date.now();

        svg = svgWrap.append("svg")
            .attr("viewBox", `0 0 ${width + MARGIN.left + MARGIN.right} ${totalH + MARGIN.top + MARGIN.bottom}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("aria-label", "Multi-line chart: gender indicator trends over time");

        // Clip path for focus area
        // any content rendered inside a group that uses this clip path gets cut off at the chart boundary.
        // This prevents lines from spilling into the axes when brush/zoom.
        svg.append("defs").append("clipPath")
            .attr("id", clipId)
            .append("rect")
            .attr("x", 0).attr("y", -6)
            .attr("width", width).attr("height", focusH + 6);

        // ── Focus group (main chart) ──
        focusG = svg.append("g")
            .attr("class", "focus-group")
            .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`); // moves the entire group right and down to create the margin space for the axes.
            
        // Grid
        focusG.append("g").attr("class", "grid grid-y");  // a <g> for horizontal grid lines

        // Lines group (clipped)
        focusG.append("g")
            .attr("class", "lines-group")  // where the country lines will live (clipped)
            .attr("clip-path", `url(#${clipId})`);

        // End labels group (clipped)
        focusG.append("g")
            .attr("class", "line-labels-group")  // where the country name labels go (clipped)
            .attr("clip-path", `url(#${clipId})`);

        // Highlight dot group
        focusG.append("g")
            .attr("class", "dot-group")
            .attr("clip-path", `url(#${clipId})`);

        // Overlay for mouse events
        focusG.append("rect")
            .attr("class", "overlay-rect")  // an invisible rectangle that captures all mouse events
            .attr("width", width).attr("height", focusH)
            .attr("fill", "none")
            .attr("pointer-events", "all");

        // Axes
        xAxisFocusG = focusG.append("g")
            .attr("class", "axis axis--x")
            .attr("transform", `translate(0,${focusH})`);

        yAxisFocusG = focusG.append("g")
            .attr("class", "axis axis--y");

        // Y-axis label
        focusG.append("text")
            .attr("class", "y-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -(focusH / 2))
            .attr("y", -44)
            .attr("text-anchor", "middle")
            .attr("fill", "#94a3b8")
            .attr("font-size", "11px")
            .attr("font-family", "Inter, sans-serif");

        // ── Context group (mini chart + brush) ── Positioned below the main chart
        const contextTop = MARGIN.top + focusH + CONTEXT_MARGIN.top + 20;
        contextG = svg.append("g")
            .attr("class", "context-group")
            .attr("transform", `translate(${MARGIN.left},${contextTop})`);

        contextG.append("g").attr("class", "context-lines-group");

        contextG.append("g")
            .attr("class", "axis axis--x context-x-axis")
            .attr("transform", `translate(0,${CONTEXT_HEIGHT - CONTEXT_MARGIN.bottom})`);

        // D3 Brush
        const brushH = CONTEXT_HEIGHT - CONTEXT_MARGIN.bottom;
        brushBehavior = d3.brushX()
            .extent([[0, 0], [width, brushH]])  // Brush can only move horizontally within boundaries
            .on("end", _brushed);    // Call _brushed when user finishes brushing

        contextG.append("g")
            .attr("class", "brush")
            .call(brushBehavior);

        // Scales
        currentXDomain = [new Date(1990, 0, 1), new Date(2023, 0, 1)];
        xFocus = d3.scaleTime().domain(currentXDomain).range([0, width]);
        xContext = d3.scaleTime().domain(currentXDomain).range([0, width]);
        yFocus = d3.scaleLinear().range([focusH, 0]);
        yContext = d3.scaleLinear().range([brushH, 0]);

        // Line generators
        lineGenerator = d3.line()  // path generator 
            .defined(d => d.y != null && !isNaN(d.y))  // skip missing value
            .x(d => xFocus(d.x))     // map x (year) to horizontal position
            .y(d => yFocus(d.y))     // map y (value) to vertical position
            .curve(d3.curveMonotoneX);  // smooth curve through points 

        contextLineGenerator = d3.line()
            .defined(d => d.y != null && !isNaN(d.y))
            .x(d => xContext(d.x))
            .y(d => yContext(d.y))
            .curve(d3.curveMonotoneX);

        contextAreaGenerator = d3.area()
            .defined(d => d.y != null && !isNaN(d.y))
            .x(d => xContext(d.x))
            .y0(brushH)
            .y1(d => yContext(d.y))
            .curve(d3.curveMonotoneX);

        // Mouse overlay for vertical crosshair/tooltip
        focusG.select(".overlay-rect")
            .on("mousemove", _onMouseMove)
            .on("mouseleave", _onMouseLeave);
    }

    // ── updateLineChart ──────────────────────────────────────
    // Public function — called by state changes
    function updateLineChart() {
        if (!svg || _allData.length === 0) return;

        const metric = state.selectedMetric;  // read the currently active metric
        const metaConfig = METRIC_CONFIG[metric] || METRIC_CONFIG.gii;

        // Apply HDI group + region filters
        let filtered = _allData.filter(d => {
            if (state.selectedHDIGroup !== "All" && d.hdicode !== state.selectedHDIGroup) return false;
            if (state.selectedRegion !== "All" && d.region !== state.selectedRegion) return false;
            return true;
        });

        // Build series: one object per selected country
        const countries = state.lineChartCountries.filter(iso =>
            filtered.some(d => d.iso3 === iso)
        );

        const seriesData = countries.map(iso => {
            const countryRows = filtered
                .filter(d => d.iso3 === iso)
                .sort((a, b) => a.year - b.year);

            return {
                iso3: iso,
                name: ISO_TO_NAME[iso] || iso,
                points: countryRows.map(d => ({
                    x: new Date(d.year, 0, 1), // convert year to date
                    y: d[metric],  // select metric based on dropdown; e.g. d.gii or d.pr_f
                    year: d.year,
                })),
            };
        });

        _drawLineChart(seriesData, metaConfig);
    }

    // ── drawLineChart ────────────────────────────────────────
    function _drawLineChart(seriesData, metaConfig) {
        if (!svg) return;

        const { width, height: containerH } = getContainerSize();
        const focusH = containerH;
        const brushH = CONTEXT_HEIGHT - CONTEXT_MARGIN.bottom;

        // Compute Y domain from all valid points in current X domain
        const allYVals = seriesData.flatMap(s =>
            s.points
                .filter(p => p.x >= currentXDomain[0] && p.x <= currentXDomain[1])
                .map(p => p.y)
                .filter(v => v != null && !isNaN(v))
        );

        let [yMin, yMax] = allYVals.length ? d3.extent(allYVals) : [0, 1];
        const yPad = (yMax - yMin) * 0.12 || 0.05;
        yFocus.domain([Math.max(0, yMin - yPad), yMax + yPad]);

        // Context Y domain (full range)
        const allYValsCtx = seriesData.flatMap(s =>
            s.points.map(p => p.y).filter(v => v != null && !isNaN(v))
        );
        const [yMinCtx, yMaxCtx] = allYValsCtx.length ? d3.extent(allYValsCtx) : [0, 1];
        const yPadCtx = (yMaxCtx - yMinCtx) * 0.1 || 0.05;
        yContext.domain([Math.max(0, yMinCtx - yPadCtx), yMaxCtx + yPadCtx]);

        // X focus
        xFocus.domain(currentXDomain);

        // ── Axes ──
        xAxisFocusG.transition().duration(400).call(
            d3.axisBottom(xFocus)
                .ticks(8)
                .tickFormat(d3.timeFormat("%Y"))
        );

        const yTickFormat = v => {
            if (metaConfig.unit === "%") return v.toFixed(0) + "%";
            return v.toFixed(2);
        };
        yAxisFocusG.transition().duration(400).call(
            d3.axisLeft(yFocus).ticks(6).tickFormat(yTickFormat)
        );

        // Y-axis label
        focusG.select(".y-axis-label").text(metaConfig.label);

        // ── Grid ──
        focusG.select(".grid-y").transition().duration(400).call(
            d3.axisLeft(yFocus)
                .ticks(6)
                .tickSize(-(width))
                .tickFormat("")
        );

        // ── Focus Lines ── (Enter / Update / Exit pattern)
        const linesGroup = focusG.select(".lines-group");
        const sel = linesGroup.selectAll(".chart-line")
            .data(seriesData, d => d.iso3);  // key by iso3 so D3 knows which line = which country

        // ENTER ── draw new line
        sel.enter().append("path")
            .attr("class", "chart-line")
            .attr("fill", "none")
            .attr("stroke", d => colorScale(d.iso3))
            .attr("stroke-opacity", 0)   // start invisible
            .merge(sel)                  // Combine enter + existing update selection
            .attr("stroke", d => colorScale(d.iso3))
            // apply to ALL (new and existing): 
            .classed("highlighted", d => d.iso3 === state.selectedCountry)  
            .classed("dimmed", d => state.selectedCountry && d.iso3 !== state.selectedCountry)
            .transition().duration(500)
            .attr("stroke-opacity", d => {
                if (!state.selectedCountry) return 0.9;
                return d.iso3 === state.selectedCountry ? 1 : 0.12;
            })
            .attr("d", d => lineGenerator(d.points));  // draws the path

        // EXIT — removed lines (country was deselected)
        sel.exit().transition().duration(300)
            .attr("stroke-opacity", 0)
            .remove();

        // ── End Labels ──
        const labelsGroup = focusG.select(".line-labels-group");
        const labelSel = labelsGroup.selectAll(".line-label")
            .data(seriesData, d => d.iso3);

        labelSel.enter().append("text")
            .attr("class", "line-label")
            .attr("x", width + 5)
            .merge(labelSel)
            .text(d => {
                const last = d.points.filter(p =>
                    p.x <= currentXDomain[1] && p.y != null && !isNaN(p.y)
                ).at(-1);
                return last ? d.name.split(" ")[0] : "";  // Show first word of country name
            })
            .transition().duration(500)
            .attr("x", width + 5)
            .attr("y", d => {
                const last = d.points.filter(p =>
                    p.x <= currentXDomain[1] && p.y != null && !isNaN(p.y)
                ).at(-1);
                return last ? yFocus(last.y) : 0;  // y-coordinate of the last point
            })
            .attr("fill", d => colorScale(d.iso3))
            .attr("opacity", d => {
                if (!state.selectedCountry) return 0.85;
                return d.iso3 === state.selectedCountry ? 1 : 0.1;
            })
            .attr("dy", "0.35em")
            .attr("font-size", "10px");

        labelSel.exit().remove();

        // ── Context (mini chart) lines ──
        const ctxGroup = contextG.select(".context-lines-group");
        const ctxSel = ctxGroup.selectAll(".context-line")
            .data(seriesData, d => d.iso3);

        ctxSel.enter().append("path")
            .attr("class", "context-line")
            .merge(ctxSel)
            .attr("fill", "none")
            .attr("stroke", d => colorScale(d.iso3))
            .attr("stroke-opacity", 0.35)
            .attr("stroke-width", 1)
            .attr("d", d => contextLineGenerator(d.points));

        ctxSel.exit().remove();

        // Context X axis
        contextG.select(".context-x-axis").call(
            d3.axisBottom(xContext).ticks(6).tickFormat(d3.timeFormat("%Y"))
        );

        // Update brush info bar
        _updateBrushInfo();
    }

    // ── Brush handler ────────────────────────────────────────
    function _brushed(event) {
        if (!event.selection) {
            // Reset zoom
            currentXDomain = xContext.domain();
        } else {
            const [x0, x1] = event.selection;
            currentXDomain = [xContext.invert(x0), xContext.invert(x1)]; // invert the selection to get the year range
        }

        state.brushedYearRange = [
            currentXDomain[0].getFullYear(),
            currentXDomain[1].getFullYear(),
        ];

        updateLineChart();
    }

    function _updateBrushInfo() {
        const infoEl = document.getElementById("brush-info");
        const rangeEl = document.getElementById("brush-range");
        if (!infoEl || !rangeEl) return;

        const [y0, y1] = state.brushedYearRange;
        if (y0 === 1990 && y1 === 2023) {
            infoEl.style.display = "none";
        } else {
            infoEl.style.display = "flex";
            rangeEl.textContent = `${y0} – ${y1}`;
        }
    }

    // Reset brush to full range
    function resetBrush() {
        currentXDomain = [new Date(1990, 0, 1), new Date(2023, 0, 1)];
        state.brushedYearRange = [1990, 2023];
        contextG.select(".brush").call(brushBehavior.move, null);
        updateLineChart();
    }
    window.resetLineBrush = resetBrush;

    // ── Mouse interaction (vertical tooltip line) ────────────
    function _onMouseMove(event) {  
        if (!svg) return;
        const [mx] = d3.pointer(event);  // get mouse X position relative to the SVG container
        const hoverDate = xFocus.invert(mx);  // invert the mouse X position to get the year
        const hoverYear = hoverDate.getFullYear(); // get the year from the mouse X position

        // Find nearest data point for each country
        const metric = state.selectedMetric;
        const metaConfig = METRIC_CONFIG[metric] || METRIC_CONFIG.gii;

        const rows = state.lineChartCountries.map(iso => {
            const countryData = _allData.filter(d => d.iso3 === iso);
            const nearest = countryData.reduce((best, d) => {
                if (d[metric] == null) return best;
                return Math.abs(d.year - hoverYear) < Math.abs((best?.year || Infinity) - hoverYear) ? d : best;
            }, null);
            return nearest;
        }).filter(Boolean);

        if (rows.length === 0) return;

        const year = rows[0].year;
        const sortedRows = [...rows]
            .filter(d => d[metric] != null)
            .sort((a, b) => {
                if (metaConfig.lower_is_better) return a[metric] - b[metric];
                return b[metric] - a[metric];
            })
            .slice(0, 6);

        const lines = sortedRows.map(d => {
            const color = colorScale ? colorScale(d.iso3) : "#ccc";
            const val = metaConfig.format(d[metric]);
            return `<div class="tooltip-row">
                <span style="color:${color};font-weight:600;font-size:11px">${d.country}</span>
                <span class="tooltip-value">${val}</span>
            </div>`;
        }).join("");

        showTooltip(event, `
            <div class="tooltip-country">${metaConfig.label} — ${year}</div>
            ${lines}
        `);
    }

    function _onMouseLeave() {
        hideTooltip();
    }

    // ── Expose public API ────────────────────────────────────
    window.initLineChart = initLineChart;
    window.updateLineChart = updateLineChart;

})();