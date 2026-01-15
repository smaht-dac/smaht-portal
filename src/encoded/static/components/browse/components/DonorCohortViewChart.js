import React, { useState } from 'react';

import * as d3 from 'd3';
import { OverlayTrigger } from 'react-bootstrap';

// default theme
const THEME = {
    panel: { radius: 14, stroke: '#A3C4ED', fill: '#FFFFFF' },
    grid: '#FFFFFF',
    title: { color: '#5A6C8D', size: 16, weight: 500 },
    axis: { tick: '#6B7280', fontSize: 12, fontSizeYHorizontal: 11, domain: '#CBD5E1' },
    label: { fill: '#111827', fontSize: 12 },
    colors: {
        male: '#2F62AA',
        female: '#B79AEF',
        hardy: '#56A9F5',
        ethnicity: '#14B3BB'
    },
    hoverStroke: {
        male: '#17379D',
        female: '#5852C2',
        hardy: '#1672C7'
    }
};

// --- Wrap long axis labels (limit to N lines, add tooltip if truncated) ---
function wrapAxisLabelsLimited(selection, maxWidth, maxLines = 2, isYAxis = false) {
    selection.each(function () {
        const text = d3.select(this);
        const originalText = text.text();
        const words = originalText.split(/\s+/).reverse();
        let word, line = [], lineNumber = 0;
        const lineHeight = 1.1;
        const x = +text.attr('x') || 0;
        const y = +text.attr('y') || 0;
        const dy = parseFloat(text.attr('dy')) || 0;

        text.text(null);
        let tspan = text.append('tspan').attr('x', x).attr('y', y).attr('dy', `${dy}em`);
        let truncated = false;

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
                    truncated = true;
                    // mark truncated BEFORE return
                    text.attr('data-truncated', '1').attr('data-fulltext', originalText);
                    return;
                }
                tspan = text.append('tspan')
                    .attr('x', x).attr('y', y)
                    .attr('dy', `${lineNumber * lineHeight + dy}em`)
                    .text(word);
            }
        }
        if (isYAxis) text.selectAll('tspan').attr('text-anchor', 'end');

        if (!truncated) {
            text.attr('data-truncated', null).attr('data-fulltext', null);
        }
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

/**
 * Chart Title component with optional popover
 * @param {string} title - title of the chart
 * @param {JSX.Element} popover - popover component to be rendered
 * @returns {JSX.Element} Chart Title component
 * 
 * Note: Popover is manually triggered to support popover interaction
 */
const ChartTitle = ({ title = '', popover = null }) => {
    const [showPopover, setShowPopover] = useState(false);

    const handleShowPopover = (show) => {
        setShowPopover(show);
    };

    return (
        <div className="chart-title-container">
            <h3>
                {title}
                {popover && (
                    <OverlayTrigger
                        show={showPopover}
                        flip
                        placement="auto"
                        rootClose
                        rootCloseEvent="click"
                        overlay={
                            // Allow for popover to be a function or a JSX element
                            typeof popover === 'function'
                                ? popover(handleShowPopover)
                                : popover
                        }
                    >
                        <button
                            onMouseEnter={() => setShowPopover(true)}
                            onMouseLeave={() => setShowPopover(false)}
                            type="button" className="info-tooltip" aria-label="More info"
                        >
                            <i className="icon icon-info-circle fas" />
                        </button>
                    </OverlayTrigger>
                )}
            </h3>
        </div>
    )
};

