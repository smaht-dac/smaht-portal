'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import ReactTooltip from 'react-tooltip';
import {
    SortableHeaderLabel,
    compareSortValues,
    useCellDetailPopover,
    portalCellDetailPopover,
    renderCellDetailPopover,
    heatmapCellClassName,
    distinctEntryValues,
} from './BrowseTissueHeatmapTable';
import { DonorIdLink, DonorDemographicsCells } from './heatmap-donor-links';
import { DonorSummaryHeaderCell, DonorSummaryCell } from './BrowseBrainPathologyTable';

// The Tissue Overview page's (TissueTypeView.js) Donor Details table: one
// row per donor, Browse by Tissue's heatmap metrics as column groups (one
// column per subtype, see buildTissueOverviewMetricGroups) followed by the
// per-donor facts no heatmap tab covers. Same table/cell classes, colors,
// split cells, legends and click popover as the heatmap tables.

// Same muted "n/a" as the Summary column's own (DonorSummaryCell).
const NA = <span className="tissue-heatmap-donor-summary-empty">n/a</span>;

function formatYesNo(value) {
    if (typeof value !== 'boolean') return NA;
    return value ? 'Yes' : 'No';
}

function booleanSortValue(value) {
    return typeof value === 'boolean' ? Number(value) : null;
}

// Columns after the metric groups -- each only shown when some donor has a
// value for it (e.g. brain tissues have no non-brain pathology report flags).
const TRAILING_COLUMNS = [
    {
        key: 'nonTargetPresence',
        label: 'Non-Target Tissue Presence',
        getValue: (pathologySummary) => pathologySummary.non_target_tissue_present,
    },
    {
        key: 'pathologicFinding',
        label: 'Unexpected/Pathologic Finding',
        getValue: (pathologySummary) => pathologySummary.pathologic_finding_present,
    },
];

const metricSortKey = (group, column) => `${group.key}\u0000${column.key}`;

// A group whose only column isn't a real subtype gets a single header cell
// spanning both header rows.
const isSingleColumnGroup = (group) => group.columns.length === 1 && !group.columns[0].subtypeLabel;

function SortableHeaderCell({ sortKey, label, sortState, onSort, children = null, ...thProps }) {
    return (
        <th {...thProps}>
            {children}
            <SortableHeaderLabel
                label={label}
                sortDirection={sortState?.key === sortKey ? sortState.direction : null}
                // eslint-disable-next-line react/jsx-no-bind
                onClick={() => onSort(sortKey)}
            />
        </th>
    );
}

function MetricHeaderInfo({ tooltip }) {
    if (!tooltip) return null;
    return <i className="icon icon-fw icon-info-circle fas tissue-heatmap-column-header-info" data-tip={tooltip} />;
}

// One metric cell -- the same 3 forms MetricHeatmapTable's renderRowCells
// draws: a Fixed/Frozen split (Ischemic Time), a 2-value split, or a single
// (or "/"-joined) value.
function renderMetricCellContent(group, column, value, entries, slots, enableConditionalColor) {
    const { formatValue, getScoreClass, splitByPreservationType } = group;
    const distinctValues = distinctEntryValues(entries);
    const isSplitMode = splitByPreservationType ? !!slots : distinctValues.length === 2;
    if (isSplitMode) {
        const splitValues = splitByPreservationType
            ? [slots?.[0]?.value ?? null, slots?.[1]?.value ?? null]
            : distinctValues;
        const halfClassName = (half, halfValue) => {
            let scoreClass = '';
            if (halfValue === null) scoreClass = ' is-empty';
            else if (enableConditionalColor) scoreClass = ` ${getScoreClass(halfValue, column.key)}`;
            return `tissue-heatmap-cell-split-half tissue-heatmap-cell-split-half-${half}${scoreClass}`;
        };
        return {
            isSplitMode,
            content: (
                <>
                    <span className={halfClassName('a', splitValues[0])}>{formatValue(splitValues[0])}</span>
                    <span className={halfClassName('b', splitValues[1])}>{formatValue(splitValues[1])}</span>
                </>
            ),
        };
    }
    return {
        isSplitMode,
        content: distinctValues.length > 1
            ? distinctValues.map((v) => formatValue(v)).join(' / ')
            : formatValue(value),
    };
}

