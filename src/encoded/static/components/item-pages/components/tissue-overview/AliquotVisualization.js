'use strict';

import React, { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Popover, PopoverBody, PopoverHeader } from 'react-bootstrap';
import { Overlay } from 'react-bootstrap';

const SLICE_TYPE_STYLES = {
    pink: {
        label: 'Fixed',
        front: '#F2C4A8',
        top: '#F8D9C6',
        side: '#E6B18C',
        border: '#9D6A45',
    },
    yellow: {
        label: 'Frozen',
        front: '#CFE89B',
        top: '#E3F3BE',
        side: '#B6D978',
        border: '#6C8A42',
    },
};

function buildSliceGeometry({
    widthPx,
    heightPx,
    depthX,
    depthY,
    slices,
}) {
    let currentX = 0;
    return slices.map((slice, index) => {
        const width = slice.widthPx;
        const x0 = currentX;
        const x1 = currentX + width;
        currentX = x1;

        return {
            ...slice,
            index,
            frontPoints: `${x0},${depthY} ${x1},${depthY} ${x1},${depthY + heightPx} ${x0},${depthY + heightPx}`,
            topPoints: `${x0},${depthY} ${x0 + depthX},0 ${x1 + depthX},0 ${x1},${depthY}`,
            sidePoints: `${x1},${depthY} ${x1 + depthX},0 ${x1 + depthX},${heightPx} ${x1},${depthY + heightPx}`,
            frontLabelX: x0 + width / 2,
            frontLabelY: depthY + heightPx / 2,
            x0,
            x1,
        };
    });
}

function DimensionArrow({
    x1,
    y1,
    x2,
    y2,
    label,
    labelX,
    labelY,
    textAnchor = 'middle',
}) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const arrowLength = 10;
    const arrowWidth = 4.5;
    const startArrowPoints = [
        `${x1},${y1}`,
        `${x1 + ux * arrowLength + px * arrowWidth},${y1 + uy * arrowLength + py * arrowWidth}`,
        `${x1 + ux * arrowLength - px * arrowWidth},${y1 + uy * arrowLength - py * arrowWidth}`,
    ].join(' ');
    const endArrowPoints = [
        `${x2},${y2}`,
        `${x2 - ux * arrowLength + px * arrowWidth},${y2 - uy * arrowLength + py * arrowWidth}`,
        `${x2 - ux * arrowLength - px * arrowWidth},${y2 - uy * arrowLength - py * arrowWidth}`,
    ].join(' ');

    return (
        <g className="aliquot-dimension">
            <line x1={x1} y1={y1} x2={x2} y2={y2} />
            <polygon points={startArrowPoints} />
            <polygon points={endArrowPoints} />
            <text x={labelX} y={labelY} textAnchor={textAnchor}>
                {label}
            </text>
        </g>
    );
}

function offsetLine(x1, y1, x2, y2, distance) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;

    return {
        x1: x1 + nx * distance,
        y1: y1 + ny * distance,
        x2: x2 + nx * distance,
        y2: y2 + ny * distance,
        nx,
        ny,
    };
}

function midpoint(x1, y1, x2, y2) {
    return {
        x: (x1 + x2) / 2,
        y: (y1 + y2) / 2,
    };
}

