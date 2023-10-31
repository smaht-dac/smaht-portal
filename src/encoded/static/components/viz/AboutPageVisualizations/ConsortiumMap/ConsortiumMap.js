'use strict';

import React, { Component, useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import us from './data/us.json';
import consortia from './data/consortia.json';
import consortiaLegend from './data/consortia_legend.json';
import consortiaLabels from './data/consortia_labels.json';
import { MapMarkerSvg } from './MapMarkerSvg';

import {
    OverlayTrigger,
    Popover,
    PopoverTitle,
    PopoverContent,
    Tooltip,
    Tab,
    Tabs,
} from 'react-bootstrap';

const MARKER_SIZE = 40;
const LINE_COLOR = '#636262';

const MapMarkerOverlay = ({ container }) => {
    useEffect(() => {
        console.log('new marker in overlay');
    }, [container]);

    return (
        <OverlayTrigger
            placement="bottom"
            trigger={['hover', 'focus']}
            show={true}
            container={container}
            overlay={
                <Popover id="map-marker-svg-popover">
                    <PopoverTitle>title</PopoverTitle>
                    <PopoverContent>content</PopoverContent>
                </Popover>
            }>
            <MapMarkerSvg />
        </OverlayTrigger>
    );
};

let drawn = false;
export const ConsortiumMap = () => {
    const mapReference = useRef(null);

    const drawChart = () => {
        const color = d3.scaleLinear([1, 10], d3.schemeGreys[9]);
        const path = d3.geoPath();

        const states = topojson.feature(us, us.objects.states);
        const statemesh = topojson.mesh(
            us,
            us.objects.states,
            (a, b) => a !== b
        );

        var container = d3.select(mapReference.current);

        const svg = container
            .append('svg')
            .attr('width', 1000)
            .attr('height', 600)
            .attr('viewBox', [0, 0, 1050, 600])
            .attr('style', 'max-width: 100%; height: auto;');

        svg.append('g')
            .selectAll('path')
            .data(states.features)
            .join('path')
            .attr('fill', (d) => color(15))
            .attr('d', path)
            .on('mouseout', function () {
                d3.select('#consortiumMapTooltip')
                    .style('opacity', 0)
                    .style('left', '-1000px')
                    .style('top', '0px');
                d3.select(this).attr('fill', (d) => color(15));
            })
            .on('mouseover', function () {
                d3.select(this).attr('fill', (d) => color(25));
            });

        svg.append('path')
            .datum(statemesh)
            .attr('fill', 'none')
            .attr('stroke', 'white')
            .attr('stroke-linejoin', 'round')
            .attr('d', path);

        const centerCoods = {
            Boston: [888, 131],
            Worcester: [875, 135],
            NYC: [853, 173],
            WashU: [578, 268],
            Baylor: [487, 475],
        };
        addConnectionLines(svg, centerCoods['Boston'], 'Boston');
        addConnectionLines(svg, centerCoods['Worcester'], 'Worcester');
        addConnectionLines(svg, centerCoods['NYC'], 'New York City');
        addConnectionLines(svg, centerCoods['WashU'], 'St. Louis');
        addConnectionLines(svg, centerCoods['Baylor'], 'Houston');

        svg.selectAll('.m')
            .data(consortia)
            .enter()
            .append('use')
            .attr('data-svg-institution', (d) => d.institution)
            .attr('href', '#map-marker-svg')
            .attr('fill', (d) => d['marker-color-hex'])
            .style('cursor', 'pointer')
            .attr('transform', (d) => {
                return `translate(${d.x}, ${d.y})`;
            })
            .on('mouseover', (evt, d) => {
                d3.select('#map-marker-svg-popover').style(
                    'transform',
                    `translate(${d.x}px, ${d.y}px)`
                );

                d3.select('#consortiumMapTooltip')
                    .html(getTooltip(d))
                    .transition()
                    .duration(200)
                    .style('opacity', 1);
            })
            .on('mouseout', function () {
                d3.select('#consortiumMapTooltip')
                    .style('opacity', 0)
                    .style('left', '-1000px')
                    .style('top', '0px');
            })
            .on('mousemove', function (evt) {
                d3.select('#consortiumMapTooltip')
                    .style('left', evt.offsetX + 10 + 'px')
                    .style('top', evt.offsetY + 70 + 'px');
            })
            .on('click', function (evt, d) {
                window.open(d.url, '_blank');
            });

        addMarkerDots(svg);

        consortiaLabels.forEach((d, i) => {
            d['institution'].forEach((inst, i) => {
                svg.append('text')
                    .attr('x', d.x)
                    .attr('y', d.y + i * 12)
                    .text(inst)
                    .style('font-size', '12px')
                    .attr('alignment-baseline', 'middle');
            });
        });

        const legendBasePosX = 5;
        const legendBasePosY = 450;

        consortiaLegend.forEach((d, i) => {
            svg.append('image')
                .attr('width', 27)
                .attr('height', 27)
                .attr('x', legendBasePosX)
                .attr('y', legendBasePosY + i * 25)
                .attr('xlink:href', `/static/img/map-marker-${d['color']}.svg`);

            svg.append('text')
                .attr('x', legendBasePosX + 28)
                .attr('y', legendBasePosY + 15 + i * 25)
                .text(d['center-type'])
                .style('font-size', '15px')
                .attr('alignment-baseline', 'middle');
        });
    };

    const getTooltip = (consortium) => {
        return `
    <div class="consortium-tooltip-wrapper">
      <div class="pb-1 pb-md-2">${consortium['center-type']}</div>
      <div class="consortium-tooltip-header">Institution</div>
      <div class="pb-1 pb-md-2 consortium-tooltip-content">${
          consortium['institution']
      }</div>
      <div class="consortium-tooltip-header">Principal Investigators</div>
      <div class="pb-1 pb-md-2 consortium-tooltip-content">${consortium.pis.join(
          '<br/>'
      )}</div>
      <div class="consortium-tooltip-header">Project</div>
      <div class="consortium-tooltip-content">${consortium.project}</div>
      <i class="pt-1 pb-md-2 d-block small">Clicking on this marker will open the NIH project page in a new tab.</i>
    </div>`;
    };

    const addMarkerDots = (svg) => {
        const dataset = consortia
            .filter((c) => !c.location)
            .forEach((c) => {
                svg.append('circle')
                    .attr('cx', c.x + MARKER_SIZE / 2)
                    .attr('cy', c.y + MARKER_SIZE)
                    .attr('r', 3)
                    .style('fill', LINE_COLOR);
            });
    };

    const addConnectionLines = (svg, centerCoords, location) => {
        const dataset = consortia
            .filter((c) => c.location === location)
            .map((c) => {
                return [c.x, c.y];
            });
        const datasetWithCenter = [];
        datasetWithCenter.push(centerCoords);
        dataset.forEach((d) => {
            datasetWithCenter.push(d);
            datasetWithCenter.push(centerCoords);
        });

        var line = d3
            .line()
            .x(function (d) {
                return d[0];
            })
            .y(function (d) {
                return d[1];
            });

        svg.append('path')
            .datum(datasetWithCenter)
            .attr('class', 'line')
            //.style("stroke-dasharray", ("3, 3"))
            .attr('d', line)
            .attr(
                'transform',
                'translate(' + MARKER_SIZE / 2 + ',' + (MARKER_SIZE - 4) + ')'
            )
            .style('fill', 'none')
            .style('stroke', LINE_COLOR)
            .style('stroke-width', '1');

        svg.append('circle')
            .attr('cx', centerCoords[0] + MARKER_SIZE / 2)
            .attr('cy', centerCoords[1] + MARKER_SIZE - 4)
            .attr('r', 3)
            .style('fill', LINE_COLOR);

        svg.append('rect')
            .attr('x', centerCoords[0] + MARKER_SIZE / 2 - 4)
            .attr('y', centerCoords[1] + MARKER_SIZE - 8)
            .attr('width', 8)
            .attr('height', 8)
            .style('opacity', 0)
            .on('mouseover', (evt, d) => {
                d3.select('#consortiumMapTooltip')
                    .text(location)
                    .transition()
                    .duration(200)
                    .style('opacity', 1);
            })
            .on('mouseout', function () {
                d3.select('#consortiumMapTooltip')
                    .style('opacity', 0)
                    .style('left', '-1000px')
                    .style('top', '0px');
            })
            .on('mousemove', function (evt) {
                d3.select('#consortiumMapTooltip')
                    .style('left', evt.pageX + 10 + 'px')
                    .style('top', evt.pageY + 10 + 'px');
            });
    };

    const renderTable = () => {
        const centerRows = [];

        consortia.forEach((c, i) => {
            const centerTypeClass =
                'align-middle text-center consortium-table-' +
                c['center-type-short'];
            const pis = c['pis'].map((p, j) => {
                return (
                    <div className="text-nowrap" key={j}>
                        {p}
                    </div>
                );
            });
            centerRows.push(
                <tr key={i}>
                    <td className={centerTypeClass}>
                        <OverlayTrigger
                            trigger={['hover', 'focus']}
                            placement="right"
                            overlay={
                                <Tooltip id="button-tooltip-2">
                                    {c['center-type']}
                                </Tooltip>
                            }>
                            <div className="px-1">{c['center-type-short']}</div>
                        </OverlayTrigger>
                    </td>
                    <td className="align-middle border-right">{pis}</td>
                    <td className="align-middle border-right">
                        {c['institution']}
                    </td>
                    <td className="align-middle">
                        {c['project']} <br />
                        <small>
                            Project number:{' '}
                            <a href={c['url']} target="_blank" rel="noreferrer">
                                {c['project-number']}
                            </a>
                        </small>
                    </td>
                </tr>
            );
        });

        const table = (
            <table className="table table-sm table-striped table-hover table-responsive">
                <thead className="consortium-table-header bg-white">
                    <tr>
                        <th></th>
                        <th>Principal Investigators</th>
                        <th>Institution</th>
                        <th>Project title</th>
                    </tr>
                </thead>
                <tbody>{centerRows}</tbody>
            </table>
        );
        return table;
    };

    useEffect(() => {
        console.log('running use effect');
        if (!drawn) {
            drawChart();
            drawn = true;
        }
    }, []);

    return (
        <div className="consortium-map-container container py-5">
            <div className="consortium-map">
                <div
                    id="consortiumMapTooltip"
                    className="p-1 rounded bg-white consortium-tooltip border"></div>
                <Tabs
                    defaultActiveKey="map"
                    className="mb-3 float-right"
                    variant="pills">
                    <Tab eventKey="map" title="Map view">
                        <div>
                            <div ref={mapReference}>
                                <MapMarkerOverlay />
                            </div>
                        </div>
                    </Tab>
                    <Tab eventKey="table" title="Table view" className="pt-5">
                        {renderTable()}
                    </Tab>
                </Tabs>
            </div>
        </div>
    );
};