const DonorCohortViewChart = ({
    title = '',
    data,
    chartWidth = 'auto',
    chartHeight = 420,
    popover = null,
    showLegend = false,
    showLabelOnBar = true,
    chartType = 'stacked',  // 'stacked' | 'single' | 'horizontal'
    topStackColor,
    bottomStackColor,
    xAxisTitle = '',
    yAxisTitle = '',
    legendTitle = '',
    session,
    loading = false,
    showBarTooltip = false,
    // optional: forward “Explore Donors” button click to parent
    buildExploreDonorsHref = () => console.log('buildExploreDonorsHref not provided'),
    // optional: titles in the tooltip header (crumb + detail's left and right)
    tooltipTitles = { crumb: null, left: null, right: '# of Donors' },
    // optional: key in data for file count (omit if not needed)
    filesCountKey: propFilesCountKey = 'totalFileCount',
    buildFilesHref = () => console.log('buildFilesHref not provided'),
    showXAxisTitle = true,
    showYAxisTitle = true
}) => {
    const svgRef = React.useRef();
    const outerRef = React.useRef();
    const measuredW = useParentWidth(outerRef);
    const effectiveWidth = chartWidth === 'auto' ? measuredW : chartWidth;
    // unique id per chart instance (stable for component lifetime)
    const instanceIdRef = React.useRef(`ct-${Math.random().toString(36).slice(2)}`);

    React.useEffect(() => {
        // skip drawing if no data or loading
        if (!effectiveWidth) {
            return;
        }

        const svg =
            d3.select(svgRef.current)
                .attr('width', effectiveWidth)
                .attr('height', chartHeight);
        svg.selectAll('*').remove();

        const topReserve = TITLE_BAND;

        // Reserve extra bands if axis titles are provided
        const X_TITLE_BAND = xAxisTitle ? 28 : 0;
        const Y_TITLE_BAND = yAxisTitle ? 28 : 0;

        // Extra left for long Y labels; extra right for end-values on horizontal
        const leftHorizontal = Math.min(200, Math.max(100, effectiveWidth * 0.28));
        const rightHorizontal = 56;

        const isHorizontal = chartType === 'horizontal';

        const margin = {
            top: (isHorizontal ? 20 : 30) + topReserve,
            right: isHorizontal ? rightHorizontal : 24,
            bottom: (isHorizontal ? 40 : 56) + X_TITLE_BAND,
            left: (isHorizontal ? leftHorizontal : 36) + Y_TITLE_BAND
        };

        const width = effectiveWidth - margin.left - margin.right;
        const height = chartHeight - (/*margin.top*/topReserve + 20) - margin.bottom;

        // Panel (always draw so card looks consistent while loading)
        svg.append('rect')
            .attr('x', 10).attr('y', 10)
            .attr('width', effectiveWidth - 20)
            .attr('height', chartHeight - 20)
            .attr('rx', THEME.panel.radius)
            .attr('fill', THEME.panel.fill)
            .attr('stroke', THEME.panel.stroke);

        // draw the borders only, skip rest of drawing if no data or loading
        if (loading || !data || (Array.isArray(data) && (data.length === 0 || data[0].total === 0))) {
            return;
        }

        // created once per chart instance, removed on unmount
        const instanceId = instanceIdRef.current;

        // Rich tooltip with pin/unpin
        const tooltipSel = d3
            .select('body')
            .selectAll(`.cohort-tooltip.${instanceId}`)
            .data([0])
            .join('div')
            .attr('class', `cohort-tooltip ${instanceId}`)
            .style('position', 'absolute')
            .style('opacity', 0); // pointer-events toggled via class

        let _isPinned = false;
        let _pinnedData = null;
        let _pinnedSelection = null;

        /**
            * Build tooltip card HTML matching the provided popover structure.
            * Signature intentionally unchanged.
            * @param {object} d Data object for the hovered/pinned bar
            * @param {string} barStackType - 'primary' | 'secondary' | null
        */
        function renderRichTooltip(d, barStackType) {
            const stackConfig = {
                primary: {
                    donorCount: d?.value1 || 0,
                    fileCount: d?.value1FileCount || 0,
                    swatchColor: topStackColor || THEME.colors.male,
                    fileAdditionalParam: { 'donors.sex': 'Male' },
                    donorAdditionalParam: { sex: 'Male' }
                },
                secondary: {
                    donorCount: d?.value2 || 0,
                    fileCount: d?.value2FileCount || 0,
                    swatchColor: bottomStackColor || THEME.colors.female,
                    fileAdditionalParam: { 'donors.sex': 'Female' },
                    donorAdditionalParam: { sex: 'Female' }
                },
                default: {
                    donorCount: (d?.value1 || 0) + (d?.value2 || 0),
                    fileCount: d?.totalFileCount || 0,
                    swatchColor: topStackColor,
                    fileAdditionalParam: {},
                    donorAdditionalParam: {}
                }
            };

            const {
                donorCount,
                fileCount,
                swatchColor,
                fileAdditionalParam,
                donorAdditionalParam
            } = stackConfig[barStackType] ?? stackConfig.default;

            const hasCrumb = barStackType === 'primary' || barStackType === 'secondary';

            const crumbTitle = hasCrumb ? tooltipTitles?.crumb || 'N/A' : null;
            const crumbLabel = hasCrumb ? (d?.group || '') : null;
            const crumbValue = hasCrumb ? (d?.value1 || 0) + (d?.value2 || 0) : 0;
            const leftTitle = tooltipTitles?.left || 'N/A';
            const rightTitle = tooltipTitles?.right || '# of Donors';
            const groupLabel = hasCrumb ? (barStackType === 'primary' ? 'Male' : 'Female') : (d?.group || '');

            const filesHref =
                typeof buildFilesHref === 'function'
                    ? buildFilesHref(d, fileAdditionalParam)
                    : null;

            const donorsHref =
                typeof buildExploreDonorsHref === 'function'
                    ? buildExploreDonorsHref(d, donorAdditionalParam)
                    : null;

            // pure HTML generated since we inject into d3 tooltip div, otherwise server libraries required to convert JSX to HTML
            return `
                <div class="cursor-component-container mosaic-detail-cursor sticky" style="width: 240px; margin-left: 25px; margin-top: 10px;">
                  <div class="inner">
                    <div class="mosaic-cursor-body">
                      ${hasCrumb ? `
                      <div class="detail-crumbs">
	                    <div data-depth="0" class="crumb row first">
		                    <div class="field col-auto">${crumbTitle}</div>
		                    <div class="name col">${crumbLabel}</div>
		                    <div class="count col-auto pull-right text-end">${crumbValue}</div>
	                    </div>
                      </div>` : ''}
                      <h6 class="field-title">
                        <small class="pull-right sets-label">${rightTitle}</small><small>${leftTitle}</small>
                      </h6>
                      <h3 class="details-title">
                        <i class="term-color-indicator icon icon-circle fas" style="color: ${swatchColor || ''};"></i>
                        <div class="primary-count count text-400 pull-right count-donors">${donorCount || 0}</div>
                        <span>${groupLabel}</span>
                      </h3>

                      ${fileCount !== null ? `
                      <div class="details row">
                        <div class="col-sm-12">
                          <div class="row">
                            <div class="col-2"></div>
                            <div class="text-end col-10">
                                ${filesHref ? `
                              <a href="${filesHref}" target="_blank" rel="noreferrer noopener">
                                ${fileCount}<small> Files</small>
                              </a>` : `${fileCount}<small> Files</small>`}
                            </div>
                          </div>
                        </div>
                      </div>` : ''}

                      ${donorsHref != null && _isPinned ? `
                      <div class="actions buttons-container">
                        <div class="button-container col-12">
                          <div class="d-grid gap-1">
                            <a href=${donorsHref} class="btn btn-primary btn-sm w-100 active" role="button" aria-pressed="true" data-explore="1">Explore Donors</a>
                          </div>
                        </div>
                      </div>` : ''}
                    </div>
                  </div>
                </div>`;
        }

        // Hover show
        function showTip(e, d, barStackType) {
            if (!showBarTooltip || _isPinned) return;

            tooltipSel
                .html(renderRichTooltip(d, barStackType))
                .style('left', e.pageX + 12 + 'px')
                .style('top', e.pageY - 12 + 'px')
                .style('opacity', 1)
                .classed('is-pinned', false);
        }

        // Follow cursor
        function moveTip(e) {
            if (!showBarTooltip || _isPinned) return;
            tooltipSel.style('left', e.pageX + 12 + 'px').style('top', e.pageY - 12 + 'px');
        }

        // Hide on mouseout
        function hideTip() {
            if (!showBarTooltip || _isPinned) return;
            tooltipSel.style('opacity', 0);
        }

        // Pin on bar click — add a click handler on your bars to call this
        function pinTip(e, d, barStackType) {
            if (!showBarTooltip) return;
            e.stopPropagation();

            if (_isPinned && _pinnedData === d) {
                unpinTooltip();
                return;
            }
            if (_pinnedSelection) {
                d3.select(_pinnedSelection).attr('stroke', 'none');
                _pinnedSelection = null;
            }
            _isPinned = true;
            _pinnedData = d;
            _pinnedSelection = e.currentTarget;
            const strokeColor = barStackType === 'primary'
                ? THEME.hoverStroke.male
                : barStackType === 'secondary'
                    ? THEME.hoverStroke.female
                    : THEME.hoverStroke.hardy;
            insetStroke(d3.select(_pinnedSelection), strokeColor);

            const left = e.pageX + 12;
            const top = e.pageY - 12;

            tooltipSel
                .html(renderRichTooltip(d, barStackType))
                .style('left', `${left}px`)
                .style('top', `${top}px`)
                .style('opacity', 1)
                .classed('is-pinned', true);
        }

        let _overSvg = false;
        let _overTooltip = false;
        const _unpinDelayMs = 120; // small grace period to allow crossing edges
        let _unpinTimer = null;

        function scheduleUnpinCheck() {
            if (_unpinTimer) clearTimeout(_unpinTimer);
            _unpinTimer = setTimeout(() => {
                if (!_overSvg && !_overTooltip) {
                    unpinTooltip();
                }
            }, _unpinDelayMs);
        }
        // helper to unpin & hide (reuse the same logic everywhere)
        function unpinTooltip() {
            if (!_isPinned) return;
            if (_pinnedSelection) {
                clearStroke(d3.select(_pinnedSelection));
                _pinnedSelection = null;
            }
            _isPinned = false;
            _pinnedData = null;
            tooltipSel.classed('is-pinned', false).style('opacity', 0);
        }

        tooltipSel
            .on(`mouseenter.cohortTooltip.${instanceId}`, () => {
                _overTooltip = true;
                if (_unpinTimer) { clearTimeout(_unpinTimer); _unpinTimer = null; }
            })
            .on(`mouseleave.cohortTooltip.${instanceId}`, () => {
                _overTooltip = false;
                // if not over SVG anymore, schedule unpin
                scheduleUnpinCheck();
            });

        // SVG-level hover tracking (instance scoped)
        d3.select(svgRef.current)
            .on(`mouseenter.cohortTooltip.${instanceId}`, () => {
                _overSvg = true;
                if (_unpinTimer) { clearTimeout(_unpinTimer); _unpinTimer = null; }
            })
            .on(`mouseleave.cohortTooltip.${instanceId}`, () => {
                _overSvg = false;
                // if not over tooltip either, schedule unpin
                scheduleUnpinCheck();
            });

        // Unpin when clicking outside or pressing ESC (registered once)
        d3.select('body').on(`click.cohortTooltip.${instanceId}`, (event) => {
            if (!_isPinned) return;
            const el = tooltipSel.node();
            if (el && !el.contains(event.target)) unpinTooltip();
        });

        d3.select(window).on(`keydown.cohortTooltip.${instanceId}`, (event) => {
            if (event.key === 'Escape' && _isPinned) unpinTooltip();
        });
        // ===== end tooltip =====

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // --- helpers ---
        const makeIntAxisLeft = (scale, maxTick) => {
            if (maxTick <= 10) {
                return d3.axisLeft(scale)
                    .tickValues(d3.range(0, maxTick + 1, 1))
                    .tickFormat(d3.format('d'));
            }
            return d3.axisLeft(scale)
                .ticks(6)
                .tickFormat(d3.format('d'));
        };
        const labelY = (v, pad = 6) => Math.max(y(v) - pad, 10);

        // ---------- Horizontal (Ethnicity) ----------
        if (isHorizontal) {
            const value = (d) => (d.value1 || 0) + (d.value2 || 0);
            const color = topStackColor || THEME.colors.ethnicity;

            const x = d3.scaleLinear()
                .domain([0, (d3.max(data, value) || 0)])
                .nice()
                .range([0, width]);

            const y = d3.scaleBand()
                .domain(data.map((d) => d.group))
                .range([0, height])
                .padding(0.25);

            // Grid: vertical lines only
            const gridG = g.append('g')
                .call(d3.axisBottom(x).ticks(6).tickSize(height).tickFormat(''));
            gridG.selectAll('line').attr('stroke', THEME.grid);
            gridG.select('.domain').attr('stroke', 'none');

            // X axis
            const xAx = g.append('g')
                .attr('transform', `translate(0,${height})`)
                .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')).tickSizeOuter(0));
            xAx.selectAll('text')
                .style('font-size', THEME.axis.fontSize)
                .style('fill', THEME.axis.tick);
            xAx.selectAll('line').attr('stroke', THEME.axis.domain).attr('y2', 6);
            xAx.select('.domain').attr('stroke', THEME.axis.domain);

            // Y axis (wrapped labels)
            const yAx = g.append('g').call(d3.axisLeft(y).tickSizeOuter(0));
            const yLabelMaxWidth = showYAxisTitle ? margin.left - 50 : (margin.left - 25);
            yAx.selectAll('text')
                .style('font-size', THEME.axis.fontSizeYHorizontal)
                .style('fill', THEME.axis.tick)
                .call(wrapAxisLabelsLimited, yLabelMaxWidth, 2, true);

            // Add tooltip only when truncated; also set cursor conditionally
            yAx.selectAll('text')
                .each(function () {
                    const t = d3.select(this);
                    const isTruncated = !!t.attr('data-truncated');
                    t.style('cursor', isTruncated ? 'pointer' : 'default');
                })
                .on('mouseover', function (e) {
                    const t = d3.select(this);
                    if (t.attr('data-truncated')) showTip(e, t.attr('data-fulltext'));
                })
                .on('mousemove', function (e) {
                    const t = d3.select(this);
                    if (t.attr('data-truncated')) moveTip(e);
                })
                .on('mouseout', function () {
                    const t = d3.select(this);
                    if (t.attr('data-truncated')) hideTip();
                });

            yAx.selectAll('line').attr('stroke', 'none');
            yAx.select('.domain').attr('stroke', THEME.axis.domain);


            // Bars
            g.selectAll('.bar-h')
                .data(data).enter().append('rect')
                .attr('x', 0)
                .attr('y', (d) => y(d.group))
                .attr('height', (d) => y.bandwidth())
                .attr('width', (d) => x(value(d)))
                .attr('fill', color)
                .attr('stroke', 'none')
                .on('mouseover', (e, d) => showTip(e, d, null))
                .on('mousemove', moveTip)
                .on('mouseout', hideTip);

            // End-value labels
            g.selectAll('.label-h')
                .data(data).enter().append('text')
                .text((d) => value(d))
                .attr('x', (d) => x(value(d)) + 10)
                .attr('y', (d) => y(d.group) + y.bandwidth() / 2)
                .attr('dy', '0.35em')
                .style('font-size', THEME.label.fontSize)
                .style('fill', THEME.label.fill);

            // Axis titles
            if (showYAxisTitle && yAxisTitle) {
                g.append('text')
                    .attr('transform', 'rotate(-90)')
                    .attr('x', -height / 2)
                    .attr('y', -margin.left + 34)
                    .attr('text-anchor', 'middle')
                    .style('font-size', 12)
                    .style('fill', THEME.axis.tick)
                    .text(yAxisTitle);
            }
            if (showXAxisTitle && xAxisTitle) {
                g.append('text')
                    .attr('x', width / 2)
                    .attr('y', height + 38)
                    .attr('text-anchor', 'middle')
                    .style('font-size', 12)
                    .style('fill', THEME.axis.tick)
                    .text(xAxisTitle);
            }

            return () => {
                // remove tooltip div if it exists
                d3.selectAll(`.cohort-tooltip.${instanceId}`).remove();

                // detach global listeners
                d3.select('body').on(`click.cohortTooltip.${instanceId}`, null);
                d3.select(window).on(`keydown.cohortTooltip.${instanceId}`, null);
                d3.select(svgRef.current).on(`mouseenter.cohortTooltip.${instanceId}`, null);
                d3.select(svgRef.current).on(`mouseleave.cohortTooltip.${instanceId}`, null);
                if (_unpinTimer) clearTimeout(_unpinTimer);
            };
        }

        // ---------- Vertical (Stacked / Single) ----------
        const x = d3.scaleBand()
            .domain(data.map((d) => d.group))
            .range([0, width])
            .padding(0.3);

        const yMaxRaw = d3.max(
            data,
            (d) => (chartType === 'stacked' ? (d.value1 || 0) + (d.value2 || 0) : (d.value1 || 0))
        ) || 0;

        const yDomainMax = yMaxRaw === 0 ? 1 : Math.ceil(yMaxRaw * 1.1);

        const y = d3.scaleLinear()
            .domain([0, yDomainMax])
            .nice()
            .range([height, 0]);

        const hoverStrokeWidth = 3;
        const baseDimMap = new WeakMap();

        const baseDims = {
            female: (d) => ({
                x: x(d.group),
                y: y(d.value2 || 0),
                width: x.bandwidth(),
                height: y(0) - y(d.value2 || 0)
            }),
            male: (d) => ({
                x: x(d.group),
                y: y((d.value1 || 0) + (d.value2 || 0)),
                width: x.bandwidth(),
                height: y(0) - y(d.value1 || 0)
            }),
            single: (d) => ({
                x: x(d.group),
                y: y(d.value1 || 0),
                width: x.bandwidth(),
                height: y(0) - y(d.value1 || 0)
            })
        };

        const insetStroke = (selection, color) => {
            const dims = baseDimMap.get(selection.node());
            if (!dims) return;
            selection
                .attr('stroke', color)
                .attr('stroke-width', hoverStrokeWidth)
                .attr('x', dims.x + hoverStrokeWidth / 2)
                .attr('y', dims.y + hoverStrokeWidth / 2)
                .attr('width', Math.max(0, dims.width - hoverStrokeWidth))
                .attr('height', Math.max(0, dims.height - hoverStrokeWidth));
        };

        const clearStroke = (selection) => {
            const dims = baseDimMap.get(selection.node());
            if (!dims) return;
            selection
                .attr('stroke', 'none')
                .attr('stroke-width', null)
                .attr('x', dims.x)
                .attr('y', dims.y)
                .attr('width', dims.width)
                .attr('height', dims.height);
        };

        // --- Vertical GRID (keep Y-axis ticks; remove only top gridline) ---
        const intTicks = (max) => {
            if (max <= 10) return d3.range(0, max + 1, 1);
            const step = Math.max(1, Math.round(max / 6));
            return d3.range(0, max + 1, step);
        };

        const gridAxis = d3.axisLeft(y)
            .tickValues(intTicks(yDomainMax))
            .tickSize(-width)
            .tickSizeOuter(0)
            .tickFormat('');

        const gridG = g.append('g').call(gridAxis);
        gridG.selectAll('line')
            .attr('stroke', THEME.grid)
            .attr('shape-rendering', 'crispEdges');
        gridG.select('.domain').remove();
        gridG.selectAll('.tick')
            .filter((d) => d === yDomainMax)
            .select('line')
            .attr('stroke', 'none');

        // X-axis
        const xAxV = g.append('g')
            .attr('transform', `translate(0,${height})`)
            .call(d3.axisBottom(x));
        xAxV.selectAll('text')
            .attr('text-anchor', 'middle')
            .attr('x', 0).attr('y', 15).attr('dy', '0.35em')
            .style('font-size', THEME.axis.fontSize)
            .style('fill', THEME.axis.tick)
            .call(wrapAxisLabelsLimited, x.bandwidth() - 4, 2, false);
        xAxV.select('.domain').attr('stroke', THEME.axis.domain);

        // Y-axis (integer ticks kept visible)
        const yAxV = g.append('g').call(makeIntAxisLeft(y, yDomainMax));
        yAxV.selectAll('text')
            .style('font-size', THEME.axis.fontSize)
            .style('fill', THEME.axis.tick);
        yAxV.select('.domain').attr('stroke', THEME.axis.domain);

        if (chartType === 'stacked') {
            const maleColor = topStackColor || THEME.colors.male;
            const femaleColor = bottomStackColor || THEME.colors.female;
            const maleHoverStroke = THEME.hoverStroke.male;
            const femaleHoverStroke = THEME.hoverStroke.female;

            g.selectAll('.bar-female')
                .data(data).enter().append('rect')
                .attr('x', (d) => x(d.group))
                .attr('y', (d) => y(d.value2 || 0))
                .attr('height', (d) => y(0) - y(d.value2 || 0))
                .attr('width', x.bandwidth())
                .attr('fill', femaleColor)
                .attr('stroke', 'none')
                .each(function (d) { baseDimMap.set(this, baseDims.female(d)); })
                .on('mouseover', (e, d) => {
                    insetStroke(d3.select(e.currentTarget), femaleHoverStroke);
                    showTip(e, d, 'secondary');
                })
                .on('mousemove', moveTip)
                .on('mouseout', function () {
                    if (_pinnedSelection !== this) {
                        clearStroke(d3.select(this));
                    }
                    hideTip();
                })
                .on('click', (e,d) => pinTip(e, d, 'secondary'));

            g.selectAll('.bar-male')
                .data(data).enter().append('rect')
                .attr('x', (d) => x(d.group))
                .attr('y', (d) => y((d.value1 || 0) + (d.value2 || 0)))
                .attr('height', (d) => y(0) - y(d.value1 || 0))
                .attr('width', x.bandwidth())
                .attr('fill', maleColor)
                .attr('stroke', 'none')
                .each(function (d) { baseDimMap.set(this, baseDims.male(d)); })
                .on('mouseover', (e, d) => {
                    insetStroke(d3.select(e.currentTarget), maleHoverStroke);
                    showTip(e, d, 'primary');
                })
                .on('mousemove', moveTip)
                .on('mouseout', function () {
                    if (_pinnedSelection !== this) {
                        clearStroke(d3.select(this));
                    }
                    hideTip();
                })
                .on('click', (e,d) => pinTip(e, d, 'primary'));

            if (showLabelOnBar) {
                g.selectAll('.label-female')
                    .data(data).enter().append('text')
                    .filter((d) => (d.value2 || 0) > 0)
                    .text((d) => d.value2)
                    .attr('x', (d) => x(d.group) + x.bandwidth() / 2)
                    .attr('y', (d) => y((d.value2 || 0) / 2))
                    .attr('text-anchor', 'middle')
                    .attr('dy', '0.35em')
                    .style('fill', '#FFFFFF')
                    .style('font-size', 12);

                g.selectAll('.label-male')
                    .data(data).enter().append('text')
                    .filter((d) => (d.value1 || 0) > 0)
                    .text((d) => d.value1)
                    .attr('x', (d) => x(d.group) + x.bandwidth() / 2)
                    .attr('y', (d) => y((d.value2 || 0) + (d.value1 || 0) / 2))
                    .attr('text-anchor', 'middle')
                    .attr('dy', '0.35em')
                    .style('fill', '#FFFFFF')
                    .style('font-size', 12);
            }

            g.selectAll('.label-total')
                .data(data).enter().append('text')
                .filter((d) => ((d.value1 || 0) + (d.value2 || 0)) > 0)
                .text((d) => (d.value1 || 0) + (d.value2 || 0))
                .attr('x', (d) => x(d.group) + x.bandwidth() / 2)
                .attr('y', (d) => y((d.value1 || 0) + (d.value2 || 0)) - 6)
                .attr('text-anchor', 'middle')
                .style('fill', THEME.label.fill)
                .style('font-size', THEME.label.fontSize);
        } else {
            // Single-series (Hardy)
            const color = topStackColor || THEME.colors.hardy;
            const hardyHoverStroke = THEME.hoverStroke.hardy;

            g.selectAll('.bar-single')
                .data(data).enter().append('rect')
                .attr('x', (d) => x(d.group))
                .attr('y', (d) => y(d.value1 || 0))
                .attr('height', (d) => y(0) - y(d.value1 || 0))
                .attr('width', x.bandwidth())
                .attr('fill', color)
                .attr('stroke', 'none')
                .each(function (d) { baseDimMap.set(this, baseDims.single(d)); })
                .on('mouseover', (e, d) => {
                    if ((d.value1 || 0) > 0) {
                        insetStroke(d3.select(e.currentTarget), hardyHoverStroke);
                        showTip(e, d, null);
                    }
                })
                .on('mousemove', moveTip)
                .on('mouseout', function () {
                    if (_pinnedSelection !== this) {
                        clearStroke(d3.select(this));
                    }
                    hideTip();
                })
                .on('click', (e, d) => { if ((d.value1 || 0) > 0) { pinTip(e, d, null); } });

            g.selectAll('.label-single')
                .data(data).enter().append('text')
                .filter((d) => (d.value1 || 0) > 0)
                .text((d) => d.value1 || 0)
                .attr('x', (d) => x(d.group) + x.bandwidth() / 2)
                .attr('y', (d) => labelY(d.value1 || 0))
                .attr('text-anchor', 'middle')
                .style('fill', THEME.label.fill)
                .style('font-size', THEME.label.fontSize);
        }

        // Axis titles (vertical)
        if (showYAxisTitle && yAxisTitle) {
            g.append('text')
                .attr('transform', 'rotate(-90)')
                .attr('x', -height / 2)
                .attr('y', -margin.left + 34)
                .attr('text-anchor', 'middle')
                .style('font-size', 12)
                .style('fill', THEME.axis.tick)
                .text(yAxisTitle);
        }
        if (showXAxisTitle && xAxisTitle) {
            g.append('text')
                .attr('x', (width / 2) - 14)
                .attr('y', height + 48)
                .attr('text-anchor', 'middle')
                .style('font-size', 12)
                .style('fill', THEME.axis.tick)
                .text(xAxisTitle);
        }

        return () => {
            // remove tooltip div if it exists
            d3.selectAll(`.cohort-tooltip.${instanceId}`).remove();

            // detach global listeners
            d3.select('body').on(`click.cohortTooltip.${instanceId}`, null);
            d3.select(window).on(`keydown.cohortTooltip.${instanceId}`, null);
            d3.select(svgRef.current).on(`mouseenter.cohortTooltip.${instanceId}`, null);
            d3.select(svgRef.current).on(`mouseleave.cohortTooltip.${instanceId}`, null);
            if (_unpinTimer) clearTimeout(_unpinTimer);
        };
    }, [data, effectiveWidth, chartHeight, chartType, topStackColor, bottomStackColor, showLegend, showLabelOnBar, title, xAxisTitle, yAxisTitle, loading]);

    return (
        <div ref={outerRef} className="donor-cohort-view-chart" style={{ height: chartHeight }}>
            <svg ref={svgRef} />

            {/* Title + info icon (centered) */}
            <ChartTitle title={title} popover={popover} />

            {/* Loading overlay */}
            {loading && (
                <div className="loading">
                    <i className="icon icon-spin icon-circle-notch fas" />
                    {/* screen-reader only text */}
                    <span className="visually-hidden">
                        Loading
                    </span>
                </div>
            )}

            {!loading && (!data || (Array.isArray(data) && (data.length === 0 || data[0].total === 0))) && (
                <div className="no-data">
                    <span className="text-secondary">No data available</span>
                </div>
            )}

            {/* {!session && (
                <div className="login-required">
                    <span className="text-secondary">Login required to view</span>
                </div>
            )} */}

            {/* Legend (vertical, compact) */}
            {chartType === 'stacked' && showLegend && (
                <div className="legend-container" style={{ border: `1px solid ${THEME.panel.stroke}` }}>
                    <div className="legend-title">
                        {legendTitle}
                    </div>

                    <div className="legend-content">
                        <div className="legend-item">
                            <span className="color-box" style={{ background: topStackColor || THEME.colors.male }} />
                            <span className="value">Male</span>
                        </div>

                        <div className="legend-item">
                            <span className="color-box" style={{ background: bottomStackColor || THEME.colors.female }} />
                            <span className="value">Female</span>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default DonorCohortViewChart;
