'use strict';

import React, { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Popover, PopoverBody, PopoverHeader } from 'react-bootstrap';
import { Overlay } from 'react-bootstrap';
import { AliquotInfoCard } from './helpers';
import AliquotCoreTable, { formatCenterName } from './AliquotCoreTable';
import { CORE_DOT_DEFAULT_COLOR } from './FrozenAliquotPopoverBody';

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
    // TissueView.js/TissueTypeView.js's nonSolidSpecimenType). Shares
    // buccal swab's liquidColor (pale/cloudy, not blood-red) rather than its
    // own -- same rationale as buccal's own choice above, and the official
    // categorical FBRO color (a pale yellow) had no stronger claim to being
    // "more accurate" here either.
    fibroblast: {
        label: 'Fibroblast',
        liquidColor: '#F0D9C4',
        idPrefix: '3AC',
        caption: 'Core and DNA/RNA metadata from sequencing.',
    },
};

// One tube per aliquot: a non-solid specimen (blood, buccal swab,
// fibroblasts) isn't sliced -- the material in that single tube is divided up
// and sent to different GCCs, so what used to be drawn as separate "sub-tubes"
// are really samples of it, listed in the popover instead (see the table
// below), not drawn as tubes of their own. Not called "cores" in the UI: a
// core is a physical piece of solid tissue at a plate position.
const MAIN_TUBE = { width: 44, bodyHeight: 108, capHeight: 15, capOverhang: 7 };
const POPOVER_TUBE = { width: 26, bodyHeight: 58, capHeight: 9, capOverhang: 4 };
const CANVAS_WIDTH = 200;
const LABEL_GAP = 22;
const SUBLABEL_GAP = 18;

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
    title = null,
    aliquots,
    specimenType = 'blood',
    idPrefix = null,
    className = null,
    // Per real TissueSample external_id, the distinct "<Assay> - <Platform>"
    // combos its own indexed Files carry -- same map (and the same
    // AliquotVisualization.js-derived convention) the solid popover already
    // reads, just keyed here off `aliquot.description` (this component's own
    // real external_id field) instead of a core position's own id.
    assayPlatformsBySampleName = {},
    // Shown in the popover's info card -- this component itself only knows
    // its own aliquots, not which donor/tissue they belong to.
    donorLabel = null,
    tissueLabel = null,
}) {
    const [selectedTarget, setSelectedTarget] = useState(null);
    const popoverId = useId();
    function handleHidePopover() {
        setSelectedTarget(null);
    }

    // See AliquotVisualization.js's equivalent effect: `aliquots` can swap
    // from the illustrative fallback to real data mid-session, and a popover
    // left open would then show a table for data that's no longer on screen.
    // Skips the initial mount firing so a fast first click isn't clobbered by
    // this effect running (deferred, after commit) right afterward.
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
    const tissueName = tissueLabel && tissueLabel !== '-' ? tissueLabel : styles.label;

    // One row per real sample -- each one a share of this tube's material sent
    // to one GCC, named by its own id: the part of the real external_id after
    // the donor/tissue kit ("SMHT005-3A-001X" -> "001X"), falling back to its
    // position in the list for the illustrative demo set.
    const sampleRows = aliquots
        .map((aliquot, index) => {
            // `hasFiles` (see TissueView.js's nonSolidAliquots) is ground
            // truth from this donor+tissue's actual indexed Files, not just
            // an inference from having a real (non-TPC) submission_centers
            // value -- a sample can be submitted to a real GCC well before
            // that GCC's files for it actually exist, so showing the GCC
            // name there would read as a working link that resolves to 0
            // results. Only real aliquots carry `hasFiles` at all
            // (`undefined` on the illustrative demo fallback), which is what
            // distinguishes "no files yet" from the demo-only "GCCN"
            // placeholder.
            const { hasFiles } = aliquot;
            const sampleLabel =
                aliquot.description?.split('-').slice(2).join('-') ||
                String(index + 1).padStart(3, '0');
            const centerLabel =
                hasFiles === undefined
                    ? `GCC${index + 1}`
                    : hasFiles && aliquot.submissionCenter
                        ? formatCenterName(aliquot.submissionCenter)
                        : 'No files yet';
            return {
                key: aliquot.id || index,
                coreLabel: sampleLabel,
                coreColor: CORE_DOT_DEFAULT_COLOR,
                coreHref: aliquot.filesHref,
                coreTitle: aliquot.filesHref
                    ? `View ${aliquot.description}'s own files`
                    : 'No files yet for this sample',
                // Only looked up off the real external_id (`description`),
                // never a synthetic fallback -- a demo aliquot has no real
                // sample behind it and no matching Files either, so it
                // should read as "no data", not coincidentally match some
                // other sample's assay/platform combo.
                dataLabels: aliquot.description
                    ? assayPlatformsBySampleName[aliquot.description] || []
                    : [],
                centerLabel,
                centerHref: aliquot.gccFilesHref,
                centerTitle: "View this GCC's files for this donor & tissue",
                centerIsEmpty: hasFiles === false,
            };
        })
        .sort((a, b) => a.coreLabel.localeCompare(b.coreLabel, undefined, { numeric: true }));
    const sampleCount = sampleRows.length;

    const tubeX = CANVAS_WIDTH / 2 - MAIN_TUBE.width / 2;
    const tubeBottomY = MAIN_TUBE.capHeight + MAIN_TUBE.bodyHeight;
    const labelY = tubeBottomY + LABEL_GAP;
    const sublabelY = labelY + SUBLABEL_GAP;
    const viewBoxHeight = sublabelY + 8;

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
                    // Explicit width/height (1 viewBox unit = 1px), same
                    // convention AliquotVisualization.js's own <svg> uses --
                    // without these the browser has no intrinsic size to work
                    // from and stretches the SVG to fill its container.
                    width={CANVAS_WIDTH}
                    height={viewBoxHeight}
                    viewBox={`0 -6 ${CANVAS_WIDTH} ${viewBoxHeight}`}
                    role="img"
                    aria-label="Non-solid tissue aliquot visualization">
                    <TubeIcon
                        x={tubeX}
                        y={0}
                        {...MAIN_TUBE}
                        clipId={`${popoverId}-main-tube-clip`}
                        liquidColor={styles.liquidColor}
                        fillLevel={0.72}
                    />
                    <foreignObject
                        x={tubeX - MAIN_TUBE.capOverhang - 4}
                        y={-4}
                        width={MAIN_TUBE.width + MAIN_TUBE.capOverhang * 2 + 8}
                        height={tubeBottomY + 8}>
                        <button
                            type="button"
                            className="nonsolid-aliquot-hitarea"
                            // eslint-disable-next-line react/jsx-no-bind
                            onClick={(event) => setSelectedTarget(event.currentTarget)}
                            aria-label={`View details for this ${styles.label} aliquot`}>
                            <span className="visually-hidden">{styles.label} aliquot</span>
                        </button>
                    </foreignObject>
                    <text className="nonsolid-sequence-label" x={CANVAS_WIDTH / 2} y={labelY}>
                        {resolvedIdPrefix}
                    </text>
                    <text className="nonsolid-gcc-label" x={CANVAS_WIDTH / 2} y={sublabelY}>
                        {sampleCount} {sampleCount === 1 ? 'sample' : 'samples'}
                    </text>
                </svg>
                <Overlay
                    show={!!selectedTarget}
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
                            className="aliquot-popover aliquot-popover--wide">
                            <PopoverHeader as="h3">
                                {resolvedIdPrefix} - {tissueName}
                            </PopoverHeader>
                            <PopoverBody>
                                <div className="aliquot-detail-layout">
                                    <div className="aliquot-detail-left">
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
                                        <AliquotInfoCard
                                            donorLabel={donorLabel}
                                            tissueLabel={tissueName}
                                            aliquotTitle="Samples"
                                            aliquotLabel={sampleCount}
                                        />
                                    </div>
                                    <div className="aliquot-detail-right">
                                        <section className="aliquot-detail-section">
                                            <h4 className="aliquot-detail-section-title">
                                                Sequencing Data
                                            </h4>
                                            <AliquotCoreTable rows={sampleRows} rowLabel="Sample" />
                                        </section>
                                    </div>
                                </div>
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
                    <span>
                        {styles.label} aliquot &ndash; one tube, its samples sent to each GCC
                    </span>
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
            hasFiles: PropTypes.bool,
            filesHref: PropTypes.string,
            gccFilesHref: PropTypes.string,
        })
    ).isRequired,
    assayPlatformsBySampleName: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.string)),
    donorLabel: PropTypes.string,
    tissueLabel: PropTypes.string,
};

