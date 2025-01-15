import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import { sankeyFunc } from './sankey';

import fixed_data from './data/alluvial_data.json';

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

    const graph = { ...fixed_data };

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

            const margin = { top: 200, right: 200, bottom: 50, left: 100 },
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
                .attr('transform', 'translate(' + 640 + ',' + 20 + ')')
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

            /**
             * Render a series of square elements whose colors are defined by
             * [color_array], along with a text element [category_name] to its
             * left. Position this group with [paddingTop] and [offset] which
             * are relative to the containing svg.
             * @param {string} category_name The text to appear to the left
             * @param {string[]} color_array colors for the squares (in order)
             * @param {number} paddingTop space (in px) above the group
             * @param {number} offset space (in px) to the left of the group
             */
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
                        .attr('width', 15)
                        .attr('height', 15)
                        .attr('fill', color)
                        .attr('stroke', d3.rgb(color).darker(1))
                        .attr(
                            'transform',
                            'translate(' +
                                (160 + 20 * i) +
                                ',' +
                                paddingTop +
                                ')'
                        );
                });
            };

            // Legend rows for GCC/TTD Column
            legend_row('GCC', [color_schemes.data_generator('GCC')], 0, -60);
            legend_row('TTD', [color_schemes.data_generator('TTD')], 30, -60);

            // Legend rows for Assay Groups
            legend_row(
                'Whole Genome',
                [
                    graph.colors.assay_group['1-1'],
                    graph.colors.assay_group['1-2'],
                    graph.colors.assay_group['1-3'],
                ],
                0,
                523
            );
            legend_row('NT-Seq', [graph.colors.assay_group['2-1']], 30, 523);
            legend_row('Hi-C', [graph.colors.assay_group['3-1']], 60, 523);
            legend_row(
                'Whole Transcriptome',
                [
                    graph.colors.assay_group['4-1'],
                    graph.colors.assay_group['4-2'],
                ],
                90,
                523
            );

            // Legend rows for Molecular Features
            legend_row(
                'Genetic',
                graph.colors.genetic,
                0,
                width - margin.right + 125
            );
            legend_row(
                'Epigenetic',
                graph.colors.epigenetic,
                30,
                width - margin.right + 125
            );
            legend_row(
                'Transcriptomic',
                graph.colors.transcriptomic,
                60,
                width - margin.right + 125
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
                            d.source.data_generator_category
                        );
                        return d.source.color;
                    }
                    if (d.source.type === 'assay_type') {
                        d.source.color =
                            graph.colors['assay_group'][d.source.assay_group];
                        return d.source.color;
                    }
                    if (d.source.type === 'sequencing_platform') {
                        d.source.color = color_schemes['sequencing_platform'](
                            d.source.name
                        );
                        return d.source.color;
                    }
                    if (d.source.type === 'molecular_feature') {
                        d.source.color = color_schemes['molecular_feature'](
                            d.source.name
                        );
                    }
                    return d.source.color;
                })
                .style('stroke-width', function (d) {
                    return 10; // constant stroke width
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
                .attr('category', (d) => {
                    return d?.category ?? '';
                })
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
                            d3.select(this)
                                .attr('transform', (d) => {
                                    d.drag_event_start = event.y;
                                    return 'translate(' + d.x + ',' + d.y + ')';
                                })
                                .raise();
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
                    if (d.type === 'data_generator') {
                        d.color = color_schemes['data_generator'](
                            d.data_generator_category
                        );
                        return d.color;
                    }
                    if (d.type === 'assay_type') {
                        d.color = graph.colors['assay_group'][d.assay_group];
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
        }

        return () => {
            isDrawn.current = true; // use cleanup function to prevent rerender
        };
    }, []);

    return (
        <div className="alluvial-container container py-sm-5">
            <p className="visualization-warning d-block d-sm-none">
                <span>Note:</span> for the best experience, please view the
                visualization below on a tablet or desktop.
            </p>
            <div className="alluvial">
                <div ref={containerRef}></div>
                <div className="footnote">
                    Technologies and assays are proposed and are not final.
                </div>
            </div>
        </div>
    );
};
