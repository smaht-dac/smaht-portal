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

// A fixed template (see helpers.js's getBivalvedTemplate/
// getMedialLateralTemplate/getStripTemplate) always includes every
// position, whether or not this donor has a real aliquot there yet
// (isPlaceholder) -- these render as inert, not clickable (no popover data
// to show), and visually muted vs. the real Fixed/Frozen colors. Went
// through a few passes: a single flat grey for both types made it
// impossible to tell a missing Fixed slot from a missing Frozen one at a
// glance; muting each type toward its *own* color at a moderate ratio kept
// the type legible but read as too close to the real, enabled colors --
// "disabled" wasn't obvious at a glance, which was the whole point. Both
// now mix much further toward one shared neutral grey (only a faint warm/
// cool tint left per type, luminance kept close between the two so neither
// reads as more "disabled" than the other) -- clearly muted first, with the
// type only a secondary, closer-look cue.
const PLACEHOLDER_SLICE_STYLES = {
    pink: {
        front: '#BEB7B3',
        top: '#BFBBBA',
        side: '#BBB3AD',
        border: '#ABA39D',
    },
    yellow: {
        front: '#B6BFB0',
        top: '#BAC1B8',
        side: '#B1BBA8',
        border: '#A0AA9C',
    },
};

const FROZEN_GRID_ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const FROZEN_GRID_COLS = [1, 2, 3, 4, 5, 6];
const DEFAULT_FROZEN_CORE_POSITIONS = ['A1', 'C2'];
// How many core positions a single GCC group shows before collapsing the
// rest behind a "Show N more" toggle (real data has seen 10+ positions
// under one center) -- see the render site for why this replaced an
// internal scrollbar.
const CORE_POSITIONS_COLLAPSE_THRESHOLD = 3;
// Distinct, colorblind-considerate hues (not just lightness steps of one
// base color) so cores submitted by different centers are visually
// distinguishable at a glance in the grid, not just via tooltip/click.
const CORE_DOT_COLOR_PALETTE = [
    '#1e5b4f', // dark teal-green (matches the default single-GCC highlight)
    '#c99a2e', // amber/gold
    '#5b5fc4', // indigo
    '#c0524a', // brick red
    '#2f8fa6', // teal-blue
    '#8a4fae', // violet
];
const [CORE_DOT_DEFAULT_COLOR] = CORE_DOT_COLOR_PALETTE;

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
                <a href={reportHref} target="_blank" rel="noopener noreferrer">
                    {reportLabel}
                </a>
            </React.Fragment>
        );
    });
}

// Flattens associatedPathologyReports (one entry per linked Fixed sample,
// each with its own pathology_reports array) into one row per report --
// sorted by the Fixed sample's external_id so the list reads in a stable,
// predictable order instead of whatever order the samples happened to
// merge in. The full report name is long (e.g.
// "NDRI_NON-BRAIN-PATHOLOGY-REPORT_SMHT004-3T-003") -- keep the visible
// label to the short, already-distinguishing external_id and put the full
// name in the link's `title` tooltip instead of spending a second line on
// it.
function getSortedPathologyReportItems(entries) {
    return (entries || [])
        .slice()
        .sort((a, b) =>
            String(a?.fixed_sample_external_id || '').localeCompare(
                String(b?.fixed_sample_external_id || ''),
                undefined,
                { numeric: true }
            )
        )
        .flatMap((entry) => {
            const externalId = entry?.fixed_sample_external_id;
            const reports = entry?.pathology_reports;
            if (!reports || reports.length === 0) {
                return [{ key: externalId, externalId, href: null, label: null }];
            }
            return reports.map((report, reportIndex) => {
                return {
                    key: `${externalId}-${reportIndex}`,
                    externalId,
                    href: typeof report === 'string' ? report : report?.['@id'],
                    label: typeof report === 'object' ? report?.display_title || 'View' : 'View',
                };
            });
        });
}

function buildSliceGeometry({
    heightPx,
    depthX,
    depthY,
    slices,
    // Where this run of slices starts along the width axis, and what global
    // index its first slice should carry -- both default to 0 for a single
    // continuous box, but a bivalved split (see enableBivalvedSplit) calls
    // this twice, once per half, with the second half's offsetX pushed past
    // the first half's own width plus a gap, and its startIndex continuing
    // on from the first half's slice count (so `index` still lines up with
    // normalizedSlices/selectedSliceIndex regardless of grouping).
    offsetX = 0,
    startIndex = 0,
    // Where this run's own *front* edge sits, in the shared coordinate
    // system -- defaults to (0, depthY), i.e. this run's front is the whole
    // box's true front (the normal case, and a bivalved half's case, since
    // both start a fresh box at the true front). A medial/lateral layer
    // (see enableMedialLateralLayers) isn't a fresh box, though -- the
    // Medial (back) layer's own front is the Lateral layer's own back (at
    // the box's half-depth midline), not the box's true front, so it passes
    // a different originX/originY while keeping its own depthX/depthY at
    // half the box's total depth. This is what lets one shared box be cut
    // into two depth-wise layers instead of two side-by-side ones.
    originX = 0,
    originY = depthY,
}) {
    let currentX = offsetX;
    return slices.map((slice, i) => {
        const index = startIndex + i;
        const width = slice.widthPx;
        const x0 = currentX;
        const x1 = currentX + width;
        currentX = x1;
        const frontX0 = x0 + originX;
        const frontX1 = x1 + originX;
        const frontY = originY;
        const backX0 = frontX0 + depthX;
        const backX1 = frontX1 + depthX;
        const backY = originY - depthY;

        return {
            ...slice,
            index,
            frontPoints: `${frontX0},${frontY} ${frontX1},${frontY} ${frontX1},${frontY + heightPx} ${frontX0},${frontY + heightPx}`,
            topPoints: `${frontX0},${frontY} ${backX0},${backY} ${backX1},${backY} ${frontX1},${frontY}`,
            sidePoints: `${frontX1},${frontY} ${backX1},${backY} ${backX1},${backY + heightPx} ${frontX1},${frontY + heightPx}`,
            frontLabelX: frontX0 + width / 2,
            frontLabelY: frontY + heightPx / 2,
            // Centroid of the top face's 4 corners -- only meaningful for a
            // slice with no visible front face of its own (a medial layer
            // slice, see hideFrontFace below), whose sequence number has to
            // sit on the top face instead. Nudged a few px right of the
            // exact arithmetic centroid -- the parallelogram's own skew
            // (front-left corner further left than the shape visually reads
            // as "centered" around) otherwise put the number right up
            // against the slice's left edge.
            topLabelX: (frontX0 + frontX1 + backX0 + backX1) / 4 + 6,
            topLabelY: (frontY + backY) / 2,
            x0: frontX0,
            x1: frontX1,
        };
    });
}