/**
 * @param {{ donor, tissue }[]} donors - one entry per donor (dedupeTissuesByDonor).
 * @param {Object[]} metricGroups - see buildTissueOverviewMetricGroups.
 * @param {Object} donorHrefs - see buildDonorHrefs.
 * @param {?Object} donorDiagnosis - see buildDonorBrainDiagnosis; shows the
 *   Summary column when given (brain tissues only).
 */
export function TissueDonorDetailsTable({
    donors = [],
    metricGroups = [],
    donorHrefs = null,
    donorDiagnosis = null,
    enableConditionalColor = true,
}) {
    // null, or { key, direction } -- same asc/desc/none click cycle as the
    // heatmap tables' own headers.
    const [sortState, setSortState] = useState(null);
    const handleSort = (key) => {
        setSortState((prev) => {
            if (!prev || prev.key !== key) return { key, direction: 'asc' };
            if (prev.direction === 'asc') return { key, direction: 'desc' };
            return null;
        });
    };
    const { selectedCell, selectCell, popoverRef, position } = useCellDetailPopover();

    // The metric headers' info icons are react-tooltip targets.
    useEffect(() => {
        ReactTooltip.rebuild();
    }, [metricGroups]);

    // Every metric column, in display order, with its position in its group.
    const metricColumns = useMemo(
        () => metricGroups.flatMap((group) => group.columns.map((column, indexInGroup) => {
            return {
                group,
                column,
                indexInGroup,
                isGroupEnd: indexInGroup === group.columns.length - 1,
            };
        })),
        [metricGroups]
    );

    const baseRows = useMemo(
        () => donors.map(({ donor, tissue }) => {
            return {
                donor,
                donorId: donor?.external_id || donor?.display_title || null,
                pathologySummary: tissue?.pathology_summary || {},
            };
        }),
        [donors]
    );

    const trailingColumns = useMemo(
        () => TRAILING_COLUMNS.filter(({ getValue }) =>
            baseRows.some(({ pathologySummary }) => typeof getValue(pathologySummary) === 'boolean')
        ),
        [baseRows]
    );

    const rows = useMemo(() => {
        if (!sortState) return baseRows;
        let getSortValue = null;
        if (sortState.key === 'donorId') {
            getSortValue = (row) => row.donorId;
        } else if (sortState.key === 'age') {
            getSortValue = (row) => (typeof row.donor?.age === 'number' ? row.donor.age : null);
        } else if (sortState.key === 'sex') {
            getSortValue = (row) => row.donor?.sex ?? null;
        } else {
            const trailing = TRAILING_COLUMNS.find((c) => c.key === sortState.key);
            const metric = metricColumns.find(({ group, column }) => metricSortKey(group, column) === sortState.key);
            if (trailing) {
                getSortValue = (row) => booleanSortValue(trailing.getValue(row.pathologySummary));
            } else if (metric) {
                const { group, column, indexInGroup } = metric;
                getSortValue = (row) => {
                    const value = group.rowsByDonor[row.donorId]?.cells[indexInGroup] ?? null;
                    return value === null ? null : group.getSortValue(value, column.key);
                };
            }
        }
        if (!getSortValue) return baseRows;
        return [...baseRows].sort((a, b) => compareSortValues(getSortValue(a), getSortValue(b), sortState.direction));
    }, [baseRows, sortState, metricColumns]);

    const showSummary = !!donorDiagnosis;
    const hasSubtypeRow = metricGroups.some((group) => !isSingleColumnGroup(group));
    const headerRowSpan = hasSubtypeRow ? 2 : 1;
    const legends = metricGroups.map((group) => group.legend).filter(Boolean);
    const isColumnSelected = (columnIndex) => selectedCell?.columnIndex === columnIndex;

    return (
        <div className="tissue-heatmap-metric tissue-overview-donor-details">
            <div className="tissue-heatmap-metric-heading">
                <div className="tissue-heatmap-metric-heading-row">
                    <div className="tissue-heatmap-metric-title-group">
                        <h2 className="tissue-heatmap-metric-title">Donor Details</h2>
                    </div>
                    {legends.length > 0 ? (
                        <div className="tissue-overview-legends">
                            {legends.map((legend, i) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <React.Fragment key={i}>{legend}</React.Fragment>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
            {rows.length === 0 ? (
                <div className="tissue-heatmap-loading">No donor data available for this tissue type.</div>
            ) : (
                <div className={'tissue-heatmap-table-wrap' + (selectedCell ? ' has-selected-cell' : '')}>
                    <table className="tissue-heatmap-table tissue-heatmap-metric-table tissue-overview-donor-table">
                        <thead>
                            <tr>
                                <SortableHeaderCell sortKey="donorId" label="Donor ID" rowSpan={headerRowSpan}
                                    className="tissue-heatmap-metric-donor-header" sortState={sortState} onSort={handleSort} />
                                <SortableHeaderCell sortKey="age" label="Age" rowSpan={headerRowSpan}
                                    className="tissue-heatmap-demographic-header" sortState={sortState} onSort={handleSort} />
                                <SortableHeaderCell sortKey="sex" label="Sex" rowSpan={headerRowSpan}
                                    className="tissue-heatmap-demographic-header" sortState={sortState} onSort={handleSort} />
                                {showSummary ? <DonorSummaryHeaderCell rowSpan={headerRowSpan} /> : null}
                                {metricGroups.map((group) => {
                                    if (isSingleColumnGroup(group)) {
                                        const columnIndex = metricColumns.findIndex((c) => c.group === group);
                                        return (
                                            <SortableHeaderCell key={group.key} sortKey={metricSortKey(group, group.columns[0])}
                                                label="" rowSpan={headerRowSpan} sortState={sortState} onSort={handleSort}
                                                className={
                                                    'tissue-overview-metric-header tissue-overview-metric-group-end' +
                                                    (isColumnSelected(columnIndex) ? ' is-selected-column' : '')
                                                }>
                                                {group.label}
                                                <MetricHeaderInfo tooltip={group.tooltip} />
                                            </SortableHeaderCell>
                                        );
                                    }
                                    return (
                                        <th key={group.key} colSpan={group.columns.length}
                                            className="tissue-overview-metric-header tissue-overview-metric-group-end">
                                            {group.label}
                                            <MetricHeaderInfo tooltip={group.tooltip} />
                                        </th>
                                    );
                                })}
                                {trailingColumns.map(({ key, label }) => (
                                    <SortableHeaderCell key={key} sortKey={key} label={label} rowSpan={headerRowSpan}
                                        className="tissue-overview-detail-header" sortState={sortState} onSort={handleSort} />
                                ))}
                                <th className="tissue-overview-detail-header" rowSpan={headerRowSpan}>Histology Viewer</th>
                            </tr>
                            {hasSubtypeRow ? (
                                <tr>
                                    {metricColumns.map(({ group, column, isGroupEnd }, columnIndex) => {
                                        if (isSingleColumnGroup(group)) return null;
                                        return (
                                            <SortableHeaderCell key={metricSortKey(group, column)}
                                                sortKey={metricSortKey(group, column)} label={column.subtypeLabel || ''}
                                                sortState={sortState} onSort={handleSort}
                                                className={
                                                    'tissue-overview-metric-subheader' +
                                                    (isGroupEnd ? ' tissue-overview-metric-group-end' : '') +
                                                    (isColumnSelected(columnIndex) ? ' is-selected-column' : '')
                                                } />
                                        );
                                    })}
                                </tr>
                            ) : null}
                        </thead>
                        <tbody>
                            {rows.map(({ donor, donorId, pathologySummary }, rowIndex) => {
                                const histologyImages = pathologySummary.histology_images || [];
                                const histologyHref = histologyImages[0]?.href || histologyImages[0]?.['@id'];
                                return (
                                    <tr key={donor?.uuid || donorId}>
                                        <td className={
                                            'tissue-heatmap-metric-donor-id' +
                                            (selectedCell?.rowIndex === rowIndex ? ' is-selected-row' : '')
                                        }>
                                            <DonorIdLink donorId={donorId} donorHrefs={donorHrefs} />
                                        </td>
                                        <DonorDemographicsCells demographics={{ age: donor?.age ?? null, sex: donor?.sex || null }} />
                                        {showSummary ? <DonorSummaryCell donorId={donorId} donorDiagnosis={donorDiagnosis} /> : null}
                                        {metricColumns.map(({ group, column, indexInGroup, isGroupEnd }, columnIndex) => {
                                            const matrixRow = group.rowsByDonor[donorId];
                                            const value = matrixRow?.cells[indexInGroup] ?? null;
                                            const entries = matrixRow?.cellEntries[indexInGroup] || null;
                                            const slots = matrixRow?.cellSlots[indexInGroup] || [null, null];
                                            const { isSplitMode, content } = renderMetricCellContent(
                                                group, column, value, entries, slots, enableConditionalColor
                                            );
                                            const isSelected = selectedCell?.rowIndex === rowIndex && isColumnSelected(columnIndex);
                                            const className =
                                                (isSplitMode
                                                    ? 'tissue-heatmap-cell tissue-heatmap-cell-split tissue-heatmap-cell-split-vertical'
                                                    : heatmapCellClassName(
                                                        value, group.getScoreClass, enableConditionalColor, false, false, null, column.key
                                                    )) +
                                                (group.cellClassName ? ' ' + group.cellClassName : '') +
                                                (isGroupEnd ? ' tissue-heatmap-cell-group-boundary' : '') +
                                                (isSelected ? ' is-selected' : '');
                                            return (
                                                <td
                                                    key={metricSortKey(group, column)}
                                                    className={className}
                                                    // eslint-disable-next-line react/jsx-no-bind
                                                    onClick={(event) => selectCell(event.currentTarget, {
                                                        rowIndex,
                                                        columnIndex,
                                                        donor: donorId,
                                                        tissueType: column.parentTissueType,
                                                        subtypeLabel: column.subtypeLabel,
                                                        metricLabel: group.label,
                                                        value,
                                                        entries,
                                                        slots,
                                                        splitByPreservationType: group.splitByPreservationType,
                                                        formatValue: group.formatValue,
                                                    })}>
                                                    {content}
                                                </td>
                                            );
                                        })}
                                        {trailingColumns.map(({ key, getValue }) => (
                                            <td key={key} className="tissue-heatmap-demographic">
                                                {formatYesNo(getValue(pathologySummary))}
                                            </td>
                                        ))}
                                        <td className="tissue-heatmap-demographic">
                                            {histologyHref ? (
                                                <a href={histologyHref} target="_blank" rel="noopener noreferrer">
                                                    View{histologyImages.length > 1 ? ` (${histologyImages.length})` : ''}
                                                </a>
                                            ) : NA}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {selectedCell
                ? portalCellDetailPopover(
                    renderCellDetailPopover({
                        donor: selectedCell.donor,
                        tissueType: selectedCell.tissueType,
                        subtypeLabel: selectedCell.subtypeLabel,
                        metricLabel: selectedCell.metricLabel,
                        value: selectedCell.value,
                        entries: selectedCell.entries,
                        slots: selectedCell.slots,
                        splitByPreservationType: selectedCell.splitByPreservationType,
                        formatValue: selectedCell.formatValue,
                        style: position.style,
                        isFlippedUp: position.isFlippedUp,
                        isFlippedRight: position.isFlippedRight,
                    }, popoverRef)
                )
                : null}
        </div>
    );
}
