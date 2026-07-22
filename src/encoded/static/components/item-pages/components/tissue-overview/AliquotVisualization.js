'use strict';

import React, { useEffect, useId, useRef, useState } from 'react';
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
        idPrefix: '3J',
        caption: 'Tissue metadata from pathology reports.',
    },
    yellow: {
        label: 'Frozen',
        front: '#CFE89B',
        top: '#E3F3BE',
        side: '#B6D978',
        border: '#6C8A42',
        idPrefix: '3I',
        caption: 'Core and DNA/RNA metadata from sequencing.',
    },
};

const FROZEN_GRID_ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const FROZEN_GRID_COLS = [1, 2, 3, 4, 5, 6];
const DEFAULT_FROZEN_CORE_WELLS = ['A1', 'C2'];

const PATHOLOGY_REPORT_PROPTYPE = PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.shape({
        '@id': PropTypes.string,
        display_title: PropTypes.string,
    }),
]);

// `reports` entries come back as a bare @id string in the @@object frame, or
// a full embedded object (with display_title) in /search/'s embedded frame
// -- render whichever shape shows up as a comma-separated list of links.
function PathologyReportLinks({ reports }) {
    return reports.map((report, reportIndex) => {
        const reportHref = typeof report === 'string' ? report : report?.['@id'];
        const reportLabel =
            typeof report === 'object' ? report?.display_title || 'View' : 'View';
        return (
            <React.Fragment key={reportHref || reportIndex}>
                {reportIndex > 0 ? ', ' : ''}
                <a href={reportHref}>{reportLabel}</a>
            </React.Fragment>
        );
    });
}

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
    idPrefix,
}) {
    const [selectedSliceIndex, setSelectedSliceIndex] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const popoverId = useId();
    function handleHidePopover() {
        setSelectedSliceIndex(null);
        setSelectedTarget(null);
    }

    // `slices` can swap out from under an open popover -- e.g. the
    // illustrative fallback set while real TissueSamples are still loading,
    // then the real (differently-ordered/sized) set once they arrive. A
    // held-over index would then point at an unrelated slice in the new
    // array, so close the popover whenever the array changes -- but not on
    // the initial mount (the effect still fires once then, after commit,
    // and would otherwise clobber a popover opened by a very fast first
    // click before this effect gets to run).
    const isFirstSlicesRender = useRef(true);
    useEffect(() => {
        if (isFirstSlicesRender.current) {
            isFirstSlicesRender.current = false;
            return;
        }
        handleHidePopover();
    }, [slices]);

    const heightPx = 172;
    const depthX = 72;
    const depthY = 58;
    const sliceBase = 86;
    const typeCounters = { pink: 0, yellow: 0 };
    const normalizedSlices = slices.map((slice) => {
        const type = slice.type === 'pink' ? 'pink' : 'yellow';
        const typeIndex = typeCounters[type]++;
        return {
            ...slice,
            type,
            typeIndex,
            sequenceLabel: String(typeIndex + 1).padStart(3, '0'),
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
    const selectedStyles = SLICE_TYPE_STYLES[selectedSlice?.type || 'yellow'];
    const selectedAliquotId = selectedSlice
        ? `${idPrefix || selectedStyles.idPrefix}-${selectedSlice.sequenceLabel}`
        : null;
    const selectedFrozenWells =
        selectedSlice?.frozenCoreWells || DEFAULT_FROZEN_CORE_WELLS;
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
                                <text
                                    className="slice-inline-label slice-sequence-label"
                                    x={slice.frontLabelX}
                                    y={
                                        showSliceLabels
                                            ? slice.frontLabelY - 10
                                            : slice.frontLabelY
                                    }>
                                    {slice.sequenceLabel}
                                </text>
                                {showSliceLabels ? (
                                    <text
                                        className="slice-inline-label"
                                        x={slice.frontLabelX}
                                        y={slice.frontLabelY + 10}>
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
                    rootCloseEvent="mousedown"
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
                                {selectedAliquotId} &middot; {selectedStyles.label}{' '}
                                Slice
                            </PopoverHeader>
                            <PopoverBody>
                                <div className="aliquot-popover-visual">
                                    {selectedSlice?.type === 'pink' ? (
                                        <span
                                            className="aliquot-visual-swatch"
                                            style={{
                                                backgroundColor: selectedStyles.front,
                                                borderColor: selectedStyles.border,
                                            }}
                                        />
                                    ) : (
                                        <span className="aliquot-visual-grid-wrap">
                                            <span className="aliquot-grid-row-with-labels">
                                                <span className="aliquot-grid-row-labels">
                                                    {FROZEN_GRID_ROWS.map((row) => (
                                                        <span
                                                            className="aliquot-grid-row-label"
                                                            key={row}>
                                                            {row}
                                                        </span>
                                                    ))}
                                                </span>
                                                <span className="aliquot-visual-grid">
                                                    {FROZEN_GRID_ROWS.map((row) => (
                                                        <span
                                                            className="aliquot-grid-row"
                                                            key={row}>
                                                            {FROZEN_GRID_COLS.map((col) => {
                                                                const wellId = `${row}${col}`;
                                                                return (
                                                                    <span
                                                                        key={wellId}
                                                                        className={
                                                                            'aliquot-grid-well' +
                                                                            (selectedFrozenWells.includes(
                                                                                wellId
                                                                            )
                                                                                ? ' is-highlighted'
                                                                                : '')
                                                                        }
                                                                    />
                                                                );
                                                            })}
                                                        </span>
                                                    ))}
                                                </span>
                                            </span>
                                            <span className="aliquot-grid-col-labels">
                                                {FROZEN_GRID_COLS.map((col) => (
                                                    <span
                                                        className="aliquot-grid-col-label"
                                                        key={col}>
                                                        {col}
                                                    </span>
                                                ))}
                                            </span>
                                        </span>
                                    )}
                                </div>
                                <p className="aliquot-popover-caption">
                                    {selectedStyles.caption}
                                </p>
                                {selectedSlice?.type === 'yellow' && selectedFrozenWells.length > 0 ? (
                                    <div className="aliquot-popover-cores">
                                        {selectedFrozenWells.map((wellId, wellIndex) => (
                                            <div
                                                className="aliquot-popover-row"
                                                key={wellId}>
                                                <span>
                                                    {selectedSlice?.submissionCenter ||
                                                        `GCC${wellIndex + 1}`}
                                                </span>
                                                <strong>
                                                    {selectedAliquotId}
                                                    {wellId}
                                                </strong>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="aliquot-popover-row">
                                    <span>Type</span>
                                    <strong>{selectedStyles.label}</strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Order</span>
                                    <strong>
                                        {(selectedSlice?.index || 0) + 1} /{' '}
                                        {normalizedSlices.length}
                                    </strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>{selectedStyles.label} #</span>
                                    <strong>{selectedSlice?.sequenceLabel}</strong>
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
                                {selectedSlice?.type === 'pink' &&
                                selectedSlice?.pathologyReports ? (
                                        selectedSlice.pathologyReports.length > 0 ? (
                                            <div className="aliquot-popover-pathology">
                                                <div className="aliquot-popover-row">
                                                    <span>Pathology</span>
                                                    <strong>
                                                        <PathologyReportLinks
                                                            reports={
                                                                selectedSlice.pathologyReports
                                                            }
                                                        />
                                                    </strong>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="aliquot-popover-pathology-empty">
                                                Pathology: no report yet.
                                            </p>
                                        )
                                    ) : null}
                                {selectedSlice?.type === 'yellow' &&
                                selectedSlice?.associatedPathologyReports &&
                                selectedSlice.associatedPathologyReports.length ===
                                    0 ? (
                                    // Field is present (real sample) but empty --
                                    // no Fixed counterpart has been linked for
                                    // this tissue block yet. Distinct from demo/
                                    // illustrative slices, where the field is
                                    // absent entirely and nothing is shown.
                                        <p className="aliquot-popover-pathology-empty">
                                            Pathology: no linked Fixed sample yet.
                                        </p>
                                    ) : null}
                                {selectedSlice?.associatedPathologyReports?.length > 0 ? (
                                    <div className="aliquot-popover-pathology">
                                        {selectedSlice.associatedPathologyReports.map(
                                            (entry, entryIndex) => (
                                                <div
                                                    className="aliquot-popover-row"
                                                    key={
                                                        entry.fixed_sample_external_id ||
                                                        entryIndex
                                                    }>
                                                    <span>
                                                        Pathology (
                                                        {entry.fixed_sample_external_id})
                                                    </span>
                                                    <strong>
                                                        {entry.pathology_reports?.length > 0 ? (
                                                            <PathologyReportLinks
                                                                reports={
                                                                    entry.pathology_reports
                                                                }
                                                            />
                                                        ) : (
                                                            'No report yet'
                                                        )}
                                                    </strong>
                                                </div>
                                            )
                                        )}
                                    </div>
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
    idPrefix: PropTypes.string,
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
            frozenCoreWells: PropTypes.arrayOf(PropTypes.string),
            associatedPathologyReports: PropTypes.arrayOf(
                PropTypes.shape({
                    fixed_sample_external_id: PropTypes.string,
                    pathology_reports: PropTypes.arrayOf(PATHOLOGY_REPORT_PROPTYPE),
                })
            ),
            pathologyReports: PropTypes.arrayOf(PATHOLOGY_REPORT_PROPTYPE),
            submissionCenter: PropTypes.string,
        })
    ).isRequired,
};

AliquotVisualization.defaultProps = {
    title: null,
    showSliceLabels: false,
    className: null,
    idPrefix: null,
    dimensions: null,
};
