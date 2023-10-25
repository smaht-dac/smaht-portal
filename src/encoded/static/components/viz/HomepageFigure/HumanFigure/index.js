import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import { HumanOutline } from './HumanOutline';
import { Brain } from './Brain';

export const HumanFigure = ({ currentTier, setCurrentTier }) => {
    console.log('HumanFigure rerender');
    const humanFigureContainerRef = useRef(null);
    const humanFigureOutlineRef = useRef(null);

    // const colors = {
    //     Benchmarking: {
    //         'outline-path-container': '#6e1423',
    //         'outline-path-border': '#a71e34',
    //         'outline-path': '#e01e37',
    //     },
    //     Expansion: {
    //         'outline-path-container': '#fdb833',
    //         'outline-path-border': '#ffd53e',
    //         'outline-path': '#fff75e',
    //     },
    //     Production: {
    //         'outline-path-container': '#03045e',
    //         'outline-path-border': '#00b4d8',
    //         'outline-path': '#caf0f8',
    //     },
    // };

    // useEffect(() => {
    //     const container = d3.select(humanFigureContainerRef.current);

    //     // set dimensions for svg
    //     const margin = { top: 20, right: 20, bottom: 20, left: 20 };
    //     const width = 500 - margin.left - margin.right;
    //     const height = 800 - margin.top - margin.bottom;

    //     // const svgContainer = container.append('svg')
    //     //                               .attr('width', width + margin.left + margin.right + 'px')
    //     //                               .attr('height', height + margin.top + margin.bottom + 'px')
    //     //                               .attr('viewBox', '0,0,500,800');

    //     const humanFigureOutline = d3.select(humanFigureOutlineRef.current);

    //     // Select the popover container
    //     const popover = d3
    //         .select('#popover-container')
    //         .style('transform', 'none');

    //     // humanFigureOutline.on('mouseover', (e) => {

    //     //     const d = d3.select(e.target);

    //     // popover.style('border', '2px solid ' + colors[currentTier][d.attr('data-svg-role')])
    //     //        .style('left', e.clientX + "px")
    //     //        .style('top', e.clientY + "px")
    //     //        .style('transform', 'none')
    //     //        .style('opacity', "1")

    //     // humanFigureOutline.append('circle')
    //     //     .attr('r', 5)
    //     //     .attr('cx', d => e.offsetX)
    //     //     .attr('cy', d => e.offsetY)
    //     //     .attr('fill', colors[currentTier][d.attr('data-svg-role')])
    //     // })
    //     // .on('click', (e) => {
    //     //     const d = d3.select(e.target);

    //     //     // if (d.attr('data-svg-role') === "outline-path") {
    //     //         popover.style('border', '2px solid ' + colors[currentTier][d.attr('data-svg-role')])
    //     //                .style('left', e.clientX + "px")
    //     //                .style('top', e.clientY + "px")
    //     //                .style('transform', 'none')
    //     //                .style('display', "block")
    //     //     // }
    //     // })
    //     // .on('mouseout', (e) => {
    //     //     const d = d3.select(e.target);
    //     //     popover.style('border', '2px solid ' + colors[currentTier][d.attr('data-svg-role')])
    //     // });
    // }, [currentTier]);

    return (
        <div className="human-figure-container" ref={humanFigureContainerRef}>
            <svg
                id="human-figure-svg"
                data-svg-role="outline-path-container"
                ref={humanFigureOutlineRef}
                width="233"
                height="674"
                viewBox="0 0 233 674"
                fill="none"
                xmlns="http://www.w3.org/2000/svg">
                <HumanOutline />
                <Brain />
                <defs>
                    <filter
                        id="filter0_d_214_1284"
                        x="0.5"
                        y="0.5"
                        width="232"
                        height="673"
                        filterUnits="userSpaceOnUse"
                        colorInterpolationFilters="sRGB">
                        <feFlood floodOpacity="0" result="BackgroundImageFix" />
                        <feColorMatrix
                            in="SourceAlpha"
                            type="matrix"
                            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
                            result="hardAlpha"
                        />
                        <feOffset dy="4" />
                        <feGaussianBlur stdDeviation="6" />
                        <feComposite in2="hardAlpha" operator="out" />
                        <feColorMatrix
                            type="matrix"
                            values="0 0 0 0 0.611765 0 0 0 0 0.780392 0 0 0 0 0.937255 0 0 0 0.25 0"
                        />
                        <feBlend
                            mode="normal"
                            in2="BackgroundImageFix"
                            result="effect1_dropShadow_214_1284"
                        />
                        <feBlend
                            mode="normal"
                            in="SourceGraphic"
                            in2="effect1_dropShadow_214_1284"
                            result="shape"
                        />
                    </filter>
                    <linearGradient
                        id="paint0_linear_214_1284"
                        x1="116.5"
                        y1="9"
                        x2="116.5"
                        y2="657"
                        gradientUnits="userSpaceOnUse">
                        <stop offset="0.0001" stopColor="#EFFFFF" />
                        <stop offset="1" stopColor="white" stopOpacity="0.49" />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    );
};
