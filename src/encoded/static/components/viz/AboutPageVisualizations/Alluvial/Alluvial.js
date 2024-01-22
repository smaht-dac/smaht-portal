import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import graphData from './data/alluvial_data.json';
import tableData from './data/stackrow_data.json';

import { sankeyFunc } from './sankey';
import { StackRowTable } from './StackRowTable';

import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';

/**
 * Alluvial Plot:
 * The information that the aluvial plot shows is the distribution of technologies
 * that are being used, the kind of assay types done on those techonlogies, and finally,
 * the molecular features that can be profiled using them.
 */

/**
 * Component for rendering the svg containing the alluvial plot.
 * @returns
 */
export const Alluvial = () => {
    const isDrawn = useRef(false);

    const graph = { ...graphData };

    // Create ref for appending d3 visualization to the DOM
    const containerRef = useRef(null);

    // Run after JSX renders (for the ref), then add to the DOM
    useEffect(() => {
        const color_schemes = {
            data_generator: d3
                .scaleOrdinal()
                .domain(graph.nodes.filter((n) => n.type === 'data_generator'))
                .range(graph.colors.data_generator),
            sequencing_platform: d3
                .scaleOrdinal()
                .domain(
                    graph.nodes.filter((n) => n.type === 'sequencing_platform')
                )
                .range(graph.colors.sequencing_platform),
            assay_type: d3
                .scaleOrdinal()
                .domain(graph.nodes.filter((n) => n.type === 'assay_type'))
                .range(graph.colors.assay_type),
            molecular_feature: {
                genetic: d3
                    .scaleOrdinal()
                    .domain(graph.nodes.filter((n) => n.category === 'genetic'))
                    .range(graph.colors.genetic),
                epigenetic: d3
                    .scaleOrdinal()
                    .domain(
                        graph.nodes.filter((n) => n.category === 'epigenetic')
                    )
                    .range(graph.colors.epigenetic),
                transcriptomic: d3
                    .scaleOrdinal()
                    .domain(
                        graph.nodes.filter(
                            (n) => n.category === 'transcriptomic'
                        )
                    )
                    .range(graph.colors.transcriptomic),
            },
        };

        if (graph && containerRef.current && isDrawn.current === false) {
            const container = containerRef.current;

            const margin = { top: 150, right: 200, bottom: 50, left: 100 },
                width = 1200 - margin.left - margin.right,
                height = 700 - margin.top - margin.bottom;

            // append the svg object to the body of the page
            const svgContainer = d3
                .select(container)
                .append('svg')
                .attr('class', 'alluvial-svg')
                .attr('viewBox', '0,0,1200,700')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom);

            /**
             * Headers for the columns
             */
            const header_row = svgContainer.append('g');
            header_row.attr('transform', 'translate(' + 10 + ',' + 0 + ')');

            header_row
                .append('text')
                .attr('class', 'header')
                .attr('transform', 'translate(' + 70 + ',' + 20 + ')')
                .text('GCC/TTD');

            header_row
                .append('text')
                .attr('class', 'header')
                .attr('transform', 'translate(' + 315 + ',' + 20 + ')')
                .text('Sequencing Platform');

            header_row
                .append('text')
                .attr('class', 'header')
                .attr('transform', 'translate(' + 645 + ',' + 20 + ')')
                .text('Assay Type');

            header_row
                .append('text')
                .attr('class', 'header')
                .attr('transform', 'translate(' + 910 + ',' + 20 + ')')
                .text('Molecular Features');

            /**
             * A legend for the columns
             */
            const legend = svgContainer
                .append('g')
                .attr('width', width + margin.left + margin.right)
                .attr('height', margin.top);

            const legend_row = (
                category_name,
                color_array,
                paddingTop = 0,
                offset = 0
            ) => {
                const row = legend
                    .append('g')
                    .attr('transform', 'translate(' + offset + ',' + 50 + ')');

                row.append('text')
                    .text(category_name)
                    .attr('fill', 'rgb(58, 58, 58)')
                    .style('text-anchor', 'end')
                    .attr(
                        'transform',
                        'translate(' + 150 + ',' + (paddingTop + 15) + ')'
                    );
                color_array.forEach((color, i) => {
                    row.append('rect')
                        .attr('width', 20)
                        .attr('height', 20)
                        .attr('fill', color)
                        .attr('stroke', d3.rgb(color).darker(1))
                        .attr(
                            'transform',
                            'translate(' + 160 + ',' + paddingTop + ')'
                        );
                });
            };

            legend_row(
                'genetic',
                graph.colors.genetic,
                0,
                width - margin.right + 120
            );
            legend_row(
                'epigenetic',
                graph.colors.epigenetic,
                30,
                width - margin.right + 120
            );
            legend_row(
                'transcriptomic',
                graph.colors.transcriptomic,
                60,
                width - margin.right + 120
            );

            const svg = svgContainer
                .append('g')
                .attr('class', 'svgContent')
                .attr(
                    'transform',
                    'translate(' + margin.left + ',' + margin.top + ')'
                );

            // Set the sankey diagram properties
            const sankey = sankeyFunc()
                .nodeWidth(25)
                .nodePadding(10)
                .size([width, height]);

            // Constructs a new Sankey generator with the default settings.
            sankey.nodes(graph.nodes).links(graph.links).layout(1);

            // add in the links
            const link = svg
                .append('g')
                .selectAll('.link')
                .data(graph.links)
                .enter()
                .append('path')
                .attr('class', 'link')
                .attr('d', sankey.link())
                .attr('data-source', function (d) {
                    return d.source.name;
                })
                .attr('data-target', function (d) {
                    return d.target.name;
                })
                .attr(
                    'data-source_data_generator',
                    (d) => d.source_data_generator
                )
                .style('stroke', function (d) {
                    if (d.source.type === 'data_generator') {
                        d.source.color = color_schemes['data_generator'](
                            d.source.name
                        );
                        return d.source.color;
                    }
                    if (d.source.type === 'assay_type') {
                        d.source.color = color_schemes['assay_type'](
                            d.source.name
                        );
                        return d.source.color;
                    }
                    if (d.source.type === 'sequencing_platform') {
                        d.source.color = color_schemes['sequencing_platform'](
                            d.source.name
                        );
                        return d.source.color;
                    }
                    d.source.color = color_schemes['molecular_feature'](
                        d.source.name
                    );
                    return d.source.color;
                })
                .style('stroke-width', function (d) {
                    return 15; // constant stroke width
                })
                .sort(function (a, b) {
                    return b.dy - a.dy;
                })
                .on('mouseover', (e, d) => {})
                .on('mouseleave', (e, d) => {});

            const highlight = (e, d) => {
                if (d.type === 'data_generator') {
                    // highlight the links with source=platform and target=assay_type
                    const platforms = graph.platforms[d.name];
                    for (const platform in platforms) {
                        platforms[platform].forEach((assay_type) => {
                            d3.selectAll(
                                `.link[data-source='${assay_type}'][data-target='${platform}']`
                            ).attr('class', 'link selected');
                            d3.selectAll(
                                `.link[data-source='${platform}']`
                            ).attr('class', 'link selected');
                        });
                    }
                }
                if (d.type === 'sequencing_platform') {
                    d.sourceLinks.forEach((link) => {
                        d3.selectAll(
                            `.link[data-source='${link.target.name}']`
                        ).attr('class', 'link selected');
                    });
                }
                if (d.type === 'molecular_feature') {
                    d3.selectAll(`.link[data-target='${d.name}']`).attr(
                        'class',
                        'link selected'
                    );
                } else {
                    d3.selectAll(`.link[data-source='${d.name}']`).attr(
                        'class',
                        'link selected'
                    );
                }
            };
            const unhighlight = (e, d) => {
                if (d.type === 'data_generator') {
                    const platforms = graph.platforms[d.name];
                    for (const platform in platforms) {
                        platforms[platform].forEach((assay_type) => {
                            d3.selectAll(
                                `.link[data-source='${assay_type}'][data-target='${platform}']`
                            ).attr('class', 'link');
                            d3.selectAll(
                                `.link[data-source='${platform}']`
                            ).attr('class', 'link');
                        });
                    }
                }
                if (d.type === 'sequencing_platform') {
                    d.sourceLinks.forEach((link) => {
                        d3.selectAll(
                            `.link[data-source='${link.target.name}']`
                        ).attr('class', 'link');
                    });
                }
                if (d.type === 'molecular_feature') {
                    d3.selectAll(`.link[data-target='${d.name}']`).attr(
                        'class',
                        'link'
                    );
                } else {
                    d3.selectAll(`.link[data-source='${d.name}']`).attr(
                        'class',
                        'link'
                    );
                }
            };

            // add in the nodes
            const node = svg
                .append('g')
                .selectAll('.node')
                .data(graph.nodes)
                .enter()
                .append('g')
                .attr('class', 'node')
                .attr('category', (d) => d.category ?? '')
                .attr('id', (d) => d.name)
                .attr('transform', function (d) {
                    return 'translate(' + d.x + ',' + d.y + ')';
                })
                .on('mouseover', highlight)
                .on('mouseleave', unhighlight)
                .call(
                    d3
                        .drag()
                        .subject(function (d) {
                            return d;
                        })
                        .on('start', function (event, d) {
                            // When the element is dragged, use d3.pointer
                            // to correct the position
                            d.oldy = d3.pointer(event, this)[1];
                            d3.select(this).attr('transform', (d) => {
                                d.drag_event_start = event.y;
                                return 'translate(' + d.x + ',' + d.y + ')';
                            });

                            frontElt
                                .attr('href', `#${d.name}`)
                                .attr('class', 'node');
                        })
                        .on('drag', dragmove)
                );

            // add the rectangles for the nodes
            node.append('rect')
                .attr('tabindex', function (d) {
                    return '0';
                })
                .attr('height', (d) => d.dy)
                .attr('width', sankey.nodeWidth())
                .style('fill', function (d) {
                    // return 'gray'
                    if (d.type === 'data_generator') {
                        d.color = color_schemes['data_generator'](d.name);
                        return d.color;
                    }
                    if (d.type === 'assay_type') {
                        d.color = color_schemes['assay_type'](d.name);
                        return d.color;
                    }
                    if (d.type === 'sequencing_platform') {
                        d.color = color_schemes['sequencing_platform'](d.name);
                        return d.color;
                    }
                    if (d.type === 'molecular_feature') {
                        d.color = color_schemes['molecular_feature'][
                            d.category
                        ](d.name);
                    }
                    return d.color;
                })
                .style('stroke', function (d) {
                    return d3.rgb(d.color).darker(1);
                })
                .on('focus', highlight)
                .on('focusout', unhighlight)
                // Add hover text
                .append('title', function (d) {
                    return d.name;
                });

            // Append titles for nodes
            node.append('text')
                .attr('x', (d) => {
                    switch (d.type) {
                        case 'data_generator':
                            return -6;
                        case 'molecular_feature':
                            return sankey.nodeWidth() + 10;
                        default:
                            return -6;
                    }
                })
                .attr('y', function (d) {
                    return d.dy / 2;
                })
                .attr('dy', '.35em')
                .attr('text-anchor', (d) =>
                    d.type === 'molecular_feature' ? '' : 'end'
                )
                .attr('class', 'node-header')
                .attr('transform', null)
                .text(function (d) {
                    // Show either the display_name or the name
                    return d.display_name ?? d.name;
                });

            // the function for moving the nodes
            function dragmove(event, d) {
                if (event.y > 0 && event.y < height) {
                    const delta = d.oldy - d3.pointer(event, this)[1];

                    d3.select(this).attr(
                        'transform',
                        'translate(' + d.x + ',' + (d.y -= delta) + ')'
                    );
                    sankey.relayout();
                    link.attr('d', sankey.link());
                }
            }

            const frontElt = svg
                .append('use')
                .attr('id', 'use')
                .attr('href', '');
        }

        return () => {
            isDrawn.current = true; // use cleanup function to prevent rerender
        };
    }, []);

    return (
        <div className="alluvial-container container py-sm-5">
            <div>
                <Tabs
                    defaultActiveKey="alluvial"
                    className="mb-3 float-right"
                    variant="pills">
                    <Tab
                        className="alluvial"
                        eventKey="alluvial"
                        title="Alluvial view">
                        <div ref={containerRef}></div>
                        <div className="footnote">
                            Technologies and assays are proposed and are not
                            final.
                        </div>
                    </Tab>
                    <Tab
                        className="stackrow-table"
                        eventKey="table"
                        title="Table view">
                        <StackRowTable data={tableData} />
                    </Tab>
                </Tabs>
            </div>
        </div>
    );
};
