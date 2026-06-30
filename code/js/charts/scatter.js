// ============================================================
// scatter.js — V4: Scatter / Bubble Chart
// ============================================================
// Snapshot view for a selected year showing:
//   X axis  → gnipc (GNI per capita, log scale)
//   Y axis  → gii   (Gender Inequality Index)
//   Size    → pop_total (population in millions)
//   Colour  → hdicode (HDI group: VH / H / M / L)
//
// Linked interactions:
//   • Clicking a bubble → sets state.selectedCountry → V3 highlights that line
//   • state.selectedCountry from V3/other charts → highlights bubble here
//   • Year slider → animates bubbles to new year's positions
// ============================================================

(function () {
    "use strict";

    // ── Module-level ────────────────────────────────────────
    let _allData = [];
    let svg, chartG;
    let xScale, yScale, rScale, colorScale;
    let xAxisG, yAxisG;
    let tooltip;

    const MARGIN = { top: 20, right: 20, bottom: 55, left: 62 };

    const HDI_LABELS = {
        "VH": "Very High HDI",
        "H":  "High HDI",
        "M":  "Medium HDI",
        "L":  "Low HDI",
    };
    const HDI_ORDER = ["VH", "H", "M", "L"];
    
    // HDI colour mapping
    const HDI_COLORS = {
        "VH": "#38d9a9",   // teal
        "H":  "#63b3ed",   // blue
        "M":  "#f6ad55",   // orange
        "L":  "#fc8181",   // red
    };
    

    // ── Tooltip ─────────────────────────────────────────────
    function ensureTooltip() {
        if (!tooltip) {
            tooltip = d3.select("body").append("div")
                .attr("class", "d3-tooltip")
                .attr("id", "scatter-tooltip")
                .attr("role", "tooltip");
        }
        return tooltip;
    }

    function showTooltip(event, d) {
        const tt = ensureTooltip();
        const hdiColor = HDI_COLORS[d.hdicode] || "#ccc";
        const gii  = d.gii   != null ? d.gii.toFixed(3)   : "N/A";
        const gni  = d.gnipc != null ? "$" + d3.format(",.0f")(d.gnipc) : "N/A";  // e.g. "$12,500"
        const pop  = d.pop_total != null ? d3.format(".2s")(d.pop_total * 1e6) : "N/A";  // e.g. "1.4B" for China
        const hdiLabel = HDI_LABELS[d.hdicode] || d.hdicode || "Unknown";

        tt.html(`
            <div class="tooltip-country">${d.country}</div>
            <div class="tooltip-row">
                <span class="tooltip-label">GII</span>
                <span class="tooltip-value">${gii}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">GNI per capita</span>
                <span class="tooltip-value">${gni}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">Population</span>
                <span class="tooltip-value">${pop}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">HDI Group</span>
                <span class="tooltip-badge" style="background:${hdiColor}22;color:${hdiColor};border:1px solid ${hdiColor}44">${hdiLabel}</span>
            </div>
            <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(100,130,200,0.15);font-size:10px;color:#64748b">Click to highlight in trend chart</div>
        `).classed("visible", true);
        _positionTooltip(event);
    }

    function _positionTooltip(event) {
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

    // ── Dimension helpers ────────────────────────────────────
    function getContainerSize() {
        const el = document.getElementById("chart-scatter");
        if (!el) return { width: 680, height: 400 };
        const rect = el.getBoundingClientRect();
        return {
            width:  Math.max(rect.width  - 30, 280),
            height: Math.max(rect.height - 90, 200),
        };
    }

    // ── initScatter ──────────────────────────────────────────
    function initScatter(data) {
        _allData = data;

        const container = d3.select("#chart-scatter");
        if (container.empty()) { console.warn("initScatter: #chart-scatter not found"); return; }

        ensureTooltip();
        _buildSVG();
        _buildLegend();
        updateScatter();
    }

    // ── Build SVG ────────────────────────────────────────────
    function _buildSVG() {
        const { width, height } = getContainerSize();
        const svgWrap = d3.select("#scatter-svg-wrap");
        if (svgWrap.empty()) return;

        svgWrap.selectAll("*").remove();

        const totalW = width  + MARGIN.left + MARGIN.right;
        const totalH = height + MARGIN.top  + MARGIN.bottom;

        svg = svgWrap.append("svg")
            .attr("viewBox", `0 0 ${totalW} ${totalH}`)
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("aria-label", "Bubble chart: GNI per capita vs Gender Inequality Index");

        chartG = svg.append("g")
            .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

        // Grid lines
        chartG.append("g").attr("class", "grid grid-x");
        chartG.append("g").attr("class", "grid grid-y");

        // Bubbles group
        chartG.append("g").attr("class", "bubbles-group");

        // Axis groups
        xAxisG = chartG.append("g")
            .attr("class", "axis axis--x")
            .attr("transform", `translate(0,${height})`);

        yAxisG = chartG.append("g")
            .attr("class", "axis axis--y");

        // X axis label
        chartG.append("text")
            .attr("class", "x-axis-label")
            .attr("x", width / 2)
            .attr("y", height + 55)
            .attr("text-anchor", "middle")
            .attr("fill", "#94a3b8")
            .attr("font-size", "11px")
            .attr("font-family", "Inter, sans-serif")
            .text("GNI per capita (2021 PPP $, log scale)");

        // Y axis label
        chartG.append("text")
            .attr("class", "y-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -(height / 2))
            .attr("y", -50)
            .attr("text-anchor", "middle")
            .attr("fill", "#94a3b8")
            .attr("font-size", "11px")
            .attr("font-family", "Inter, sans-serif")
            .text("Gender Inequality Index (GII)");

        // Scales
        xScale = d3.scaleLog()
            .domain([400, 120000])     // GNI per capita range ($400 to $120,000)
            .range([0, width])
            .clamp(true);              // Values outside domain get clamped to edge (not off-chart)

        yScale = d3.scaleLinear()
            .domain([0, 0.95])         // GII ranges from 0 (perfect equality) to 1 (very unequal)
            .range([height, 0]);       // Inverted: 0 at bottom, 0.95 at top

        rScale = d3.scaleSqrt()
            .domain([0, 1500])         // 0 to 1.5 billion population (in millions)
            .range([3, 36])            // 3px to 36px radius
            .clamp(true);

        colorScale = d3.scaleOrdinal()
            .domain(HDI_ORDER)             // ["VH", "H", "M", "L"]
            .range(HDI_ORDER.map(k => HDI_COLORS[k]));      // ["#38d9a9", "#63b3ed", "#f6ad55", "#fc8181"]
    }

    // ── Build legend ─────────────────────────────────────────
    function _buildLegend() {
        const legendEl = document.getElementById("scatter-legend");
        if (!legendEl) return;

        legendEl.innerHTML = "";

        // HDI colour legend
        HDI_ORDER.forEach(code => {
            const item = document.createElement("div");
            item.className = "legend-item";
            item.setAttribute("data-hdi", code);
            item.innerHTML = `
                <div class="legend-dot" style="background:${HDI_COLORS[code]}"></div>
                <span>${HDI_LABELS[code]}</span>
            `;
            item.addEventListener("click", () => _toggleHDIFilter(code));
            legendEl.appendChild(item);
        });

        // Size reference
        const sizeRef = document.createElement("div");
        sizeRef.className = "legend-item";
        sizeRef.style.marginLeft = "auto";
        sizeRef.innerHTML = `<span style="color:#64748b;font-size:10px">● size = population</span>`;
        legendEl.appendChild(sizeRef);
    }

    let _hiddenHDI = new Set();
    function _toggleHDIFilter(code) {
        if (_hiddenHDI.has(code)) _hiddenHDI.delete(code);  // If already hidden → show it
        else _hiddenHDI.add(code);                          // If shown → hide it

        // Update legend item opacity
        document.querySelectorAll(".legend-item[data-hdi]").forEach(el => {
            const c = el.getAttribute("data-hdi");
            el.style.opacity = _hiddenHDI.has(c) ? "0.3" : "1";   // If hidden → opacity 0.3
        });

        updateScatter();
    }

    // ── updateScatter ────────────────────────────────────────
    // Public — called by global filter changes or state updates
    function updateScatter() {
        if (!svg || _allData.length === 0) return;

        const { width, height } = getContainerSize();

        // Filter to selected year
        let yearData = _allData.filter(d => d.year === state.selectedYear);

        // Apply global HDI group filter
        if (state.selectedHDIGroup !== "All") {
            yearData = yearData.filter(d => d.hdicode === state.selectedHDIGroup);
        }

        // Apply region filter
        if (state.selectedRegion !== "All") {
            yearData = yearData.filter(d => d.region === state.selectedRegion);
        }

        // Filter out rows with missing x or y
        yearData = yearData.filter(d =>
            d.gnipc != null && d.gnipc > 0 &&
            d.gii   != null &&
            d.hdicode && HDI_LABELS[d.hdicode]
        );

        // Apply local HDI toggle filter
        if (_hiddenHDI.size > 0) {
            yearData = yearData.filter(d => !_hiddenHDI.has(d.hdicode));
        }

        // Compute xScale domain from data (keep min 400)
        const xExtent = d3.extent(yearData, d => d.gnipc);
        xScale.domain([Math.max(350, xExtent[0] * .7), xExtent[1] * 1.2]);

        // Sort: draw large bubbles first so small ones appear on top
        yearData.sort((a, b) => (b.pop_total || 0) - (a.pop_total || 0));

        // ── Update axes ──
        xAxisG.transition().duration(600).call(
            d3.axisBottom(xScale)
                .ticks(6, "~s")
                .tickFormat(d => "$" + d3.format(".2s")(d))
        )
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".3em")
        .attr("transform", "rotate(-65)");
        yAxisG.transition().duration(600).call(
            d3.axisLeft(yScale).ticks(7).tickFormat(d => d.toFixed(2))
        );

        // ── Grid ──
        chartG.select(".grid-y").transition().duration(600).call(
            d3.axisLeft(yScale).ticks(7).tickSize(-width).tickFormat("")
        );
        chartG.select(".grid-x").transition().duration(600).call(
            d3.axisBottom(xScale)
                .ticks(6)
                .tickSize(-height)
                .tickFormat("")
        ).attr("transform", `translate(0,${height})`);

        // ── Bubbles ──
        const bubblesG = chartG.select(".bubbles-group");

        const circles = bubblesG.selectAll(".bubble")
            .data(yearData, d => d.iso3);

        // ENTER — new countries (e.g. year changed and a country now has data)
        const circlesEnter = circles.enter().append("circle")
            .attr("class", "bubble")
            .attr("r", 0)       // Start at radius 0 (invisible) so it appears from center 
            .attr("cx", d => xScale(Math.max(d.gnipc, 350)))
            .attr("cy", d => yScale(d.gii))
            .attr("fill", d => colorScale(d.hdicode))
            .attr("fill-opacity", 0.7)
            .attr("stroke", d => colorScale(d.hdicode))
            .attr("stroke-opacity", 0.9)
            .on("mouseover", (event, d) => {
                showTooltip(event, d);
                // Lift hovered bubble
                d3.select(event.currentTarget).raise();
            })
            .on("mousemove", (event) => {
                tooltip && tooltip.classed("visible") && _positionTooltip(event);
            })
            .on("mouseout", (event, d) => {
                hideTooltip();
            })
            .on("click", (event, d) => {
                event.stopPropagation();
                _onBubbleClick(d);
            });

        // MERGE — update both new and existing circles
        circlesEnter.merge(circles)
            .classed("highlighted", d => d.iso3 === state.selectedCountry)
            .classed("dimmed", d => state.selectedCountry && d.iso3 !== state.selectedCountry)
            .attr("stroke", d => {
                if (d.iso3 === state.selectedCountry) return "#fff";
                return colorScale(d.hdicode);
            })
            .attr("stroke-width", d => d.iso3 === state.selectedCountry ? 2.5 : 1.5)
            .attr("fill-opacity", d => {
                if (!state.selectedCountry) return 0.7;
                return d.iso3 === state.selectedCountry ? 0.9 : 0.12;
            })
            .transition().duration(600).ease(d3.easeCubicOut)
            .attr("r", d => rScale(d.pop_total || 1))         // Animate radius
            .attr("cx", d => xScale(Math.max(d.gnipc, 350)))  // Animate X position
            .attr("cy", d => yScale(d.gii));                  // Animate Y position

        // EXIT — countries with no data this year
        circles.exit()
            .transition().duration(300)
            .attr("r", 0)
            .remove();

        // ── Country labels for highlighted bubble ──
        bubblesG.selectAll(".bubble-label").remove();
        if (state.selectedCountry) {
            const sel = yearData.find(d => d.iso3 === state.selectedCountry);
            if (sel) {
                bubblesG.append("text")
                    .attr("class", "bubble-label")
                    .attr("x", xScale(Math.max(sel.gnipc, 350)))
                    .attr("y", yScale(sel.gii) - rScale(sel.pop_total || 1) - 6)
                    .attr("text-anchor", "middle")
                    .attr("fill", "#e2e8f0")
                    .attr("font-size", "11px")
                    .attr("font-family", "Inter, sans-serif")
                    .attr("font-weight", "600")
                    .attr("pointer-events", "none")
                    .text(sel.country);
            }
        }

        // ── Year annotation ──
        chartG.selectAll(".year-annotation").remove();
        chartG.append("text")
            .attr("class", "year-annotation")
            .attr("x", width - 8)
            .attr("y", 16)
            .attr("text-anchor", "end")
            .attr("fill", "rgba(148,163,184,0.35)")
            .attr("font-size", "44px")
            .attr("font-family", "Inter, sans-serif")
            .attr("font-weight", "700")
            .attr("pointer-events", "none")
            .text(state.selectedYear);
    }

    // ── Bubble click handler ─────────────────────────────────
    function _onBubbleClick(d) {
        if (state.selectedCountry === d.iso3) {   
            state.selectedCountry = null;     // Click same bubble again → deselect
        } else {
            state.selectedCountry = d.iso3;     // Select a country
            // Add to line chart countries if not present 
            if (!state.lineChartCountries.includes(d.iso3)) {   
                state.lineChartCountries = [...state.lineChartCountries.slice(-7), d.iso3];
                // Refresh country select UI
                const sel = document.getElementById("line-country-select");
                if (sel) {
                    [...sel.options].forEach(opt => {
                        opt.selected = state.lineChartCountries.includes(opt.value);
                    });
                }
            }
        }

        // Highlight in this chart
        updateScatter();

        // Propagate to line chart
        if (typeof updateLineChart === "function") updateLineChart();

        // Highlight the card
        const scatterCard = document.getElementById("chart-scatter");
        const lineCard    = document.getElementById("chart-line-card");
        if (lineCard) {
            lineCard.classList.toggle("active-highlight", state.selectedCountry !== null);  // Add glowing border to the LineChart
        }
    }

    // Click on chart background → deselect
    function _setupBackgroundDeselect() {
        if (!svg) return;
        svg.on("click", (event) => {
            if (event.target.classList.contains("bubble")) return;
            state.selectedCountry = null;       // Click on empty area → deselect
            updateScatter();
            if (typeof updateLineChart === "function") updateLineChart();
            const lineCard = document.getElementById("chart-line-card");
            if (lineCard) lineCard.classList.remove("active-highlight");
        });
    }

    // Re-expose so _setupBackgroundDeselect runs after SVG exists
    function initScatterWithSetup(data) {
        initScatter(data);
        _setupBackgroundDeselect();
    }

    // ── Expose public API ────────────────────────────────────
    window.initScatter   = initScatterWithSetup;
    window.updateScatter = updateScatter;

})();