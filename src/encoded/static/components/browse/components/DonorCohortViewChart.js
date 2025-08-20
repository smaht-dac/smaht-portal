import React from 'react';

import * as d3 from 'd3';
import { OverlayTrigger } from 'react-bootstrap';

// --- Theme (kept from mockup) ---
const THEME = {
    panel: { radius: 14, stroke: '#E5E7EB', fill: '#FFFFFF' },
    grid: '#FFFFFF', // '#ECEFF3',
    title: { color: '#5A6C8D', size: 16, weight: 500 },
    axis: { tick: '#6B7280', fontSize: 12, fontSizeYHorizontal: 11, domain: '#CBD5E1' },
    label: { fill: '#111827', fontSize: 12 },
    colors: {
        male: '#2F62AA',
        female: '#B79AEF',
        hardy: '#56A9F5',
        ethnicity: '#14B3BB'
    }
};

// --- Wrap long axis labels (limit to N lines) ---
function wrapAxisLabelsLimited(selection, maxWidth, maxLines = 2, isYAxis = false) {
    selection.each(function () {
        const text = d3.select(this);
        const words = text.text().split(/\s+/).reverse();
        let word, line = [], lineNumber = 0;
        const lineHeight = 1.1;
        const x = +text.attr('x') || 0;
        const y = +text.attr('y') || 0;
        const dy = parseFloat(text.attr('dy')) || 0;

        text.text(null);
        let tspan = text.append('tspan').attr('x', x).attr('y', y).attr('dy', `${dy}em`);

        while ((word = words.pop())) {
            line.push(word);
            tspan.text(line.join(' '));
            const tooLong = tspan.node().getComputedTextLength() > maxWidth;
            if (tooLong) {
                line.pop(); tspan.text(line.join(' '));
                line = [word];
                lineNumber += 1;
                if (lineNumber >= maxLines) {
                    const rest = [word, ...words.reverse()].join(' ');
                    const last = text.append('tspan')
                        .attr('x', x).attr('y', y)
                        .attr('dy', `${lineNumber * lineHeight + dy}em`)
                        .text(rest);
                    while (last.node().getComputedTextLength() > maxWidth && last.text().length > 0) {
                        last.text(last.text().slice(0, -1));
                    }
                    if (!last.text().endsWith('…')) last.text(last.text() + '…');
                    return;
                }
                tspan = text.append('tspan')
                    .attr('x', x).attr('y', y)
                    .attr('dy', `${lineNumber * lineHeight + dy}em`)
                    .text(word);
            }
        }
        if (isYAxis) text.selectAll('tspan').attr('text-anchor', 'end');
    });
}

