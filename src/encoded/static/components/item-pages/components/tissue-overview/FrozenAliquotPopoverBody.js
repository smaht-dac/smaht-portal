'use strict';

import React from 'react';
import { AliquotInfoCard, PathologyOutcomeBadge, hexToRgba, isTpcSubmissionCenter } from './helpers';
import AliquotCoreTable, { formatCenterName } from './AliquotCoreTable';

const FROZEN_GRID_ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
const FROZEN_GRID_COLS = [1, 2, 3, 4, 5, 6];

// Distinct, colorblind-considerate hues (not just lightness steps of one
// base color) so cores submitted by different centers are visually
// distinguishable at a glance in the grid, not just via tooltip/click.
export const CORE_DOT_COLOR_PALETTE = [
    '#1e5b4f', // dark teal-green (matches the default single-GCC highlight)
    '#c99a2e', // amber/gold
    '#5b5fc4', // indigo
    '#c0524a', // brick red
    '#2f8fa6', // teal-blue
    '#8a4fae', // violet
];
export const [CORE_DOT_DEFAULT_COLOR] = CORE_DOT_COLOR_PALETTE;

// Flattens associatedPathologyReports (one entry per linked Fixed sample,
// each with its own pathology_reports array) into one row per report --
// sorted by the Fixed sample's external_id so the list reads in a stable,
// predictable order instead of whatever order the samples happened to
// merge in. The full report name is long (e.g.
// "NDRI_NON-BRAIN-PATHOLOGY-REPORT_SMHT004-3T-003") -- the visible label is
// the short accession, with the full name kept as the link's `title`
// tooltip.
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
                return [{ key: externalId, externalId, href: null }];
            }
            return reports.map((report, reportIndex) => {
                const isObject = typeof report === 'object';
                return {
                    key: `${externalId}-${reportIndex}`,
                    externalId,
                    href: isObject ? report?.['@id'] : report,
                    accession: isObject ? report?.accession || null : null,
                    title: isObject ? report?.display_title || null : null,
                    outcome: isObject ? report?.outcome || null : null,
                    unacceptableDescription: isObject ? report?.unacceptable_description || null : null,
                };
            });
        });
}

// core_size enum values ("1.5", "3.0", "3.0 Donut") are millimetres -- "3.0
// Donut" is a 3.0 mm donut-shaped core -- so this reads "1.5 mm" / "3.0 mm
// Donut". null when the sample has no core_size (only Core samples carry
// one).
const formatCoreSize = (coreSize) => {
    if (!coreSize) return null;
    const [size, ...rest] = coreSize.split(' ');
    return [`${size} mm`, ...rest].join(' ');
};

