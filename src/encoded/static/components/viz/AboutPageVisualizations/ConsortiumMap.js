'use strict';

import React, { Component } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import us from './data/us.json';
import consortia from './data/consortia.json';
import consortiaLegend from './data/consortia_legend.json';
import consortiaLabels from './data/consortia_labels.json';

import { OverlayTrigger, Tooltip, Tab, Tabs } from 'react-bootstrap';

const MARKER_SIZE = 40;
const LINE_COLOR = '#636262';

export class ConsortiumMap extends Component {
    constructor(props) {
        super(props);
        this.mapReference = React.createRef();
        //this.tableReference = React.createRef();
        this.drawn = false;
    }

    componentDidMount() {
        if (!this.drawn) {
            this.drawChart();
            this.drawn = true;
        }
    }

    drawChart() {
        const color = d3.scaleLinear([1, 10], d3.schemeGreys[9]);
        const path = d3.geoPath();

        const states = topojson.feature(us, us.objects.states);
        const statemesh = topojson.mesh(
            us,
            us.objects.states,
            (a, b) => a !== b
        );

        var container = d3.select(this.mapReference.current);

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
                    .style('left', '-500px')
                    .style('top', '0px');
                d3.select(this).attr('fill', (d) => color(15));
            })
            .on('mouseover', function () {
                d3.select(this).attr('fill', (d) => color(25));
            });
        //   .append("title")
        // .text(d => `${d.properties.name}`);

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
        this.addConnectionLines(svg, centerCoods['Boston'], 'Boston');
        this.addConnectionLines(svg, centerCoods['Worcester'], 'Worcester');
        this.addConnectionLines(svg, centerCoods['NYC'], 'New York City');
        this.addConnectionLines(svg, centerCoods['WashU'], 'St. Louis');
        this.addConnectionLines(svg, centerCoods['Baylor'], 'Houston');

        svg.selectAll('.m')
            .data(consortia)
            .enter()
            .append('image')
            .style('cursor', 'pointer')
            .attr('width', MARKER_SIZE)
            .attr('height', MARKER_SIZE)
            .attr('xlink:href', (d) => {
                return `./map-marker-${d['marker-color']}.svg`;
            })
            .attr('transform', (d) => {
                return `translate(${d.x}, ${d.y})`;
            })
            .on('mouseover', (evt, d) => {
                d3.select('#consortiumMapTooltip')
                    .html(this.getTooltip(d))
                    .transition()
                    .duration(200)
                    .style('opacity', 1);
            })
            .on('mouseout', function () {
                d3.select('#consortiumMapTooltip')
                    .style('opacity', 0)
                    .style('left', '-500px')
                    .style('top', '0px');
            })
            .on('mousemove', function (evt) {
                d3.select('#consortiumMapTooltip')
                    .style('left', evt.pageX + 10 + 'px')
                    .style('top', evt.pageY + 10 + 'px');
            })
            .on('click', function (evt, d) {
                window.open(d.url, '_blank');
            });

        this.addMarkerDots(svg);

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
                .attr('xlink:href', `./map-marker-${d['color']}.svg`);

            svg.append('text')
                .attr('x', legendBasePosX + 28)
                .attr('y', legendBasePosY + 15 + i * 25)
                .text(d['center-type'])
                .style('font-size', '15px')
                .attr('alignment-baseline', 'middle');
        });
    }

    getTooltip(consortium) {
        return `
    <div class="consortium-tooltip-wrapper">
      <div class="pb-2 font-weight-bold">${consortium['center-type']}</div>
      <div class="consortium-tooltip-header">Institution</div>
      <div class="pb-2 consortium-tooltip-content">${
          consortium['institution']
      }</div>
      <div class="consortium-tooltip-header">Principal Investigators</div>
      <div class="pb-2 consortium-tooltip-content">${consortium.pis.join(
          '<br/>'
      )}</div>
      <div class="consortium-tooltip-header">Project</div>
      <div class="consortium-tooltip-content">${consortium.project}</div>
      <i class="pt-2 d-block small">Clicking on this marker will open the NIH project page in a new tab.</i>
    </div>`;
    }

    addMarkerDots(svg) {
        const dataset = consortia
            .filter((c) => !c.location)
            .forEach((c) => {
                svg.append('circle')
                    .attr('cx', c.x + MARKER_SIZE / 2)
                    .attr('cy', c.y + MARKER_SIZE)
                    .attr('r', 3)
                    .style('fill', LINE_COLOR);
            });
    }

    addConnectionLines(svg, centerCoords, location) {
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
                    .style('left', '-500px')
                    .style('top', '0px');
            })
            .on('mousemove', function (evt) {
                d3.select('#consortiumMapTooltip')
                    .style('left', evt.pageX + 10 + 'px')
                    .style('top', evt.pageY + 10 + 'px');
            });
    }

    renderTable() {
        // const centers = consortia.filter(
        //   (c) => c["center-type-short"] === centerType
        // );
        const centerRows = [];

        consortia.forEach((c) => {
            const centerTypeClass =
                'align-middle text-center consortium-table-' +
                c['center-type-short'];
            const pis = c['pis'].map((p) => {
                return <div className="text-nowrap">{p}</div>;
            });
            centerRows.push(
                <tr>
                    <td className={centerTypeClass}>
                        <OverlayTrigger
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
            <table className="table table-sm table-striped table-hover">
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
    }

    render() {
        return (
            <React.Fragment>
                <h1 className="text-center my-5">Consortium overview</h1>

                <div
                    id="consortiumMapTooltip"
                    className="p-1 rounded bg-white consortium-tooltip border"></div>

                <Tabs
                    defaultActiveKey="map"
                    className="mb-3 float-right"
                    variant="pills">
                    <Tab eventKey="map" title="Map view">
                        <div ref={this.mapReference}></div>
                    </Tab>
                    <Tab eventKey="table" title="Table view" className="pt-5">
                        {this.renderTable()}
                    </Tab>
                </Tabs>
            </React.Fragment>
        );
    }
}