// --- Responsive width hook ---
function useParentWidth(ref) {
    const [w, setW] = React.useState(0);
    React.useEffect(() => {
        if (!ref.current) return;
        const ro = new ResizeObserver(([entry]) => {
            const cw = entry.contentBoxSize
                ? entry.contentBoxSize[0]?.inlineSize ?? entry.contentRect.width
                : entry.contentRect.width;
            setW(Math.max(1, Math.floor(cw)));
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, [ref]);
    return w;
}

const TITLE_BAND = 44;   // vertical space reserved for title

const DonorCohortViewChart = ({
    title = '',
    data,
    chartWidth = 'auto',
    chartHeight = 420,
    popover = null,
    showLegend = true,
    showLabelOnBar = true,
    chartType = 'stacked',  // 'stacked' | 'single' | 'horizontal'
    topStackColor,
    bottomStackColor,
    // NEW: axis titles
    xAxisTitle = '',
    yAxisTitle = '',
    session
}) => {
    const svgRef = React.useRef();
    const outerRef = React.useRef();
    const measuredW = useParentWidth(outerRef);
    const effectiveWidth = chartWidth === 'auto' ? measuredW : chartWidth;

    React.useEffect(() => {
        if (!effectiveWidth) return;

        const svg = d3.select(svgRef.current)
            .attr('width', effectiveWidth)
            .attr('height', chartHeight);
        svg.selectAll('*').remove();

        const legendOn = chartType === 'stacked' && showLegend;
        const topReserve = 44 /*TITLE_BAND*/ + (legendOn ? 44 /*LEGEND_BAND*/ : 0);

        // Reserve extra bands if axis titles are provided
        const X_TITLE_BAND = xAxisTitle ? 28 : 0;
        const Y_TITLE_BAND = yAxisTitle ? 28 : 0;

        // Extra left for long Y labels; extra right for end-values on horizontal
        const leftForHorizontal = Math.min(200, Math.max(100, effectiveWidth * 0.28));
        const rightForHorizontal = 56;

        const margin = {
            top: topReserve + 20,
            right: chartType === 'horizontal' ? rightForHorizontal : 24,
            bottom: (chartType === 'horizontal' ? 40 : 56) + X_TITLE_BAND,
            left: (chartType === 'horizontal' ? leftForHorizontal : 56) + Y_TITLE_BAND
        };

        const width = effectiveWidth - margin.left - margin.right;
        const height = chartHeight - margin.top - margin.bottom;

        // Panel
        svg.append('rect')
            .attr('x', 10).attr('y', 10)
            .attr('width', effectiveWidth - 20)
            .attr('height', chartHeight - 20)
            .attr('rx', THEME.panel.radius)
            .attr('fill', THEME.panel.fill)
            .attr('stroke', THEME.panel.stroke);

        if (!data || (Array.isArray(data) && data.length === 0)) {
            return;
        }

        // Tooltip
        const tip = d3.select('body').append('div')
            .style('position', 'absolute').style('padding', '6px 10px')
            .style('background', '#111827').style('color', '#fff')
            .style('border-radius', '6px').style('font-size', '12px')
            .style('pointer-events', 'none').style('opacity', 0);
        const showTip = (e, html) => tip.style('left', e.pageX + 10 + 'px').style('top', e.pageY - 28 + 'px').style('opacity', 1).html(html);
        const moveTip = (e) => tip.style('left', e.pageX + 10 + 'px').style('top', e.pageY - 28 + 'px');
        const hideTip = () => tip.style('opacity', 0);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // ---------- Horizontal (Ethnicity) ----------
        if (chartType === 'horizontal') {
            const value = d => (d.blue || 0) + (d.pink || 0);
            const color = topStackColor || THEME.colors.ethnicity;

            const x = d3.scaleLinear()
                .domain([0, d3.max(data, value) || 0])
                .nice()
                .range([0, width]);

            const y = d3.scaleBand()
                .domain(data.map(d => d.ageGroup))
                .range([0, height])
                .padding(0.25);

            // 1) Grid: vertical grid lines only; hide the grid group's domain path
            //    (prevents the unwanted top black line)
            const gridG = g.append('g')
                .call(d3.axisBottom(x).ticks(6).tickSize(height).tickFormat(''));
            gridG.selectAll('line').attr('stroke', THEME.grid);
            gridG.select('.domain').attr('stroke', 'none');

            // 2) X axis (bottom): show the bottom domain line in a soft gray,
            //    and remove outer ticks so nothing sticks out past the bounds
            const xAx = g.append('g')
                .attr('transform', `translate(0,${height})`)
                .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
            xAx.selectAll('text')
                .style('font-size', THEME.axis.fontSize)
                .style('fill', THEME.axis.tick);
            xAx.selectAll('line').attr('stroke', THEME.axis.domain).attr('y2', 6);
            xAx.select('.domain').attr('stroke', THEME.axis.domain);

            // 3) Y axis (left): show the left domain line; hide tick lines.
            //    Wrap labels to two lines to save horizontal space.
            const yAx = g.append('g')
                .call(d3.axisLeft(y).tickSizeOuter(0));
            yAx.selectAll('text')
                .style('font-size', THEME.axis.fontSizeYHorizontal)
                .style('fill', THEME.axis.tick)
                .call(wrapAxisLabelsLimited, margin.left - 75, 2, true);
            yAx.selectAll('line').attr('stroke', 'none');
            yAx.select('.domain').attr('stroke', THEME.axis.domain);

            // 4) Bars
            g.selectAll('.bar-h')
                .data(data).enter().append('rect')
                .attr('x', 0)
                .attr('y', d => y(d.ageGroup))
                .attr('height', y.bandwidth())
                .attr('width', d => x(value(d)))
                .attr('fill', color)
                .attr('stroke', 'none')
                .on('mouseover', (e, d) => showTip(e, `${value(d)}`))
                .on('mousemove', moveTip)
                .on('mouseout', hideTip);

            // 5) Value labels at the end of each bar (slightly offset from the bar)
            g.selectAll('.label-h')
                .data(data).enter().append('text')
                .text(d => value(d))
                .attr('x', d => x(value(d)) + 10)
                .attr('y', d => y(d.ageGroup) + y.bandwidth() / 2)
                .attr('dy', '0.35em')
                .style('font-size', THEME.label.fontSize)
                .style('fill', THEME.label.fill);

            // 6) Axis titles (optional)
            if (yAxisTitle) {
                g.append('text')
                    .attr('transform', 'rotate(-90)')
                    .attr('x', -height / 2)
                    .attr('y', -margin.left + 34)
                    .attr('text-anchor', 'middle')
                    .style('font-size', 12)
                    .style('fill', THEME.axis.tick)
                    .text(yAxisTitle);
            }

            if (xAxisTitle) {
                g.append('text')
                    .attr('x', width / 2)
                    .attr('y', height + 38)
                    .attr('text-anchor', 'middle')
                    .style('font-size', 12)
                    .style('fill', THEME.axis.tick)
                    .text(xAxisTitle);
            }

            return () => tip.remove();
        }

        // ---------- Vertical (Stacked / Single) ----------
        const x = d3.scaleBand().domain(data.map(d => d.ageGroup)).range([0, width]).padding(0.3);
        const yMax = d3.max(data, d => chartType === 'stacked' ? (d.blue || 0) + (d.pink || 0) : (d.blue || 0)) || 0;
        const y = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);

        // Grid
        g.append('g')
            .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(''))
            .selectAll('line').attr('stroke', THEME.grid);

        // X-axis
        const xAxV = g.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
        xAxV.selectAll('text')
            .attr('text-anchor', 'middle')
            .attr('x', 0).attr('y', 15).attr('dy', '0.35em')
            .style('font-size', THEME.axis.fontSize).style('fill', THEME.axis.tick)
            .call(wrapAxisLabelsLimited, x.bandwidth() - 4, 2, false);
        xAxV.select('.domain').attr('stroke', THEME.axis.domain);

        // Y-axis
        const yAxV = g.append('g').call(d3.axisLeft(y));
        yAxV.selectAll('text').style('font-size', THEME.axis.fontSize).style('fill', THEME.axis.tick);
        yAxV.select('.domain').attr('stroke', THEME.axis.domain);

        if (chartType === 'stacked') {
            const maleColor = topStackColor || THEME.colors.male;
            const femaleColor = bottomStackColor || THEME.colors.female;

            g.selectAll('.bar-female')
                .data(data).enter().append('rect')
                .attr('x', d => x(d.ageGroup)).attr('y', d => y(d.pink || 0))
                .attr('height', d => y(0) - y(d.pink || 0)).attr('width', x.bandwidth())
                .attr('fill', femaleColor).attr('stroke', 'none')
                .on('mouseover', (e, d) => showTip(e, `${d.pink} Female`))
                .on('mousemove', moveTip).on('mouseout', hideTip);

            g.selectAll('.bar-male')
                .data(data).enter().append('rect')
                .attr('x', d => x(d.ageGroup)).attr('y', d => y((d.blue || 0) + (d.pink || 0)))
                .attr('height', d => y(0) - y(d.blue || 0)).attr('width', x.bandwidth())
                .attr('fill', maleColor).attr('stroke', 'none')
                .on('mouseover', (e, d) => showTip(e, `${d.blue} Male`))
                .on('mousemove', moveTip).on('mouseout', hideTip);

            if (showLabelOnBar) {
                g.selectAll('.label-female')
                    .data(data).enter().append('text')
                    .filter(d => (d.pink || 0) > 0)
                    .text(d => d.pink)
                    .attr('x', d => x(d.ageGroup) + x.bandwidth() / 2)
                    .attr('y', d => y((d.pink || 0) / 2))
                    .attr('text-anchor', 'middle').attr('dy', '0.35em')
                    .style('fill', '#FFFFFF').style('font-size', 12);

                g.selectAll('.label-male')
                    .data(data).enter().append('text')
                    .filter(d => (d.blue || 0) > 0)
                    .text(d => d.blue)
                    .attr('x', d => x(d.ageGroup) + x.bandwidth() / 2)
                    .attr('y', d => y((d.pink || 0) + (d.blue || 0) / 2))
                    .attr('text-anchor', 'middle').attr('dy', '0.35em')
                    .style('fill', '#FFFFFF').style('font-size', 12);
            }

            g.selectAll('.label-total')
                .data(data).enter().append('text')
                .filter(d => ((d.blue || 0) + (d.pink || 0)) > 0)
                .text(d => (d.blue || 0) + (d.pink || 0))
                .attr('x', d => x(d.ageGroup) + x.bandwidth() / 2)
                .attr('y', d => y((d.blue || 0) + (d.pink || 0)) - 4)
                .attr('text-anchor', 'middle')
                .style('fill', THEME.label.fill).style('font-size', THEME.label.fontSize);
        } else {
            // Single-series (Hardy)
            const color = topStackColor || THEME.colors.hardy;

            g.selectAll('.bar-single')
                .data(data).enter().append('rect')
                .attr('x', d => x(d.ageGroup)).attr('y', d => y(d.blue || 0))
                .attr('height', d => y(0) - y(d.blue || 0)).attr('width', x.bandwidth())
                .attr('fill', color).attr('stroke', 'none')
                .on('mouseover', (e, d) => showTip(e, `${d.blue}`))
                .on('mousemove', moveTip).on('mouseout', hideTip);

            g.selectAll('.label-single')
                .data(data).enter().append('text')
                .text(d => d.blue || 0)
                .attr('x', d => x(d.ageGroup) + x.bandwidth() / 2)
                .attr('y', d => y(d.blue || 0) - 6)
                .attr('text-anchor', 'middle')
                .style('fill', THEME.label.fill).style('font-size', THEME.label.fontSize);
        }

        // --- NEW: axis titles for vertical charts ---
        if (yAxisTitle) {
            g.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -height / 2)
                .attr('y', -margin.left + 34)
                .attr('text-anchor', 'middle')
                .style('font-size', 12)
                .style('fill', THEME.axis.tick)
                .text(yAxisTitle);
        }
        if (xAxisTitle) {
            g.append('text')
                .attr('x', (width / 2) - 14)
                .attr('y', height + 53)
                .attr('text-anchor', 'middle')
                .style('font-size', 12)
                .style('fill', THEME.axis.tick)
                .text(xAxisTitle);
        }

        return () => tip.remove();
    }, [data, effectiveWidth, chartHeight, chartType, topStackColor, bottomStackColor, showLegend, showLabelOnBar, title, xAxisTitle, yAxisTitle, session]);

    // Legend sits under the title (no overlap)
    const legendTop = TITLE_BAND - 15;

    return (
        <div ref={outerRef} style={{ position: 'relative', display: 'inline-block', width: '100%', height: chartHeight }}>
            <svg ref={svgRef} />

            {/* Title + info icon (centered) */}
            <div
                style={{
                    position: 'absolute',
                    top: 18,
                    left: title.length < 25 ? '50%' : '40%',
                    transform: title.length < 25 ? 'translateX(-50%)' : 'translateX(-35%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    pointerEvents: 'none',
                    zIndex: 2
                }}
            >
                <h3
                    style={{
                        margin: 0,
                        color: THEME.title.color,
                        fontSize: THEME.title.size,
                        fontWeight: THEME.title.weight,
                        pointerEvents: 'none'
                    }}
                >
                    {title}
                </h3>

                {popover && (
                    <OverlayTrigger
                        trigger="click"
                        flip
                        placement="auto"
                        rootClose
                        rootCloseEvent="click"
                        overlay={popover}
                    >
                        {/* use a button for a11y; enable click with pointerEvents:auto */}
                        <button
                            type="button"
                            aria-label="More info"
                            style={{
                                all: 'unset',
                                cursor: 'pointer',
                                pointerEvents: 'auto',
                                lineHeight: 0
                            }}
                        >
                            <i className="icon icon-info-circle fas" />
                        </button>
                    </OverlayTrigger>
                )}
            </div>


            {/* Legend (vertical, compact) */}
            {chartType === 'stacked' && (
                <div
                    style={{
                        position: 'absolute',
                        top: legendTop,
                        right: 15,
                        background: '#fff',
                        border: `1px solid ${THEME.panel.stroke}`,
                        borderRadius: 10,
                        padding: '4px 5px',
                        // keep it narrow
                        minWidth: 90,
                        maxWidth: 120
                    }}
                >
                    {/* Title */}
                    <div
                        style={{
                            textAlign: 'center',
                            fontSize: 11,
                            fontWeight: 500,
                            marginBottom: 6
                        }}
                    >
                        Donor Sex
                    </div>

                    {/* Items stacked vertically */}
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',   // <— stack items
                            gap: 6
                        }}
                    >
                        {/* Male */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                                aria-hidden
                                style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 3,
                                    background: topStackColor || THEME.colors.male,
                                    flex: '0 0 auto'
                                }}
                            />
                            <span style={{ fontSize: 11, lineHeight: 1 }}>Male</span>
                        </div>

                        {/* Female */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                                aria-hidden
                                style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 3,
                                    background: bottomStackColor || THEME.colors.female,
                                    flex: '0 0 auto'
                                }}
                            />
                            <span style={{ fontSize: 11, lineHeight: 1 }}>Female</span>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DonorCohortViewChart;
