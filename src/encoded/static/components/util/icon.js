'use strict';

import React from 'react';

export const RightArrowIcon = ({ fill, stemLength = 20 }) => {
    // The stem rectangle's right edge stays fixed at 21 - it's always
    // hidden beneath the arrowhead, which this prop doesn't affect.
    const stemLeftEdge = 21 - stemLength;
    const capBulgeX = stemLeftEdge - 1;
    const viewBoxMinX = Math.min(0, capBulgeX);
    const viewBoxWidth = 22 - viewBoxMinX;

    return (
        <svg
            width={viewBoxWidth}
            height="16"
            viewBox={`${viewBoxMinX} 0 ${viewBoxWidth} 16`}
            fill={fill}
            xmlns="http://www.w3.org/2000/svg">
            <path
                d={`M${stemLeftEdge} 7C${capBulgeX + 0.447715} 7 ${capBulgeX} 7.44772 ${capBulgeX} 8C${capBulgeX} 8.55228 ${capBulgeX + 0.447715} 9 ${stemLeftEdge} 9V7ZM21.7071 8.70711C22.0976 8.31658 22.0976 7.68342 21.7071 7.29289L15.3431 0.928932C14.9526 0.538408 14.3195 0.538408 13.9289 0.928932C13.5384 1.31946 13.5384 1.95262 13.9289 2.34315L19.5858 8L13.9289 13.6569C13.5384 14.0474 13.5384 14.6805 13.9289 15.0711C14.3195 15.4616 14.9526 15.4616 15.3431 15.0711L21.7071 8.70711ZM${stemLeftEdge} 9H21V7H${stemLeftEdge}V9Z`}
            />
        </svg>
    );
};