// A slice's own side face is normally left fully hidden behind the *next*
// slice's opaque top+front (only the true last-in-a-run slice ever shows
// its side face on its own) -- invisible, and fine, between two normally-
// colored slices, but that leaves no visible boundary where a real slice's
// data stops and a template placeholder (grey, no real aliquot yet) starts,
// reading as if the real slice had been swallowed by the grey one. Flags
// exactly that case (`needsSideCap`) so the render site can redraw just
// those slices' side faces in a second, later pass -- on top of everything,
// slightly transparent so it reads as a translucent edge cap rather than a
// second solid wall.
function markSideCaps(geometrySlices) {
    return geometrySlices.map((slice, i, arr) => {
        const next = arr[i + 1];
        return {
            ...slice,
            needsSideCap: !slice.isPlaceholder && !!next?.isPlaceholder,
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

// A TPC (Tissue Procurement Center, e.g. "NDRI TPC") record is the
// procurement-level entry for a core position, not a sequencing/file-
// producing one -- unlike a GCC's, it has no files of its own to link to,
// so it's excluded from the grid dots and the popover's per-center list
// entirely (a position whose only submitting center(s) are TPCs renders as
// unmarked, same as a position with no data at all). A null/missing center
// (illustrative/demo data, before a real donor is selected) isn't a TPC and
// is left alone.
function isTpcSubmissionCenter(center) {
    return typeof center === 'string' && center.trim().endsWith('TPC');
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
    // For bivalved tissues (Adrenal/Heart/Gonads -- see
    // isBivalvedAliquotLayout in helpers.js). `slices` is expected to
    // already be the tissue's full fixed Anterior/Posterior template
    // (helpers.js's buildBivalvedTemplateSlices), with each slice carrying
    // its own `bivalvedHalf` (0 or 1) and `isPlaceholder` (true for
    // template positions with no real aliquot yet). When true, this draws
    // the two halves as physically separate boxes with a real gap between
    // them (per Fig. 2a's "Anterior half"/"Posterior half"), and renders
    // placeholder slices as inert grey boxes.
    enableBivalvedSplit = false,
    // For medial/lateral tissues (Lung/Liver -- see
    // isMedialLateralAliquotLayout in helpers.js). Same idea as
    // enableBivalvedSplit, but the two portions aren't side-by-side pieces
    // -- Fig. 2a shows them as one continuous block cut into a Lateral
    // (front) and Medial (back) *depth* layer instead, so `slices` is
    // expected to be helpers.js's buildMedialLateralTemplateSlices output,
    // each slice carrying `medialLateralLayer` (0 or 1) and `isPlaceholder`.
    enableMedialLateralLayers = false,
}) {
    const [selectedSliceIndex, setSelectedSliceIndex] = useState(null);
    const [selectedTarget, setSelectedTarget] = useState(null);
    // Which GCC groups (by index) have been expanded past
    // CORE_POSITIONS_COLLAPSE_THRESHOLD in the currently open popover -- see
    // that constant for why this exists. Reset whenever the popover targets
    // a different slice (below) so re-opening it, or opening a different
    // one, always starts collapsed again.
    const [expandedGroupIndexes, setExpandedGroupIndexes] = useState(() => new Set());
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

    // A newly opened (or newly switched-to) slice's GCC groups should
    // always start collapsed, not carry over whichever groups happened to
    // be expanded for the previously selected slice.
    useEffect(() => {
        setExpandedGroupIndexes(new Set());
    }, [selectedSliceIndex]);

    // Real aliquot block depth varies by tissue (SMaHT Tissue Recovery
    // Schema Fig. 2a: Lung/Liver ~3cm, bivalved organs ~1cm, everything
    // else ~1.5cm) -- scale the isometric depth edges by depthCm relative
    // to that 1.5cm baseline so the drawn box's proportions actually
    // reflect the real block, not just the printed "Depth" label.
    const { heightCm = 1, depthCm = 1.5 } = dimensions || {};
    const DEFAULT_DEPTH_CM = 1.5;
    const depthScale = depthCm / DEFAULT_DEPTH_CM;

    const heightPx = 172;
    const depthX = 72 * depthScale;
    const depthY = 58 * depthScale;
    const sliceBase = 86;
    const typeCounters = { pink: 0, yellow: 0 };
    const normalizedSlices = slices.map((slice) => {
        const type = slice.type === 'pink' ? 'pink' : 'yellow';
        const typeIndex = typeCounters[type]++;
        return {
            ...slice,
            type,
            typeIndex,
            // Prefer the slice's own real aliquot number (e.g. "002",
            // whatever it was actually submitted under) over this purely
            // positional "the Nth slice of this type" count -- the two can
            // disagree (confirmed against real data: a tissue whose only
            // Frozen aliquot is really "002" would otherwise get relabeled
            // "001" here just for being the first Frozen slice rendered).
            // Only demo/illustrative slices (no real aliquotNumber) fall
            // back to the positional count.
            sequenceLabel: slice.aliquotNumber || String(typeIndex + 1).padStart(3, '0'),
            widthCm: typeof slice.widthCm === 'number' ? slice.widthCm : 1,
            widthPx:
                (typeof slice.widthCm === 'number' ? slice.widthCm : 1) *
                sliceBase,
        };
    });
    // Each slice of a bivalved tissue's `slices` already carries its own
    // `bivalvedHalf` (0 = Anterior, 1 = Posterior -- a fixed protocol fact,
    // see helpers.js's getBivalvedTemplate/buildBivalvedTemplateSlices, not
    // derived from this donor's data), and always arrives in template order
    // (every Anterior position, then every Posterior one) -- so grouping is
    // just finding where that field changes, same approach as
    // BrowseTissueHeatmapTable.js's buildColumnGroups.
    const hasBivalvedSplit =
        enableBivalvedSplit &&
        normalizedSlices.some((slice) => typeof slice.bivalvedHalf === 'number');
    // Same idea for a medial/lateral tissue's `medialLateralLayer` (0 =
    // Lateral/front, 1 = Medial/back -- see
    // helpers.js's getMedialLateralTemplate/buildMedialLateralTemplateSlices).
    const hasMedialLateralLayers =
        enableMedialLateralLayers &&
        normalizedSlices.some((slice) => typeof slice.medialLateralLayer === 'number');
    // Lateral and Medial share the same width (both are the same 7-slice
    // strip, just at different depths -- see below), so summing every
    // slice's widthCm here would double it; medial/lateral's own totalWidthCm
    // is just the Lateral layer's.
    const totalWidthCm = hasMedialLateralLayers
        ? normalizedSlices
            .filter((slice) => slice.medialLateralLayer === 0)
            .reduce((sum, slice) => sum + slice.widthCm, 0)
        : normalizedSlices.reduce((sum, slice) => sum + slice.widthCm, 0);
    // A visible gap in pixel space only, not a real measured distance --
    // drawn so bivalved's two halves read as physically separate pieces
    // (per Fig. 2a's "Anterior half" / "Posterior half" boxes), not as one
    // block with a line through it. Also reused for medial/lateral's rare
    // "real aliquot outside the template's expected range" case below.
    const BIVALVED_SPLIT_GAP_PX = 56;
    const BIVALVED_HALF_LABELS = ['Anterior half', 'Posterior half'];

    let sliceGroups;
    let geometry;
    let widthPx;
    if (hasMedialLateralLayers) {
        // Unlike bivalved's two side-by-side pieces, Lateral/Medial are one
        // continuous physical block cut into a front (Lateral) and back
        // (Medial) *depth* layer -- so instead of positioning two groups
        // along the width axis with a gap, both layers share the same
        // width span and are positioned along the depth axis: Lateral runs
        // from the box's true front to its half-depth midline, Medial from
        // that midline to the box's true back (see buildSliceGeometry's
        // originX/originY). A real aliquot outside the template's expected
        // range (see buildMedialLateralTemplateSlices) still isn't dropped,
        // though -- it's appended past the main box instead, full depth,
        // its own gap, same as bivalved's identical edge case.
        const halfDepthX = depthX / 2;
        const halfDepthY = depthY / 2;
        const layerGroupBounds = [];
        normalizedSlices.forEach((slice, i) => {
            const lastGroup = layerGroupBounds[layerGroupBounds.length - 1];
            if (lastGroup && lastGroup.layer === slice.medialLateralLayer) {
                lastGroup.end = i + 1;
            } else {
                layerGroupBounds.push({ start: i, end: i + 1, layer: slice.medialLateralLayer });
            }
        });
        geometry = [];
        let mainWidthPx = 0;
        let extraCursorX = 0;
        layerGroupBounds.forEach((bounds) => {
            const groupSlices = normalizedSlices.slice(bounds.start, bounds.end);
            const groupWidthPx = groupSlices.reduce((sum, slice) => sum + slice.widthPx, 0);
            if (bounds.layer === 0) {
                mainWidthPx = groupWidthPx;
                geometry = geometry.concat(
                    markSideCaps(
                        buildSliceGeometry({
                            heightPx,
                            depthX: halfDepthX,
                            depthY: halfDepthY,
                            slices: groupSlices,
                            startIndex: bounds.start,
                            originX: 0,
                            originY: depthY,
                        })
                    )
                );
            } else if (bounds.layer === 1) {
                const layerGeometry = buildSliceGeometry({
                    heightPx,
                    depthX: halfDepthX,
                    depthY: halfDepthY,
                    slices: groupSlices,
                    startIndex: bounds.start,
                    originX: halfDepthX,
                    originY: halfDepthY,
                });
                geometry = geometry.concat(
                    layerGeometry.map((slice, i) => {
                        return {
                            ...slice,
                            hideFrontFace: true,
                            // Every other slice's side face is normally
                            // hidden by the *next* slice's front face
                            // (drawn later, on top -- see the box-outline
                            // comment above) -- but a Medial-layer slice
                            // has no front face to do that with, so its own
                            // side face (a thin diagonal sliver) would
                            // otherwise stay fully exposed for every slice,
                            // not just the true rightmost one, and read as
                            // a row of "stalactites" rather than one clean
                            // right edge.
                            hideSideFace: i < layerGeometry.length - 1,
                        };
                    })
                );
            } else {
                const startX = mainWidthPx + BIVALVED_SPLIT_GAP_PX + extraCursorX;
                geometry = geometry.concat(
                    buildSliceGeometry({
                        heightPx,
                        depthX,
                        depthY,
                        slices: groupSlices,
                        offsetX: startX,
                        startIndex: bounds.start,
                    })
                );
                extraCursorX += groupWidthPx;
            }
        });
        widthPx = mainWidthPx + (extraCursorX > 0 ? BIVALVED_SPLIT_GAP_PX + extraCursorX : 0);
        // One bounding outline for the whole (single, continuous) block --
        // see the box-outline render site, which draws one per sliceGroups
        // entry off its startX/widthPx regardless of which mode built it.
        sliceGroups = [{ startX: 0, widthPx, widthCm: totalWidthCm, geometry: [], halfLabel: null }];
    } else {
        const sliceGroupBounds = [];
        if (hasBivalvedSplit) {
            normalizedSlices.forEach((slice, i) => {
                const lastGroup = sliceGroupBounds[sliceGroupBounds.length - 1];
                if (lastGroup && lastGroup.half === slice.bivalvedHalf) {
                    lastGroup.end = i + 1;
                } else {
                    sliceGroupBounds.push({ start: i, end: i + 1, half: slice.bivalvedHalf });
                }
            });
        } else {
            sliceGroupBounds.push({ start: 0, end: normalizedSlices.length });
        }
        let cursorX = 0;
        sliceGroups = sliceGroupBounds.map((bounds, groupIndex) => {
            if (groupIndex > 0) cursorX += BIVALVED_SPLIT_GAP_PX;
            const groupSlices = normalizedSlices.slice(bounds.start, bounds.end);
            const groupWidthPx = groupSlices.reduce((sum, slice) => sum + slice.widthPx, 0);
            const groupWidthCm = groupSlices.reduce((sum, slice) => sum + slice.widthCm, 0);
            const startX = cursorX;
            const groupGeometry = markSideCaps(
                buildSliceGeometry({
                    heightPx,
                    depthX,
                    depthY,
                    slices: groupSlices,
                    offsetX: startX,
                    startIndex: bounds.start,
                })
            );
            cursorX += groupWidthPx;
            return {
                startX,
                widthPx: groupWidthPx,
                widthCm: groupWidthCm,
                geometry: groupGeometry,
                halfLabel: BIVALVED_HALF_LABELS[bounds.half] || null,
            };
        });
        geometry = sliceGroups.flatMap((group) => group.geometry);
        // The full drawn extent along the width axis, including any
        // bivalved gap -- everything that used to size/position itself off
        // the single box's `widthPx` (viewBox, dimension arrows) uses this
        // instead, so it still spans edge-to-edge across both halves when
        // split, or is just the one box's width when it isn't.
        widthPx = cursorX;
    }
    const viewBoxMinX = -76;
    const viewBoxMinY = -42;
    const viewBoxWidth = widthPx + depthX + 180;
    // Nothing is ever drawn below y = depthY + heightPx (the box's own
    // bottom edge) -- the height dimension arrow runs alongside the box,
    // not beneath it. This is just a bottom margin, so it should be modest
    // like viewBoxMinY's top margin, not the ~168px of pure dead space it
    // was before (nearly as tall as the box itself, and the main source of
    // the empty space below the diagram once the SVG renders at native size
    // instead of being stretched to fill a container).
    const viewBoxHeight = heightPx + depthY + 32;
    const {
        widthLabel = `${totalWidthCm} cm`,
        heightLabel = `${heightCm} cm`,
        depthLabel = `${depthCm} cm`,
    } = dimensions || {};

    const selectedSlice =
        selectedSliceIndex === null ? null : normalizedSlices[selectedSliceIndex];
    const selectedStyles = SLICE_TYPE_STYLES[selectedSlice?.type || 'yellow'];
    const selectedAliquotId = selectedSlice
        ? `${selectedSlice.idPrefix || idPrefix || selectedStyles.idPrefix}-${selectedSlice.sequenceLabel}`
        : null;
    const selectedFrozenCorePositions =
        selectedSlice?.frozenCorePositions || DEFAULT_FROZEN_CORE_POSITIONS;
    // Every core position submitted by the same GCC (the common case -- one
    // physical aliquot is usually processed by a single center) collapses
    // into one group instead of repeating that GCC's name once per
    // position, which reads as noisy duplication once an aliquot has more
    // than a couple of positions (real data has seen 6 positions under one
    // TPC/GCC). Grouped by center regardless of position order -- positions
    // from the same center aren't always adjacent (real data has seen
    // BROAD/UWSC/BROAD/UWSC interleaved).
    //
    // A single position can have more than one real submitting center
    // (confirmed against real data: the same physical core gets both a TPC
    // procurement-level record and a separate GCC-submitted record) -- so
    // `frozenCorePositionSubmissionCenters`/`...FilesHrefs` are arrays per
    // position, and one position can end up contributing a row to more than
    // one group here (once per distinct center), rather than only ever
    // showing its last-processed center.
    //
    // Grouped by submissionCenter alone -- NOT also by filesHref, even
    // though frozenCorePositionFilesHrefs is itself per-position (each
    // position's own href narrows down to just that position's files, via
    // sample_summary.sample_names). Keying on filesHref too would put every
    // position back in its own single-position group the moment two
    // positions under the same GCC have two different (position-specific)
    // hrefs -- which is now *always*, defeating the grouping entirely
    // (confirmed as a real regression: real data with 3 positions under one
    // GCC rendered as 3 separate one-line groups instead of one). The
    // group's own header link (`filesHref` below) is instead the GCC-wide
    // link for this whole donor+tissue; each position's own row links to
    // its own specific href via `positionFilesHrefs`.
    const selectedFrozenCorePositionGroups = [];
    const groupIndexByKey = new Map();
    selectedFrozenCorePositions.forEach((corePosition) => {
        const submissionCenters = selectedSlice?.frozenCorePositionSubmissionCenters?.[
            corePosition
        ] || [null];
        const filesHrefs = selectedSlice?.frozenCorePositionFilesHrefs?.[corePosition] || [];
        submissionCenters.forEach((submissionCenter, centerIndex) => {
            if (isTpcSubmissionCenter(submissionCenter)) return;
            const filesHref = filesHrefs[centerIndex] || null;
            const key = submissionCenter || '';
            if (groupIndexByKey.has(key)) {
                const group = selectedFrozenCorePositionGroups[groupIndexByKey.get(key)];
                group.positions.push(corePosition);
                group.positionFilesHrefs[corePosition] = filesHref;
            } else {
                groupIndexByKey.set(key, selectedFrozenCorePositionGroups.length);
                selectedFrozenCorePositionGroups.push({
                    submissionCenter,
                    filesHref:
                        (submissionCenter &&
                            selectedSlice?.submissionCenterFilesHrefs?.[submissionCenter]) ||
                        null,
                    positions: [corePosition],
                    positionFilesHrefs: { [corePosition]: filesHref },
                });
            }
        });
    });
    // A distinct, stable color per real submitting center in the currently
    // open popover -- assigned in first-encounter order so the same center
    // always gets the same color within one popover session, letting the
    // grid dots and the GCC rows below double as each other's legend
    // instead of needing a separate one. Positions with no known center
    // (demo/fallback data) fall back to CORE_DOT_DEFAULT_COLOR.
    const submissionCenterColors = new Map();
    selectedFrozenCorePositionGroups.forEach((group) => {
        const key = group.submissionCenter || null;
        if (key && !submissionCenterColors.has(key)) {
            submissionCenterColors.set(
                key,
                CORE_DOT_COLOR_PALETTE[submissionCenterColors.size % CORE_DOT_COLOR_PALETTE.length]
            );
        }
    });
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
                    // These attributes give the svg an intrinsic size/aspect
                    // ratio (1 viewBox unit = 1px, matching sliceBase's fixed
                    // px-per-cm scale); CSS then only shrinks it to fit a
                    // narrower wrapper (see .aliquot-canvas's `max-width:
                    // 100%; height: auto`), never stretches it to fill one.
                    // Forcing `width: 100%` here previously inflated a
                    // diagram's height whenever it had too few slices to be
                    // width-constrained (viewBoxHeight is constant, so a
                    // narrower viewBox stretched to full width meant a taller
                    // one); letting it scroll instead of stretch, tried
                    // after that, meant a diagram with lots of slices didn't
                    // fit in view at all. Shrinking both dimensions together
                    // avoids either problem.
                    width={viewBoxWidth}
                    height={viewBoxHeight}
                    viewBox={`${viewBoxMinX} ${viewBoxMinY} ${viewBoxWidth} ${viewBoxHeight}`}
                    role="img"
                    aria-label="Aliquot slice visualization">
                    {hasBivalvedSplit ? (
                        sliceGroups.map((group, groupIndex) => {
                            const groupTopLine = offsetLine(
                                depthX + group.startX,
                                0,
                                depthX + group.startX + group.widthPx,
                                0,
                                -topDepthOffset
                            );
                            const groupTopMidpoint = midpoint(
                                groupTopLine.x1,
                                groupTopLine.y1,
                                groupTopLine.x2,
                                groupTopLine.y2
                            );
                            return (
                                <DimensionArrow
                                    key={`width-${groupIndex}`}
                                    x1={groupTopLine.x1 + 8}
                                    y1={groupTopLine.y1}
                                    x2={groupTopLine.x2 - 8}
                                    y2={groupTopLine.y2}
                                    label={`${group.widthCm} cm`}
                                    labelX={groupTopMidpoint.x}
                                    labelY={groupTopMidpoint.y - 14}
                                />
                            );
                        })
                    ) : (
                        <DimensionArrow
                            x1={topDimensionLine.x1 + 8}
                            y1={topDimensionLine.y1}
                            x2={topDimensionLine.x2 - 8}
                            y2={topDimensionLine.y2}
                            label={widthLabel}
                            labelX={topMidpoint.x}
                            labelY={topMidpoint.y - 14}
                        />
                    )}
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

                    {sliceGroups.map((group, groupIndex) => {
                        const groupX1 = group.startX + group.widthPx;
                        return (
                            <g className="aliquot-box-outline" key={`outline-${groupIndex}`}>
                                <polygon
                                    points={`${group.startX},${depthY} ${group.startX + depthX},0 ${groupX1 + depthX},0 ${groupX1},${depthY}`}
                                />
                                <polygon
                                    points={`${groupX1},${depthY} ${groupX1 + depthX},0 ${groupX1 + depthX},${heightPx} ${groupX1},${depthY + heightPx}`}
                                />
                            </g>
                        );
                    })}
                    {hasBivalvedSplit
                        ? sliceGroups.map((group, groupIndex) =>
                            group.halfLabel ? (
                                <text
                                    key={`half-label-${groupIndex}`}
                                    className="aliquot-bivalved-split-caption"
                                    x={group.startX + group.widthPx / 2 + depthX / 2}
                                    y={depthY + heightPx + 24}
                                    textAnchor="middle">
                                    {group.halfLabel}
                                </text>
                            ) : null
                        )
                        : null}

                    {geometry.map((slice) => {
                        const styles = slice.isPlaceholder
                            ? PLACEHOLDER_SLICE_STYLES[slice.type]
                            : SLICE_TYPE_STYLES[slice.type];
                        // A Medial-layer slice (medial/lateral mode -- see
                        // enableMedialLateralLayers) has no visible front
                        // face of its own (it's the box's back half, hidden
                        // behind the Lateral layer sitting in front of it),
                        // so its click target and sequence label both move
                        // to its own top face instead of the usual front one.
                        const labelX = slice.hideFrontFace ? slice.topLabelX : slice.frontLabelX;
                        const labelY = slice.hideFrontFace ? slice.topLabelY : slice.frontLabelY;
                        const ariaLabel = `View details for ${slice.label || styles.label} slice ${slice.index + 1}`;
                        function handleSelect(event) {
                            setSelectedSliceIndex(slice.index);
                            setSelectedTarget(event.currentTarget);
                        }
                        return (
                            <g
                                key={slice.id || slice.index}
                                className={
                                    'aliquot-slice' +
                                    (slice.isPlaceholder ? ' is-placeholder' : '') +
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
                                {slice.hideSideFace ? null : (
                                    <polygon
                                        className="slice-face slice-side"
                                        points={slice.sidePoints}
                                        fill={styles.side}
                                        stroke={styles.border}
                                    />
                                )}
                                {slice.hideFrontFace ? null : (
                                    <polygon
                                        className="slice-face slice-front"
                                        points={slice.frontPoints}
                                        fill={styles.front}
                                        stroke={styles.border}
                                    />
                                )}
                                {slice.isPlaceholder ? null : slice.hideFrontFace ? (
                                    // No front face to overlay a rectangular
                                    // foreignObject/button on (the top face
                                    // is a skewed parallelogram) -- a plain
                                    // polygon click target with manual
                                    // button semantics instead.
                                    <polygon
                                        className="aliquot-slice-hitarea-polygon"
                                        points={slice.topPoints}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={ariaLabel}
                                        onClick={handleSelect}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                handleSelect(event);
                                            }
                                        }}
                                    />
                                ) : (
                                    <foreignObject
                                        x={slice.x0}
                                        y={depthY}
                                        width={slice.widthPx}
                                        height={heightPx}>
                                        <button
                                            type="button"
                                            className="aliquot-slice-hitarea"
                                            onClick={handleSelect}
                                            aria-label={ariaLabel}>
                                            <span className="visually-hidden">
                                                {slice.label || styles.label}
                                            </span>
                                        </button>
                                    </foreignObject>
                                )}
                                <text
                                    className="slice-inline-label slice-sequence-label"
                                    x={labelX}
                                    y={
                                        showSliceLabels && !slice.hideFrontFace
                                            ? labelY - 10
                                            : labelY
                                    }>
                                    {slice.sequenceLabel}
                                </text>
                                {showSliceLabels && !slice.hideFrontFace ? (
                                    <text
                                        className="slice-inline-label"
                                        x={labelX}
                                        y={labelY + 10}>
                                        {slice.widthCm} cm
                                    </text>
                                ) : null}
                            </g>
                        );
                    })}
                    {/* A second, later pass so these draw on top of
                        everything above -- see markSideCaps for why a real
                        slice immediately before a placeholder needs its own
                        side face redrawn instead of staying fully hidden
                        behind the placeholder's opaque top+front. */}
                    {geometry
                        .filter((slice) => slice.needsSideCap)
                        .map((slice) => (
                            <polygon
                                key={`side-cap-${slice.id || slice.index}`}
                                className="slice-face slice-side-cap"
                                points={slice.sidePoints}
                                fill={SLICE_TYPE_STYLES[slice.type].side}
                                stroke={SLICE_TYPE_STYLES[slice.type].border}
                                pointerEvents="none"
                            />
                        ))}
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
                                                                const corePosition = `${row}${col}`;
                                                                const rawSubmissionCenters =
                                                                    selectedSlice
                                                                        ?.frozenCorePositionSubmissionCenters?.[
                                                                            corePosition
                                                                        ] || [];
                                                                const rawFilesHrefs =
                                                                    selectedSlice
                                                                        ?.frozenCorePositionFilesHrefs?.[
                                                                            corePosition
                                                                        ] || [];
                                                                // A position whose only known submitting
                                                                // center(s) are TPCs (procurement records,
                                                                // no files of their own -- see
                                                                // isTpcSubmissionCenter) doesn't get
                                                                // marked at all, same as a position with no
                                                                // data. Illustrative/demo data (no center
                                                                // info at all yet) isn't affected.
                                                                const hasOnlyTpcCenters =
                                                                    rawSubmissionCenters.length > 0 &&
                                                                    rawSubmissionCenters.every(
                                                                        isTpcSubmissionCenter
                                                                    );
                                                                const isHighlighted =
                                                                    selectedFrozenCorePositions.includes(
                                                                        corePosition
                                                                    ) && !hasOnlyTpcCenters;
                                                                if (!isHighlighted) {
                                                                    return (
                                                                        <span
                                                                            key={corePosition}
                                                                            className="aliquot-grid-core"
                                                                        />
                                                                    );
                                                                }
                                                                // A position can have more than one real
                                                                // submitting center (see the grouping
                                                                // comment above selectedFrozenCorePositionGroups)
                                                                // -- list every distinct GCC one in the
                                                                // tooltip (TPC entries excluded, see
                                                                // isTpcSubmissionCenter), and link/color by
                                                                // whichever has a real files href (prefer
                                                                // the first GCC one that does).
                                                                const linkedIndex = rawFilesHrefs.findIndex(
                                                                    (href, i) =>
                                                                        Boolean(href) &&
                                                                        !isTpcSubmissionCenter(
                                                                            rawSubmissionCenters[i]
                                                                        )
                                                                );
                                                                const positionFilesHref =
                                                                    linkedIndex >= 0
                                                                        ? rawFilesHrefs[linkedIndex]
                                                                        : null;
                                                                const positionSubmissionCenters =
                                                                    rawSubmissionCenters.filter(
                                                                        (center) =>
                                                                            Boolean(center) &&
                                                                            !isTpcSubmissionCenter(center)
                                                                    );
                                                                const primaryCenter =
                                                                    (linkedIndex >= 0
                                                                        ? rawSubmissionCenters[linkedIndex]
                                                                        : null) || positionSubmissionCenters[0];
                                                                // Different GCCs get visually distinct dot
                                                                // colors, not just distinct tooltips/links
                                                                // -- see submissionCenterColors above.
                                                                const dotColor =
                                                                    (primaryCenter &&
                                                                        submissionCenterColors.get(
                                                                            primaryCenter
                                                                        )) ||
                                                                    CORE_DOT_DEFAULT_COLOR;
                                                                const positionId = `${selectedAliquotId}${corePosition}`;
                                                                const positionTitle =
                                                                    positionSubmissionCenters.length > 0
                                                                        ? `${positionId} (${positionSubmissionCenters.join(
                                                                            ', '
                                                                        )})`
                                                                        : positionId;
                                                                // Every highlighted dot reflects a real
                                                                // Core TissueSample -- link it to that
                                                                // position's own GCC files (same target
                                                                // as clicking its row below) when one is
                                                                // available, instead of leaving it a
                                                                // dead-end visual.
                                                                return positionFilesHref ? (
                                                                    <a
                                                                        key={corePosition}
                                                                        href={positionFilesHref}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        title={`View ${positionTitle}'s files`}
                                                                        style={{
                                                                            backgroundColor: dotColor,
                                                                            borderColor: dotColor,
                                                                        }}
                                                                        className="aliquot-grid-core is-highlighted is-linked"
                                                                    />
                                                                ) : (
                                                                    <span
                                                                        key={corePosition}
                                                                        title={positionTitle}
                                                                        style={{
                                                                            backgroundColor: dotColor,
                                                                            borderColor: dotColor,
                                                                        }}
                                                                        className="aliquot-grid-core is-highlighted"
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
                                {selectedSlice?.type === 'yellow' && selectedFrozenCorePositions.length > 0 ? (
                                    <div className="aliquot-popover-cores">
                                        {selectedFrozenCorePositionGroups.flatMap((group, groupIndex) => {
                                            const isExpanded = expandedGroupIndexes.has(groupIndex);
                                            const visiblePositions =
                                                isExpanded ||
                                                group.positions.length <=
                                                    CORE_POSITIONS_COLLAPSE_THRESHOLD
                                                    ? group.positions
                                                    : group.positions.slice(
                                                        0,
                                                        CORE_POSITIONS_COLLAPSE_THRESHOLD
                                                    );
                                            const hiddenCount =
                                                group.positions.length - visiblePositions.length;
                                            // Same color this group's positions are dotted
                                            // with in the grid above -- makes this list
                                            // double as that color coding's legend.
                                            const groupColor =
                                                (group.submissionCenter &&
                                                    submissionCenterColors.get(
                                                        group.submissionCenter
                                                    )) ||
                                                CORE_DOT_DEFAULT_COLOR;
                                            const rows = visiblePositions.map(
                                                (corePosition, positionIndexInGroup) => (
                                                    <div
                                                        className="aliquot-popover-row"
                                                        key={corePosition}>
                                                        <span>
                                                            {positionIndexInGroup === 0 ? (
                                                                <>
                                                                    <span
                                                                        className="aliquot-popover-gcc-dot"
                                                                        style={{
                                                                            backgroundColor: groupColor,
                                                                        }}
                                                                    />
                                                                    {group.filesHref ? (
                                                                        <a
                                                                            href={group.filesHref}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            title="View this GCC's files for this donor & tissue">
                                                                            {group.submissionCenter ||
                                                                                `GCC${groupIndex + 1}`}
                                                                        </a>
                                                                    ) : (
                                                                        group.submissionCenter ||
                                                                        `GCC${groupIndex + 1}`
                                                                    )}
                                                                </>
                                                            ) : null}
                                                        </span>
                                                        {group.positionFilesHrefs[corePosition] ? (
                                                            <a
                                                                href={group.positionFilesHrefs[corePosition]}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                title={`View ${selectedAliquotId}${corePosition}'s own files`}>
                                                                <strong>
                                                                    {selectedAliquotId}
                                                                    {corePosition}
                                                                </strong>
                                                            </a>
                                                        ) : (
                                                            <strong>
                                                                {selectedAliquotId}
                                                                {corePosition}
                                                            </strong>
                                                        )}
                                                    </div>
                                                )
                                            );
                                            // A long GCC list (real data has seen 10+
                                            // positions under one center) used to just
                                            // scroll internally -- but a scrollbar hides
                                            // whatever comes *after* it (e.g. a second
                                            // GCC's rows) without any hint there's more,
                                            // so collapse it to a "Show N more" toggle
                                            // instead: every group stays visible, only
                                            // its own overflow is tucked away.
                                            if (hiddenCount > 0) {
                                                rows.push(
                                                    <button
                                                        type="button"
                                                        key={`${groupIndex}-toggle`}
                                                        className="aliquot-popover-row aliquot-popover-toggle"
                                                        onClick={() =>
                                                            setExpandedGroupIndexes((prev) => {
                                                                const next = new Set(prev);
                                                                next.add(groupIndex);
                                                                return next;
                                                            })
                                                        }>
                                                        Show {hiddenCount} more
                                                    </button>
                                                );
                                            } else if (
                                                isExpanded &&
                                                group.positions.length >
                                                    CORE_POSITIONS_COLLAPSE_THRESHOLD
                                            ) {
                                                rows.push(
                                                    <button
                                                        type="button"
                                                        key={`${groupIndex}-toggle`}
                                                        className="aliquot-popover-row aliquot-popover-toggle"
                                                        onClick={() =>
                                                            setExpandedGroupIndexes((prev) => {
                                                                const next = new Set(prev);
                                                                next.delete(groupIndex);
                                                                return next;
                                                            })
                                                        }>
                                                        Show less
                                                    </button>
                                                );
                                            }
                                            return rows;
                                        })}
                                    </div>
                                ) : null}
                                <div className="aliquot-popover-row">
                                    <span>Type</span>
                                    <strong>{selectedStyles.label}</strong>
                                </div>
                                <div className="aliquot-popover-row">
                                    <span>Order</span>
                                    <strong>
                                        {/* `normalizedSlices` items don't carry an `index` field
                                            (only `geometry`, a separate derived array, does) --
                                            `selectedSlice?.index` was always undefined here, so
                                            this read `selectedSliceIndex` (the actual array
                                            position) directly instead. */}
                                        {(selectedSliceIndex ?? 0) + 1} /{' '}
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
                                    <div className="aliquot-popover-pathology-section">
                                        {/* Sits directly under this slice's own
                                            id (aliquot-popover-description above)
                                            -- both are "SMHT###-##-###"-shaped
                                            ids, so labelling this one avoids it
                                            reading as an accidental repeat of
                                            the slice's own id. */}
                                        <span className="aliquot-popover-pathology-heading">
                                            Linked Fixed sample pathology
                                        </span>
                                        <ul className="aliquot-popover-pathology-list">
                                            {getSortedPathologyReportItems(
                                                selectedSlice.associatedPathologyReports
                                            ).map((item) => (
                                                <li key={item.key}>
                                                    {item.href ? (
                                                        <a
                                                            href={item.href}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title={item.label}>
                                                            {item.externalId}
                                                        </a>
                                                    ) : (
                                                        <span title="No report yet">
                                                            {item.externalId} &ndash; no report yet
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
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
    enableBivalvedSplit: PropTypes.bool,
    enableMedialLateralLayers: PropTypes.bool,
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
            frozenCorePositions: PropTypes.arrayOf(PropTypes.string),
            associatedPathologyReports: PropTypes.arrayOf(
                PropTypes.shape({
                    fixed_sample_external_id: PropTypes.string,
                    pathology_reports: PropTypes.arrayOf(PATHOLOGY_REPORT_PROPTYPE),
                })
            ),
            pathologyReports: PropTypes.arrayOf(PATHOLOGY_REPORT_PROPTYPE),
            frozenCorePositionSubmissionCenters: PropTypes.objectOf(
                PropTypes.arrayOf(PropTypes.string)
            ),
            frozenCorePositionFilesHrefs: PropTypes.objectOf(PropTypes.arrayOf(PropTypes.string)),
            // Generic (non-core-specific) href per submitting center --
            // used for a popover group's own header link, distinct from
            // each position's own frozenCorePositionFilesHrefs entry.
            submissionCenterFilesHrefs: PropTypes.objectOf(PropTypes.string),
            idPrefix: PropTypes.string,
            aliquotNumber: PropTypes.string,
            // Bivalved tissues only (enableBivalvedSplit) -- see
            // helpers.js's buildBivalvedTemplateSlices.
            bivalvedHalf: PropTypes.number,
            // Medial/lateral tissues only (enableMedialLateralLayers) --
            // see helpers.js's buildMedialLateralTemplateSlices.
            medialLateralLayer: PropTypes.number,
            isPlaceholder: PropTypes.bool,
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
