import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { Popover, PopoverHeader, PopoverBody, Overlay } from 'react-bootstrap';
import { PlotPopoverContent, addPaddingToExtend, removeToolName } from './utils';

export const BoxPlot = ({
    plotId,
    data,
    qcField,
    qcCategory = 'submission_center',
    xAxisLabel = 'Submission Center',
    customExtent,
    customFormat,
    customFilter,
    title = 'Untitled Box Plot',
    thresholdMarks = [],
    updateHighlightedBam,
    rerenderNumber = 0,
    handleShowModal,
}) => {
    const [showOverlay, setShowOverlay] = useState(false);
    const overlayTarget = useRef(null);
    const { viz_info, qc_info, qc_results } = data;
    const isDrawn = useRef(false);
    const oldRerenderNumber = useRef(rerenderNumber);

    // Assign a new ref to the popover target
    const handleShowOverlay = (e, d) => {
        const targetId = e.target.getAttribute('data-point-index');
        const boxPlot = d3.select('#boxplot-svg' + '-' + plotId);

        overlayTarget.current = {
            node: boxPlot.select(`[data-point-index='${targetId}']`).node(),
            data: d,
        };
        setShowOverlay(true);
    };

    const containerRef = useRef(null);

    // Specify the dimensions of the chart.
    const chartWidth = 928;
    const chartHeight = 700;
    const margins = {
        top: 50,
        right: 50,
        bottom: 100,
        left: 100,
    };

    useEffect(() => {
        let doRerender = false;
        if (oldRerenderNumber.current !== rerenderNumber) {
            oldRerenderNumber.current = rerenderNumber;
            doRerender = true;
        }

        if (!isDrawn.current || doRerender) {
            const container = d3.select(containerRef.current);
            container.selectAll('*').remove();
            // Create the SVG containers
            const svgContainer = container
                .append('svg')
                .attr('id', 'boxplot-svg' + '-' + plotId)
                .attr('class', 'boxplot-svg')
                .attr('width', chartWidth)
                .attr('height', chartHeight)
                .attr('viewBox', [0, 0, chartWidth, chartHeight])
                .attr(
                    'style',
                    'max-width: 100%; height: auto; font: 10px Inter, sans-serif;overflow:visible;'
                )
                .attr('text-anchor', 'middle');

            // Add title to the chart
            svgContainer
                .append('text')
                .text(title)
                .attr('text-anchor', 'middle')
                .attr(
                    'style',
                    'font-family: Inter; font-size: 1.5rem; font-weight: 600'
                )
                .attr('x', chartWidth / 2)
                .attr('y', margins.top / 2);

            // Add labels to the Y and X axes
            svgContainer
                .append('text')
                .attr(
                    'transform',
                    'translate(' +
                        20 +
                        ',' +
                        (margins.top +
                            (chartHeight - margins.top - margins.bottom) / 2) +
                        '), rotate(-90)'
                )
                .attr('text-anchor', 'middle')
                .attr('style', 'font-family: Inter; font-size: 1.5rem')
                .text(removeToolName(qc_info[qcField].key));

            svgContainer
                .append('text')
                .attr(
                    'transform',
                    'translate(' +
                        (margins.left +
                            (chartWidth - margins.left - margins.right) / 2) +
                        ',' +
                        (chartHeight - 35) +
                        ')'
                )
                .attr('text-anchor', 'middle')
                .attr('style', 'font-family: Inter; font-size: 1.5rem')
                .text(xAxisLabel);

            // Create the SVG group for the chart
            const svg = svgContainer.append('g').attr('class', 'chartBody');

            // Append definitions for use in SVG
            let defs = svg.append('defs');

            // Instantiate clip paths for the chart content and axes
            defs.append('clipPath')
                .attr('id', 'clip-' + plotId)
                .append('rect')
                .attr('x', margins.left)
                .attr('y', margins.top)
                .attr('width', chartWidth - margins.left - margins.right)
                .attr('height', chartHeight - margins.top - margins.bottom);

            defs.append('clipPath')
                .attr('id', 'clipx-' + plotId)
                .append('rect')
                .attr('x', 0)
                .attr('y', chartHeight - margins.bottom)
                .attr('width', chartWidth - margins.left - margins.right)
                .attr('height', margins.bottom / 2)
                .attr('transform', 'translate(' + margins.left + ',0)');

            defs.append('clipPath')
                .attr('id', 'clipy-' + plotId)
                .append('rect')
                .attr('x', 0)
                .attr('y', margins.top)
                .attr('width', margins.left + 5)
                .attr(
                    'height',
                    chartHeight - margins.top - margins.bottom + 20
                );

            // Filter data by specific quality metric and map to the values
            const filteredData = qc_results.filter((d) => {
                // Use custom filter if provided
                if (customFilter) {
                    return customFilter(d);
                }
                //const value = d?.quality_metrics["qc_values"][qcField]["value"];
                return d;
            });

            // Get minimum and maximum values for the quality metric
            let extent =
                customExtent ??
                d3.extent(
                    filteredData,
                    (d) => d.quality_metrics.qc_values[qcField]['value']
                );
            // add padding to the extent
            if (!customExtent) {
                extent = addPaddingToExtend(extent);
            }

            // Group data by the QC category
            let groupedData = d3.rollup(
                filteredData,
                (d) => {
                    const q1 = d3.quantile(
                        d
                            .map(function (g) {
                                const value =
                                    g.quality_metrics.qc_values[qcField][
                                        'value'
                                    ];
                                return value;
                            })
                            .sort(d3.ascending),
                        0.25
                    );
                    const median = d3.quantile(
                        d
                            .map(function (g) {
                                const value =
                                    g.quality_metrics.qc_values[qcField][
                                        'value'
                                    ];
                                return value;
                            })
                            .sort(d3.ascending),
                        0.5
                    );
                    const q3 = d3.quantile(
                        d
                            .map(function (g) {
                                return g
                                    .quality_metrics.qc_values[qcField]['value'];
                            })
                            .sort(d3.ascending),
                        0.75
                    );

                    // Calculate the min and max point in the group
                    const [minVal, maxVal] = d3.extent(
                        d,
                        (g) => g.quality_metrics.qc_values[qcField]['value']
                    );

                    const interQuantileRange = q3 - q1;

                    // Minimum/Maximum value or 1.5 * IQR
                    const min = Math.max(q1 - 1.5 * interQuantileRange, minVal);
                    const max = Math.min(q3 + 1.5 * interQuantileRange, maxVal);

                    return {
                        q1,
                        median,
                        q3,
                        interQuantileRange,
                        ex_min: q1 - 1.5 * interQuantileRange,
                        min,
                        max,
                        length: d.length,
                    };
                },
                (d) => d[qcCategory]
            );

            const x = d3
                .scaleBand()
                .domain(Array.from(groupedData.keys()).sort())
                .range([0, chartWidth - margins.left - margins.right]);

            // Define a width for the box plot depending on the number of groups
            const boxWidth = Math.min(80, x.bandwidth() / 2);
            const endLineWidth = boxWidth / 2;

            const xAxis = d3
                .axisBottom(x)
                .ticks(groupedData.size)
                .tickSizeOuter(0);

            const gXContainer = svg
                .append('g')
                .attr('clip-path', `url(#clipx-${plotId})`);

            const gX = gXContainer
                .append('g')
                .attr(
                    'transform',
                    'translate(' +
                        margins.left +
                        ', ' +
                        (chartHeight - margins.bottom) +
                        ')'
                )
                .attr('style', 'font-family: Inter; font-size: 1.2rem')
                .call(xAxis);

            const y = d3
                .scaleLinear()
                .domain(extent)
                .range([chartHeight - margins.bottom, margins.top]);

            const yAxis = d3
                .axisLeft(y)
                .ticks(5)
                .tickFormat((d) => {
                    if (customFormat) {
                        return customFormat(d);
                    }
                    return d;
                })
                .tickSizeOuter(0);

            const gYContainer = svg
                .append('g')
                .attr('clip-path', `url(#clipy-${plotId})`);

            const gY = gYContainer
                .append('g')
                .attr('transform', 'translate(' + margins.left + ',0)')
                .attr('style', 'font-family: Inter; font-size: 1.2rem')
                .call(yAxis);

            // Group for content inside of the graph
            const svgContent = svg
                .append('g')
                .attr('clip-path', `url(#clip-${plotId})`)
                .attr('id', 'content');

            // Anchor the content group to cover the entire chart
            svgContent
                .append('rect')
                .attr('x', margins.left)
                .attr('y', margins.top)
                .attr('width', chartWidth - margins.left - margins.right)
                .attr('height', chartHeight - margins.top - margins.bottom)
                .attr('fill', 'transparent');

            const plotElements = svgContent
                .append('g')
                .attr('id', 'plotElements');

            // Add vertical lines
            plotElements
                .selectAll('.vertLines')
                .data(groupedData)
                .enter()
                .append('line')
                .attr('x1', (d) => {
                    return x(d[0]) + margins.left + x.bandwidth() / 2;
                })
                .attr('x2', (d) => x(d[0]) + margins.left + x.bandwidth() / 2)
                .attr('y1', (d) => y(d[1].min))
                .attr('y2', (d) => y(d[1].max))
                .attr('stroke', 'black')
                .attr('stroke-width', 2);

            // Add horizontal lines at ends of vertical lines
            plotElements
                .selectAll('.endLinesBottom')
                .data(groupedData)
                .enter()
                .append('line')
                .attr('stroke', 'black')
                .attr('stroke-width', 1)
                .attr(
                    'x1',
                    (d) =>
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 -
                        endLineWidth / 2
                )
                .attr(
                    'x2',
                    (d) =>
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 +
                        endLineWidth / 2
                )
                .attr('y1', (d) => y(d[1].min))
                .attr('y2', (d) => y(d[1].min))
                .on('mouseover', function (e, d) {
                    // console.table(d);
                });

            plotElements
                .selectAll('.endLinesTop')
                .data(groupedData)
                .enter()
                .append('line')
                .attr('stroke', 'black')
                .attr('stroke-width', 1)
                .attr(
                    'x1',
                    (d) =>
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 -
                        endLineWidth / 2
                )
                .attr(
                    'x2',
                    (d) =>
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 +
                        endLineWidth / 2
                )
                .attr('y1', (d) => y(d[1].max))
                .attr('y2', (d) => y(d[1].max));

            // Add boxes
            plotElements
                .selectAll('.boxes')
                .data(groupedData)
                .enter()
                .append('rect')
                .attr('x', (d) => {
                    // console.log('d: ', d);
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 -
                        boxWidth / 2
                    );
                    // x(d[0]) + margins.left + x.bandwidth() / 2 - boxWidth / 2;
                })
                .attr('y', (d) => y(d[1].q3))
                .attr('height', (d) => y(d[1].q1) - y(d[1].q3))
                .attr('width', boxWidth)
                .attr('stroke', 'black')
                .attr('fill', '#D3D3D3');

            plotElements
                .selectAll('.medianLines')
                .data(groupedData)
                .enter()
                .append('line')
                .attr('y1', (d) => y(d[1].median))
                .attr('y2', (d) => y(d[1].median))
                .attr('x1', (d) => {
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 -
                        boxWidth / 2
                    );
                })
                .attr('x2', (d) => {
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 +
                        boxWidth / 2
                    );
                })
                .attr('stroke', 'black')
                .attr('stroke-width', 2);

            plotElements
                .selectAll('.firstQuartileLine')
                .data(groupedData)
                .enter()
                .append('line')
                .attr('y1', (d) => y(d[1].q1))
                .attr('y2', (d) => y(d[1].q1))
                .attr('x1', (d) => {
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 -
                        boxWidth / 2
                    );
                })
                .attr('x2', (d) => {
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 +
                        boxWidth / 2
                    );
                })
                .attr('stroke', 'black')
                .attr('stroke-width', 1);

            // Third quartile line
            plotElements
                .selectAll('.thirdQuartileLine')
                .data(groupedData)
                .enter()
                .append('line')
                .attr('y1', (d) => y(d[1].q3))
                .attr('y2', (d) => y(d[1].q3))
                .attr('x1', (d) => {
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 -
                        boxWidth / 2
                    );
                })
                .attr('x2', (d) => {
                    return (
                        x(d[0]) +
                        margins.left +
                        x.bandwidth() / 2 +
                        boxWidth / 2
                    );
                })
                .attr('stroke', 'black')
                .attr('stroke-width', 1);

            // Define the jitter width for the points
            const jitterWidth = x.bandwidth() / 4;

            // Add horizontal threshold marker lines
            plotElements
                .selectAll('.horizontalThresholdLines')
                .data(thresholdMarks?.horizontal ?? [])
                .enter()
                .append('line')
                .attr('x1', margins.left)
                .attr('x2', chartWidth - margins.right)
                .attr('y1', (d) => y(d.value))
                .attr('y2', (d) => y(d.value))
                .attr('stroke-dasharray', '5,5')
                .attr('stroke', (d) => d.fill);

            // Add vertical threshold marker lines

            plotElements
                .selectAll('.verticalThresholdLines')
                .data(thresholdMarks?.vertical ?? [])
                .enter()
                .append('line')
                .attr('x1', (d) => x(d.value))
                .attr('x2', (d) => x(d.value))
                .attr('y1', y(extent[0]))
                .attr('y2', y(extent[1]))
                .attr('stroke-dasharray', '5,5')
                .attr('stroke', (d) => d.fill);

            // Append all points
            const gPoints = plotElements
                .selectAll('.dataPoint')
                .data(filteredData)
                .enter()
                .append('circle')
                .attr('class', (d, i) => {
                    return 'data-point';
                })
                .attr('data-point-index', (d, i) => {
                    d['data-point-index'] = d['file_accession'];
                    return d['file_accession'];
                })
                .attr('cy', (d) => {
                    const value = d.quality_metrics.qc_values[qcField]['value'];
                    return y(value);
                })
                .attr(
                    'cx',
                    (d) =>
                        x(d[qcCategory]) +
                        margins.left +
                        x.bandwidth() / 2 +
                        Math.random() * jitterWidth -
                        jitterWidth / 2
                )
                .attr('r', 6)
                .attr('fill', (d) => {
                    return 'rgba(199, 205, 255, 0.5)';
                })
                .attr('stroke', 'black')
                .on('click', function (e, d) {
                    handleShowModal(d);
                })
                .on('mouseover', function (e, d) {
                    // Trigger overlay on hover
                    handleShowOverlay(e, d);
                    updateHighlightedBam(d['file_accession']);
                })
                .on('mouseout', function () {
                    setShowOverlay(false);
                    // d3.select('#popover-boxplot')
                    //     .style('opacity', 0)
                    //     .style('left', '-100vw')
                    //     .style('top', '0px');
                    updateHighlightedBam(null);
                });

            // Zoom and panning behavior
            const zoom = d3
                .zoom()
                .scaleExtent([1, 10])
                .translateExtent([
                    [0, 0],
                    [chartWidth, chartHeight],
                ])
                .filter(filter)
                .on('zoom', zoomed);

            svgContent.call(zoom).node();

            const initialXRange = x.range();
            const initialBandwidth = x.bandwidth();

            function zoomed({ transform: t }) {
                plotElements.attr('transform', t);

                gX.attr(
                    'transform',
                    d3.zoomIdentity
                        .translate(
                            t.x + margins.left * t.k, // Must scale left margin as well
                            chartHeight - margins.bottom
                        )
                        .scale(t.k)
                );
                gX.selectAll('text').attr(
                    'transform',
                    d3.zoomIdentity.scale(1 / t.k)
                );
                gX.selectAll('path.domain').attr('stroke-width', 1 / t.k);
                gX.selectAll('line').attr(
                    'transform',
                    d3.zoomIdentity.scale(1 / t.k)
                );

                gY.attr(
                    'transform',
                    d3.zoomIdentity.translate(margins.left, t.y).scale(t.k)
                );
                gY.selectAll('text').attr(
                    'transform',
                    d3.zoomIdentity.scale(1 / t.k)
                );
                gY.selectAll('path.domain').attr('stroke-width', 1 / t.k);
                gY.selectAll('line').attr(
                    'transform',
                    d3.zoomIdentity.scale(1 / t.k)
                );

                gY.call(yAxis.ticks(5 * t.k));
            }

            // prevent scrolling then apply the default filter
            function filter(event) {
                event.preventDefault();
                return (
                    (!event.ctrlKey || event.type === 'wheel') && !event.button
                );
            }

            // Cleanup function to prevent rerender
            return () => {
                isDrawn.current = true;
            };
        }
    });

    // In some edge cases, when switching the assay, this might not be available.
    const overlayTargetQcField =
        overlayTarget.current?.data?.quality_metrics.qc_values[qcField];
    const overlayTargetValue = overlayTargetQcField?.value;

    return (
        <div className="boxplot-canvas" ref={containerRef}>
            <Overlay
                target={overlayTarget?.current?.node}
                show={showOverlay}
                placement="bottom"
                flip={true}>
                <Popover id="popover-boxplot" className="popover-d3-plot">
                    <PopoverHeader>
                        {/* {qc_info[qcField].key}: */}
                        {new Intl.NumberFormat().format(
                            overlayTargetValue || 0
                        )}
                    </PopoverHeader>
                    <PopoverBody>
                        <PlotPopoverContent
                            vizInfo={viz_info}
                            data={overlayTarget?.current?.data}
                        />
                    </PopoverBody>
                </Popover>
            </Overlay>
        </div>
    );
};
