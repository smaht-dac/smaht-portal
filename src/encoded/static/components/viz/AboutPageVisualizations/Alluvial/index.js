import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import alluvial_data from './data/alluvial_data.json';

import { sankeyFunc } from './sankey';
import { ShowHideInformationToggle } from '../../../item-pages/components/file-overview/ShowHideInformationToggle';

/**
 * `formatData` organizes a list of nodes and links into a format that can be
 * used by the d3 sankey function. Prevents the need for manual numbering of
 * nodes and links, and instead uses the index of the node in the list as
 * its node index.
 * @param {Array} node_list A list of un-numbered nodes
 * @param {Array} link_list A list of links between nodes
 * @returns an object containing (`nodes`) and (`links`) objects
 */
const formatData = (node_list, link_list) => {
    // Number nodes and links
    const numbered_node_list = node_list.map((node, i) => {
        return {
            ...node,
            node: i,
        };
    });

    // Create a map of node names to node numbers
    const node_map_array = {};
    numbered_node_list.forEach((node) => {
        node_map_array[node.name] = node.node;
    });

    // Replace named links with numbered links
    const numbered_links = link_list.map((link) => {
        return {
            source: node_map_array[link.source],
            target: node_map_array[link.target],
            value: link.value,
        };
    });

    return {
        nodes: numbered_node_list,
        links: numbered_links,
    };
};

const AlluvialPlotHeader = ({ legendRef }) => {
    return (
        <div className="alluvial-header">
            <div className="header-items d-flex justify-content-between">
                <span>GCC/TTD</span>
                <span>Sequencing Platform</span>
                <span>Assay Type</span>
                <span>Molecular Features</span>
            </div>
            <ShowHideInformationToggle
                useToggle={true}
                defaultShow={true}
                expandedText="Hide Legend"
                collapsedText="Show Legend"
                expandedIcon="minus"
                collapsedIcon="plus">
                <div ref={legendRef}></div>
            </ShowHideInformationToggle>
        </div>
    );
};

/**
 * The Alluvial component renders a visualization of the distribution of
 * technologies that are being used, the kind of assay types done on those
 * techonlogies, and finally, the molecular features that can be profiled
 * using them.
 */
