import React, { useRef, useEffect } from 'react';
import * as d3 from "d3";

import graphData from "./data/alluvial_data.json";
import tableData from './data/stackrow_data.json';
import colorSchemes from './data/alluvial_color_schemes.json';

import { sankeyFunc } from './util/sankey';
import { getMousePosition } from './util/getMousePosition';
import { StackRowTable } from './StackRowTable';

import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';

/**
 * Sankey Plot:
 * The information that the sankey plot should show is the distribution of technologies 
 * that are being used, the kind of assay types done on those techonlogies, and finally,
 * the molecular features that can be profiled using them.
 */


/**
 * Component for rendering the svg containing the sankey plot.
 * @returns 
*/
let isDrawn;
export const Alluvial = () => {
    const graph = {...graphData}
    
    // Create ref for appending d3 visualization to the DOM
    const containerRef = useRef(null);
    isDrawn = false;
    // Run after JSX renders (for the ref), then add to the DOM
    useEffect(() => {
        const color_schemes = {
            "data_generator": d3.scaleOrdinal()
                                .domain(graph.nodes.filter(n => n.type === "data_generator"))
                                .range(colorSchemes.data_generator),
            "sequencing_platform": d3.scaleOrdinal()
                                     .domain(graph.nodes.filter(n => n.type === "sequencing_platform"))
                                     .range(colorSchemes.sequencing_platform),
            "assay_type": d3.scaleOrdinal()
                            .domain(graph.nodes.filter(n => n.type === "assay_type"))
                            .range(colorSchemes.assay_type),
            "molecular_feature": {
                "genetic": d3.scaleOrdinal()
                                .domain(graph.nodes.filter(n => n.category === "genetic"))
                                .range(colorSchemes.genetic),
                "epigenetic": d3.scaleOrdinal()
                                .domain(graph.nodes.filter(n => n.category === "epigenetic"))
                                .range(colorSchemes.epigenetic),
                "transcriptomic": d3.scaleOrdinal()
                                    .domain(graph.nodes.filter(n => n.category === "transcriptomic"))
                                    .range(colorSchemes.transcriptomic)
            }
        };

        if (graph && containerRef.current && !isDrawn) {
            const container = containerRef.current;


            // Loading in th sankey plot example from: 
            // set the dimensions and margins of the graph
            const margin = {top: 150, right: 200, bottom: 50, left: 100},
            width = 1200 - margin.left - margin.right,
            height = 700 - margin.top - margin.bottom;

            // append the svg object to the body of the page
            const svgContainer = d3.select(container).append("svg")
                    .attr("class", "sankey-svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)


            /**
             * Headers for the columns
             */
            const header_row = svgContainer.append('g')
            header_row.attr('transform', 'translate(' + 10 + ',' + 0 + ')');
            
            header_row.append('text')
                      .attr('class', 'header')
                      .attr('transform', 'translate(' + 70 + ',' + 20 + ')')
                      .text("GCC/TTD")

            header_row.append('text')
                      .attr('class', 'header')
                      .attr('transform', 'translate(' + 315 + ',' + 20 + ')')
                      .text("Sequencing Platform")

            header_row.append('text')
                      .attr('class', 'header')
                      .attr('transform', 'translate(' + 645 + ',' + 20 + ')')
                      .text("Assay Type")

            header_row.append('text')
                      .attr('class', 'header')
                      .attr('transform', 'translate(' + 910 + ',' + 20 + ')')
                      .text("Molecular Features")
                      

            /**
             * A legend for the columns
             */
            const legend = svgContainer.append("g")
                              .attr("width", width + margin.left + margin.right)
                              .attr("height", margin.top)
                              


            const legend_row = (category_name, color_array, paddingTop=0, offset=0) => {
                const row = legend.append("g").attr("transform",
                "translate(" + offset + "," + 50 + ")");

                row.append('text')
                   .text(category_name)
                   .style('text-anchor', "end")
                   .attr("transform", "translate(" + 150 + "," + (paddingTop + 15) + ")");
                color_array.forEach((color, i) => {
                    row.append('rect')
                          .attr('width', 20)
                          .attr('height', 20)
                          .attr('fill', color)
                          .attr('stroke', d3.rgb(color).darker(1))
                          .attr("transform", "translate(" + 160 + "," + paddingTop + ")");
                });
            }

            legend_row("genetic", colorSchemes.genetic, 0, (width - margin.right + 120));
            legend_row("epigenetic", colorSchemes.epigenetic, 30, (width - margin.right + 120));
            legend_row("transcriptomic", colorSchemes.transcriptomic, 60, (width - margin.right + 120));
            
            // legend_row("GCC", colorSchemes.genetic, 0, margin.left);
            // legend_row("TTD", colorSchemes.epigenetic, 30, margin.left);

            const svg = svgContainer.append("g")
                                    .attr("transform",
                                        "translate(" + margin.left + "," + margin.top + ")");

            // Set the sankey diagram properties
            const sankey = sankeyFunc()
                .nodeWidth(25)
                .nodePadding(10)
                .size([width, height]);

            // Constructs a new Sankey generator with the default settings.
            sankey
            .nodes(graph.nodes)
            .links(graph.links)
            .layout(1);

            // add in the links
            const link = svg.append("g")
            .selectAll(".link")
            .data(graph.links)
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("d", sankey.link() )
            .attr("data-source", function(d) { return d.source.name } )
            .attr("data-target", function(d) { return d.target.name } )
            .attr("data-source_data_generator", d => d.source_data_generator)
            .style("stroke", function(d) {
                // return 'gray'
                if (d.source.type === "data_generator") {
                    d.source.color = color_schemes["data_generator"](d.source.name)
                    // d.source.color = 'hsla(186, 70%, 50%, 1)';
                    return d.source.color;
                }
                if (d.source.type === "assay_type") {
                    d.source.color = color_schemes["assay_type"](d.source.name)
                    return d.source.color;
                }
                if (d.source.type === "sequencing_platform") {
                    d.source.color = color_schemes["sequencing_platform"](d.source.name)
                    return d.source.color;
                }
                d.source.color = color_schemes["molecular_feature"](d.source.name)
                return d.source.color
            })
            .style("stroke-width", function(d) {
                return 15 // constant stroke width
            })
            .sort(function(a, b) { return b.dy - a.dy; })
            .on("mouseover", (e,d) => {
            })
            .on("mouseleave", (e, d) => {
            })


            // add in the nodes
            const node = svg.append("g")
            .selectAll(".node")
            .data(graph.nodes)
            .enter().append("g")
            .attr("class", "node")
            .attr("category", (d) => d.category ?? "")
            .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
            .on("mouseover", (e, d) => {
                if (d.type === "data_generator") {
                    // highlight the links with source=platform and target=assay_type
                    let platforms = graph.platforms[d.name];
                    for (let platform in platforms) {
                        platforms[platform].forEach((assay_type) => {
                            d3.selectAll(`.link[data-source='${assay_type}'][data-target='${platform}']`)
                              .attr("class", "link selected")
                            d3.selectAll(`.link[data-source='${platform}']`)
                              .attr("class", "link selected")
                        })
                    }
                }
                if (d.type === "sequencing_platform") {
                    d.sourceLinks.forEach((link) => {
                        d3.selectAll(`.link[data-source='${link.target.name}']`)
                          .attr("class", "link selected")
                    })
                }
                if (d.type === "molecular_feature") {
                    d3.selectAll(`.link[data-target='${d.name}']`)
                      .attr("class", "link selected")
                }
                else {
                    d3.selectAll(`.link[data-source='${d.name}']`)
                      .attr("class", "link selected")
                }
            })
            .on("mouseleave", (e, d) => {
                if (d.type === "data_generator") {
                    let platforms = graph.platforms[d.name];
                    for (let platform in platforms) {
                        platforms[platform].forEach((assay_type) => {
                            d3.selectAll(`.link[data-source='${assay_type}'][data-target='${platform}']`)
                              .attr("class", "link")
                            d3.selectAll(`.link[data-source='${platform}']`)
                              .attr("class", "link")
                        })
                    }
                }
                if (d.type === "sequencing_platform") {
                    d.sourceLinks.forEach((link) => {
                        d3.selectAll(`.link[data-source='${link.target.name}']`)
                          .attr("class", "link")
                    })
                }
                if (d.type === "molecular_feature") {
                    d3.selectAll(`.link[data-target='${d.name}']`)
                      .attr("class", "link")
                }
                else {
                    d3.selectAll(`.link[data-source='${d.name}']`)
                      .attr("class", "link")
                }
            })
            .call(d3.drag()
                .subject(function(d) { return d; })
                .on("start", function(event, d) {
                    // When the element is dragged, use svg.getMousePosition()
                    // to correct the position
                    const newPos = getMousePosition(event.sourceEvent, event.sourceEvent.target);

                    d3.select(this)
                      .attr("transform", (d) => {
                        d.drag_event_start = event.y;
                        // return "translate(" + d.x + "," + (d.y = event.y - newPos.y) + ")"
                        return "translate(" + d.x + "," + d.y + ")"

                    });
                })
                .on("drag", dragmove))

            // add the rectangles for the nodes
            node
                .append("rect")
                .attr("height", d =>  d.dy)
                .attr("width", sankey.nodeWidth())
                .style("fill", function(d) {
                    // return 'gray'
                    if (d.type === "data_generator") {
                        d.color = color_schemes["data_generator"](d.name);
                        // d.color = 'hsla(186, 70%, 50%, 1)';
                        return d.color;
                    }
                    if (d.type === "assay_type") {
                        d.color = color_schemes["assay_type"](d.name)
                        return d.color;
                    }
                    if (d.type === "sequencing_platform") {
                        d.color = color_schemes["sequencing_platform"](d.name)
                        return d.color;
                    }
                    if (d.type === "molecular_feature") {
                        d.color = color_schemes["molecular_feature"][d.category](d.name);
                    }
                    // d.color = color_schemes["molecular_feature"][d.category] ?? color_schemes["sequencing_platform"](d.name)
                    return d.color
                })
                .style("stroke", function(d) { return d3.rgb(d.color).darker(1); })
                // Add hover text
                .append("title", function(d) { return d.name})

            // The color for the pattern
            node
                .append('rect')
                .attr('width', sankey.nodeWidth())
                .style('fill', (d) => {
                    return d.color
                })
                .style('stroke', 'black')

            // Append titles for nodes
            node
                .append("text")
                .attr("x", (d) => {

                    switch (d.type) {
                        case "data_generator":
                            return -6;
                        case "molecular_feature":
                            return sankey.nodeWidth() + 10;
                        default:
                            return -6;
                    }
                })
                .attr("y", function(d) { return d.dy / 2; })
                .attr("dy", ".35em")
                .attr("text-anchor", d => d.type === "molecular_feature" ? "" : "end")
                .attr('class', 'node-header')
                .attr("transform", null)
                .text(function(d) { return d.name; })


            // the function for moving the nodes
            function dragmove(event, d) {
                d3.select(this)
                .attr("transform", "translate(" + d.x + "," + (d.y = Math.max( 0, Math.min(height - d.dy, event.y))) + ")");

                sankey.relayout();
                link.attr("d", sankey.link() );

                // console.log(event.sourceEvent.offsetY)

                // const rect = d3.select(this)._groups[0][0];
                // const newPos = getMousePosition(event.sourceEvent, rect);

                // console.log("d: ", d.y, "newPos: ", newY, "sum: ", Math.ceil(d.y + newY))

                // console.log("new d.y = ", (d.y + newPos.y) - d.y );

                // Calculate the new y coordinate of the rectangle
                // console.log("@@ ", parseInt(d.drag_event_start - event.y), d.drag_event_start)
                // let newY = 

                // d3.select(this)
                //   .attr("transform", "translate(" + d.x + "," + d.y + ")");

                // Get the transformation matrix to accurately reflect mouse position

                
                // sankey.relayout();
                // link.attr("d", sankey.link() );
            }
        }

        return () => {
            isDrawn = true; // use cleanup function to prevent rerender
        }

    },[]);


    return (
        <div>
            <Tabs
                defaultActiveKey="alluvial"
                className="mb-3 float-right"
                variant="pills"
            >
                <Tab eventKey="alluvial" title="Alluvial view">
                    <div ref={containerRef}></div>
                    <div className="footnote">
                        Technologies and assays are proposed and are not final.
                    </div>
                </Tab>
                <Tab eventKey="table" title="Table view">
                    <StackRowTable data={tableData} />
                </Tab>
            </Tabs>
        </div>
    )
}