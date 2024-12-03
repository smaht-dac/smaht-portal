import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { Popover, PopoverHeader, PopoverBody, Overlay } from 'react-bootstrap';

const ScatterPlotPopoverContent = ({ qc_info, data = null }) => {
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
        <div className="scatterplot-popover-content">
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

export const ScatterPlot = ({
    plotId,
    data,
    yAxisField,
    customExtentY,
    yAxisLabel,
    xAxisField,
    customExtentX,
    xAxisLabel,
    customFormat,
    customFilter,
    title = 'Untitled Scatter Plot',
    thresholds_marks = [],
    colorLegend = null,
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

        const scatterPlot = d3.select('#scatterplot-svg' + '-' + plotId);
        // console.log(
        //     'boxPlot point: ',
        //     boxPlot.select(`[data-point-index='${d['data-point-index']}']`)
        // );

        overlayTarget.current = {
            node: scatterPlot.select(`[data-point-index='${targetId}']`).node(),
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
        if (!isDrawn.current) {
            const container = d3.select(containerRef.current);

            // Create the SVG containers
            const svgContainer = container
                .append('svg')
                .attr('id', 'scatterplot-svg' + '-' + plotId)
                .attr('class', 'scatterplot-svg')
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
                .text(yAxisLabel ?? qc_info[yAxisField].key);

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
                .text(xAxisLabel ?? qc_info[xAxisField].key);

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

                return !!(
                    d?.quality_metrics[yAxisField] &&
                    d?.quality_metrics[xAxisField]
                );
            });

            // Extent values for the Y axis
            let extentY =
                customExtentY ??
                d3.extent(filteredData, (d) => d.quality_metrics[yAxisField]);

            // Extent values for the X axis
            let extentX =
                customExtentX ??
                d3.extent(filteredData, (d) => d.quality_metrics[xAxisField]);

            const x = d3
                .scaleLinear()
                .domain(extentX)
                .range([0, chartWidth - margins.left - margins.right]);

            const xAxis = d3.axisBottom(x).ticks(5).tickSizeOuter(0);

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
                .domain(extentY)
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
                .attr('id', 'plotElements')
                .attr(
                    'transform',
                    'translate(' + margins.left + ', ' + 0 + ')'
                );

            const submission_centers = new Set(
                filteredData.map((d) => d.submission_center)
            );
            // Create color scale for the data points
            const pointColor = d3
                .scaleOrdinal()
                .domain(submission_centers)
                .range(d3.schemeCategory10);

            // Add horizontal threshold marker lines
            plotElements
                .selectAll('.horizontalThresholdLines')
                .data(thresholds_marks?.horizontal ?? [])
                .enter()
                .append('line')
                .attr('x1', 0)
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
                .attr('y1', y(extentY[0]))
                .attr('y2', y(extentY[1]))
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
                    const pointId = plotId + '-' + i;
                    d['data-point-index'] = pointId;
                    return pointId;
                })
                .attr('cy', (d) => {
                    console.log(
                        'd.quality_metrics[yAxisField]',
                        yAxisField,
                        d.quality_metrics[yAxisField]
                    );
                    return y(d.quality_metrics[yAxisField]);
                })
                .attr('cx', (d) => {
                    console.log(
                        d,
                        'd.quality_metrics[xAxisField]',
                        xAxisField,
                        d.quality_metrics[xAxisField],
                        x(d.quality_metrics[xAxisField])
                    );
                    return x(d.quality_metrics[xAxisField]);
                })
                .attr('r', 4)
                .attr('fill', (d) => {
                    return pointColor(d.submission_center);
                })
                .attr('stroke', 'black')
                .on('mouseover', function (e, d) {
                    // Trigger overlay on hover
                    handleShowOverlay(e, d);
                })
                .on('mouseout', function () {
                    setShowOverlay(false);
                });

            // Add a legend
            const legendWidth = 120;
            const legendHeight = submission_centers.size * 30 + 20;
            const gLegend = svgContainer
                .append('g')
                .attr('class', 'legend')
                .attr(
                    'transform',
                    'translate(' +
                        (chartWidth - margins.right - legendWidth) +
                        ', ' +
                        margins.top +
                        ')'
                );

            gLegend
                .append('rect')
                .attr('width', legendWidth)
                .attr('height', legendHeight)
                .attr('fill', 'white')
                .attr('stroke', 'lightgray');

            const legendKey = gLegend
                .selectAll('.legend-key')
                .data(submission_centers)
                .enter()
                .append('g')
                .attr('class', 'legend-item')
                .attr(
                    'transform',
                    (d, i) => 'translate(' + 10 + ',' + (15 + i * 30) + ')'
                );

            legendKey
                .append('rect')
                .attr('class', 'legend-color')
                .attr('width', 15)
                .attr('height', 15)
                .attr('fill', (d) => pointColor(d));

            legendKey
                .append('text')
                .attr('class', 'legend-text')
                .text((d) => d)
                .attr('x', 25)
                .attr('y', 10)
                .attr('text-anchor', 'start')
                .attr('alignment-baseline', 'middle');

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

            function zoomed({ transform: t }) {
                plotElements.attr(
                    'transform',
                    `translate(${t.x + margins.left}, ${t.y}) scale(${t.k})`
                );

                gX.attr(
                    'transform',
                    d3.zoomIdentity
                        .translate(
                            t.x + margins.left, // Must scale left margin as well
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

                gX.call(xAxis.ticks(5 * t.k));

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

                d3.select('#popover-scatterplot').attr(
                    'transform',
                    'translate(' + t.x + ', ' + t.y + ')'
                );

                // const newXRange = [
                //     initialXRange[0] + transform.x, // Keep the left margin fixed
                //     initialXRange[1], // Adjust the range based on new bandwidth
                // ];
                // // Apply the new range and the updated bandwidth to the x scale
                // x.range(newXRange).bandwidth(newBandwidth);
                // // Update the x-axis with the new scale
                // gX.call(xAxis.scale(x));
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
        <div className="scatterplot-canvas" ref={containerRef}>
            <Overlay
                target={overlayTarget?.current?.node}
                show={showOverlay}
                placement="bottom"
                flip={true}>
                <Popover
                    id="popover-scatterplot"
                    className="popover-scatterplot">
                    <PopoverHeader>
                        {xAxisLabel ?? qc_info[xAxisField].key}:{' '}
                        {new Intl.NumberFormat().format(
                            overlayTarget.current?.data?.quality_metrics[
                                xAxisField
                            ]
                        )}
                        <br />
                        {yAxisLabel ?? qc_info[yAxisField].key}:{' '}
                        {new Intl.NumberFormat().format(
                            overlayTarget.current?.data?.quality_metrics[
                                yAxisField
                            ]
                        )}
                    </PopoverHeader>
                    <PopoverBody>
                        <ScatterPlotPopoverContent
                            qc_info={qc_info}
                            data={overlayTarget?.current?.data}
                        />
                    </PopoverBody>
                </Popover>
            </Overlay>
        </div>
    );
};
