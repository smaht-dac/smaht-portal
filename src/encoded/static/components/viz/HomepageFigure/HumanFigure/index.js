import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import { HumanOutline } from './HumanOutline';
import { Brain } from './Brain';
import { Lung } from './Lung';
import { Liver } from './Liver';

export const HumanFigure = ({ currentTier }) => {
    const humanFigureContainerRef = useRef(null);
    const humanFigureOutlineRef = useRef(null);

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
                <HumanOutline currentTier={currentTier} />
                <Brain currentTier={currentTier} />
                <Lung currentTier={currentTier} />
                <Liver currentTier={currentTier} />
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