export default function AliquotVisualization({
    title,
    slices,
    dimensions,
    showSliceLabels,
    className,
}) {
    const [selectedSliceIndex, setSelectedSliceIndex] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const popoverId = useId();
    function handleHidePopover() {
        setSelectedSliceIndex(null);
        setSelectedTarget(null);
    }

    const heightPx = 172;
    const depthX = 72;
    const depthY = 58;
    const sliceBase = 86;
    const normalizedSlices = slices.map((slice) => {
        return {
            ...slice,
            type: slice.type === 'pink' ? 'pink' : 'yellow',
            widthCm: typeof slice.widthCm === 'number' ? slice.widthCm : 1,
            widthPx:
                (typeof slice.widthCm === 'number' ? slice.widthCm : 1) *
                sliceBase,
        };
    });
    const widthPx = normalizedSlices.reduce(
        (sum, slice) => sum + slice.widthPx,
        0
    );
    const totalWidthCm = normalizedSlices.reduce(
        (sum, slice) => sum + slice.widthCm,
        0
    );
    const geometry = buildSliceGeometry({
        widthPx,
        heightPx,
        depthX,
        depthY,
        slices: normalizedSlices,
    });
    const viewBoxMinX = -76;
    const viewBoxMinY = -42;
    const viewBoxWidth = widthPx + depthX + 180;
    const viewBoxHeight = heightPx + depthY + 168;
    const {
        heightCm = 1,
        depthCm = 1.5,
        widthLabel = `${totalWidthCm} cm`,
        heightLabel = `${heightCm} cm`,
        depthLabel = `${depthCm} cm`,
    } = dimensions || {};

    const selectedSlice =
        selectedSliceIndex === null ? null : normalizedSlices[selectedSliceIndex];
    const topDepthOffset = 12;
    const rightOffset = -12;
    const topDimensionLine = offsetLine(
        depthX,
        0,
        depthX + widthPx,
        0,
        -topDepthOffset
    );
    const heightDimensionLine = offsetLine(
        widthPx + depthX,
        0,
        widthPx + depthX,
        heightPx,
        rightOffset
    );
    const depthDimensionLine = offsetLine(
        0,
        depthY,
        depthX,
        0,
        -topDepthOffset
    );
    const topMidpoint = midpoint(
        topDimensionLine.x1,
        topDimensionLine.y1,
        topDimensionLine.x2,
        topDimensionLine.y2
    );
    const heightMidpoint = midpoint(
        heightDimensionLine.x1,
        heightDimensionLine.y1,
        heightDimensionLine.x2,
        heightDimensionLine.y2
    );
    const depthMidpoint = midpoint(
        depthDimensionLine.x1,
        depthDimensionLine.y1,
        depthDimensionLine.x2,
        depthDimensionLine.y2
    );

    return (
        <div className={'aliquot-visualization' + (className ? ` ${className}` : '')}>
            {title ? <div className="aliquot-title">{title}</div> : null}
            <div className="aliquot-canvas-wrap">
                <svg
                    className="aliquot-canvas"
                    viewBox={`${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth} ${viewBoxHeight}`}
                    role="img"
                    aria-label="Aliquot slice visualization">
                    <DimensionArrow
                        x1={topDimensionLine.x1 + 8}
                        y1={topDimensionLine.y1}
                        x2={topDimensionLine.x2 - 8}
                        y2={topDimensionLine.y2}
                        label={widthLabel}
                        labelX={topMidpoint.x}
                        labelY={topMidpoint.y - 14}
                    />
                    <DimensionArrow
                        x1={depthDimensionLine.x1}
                        y1={depthDimensionLine.y1}
                        x2={depthDimensionLine.x2}
                        y2={depthDimensionLine.y2}
                        label={depthLabel}
                        labelX={depthMidpoint.x - 28}
                        labelY={depthMidpoint.y - 10}
                        textAnchor="start"
                    />

                    <g className="aliquot-box-outline">
                        <polygon
                            points={`0,${depthY} ${depthX},0 ${depthX + widthPx},0 ${widthPx},${depthY}`}
                        />
                        <polygon
                            points={`${widthPx},${depthY} ${widthPx + depthX},0 ${widthPx + depthX},${heightPx} ${widthPx},${depthY + heightPx}`}
                        />
                    </g>

                    {geometry.map((slice) => {
                        const styles = SLICE_TYPE_STYLES[slice.type];
                        return (
                            <g
                                key={slice.id || slice.index}
                                className={
                                    'aliquot-slice' +
                                    (selectedSliceIndex === slice.index
                                        ? ' is-selected'
                                        : '')
                                }>
                                <polygon
                                    className="slice-face slice-top"
                                    points={slice.topPoints}
                                    fill={styles.top}
                                    stroke={styles.border}
                                />
                                <polygon
                                    className="slice-face slice-side"
                                    points={slice.sidePoints}
                                    fill={styles.side}
                                    stroke={styles.border}
                                />
                                <polygon
                                    className="slice-face slice-front"
                                    points={slice.frontPoints}
                                    fill={styles.front}
                                    stroke={styles.border}
                                />
                                <foreignObject
                                    x={slice.x0}
                                    y={depthY}
                                    width={slice.widthPx}
                                    height={heightPx}>
                                    <button
                                        type="button"
                                        className="aliquot-slice-hitarea"
                                        onClick={(event) => {
                                            setSelectedSliceIndex(slice.index);
                                            setSelectedTarget(event.currentTarget);
                                        }}
                                        aria-label={`View details for ${slice.label || styles.label} slice ${slice.index + 1}`}>
                                        <span className="visually-hidden">
                                            {slice.label || styles.label}
                                        </span>
                                    </button>
                                </foreignObject>
                                {showSliceLabels ? (
                                    <text
                                        className="slice-inline-label"
                                        x={slice.frontLabelX}
                                        y={slice.frontLabelY}>
                                        {slice.widthCm} cm
                                    </text>
                                ) : null}
                            </g>
                        );
                    })}
                    <DimensionArrow
                        x1={heightDimensionLine.x1}
                        y1={heightDimensionLine.y1 + 8}
                        x2={heightDimensionLine.x2}
                        y2={heightDimensionLine.y2 - 4}
                        label={heightLabel}
                        labelX={heightMidpoint.x + 14}
                        labelY={heightMidpoint.y}
                        textAnchor="start"
                    />
                </svg>
                <Overlay
                    show={!!selectedSlice && !!selectedTarget}
                    target={selectedTarget}
                    placement="right"
                    rootClose
                    // eslint-disable-next-line react/jsx-no-bind
                    onHide={handleHidePopover}>
                    {/* Overlay requires a render prop here. */}
                    {/* eslint-disable-next-line react/jsx-no-bind */}
                    {(overlayProps) => (
                        <Popover
                            {...overlayProps}
                            id={`${popoverId}-slice-popover`}
                            className="aliquot-popover">
                            <PopoverHeader as="h3">
                                {selectedSlice?.label ||
                                    SLICE_TYPE_STYLES[selectedSlice?.type || 'yellow']
                                        .label}{' '}
                                Slice
                            </PopoverHeader>
                            <PopoverBody>
                                <div className="aliquot-popover-row">
                                    <span>Type</span>
                                    <strong>
                                        {
                                            SLICE_TYPE_STYLES[
                                                selectedSlice?.type || 'yellow'
                                            ].label
                                        }
                                    </strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Order</span>
                                    <strong>
                                        {(selectedSlice?.index || 0) + 1} /{' '}
                                        {normalizedSlices.length}
                                    </strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Width</span>
                                    <strong>{selectedSlice?.widthCm} cm</strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Height</span>
                                    <strong>{heightCm} cm</strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Depth</span>
                                    <strong>{depthCm} cm</strong>
                                </div>
                                {selectedSlice?.description ? (
                                    <p className="aliquot-popover-description">
                                        {selectedSlice.description}
                                    </p>
                                ) : null}
                            </PopoverBody>
                        </Popover>
                    )}
                </Overlay>
            </div>
            <div className="aliquot-legend">
                {Object.entries(SLICE_TYPE_STYLES).map(([key, styles]) => (
                    <div className="aliquot-legend-item" key={key}>
                        <span
                            className={`legend-swatch ${key}`}
                            style={{ backgroundColor: styles.front }}
                        />
                        <span>
                            {styles.label}
                            {key === 'pink' ? ' = 0.5 cm default' : ' = 1 cm default'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

AliquotVisualization.propTypes = {
    title: PropTypes.string,
    showSliceLabels: PropTypes.bool,
    className: PropTypes.string,
    dimensions: PropTypes.shape({
        heightCm: PropTypes.number,
        depthCm: PropTypes.number,
        widthLabel: PropTypes.string,
        heightLabel: PropTypes.string,
        depthLabel: PropTypes.string,
    }),
    slices: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string,
            type: PropTypes.oneOf(['pink', 'yellow']).isRequired,
            label: PropTypes.string,
            description: PropTypes.string,
            widthCm: PropTypes.number,
        })
    ).isRequired,
};

AliquotVisualization.defaultProps = {
    title: null,
    showSliceLabels: false,
    className: null,
    dimensions: null,
};
