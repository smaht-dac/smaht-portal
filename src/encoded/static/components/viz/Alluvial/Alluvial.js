import React, { useRef, useEffect } from 'react';
import * as d3 from "d3";
import graph from "../data/alluvial-data.json";
import { sankeyFunc } from './util/sankey';


import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';


/**
 * Component for rendering
 * @returns 
*/
let isDrawn;
export const Alluvial = () => {
    
    const containerRef = useRef(null);
    isDrawn = false;
    
    
    // Run after JSX renders (for the ref), then add to the DOM
    useEffect(() => {

        if (graph && containerRef.current && !isDrawn) {
            const container = containerRef.current;

            // Loading in th sankey plot example from: 
            // set the dimensions and margins of the graph
            var margin = {top: 10, right: 10, bottom: 10, left: 10},
            width = 1200 - margin.left - margin.right,
            height = 800 - margin.top - margin.bottom;

            // append the svg object to the body of the page
            var svg = d3.select(container).append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .append("g")
                    .attr("transform",
                        "translate(" + margin.left + "," + margin.top + ")");

            // Append a <defs> element for the pattern
            const defs = svg.append('defs')
               
            defs.append('pattern') // Add diagonal line pattern
                .attr('id', 'diagonalStripes')
                .attr('width', '5')
                .attr('height', '5')
                .attr('patternTransform', 'rotate(45 0 0)')
                .attr('patternUnits', 'userSpaceOnUse')
                .append('line')
                .attr('x1', '0')
                .attr('y1', '0')
                .attr('x2', '0')
                .attr('y2', '10')
                .style('stroke-width', '2')
                .style('stroke', 'black')

            defs.append('pattern') // dots pattern
                .attr('id', 'dots')
                .attr('width', '3')
                .attr('height', '3')
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('x', '0')
                .attr('y', '0')
                .append('circle')
                .attr('cx', '2')
                .attr('cy', '2')
                .attr('r', '.5')
                .attr('fill', 'black')
                .attr('fill-opactity', '1')

            
            // Color scale used
            var color = d3.scaleOrdinal(d3.schemeTableau10);

            // Set the sankey diagram properties
            var sankey = sankeyFunc()
                .nodeWidth(20)
                .nodePadding(10)
                .size([width, height]);

            // Constructs a new Sankey generator with the default settings.
            sankey
            .nodes(graph.nodes)
            .links(graph.links)
            .layout(1);

            // add in the links
            var link = svg.append("g")
            .selectAll(".link")
            .data(graph.links)
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("d", sankey.link() )
            .attr("data-source", function(d) { return d.source.name } )
            .style("stroke", function(d) { return d.color = color(d.source.name.replace(/ .*/, "")); })
            .style("stroke-width", function(d) { return Math.max(1, d.dy); })
            .sort(function(a, b) { return b.dy - a.dy; })

            // add in the nodes
            var node = svg.append("g")
            .selectAll(".node")
            .data(graph.nodes)
            .enter().append("g")
            .attr("class", "node")
            .attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; })
            .on("mouseover", (e, d) => {
                d3.selectAll(`.link[data-source='${d.name}']`)
                  .style("stroke-opacity", "0.8")
            })
            .on("mouseleave", (e, d) => {
                d3.selectAll(`.link[data-source='${d.name}']`)
                  .style("stroke-opacity", "0.2")
            })
            .call(d3.drag()
                .subject(function(d) { return d; })
                .on("start", function() { this.parentNode.appendChild(this); })
                .on("drag", dragmove))

            // add the rectangles for the nodes
            node
                .append("rect")
                .attr("height", function(d) { return d.dy; })
                .attr("width", sankey.nodeWidth())
                .style("fill", function(d) { return d.color = color(d.name.replace(/ .*/, "")); })
                .style("stroke", function(d) { return d3.rgb(d.color).darker(2); })
                // Add hover text
                .append("title", function(d) { return d.name})
                // .text(function(d) { return d.name + "\n" + "There is " + d.value + " stuff in this node"; });
                
            // The color for the pattern
            node
                .append('rect')
                .attr('height', function(d) { return d.dy; })
                .attr('width', sankey.nodeWidth())
                // .style('fill', 'url(#dots)')
                .style('fill', 'url(#diagonalStripes)')
                .style('stroke', 'black')

            // add in the title for the nodes
            node
                .append("text")
                .attr("x", -6)
                .attr("y", function(d) { return d.dy / 2; })
                .attr("dy", ".35em")
                .attr("text-anchor", "end")
                .attr("transform", null)
                .text(function(d) { console.log(d);return d.name; })
                .filter(function(d) { return d.x < width / 2; })
                .attr("x", 6 + sankey.nodeWidth())
                .attr("text-anchor", "start");

            // the function for moving the nodes
            function dragmove(event, d) {
                d3.select(this)
                .attr("transform", "translate(" + d.x + "," + (d.y = Math.max( 0, Math.min(height - d.dy, event.y))) + ")");
                
                sankey.relayout();
                link.attr("d", sankey.link() );
            }
        }

        return () => {
            isDrawn = true;
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
                    <div className='headers d-flex'>
                        <h4 className="header-left">Data Generators</h4>
                        <h4 className="header-center">Sequencing Platform / Assay Type</h4>
                        <h4 className="header-right">Molecular Features Profiled</h4>
                    </div>
                    <div ref={containerRef}></div>
                </Tab>
                <Tab eventKey="table" title="Table view">
                    <div className="text-center pt-5">Display alluvial data in a table here.</div>  
                </Tab>
            </Tabs>
        </div>
    )
}

