import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

export const SampleContaminationHeatmap = ({
    plotId,
    data,
    title = 'Pairwise sample relatedness',
    rerenderNumber = 0,
}) => {
    const isDrawn = useRef(false);
    const oldRerenderNumber = useRef(rerenderNumber);
    const containerRef = useRef(null);

    // Specify the dimensions of the chart.
    const chartWidth = 928;
    const chartHeight = 700;
    const margins = {
        top: 20,
        right: 50,
        bottom: 120,
        left: 160,
    };

    const getMouseOverHtml = (d) => {
        const highlightedSampleAClass =
            d.sample_a_status === 'retracted' ? 'text-danger fw-bold' : '';
        const highlightedSampleBClass =
            d.sample_b_status === 'retracted' ? 'text-danger fw-bold' : '';
        const html = `
            <table>
                <tr>
                    <td class='text-left text-600'>Sample A:</td>
                    <td class='text-left'>${d.sample_a} (<span class='${highlightedSampleAClass}'>${d.sample_a_status}</span>)</td>
                </tr>
                <tr>
                    <td class='text-left text-600'>Sample B:</td>
                    <td class='text-left'>${d.sample_b} (<span class='${highlightedSampleBClass}'>${d.sample_b_status}</span>)</td>
                </tr>
                <tr>
                    <td class='text-left text-600'>Relatedness:</td>
                    <td class='text-left'>${d.relatedness}</td>
                </tr>
                <tr>
                    <td class='text-left text-600'>IBS0:</td>
                    <td class='text-left'>${d.ibs0}</td>
                </tr>
                <tr>
                    <td class='text-left text-600'>IBS2:</td>
                    <td class='text-left'>${d.ibs2}</td>
                </tr>
            </table>
            <div class='border-top pt-1 mt-1'>
                <i>Hold key 'a' + click to go to Sample A<br>
                Hold key 'b' + click to go to Sample B</i>
            </div>`;
        return html;
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

            // Labels of row and columns -> unique identifier of the column called 'group' and 'variable'
            const myGroups = Array.from(new Set(data.map((d) => d.sample_a)));
            const myVars = Array.from(new Set(data.map((d) => d.sample_b)));
            if (myVars.length > 50) {
                margins.left = 130;
                margins.bottom = 90;
            }

            // Create the SVG containers
            const svgContainer = container
                .append('svg')
                .attr('id', 'sample-contamination-svg' + '-' + plotId)
                .attr('class', 'sample-contamination-svg')
                .attr('width', chartWidth)
                .attr('height', chartHeight)
                .attr('viewBox', [0, 0, chartWidth, chartHeight])
                .attr(
                    'style',
                    'max-width: 100%; height: auto; font: 14px Inter, sans-serif;overflow:visible;'
                )
                .attr('text-anchor', 'middle');

            svgContainer
                .append('text')
                .text('Sample A')
                .attr('text-anchor', 'middle')
                .attr('style', 'font-family: Inter; font-size: 1.2rem')
                .attr('x', chartWidth / 2 + margins.left / 2)
                .attr('y', chartHeight);
            svgContainer
                .append('text')
                .text('Sample B')
                .attr('text-anchor', 'middle')
                .attr('style', 'font-family: Inter; font-size: 1.2rem')
                .attr('transform', 'rotate(-90)')
                .attr('x', -(chartHeight - margins.bottom) / 2)
                .attr('y', 20);

            // Build X scales and axis:
            const x = d3
                .scaleBand()
                .range([margins.left, chartWidth])
                .domain(myGroups)
                .padding(0.05);
            // Build Y scales and axis:
            const y = d3
                .scaleBand()
                .range([chartHeight - margins.bottom, margins.top])
                .domain(myVars)
                .padding(0.05);
            const fontsize = Math.min(15, y.bandwidth());

            svgContainer
                .append('g')
                .style('font-size', fontsize)
                .attr(
                    'transform',
                    `translate(0, ${chartHeight - margins.bottom})`
                )
                .call(d3.axisBottom(x).tickSize(0))
                .selectAll('text') // Select all x-axis labels
                .attr('transform', 'rotate(-45)') // Rotate labels by 90 degrees
                .style('text-anchor', 'end')
                .attr('dx', '-0.3em') // Horizontal offset
                .attr('dy', '0.4em'); // Vertical offset
            svgContainer.select('.domain').remove();

            svgContainer
                .append('g')
                .style('font-size', fontsize)
                .attr('transform', `translate(${margins.left}, 0)`)
                .call(d3.axisLeft(y).tickSize(0))
                .select('.domain')
                .remove();

            // Build color scale
            const myColor = d3
                .scaleSequential()
                .interpolator(d3.interpolateRdYlGn)
                .domain([0, 1]);

            // Add a tooltip
            const tooltip = container
                .append('div')
                .style('opacity', 0)
                .attr('class', 'tooltip')
                .style('position', 'absolute')
                .style('background-color', 'white')
                .style('border', 'solid')
                .style('border-width', '1px')
                .style('border-radius', '2px')
                .style('padding', '5px');

            // Three functions that change the tooltip when user hover / move / leave a cell
            let tooltip_x = 0;
            let tooltip_y = 0;

            const mouseover = function (event, d) {
                tooltip.style('opacity', 1);
                d3.select(this).style('stroke', 'black').style('opacity', 1);
                tooltip_x =
                    parseFloat(d3.select(this).attr('x')) + 2 * x.bandwidth();
                tooltip_y =
                    parseFloat(d3.select(this).attr('y')) + chartHeight / 2;
            };
            const mousemove = function (event, d) {
                tooltip
                    .html(getMouseOverHtml(d))
                    .style('left', tooltip_x + 'px')
                    .style('top', tooltip_y + 'px');
                //console.log(d3.select(this).attr('x'), d3.select(this).attr('y'), d3.select(this).attr('y'),event.y);
            };
            const mouseleave = function (event, d) {
                tooltip
                    .style('opacity', 0)
                    .style('left', '-1000px')
                    .style('top', '-1000px');
                d3.select(this).style('stroke', 'none').style('opacity', 0.8);
            };

            let isBDown = false;
            let isADown = false;

            // Detect if "b" key is pressed down
            document.addEventListener('keydown', (event) => {
                if (event.key === 'b') {
                    isBDown = true;
                } else if (event.key === 'a') {
                    isADown = true;
                }
            });

            document.addEventListener('keyup', (event) => {
                if (event.key === 'b') {
                    isBDown = false;
                } else if (event.key === 'a') {
                    isADown = false;
                }
            });
            // add the squares
            svgContainer
                .selectAll()
                .data(data, function (d) {
                    return d.sample_a + ':' + d.sample_b;
                })
                .join('rect')
                .attr('x', function (d) {
                    return x(d.sample_a);
                })
                .attr('y', function (d) {
                    return y(d.sample_b);
                })
                .attr('rx', 1)
                .attr('ry', 1)
                .attr('width', x.bandwidth())
                .attr('height', y.bandwidth())
                .style('fill', function (d) {
                    return myColor(d.relatedness);
                })
                .style('stroke-width', 2)
                .style('stroke', 'none')
                .style('opacity', 0.8)
                .on('mouseover', mouseover)
                .on('mousemove', mousemove)
                .on('mouseleave', mouseleave)
                .on('click', (event, d) => {
                    if (isBDown) {
                        window.open('/' + d.sample_b, '_blank');
                    } else if (isADown) {
                        window.open('/' + d.sample_a, '_blank');
                    }
                });

            // Create a legend container
            const legendWidth = 300;
            const legendHeight = 20;
            const legendSvg = svgContainer
                .append('g')
                .attr(
                    'transform',
                    `translate(${chartWidth - legendWidth}, ${
                        chartHeight - margins.bottom - 3 * legendHeight
                    })`
                );

            // Define color scale (continuous scale example)
            const colorScale = d3
                .scaleSequential(d3.interpolateRdYlGn)
                .domain([0, 1]);

            // Create gradient for the legend
            const defs = svgContainer.append('defs');
            const gradient = defs
                .append('linearGradient')
                .attr('id', 'legend-gradient')
                .attr('x1', '0%')
                .attr('y1', '0%')
                .attr('x2', '100%')
                .attr('y2', '0%');

            // Define gradient stops
            gradient
                .selectAll('stop')
                .data(d3.range(0, 1.0, 0.1)) // 0 to 1 in steps of 0.1
                .enter()
                .append('stop')
                .attr('offset', (d) => `${d * 100}%`)
                .attr('stop-color', (d) => colorScale(d));

            // Draw the legend rectangle
            legendSvg
                .append('rect')
                .attr('width', legendWidth)
                .attr('height', legendHeight)
                .style('fill', 'url(#legend-gradient)');

            // Create scale for the axis
            const legendScale = d3
                .scaleLinear()
                .domain(colorScale.domain())
                .range([0, legendWidth]);

            const legendAxis = d3.axisBottom(legendScale).ticks(5);

            legendSvg
                .append('g')
                .style('font-size', 15)
                .attr('transform', `translate(0, ${legendHeight})`)
                .call(legendAxis)
                .select('.domain')
                .remove(); // Optional: Remove axis line

            svgContainer
                .append('text') // Append a text element
                .attr('text-anchor', 'start') // Align text (optional)
                .style('font-size', '16px') // Font size
                .style('fill', 'black') // Text color
                .text('Relatedness') // The text content
                .attr(
                    'transform',
                    `translate(${chartWidth - legendWidth}, ${
                        chartHeight - margins.bottom - 3 * legendHeight - 10
                    })`
                );

            // Cleanup function to prevent rerender
            return () => {
                isDrawn.current = true;
            };
        }
    });

    return <div className="scatterplot-canvas" ref={containerRef}></div>;
};
