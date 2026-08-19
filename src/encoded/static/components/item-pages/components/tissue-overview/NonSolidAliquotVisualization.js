'use strict';

import React, { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Popover, PopoverBody, PopoverHeader } from 'react-bootstrap';
import { Overlay } from 'react-bootstrap';

// liquidColor renders as an actual filled tube -- unlike the categorical
// colors used for icons/bubbles elsewhere (chosen only to be mutually
// distinguishable in a chart legend, per smaht_tissue_colors.json), this
// one reads as "what's really in the tube", so it's picked to resemble the
// real specimen's own appearance instead. Blood's official color (#FF382E)
// happens to already look like blood, so it doubles as both; buccal swab's
// official color (a dark maroon, #75001F) does not -- a buccal swab is a
// cheek-cell/saliva suspension, pale and faintly cloudy, not blood-red, so
// using the categorical color here would misleadingly read as a blood vial.
const SPECIMEN_TYPE_STYLES = {
    blood: {
        label: 'Blood',
        liquidColor: '#FF382E',
        idPrefix: '3A',
        caption: 'Core and DNA/RNA metadata from sequencing.',
    },
    buccal: {
        label: 'Buccal Swab',
        liquidColor: '#F0D9C4',
        idPrefix: '3B',
        caption: 'Core and DNA/RNA metadata from sequencing.',
    },
    // Cultured cell suspension, not a sliced solid-tissue block -- treated
    // as non-solid like blood/buccal swab even though item_utils/tissue.py's
    // get_category() puts it under "Mesoderm" (a germ-layer grouping, not a
    // specimen-form one) rather than "Clinically Accessible" (see
    // TissueView.js/TissueTypeView.js's nonSolidSpecimenType). liquidColor
    // is a rose-pink, resembling the phenol-red cell-culture medium
    // fibroblasts are actually stored/shipped in, not the official
    // categorical FBRO color (a pale yellow with no such association).
    fibroblast: {
        label: 'Fibroblast',
        liquidColor: '#E8829A',
        idPrefix: '3AC',
        caption: 'Core and DNA/RNA metadata from sequencing.',
    },
};

const MAIN_TUBE = { width: 32, bodyHeight: 78, capHeight: 11, capOverhang: 5 };
const SUB_TUBE = { width: 20, bodyHeight: 46, capHeight: 8, capOverhang: 4 };
const POPOVER_TUBE = { width: 26, bodyHeight: 58, capHeight: 9, capOverhang: 4 };

const COLUMN_GAP = 58;
const BRANCH_HEIGHT = 36;
const SEQUENCE_LABEL_GAP = 20;
const GCC_BRANCH_HEIGHT = 26;
const GCC_LABEL_GAP = 16;

// Flat top, rounded bottom corners -- an actual test-tube silhouette
// rather than a pill (uniform border-radius would round the top too).
function tubeBodyPath(x, y, width, height) {
    const r = width / 2;
    return [
        `M ${x} ${y}`,
        `L ${x + width} ${y}`,
        `L ${x + width} ${y + height - r}`,
        `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
        `L ${x + r} ${y + height}`,
        `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
        'Z',
    ].join(' ');
}

