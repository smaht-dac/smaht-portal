'use strict';

import React, { useRef, useState, useEffect } from 'react';
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
    Overlay,
} from 'react-bootstrap';

/**
 * Table version of the information displayed in the Consortium Map
 */
const ConsortiumTable = () => {
    const centerRows = [];

    consortia.forEach((c, i) => {
        const centerTypeClass =
            'center-type align-middle text-center consortium-table-' +
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

    return (
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
};

/**
 * Contents placed inside of a React Bootstrap PopoverContent component
 */
const ConsortiumPopoverContent = ({ data }) => {
    return (
        <div className="consortium-popover">
            <div className="consortium-popover-section">
                <h4 className="consortium-popover-header">Institution</h4>
                <div className="consortium-popover-content">
                    {data.institution}
                </div>
            </div>
            <div className="consortium-popover-section">
                <h4 className="consortium-popover-header">
                    Principal Investigators
                </h4>
                <div className="consortium-popover-content">
                    <ul className="consortium-popover-content pi-list">
                        {data.pis.map((pi, i) => {
                            return <li key={i}>{pi}</li>;
                        })}
                    </ul>
                </div>
            </div>
            <div className="consortium-popover-section">
                <h4 className="consortium-popover-header">Project</h4>
                <div className="consortium-popover-content">{data.project}</div>
            </div>
            <i className="d-block small">
                Click this marker to open the NIH project page in a new tab.
            </i>
        </div>
    );
};

// Constant values
const MARKER_SIZE = 40;
const LINE_COLOR = '#636262';

export const ConsortiumMap = () => {
    const [showOverlay, setShowOverlay] = useState(false);
    const overlayTarget = useRef(null);
    const isDrawn = useRef(false);

    const handleShowOverlay = (e, d) => {
        overlayTarget.current = {
            node: e.target,
            data: d,
        };
        setShowOverlay(true);
    };

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

        const container = d3.select(mapReference.current);

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
            .attr('href', '#map-marker-svg')
            .attr('height', MARKER_SIZE)
            .attr('width', MARKER_SIZE)
            .attr('fill', (d) => d['marker-color-hex'])
            .attr('class', 'map-marker-icon')
            .style('cursor', 'pointer')
            .attr('transform', (d) => {
                return `translate(${d.x + 8}, ${d.y + 4})`;
            })
            .on('mouseover', (evt, d) => {
                handleShowOverlay(evt, d);
            })
            .on('mouseout', function (evt) {
                setShowOverlay(false);
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
        const legendBasePosY = 470;

        consortiaLegend.forEach((label, i) => {
            svg.append('use')
                .attr('href', '#map-marker-svg')
                .attr('height', 27)
                .attr('width', 27)
                .attr('x', legendBasePosX)
                .attr('y', legendBasePosY + i * 25)
                .attr('fill', label['marker-color-hex']);

            svg.append('text')
                .attr('x', legendBasePosX + 28)
                .attr('y', legendBasePosY + 15 + i * 25)
                .text(label['center-type'])
                .style('font-size', '15px')
                .attr('alignment-baseline', 'middle');
        });
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

        let line = d3
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
    };

    useEffect(() => {
        if (isDrawn.current === false && mapReference.current !== null) {
            drawChart();
        }
        return () => {
            isDrawn.current = true; // use cleanup function to prevent rerender
        };
    }, []);

    return (
        <div className="consortium-map-container container py-5">
            <p className="visualization-warning d-block d-sm-none">
                <span>Note:</span> for the best experience, please view the
                visualization below on a tablet or desktop.
            </p>
            <div className="consortium-map">
                <div
                    id="consortiumMapTooltip"
                    className="p-1 rounded bg-white consortium-tooltip border"></div>
                <Tabs
                    defaultActiveKey="map"
                    className="mb-3 float-right"
                    variant="pills">
                    <Tab eventKey="map" title="Map view">
                        <div ref={mapReference}>
                            <Overlay
                                target={overlayTarget?.current?.node}
                                show={showOverlay}
                                placement="bottom"
                                flip={true}>
                                <Popover id="popover-consortium-map">
                                    <PopoverTitle>
                                        {
                                            overlayTarget.current?.data[
                                                'center-type'
                                            ]
                                        }
                                    </PopoverTitle>
                                    <PopoverContent>
                                        <ConsortiumPopoverContent
                                            data={overlayTarget.current?.data}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </Overlay>
                            {/* Load MapMarker svg to link to from <use> elements */}
                            <MapMarkerSvg />
                        </div>
                    </Tab>
                    <Tab eventKey="table" title="Table view" className="pt-5">
                        <ConsortiumTable />
                    </Tab>
                </Tabs>
            </div>
        </div>
    );
};
