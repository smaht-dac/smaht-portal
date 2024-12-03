import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { Popover, PopoverHeader, PopoverBody, Overlay } from 'react-bootstrap';

const BoxPlotPopoverContent = ({ qc_info, data = null }) => {
    // console.log('data: ', data);

    let metrics = [];
    for (let key in data) {
        // console.log('key: ', key, typeof data[key]);
        if (typeof data[key] === 'string') {
            //     console.log(key, data[key]);
            metrics = metrics.concat([{ key, value: data[key] }]);
        }
    }
    // console.log('metrics: ', metrics);

    return data ? (
        <div className="boxplot-popover-content">
            {metrics.map((metric, i) => {
                return (
                    <div className="data-row" key={i}>
                        <div className="label">
                            <span>{metric.key}</span>
                        </div>
                        <div className="value">
                            <span>{metric.value}</span>
                        </div>
                    </div>
                );
            })}
            {/* <div className="data-row">
                <div className="label">
                    <span>Submission Center</span>
                </div>
                <div className="value">
                    <span>{data.submission_center}</span>
                </div>
            </div> */}
        </div>
    ) : null;
};

export const BoxPlot = ({
    plotId,
    data,
    QCField,
    getQCCategory = (d) => d.submission_center,
    xAxisLabel = 'Submission Center',
    customExtent,
    customFormat,
    customFilter,
    title = 'Untitled Box Plot',
    thresholds_marks = [],
}) => {
    const [showOverlay, setShowOverlay] = useState(false);
    const overlayTarget = useRef(null);
    const { qc_info, qc_results } = data;
    const isDrawn = useRef(false);

    // Assign a new ref to the popover target
    const handleShowOverlay = (e, d) => {
        const targetId = e.target.getAttribute('data-point-index');

        // console.log('target ');
        // console.log('overlay props', e, d);
        // console.log(
        //     overlayTarget?.current?.data['data-point-index'],
        //     d['data-point-index']
        // );

        const boxPlot = d3.select('#boxplot-svg' + '-' + plotId);
        // console.log(
        //     'boxPlot point: ',
        //     boxPlot.select(`[data-point-index='${d['data-point-index']}']`)
        // );

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

    // Define a width for the box plot
    const boxWidth = 80;
    const endLineWidth = boxWidth / 2;

    useEffect(() => {
        if (!isDrawn.current) {
            const container = d3.select(containerRef.current);

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
                .attr('style', 'font-family: Inter; font-size: 1.5rem')
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
                .attr('style', 'font-family: Inter; font-size: 1rem')
                .text(qc_info[QCField].key);

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
                .attr('style', 'font-family: Inter; font-size: 1rem')
                .text(xAxisLabel);

            // Create the SVG group for the chart
            const svg = svgContainer.append('g').attr('class', 'chartBody');

            // Append definitions for use in SVG
            let defs = svg.append('defs');

            // Instantiate clip paths for the chart content and axes
            defs.append('clipPath')
                .attr('id', 'clip')
                .append('rect')
                .attr('x', margins.left)
                .attr('y', margins.top)
                .attr('width', chartWidth - margins.left - margins.right)
                .attr('height', chartHeight - margins.top - margins.bottom);

            defs.append('clipPath')
                .attr('id', 'clipx')
                .append('rect')
                .attr('x', 0)
                .attr('y', chartHeight - margins.bottom)
                .attr('width', chartWidth - margins.left - margins.right)
                .attr('height', margins.bottom / 2)
                .attr('transform', 'translate(' + margins.left + ',0)');

            defs.append('clipPath')
                .attr('id', 'clipy')
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
                const value = d?.quality_metrics[QCField];
                return value;
            });

            // Log the data being used
            // console.log('Data for', QCField, ': ', filteredData);

            // Get minimum and maximum values for the quality metric
            let extent =
                customExtent ??
                d3.extent(filteredData, (d) => d.quality_metrics[QCField]);

            // Group data by the QC category
            let groupedData = d3.rollup(
                filteredData,
                (d) => {
                    const q1 = d3.quantile(
                        d
                            .map(function (g) {
                                const value = g.quality_metrics[QCField];
                                // if (value < 0) console.log('value under 0', g);
                                return value;
                            })
                            .sort(d3.ascending),
                        0.25
                    );
                    const median = d3.quantile(
                        d
                            .map(function (g) {
                                const value = g.quality_metrics[QCField];
                                // if (value < 0) console.log('value under 0', g);
                                return value;
                            })
                            .sort(d3.ascending),
                        0.5
                    );
                    const q3 = d3.quantile(
                        d
                            .map(function (g) {
                                return g.quality_metrics[QCField];
                            })
                            .sort(d3.ascending),
                        0.75
                    );

                    // Calculate the min and max point in the group
                    const [minVal, maxVal] = d3.extent(
                        d,
                        (g) => g.quality_metrics[QCField]
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
                getQCCategory
            );

            // console.log('grouped: ', groupedData);

            const x = d3
                .scaleBand()
                .domain(Array.from(groupedData.keys()).sort())
                .range([0, chartWidth - margins.left - margins.right]);

            const xAxis = d3
                .axisBottom(x)
                .ticks(groupedData.size)
                .tickSizeOuter(0);

            const gXContainer = svg
                .append('g')
                .attr('clip-path', 'url(#clipx)');

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
                .attr('style', 'font-family: Inter; font-size: 0.875rem')
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
                .attr('clip-path', 'url(#clipy)');

            const gY = gYContainer
                .append('g')
                .attr('transform', 'translate(' + margins.left + ',0)')
                .attr('style', 'font-family: Inter; font-size: 0.875rem')
                .call(yAxis);

            // Group for content inside of the graph
            const svgContent = svg
                .append('g')
                .attr('clip-path', 'url(#clip)')
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
                    // console.log('x1: ', x(d[0]));
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
                .data(thresholds_marks?.horizontal ?? [])
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
                .data(thresholds_marks?.vertical ?? [])
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
                .attr('class', 'data-point')
                .attr('data-point-index', (d, i) => {
                    const pointId = i;
                    d['data-point-index'] = pointId;
                    return pointId;
                })
                .attr('cy', (d) => {
                    const value = d.quality_metrics[QCField];
                    return y(value);
                })
                .attr(
                    'cx',
                    (d) =>
                        x(getQCCategory(d)) +
                        margins.left +
                        x.bandwidth() / 2 +
                        Math.random() * jitterWidth -
                        jitterWidth / 2
                )
                .attr('r', 4)
                .attr('fill', (d) => {
                    return 'rgba(199, 205, 255, 0.5)';
                })
                .attr('stroke', 'black')
                .on('mouseover', function (e, d) {
                    // Trigger overlay on hover
                    handleShowOverlay(e, d);
                })
                .on('mouseout', function () {
                    setShowOverlay(false);
                    // d3.select('#popover-boxplot')
                    //     .style('opacity', 0)
                    //     .style('left', '-100vw')
                    //     .style('top', '0px');
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

    return (
        <div className="boxplot-canvas" ref={containerRef}>
            <Overlay
                target={overlayTarget?.current?.node}
                show={showOverlay}
                placement="bottom"
                flip={true}>
                <Popover id="popover-boxplot" className="popover-boxplot">
                    <PopoverHeader>
                        {/* {qc_info[QCField].key}: */}
                        {new Intl.NumberFormat().format(
                            overlayTarget.current?.data?.quality_metrics[
                                QCField
                            ]
                        )}
                    </PopoverHeader>
                    <PopoverBody>
                        <BoxPlotPopoverContent
                            qc_info={qc_info}
                            data={overlayTarget?.current?.data}
                        />
                    </PopoverBody>
                </Popover>
            </Overlay>
        </div>
    );
};