// The well-plate grid: every core position (A1-F6) as a ring, with the
// positions this Frozen aliquot actually has cores for filled in the color of
// their submitting center.
function CorePlateGrid({
    slice,
    aliquotId,
    highlightedPositions,
    centerColors,
    hoveredPosition,
    onHoverPosition,
}) {
    return (
        <span className="aliquot-visual-grid-wrap">
            <span className="aliquot-grid-row-with-labels">
                <span className="aliquot-grid-row-labels">
                    {FROZEN_GRID_ROWS.map((row) => (
                        <span className="aliquot-grid-row-label" key={row}>
                            {row}
                        </span>
                    ))}
                </span>
                <span className="aliquot-visual-grid">
                    {FROZEN_GRID_ROWS.map((row) => (
                        <span className="aliquot-grid-row" key={row}>
                            {FROZEN_GRID_COLS.map((col) => {
                                const corePosition = `${row}${col}`;
                                const rawSubmissionCenters =
                                    slice?.frozenCorePositionSubmissionCenters?.[corePosition] || [];
                                const rawFilesHrefs =
                                    slice?.frozenCorePositionFilesHrefs?.[corePosition] || [];
                                // A position whose only known submitting
                                // center(s) are TPCs (procurement records, no
                                // files of their own -- see
                                // isTpcSubmissionCenter) doesn't get marked at
                                // all, same as a position with no data.
                                // Illustrative/demo data (no center info at
                                // all yet) isn't affected.
                                const hasOnlyTpcCenters =
                                    rawSubmissionCenters.length > 0 &&
                                    rawSubmissionCenters.every(isTpcSubmissionCenter);
                                const isHighlighted =
                                    highlightedPositions.includes(corePosition) && !hasOnlyTpcCenters;
                                if (!isHighlighted) {
                                    return <span key={corePosition} className="aliquot-grid-core" />;
                                }
                                // A position can have more than one real
                                // submitting center -- list every distinct GCC
                                // one in the tooltip (TPC entries excluded),
                                // and link/color by whichever has a real files
                                // href (prefer the first GCC one that does).
                                const linkedIndex = rawFilesHrefs.findIndex(
                                    (href, i) =>
                                        Boolean(href) && !isTpcSubmissionCenter(rawSubmissionCenters[i])
                                );
                                const positionFilesHref = linkedIndex >= 0 ? rawFilesHrefs[linkedIndex] : null;
                                const positionSubmissionCenters = rawSubmissionCenters.filter(
                                    (center) => Boolean(center) && !isTpcSubmissionCenter(center)
                                );
                                const primaryCenter =
                                    (linkedIndex >= 0 ? rawSubmissionCenters[linkedIndex] : null) ||
                                    positionSubmissionCenters[0];
                                const dotColor =
                                    (primaryCenter && centerColors.get(primaryCenter)) ||
                                    CORE_DOT_DEFAULT_COLOR;
                                const positionId = `${aliquotId}${corePosition}`;
                                const positionTitle =
                                    positionSubmissionCenters.length > 0
                                        ? `${positionId} (${positionSubmissionCenters.join(', ')})`
                                        : positionId;
                                // Read by the hover/focus halo in
                                // _item-pages.scss -- a hardcoded halo color
                                // there would only ever match the default
                                // dot, not a GCC-specific one.
                                const dotStyle = {
                                    backgroundColor: dotColor,
                                    borderColor: dotColor,
                                    '--aliquot-core-halo': hexToRgba(dotColor, 0.3),
                                };
                                const className =
                                    'aliquot-grid-core is-highlighted' +
                                    (positionFilesHref ? ' is-linked' : '') +
                                    (corePosition === hoveredPosition ? ' is-hovered' : '');
                                const handleEnter = () => onHoverPosition(corePosition);
                                const handleLeave = () => onHoverPosition(null);
                                return positionFilesHref ? (
                                    <a
                                        key={corePosition}
                                        href={positionFilesHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={`View ${positionTitle}'s files`}
                                        style={dotStyle}
                                        className={className}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onMouseEnter={handleEnter}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onMouseLeave={handleLeave}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onFocus={handleEnter}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onBlur={handleLeave}
                                    />
                                ) : (
                                    <span
                                        key={corePosition}
                                        title={positionTitle}
                                        style={dotStyle}
                                        className={className}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onMouseEnter={handleEnter}
                                        // eslint-disable-next-line react/jsx-no-bind
                                        onMouseLeave={handleLeave}
                                    />
                                );
                            })}
                        </span>
                    ))}
                </span>
            </span>
            <span className="aliquot-grid-col-labels">
                {FROZEN_GRID_COLS.map((col) => (
                    <span className="aliquot-grid-col-label" key={col}>
                        {col}
                    </span>
                ))}
            </span>
        </span>
    );
}

// Body of the (wide) popover a Frozen slice opens: the core plate + a small
// donor/tissue/aliquot card on the left, and on the right a per-core
// sequencing table and the linked Fixed samples' histology/pathology.
// Presentational only -- AliquotVisualization.js owns the popover itself and
// derives `groups`/`centerColors` (cores grouped by submitting center).
export default function FrozenAliquotPopoverBody({
    slice,
    aliquotId,
    sequenceLabel,
    donorLabel,
    tissueLabel,
    highlightedPositions,
    groups,
    centerColors,
    showNoCorePositionsNote,
    assayPlatformsBySampleName,
    hoveredPosition,
    onHoverPosition,
}) {
    // One table row per core position per submitting center, in position
    // order (A1, A2, ... F6) regardless of which center each came from.
    const coreRows = [];
    groups.forEach((group, groupIndex) => {
        group.positions.forEach((corePosition) => {
            coreRows.push({ corePosition, group, groupIndex });
        });
    });
    coreRows.sort((a, b) => a.corePosition.localeCompare(b.corePosition, undefined, { numeric: true }));
    const coreTableRows = coreRows.map(({ corePosition, group, groupIndex }) => {
        const positionFilesHref = group.positionFilesHrefs[corePosition];
        return {
            key: `${groupIndex}-${corePosition}`,
            hoverKey: corePosition,
            coreLabel: corePosition,
            coreColor:
                (group.submissionCenter && centerColors.get(group.submissionCenter)) || CORE_DOT_DEFAULT_COLOR,
            coreHref: positionFilesHref,
            coreTitle: positionFilesHref
                ? `View ${aliquotId}${corePosition}'s own files`
                : 'No files yet for this position',
            sizeLabel: formatCoreSize(group.positionCoreSizes[corePosition]),
            dataLabels: assayPlatformsBySampleName[group.positionExternalIds[corePosition]] || [],
            centerLabel: formatCenterName(group.submissionCenter) || `GCC${groupIndex + 1}`,
            centerHref: group.filesHref,
            centerTitle: "View this GCC's files for this donor & tissue",
        };
    });
    const pathologyItems = getSortedPathologyReportItems(slice?.associatedPathologyReports);

    return (
        <div className="aliquot-detail-layout">
            <div className="aliquot-detail-left">
                <div className="aliquot-popover-visual">
                    <CorePlateGrid
                        slice={slice}
                        aliquotId={aliquotId}
                        highlightedPositions={highlightedPositions}
                        centerColors={centerColors}
                        hoveredPosition={hoveredPosition}
                        onHoverPosition={onHoverPosition}
                    />
                </div>
                <AliquotInfoCard
                    donorLabel={donorLabel}
                    specimenLabel="Frozen"
                    tissueLabel={tissueLabel}
                    aliquotLabel={sequenceLabel}
                />
            </div>
            <div className="aliquot-detail-right">
                <section className="aliquot-detail-section">
                    <h4 className="aliquot-detail-section-title">Sequencing Data (Core)</h4>
                    <AliquotCoreTable
                        rows={coreTableRows}
                        hoveredKey={hoveredPosition}
                        onHoverKey={onHoverPosition}
                        emptyMessage={
                            showNoCorePositionsNote
                                ? "No core positions assigned yet \u2013 this aliquot hasn't been split into individual sequencing cores."
                                : null
                        }
                    />
                </section>
                <section className="aliquot-detail-section">
                    <h4 className="aliquot-detail-section-title">
                        Nearby Tissue Histology &amp; Pathology Data (All Aliquots)
                    </h4>
                    <div className="aliquot-detail-table-scroll">
                        <table className="aliquot-detail-table is-fixed">
                            <thead>
                                <tr>
                                    <th>Fixed Sample</th>
                                    <th>Pathology Report</th>
                                    <th>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pathologyItems.length === 0 ? (
                                    <tr>
                                        <td className="aliquot-detail-table-empty" colSpan={3}>
                                            No linked Fixed sample yet.
                                        </td>
                                    </tr>
                                ) : (
                                    pathologyItems.map((item) => (
                                        <tr key={item.key}>
                                            <td>{item.externalId}</td>
                                            <td>
                                                {item.href ? (
                                                    <a
                                                        href={item.href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title={item.title || undefined}>
                                                        {item.accession || 'View report'}
                                                    </a>
                                                ) : (
                                                    <span className="aliquot-detail-na">No report yet</span>
                                                )}
                                            </td>
                                            <td>
                                                <PathologyOutcomeBadge
                                                    outcome={item.outcome}
                                                    unacceptableDescription={item.unacceptableDescription}
                                                />
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
