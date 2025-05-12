'use strict';

import React, { useRef, useState, useEffect } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import us from './data/us.json';
import consortia from './data/consortia.json';
import consortiaLegend from './data/consortia_legend.json';
import consortiaLabels from './data/consortia_labels.json';
import lab_links from './data/lab_links.json';

import {
    OverlayTrigger,
    Popover,
    PopoverHeader,
    PopoverBody,
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
        if (c['include_in_table']) {
            const centerTypeClass =
                'center-type align-middle text-center consortium-table-' +
                c['center-type-short'];
            const pis = c['pis'].map((p, j) => {
                return j === 0 && lab_links[p] ? (
                    <div className="text-nowrap" key={j}>
                        <a
                            href={lab_links[p]}
                            target="_blank"
                            className="link-underline-hover">
                            {p}
                        </a>
                    </div>
                ) : (
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
                    <td className="align-middle border-end">{pis}</td>
                    <td className="align-middle border-end">
                        {c?.table_institution_name ?? c['institution']}
                    </td>
                    {c?.code ? (
                        <td>
                            <span className="text-nowrap">{c.code}</span>
                        </td>
                    ) : null}
                    <td className="align-middle">
                        {c['project']} <br />
                        <small>
                            Project number:{' '}
                            <a
                                href={c['url']}
                                target="_blank"
                                rel="noreferrer"
                                className="link-underline-hover">
                                {c['project-number']}
                            </a>
                        </small>
                    </td>
                </tr>
            );
        }
    });

    return (
        <div className="table-responsive">
            <table className="table table-sm table-striped">
                <thead className="consortium-table-header">
                    <tr>
                        <th></th>
                        <th>Principal Investigators</th>
                        <th>Institution</th>
                        <th>Code</th>
                        <th>Project title</th>
                    </tr>
                </thead>
                <tbody>{centerRows}</tbody>
            </table>
        </div>
    );
};

/**
 * Contents placed inside of a React Bootstrap PopoverBody component
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
            <i className="d-block small fw-normal">
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
            node: d3.select(`[data-marker-project='${d['iid']}']`).node(),
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

        const mapMarkerIcons = svg
            .selectAll('.map-marker-icon')
            .data(consortia)
            .enter()
            .append('g')
            .attr('transform', (d) => {
                return `translate(${d.x}, ${d.y + 4})`;
            })
            .append('svg')
            .attr('data-marker-project', (d, i) => {
                d['iid'] = d['project-number'] + '-' + i;
                return d['iid'];
            })
            .attr('viewBox', '0 0 60 100')
            .attr('height', MARKER_SIZE)
            .attr('width', MARKER_SIZE)
            .attr('fill', (d) => d['marker-color-hex'])
            .attr('class', 'map-marker-icon')
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
                evt.preventDefault();
                window.open(d.url, '_blank');
            });

        mapMarkerIcons
            .append('path')
            .attr(
                'd',
                'M28.9998 0.416992C13.4188 0.416992 0.798828 13.044 0.798828 28.618C0.798828 34.945 2.88183 40.786 6.40083 45.491L24.4898 76.823C24.5948 77.025 24.6998 77.226 24.8288 77.411L24.8688 77.48L24.8798 77.474C25.8038 78.752 27.2908 79.585 29.0148 79.585C30.5708 79.585 31.9268 78.877 32.8598 77.786L32.9068 77.813L33.0858 77.503C33.3498 77.147 33.5838 76.767 33.7528 76.348L51.4748 45.65C55.0668 40.917 57.2008 35.018 57.2008 28.618C57.2008 13.044 44.5808 0.416992 28.9998 0.416992ZM28.7208 42.915C21.0438 42.915 14.8258 36.694 14.8258 29.02C14.8258 21.347 21.0438 15.125 28.7208 15.125C36.3978 15.125 42.6158 21.347 42.6158 29.02C42.6158 36.693 36.3978 42.915 28.7208 42.915Z'
            )
            .attr('opacity', '1');

        mapMarkerIcons
            .append('path')
            .attr(
                'd',
                'M43 28.5C43 36.5081 36.5081 43 28.5 43C20.4919 43 14 36.5081 14 28.5C14 20.4919 20.4919 14 28.5 14C36.5081 14 43 20.4919 43 28.5Z'
            )
            .attr('fill', 'black')
            .attr('opacity', '0');

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
            const labelSvgGroup = svg
                .append('g')
                .attr('class', 'consortium-legend');

            const labelSvg = labelSvgGroup
                .append('svg')
                .attr('x', legendBasePosX)
                .attr('y', legendBasePosY + i * 25)
                .attr('viewBox', '0 0 60 100')
                .attr('class', 'map-marker-icon')
                .attr('height', 27)
                .attr('width', 27)
                .attr('fill', label['marker-color-hex']);

            labelSvg
                .append('path')
                .attr(
                    'd',
                    'M28.9998 0.416992C13.4188 0.416992 0.798828 13.044 0.798828 28.618C0.798828 34.945 2.88183 40.786 6.40083 45.491L24.4898 76.823C24.5948 77.025 24.6998 77.226 24.8288 77.411L24.8688 77.48L24.8798 77.474C25.8038 78.752 27.2908 79.585 29.0148 79.585C30.5708 79.585 31.9268 78.877 32.8598 77.786L32.9068 77.813L33.0858 77.503C33.3498 77.147 33.5838 76.767 33.7528 76.348L51.4748 45.65C55.0668 40.917 57.2008 35.018 57.2008 28.618C57.2008 13.044 44.5808 0.416992 28.9998 0.416992ZM28.7208 42.915C21.0438 42.915 14.8258 36.694 14.8258 29.02C14.8258 21.347 21.0438 15.125 28.7208 15.125C36.3978 15.125 42.6158 21.347 42.6158 29.02C42.6158 36.693 36.3978 42.915 28.7208 42.915Z'
                )
                .attr('opacity', '1');

            labelSvg
                .append('path')
                .attr(
                    'd',
                    'M43 28.5C43 36.5081 36.5081 43 28.5 43C20.4919 43 14 36.5081 14 28.5C14 20.4919 20.4919 14 28.5 14C36.5081 14 43 20.4919 43 28.5Z'
                )
                .attr('fill', 'black')
                .attr('opacity', '0');

            labelSvgGroup
                .append('text')
                .attr('x', legendBasePosX + 28)
                .attr('y', legendBasePosY + 15 + i * 25)
                .attr('fill', 'black')
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
        <div className="consortium-map-container container">
            <p className="visualization-warning d-block d-sm-none">
                <span>Note:</span> for the best experience, please view the
                visualization below on a tablet or desktop.
            </p>
            <div className="consortium-map">
                <div
                    id="consortiumMapTooltip"
                    className="p-1 rounded bg-white consortium-tooltip border"></div>
                <div className="consortium-map-container" ref={mapReference}>
                    <span className="interaction-notice">
                        Hover over pins to read more about each SMaHT Consortium
                        Member
                    </span>
                    <Overlay
                        target={overlayTarget?.current?.node}
                        show={showOverlay}
                        placement="bottom"
                        flip={true}>
                        <Popover id="popover-consortium-map">
                            <PopoverHeader>
                                {overlayTarget.current?.data['center-type']}
                            </PopoverHeader>
                            <PopoverBody>
                                <ConsortiumPopoverContent
                                    data={overlayTarget.current?.data}
                                />
                            </PopoverBody>
                        </Popover>
                    </Overlay>
                </div>
                <ConsortiumTable />
            </div>
        </div>
    );
};