export const Alluvial = () => {
    const isDrawn = useRef(false);

    const { nodes: numbered_nodes, links: numbered_links } = formatData(
        alluvial_data.nodes,
        alluvial_data.links
    );

    const graph = {
        ...alluvial_data,
        nodes: numbered_nodes,
        links: numbered_links,
    };

    // Create ref for appending d3 visualization and to the DOM
    const containerRef = useRef(null);

    // Create ref for legend
    const legendRef = useRef(null);

    // Run after JSX renders (for the ref), then add to the DOM
    useEffect(() => {
        if (graph && containerRef.current && isDrawn.current === false) {
            const color_schemes = {
                data_generator: d3
                    .scaleOrdinal()
                    .domain(
                        graph.nodes.filter((n) => n.type === 'data_generator')
                    )
                    .range(graph.colors.data_generator),
                sequencing_platform: d3
                    .scaleOrdinal()
                    .domain(
                        graph.nodes.filter(
                            (n) => n.type === 'sequencing_platform'
                        )
                    )
                    .range(graph.colors.sequencing_platform),
                molecular_feature: {
                    genetic: d3
                        .scaleOrdinal()
                        .domain(
                            graph.nodes.filter((n) => n.category === 'genetic')
                        )
                        .range(graph.colors.genetic),
                    epigenetic: d3
                        .scaleOrdinal()
                        .domain(
                            graph.nodes.filter(
                                (n) => n.category === 'epigenetic'
                            )
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

            const container = containerRef.current;
            const legendContainer = legendRef.current;

            const margin = { top: 40, right: 150, bottom: 20, left: 50 },
                width = 1200 - margin.left - margin.right,
                height = 800 - margin.top - margin.bottom;

            // append the svg object to the body of the page
            const svgContainer = d3
                .select(container)
                .append('svg')
                .attr('class', 'alluvial-svg')
                .attr('viewBox', '0,0,1200,800')
                .attr('width', width + margin.left + margin.right)
                .attr('height', height + margin.top + margin.bottom);

            /**
             * A legend for the columns
             */
            const legend = d3
                .select(legendContainer)
                .append('svg')
                .attr('viewBox', '0,0,1200,200')
                .append('g')
                .attr('transform', 'translate(' + 0 + ',' + 0 + ')');

            /**
             * Renders a series of square elements whose colors are defined by
             * [color_array], along with a text element [category_name] to its
             * left. Positions this group with [paddingTop] and [offset] which
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
                const squareHeight = 12;
                const horizontalGap = 10 + squareHeight;

                const row = legend
                    .append('g')
                    .attr('transform', 'translate(' + offset + ',' + 20 + ')');

                row.append('text')
                    .text(category_name)
                    .attr('fill', 'rgb(58, 58, 58)')
                    .attr('text-anchor', 'end')
                    .attr(
                        'transform',
                        'translate(' +
                            40 +
                            ',' +
                            (paddingTop + squareHeight) +
                            ')'
                    );

                color_array.forEach((color, i) => {
                    row.append('rect')
                        .attr('width', squareHeight)
                        .attr('height', squareHeight)
                        .attr('fill', color)
                        .attr('stroke', d3.rgb(color).darker(1))
                        .attr(
                            'transform',
                            'translate(' +
                                (50 + horizontalGap * i) +
                                ',' +
                                paddingTop +
                                ')'
                        );
                });
            };

            // Legend rows for GCC/TTD Column
            legend_row('GCC', [color_schemes.data_generator('GCC')], 0, 0);
            legend_row('TTD', [color_schemes.data_generator('TTD')], 20, 0);

            // Legend rows for Assay Groups
            legend_row(
                'Bulk WGS',
                [graph.colors.assay_group['Bulk WGS']],
                0,
                702
            );
            legend_row(
                'Bulk Whole Transcriptome',
                [graph.colors.assay_group['Bulk whole transcriptome']],
                20,
                702
            );
            legend_row(
                'Duplex-Seq',
                [graph.colors.assay_group['Duplex-Seq']],
                40,
                702
            );
            legend_row(
                'Single-cell WGS',
                [graph.colors.assay_group['Single-cell WGS']],
                60,
                702
            );
            legend_row(
                'Targeted Sequencing',
                [graph.colors.assay_group['Targeted Sequencing']],
                80,
                702
            );
            legend_row(
                'Single-nuclear transcriptome',
                [graph.colors.assay_group['Single-nuclear transcriptome']],
                100,
                702
            );
            legend_row(
                'Single-cell transcriptome',
                [graph.colors.assay_group['Single-cell transcriptome']],
                120,
                702
            );
            legend_row('Other', [graph.colors.assay_group['Other']], 140, 702);

            // Legend rows for Molecular Features
            legend_row('Genetic', graph.colors.genetic, 0, 1055);
            legend_row('Epigenetic', graph.colors.epigenetic, 20, 1055);
            legend_row('Transcriptomic', graph.colors.transcriptomic, 40, 1055);

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
                .nodePadding(5)
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
                    return 8; // constant stroke width
                })
                .sort(function (a, b) {
                    return b.dy - a.dy;
                })
                .on('mouseover', (e, d) => {})
                .on('mouseleave', (e, d) => {});

            /**
             * Highlights the links corresponding to the node that is hovered over.
             * @param {*} e the event object
             * @param {*} d the data associated with the node
             *
             * Note: relies on the graph.platforms object. The object key must match
             * the node name in order to highlight the corresponding links.
             */
            const highlight = (e, d) => {
                switch (d.type) {
                    case 'data_generator':
                        // Highlight links sources from this data_generator
                        d3.selectAll(`.link[data-source='${d.name}']`).attr(
                            'class',
                            'link selected'
                        );
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
                        break;
                    case 'sequencing_platform':
                        d3.selectAll(`.link[data-source='${d.name}']`).attr(
                            'class',
                            'link selected'
                        );
                        d.sourceLinks.forEach((link) => {
                            d3.selectAll(
                                `.link[data-source='${link.target.name}']`
                            ).attr('class', 'link selected');
                        });
                        break;
                    case 'molecular_feature':
                        d3.selectAll(`.link[data-target='${d.name}']`).attr(
                            'class',
                            'link selected'
                        );
                        break;
                    case 'assay_type':
                        d3.selectAll(`.link[data-source='${d.name}']`).attr(
                            'class',
                            'link selected'
                        );
                        break;
                    default:
                        break;
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
                <AlluvialPlotHeader legendRef={legendRef} />
                <div ref={containerRef}></div>
                <div className="footnote">
                    Technologies and assays are proposed and are not final.
                </div>
            </div>
        </div>
    );
};