function TubeIcon({
    x,
    y,
    width,
    bodyHeight,
    capHeight,
    capOverhang,
    clipId,
    liquidColor,
    fillLevel = 0.62,
}) {
    const capX = x - capOverhang;
    const capWidth = width + capOverhang * 2;
    const bodyTop = y + capHeight;
    const bodyPath = tubeBodyPath(x, bodyTop, width, bodyHeight);
    const liquidTop = bodyTop + bodyHeight * (1 - fillLevel);
    const tickCount = 3;

    return (
        <g className="nonsolid-tube-icon">
            <clipPath id={clipId}>
                <path d={bodyPath} />
            </clipPath>
            <path className="tube-glass" d={bodyPath} />
            <rect
                className="tube-liquid"
                x={x}
                y={liquidTop}
                width={width}
                height={bodyTop + bodyHeight - liquidTop}
                fill={liquidColor}
                clipPath={`url(#${clipId})`}
            />
            <rect
                className="tube-liquid-sheen"
                x={x + width * 0.16}
                y={liquidTop + 3}
                width={width * 0.2}
                height={Math.max(bodyTop + bodyHeight - liquidTop - 6, 0)}
                clipPath={`url(#${clipId})`}
            />
            <g className="tube-ticks" clipPath={`url(#${clipId})`}>
                {Array.from({ length: tickCount }, (unused, tickIndex) => {
                    const tickY = bodyTop + ((tickIndex + 1) * bodyHeight) / (tickCount + 1);
                    return (
                        <line
                            key={tickIndex}
                            x1={x + width * 0.18}
                            y1={tickY}
                            x2={x + width * 0.5}
                            y2={tickY}
                        />
                    );
                })}
            </g>
            <path className="tube-outline" d={bodyPath} />
            <rect
                className="tube-cap"
                x={capX}
                y={y}
                width={capWidth}
                height={capHeight}
                rx={Math.min(3, capHeight / 2)}
            />
            <line
                className="tube-cap-sheen"
                x1={capX + capWidth * 0.18}
                y1={y + capHeight * 0.3}
                x2={capX + capWidth * 0.18}
                y2={y + capHeight * 0.75}
            />
        </g>
    );
}

export default function NonSolidAliquotVisualization({
    title,
    aliquots,
    specimenType,
    idPrefix,
    className,
}) {
    const [selectedAliquotIndex, setSelectedAliquotIndex] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState(null);
    const popoverId = useId();
    function handleHidePopover() {
        setSelectedAliquotIndex(null);
        setSelectedTarget(null);
    }

    // See AliquotVisualization.js's equivalent effect: `aliquots` can swap
    // from the illustrative fallback to real data mid-session, and a held
    // index would then point at an unrelated entry in the new array. Skips
    // the initial mount firing so a fast first click isn't clobbered by this
    // effect running (deferred, after commit) right afterward.
    const isFirstAliquotsRender = useRef(true);
    useEffect(() => {
        if (isFirstAliquotsRender.current) {
            isFirstAliquotsRender.current = false;
            return;
        }
        handleHidePopover();
    }, [aliquots]);

    const styles = SPECIMEN_TYPE_STYLES[specimenType] || SPECIMEN_TYPE_STYLES.blood;
    const resolvedIdPrefix = idPrefix || styles.idPrefix;

    const normalizedAliquots = aliquots.map((aliquot, index) => {
        // `submissionCenter` (see TissueView.js's nonSolidAliquots) is
        // already null for a TPC-only real record, same treatment
        // AliquotVisualization.js gives TPC entries elsewhere -- distinct
        // from `hasOnlyTpcSubmission`, which flags *why* it's null so this
        // can say so honestly instead of falling through to the generic
        // "GCCN" placeholder meant only for illustrative demo data (which
        // has neither field set at all).
        const displayCenterLabel = aliquot.submissionCenter
            ? aliquot.submissionCenter
            : aliquot.hasOnlyTpcSubmission
                ? 'No files yet'
                : `GCC${index + 1}`;
        return {
            ...aliquot,
            index,
            sequenceLabel: String(index + 1).padStart(3, '0'),
            displayCenterLabel,
        };
    });

    const columnWidth = SUB_TUBE.width + COLUMN_GAP;
    // viewBox height is fixed regardless of aliquot count (tube/branch/label
    // heights don't vary), so a real tissue with just 1-2 samples -- the
    // common case for blood/buccal -- would otherwise get a much narrower
    // canvas than the demo data while keeping the same height, distorting
    // the aspect ratio and making the tube look oversized. Flooring at 2
    // columns keeps proportions stable regardless of real aliquot count.
    const totalWidth = Math.max(normalizedAliquots.length * columnWidth, 2 * columnWidth);
    // Centers the actual column group when it's narrower than the width
    // floor above (e.g. a single real aliquot in a 2-column-wide frame) --
    // otherwise the lone tube would sit at the first column's slot instead
    // of the canvas center.
    const columnsGroupOffsetX =
        (totalWidth - normalizedAliquots.length * columnWidth) / 2;
    const mainTubeX = totalWidth / 2 - MAIN_TUBE.width / 2;
    const mainTubeY = 0;
    const mainTubeBottomY = mainTubeY + MAIN_TUBE.capHeight + MAIN_TUBE.bodyHeight;

    const subTubeY = mainTubeBottomY + BRANCH_HEIGHT;
    const subTubeBottomY = subTubeY + SUB_TUBE.capHeight + SUB_TUBE.bodyHeight;
    const sequenceLabelY = subTubeBottomY + SEQUENCE_LABEL_GAP;
    const gccLabelY = sequenceLabelY + GCC_BRANCH_HEIGHT + GCC_LABEL_GAP;

    const viewBoxHeight = gccLabelY + 12;

    const selectedAliquot =
        selectedAliquotIndex === null ? null : normalizedAliquots[selectedAliquotIndex];
    const selectedAliquotId = selectedAliquot
        ? `${resolvedIdPrefix}-${selectedAliquot.sequenceLabel}`
        : null;

    return (
        <div
            className={
                'aliquot-visualization nonsolid-aliquot-visualization' +
                (className ? ` ${className}` : '')
            }>
            {title ? <div className="aliquot-title">{title}</div> : null}
            <div className="aliquot-canvas-wrap">
                <svg
                    className="aliquot-canvas nonsolid-canvas"
                    viewBox={`0 -6 ${totalWidth} ${viewBoxHeight}`}
                    role="img"
                    aria-label="Non-solid tissue aliquot visualization">
                    <TubeIcon
                        x={mainTubeX}
                        y={mainTubeY}
                        {...MAIN_TUBE}
                        clipId={`${popoverId}-main-tube-clip`}
                        liquidColor={styles.liquidColor}
                        fillLevel={0.72}
                    />
                    {normalizedAliquots.map((aliquot) => {
                        const subTubeX =
                            columnsGroupOffsetX +
                            aliquot.index * columnWidth +
                            columnWidth / 2 -
                            SUB_TUBE.width / 2;
                        const subTubeCenterX = subTubeX + SUB_TUBE.width / 2;
                        return (
                            <g className="nonsolid-branch-group" key={aliquot.id || aliquot.index}>
                                <line
                                    className="nonsolid-branch-line"
                                    x1={mainTubeX + MAIN_TUBE.width / 2}
                                    y1={mainTubeBottomY}
                                    x2={subTubeCenterX}
                                    y2={subTubeY}
                                />
                                <TubeIcon
                                    x={subTubeX}
                                    y={subTubeY}
                                    {...SUB_TUBE}
                                    clipId={`${popoverId}-tube-clip-${aliquot.index}`}
                                    liquidColor={styles.liquidColor}
                                />
                                <foreignObject
                                    x={subTubeX - 6}
                                    y={subTubeY - 4}
                                    width={SUB_TUBE.width + 12}
                                    height={SUB_TUBE.capHeight + SUB_TUBE.bodyHeight + 8}>
                                    <button
                                        type="button"
                                        className="nonsolid-aliquot-hitarea"
                                        onClick={(event) => {
                                            setSelectedAliquotIndex(aliquot.index);
                                            setSelectedTarget(event.currentTarget);
                                        }}
                                        aria-label={`View details for ${styles.label} aliquot ${aliquot.sequenceLabel}`}>
                                        <span className="visually-hidden">
                                            {styles.label} aliquot {aliquot.sequenceLabel}
                                        </span>
                                    </button>
                                </foreignObject>
                                <text
                                    className="nonsolid-sequence-label"
                                    x={subTubeCenterX}
                                    y={sequenceLabelY}>
                                    {aliquot.sequenceLabel}
                                </text>
                                <line
                                    className="nonsolid-branch-line"
                                    x1={subTubeCenterX}
                                    y1={sequenceLabelY + 4}
                                    x2={subTubeCenterX}
                                    y2={sequenceLabelY + 4 + GCC_BRANCH_HEIGHT}
                                />
                                <text
                                    className={
                                        'nonsolid-gcc-label' +
                                        (aliquot.hasOnlyTpcSubmission ? ' is-empty' : '')
                                    }
                                    x={subTubeCenterX}
                                    y={gccLabelY}>
                                    {aliquot.displayCenterLabel}
                                </text>
                            </g>
                        );
                    })}
                </svg>
                <Overlay
                    show={!!selectedAliquot && !!selectedTarget}
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
                            id={`${popoverId}-aliquot-popover`}
                            className="aliquot-popover">
                            <PopoverHeader as="h3">
                                {selectedAliquotId} &middot; {styles.label} Aliquot
                            </PopoverHeader>
                            <PopoverBody>
                                <div className="aliquot-popover-visual">
                                    <svg
                                        className="nonsolid-popover-tube-canvas"
                                        viewBox={`0 0 ${POPOVER_TUBE.width + 12} ${
                                            POPOVER_TUBE.capHeight + POPOVER_TUBE.bodyHeight + 6
                                        }`}>
                                        <TubeIcon
                                            x={6}
                                            y={0}
                                            {...POPOVER_TUBE}
                                            clipId={`${popoverId}-detail-tube-clip`}
                                            liquidColor={styles.liquidColor}
                                            fillLevel={0.68}
                                        />
                                    </svg>
                                </div>
                                <p className="aliquot-popover-caption">{styles.caption}</p>
                                <div className="aliquot-popover-cores">
                                    <div className="aliquot-popover-row">
                                        {selectedAliquot?.gccFilesHref ? (
                                            <a
                                                href={selectedAliquot.gccFilesHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="View this GCC's files for this donor & tissue">
                                                {selectedAliquot.displayCenterLabel}
                                            </a>
                                        ) : (
                                            <span
                                                className={
                                                    selectedAliquot?.hasOnlyTpcSubmission
                                                        ? 'aliquot-popover-pathology-empty'
                                                        : undefined
                                                }>
                                                {selectedAliquot?.displayCenterLabel}
                                            </span>
                                        )}
                                        {selectedAliquot?.filesHref ? (
                                            <a
                                                href={selectedAliquot.filesHref}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`View ${selectedAliquotId}'s own files`}>
                                                <strong>{selectedAliquotId}</strong>
                                            </a>
                                        ) : (
                                            <strong>{selectedAliquotId}</strong>
                                        )}
                                    </div>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Type</span>
                                    <strong>{styles.label}</strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Order</span>
                                    <strong>
                                        {(selectedAliquot?.index || 0) + 1} /{' '}
                                        {normalizedAliquots.length}
                                    </strong>
                                </div>
                                {selectedAliquot?.description ? (
                                    <p className="aliquot-popover-description">
                                        {selectedAliquot.description}
                                    </p>
                                ) : null}
                            </PopoverBody>
                        </Popover>
                    )}
                </Overlay>
            </div>
            <div className="aliquot-legend">
                <div className="aliquot-legend-item">
                    <span
                        className="legend-swatch"
                        style={{ backgroundColor: styles.liquidColor }}
                    />
                    <span>{styles.label} aliquot, one tube per collection</span>
                </div>
            </div>
        </div>
    );
}

NonSolidAliquotVisualization.propTypes = {
    title: PropTypes.string,
    className: PropTypes.string,
    specimenType: PropTypes.oneOf(['blood', 'buccal', 'fibroblast']),
    idPrefix: PropTypes.string,
    aliquots: PropTypes.arrayOf(
        PropTypes.shape({
            id: PropTypes.string,
            label: PropTypes.string,
            description: PropTypes.string,
            submissionCenter: PropTypes.string,
            hasOnlyTpcSubmission: PropTypes.bool,
            filesHref: PropTypes.string,
            gccFilesHref: PropTypes.string,
        })
    ).isRequired,
};

NonSolidAliquotVisualization.defaultProps = {
    title: null,
    className: null,
    specimenType: 'blood',
    idPrefix: null,
};
