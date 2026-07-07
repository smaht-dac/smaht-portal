'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import memoize from 'memoize-one';
import url from 'url';
import queryString from 'query-string';
import OverlayTrigger from 'react-bootstrap/esm/OverlayTrigger';
import { Popover, Button } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';
import { console, object, logger } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { normalizeQueryValuesForStringify } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/search-filters';
import { roundLargeNumber } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';
import { isPrimitive } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/misc';

const FALLBACK_GROUP_NAME = 'N/A';
const DEFAULT_MATRIX_BLOCK_WIDTH = 35;
const DEFAULT_MATRIX_BLOCK_HORIZONTAL_EXTEND = 5;

function getCountValueFromItem(item, countField) {
    if (!item) return 0;
    if (countField === 'donors') {
        const donorsVal = Number(item?.counts?.donors);
        if (Number.isFinite(donorsVal)) return donorsVal;
        const donorCountVal = Number(item?.counts?.donor_count);
        return Number.isFinite(donorCountVal) ? donorCountVal : 0;
    }
    const valueFromCounts = Number(item?.counts?.[countField]);
    if (Number.isFinite(valueFromCounts)) return valueFromCounts;
    const valueFromRoot = Number(item?.[countField]);
    if (Number.isFinite(valueFromRoot)) return valueFromRoot;
    // Coverage payloads are not perfectly uniform across transformed rows;
    // guard both nested and root aliases so valid values don't render as empty.
    if (countField === 'total_coverage') {
        const fallbackCoverage = Number(item?.counts?.total_coverage ?? item?.total_coverage);
        return Number.isFinite(fallbackCoverage) ? fallbackCoverage : 0;
    }
    return 0;
}

function getUniqueDonorCountFromItems(items) {
    if (!Array.isArray(items)) return null;
    const donorSet = new Set();
    const donorCountCandidates = [];

    const addDonorValue = (value) => {
        if (Array.isArray(value)) {
            value.forEach(addDonorValue);
            return;
        }
        if (value == null) return;
        if (typeof value === 'object') {
            addDonorValue(value.display_title ?? value.accession ?? value.title ?? value.uuid);
            return;
        }
        donorSet.add(String(value));
    };

    const addDonorCountCandidate = (value) => {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
            donorCountCandidates.push(numericValue);
        }
    };

    items.forEach((item) => {
        if (!item) return;
        addDonorValue(item.donor);
        addDonorValue(item.donors);
        addDonorCountCandidate(item?.counts?.donors);
        addDonorCountCandidate(item?.counts?.donor_count);
    });

    if (donorSet.size > 0) return donorSet.size;
    if (donorCountCandidates.length > 0) return Math.max(...donorCountCandidates);
    return null;
}

function formatLocalizedNumber(value, options = undefined) {
    const normalizedValue = Number(value) || 0;
    const {
        minimumFractionDigits = 0,
        maximumFractionDigits = 3
    } = options || {};
    const fixedValue = normalizedValue.toFixed(maximumFractionDigits);
    let [integerPart, fractionPart = ''] = fixedValue.split('.');
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (maximumFractionDigits === 0) {
        return integerPart;
    }

    fractionPart = fractionPart.replace(/0+$/, '');
    if (fractionPart.length < minimumFractionDigits) {
        fractionPart = fractionPart.padEnd(minimumFractionDigits, '0');
    }

    return fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : integerPart;
}

function formatCompactedNumericValue(value, {
    decimalsByThreshold = null,
    units = [
        { threshold: 1e9, suffix: 'B' },
        { threshold: 1e6, suffix: 'M' },
        { threshold: 1e3, suffix: 'K' }
    ]
} = {}) {
    const normalizedValue = Number(value) || 0;
    if (normalizedValue === 0) {
        return {
            display: '0',
            tooltipValue: '0',
            isCompacted: false
        };
    }

    const absValue = Math.abs(normalizedValue);
    const matchingUnit = units.find(({ threshold }) => absValue >= threshold) || null;
    if (!matchingUnit) {
        return {
            display: formatLocalizedNumber(normalizedValue),
            tooltipValue: formatLocalizedNumber(normalizedValue),
            isCompacted: false
        };
    }

    const scaledValue = normalizedValue / matchingUnit.threshold;
    const decimals = typeof decimalsByThreshold === 'function'
        ? decimalsByThreshold(scaledValue, matchingUnit)
        : (scaledValue >= 100 ? 0 : 1);
    const formattedValue = `${formatLocalizedNumber(parseFloat(scaledValue.toFixed(decimals)), {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals
    })}${matchingUnit.suffix}`;

    return {
        display: formattedValue,
        tooltipValue: formatLocalizedNumber(normalizedValue),
        isCompacted: !!matchingUnit
    };
}

function formatCoverageDisplayValue(value, compact = false) {
    const normalizedValue = Number(value) || 0;
    if (normalizedValue <= 0) {
        return {
            display: '0X',
            tooltipValue: '0',
            isCompacted: false
        };
    }

    const compactedValue = formatCompactedNumericValue(normalizedValue, {
        decimalsByThreshold: (scaledValue) => (scaledValue >= 100 ? 0 : 1)
    });

    if (compactedValue.isCompacted) {
        return {
            ...compactedValue,
            display: `${compactedValue.display}X`
        };
    }

    const roundedValue = compact
        ? Math.round(normalizedValue)
        : (normalizedValue < 100 ? Math.round(normalizedValue * 10) / 10 : Math.round(normalizedValue));
    return {
        display: `${formatLocalizedNumber(roundedValue)}X`,
        tooltipValue: formatLocalizedNumber(normalizedValue),
        isCompacted: false
    };
}

function renderVerticalRowGroupsExtended({
    rowGroupsExtended,
    rowGroupsExtendedKeys,
    rowKeys,
    rowHeight,
    rowGroupsExtendedByLowerKey,
    renderRow
}) {
    if (!rowGroupsExtended || !rowGroupsExtendedKeys || !rowKeys) return null;
    const fallbackGroupNameLower = FALLBACK_GROUP_NAME.toLowerCase();
    return _.map(rowGroupsExtendedKeys, function (rgKey) {
        const rgKeyLower = typeof rgKey === 'string' ? rgKey.toLowerCase() : rgKey;
        const isFallback = typeof rgKey === 'string' && rgKeyLower === fallbackGroupNameLower;
        const resolvedRgKey = (!isFallback && typeof rgKey === 'string')
            ? (rowGroupsExtendedByLowerKey[rgKeyLower] || rgKey)
            : rgKey;
        const displayKey = isFallback ? FALLBACK_GROUP_NAME : resolvedRgKey;
        const { values, backgroundColor, textColor } = (!isFallback && rowGroupsExtended[resolvedRgKey])
            ? rowGroupsExtended[resolvedRgKey]
            : { values: [], backgroundColor: '#ffffff', textColor: '#000000' };

        let rowGroupChildRowsKeys;
        if (isFallback) {
            const allValues = StackedBlockGroupedRow.mergeValues(rowGroupsExtended);
            rowGroupChildRowsKeys = StackedBlockGroupedRow.difference(rowKeys, allValues);
        } else {
            rowGroupChildRowsKeys = StackedBlockGroupedRow.intersection(rowKeys, values);
        }
        const rowSpan = rowGroupChildRowsKeys.length;
        if (rowSpan === 0) return null;

        const label = (displayKey.length > (rowSpan * 4)) && rowGroupsExtended[resolvedRgKey]?.shortName
            ? rowGroupsExtended[resolvedRgKey].shortName
            : displayKey;

        return (
            <div className="vertical-container">
                <div className="vertical-container-label" style={{ backgroundColor, color: textColor, height: rowHeight * rowSpan }}>
                    <span data-tip={displayKey !== label ? displayKey : null}>{label}</span>
                </div>
                <div className="vertical-container-rows">
                    {_.map(rowGroupChildRowsKeys, (k) => renderRow(k))}
                </div>
            </div>
        );
    });
}

// Recursively groups a list of objects by each property in order, returning a nested object tree
// (e.g., groupByMultiple([{ a: 1, b: 2 }, { a: 1, b: 3 }], ['a','b']) -> { '1': { '2': [...], '3': [...] } }).
export function groupByMultiple(objList, propertiesList){
    var maxDepth = (propertiesList || []).length - 1;
    return (function doGroup(list, depth){
        var groupedLists = _.groupBy(list, propertiesList[depth]);
        if (depth < maxDepth){
            _.keys(groupedLists).forEach(function(k){
                groupedLists[k] = doGroup(groupedLists[k], depth + 1);
            });
        }
        return groupedLists;
    })(objList, 0);

}

export function extendListObjectsWithIndex(objList){
    return _.map(objList || [], function(o, idx){
        return _.extend({ 'index' : idx }, o);
    });
}

// Reduces the currently-visible matrix (same data/countFor state the grid renders from) into a
// flat, JSON-serializable table: one row per leaf row-group (donor, donor+tissue, or tissue),
// one field per visible column, plus row/column/grand totals sourced the same way the on-screen
// summary cells are (from rowTotals/columnTotals, not by re-summing `data`).
// Example: buildMatrixExportData({ data, rowTotals, columnTotals, groupingProperties: ['donor','tissue'], columnGrouping: 'assay', countFor: 'files' })
export function buildMatrixExportData({
    data = [],
    rowTotals = [],
    columnTotals = [],
    groupingProperties = [],
    columnGrouping = null,
    countFor = 'files',
    overallCounts = null,
    matrixMode = null,
    rowAxisLabel = null,
    columnAxisLabel = null
} = {}) {
    const countField = countFor === 'tissue_files' ? 'files' : countFor;

    const computeCellValue = (items) => {
        if (!Array.isArray(items) || items.length === 0) return 0;
        if (countField === 'donors') {
            const uniqueDonorCount = getUniqueDonorCountFromItems(items);
            if (uniqueDonorCount !== null) return uniqueDonorCount;
            return _.reduce(items, (max, item) => Math.max(max, getCountValueFromItem(item, countField)), 0);
        }
        return _.reduce(items, (sum, item) => sum + getCountValueFromItem(item, countField), 0);
    };

    const safeData = Array.isArray(data) ? data : [];
    const nestedData = groupByMultiple(safeData, groupingProperties);
    const groupedByColumn = typeof columnGrouping === 'string' ? _.groupBy(safeData, columnGrouping) : {};
    const columns = _.chain(groupedByColumn).keys().sort().value();

    // Row/column totals come from the backend-aggregated totals arrays (same source the
    // row-summary/col-summary blocks use), keyed by the same grouping-property values.
    const rowTotalsByPath = _.groupBy(
        Array.isArray(rowTotals) ? rowTotals : [],
        (row) => JSON.stringify(groupingProperties.map((prop) => row?.[prop]))
    );
    const columnTotalsByKey = _.groupBy(Array.isArray(columnTotals) ? columnTotals : [], columnGrouping);

    const rows = [];
    (function collectLeafRows(node, pathValues, depth) {
        if (depth >= groupingProperties.length) {
            const items = Array.isArray(node) ? node : [];
            const rowKeyFields = _.object(groupingProperties, pathValues);
            const byColumn = _.groupBy(items, columnGrouping);
            const counts = {};
            columns.forEach((col) => {
                counts[col] = computeCellValue(byColumn[col] || []);
            });
            const matchingRowTotals = rowTotalsByPath[JSON.stringify(pathValues)];
            // germLayer (e.g. Ectoderm/Mesoderm/Endoderm/Germline) is not a grouping property but a
            // per-tissue-row attribute shown on-screen as the colored vertical row-group label;
            // surface it on each row when present so the grouping isn't lost on export.
            const germLayerValue = items.length > 0 ? (items[0]?.germLayer ?? null) : null;
            rows.push({
                ...rowKeyFields,
                ...(germLayerValue != null ? { germLayer: germLayerValue } : {}),
                counts,
                rowTotal: computeCellValue(matchingRowTotals && matchingRowTotals.length ? matchingRowTotals : items)
            });
            return;
        }
        _.each(node, (childNode, key) => collectLeafRows(childNode, [...pathValues, key], depth + 1));
    })(nestedData, [], 0);

    const columnTotalsMap = {};
    columns.forEach((col) => {
        const matchingColumnTotals = columnTotalsByKey[col];
        columnTotalsMap[col] = computeCellValue(
            matchingColumnTotals && matchingColumnTotals.length ? matchingColumnTotals : (groupedByColumn[col] || [])
        );
    });

    const grandTotal = overallCounts && Number.isFinite(Number(overallCounts?.[countField]))
        ? Number(overallCounts[countField])
        : computeCellValue(Array.isArray(columnTotals) && columnTotals.length ? columnTotals : safeData);

    return {
        matrixMode,
        countFor,
        rowFields: groupingProperties,
        columnField: columnGrouping,
        rowAxisLabel,
        columnAxisLabel,
        columns,
        rows,
        columnTotals: columnTotalsMap,
        grandTotal,
        generatedAt: new Date().toISOString()
    };
}

// VisualBody renders the matrix wrapper with popovers and count formatting.
// Example: <VisualBody results={{ all: data, row_totals: totals }} groupingProperties={['donor','tissue']} columnGrouping="assay" />
export class VisualBody extends React.PureComponent {

    constructor(props){
        super(props);
        this.blockPopover = this.blockPopover.bind(this);
        this.loadingContainerRef = null;
        this.state = {
            loadingIndicatorLayout: null
        };
        this.updateLoadingIndicatorLayout = this.updateLoadingIndicatorLayout.bind(this);
    }

    componentDidMount() {
        const { isLoading } = this.props;
        if (isLoading) {
            this.updateLoadingIndicatorLayout();
        }
        window.addEventListener('resize', this.updateLoadingIndicatorLayout, { passive: true });
    }

    componentDidUpdate(prevProps) {
        const { isLoading, xAxisLabel, yAxisLabel, showAxisLabels } = this.props;
        const { loadingIndicatorLayout } = this.state;
        if (isLoading) {
            const loadingStateChanged = prevProps.isLoading !== isLoading;
            if (loadingStateChanged) {
                this.updateLoadingIndicatorLayout();
                return;
            }
            if (
                prevProps.xAxisLabel !== xAxisLabel ||
                prevProps.yAxisLabel !== yAxisLabel ||
                prevProps.showAxisLabels !== showAxisLabels
            ) {
                this.updateLoadingIndicatorLayout();
            }
        } else if (prevProps.isLoading) {
            if (loadingIndicatorLayout !== null) {
                this.setState({ loadingIndicatorLayout: null });
            }
        }
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.updateLoadingIndicatorLayout);
    }

    static blockRenderedContents(data, blockProps){
        const countFor = blockProps && blockProps.countFor ? blockProps.countFor : 'files';
        const blockType = blockProps && blockProps.blockType ? blockProps.blockType : 'regular';
        const countField = countFor === 'tissue_files' ? 'files' : countFor;
        const blockSum = typeof blockProps?.computedBlockValue === 'number'
            ? blockProps.computedBlockValue
            : (Array.isArray(data)
            ? (countField === 'donors'
                ? (() => {
                    const uniqueDonorCount = getUniqueDonorCountFromItems(data);
                    if (uniqueDonorCount !== null) return uniqueDonorCount;
                    return _.reduce(data, function (maxValue, item) {
                        return Math.max(maxValue, getCountValueFromItem(item, countField));
                    }, 0);
                })()
                : _.reduce(data, function (sum, item) { return sum + getCountValueFromItem(item, countField); }, 0))
            : (data ? getCountValueFromItem(data, countField) : 0));

        // For total_coverage, we want to display the value with "X" and
        // use a different formatting logic. For other count types, we display the raw count with standard formatting.
        if (countFor === 'total_coverage') {
            const shouldShowCoverageSummary = !!blockProps?.showCoverageSummaries;
            if (!shouldShowCoverageSummary && (blockType === 'col-summary' || blockType === 'row-summary' || blockType === 'col-secondary-summary')) {
                return <span data-count={blockSum}>&nbsp;</span>;
            }
            if (blockSum <= 0) return <span data-count={blockSum}>0</span>;
            // Summary cells are narrower than the regular coverage tiles, so
            // prefer the compact formatter there unless a caller overrides it.
            const compactCoverageText = typeof blockProps?.compactCoverageText === 'boolean'
                ? blockProps.compactCoverageText
                : (blockType === 'col-summary' || blockType === 'row-summary' || blockType === 'col-secondary-summary');
            const { display, tooltipValue, isCompacted } = formatCoverageDisplayValue(blockSum, compactCoverageText);
            const fontSize = compactCoverageText
                ? (display.length > 6 ? '0.60rem' : (display.length > 4 ? '0.66rem' : '0.72rem'))
                : (display.length > 7 ? '0.72rem' : (display.length > 5 ? '0.8rem' : '0.9rem'));
            return (
                <span
                    style={{ fontSize }}
                    data-count={blockSum}
                    {...(isCompacted ? { 'data-tip': `${tooltipValue}X` } : {})}>
                    {display}
                </span>
            );
        }

        if (blockSum >= 1000){
            const decimal = blockSum >= 10000 ? 0 : 1;
            const compactedValue = formatCompactedNumericValue(blockSum, {
                decimalsByThreshold: (scaledValue) => (scaledValue >= 10 ? 0 : decimal)
            });
            return (
                <span style={{ 'fontSize' : '0.80rem', 'position' : 'relative', 'top' : -1 }} data-count={blockSum}>
                    { compactedValue.isCompacted ? compactedValue.display : roundLargeNumber(blockSum, decimal) }
                </span>
            );
        }
        if (blockSum >= 100){
            return <span style={{ 'fontSize' : '0.90rem', 'position' : 'relative', 'top' : -1 }} data-count={blockSum}>{ blockSum }</span>;
        }
        return <span data-count={blockSum}>{ blockSum }</span>;
    }
    /**
     * replacement of underscore's invert function.
     * While underscore's invert requires all of object's values should be
     * unique and string serializable, VisualBody.invert allows multiple
     * mappings and convert them to array (e.g., { a: 'x', b: 'x' } -> { x: ['a','b'] }).
     **/
    static invert(object) {
        const result = {};
        const keys = Object.keys(object);
        for (var i = 0, length = keys.length; i < length; i++) {
            if (result[object[keys[i]]] instanceof Array) {
                result[object[keys[i]]].push(keys[i]);
            } else if (result[object[keys[i]]]) {
                const temp = result[object[keys[i]]];
                result[object[keys[i]]] = [temp, keys[i]];
            } else {
                result[object[keys[i]]] = keys[i];
            }
        }
        return result;
    }

    // Given a facet field and term, check if it represents a composite value
    static getFacetPairs(facetField, facetTerm, aggregatedFields, valueDelimiter) {
        const hasCompositeInput = (
            Array.isArray(aggregatedFields) &&
            aggregatedFields.length >= 2 &&
            aggregatedFields.indexOf(facetField) > -1 &&
            facetTerm &&
            typeof valueDelimiter === 'string' &&
            valueDelimiter
        );
        if (!hasCompositeInput) return null;

        // If aggregatedFields is an array, we assume the first element is the field and the second is the extended term.
        const splitTerm = (term) => term.split(valueDelimiter);

        if (typeof facetTerm === 'string' && facetTerm.indexOf(valueDelimiter) > -1) {
            const [baseFacetTerm, extendedFacetTerm] = splitTerm(facetTerm);
            return [[facetField, baseFacetTerm], [aggregatedFields[1], extendedFacetTerm]];
        }

        if (Array.isArray(facetTerm)) {
            const allCompositeTerms = _.all(_.map(facetTerm, (term) => typeof term === 'string' && term.indexOf(valueDelimiter) > -1));
            if (allCompositeTerms) {
                // If facetTerm is an array, we assume all elements are strings with the same format.
                const baseFacetTerms = _.uniq(_.map(facetTerm, (term) => splitTerm(term)[0]));
                const extendedFacetTerms = _.uniq(_.map(facetTerm, (term) => splitTerm(term)[1]));
                return [[facetField, baseFacetTerms], [aggregatedFields[1], extendedFacetTerms]];
            }
        }

        return null;
    }

    updateLoadingIndicatorLayout() {
        if (!this.loadingContainerRef) return;
        const matrixPanelContent = this.loadingContainerRef.closest('.matrix-panel-content');
        const tabsEl = matrixPanelContent ? matrixPanelContent.querySelector('.matrix-mode-tabs') : null;
        const { loadingIndicatorLayout } = this.state;
        if (!tabsEl) {
            if (loadingIndicatorLayout !== null) {
                this.setState({ loadingIndicatorLayout: null });
            }
            return;
        }
        const containerRect = this.loadingContainerRef.getBoundingClientRect();
        const tabsRect = tabsEl.getBoundingClientRect();
        // Center the loading spinner to the inner mode-tab strip instead of the full viewport width.
        const nextLayout = {
            width: Math.round(tabsRect.width),
            marginLeft: Math.max(0, Math.round(tabsRect.left - containerRect.left))
        };
        const prevLayout = loadingIndicatorLayout;
        if (!prevLayout || prevLayout.width !== nextLayout.width || prevLayout.marginLeft !== nextLayout.marginLeft) {
            this.setState({ loadingIndicatorLayout: nextLayout });
        }
    }

    findKeyByValue(obj, value) {
        const values = Array.isArray(value) ? value : [value];
        const matchingKeys = _.chain(values)
            .compact()
            .reduce((memo, currentValue) => {
                Object.entries(obj).forEach(([key, group]) => {
                    if (group.values && Array.isArray(group.values) && group.values.includes(currentValue)) {
                        memo.push(key);
                    }
                });
                return memo;
            }, [])
            .uniq()
            .value();

        if (matchingKeys.length === 0) {
            return null;
        }
        if (matchingKeys.length > 1) {
            return 'Multiple';
        }
        return matchingKeys[0];
    }

    /**
     * @param {*} data A File or list of Files, represented by a block/tile.
     * @param {Object} props Props passed in from the StackedBlockVisual Component instance.
     */
    blockPopover(data, blockProps, parentGrouping){
        // Input / config
        const {
            query: { url: queryUrl, columnAggFields, rowAggFields },
            fieldChangeMap, valueChangeMap, titleMap,
            groupingProperties, columnGrouping, valueDelimiter,
            rowGroupsExtended, additionalPopoverData = {}, baseBrowseFilesPath,
            browseFilteringTransformFunc, activeFacetHref
        } = this.props;
        const { depth, blockType = null, popoverPrimaryTitle, rowGroups, rowGroupKey, columnKey, summaryCounts = null, countFor = 'files', computedBlockValue = null } = blockProps;
        const effectiveBlockType = blockType === 'col-secondary-summary' ? 'col-summary' : blockType;
        let isGroup = (Array.isArray(data) && data.length >= 1) || false;
        let aggrData;
        let summaryRows = null;

        // Normalize data shape
        if (!isGroup && Array.isArray(data)){
            if(data.length === 0){
                return null; // No data to show
            }
            data = data[0];
        }

        // col-summary can include synthetic count-only data; rebuild popover context from grouped rows.
        if (effectiveBlockType === 'col-summary' && blockProps.groupedDataIndices && columnKey) {
            if (columnKey === 'overall-summary') {
                const rowsById = {};
                Object.keys(blockProps.groupedDataIndices).forEach((ck) => {
                    (blockProps.groupedDataIndices[ck] || []).forEach((row, idx) => {
                        const rowKey = row && typeof row.index !== 'undefined' ? `idx-${row.index}` : `fallback-${ck}-${idx}`;
                        rowsById[rowKey] = row;
                    });
                });
                summaryRows = _.values(rowsById);
            } else if (Array.isArray(blockProps.groupedDataIndices[columnKey])) {
                summaryRows = blockProps.groupedDataIndices[columnKey];
            }
            if (Array.isArray(summaryRows) && summaryRows.length > 0) {
                data = summaryRows;
                isGroup = true;
            }
        }

        // Aggregate values for grouped blocks
        if (isGroup) {
            const keysToInclude = _.uniq(_.keys(titleMap).concat([columnGrouping]).concat(groupingProperties)).concat(['primary_field_override']);
            aggrData = StackedBlockVisual.aggregateObjectFromList(
                data, keysToInclude, [] // We use this property as an object key (string) so skip parsing to React JSX list;
            );
            if (effectiveBlockType === 'col-summary') {
                aggrData = _.extend({}, aggrData, { [columnGrouping]: columnKey === 'overall-summary' ? 'Overall' : columnKey });
            }
        } else {
            aggrData = data;
        }

        if (!aggrData) {
            return;
        }

        // Grouping metadata (labels + values)
        // e.g. Donor
        const primaryGrpProp = groupingProperties[0] || null;
        const primaryGrpPropTitle = popoverPrimaryTitle || (primaryGrpProp && titleMap[primaryGrpProp]) || primaryGrpProp || null;
        const primaryGrpPropValue = aggrData[primaryGrpProp];
        const primaryGrpPropUniqueCount = Array.isArray(aggrData[primaryGrpProp]) ? aggrData[primaryGrpProp].length : (aggrData[primaryGrpProp] && aggrData[primaryGrpProp] !== 'No value' ? 1 : 0);
        // e.g. Tissue
        const secondaryGrpProp = groupingProperties[1] || null;
        const secondaryGrpPropTitle = (secondaryGrpProp && titleMap[secondaryGrpProp]) || secondaryGrpProp || null;
        const secondaryGrpPropValue = aggrData[secondaryGrpProp];
        const secondaryGrpPropUniqueCount = Array.isArray(aggrData[secondaryGrpProp]) ? aggrData[secondaryGrpProp].length : (aggrData[secondaryGrpProp] && aggrData[secondaryGrpProp] !== 'No value' ? 1 : 0);
        // Title area values
        const yAxisGroupingTitle = (columnGrouping && titleMap[columnGrouping]) || columnGrouping || null;
        const yAxisGroupingValue = aggrData[columnGrouping] || (isGroup ? data[0][columnGrouping] : data[columnGrouping]) || columnKey;
        const groupedItems = Array.isArray(data) ? data : (data ? [data] : []);
        const groupedGermLayers = _.chain(groupedItems)
            .map((item) => item?.germLayer)
            .flatten()
            .compact()
            .filter((value) => value !== 'No value')
            .map((value) => String(value))
            .uniq()
            .value();
        // e.g. Germ Layer (Ectoderm, Mesoderm, Endoderm ...etc) if available
        let secondaryGrpPropCategoryValue = groupedGermLayers.length > 1
            ? 'Multiple'
            : (groupedGermLayers[0] || aggrData.germLayer || null);
        if (!secondaryGrpPropCategoryValue && rowGroupsExtended) {
            const rowGroupSourceValues = _.uniq(_.compact([secondaryGrpPropValue, primaryGrpPropValue, yAxisGroupingValue]));
            for (const rowGroupSourceValue of rowGroupSourceValues) {
                secondaryGrpPropCategoryValue = this.findKeyByValue(rowGroupsExtended, rowGroupSourceValue);
                if (secondaryGrpPropCategoryValue) {
                    break;
                }
            }
        }

        // URL builder: converts current block state into browse filters
        function generateBrowseUrl() {
            let currentFilteringProperties = groupingProperties.slice(0, depth + 1);
            if (effectiveBlockType !== 'row-summary' && !(effectiveBlockType === 'col-summary' && columnKey === 'overall-summary')) {
                currentFilteringProperties = currentFilteringProperties.concat([columnGrouping]);
            }
            const currentFilteringPropertiesPairs = _.map(currentFilteringProperties, function (property) {
                let facetField = fieldChangeMap[property] || property;
                let facetTerm = aggrData[property];
                if (!facetTerm && effectiveBlockType === 'col-summary' && property === columnGrouping && columnKey) {
                    facetTerm = columnKey;
                }
                if (valueChangeMap && valueChangeMap[property]) {
                    const reversedValChangeMapForCurrSource = VisualBody.invert(valueChangeMap[property]);
                    facetTerm = reversedValChangeMapForCurrSource[facetTerm] || facetTerm;
                }

                // workaround for the case when dataset is used as cell_line
                if (aggrData.primary_field_override && property === groupingProperties[0]) {
                    facetField = aggrData.primary_field_override;
                }

                //TODO: handle composite values in a smart way, this workaround is too hacky
                //1. traverse columnAggFields to see if facetField exists there
                let compositeFacetPairs = VisualBody.getFacetPairs(
                    facetField,
                    facetTerm,
                    columnAggFields,
                    valueDelimiter
                );
                //2. traverse rowAggFields to see if facetField exists there
                if (!compositeFacetPairs && Array.isArray(rowAggFields)) {
                    for (const field of rowAggFields) {
                        compositeFacetPairs = VisualBody.getFacetPairs(
                            facetField,
                            facetTerm,
                            field,
                            valueDelimiter
                        );
                        if (compositeFacetPairs) break;
                    }
                }

                return compositeFacetPairs ? compositeFacetPairs : [facetField, facetTerm];
            });

            // Flatten key/value pairs into query params (supporting composite facet pairs).
            const convertPairsToObject = (pairs) => {
                const result = {};

                pairs.forEach((pair) => {
                    // If the item itself is an array of [key, value] pairs
                    if (Array.isArray(pair) && Array.isArray(pair[0]) && pair[0].length === 2) {
                        // Loop through each sub-pair
                        pair.forEach((subPair) => {
                            const [key, value] = subPair;
                            if (isPrimitive(value) || Array.isArray(value)) {
                                result[key] = value;
                            }
                        });
                    } else if (Array.isArray(pair) && pair.length === 2) {
                        // It's a normal [key, value] pair
                        const [key, value] = pair;
                        if (isPrimitive(value) || Array.isArray(value)) {
                            result[key] = value;
                        }
                    } else {
                        throw new Error("Invalid pairs");
                    }
                });

                return result;
            };

            let currentFilteringPropertiesVals = convertPairsToObject(currentFilteringPropertiesPairs);

            // Allow caller to override or transform filters.
            if (typeof browseFilteringTransformFunc === 'function') {
                currentFilteringPropertiesVals = browseFilteringTransformFunc(currentFilteringPropertiesVals, effectiveBlockType);
            }

            let initialHref = activeFacetHref || queryUrl;
            const customUrlParams = rowGroups && rowGroupKey ? rowGroups[rowGroupKey]?.customUrlParams : null;
            let customUrlParamsPositiveKeys = null;

            if (customUrlParams && effectiveBlockType === 'col-summary') {
                // If rowGroups is defined and rowGroupKey is set, we use customUrlParams from rowGroups
                initialHref += '&' + customUrlParams;
                customUrlParamsPositiveKeys = new Set(
                    Object.keys(queryString.parse(customUrlParams)).filter((key) => !key.endsWith('!'))
                );
            }

            const hrefParts = url.parse(initialHref, true);
            const hrefQuery = normalizeQueryValuesForStringify(_.clone(hrefParts.query));

            if (customUrlParamsPositiveKeys) {
                customUrlParamsPositiveKeys.forEach((key) => {
                    const negativeKey = key + '!';
                    if (hrefQuery[negativeKey]) delete hrefQuery[negativeKey];
                });
            }

            _.forEach(currentFilteringPropertiesPairs, ([field]) => {
                if (hrefQuery[field]) delete hrefQuery[field];
                if (hrefQuery[field + '!']) delete hrefQuery[field + '!'];
            });

            //override path
            hrefParts.pathname = baseBrowseFilesPath;
            delete hrefQuery.limit;
            delete hrefQuery.field;
            _.extend(hrefQuery, currentFilteringPropertiesVals);
            hrefParts.search = '?' + queryString.stringify(normalizeQueryValuesForStringify(hrefQuery));
            const linkHref = url.format(hrefParts);

            return linkHref;
        }

        function makeSearchButton(linkHref, disabled = false) {
            return (
                <Button disabled={disabled} href={linkHref} target="_blank" variant="primary" className="w-100 mt-1">Browse Files</Button>
            );
        }

        // Aggregate values for summary rows
        const browseUrl = generateBrowseUrl();

        const dataForCounts = Array.isArray(data) ? data : (data ? [data] : []);
        const rowSummaryItems = effectiveBlockType === 'row-summary'
            ? (Array.isArray(blockProps.data) ? blockProps.data : (blockProps.data ? [blockProps.data] : []))
            : [];
        const isTissueGrouping = (() => {
            const primaryGroupingProp = Array.isArray(groupingProperties) ? groupingProperties[0] : primaryGrpProp;
            const primaryGroupingField = fieldChangeMap?.[primaryGroupingProp] || primaryGroupingProp;
            return primaryGroupingField === 'sample_summary.tissues';
        })();

        const getResolvedDonorCountFromItems = (items) => {
            const uniqueDonorCount = getUniqueDonorCountFromItems(items);
            if (uniqueDonorCount !== null) return uniqueDonorCount;

            // Tissue x Assay file summaries can be backed by aggregated rows that do not
            // carry donor identifiers, so fall back to the aggregate donor totals.
            if (!isTissueGrouping || (effectiveBlockType !== 'col-summary' && effectiveBlockType !== 'row-summary')) return 0;
            if (summaryCounts) {
                return summaryCounts?.donors ?? summaryCounts?.donor_count ?? 0;
            }
            if (effectiveBlockType === 'row-summary') {
                const rowSummaryCounts = dataForCounts[0]?.counts;
                return rowSummaryCounts?.donors ?? rowSummaryCounts?.donor_count ?? 0;
            }
            if (columnKey === 'overall-summary') {
                return this.props.overallCounts?.donors ?? this.props.overallCounts?.donor_count ?? 0;
            }
            if (!Array.isArray(this.props.columnTotals)) return 0;
            const fallbackSummaryCounts = StackedBlockGroupedRow.getColumnTotalsEntry(columnKey, this.props)?.counts;
            return fallbackSummaryCounts?.donors ?? fallbackSummaryCounts?.donor_count ?? 0;
        };
        const getUniqueValueCountFromItems = (items, fieldName) => {
            if (!fieldName) return 0;
            const valueSet = new Set();
            (items || []).forEach((item) => {
                if (!item) return;
                const fieldValue = item[fieldName];
                if (Array.isArray(fieldValue)) {
                    fieldValue.forEach((value) => {
                        if (value != null && value !== 'No value') valueSet.add(String(value));
                    });
                } else if (fieldValue != null && fieldValue !== 'No value') {
                    valueSet.add(String(fieldValue));
                }
            });
            return valueSet.size;
        };
        const getFilesCountFromItem = (item) => {
            if (item && item.counts && typeof item.counts.files === 'number') return item.counts.files;
            if (item && typeof item.files === 'number') return item.files;
            return 0;
        };
        const getTotalCoverageFromItem = (item) => {
            if (item && item.counts && typeof item.counts.total_coverage === 'number') return item.counts.total_coverage;
            if (item && typeof item.total_coverage === 'number') return item.total_coverage;
            return 0;
        };

        const { fileCount, totalCoverage } = _.reduce(dataForCounts, function (sum, item) {
            return {
                fileCount: sum.fileCount + getFilesCountFromItem(item),
                totalCoverage: sum.totalCoverage + getTotalCoverageFromItem(item)
            };
        }, { fileCount: 0, totalCoverage: 0 });
        const rowSummaryFilesFromItems = _.reduce(rowSummaryItems, function(sum, item) {
            return sum + getFilesCountFromItem(item);
        }, 0);
        const shouldUseComputedSummaryValue = (
            (effectiveBlockType === 'col-summary' || effectiveBlockType === 'row-summary') &&
            typeof computedBlockValue === 'number'
        );
        const effectiveFileCount = ((countFor === 'files' || countFor === 'tissue_files') && shouldUseComputedSummaryValue)
            ? computedBlockValue
            : (effectiveBlockType === 'row-summary' && countFor === 'donors' && rowSummaryFilesFromItems > 0)
                ? rowSummaryFilesFromItems
                : (typeof summaryCounts?.files === 'number'
                    ? summaryCounts.files
                    : fileCount);
        const effectiveTotalCoverage = (countFor === 'total_coverage' && shouldUseComputedSummaryValue)
            ? computedBlockValue
            : (typeof summaryCounts?.total_coverage === 'number'
                ? summaryCounts.total_coverage
                : totalCoverage);
        const donorCount = getResolvedDonorCountFromItems(dataForCounts);
        const isTissueColumnGrouping = (fieldChangeMap?.[columnGrouping] || columnGrouping) === 'sample_summary.tissues';
        const assayCount = getUniqueValueCountFromItems(dataForCounts, 'assay');
        const tissueCount = isTissueColumnGrouping
            ? getUniqueValueCountFromItems(effectiveBlockType === 'row-summary' ? rowSummaryItems : dataForCounts, columnGrouping)
            : 0;
        const effectiveSecondaryGrpPropUniqueCount = (effectiveBlockType === 'row-summary' && secondaryGrpProp)
            ? (getUniqueValueCountFromItems(rowSummaryItems, secondaryGrpProp) || secondaryGrpPropUniqueCount)
            : secondaryGrpPropUniqueCount;
        // Round totalCoverage to 2 decimal places since ES has floating point precision issues
        const roundedTotalCoverage = effectiveTotalCoverage > 0 ? Math.round(effectiveTotalCoverage * 100) / 100 : 0;
        const totalCoverageDisplay = roundedTotalCoverage > 0 ? `${formatLocalizedNumber(roundedTotalCoverage, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}X` : '--';
        const formattedFileCount = typeof effectiveFileCount === 'number' ? formatLocalizedNumber(effectiveFileCount) : effectiveFileCount;
        const formatGermLayerValue = (value) => (value && value !== 'No value' ? value : '--');

        // Render
        return (
            <Popover id="jap-popover">
                <Popover.Body>
                    {isGroup ?
                        <div className="inner">
                            {effectiveBlockType === 'regular' ? (
                                <div className="row primary-row pb-1 pt-1">
                                    <div className="col-4">
                                        <div className="label me-05">{primaryGrpPropTitle}</div>
                                        <div className="value">{primaryGrpPropValue || '--'}</div>
                                    </div>
                                    <div className="col-4">
                                        {isTissueGrouping || isTissueColumnGrouping ? (
                                            <React.Fragment>
                                                <div className="label">{yAxisGroupingTitle}</div>
                                                <div className="value">{yAxisGroupingValue || '--'}</div>
                                            </React.Fragment>
                                        ) : (depth > 0 || additionalPopoverData?.[primaryGrpPropValue]?.["secondary"] ? (
                                            <React.Fragment>
                                                <div className="label">{secondaryGrpPropTitle}</div>
                                                <div className="value">{additionalPopoverData?.[primaryGrpPropValue]?.["secondary"] || secondaryGrpPropValue}</div>
                                            </React.Fragment>
                                        ) : null)}
                                    </div>
                                    <div className="col-4">
                                        <div className="label me-05">{'Germ Layer'}</div>
                                        <div className="value">{formatGermLayerValue(additionalPopoverData?.[primaryGrpPropValue]?.["secondaryCategory"] || secondaryGrpPropCategoryValue)}</div>
                                    </div>
                                </div>
                            ) : null}
                            {effectiveBlockType === 'col-summary' ? (
                                <div className="row primary-row pb-1 pt-1">
                                    <div className="col-12 value">
                                        <span className="text-muted text-capitalize">{yAxisGroupingTitle} summary:</span> { yAxisGroupingValue || '--' }
                                    </div>
                                </div>
                            ) : null}
                            {effectiveBlockType === 'row-summary' && depth === 0 ? (
                                <div className="row primary-row pb-1 pt-1">
                                    <div className="col-12 value">
                                        <span className="text-muted text-capitalize">{primaryGrpPropTitle} summary:</span> { primaryGrpPropValue || '--' }
                                    </div>
                                </div>
                            ) : null}
                            {effectiveBlockType === 'row-summary' && depth > 0 ? (
                                <div className="row primary-row pb-1 pt-1">
                                    <div className="col-12 value">
                                        <span className="text-muted text-capitalize">{secondaryGrpPropTitle} summary:</span> { secondaryGrpPropValue || '--' }
                                    </div>
                                </div>
                            ) : null}
                            {effectiveBlockType === 'regular' ? (
                                <div className="row secondary-row pb-1 mt-1">
                                    <div className="col-4">
                                        <div className="label me-05">{isTissueGrouping ? 'Total Donors' : (isTissueColumnGrouping ? 'Total Assays' : yAxisGroupingTitle)}</div>
                                        <div className="value">{isTissueGrouping ? (donorCount || '--') : (isTissueColumnGrouping ? (assayCount || '--') : (yAxisGroupingValue || '--'))}</div>
                                    </div>
                                    <div className="col-4">
                                        <div className="label">Total Coverage</div>
                                        <div className="value">{totalCoverageDisplay}</div>
                                    </div>
                                    <div className="col-4">
                                        <div className="label">Total Files</div>
                                        <div className="value">{formattedFileCount}</div>
                                    </div>
                                </div>
                            ) : null}
                            {effectiveBlockType === 'col-summary' ? (
                                <React.Fragment>
                                    <div className="row secondary-row pb-1 mt-1">
                                        <div className="col-4">
                                            <div className="label me-05">
                                                {
                                                    primaryGrpProp === 'donor'
                                                        ? 'Total Donors'
                                                        : (primaryGrpProp === 'tissue'
                                                            ? 'Total Tissues'
                                                            : StackedBlockVisual.pluralize(primaryGrpPropTitle))
                                                }
                                            </div>
                                            <div className="value">{primaryGrpPropUniqueCount || '--'}</div>
                                        </div>
                                        <div className="col-4">
                                            <div className="label">{secondaryGrpPropCategoryValue ? 'Germ Layer' : (isTissueGrouping ? 'Total Donors' : StackedBlockVisual.pluralize(secondaryGrpPropTitle))}</div>
                                            <div className="value">{secondaryGrpPropCategoryValue ? formatGermLayerValue(secondaryGrpPropCategoryValue) : (isTissueGrouping ? (donorCount || '--') : (secondaryGrpPropUniqueCount || '--'))}</div>
                                        </div>
                                        <div className="col-4">
                                            <div className="label">{countFor === 'total_coverage' ? 'Total Coverage' : 'Total Files'}</div>
                                            <div className="value">{countFor === 'total_coverage' ? totalCoverageDisplay : formattedFileCount}</div>
                                        </div>
                                    </div>
                                </React.Fragment>
                            ) : null}
                            {effectiveBlockType === 'row-summary' && depth === 0 ? (
                                <div className="row secondary-row pb-1 mt-1">
                                    <div className="col-4">
                                        <div className="label me-05">
                                            {isTissueGrouping
                                                ? 'Total Donors'
                                                : (isTissueColumnGrouping ? 'Total Tissues'
                                                    : (additionalPopoverData?.[primaryGrpPropValue]?.["secondaryCategory"] ? secondaryGrpPropTitle : StackedBlockVisual.pluralize(secondaryGrpPropTitle)))
                                            }
                                        </div>
                                        <div className="value">
                                            {isTissueGrouping
                                                ? (donorCount || '--')
                                                : (isTissueColumnGrouping ? (tissueCount || '--')
                                                    : (effectiveSecondaryGrpPropUniqueCount || additionalPopoverData?.[primaryGrpPropValue]?.["secondaryCategory"] || '--'))}
                                        </div>
                                    </div>
                                    {additionalPopoverData?.[primaryGrpPropValue]?.["secondary"] ?
                                        <div className="col-4">
                                            <div className="label">{'Germ Layer'}</div>
                                            <div className="value">{formatGermLayerValue(additionalPopoverData?.[primaryGrpPropValue]?.["secondary"])}</div>
                                        </div> :
                                        <div className="col-4">
                                            &nbsp;
                                        </div>
                                    }
                                    <div className="col-4">
                                        <div className="label">Total Files</div>
                                        <div className="value">{formattedFileCount}</div>
                                    </div>
                                </div>
                            ) : null}
                            {effectiveBlockType === 'row-summary' && depth > 0 ? (
                                <div className="row secondary-row pb-1 mt-1">
                                    <div className="col-4">
                                        <div className="label me-05">{primaryGrpPropTitle}</div>
                                        <div className="value">{primaryGrpPropValue}</div>
                                    </div>
                                    <div className="col-4">
                                        <div className="label">{'Germ Layer'}</div>
                                        <div className="value">{formatGermLayerValue(secondaryGrpPropCategoryValue)}</div>
                                    </div>
                                    <div className="col-4">
                                        <div className="label">Total Files</div>
                                        <div className="value">{formattedFileCount}</div>
                                    </div>
                                </div>
                            ) : null}
                            <div className="row footer-row p-1">
                                {makeSearchButton(browseUrl, effectiveFileCount <= 0)}
                            </div>
                        </div>
                        :
                        <div className="inner">
                            <h5 className="text-400 mt-08 mb-15 text-center"><b>{"title"}</b></h5>
                            <hr className="mt-0 mb-1" />
                            {makeSearchButton(browseUrl, fileCount <= 0)}
                        </div>
                    }
                </Popover.Body>
            </Popover>
        );

    }

    render(){
        const {
            disableRowExpand = false,
            isLoading = false,
            showAxisLabels = false,
            xAxisLabel,
            yAxisLabel,
            headerLeftControls = null,
            showLoadingHeaderLeftControls = false,
            results = { all: [], row_totals: [], column_totals: [] }
        } = this.props;
        const { all, row_totals, column_totals } = results;
        if (isLoading) {
            const { loadingIndicatorLayout } = this.state;
            const loadingIndicatorStyle = loadingIndicatorLayout || undefined;
            return (
                <div className="stacked-block-viz-container is-loading" ref={(el) => { this.loadingContainerRef = el; }}>
                    {showAxisLabels ? (
                        <div className="axis-container flex-grow-1" style={{ position: 'relative', minHeight: '120px' }}>
                            <div className="x-axis">{xAxisLabel || 'X'}</div>
                            <div className="y-axis">{yAxisLabel || 'Y'}</div>
                        </div>
                    ) : null}
                    {showLoadingHeaderLeftControls && headerLeftControls ? (
                        <div className="matrix-loading-header-controls">
                            {headerLeftControls}
                        </div>
                    ) : null}
                    <div className="matrix-loading-indicator text-center" style={{ fontSize: '2rem', opacity: 0.5, ...loadingIndicatorStyle }}>
                        <i className="mt-3 icon icon-spin icon-circle-notch fas" />
                    </div>
                </div>
            );
        }
        return (
            <StackedBlockVisual data={all} rowTotals={row_totals} columnTotals={column_totals} checkCollapsibility={!disableRowExpand}
                {..._.pick(this.props,
                    'groupingProperties', 'columnGrouping', 'titleMap', 'headerPadding',
                    'columnSubGrouping', 'defaultDepthsOpen', 'defaultExpandedRowIndices',
                    'columnSubGroupingOrder', 'colorRanges',
                    'columnGroups', 'showColumnGroups', 'columnGroupsExtended', 'showColumnGroupsExtended',
                    'rowGroups', 'showRowGroups', 'rowGroupsExtended', 'showRowGroupsExtended',
                    'summaryBackgroundColor', 'xAxisLabel', 'yAxisLabel', 'showAxisLabels', 'showColumnSummary',
                    'countFor', 'overallCounts', 'showUniqueDonorsAssayBand', 'shrinkEmptyColumns',
                    'blockWidth', 'blockHorizontalExtend', 'blockHorizontalSpacing', 'blockVerticalSpacing', 'rowSummaryCountsByGroup',
                    'rawRegularCountOverrides', 'dedupeBenchmarkingDsaAcrossTissues', 'compactCoverageText', 'showCoverageSummaries', 'disableRowExpand', 'disableBlockOpen',
                    'headerLeftControls', 'hideFallbackColumnGroupHeader', 'hideFallbackRowGroupHeader', 'isGridRefreshing')}
                blockPopover={this.blockPopover}
                blockRenderedContents={VisualBody.blockRenderedContents}
            />
        );
    }
}

// StackedBlockVisual renders the matrix grid with grouping and summary rows.
// Example: <StackedBlockVisual data={rows} rowTotals={rowTotals} groupingProperties={['donor','tissue']} columnGrouping="assay" />
export class StackedBlockVisual extends React.PureComponent {

    static defaultProps = {
        'groupingProperties' : ["donor", "tissue"],
        'columnGrouping' : null,
        'blockHeight' : 28,
        'blockWidth': DEFAULT_MATRIX_BLOCK_WIDTH,
        'blockVerticalSpacing' : 2,
        'blockHorizontalSpacing' : 2,
        'blockHorizontalExtend' : 5,
        'collapseToMatrix' : false,
        // @param data may be either Array (if multiple grouped into 1) or object.
        'showGroupingPropertyTitles' : false,
        'checkCollapsibility' : false,
        'headerPadding' : 80,
        'blockClassName' : function(data, blockProps){

            var isMultipleClass = 'single-set';

            if (Array.isArray(data)) {
                if (data.length > 1) {
                    isMultipleClass = 'multiple-sets';
                } else {
                    isMultipleClass = 'single-set';
                }
            }

            return isMultipleClass + ' clickable hoverable';
        },
        'blockRenderedContents' : function(data, blockProps){
            var count = 0;
            if (Array.isArray(data)) {
                count = data.length;
            } else if (data) {
                count = 1;
            }
            if (count > 100){
                return <span style={{ 'fontSize' : '0.95rem', 'position' : 'relative', 'top' : -1 }}>{ count }</span>;
            }
            return <span>{ count }</span>;

        }
    };

    // Aggregates a list of objects into one object by summing numeric fields and
    // collecting unique values for non-numeric fields (e.g., [{ a: 1, b: 'x' }, { a: 2, b: 'y' }] -> { a: 3, b: ['x','y'] }).
    static aggregateObjectFromList = function (dataList, keysToShow, skipParsingKeys = null) {
        // Use all keys from the first item if keysToShow is not provided
        if (!keysToShow) {
            keysToShow = _.keys(dataList[0]);
        }

        const shouldSkipParsing = Array.isArray(skipParsingKeys) && skipParsingKeys.length > 0
            ? _.object(_.map(skipParsingKeys, k => [k, true]))
            : null;

        const finalizeAggregatedValue = (value, key) => {
            if (typeof value === 'number') {
                return value;
            }

            // Convert Set to Array and remove falsy values
            const valuesArray = _.filter(Array.from(value));
            const isObjectArray = _.any(valuesArray, v => v && typeof v === 'object');

            if (valuesArray.length === 0) {
                return undefined;
            }
            if (valuesArray.length === 1) {
                return valuesArray[0];
            }
            if (shouldSkipParsing && shouldSkipParsing[key]) {
                return valuesArray;
            }
            if (isObjectArray) {
                // If values are objects, deduplicate using a custom identity function
                const uniqById = _.uniq(valuesArray, false, object.itemUtil.atId);
                return uniqById.length === 1 ? uniqById[0] : uniqById;
            }
            return valuesArray;
        };

        // Initialize the aggregation object with null values
        const initial = _.object(keysToShow, _.map(keysToShow, _.constant(null)));

        // Aggregate values from dataList into the initial object
        const aggregated = _.reduce(dataList, function (acc, item) {
            _.each(keysToShow, function (key) {
                const value = item[key];
                if (typeof value === 'number') {
                    // Sum numeric values
                    acc[key] = (acc[key] || 0) + value;
                } else {
                    // For non-numeric values, collect them into a Set to ensure uniqueness
                    acc[key] = acc[key] || new Set();
                    acc[key].add(value);
                }
            });
            return acc;
        }, initial);

        // Post-process non-numeric fields (which are Sets)
        _.each(_.keys(aggregated), function (key) {
            const value = aggregated[key];
            const finalized = finalizeAggregatedValue(value, key);
            if (typeof finalized === 'undefined') {
                delete aggregated[key];
            } else {
                aggregated[key] = finalized;
            }
        });

        return aggregated;
    };

    static pluralize = function(input){
        if (!input || typeof input !== 'string') return input;

        if (input.endsWith('y') && !/[aeiou]y$/i.test(input)) {
            return input.slice(0, -1) + 'ies';
        } else if (input.endsWith('s') || input.endsWith('x') || input.endsWith('z') || input.endsWith('ch') || input.endsWith('sh')) {
            return input + 'es';
        } else {
            return input + 's';
        }
    };

    constructor(props){
        super(props);
        this.renderContents = this.renderContents.bind(this);
        this.handleSorterClick = _.throttle(this.handleSorterClick.bind(this), 250);
        var state = {
            'sorting' : 'both',
            'sortField': null,
            'mounted' : true,
            'activeBlock': null,
            'openBlock': null,
        };
        this.memoized = {
            sortBlock: memoize(StackedBlockGroupedRow.sortBlock)
        };

        this.containerRef = null;
        this.headerUpperEl = null;
        this.headerUpperOriginalStyle = null;
        this.headerPinned = false;
        this.scrollContainerEl = null;
        this.scrollRaf = null;
        this.syncStickyHeaderOnScroll = this.syncStickyHeaderOnScroll.bind(this);
        this.requestStickySync = this.requestStickySync.bind(this);
        this.resetStickyHeaderStyles = this.resetStickyHeaderStyles.bind(this);

        this.state = state;
    }

    componentDidMount(){
        this.setState({ 'mounted' : true });
        this.headerUpperEl = this.containerRef ? this.containerRef.querySelector('.grouping.header-section-upper') : null;
        this.scrollContainerEl = this.containerRef
            ? (this.containerRef.closest('.matrix-visual-scroll-region') || this.containerRef.closest('.matrix-mode-scroll-region'))
            : null;
        if (this.headerUpperEl) {
            this.headerUpperOriginalStyle = this.headerUpperEl.getAttribute('style');
        }
        this.requestStickySync();
        window.addEventListener('scroll', this.requestStickySync, { passive: true });
        window.addEventListener('resize', this.requestStickySync);
        if (this.scrollContainerEl) {
            this.scrollContainerEl.addEventListener('scroll', this.requestStickySync, { passive: true });
        }
    }

    componentWillUnmount(){
        window.removeEventListener('scroll', this.requestStickySync);
        window.removeEventListener('resize', this.requestStickySync);
        if (this.scrollContainerEl) {
            this.scrollContainerEl.removeEventListener('scroll', this.requestStickySync);
        }
        if (this.scrollRaf) {
            window.cancelAnimationFrame(this.scrollRaf);
            this.scrollRaf = null;
        }
        this.resetStickyHeaderStyles();
        this.setState({ 'mounted' : false });
    }

    componentDidUpdate(prevProps) {
        const { activeBlock, openBlock } = this.state;
        const { columnGrouping, groupingProperties, countFor, data, rowTotals, columnTotals } = this.props;
        const layoutChanged =
            prevProps.columnGrouping !== columnGrouping ||
            !_.isEqual(prevProps.groupingProperties, groupingProperties) ||
            prevProps.countFor !== countFor ||
            prevProps.data !== data ||
            prevProps.rowTotals !== rowTotals ||
            prevProps.columnTotals !== columnTotals;

        if (layoutChanged && (activeBlock || openBlock)) {
            this.setState({ activeBlock: null, openBlock: null });
            return;
        }

        const nextScrollContainerEl = this.containerRef
            ? (this.containerRef.closest('.matrix-visual-scroll-region') || this.containerRef.closest('.matrix-mode-scroll-region'))
            : null;
        if (nextScrollContainerEl !== this.scrollContainerEl) {
            if (this.scrollContainerEl) {
                this.scrollContainerEl.removeEventListener('scroll', this.requestStickySync);
            }
            this.scrollContainerEl = nextScrollContainerEl;
            if (this.scrollContainerEl) {
                this.scrollContainerEl.addEventListener('scroll', this.requestStickySync, { passive: true });
            }
        }
        this.requestStickySync();
    }

    getStickyTopOffset() {
        let topOffset = 40; // sticky top navbar offset
        if (!this.containerRef) return topOffset;
        const tabsRow = this.containerRef.closest('.matrix-panel-content')?.querySelector('.matrix-mode-tabs-row');
        if (!tabsRow) return topOffset;
        const tabsRect = tabsRow.getBoundingClientRect();
        // If mode tabs are in/near sticky zone, pin matrix header below them.
        if (tabsRect.bottom > topOffset && tabsRect.top <= topOffset + 1) {
            topOffset = Math.max(topOffset, Math.round(tabsRect.bottom));
        }
        return topOffset;
    }

    requestStickySync() {
        if (this.scrollRaf) return;
        this.scrollRaf = window.requestAnimationFrame(this.syncStickyHeaderOnScroll);
    }

    resetStickyHeaderStyles() {
        if (!this.headerUpperEl) return;
        const headerUpperRowEl = this.headerUpperEl.querySelector('.row.grouping-row');
        this.headerUpperEl.style.position = '';
        this.headerUpperEl.style.top = '';
        this.headerUpperEl.style.left = '';
        this.headerUpperEl.style.width = '';
        this.headerUpperEl.style.zIndex = '';
        this.headerUpperEl.style.background = '';
        this.headerUpperEl.style.overflow = '';
        if (headerUpperRowEl) {
            headerUpperRowEl.style.transform = '';
        }
        if (this.headerPinned) {
            this.containerRef.style.paddingTop = '';
            this.headerPinned = false;
        }
        this.headerPinnedBaseHorizontalOffset = null;
        if (this.headerUpperOriginalStyle) {
            this.headerUpperEl.setAttribute('style', this.headerUpperOriginalStyle);
        } else {
            this.headerUpperEl.removeAttribute('style');
        }
    }

    syncStickyHeaderOnScroll() {
        this.scrollRaf = null;
        if (!this.containerRef) return;
        if (!this.headerUpperEl || !this.containerRef.contains(this.headerUpperEl)) {
            this.headerUpperEl = this.containerRef.querySelector('.grouping.header-section-upper');
        }
        if (!this.headerUpperEl) return;
        const headerUpperRowEl = this.headerUpperEl.querySelector('.row.grouping-row');

        const containerRect = this.containerRef.getBoundingClientRect();
        const headerRect = this.headerUpperEl.getBoundingClientRect();
        const topOffset = this.getStickyTopOffset();
        const scrollViewportRect = this.scrollContainerEl
            ? this.scrollContainerEl.getBoundingClientRect()
            : containerRect;
        const scrollViewportWidth = this.scrollContainerEl
            ? this.scrollContainerEl.clientWidth
            : Math.round(scrollViewportRect.width);
        const scrollLeft = this.scrollContainerEl ? this.scrollContainerEl.scrollLeft : 0;
        const pinnedLeft = Math.round(scrollViewportRect.left);
        const pinnedWidth = Math.max(0, Math.round(scrollViewportWidth));
        const initialHorizontalOffset = Math.round(headerRect.left - scrollViewportRect.left);
        if (!this.headerPinned || this.headerPinnedBaseHorizontalOffset == null) {
            this.headerPinnedBaseHorizontalOffset = initialHorizontalOffset;
        }
        const horizontalOffset = Math.round(this.headerPinnedBaseHorizontalOffset - scrollLeft);

        // Keep header fixed only while the matrix container intersects viewport and
        // there is enough remaining room for header to stay visible.
        const shouldPin = containerRect.top <= topOffset && (containerRect.bottom - headerRect.height) > topOffset;

        if (shouldPin) {
            this.headerUpperEl.style.position = 'fixed';
            this.headerUpperEl.style.top = `${topOffset}px`;
            this.headerUpperEl.style.left = `${pinnedLeft}px`;
            this.headerUpperEl.style.width = `${pinnedWidth}px`;
            this.headerUpperEl.style.zIndex = '20';
            this.headerUpperEl.style.background = '#ffffff';
            this.headerUpperEl.style.overflow = 'hidden';
            if (headerUpperRowEl) {
                headerUpperRowEl.style.transform = `translateX(${horizontalOffset}px)`;
            }
            if (!this.headerPinned) {
                this.containerRef.style.paddingTop = `${Math.round(headerRect.height)}px`;
                this.headerPinned = true;
            }
        } else {
            this.resetStickyHeaderStyles();
        }
    }

    handleSorterClick(evt){
        evt.stopPropagation();
        const { sorting, sortField } = this.state;

        const newSortField = evt.currentTarget.dataset.index;

        let nextSort;
        if (newSortField === sortField || sortField === null) {
            switch (sorting) {
                case "desc":
                    nextSort = "asc";
                    break;
                case "asc":
                    nextSort = "both";
                    break;
                case "both":
                    nextSort = "desc";
                    break;
            }
        } else {
            nextSort = "desc";
        }

        this.setState({ "sorting": nextSort, "sortField": newSortField, "mounted": true });
    }

    handleBlockMouseEnter = (columnIdx, rowIdx, rowKey, rowGroupKey, summaryRowType = null) => {
        const { openBlock } = this.state;
        if (openBlock) return;
        this.setState({ activeBlock: (columnIdx !== null || rowIdx !== null) ? { columnIdx, rowIdx, rowKey, rowGroupKey, summaryRowType } : null });
    };

    handleBlockMouseLeave = () => {
        this.setState({ activeBlock: null });
    };

    handleBlockClick = (columnIdx, rowIdx, rowKey, rowGroupKey, summaryRowType = null) => {
        // Donor x Tissue view keeps blocks non-interactive to avoid accidental "open" white-state styling.
        if (this.props.disableBlockOpen) {
            if (this.state.openBlock !== null) {
                this.setState({ openBlock: null });
            }
            return;
        }
        const openBlock = (columnIdx !== null || rowIdx !== null) ? { columnIdx, rowIdx, rowKey, rowGroupKey, summaryRowType } : null;
        if (openBlock) {
            setTimeout(() => {
                this.setState({ openBlock: openBlock });
            }, 100);
        } else {
            this.setState({ openBlock: null });
        }
    };

    buildRowGroupsSummaryProps(ctx) {
        const {
            groupKey,
            rowKeys,
            columnKeys,
            containerSectionStyle,
            labelSectionStyle,
            headerItemStyle,
            columnWidth,
            nestedData,
            columnGrouping,
            columnToRowsMappingFunc
        } = ctx;
        const { activeBlock, openBlock } = this.state;
        const tmpData = _.flatten(_.flatten(_.map(_.pick(nestedData, (v, k) => rowKeys.indexOf(k) !== -1), _.values)));
        const filteredGroupedDataIndices = _.groupBy(tmpData, columnGrouping);
        const columnToRowsMapping = columnToRowsMappingFunc(tmpData);

        return {
            ...this.props,
            activeBlock,
            openBlock,
            groupedDataIndices: filteredGroupedDataIndices,
            label: groupKey !== FALLBACK_GROUP_NAME ? StackedBlockVisual.pluralize(groupKey) : groupKey,
            labelSectionStyle,
            columnKeys,
            columnWidth,
            headerItemStyle,
            containerSectionStyle,
            handleBlockClick: this.handleBlockClick,
            handleBlockMouseEnter: this.handleBlockMouseEnter,
            handleBlockMouseLeave: this.handleBlockMouseLeave,
            rowGroupKey: groupKey,
            columnToRowsMapping
        };
    }

    renderRowGroups({
        rowGroupsKeys,
        leftAxisKeys,
        nestedData,
        nestedRowTotals,
        groupedDataIndices,
        columnsAndHeaderProps,
        columnToRowsMappingFunc
    }) {
        const {
            rowGroups,
            showColumnSummary,
            showColumnGroups,
            columnGroups,
            columnGrouping,
            blockWidth,
            blockHorizontalSpacing,
            blockHorizontalExtend
        } = this.props;
        const { activeBlock, openBlock, sorting, sortField } = this.state;

        // Resolve row keys for a group (including the fallback N/A group).
        const getRowKeysForGroup = (groupKey, values) => {
            if (groupKey === FALLBACK_GROUP_NAME) { //special case for N/A
                const allValues = StackedBlockGroupedRow.mergeValues(rowGroups);
                // not intersecting childRowsKeys and allValues
                return StackedBlockGroupedRow.difference(leftAxisKeys, allValues);
            }
            return StackedBlockGroupedRow.intersection(leftAxisKeys, values || []);
        };

        // Order columns, applying column group ordering if present.
        const getColumnKeys = () => {
            const hasColumnGroups = showColumnGroups && columnGroups && _.keys(columnGroups).length > 0;
            let columnKeys = _.keys(groupedDataIndices);
            if (hasColumnGroups) {
                columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, StackedBlockGroupedRow.mergeValues(columnGroups));
            }
            return columnKeys;
        };

        // Build per-section styling with optional spacing between groups.
        const getContainerSectionStyle = (backgroundColor, textColor, groupKeyIdx) => {
            const containerSectionStyle = { backgroundColor: backgroundColor, color: textColor };
            if (showColumnSummary || groupKeyIdx > 0) {
                containerSectionStyle['marginTop'] = 40;
            }
            return containerSectionStyle;
        };

        let outerIdx = -1;
        return (
            <React.Fragment>
                {StackedBlockGroupedRow.columnsAndHeader(columnsAndHeaderProps)}
                {
                    _.map(rowGroupsKeys, (groupKey, groupKeyIdx) => {
                        const { values, backgroundColor, textColor } = rowGroups[groupKey] || { values: [], backgroundColor: '#ffffff', textColor: '#000000' };

                        const rowKeys = getRowKeysForGroup(groupKey, values);
                        const containerSectionStyle = getContainerSectionStyle(backgroundColor, textColor, groupKeyIdx);
                        const labelSectionStyle = {};
                        const columnKeys = getColumnKeys();
                        const columnWidth = (blockWidth + (blockHorizontalSpacing * 2)) + blockHorizontalExtend;
                        const headerItemStyle = {};

                        return _.map(rowKeys, (k, idx) => {
                            let rowGroupsSummaryProps = null;
                            if (idx === 0) {
                                // Build a summary row for the first row in each group.
                                rowGroupsSummaryProps = this.buildRowGroupsSummaryProps({
                                    groupKey,
                                    rowKeys,
                                    columnKeys,
                                    containerSectionStyle,
                                    labelSectionStyle,
                                    headerItemStyle,
                                    columnWidth,
                                    nestedData,
                                    columnGrouping,
                                    columnToRowsMappingFunc
                                });
                            }

                            outerIdx++;
                            return (
                                <React.Fragment>
                                    {/* Render the summary row once per group. */}
                                    {idx === 0 && StackedBlockGroupedRow.rowGroupsSummary(rowGroupsSummaryProps)}
                                    <StackedBlockGroupedRow
                                        {...columnsAndHeaderProps}
                                        data={nestedData[k]}
                                        rowTotals={nestedRowTotals[k]}
                                        key={k}
                                        group={k}
                                        groupPath={[]}
                                        depth={0}
                                        index={outerIdx}
                                        onSorterClick={this.handleSorterClick}
                                        sorting={sorting}
                                        sortField={sortField}
                                        handleBlockMouseEnter={this.handleBlockMouseEnter}
                                        handleBlockMouseLeave={this.handleBlockMouseLeave}
                                        handleBlockClick={this.handleBlockClick}
                                        activeBlock={activeBlock}
                                        openBlock={openBlock}
                                        popoverPrimaryTitle={groupKey}
                                    />
                                </React.Fragment>
                            );
                        });
                    })
                }
            </React.Fragment>
        );
    }

    renderContents(){
        const { data : propData, rowTotals: propRowTotals, columnTotals: propColumnTotals, groupingProperties, columnGrouping, columnGroups, showColumnGroups, rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended, showColumnSummary, blockHeight, blockVerticalSpacing, shrinkEmptyColumns = true, hideFallbackRowGroupHeader = false } = this.props;
        const { mounted, sorting, sortField, activeBlock, openBlock } = this.state;
        if (!mounted) return null;
        // prepare data
        const data = extendListObjectsWithIndex([].concat(propData));
        const nestedData = groupByMultiple(data, groupingProperties); // { 'Grant1' : { Lab1: { PI1: [...], PI2: [...] }, Lab2: {} } }
        // prepare row totals
        const rowTotals = extendListObjectsWithIndex([].concat(propRowTotals));
        const nestedRowTotals = groupByMultiple(rowTotals, groupingProperties); // { 'Grant1' : { Lab1: { PI1: [...], PI2: [...] }, Lab2: {} } }

        let groupedDataIndices = null;
        if (typeof columnGrouping === 'string'){
            groupedDataIndices = _.groupBy(data, columnGrouping);
            if (!shrinkEmptyColumns && Array.isArray(propColumnTotals)) {
                propColumnTotals.forEach((columnTotalRow) => {
                    const columnKey = columnTotalRow?.[columnGrouping];
                    if (typeof columnKey !== 'undefined' && columnKey !== null && !groupedDataIndices[columnKey]) {
                        groupedDataIndices[columnKey] = [];
                    }
                });
            }
        }

        if (Array.isArray(nestedData) || !nestedData) {
            return null;
        }

        const sortLeftAxisKeys = (keys) => {
            if (sorting !== 'both') {
                //sort by counts
                if (typeof sortField !== 'undefined') {
                    const sortedKeys = [];
                    _.map(keys, (k) =>
                        sortedKeys.push(this.memoized.sortBlock(nestedData[k], groupedDataIndices, k, sortField))
                    );

                    if (sorting === 'asc') {
                        sortedKeys.sort((a, b) => a.count - b.count);
                    } else if (sorting === 'desc') {
                        sortedKeys.sort((a, b) => b.count - a.count);
                    }

                    //get sorted data keys
                    return _.map(sortedKeys, (key) =>
                        key['groupingKey']
                    );
                }
                //sort by row labels
                if (sorting === 'asc') {
                    return keys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                } else if (sorting === 'desc') {
                    return keys.sort((a, b) => b.toLowerCase().localeCompare(a.toLowerCase()));
                }
                return keys;
            }
            return rowGroups ? StackedBlockGroupedRow.sortByArray(keys, StackedBlockGroupedRow.mergeValues(rowGroups)) : keys.sort();
        };

        const leftAxisKeys = sortLeftAxisKeys(_.keys(nestedData));
        const hasRowGroups = showRowGroups && rowGroups && _.keys(rowGroups).length > 0;
        const rowGroupsKeys = hasRowGroups
            ? [..._.keys(rowGroups), ...(hideFallbackRowGroupHeader ? [] : [FALLBACK_GROUP_NAME])]
            : null;
        const hasRowGroupsExtendedTopLevel = Array.isArray(groupingProperties) &&
            groupingProperties.length === 1 &&
            showRowGroupsExtended &&
            rowGroupsExtended &&
            _.keys(rowGroupsExtended).length > 0;
        const rowGroupsExtendedKeys = hasRowGroupsExtendedTopLevel
            ? [..._.keys(rowGroupsExtended), ...(hideFallbackRowGroupHeader ? [] : [FALLBACK_GROUP_NAME])]
            : null;

        // convert to { columnGrouping: [groupingProperties] }
        // Example: rows=[{ assay:'WGS', donor:'D1' },{ assay:'WGS', donor:'D2' },{ assay:'RNA', donor:'D1' }]
        // => { WGS:['D1','D2'], RNA:['D1'] }
        const columnToRowsMappingFunc = function (rows) {
            const result = {};

            rows.forEach((item) => {
                const column = item[columnGrouping];
                const row = item[groupingProperties[0]];

                if (!result[column]) {
                    result[column] = new Set();
                }

                result[column].add(row);
            });

            Object.keys(result).forEach((column) => {
                result[column] = Array.from(result[column]);
            });

            return result;
        };

        const sharedRowProps = {
            ...this.props,
            groupedDataIndices,
            parentState: this.state,
            depth: 0,
            toggleGroupingOpen: this.toggleGroupingOpen,
            onSorterClick: this.handleSorterClick,
            sorting,
            sortField,
            handleBlockMouseEnter: this.handleBlockMouseEnter,
            handleBlockMouseLeave: this.handleBlockMouseLeave,
            handleBlockClick: this.handleBlockClick,
            activeBlock,
            openBlock
        };

        const columnsAndHeaderProps = {
            ...this.props,
            groupedDataIndices,
            activeBlock,
            openBlock,
            handleBlockClick: this.handleBlockClick,
            handleBlockMouseEnter: this.handleBlockMouseEnter,
            handleBlockMouseLeave: this.handleBlockMouseLeave,
            columnToRowsMapping: columnToRowsMappingFunc(propData),
            columnTotals: propColumnTotals,
        };

        if(groupedDataIndices && _.keys(groupedDataIndices).length === 0){
            return (
                <React.Fragment>
                    {StackedBlockGroupedRow.columnsAndHeader(columnsAndHeaderProps)}
                    <div className="p-3 text-center text-muted no-data-available"><em>No data available</em></div>
                </React.Fragment>
            );
        }

        if (rowGroupsExtendedKeys) {
            const rowHeight = blockHeight + (blockVerticalSpacing * 2) + 1;
            const rowGroupsExtendedByLowerKey = _.reduce(_.keys(rowGroupsExtended), (memo, k) => {
                const lk = k.toLowerCase();
                if (memo[lk] == null) memo[lk] = k;
                return memo;
            }, {});
            let outerIdx = -1;

            return (
                <React.Fragment>
                    {StackedBlockGroupedRow.columnsAndHeader(columnsAndHeaderProps)}
                    <div className="grouping depth-0 open">
                        <div className="child-blocks">
                            {renderVerticalRowGroupsExtended({
                                rowGroupsExtended,
                                rowGroupsExtendedKeys,
                                rowKeys: leftAxisKeys,
                                rowHeight,
                                rowGroupsExtendedByLowerKey,
                                renderRow: (k) => {
                                    outerIdx++;
                                    return (
                                        <StackedBlockGroupedRow
                                            {...sharedRowProps}
                                            data={nestedData[k]}
                                            rowTotals={nestedRowTotals[k]}
                                            key={k}
                                            group={k}
                                            groupPath={[]}
                                            index={outerIdx}
                                        />
                                    );
                                }
                            })}
                        </div>
                    </div>
                </React.Fragment>
            );
        }

        if (rowGroupsKeys) {
            return this.renderRowGroups({
                rowGroupsKeys,
                leftAxisKeys,
                nestedData,
                nestedRowTotals,
                groupedDataIndices,
                columnsAndHeaderProps: {
                    ...columnsAndHeaderProps,
                    ...sharedRowProps
                },
                columnToRowsMappingFunc
            });
        } else {
            return (
                <React.Fragment>
                    {StackedBlockGroupedRow.columnsAndHeader(columnsAndHeaderProps)}
                    {
                        _.map(leftAxisKeys, (k, idx) =>
                            <StackedBlockGroupedRow
                                {...sharedRowProps}
                                data={nestedData[k]}
                                rowTotals={nestedRowTotals[k]}
                                key={k}
                                group={k}
                                groupPath={[]}
                                index={idx}
                            />
                        )
                    }
                </React.Fragment>
            );
        }

    }

    render() {
        const { openBlock, activeBlock } = this.state;
        const { countFor, yAxisLabel, isGridRefreshing } = this.props;
        let className = "stacked-block-viz-container";
        if (countFor) {
            className += ` count-for-${countFor}`;
        }
        if (yAxisLabel) {
            const yAxisClass = String(yAxisLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (yAxisClass) {
                className += ` matrix-yaxis-${yAxisClass}`;
            }
        }
        if (activeBlock) {
            className += ' has-active-block';
        }
        if (openBlock) {
            className += ' has-open-block';
        }
        if (isGridRefreshing) {
            className += ' is-refreshing-grid';
        }
        return (
            <div
                className={className}
                ref={(el) => { this.containerRef = el; }}>
                {this.renderContents()}
            </div>
        );
    }


}

// StackedBlockGroupedRow renders a single grouped row (and its nested children) inside the matrix.
// Example: <StackedBlockGroupedRow data={nestedRow} rowTotals={nestedTotals} group="Donor A" depth={0} />
export class StackedBlockGroupedRow extends React.PureComponent {

    static flattenChildBlocks(groups){
        if (Array.isArray(groups)) return groups;
        return _.reduce(_.pairs(groups), function(m, pair){
            if (Array.isArray(pair[1])) return m.concat(pair[1]);
            else return m.concat(StackedBlockGroupedRow.flattenChildBlocks(pair[1]));
        }, []);
    }

    static sortByArray(array1, arrayToSortBy){

        var o = _.object(
            _.map(array1, function(k){ return [k, true]; })
        );

        var orderedList = [];
        for (var i = 0; i < arrayToSortBy.length; i++){
            if (arrayToSortBy[i] && o[arrayToSortBy[i]]){
                orderedList.push(arrayToSortBy[i]);
                delete o[arrayToSortBy[i]];
            }
        }

        return orderedList.concat( _.keys(o)); // Incl remaining keys.
    }

    /**
     * returns {groupingKey, count}. count is sorted fields column group length.
     */
    static sortBlock(data, groupedDataIndices, groupingKey, sortField) {

        let allChildBlocks = null;
        if (Array.isArray(data)) {
            allChildBlocks = data;
        } else {
            allChildBlocks = StackedBlockGroupedRow.flattenChildBlocks(data);
        }

        const groupedDataIndicesPairs = (groupedDataIndices && _.pairs(groupedDataIndices)) || [];

        if (groupedDataIndicesPairs.length > 0) {
            const blocksByColumnGroup = _.object(_.map(groupedDataIndicesPairs, function ([columnKey, listOfIndicesForGroup]) {
                return [
                    columnKey,
                    _.filter(_.map(allChildBlocks, function (blockData) {
                        if (listOfIndicesForGroup.indexOf(blockData.index) > -1) {
                            return blockData;
                        } else {
                            return null;
                        }
                    }), function (block) { return block !== null; })];
            }));
            return { 'groupingKey': groupingKey, 'count': blocksByColumnGroup[sortField].length };
        }

        return null;
    }

    static mergeValues = memoize(function (obj) {
        const merged = [];
        Object.keys(obj).forEach((tier) => {
            if (obj[tier] && Array.isArray(obj[tier].values)) {
                merged.push(...obj[tier].values);
            }
        });
        return merged;
    });

    // Returns an array of items that are present in both arr1 and arr2, ignoring case.
    static intersection = memoize(function (arr1, arr2) {
        if (!Array.isArray(arr1) || !Array.isArray(arr2)) return [];

        const lowerSet2 = new Set(arr2.map((x) => x.toLowerCase()));

        return arr1.filter((item) => lowerSet2.has(item.toLowerCase()));
    });

    // Returns an array of items that are present in arr1 but not in arr2, ignoring case.
    static difference = memoize(function (arr1, arr2) {
        if (!Array.isArray(arr1) || !Array.isArray(arr2)) return [];

        const lowerSet2 = new Set(arr2.map((x) => x.toLowerCase()));

        return arr1.filter((item) => !lowerSet2.has(item.toLowerCase()));
    });

    static getBaseColumnWidth(props) {
        return props.blockWidth + (props.blockHorizontalSpacing * 2);
    }

    static getResolvedColumnGroupingField(props) {
        return props.fieldChangeMap?.[props.columnGrouping] || props.columnGrouping;
    }

    static getColumnTotalsEntries(columnKey, props) {
        if (!Array.isArray(props.columnTotals)) return [];

        const transformedField = props.columnGrouping;
        const resolvedColumnGroupingField = StackedBlockGroupedRow.getResolvedColumnGroupingField(props);

        return _.filter(props.columnTotals, (columnTotal) => (
            columnTotal?.[transformedField] === columnKey
            || columnTotal?.[resolvedColumnGroupingField] === columnKey
        ));
    }

    static getColumnTotalsEntry(columnKey, props) {
        const matchingEntries = StackedBlockGroupedRow.getColumnTotalsEntries(columnKey, props);
        if (matchingEntries.length === 0) return null;

        const transformedField = props.columnGrouping;
        const resolvedColumnGroupingField = StackedBlockGroupedRow.getResolvedColumnGroupingField(props);
        const groupedRows = Array.isArray(props.groupedDataIndices?.[columnKey]) ? props.groupedDataIndices[columnKey] : [];
        const uniqueDonors = _.chain(groupedRows)
            .map((row) => row?.donor)
            .flatten()
            .compact()
            .map((value) => String(value))
            .uniq()
            .value();
        const groupedRowDonorCount = _.reduce(groupedRows, (maxCount, row) => {
            const rowDonorCount = row?.counts?.donors ?? row?.counts?.donor_count ?? 0;
            return Math.max(maxCount, rowDonorCount);
        }, 0);
        const donorCount = uniqueDonors.length > 0
            ? uniqueDonors.length
            : Math.max(
                groupedRowDonorCount,
                _.reduce(matchingEntries, (maxCount, entry) => {
                    const entryDonorCount = entry?.counts?.donors ?? entry?.counts?.donor_count ?? 0;
                    return Math.max(maxCount, entryDonorCount);
                }, 0)
            );

        return _.reduce(matchingEntries, (memo, entry, index) => {
            if (index === 0) {
                memo = {
                    ...entry,
                    [transformedField]: columnKey,
                    [resolvedColumnGroupingField]: columnKey,
                    counts: {
                        ...(entry?.counts || {}),
                        files: 0,
                        total_coverage: 0,
                        donors: donorCount,
                        donor_count: donorCount
                    }
                };
            }
            memo.counts.files += Number(entry?.counts?.files) || 0;
            memo.counts.total_coverage += Number(entry?.counts?.total_coverage) || 0;
            return memo;
        }, null);
    }

    static getColumnHasCoverage(columnKey, props) {
        if (props.countFor !== 'total_coverage') return true;

        const totals = StackedBlockGroupedRow.getColumnTotalsEntry(columnKey, props);
        if (totals && totals.counts) {
            return Number(totals.counts.total_coverage) > 0;
        }

        const columnItems = props.groupedDataIndices?.[columnKey] || [];
        return _.some(columnItems, function(item) {
            return Number(item?.counts?.total_coverage) > 0;
        });
    }

    static getColumnWidthForKey(columnKey, props) {
        if (props.countFor !== 'total_coverage') {
            const baseWidth = StackedBlockGroupedRow.getBaseColumnWidth(props);
            return baseWidth + props.blockHorizontalExtend;
        }
        if (!StackedBlockGroupedRow.getColumnHasCoverage(columnKey, props)) {
            return DEFAULT_MATRIX_BLOCK_WIDTH
                + (props.blockHorizontalSpacing * 2)
                + DEFAULT_MATRIX_BLOCK_HORIZONTAL_EXTEND;
        }
        const baseWidth = StackedBlockGroupedRow.getBaseColumnWidth(props);
        return baseWidth + props.blockHorizontalExtend;
    }

    static getHeaderItemStyleForKey(columnKey, props) {
        const width = StackedBlockGroupedRow.getColumnWidthForKey(columnKey, props);
        return { width, minWidth: width };
    }

    // Returns the override field (e.g. donor, tissue) that is both configured in
    // rowSummaryCountsByGroup and present on the provided rows.
    static getRowSummaryOverridesForContext(props) {
        const overridesByField = props.rowSummaryCountsByGroup;
        if (!overridesByField || typeof overridesByField !== 'object') return null;
        if (props.rowGroupKey && overridesByField[props.rowGroupKey] && typeof overridesByField[props.rowGroupKey] === 'object') {
            return overridesByField[props.rowGroupKey];
        }
        return overridesByField;
    }

    static resolveOverrideFieldForRows(rows, props) {
        const overridesByField = StackedBlockGroupedRow.getRowSummaryOverridesForContext(props);
        if (!overridesByField || typeof overridesByField !== 'object') return null;
        return _.find(_.keys(overridesByField), (field) => _.some(rows || [], (row) => row && row[field] != null));
    }

    // Computes the overall files count from row summary overrides by summing one
    // override value per unique group key for the resolved override field.
    static getOverallFilesFromRowSummaryOverrides(rows, props) {
        const overrideField = StackedBlockGroupedRow.resolveOverrideFieldForRows(rows, props);
        if (!overrideField) return null;
        const overridesForField = StackedBlockGroupedRow.getRowSummaryOverridesForContext(props)?.[overrideField];
        if (!overridesForField) return null;
        const groupValues = _.chain(rows || [])
            .map((row) => row?.[overrideField])
            .compact()
            .map((value) => String(value))
            .uniq()
            .value();
        if (groupValues.length === 0) return null;
        let foundOverride = false;
        const sum = _.reduce(groupValues, (memo, groupValue) => {
            const overrideFiles = overridesForField?.[groupValue]?.files;
            if (typeof overrideFiles === 'number') {
                foundOverride = true;
                return memo + overrideFiles;
            }
            return memo;
        }, 0);
        return foundOverride ? sum : null;
    }

    // Derives a target column's files total by group using:
    // target = row summary files - sum(non-target column files) for each group.
    // This is useful when the target column can include overlap across sub-rows.
    static getDerivedColumnFilesFromRowSummary(rows, columnKey, props) {
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const overrideField = StackedBlockGroupedRow.resolveOverrideFieldForRows(rows, props);
        if (!overrideField) return null;
        const overridesForField = StackedBlockGroupedRow.getRowSummaryOverridesForContext(props)?.[overrideField];
        if (!overridesForField) return null;
        const columnField = props.columnGrouping;
        let foundGroup = false;
        const groupValues = _.chain(rows)
            .map((row) => row?.[overrideField])
            .compact()
            .map((value) => String(value))
            .uniq()
            .value();
        const rowsByGroupValue = _.groupBy(rows, (row) => String(row?.[overrideField]));
        const total = _.reduce(groupValues, (sum, groupValue) => {
            const rowSummaryFiles = overridesForField?.[groupValue]?.files;
            if (typeof rowSummaryFiles !== 'number') return sum;
            const rowsForGroup = rowsByGroupValue[groupValue] || [];
            // Sum every non-target column in this group; overlap is assumed to be isolated
            // to the target column in this fallback strategy.
            const nonTargetSum = _.reduce(rowsForGroup, (memo, row) => {
                if (row?.[columnField] === columnKey) return memo;
                return memo + (Number(row?.counts?.files) || 0);
            }, 0);
            // Clamp to zero as a safety guard for inconsistent upstream aggregates.
            const derived = rowSummaryFiles - nonTargetSum;
            foundGroup = true;
            return sum + Math.max(0, derived);
        }, 0);
        return foundGroup ? total : null;
    }

    static getRawRegularOverrideForColumn(columnKey, props) {
        const { rawRegularCountOverrides, depth, group, groupPath = [] } = props;
        if (!rawRegularCountOverrides || columnKey == null || typeof depth !== 'number') return null;
        const pathValues = [...groupPath, group].filter((value) => value != null && value !== '');
        if (pathValues.length === 0) return null;
        const pathKey = pathValues.map((value) => String(value)).join('||');
        const overrideValue = rawRegularCountOverrides?.[depth]?.[pathKey]?.[String(columnKey)];
        return typeof overrideValue === 'number' ? overrideValue : null;
    }

    static getRawRegularOverrideTotalForColumn(rows, columnKey, props) {
        const primaryGroupingField = Array.isArray(props.groupingProperties) ? props.groupingProperties[0] : null;
        if (!primaryGroupingField || !props.rawRegularCountOverrides || columnKey == null) return null;

        const primaryGroups = _.chain(rows || [])
            .map((row) => row?.[primaryGroupingField])
            .flatten()
            .compact()
            .map((value) => String(value))
            .uniq()
            .value();

        if (primaryGroups.length === 0) return null;

        let foundOverride = false;
        const total = _.reduce(primaryGroups, (memo, groupValue) => {
            const overrideValue = props.rawRegularCountOverrides?.[0]?.[groupValue]?.[String(columnKey)];
            if (typeof overrideValue === 'number') {
                foundOverride = true;
                return memo + overrideValue;
            }
            return memo;
        }, 0);

        return foundOverride ? total : null;
    }

    /** @todo Convert to functional memoized React component */
    static collapsedChildBlocks = memoize(function(data, rowTotals, props){

        const allChildBlocksPerChildGroup = null; // Forgot what this was -- seems to be null in /joint-analysis at least
        const allChildBlocks = Array.isArray(data) ? data : StackedBlockGroupedRow.flattenChildBlocks(data);
        const rowTotalChildBlocks = Array.isArray(rowTotals) ? rowTotals : StackedBlockGroupedRow.flattenChildBlocks(rowTotals);

        // currently not in use
        // if (typeof props.columnSubGrouping !== 'string' && !Array.isArray(data)) {
        //     allChildBlocksPerChildGroup = _.map(_.pairs(data), function(pair){
        //         return [pair[0], StackedBlockGroupedRow.flattenChildBlocks(pair[1])];
        //     });
        // }

        const commonProps = _.pick(props, 'blockHeight', 'blockWidth', 'blockHorizontalSpacing', 'blockVerticalSpacing',
            'groupingProperties', 'depth', 'titleMap', 'blockClassName', 'blockRenderedContents',
            'groupedDataIndices', 'columnGrouping', 'blockPopover', 'colorRanges', 'summaryBackgroundColor',
            'activeBlock', 'openBlock', 'handleBlockMouseEnter', 'handleBlockMouseLeave', 'handleBlockClick', 'group', 'popoverPrimaryTitle',
            // Generic summary overrides keyed by grouping field and row value.
            'countFor', 'rowSummaryCountsByGroup', 'rawRegularCountOverrides', 'dedupeBenchmarkingDsaAcrossTissues',
            'compactCoverageText', 'showCoverageSummaries');
        const getContainerGroupStyle = function(columnKey = 'overall-summary') {
            const width = StackedBlockGroupedRow.getColumnWidthForKey(columnKey, props);
            return {
                'width'         : width, // Width for each column
                'minWidth'      : width,
                'minHeight'     : props.blockHeight + props.blockVerticalSpacing,               // Height for each row
                'paddingLeft'   : props.blockHorizontalSpacing,
                'paddingRight'  : props.blockHorizontalSpacing,
                'paddingTop'    : props.blockVerticalSpacing
            };
        };
        const defaultContainerGroupStyle = getContainerGroupStyle();
        const containerGroupStyle = {
            ...defaultContainerGroupStyle,
            'minHeight'     : props.blockHeight + props.blockVerticalSpacing,               // Height for each row
        };
        const groupedDataIndicesPairs = (props.groupedDataIndices && _.pairs(props.groupedDataIndices)) || [];
        const hasColumns = groupedDataIndicesPairs.length > 0;
        let inner = null;

        const getBlocksForColumnGroup = (listOfObjectsForGroup) => {
            const listOfIndicesForGroup = _.pluck(listOfObjectsForGroup, 'index');
            return _.filter(allChildBlocks, (blockData) => listOfIndicesForGroup.indexOf(blockData.index) > -1);
        };

        const sortColumnKeys = (keys) => {
            if (props.columnGroups && _.keys(props.columnGroups).length > 0){
                // We need to sort the column keys by the order of the column groups.
                return StackedBlockGroupedRow.sortByArray(keys, StackedBlockGroupedRow.mergeValues(props.columnGroups));
            }
            return keys;
        };

        if (hasColumns){
            // If columns exist, distribute these blocks by column!
            // Otherwise (else statement @ end) we'll probably just stack em left-to-right.

            if (allChildBlocksPerChildGroup){
                // Generate block per each child or child group when nothing else to regroup by.

                // blocksByColumnGroup = _.object(_.map(groupedDataIndicesPairs, function(pair){
                //     var listOfIndicesForGroup = pair[1];
                //     return [
                //         pair[0],
                //         _.filter(_.map(allChildBlocksPerChildGroup, function(cPair){
                //             if (Array.isArray(cPair[1])){
                //                 var res = _.filter(cPair[1], function(cBlock){ return listOfIndicesForGroup.indexOf(cBlock.index) > -1; });
                //                 if (res.length > 0) return [cPair[0], res];
                //                 if (res.length === 0) return null;
                //             } else if (listOfIndicesForGroup.indexOf(cPair[1].index) > -1){
                //                 return [cPair[0], [cPair[1]]];
                //             } else return null;
                //         }), function(block){ return block !== null; })];
                // }));

                // columnKeys = _.keys(blocksByColumnGroup);
                // if (props.columnGroups && _.keys(props.columnGroups).length > 0){
                //     // We need to sort the column keys by the order of the column groups.
                //     columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, StackedBlockGroupedRow.mergeValues(props.columnGroups));
                // }

                // inner = _.map(columnKeys, function(k, colIdx){
                //     return (
                //         <div className="block-container-group" style={containerGroupStyle}
                //             key={k} data-group-key={k}>
                //             { _.map(blocksByColumnGroup[k], ([ key, blockData ], i) =>
                //                 <Block key={key || i} {...commonProps} data={blockData} indexInGroup={i} />
                //             ) }
                //         </div>
                //     );
                // });

            } else {
                const blocksByColumnGroup = _.object(_.map(groupedDataIndicesPairs, function([ columnKey, listOfObjectsForGroup ]){
                    return [ columnKey, getBlocksForColumnGroup(listOfObjectsForGroup) ];
                }));

                const columnKeys = sortColumnKeys(_.keys(blocksByColumnGroup));
                const currentGroupingField = props.groupingProperties?.[props.depth];
                const rowSummaryFiles = (props.countFor === 'files' || props.countFor === 'tissue_files')
                    ? props.rowSummaryCountsByGroup?.[currentGroupingField]?.[props.group]?.files
                    : null;
                const shouldUseBenchmarkingDsaCollapsedSummaryOverride = !!props.dedupeBenchmarkingDsaAcrossTissues && columnKeys.indexOf('DSA') > -1;
                const sumFilesForColumn = (columnKey) => _.reduce(blocksByColumnGroup[columnKey] || [], (sum, row) => sum + (Number(row?.counts?.files) || 0), 0);
                const derivedCollapsedCellOverrides = {};
                if (shouldUseBenchmarkingDsaCollapsedSummaryOverride && typeof rowSummaryFiles === 'number') {
                    // For collapsed rows, derive DSA as:
                    // row summary files - sum(non-DSA column files).
                    const sumNonDsaFiles = _.reduce(columnKeys, (sum, columnKey) => {
                        if (columnKey === 'DSA') return sum;
                        return sum + sumFilesForColumn(columnKey);
                    }, 0);
                    const derivedDsaFiles = rowSummaryFiles - sumNonDsaFiles;
                    if (derivedDsaFiles >= 0) {
                        derivedCollapsedCellOverrides.DSA = derivedDsaFiles;
                    }
                }

                inner = _.map(columnKeys, function(k, colIdx){
                    var blocksForGroup = blocksByColumnGroup[k];

                    // If we have columnSubGrouping (we should, if we reached this comment, b/c otherwise we do the allChildBlocksPerGroup clause), we group these into smaller blocks/groups.
                    if (typeof props.columnSubGrouping === 'string' && props.depth <= (props.groupingProperties.length - 1)){
                        blocksForGroup = _.pairs(_.groupBy(blocksForGroup, props.columnSubGrouping));
                        if (Array.isArray(props.columnSubGroupingOrder)){
                            var blocksForGroupObj = _.object(blocksForGroup);
                            var blocksForGroupObjKeys = StackedBlockGroupedRow.sortByArray(_.keys(blocksForGroupObj), props.columnSubGroupingOrder);
                            blocksForGroup = _.map(blocksForGroupObjKeys, function(bk){ return [bk, blocksForGroupObj[bk]]; });
                        }
                    }

                    return (
                        <div className="block-container-group" style={getContainerGroupStyle(k)}
                            key={k} data-block-count={blocksForGroup.length} data-group-key={k}>
                            { _.map(blocksForGroup, function(blockData, i){
                                var parentGrouping = (props.titleMap && props.titleMap[props.groupingProperties[props.depth - 1]]) || null;
                                var subGrouping = (props.titleMap && props.titleMap[props.columnSubGrouping]) || null;
                                if (Array.isArray(blockData)) {
                                    // We have columnSubGrouping so these are -pairs- of (0) columnSubGrouping val, (1) blocks
                                    blockData = blockData[1];
                                }
                                const rawOverrideFiles = (props.countFor === 'files' || props.countFor === 'tissue_files')
                                    ? StackedBlockGroupedRow.getRawRegularOverrideForColumn(k, props)
                                    : null;
                                const explicitOverrideFiles = typeof rawOverrideFiles === 'number' ? rawOverrideFiles : derivedCollapsedCellOverrides[k];
                                const blockDataForRender = typeof explicitOverrideFiles === 'number'
                                    ? (blockData || []).map((item, itemIdx) => ({
                                        ...item,
                                        counts: {
                                            ...(item?.counts || {}),
                                            // Preserve the full grouped row set for popover metadata
                                            // (e.g. multiple germ layers), while still rendering the
                                            // overridden collapsed total by assigning it to the first
                                            // row and zeroing the rest.
                                            files: itemIdx === 0 ? explicitOverrideFiles : 0
                                        }
                                    }))
                                    : blockData;
                                return <Block key={i} {...commonProps} {...{ parentGrouping, subGrouping }} data={blockDataForRender} indexInGroup={i} rowIndex={props.index} colIndex={colIdx} blockType="regular" />;
                            }) }
                        </div>
                    );
                });
                const effectiveCollapsedRowSummaryFiles = shouldUseBenchmarkingDsaCollapsedSummaryOverride && (props.countFor === 'files' || props.countFor === 'tissue_files')
                    ? _.reduce(columnKeys, (sum, columnKey) => {
                        const rawOverrideFiles = StackedBlockGroupedRow.getRawRegularOverrideForColumn(columnKey, props);
                        const explicitOverrideFiles = typeof rawOverrideFiles === 'number'
                            ? rawOverrideFiles
                            : derivedCollapsedCellOverrides[columnKey];
                        return sum + (typeof explicitOverrideFiles === 'number'
                            ? explicitOverrideFiles
                            : sumFilesForColumn(columnKey));
                    }, 0)
                    : null;
                // add summary column block
                let rowSummaryBlock = null;
                const totalRowCount = _.reduce(_.map(blocksByColumnGroup, function(b){ return b.length; }), function(m, n){ return m + n; }, 0);
                if (totalRowCount > 0){
                    const filteredRowTotalChildBlocks = _.filter(rowTotalChildBlocks, function(blockData){
                        return blockData[props.groupingProperties[props.depth]] === props.group;
                    });
                    const currentGroupingField = props.groupingProperties?.[props.depth];
                    // Pull an override for the current row dimension (e.g. donor, tissue, etc.) if provided.
                    const overrideCounts = currentGroupingField
                        ? props.rowSummaryCountsByGroup?.[currentGroupingField]?.[props.group]
                        : null;
                    const overrideFiles = typeof overrideCounts?.files === 'number' ? overrideCounts.files : null;
                    // If an override exists, replace summary counts for this row without changing child block data.
                    const rowTotalsForBlock = (typeof overrideFiles === 'number')
                        ? [{
                            ...(filteredRowTotalChildBlocks[0] || { [props.groupingProperties[props.depth]]: props.group }),
                            counts: { ...(filteredRowTotalChildBlocks[0]?.counts || {}), ...overrideCounts }
                        }]
                        : filteredRowTotalChildBlocks;
                    const summaryCountsBase = (typeof overrideFiles === 'number')
                        ? { ...(filteredRowTotalChildBlocks[0]?.counts || {}), ...overrideCounts }
                        : (filteredRowTotalChildBlocks[0]?.counts || null);
                    const summaryCounts = typeof effectiveCollapsedRowSummaryFiles === 'number'
                        ? { ...(summaryCountsBase || {}), files: effectiveCollapsedRowSummaryFiles }
                        : summaryCountsBase;
                    rowSummaryBlock = (
                        <div className="block-container-group" style={getContainerGroupStyle('overall-summary')}
                            key={'total'} data-block-count={totalRowCount} data-group-key={'row-summary'}>
                            <Block
                                {...commonProps}
                                key={inner.length}
                                data={allChildBlocks}
                                rowTotals={rowTotalsForBlock}
                                rowIndex={props.index}
                                blockType="row-summary"
                                computedBlockValue={effectiveCollapsedRowSummaryFiles}
                                summaryCounts={summaryCounts}
                            />
                        </div>
                    );
                }
                if (props.countFor !== 'total_coverage') {
                    inner.push(rowSummaryBlock);
                }

            }
        } else {
            // Stack blocks left-to-right if no column grouping (?)
            inner = _.map(allChildBlocks, ([ key, data ], colIndex) => <Block {...commonProps} {...{ key, data }} rowIndex={props.index} colIndex={colIndex} />);
        }

        return <div className="blocks-container" style={{ 'minHeight' : containerGroupStyle.minHeight }}>{ inner }</div>;
    });

    constructor(props){
        super(props);
        this.toggleOpen = _.throttle(this.toggleOpen.bind(this), 250);
        const shouldExpandByIndex = (
            props.depth === 0 &&
            typeof props.index === 'number' &&
            Array.isArray(props.defaultExpandedRowIndices) &&
            props.defaultExpandedRowIndices.includes(props.index)
        );
        var initOpen = shouldExpandByIndex || ((Array.isArray(props.defaultDepthsOpen) && props.defaultDepthsOpen[props.depth]) || false);
        this.state = { 'open' : initOpen };
    }

    toggleOpen(evt){
        const { handleBlockClick } = this.props;
        evt.stopPropagation();
        this.setState(function ({ open }) {
            setTimeout(function () {
                !open && ReactTooltip.rebuild();
                typeof handleBlockClick === 'function' && handleBlockClick(null, null, null, null);
            }, 100);
            return { "open": !open };
        });
    }

    /**
     * renders the column headers and axis labels
     * @param {*} props
     * @returns
     */
    static columnsAndHeader(props) {
        const {
            blockWidth, blockHeight, blockHorizontalSpacing, blockVerticalSpacing, blockHorizontalExtend, headerPadding,
            sorting, sortField, onSorterClick, groupedDataIndices, openBlock, activeBlock,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
            overallCounts, countFor, headerLeftControls, hideFallbackColumnGroupHeader = false, hideFallbackRowGroupHeader = false
        } = props;

        const rowHeight = blockHeight + (blockVerticalSpacing * 2) + 1;
        const sorterActiveStyle = function(columnKey) {
            return _.extend({}, StackedBlockGroupedRow.getHeaderItemStyleForKey(columnKey, props));
        };

        const hasColumnGroups = showColumnGroups && columnGroups && _.keys(columnGroups).length > 0;
        const hasColumnGroupsExtended = showColumnGroupsExtended && columnGroupsExtended && _.keys(columnGroupsExtended).length > 0;
        const columnGroupsKeys = hasColumnGroups
            ? [..._.keys(columnGroups), ...(hideFallbackColumnGroupHeader ? [] : [FALLBACK_GROUP_NAME])]
            : null;

        const extPadding = 60 + (hasColumnGroups ? 26 : 0) + (hasColumnGroupsExtended ? 30 : 0);
        const labelSectionStyle = {
            'paddingTop': Math.max(0, headerPadding + extPadding - rowHeight),
            'zIndex': 6,
            'position': 'relative'
        };
        const listSectionStyle = { 'paddingTop': headerPadding };

        const getColumnKeys = () => {
            let keys = _.keys(groupedDataIndices);
            if (hasColumnGroups) {
                keys = StackedBlockGroupedRow.sortByArray(
                    keys,
                    StackedBlockGroupedRow.mergeValues(columnGroups)
                );
            }
            return keys;
        };
        const columnKeys = getColumnKeys();
        //currently not in use
        // const totalColumnHeader = (
        //     <div
        //         key="col-total" className="column-group-header"
        //         style={{ width: columnWidth, minWidth: columnWidth, backgroundColor: summaryBackgroundColor, color: '#fff' }}>
        //         <div className="inner">
        //             Total
        //         </div>
        //     </div>
        // );

        const rowGroupsSummaryProps = {
            ...props,
            label: StackedBlockVisual.pluralize(yAxisLabel),
            labelSectionStyle,
            columnKeys
        };

        const renderAxisLabels = () => {
            if (!showAxisLabels) return null;
            return (
                <div className="axis-container flex-grow-1">
                    <div className="x-axis">{xAxisLabel || 'X'}</div>
                    <div className="y-axis">{yAxisLabel || 'Y'}</div>
                </div>
            );
        };

        const renderColumnHeaders = () => (
            <div className="d-flex header-col-text">
                {columnKeys.map(function (columnKey, colIndex) {
                    const hasOpenBlock = openBlock?.columnIdx === colIndex;
                    const hasActiveBlock = activeBlock?.columnIdx === colIndex;
                    const className = 'column-group-header' + (hasOpenBlock ? ' open-block-column' : '') + (hasActiveBlock ? ' active-block-column' : '');
                    return (
                        <div key={'col-' + columnKey} className={className} style={StackedBlockGroupedRow.getHeaderItemStyleForKey(columnKey, props)}>
                            <div className="inner">
                                <span>{columnKey}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );


        const renderColumnGroupHeaders = () => {
            if (!hasColumnGroups) return null;
            return (
                <div className="d-flex header-group-text">
                    {headerLeftControls ? (
                        <div className="header-group-controls header-group-controls-inline">
                            {headerLeftControls}
                        </div>
                    ) : null}
                    {
                        columnGroupsKeys.map(function (groupKey) {
                            const { values, backgroundColor, textColor } = columnGroups[groupKey] || { values: [], backgroundColor: '#ffffff', textColor: '#000000' };

                            let columnGroupChilColumnKeys = [];
                            if (groupKey === FALLBACK_GROUP_NAME) { //special case for N/A
                                const allValues = StackedBlockGroupedRow.mergeValues(columnGroups);
                                // not intersecting childRowsKeys and allValues
                                columnGroupChilColumnKeys = StackedBlockGroupedRow.difference(columnKeys, allValues);
                            } else {
                                columnGroupChilColumnKeys = StackedBlockGroupedRow.intersection(columnKeys, values || []);
                            }

                            const colSpan = columnGroupChilColumnKeys.length;
                            if (colSpan === 0) {
                                return null;
                            }
                            const groupColumnWidth = _.reduce(columnGroupChilColumnKeys, function(sum, childColumnKey) {
                                return sum + StackedBlockGroupedRow.getColumnWidthForKey(childColumnKey, props);
                            }, 0);
                            const groupHeaderItemStyle = {
                                width: groupColumnWidth,
                                minWidth: groupColumnWidth
                            };
                            groupHeaderItemStyle.backgroundColor = backgroundColor;
                            groupHeaderItemStyle.color = textColor;
                            const label = (groupKey.length > (colSpan * 4)) && columnGroups[groupKey].shortName ? columnGroups[groupKey].shortName : groupKey;

                            return (
                                <div key={'col-' + groupKey} className={'column-group-header'} style={groupHeaderItemStyle}>
                                    <div className="inner">
                                        <span data-tip={groupKey !== label ? groupKey : null}>{label}</span>
                                    </div>
                                </div>
                            );
                        })
                    }
                    {/* {totalColumnHeader} */}
                </div>
            );
        };

        const renderExtendedColumnGroupHeaders = () => {
            if (!hasColumnGroupsExtended) return null;
            return (
                <div className="d-flex header-group-text">
                    {
                        _.keys(columnGroupsExtended).map(function (groupExtendedKey) {
                            const colCount = _.reduce(columnGroupsExtended[groupExtendedKey].values, function (memo, groupKey) {
                                const count = StackedBlockGroupedRow.intersection(columnKeys, columnGroups[groupKey]?.values || []).length;
                                return memo + count;
                            }, 0);

                            if (colCount === 0) return null;

                            const groupColumnWidth = _.reduce(columnGroupsExtended[groupExtendedKey].values, function(sum, groupKey) {
                                const childKeys = StackedBlockGroupedRow.intersection(columnKeys, columnGroups[groupKey]?.values || []);
                                return sum + _.reduce(childKeys, function(childSum, childColumnKey) {
                                    return childSum + StackedBlockGroupedRow.getColumnWidthForKey(childColumnKey, props);
                                }, 0);
                            }, 0);
                            const groupHeaderItemStyle = {
                                width: groupColumnWidth,
                                minWidth: groupColumnWidth
                            };
                            groupHeaderItemStyle.backgroundColor = columnGroupsExtended[groupExtendedKey].backgroundColor;
                            groupHeaderItemStyle.color = columnGroupsExtended[groupExtendedKey].textColor;

                            return (
                                <div key={'col-' + groupExtendedKey} className={'column-group-header'} style={groupHeaderItemStyle}>
                                    <div className="inner">
                                        <span>{groupExtendedKey}</span>
                                    </div>
                                </div>
                            );
                        })
                    }
                </div>
            );
        };

        const renderSortingHeaders = () => (
            <div className="d-flex header-sorting">
                {columnKeys.map(function (columnKey, colIndex) {
                    //sort order icons
                    let countSortIcon;
                    if ((sorting === 'desc') && (columnKey === sortField)) {
                        countSortIcon = <SortIconDesc />;
                    } else if ((sorting === 'asc') && (columnKey === sortField)) {
                        countSortIcon = <SortIconAsc />;
                    } else {
                        countSortIcon = <SortIconBoth />;
                    }
                    const countSortIconClassName = 'column-sort-icon' + (['asc', 'desc'].indexOf(sorting) > -1 && columnKey === sortField ? ' active' : '');
                    const extraClassName = (activeBlock?.column === colIndex ? ' active-block-column' : '');
                    const style = (activeBlock?.column === colIndex)
                        ? sorterActiveStyle(columnKey)
                        : StackedBlockGroupedRow.getHeaderItemStyleForKey(columnKey, props);
                    return (
                        <div key={'col-' + columnKey} className={'column-group-header' + extraClassName} style={style}>
                            <div data-index={columnKey} onClick={onSorterClick}>
                                <span className={countSortIconClassName}>{countSortIcon}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        );

        const headerUpperClassName = "grouping header-section-upper";

        return (
            <React.Fragment>
                <div className={headerUpperClassName}>
                    <div className="row grouping-row">
                        <div className="label-section d-flex flex-column" style={labelSectionStyle}>
                            {renderAxisLabels()}
                        </div>
                        {columnKeys.length > 0 && (
                            <div className="col list-section has-header header-for-viz" style={listSectionStyle}>
                                {renderColumnHeaders()}
                                {renderColumnGroupHeaders()}
                                {renderExtendedColumnGroupHeaders()}
                                {renderSortingHeaders()}
                            </div>
                        )}
                    </div>
                </div>
                {columnKeys.length > 0 && showColumnSummary && StackedBlockGroupedRow.rowGroupsSummary(rowGroupsSummaryProps)}
            </React.Fragment>
        );
    }

    // renders the row group summary section
    static rowGroupsSummary({ label, labelSectionStyle, columnKeys, containerSectionStyle, ...props } ) {
        const isTissueMatrix = String(label || '').toLowerCase().indexOf('tissue') > -1;
        const groupShortName = props.rowGroups?.[props.rowGroupKey]?.shortName;
        const primarySummaryEntity = groupShortName || (isTissueMatrix ? 'Tissue' : 'Donor');
        const primarySummaryBandLabel = `Total ${StackedBlockVisual.pluralize(primarySummaryEntity)}`;
        const secondarySummaryBandLabelByMetric = {
            files: 'Total Files',
            tissue_files: 'Total Files',
            total_coverage: 'Total Coverages',
            donors: 'Total Donors'
        };
        const groupingBandLabel = secondarySummaryBandLabelByMetric[props.countFor] || `Total ${label}`;

        const parseCustomUrlParams = (customUrlParams) => {
            if (!customUrlParams || typeof customUrlParams !== 'string') return {};
            try {
                return queryString.parse(customUrlParams);
            } catch (e) {
                return {};
            }
        };

        const rowMatchesCustomUrlParams = (row, customUrlParams) => {
            const parsedParams = parseCustomUrlParams(customUrlParams);
            const paramKeys = Object.keys(parsedParams);
            if (paramKeys.length === 0) return true;

            return paramKeys.every((key) => {
                const isNegative = key.endsWith('!');
                const fieldName = isNegative ? key.slice(0, -1) : key;
                const expectedValues = Array.isArray(parsedParams[key]) ? parsedParams[key] : [parsedParams[key]];
                const rowValue = row?.[fieldName];
                const rowValues = Array.isArray(rowValue)
                    ? rowValue.map((value) => String(value))
                    : [String(rowValue)];

                if (isNegative) {
                    return rowValues.every((value) => !expectedValues.map(String).includes(value));
                }

                return rowValues.some((value) => expectedValues.map(String).includes(value));
            });
        };

        const currentRowGroupCustomUrlParams = props.rowGroups?.[props.rowGroupKey]?.customUrlParams || null;

        const getColumnSummaryData = (columnKey) => {
            const values = props.groupedDataIndices[columnKey] || [];
            return values.filter((row) => rowMatchesCustomUrlParams(row, currentRowGroupCustomUrlParams));
        };

        const getAllSectionRows = () => {
            const rowsById = {};
            Object.keys(props.groupedDataIndices || {}).forEach((ck) => {
                (props.groupedDataIndices[ck] || []).forEach((row, idx) => {
                    if (!rowMatchesCustomUrlParams(row, currentRowGroupCustomUrlParams)) return;
                    const rowKey = row && typeof row.index !== 'undefined' ? `idx-${row.index}` : `fallback-${ck}-${idx}`;
                    rowsById[rowKey] = row;
                });
            });
            return _.values(rowsById);
        };

        const getPrimaryGroupCountFromGroupedRows = (columnKey) => {
            const rows = getColumnSummaryData(columnKey);
            const primaryGroupField = Array.isArray(props.groupingProperties) ? props.groupingProperties[0] : 'donor';
            const primaryGroupSet = new Set();
            rows.forEach((row) => {
                const primaryGroupValue = row && row[primaryGroupField];
                if (Array.isArray(primaryGroupValue)) {
                    primaryGroupValue.forEach((d) => { if (d != null) primaryGroupSet.add(String(d)); });
                } else if (primaryGroupValue != null) {
                    primaryGroupSet.add(String(primaryGroupValue));
                }
            });
            return primaryGroupSet.size;
        };

        const getDonorCountFromGroupedRows = (columnKey) => {
            const rows = getColumnSummaryData(columnKey);
            const donorSet = new Set();
            let maxRowDonorCount = 0;

            rows.forEach((row) => {
                const donorValue = row && row.donor;
                if (Array.isArray(donorValue)) {
                    donorValue.forEach((d) => { if (d != null) donorSet.add(String(d)); });
                } else if (donorValue != null) {
                    donorSet.add(String(donorValue));
                }
                const rowDonorCount = row?.counts?.donors ?? row?.counts?.donor_count ?? 0;
                if (rowDonorCount > maxRowDonorCount) {
                    maxRowDonorCount = rowDonorCount;
                }
            });

            return donorSet.size > 0 ? donorSet.size : maxRowDonorCount;
        };

        const getOverallPrimaryGroupCountFromRows = () => {
            const primaryGroupField = Array.isArray(props.groupingProperties) ? props.groupingProperties[0] : 'donor';
            const primaryGroupSet = new Set();
            Object.keys(props.groupedDataIndices || {}).forEach((ck) => {
                (props.groupedDataIndices[ck] || []).forEach((row) => {
                    if (!rowMatchesCustomUrlParams(row, currentRowGroupCustomUrlParams)) return;
                    const primaryGroupValue = row && row[primaryGroupField];
                    if (Array.isArray(primaryGroupValue)) {
                        primaryGroupValue.forEach((d) => { if (d != null) primaryGroupSet.add(String(d)); });
                    } else if (primaryGroupValue != null) {
                        primaryGroupSet.add(String(primaryGroupValue));
                    }
                });
            });
            return primaryGroupSet.size;
        };

        const getUniqueDonorCountFromRows = (rows) => {
            const donorSet = new Set();
            (rows || []).forEach((row) => {
                const donorValue = row && row.donor;
                if (Array.isArray(donorValue)) {
                    donorValue.forEach((d) => { if (d != null) donorSet.add(String(d)); });
                } else if (donorValue != null) {
                    donorSet.add(String(donorValue));
                }
            });
            return donorSet.size;
        };

        const getSummaryBlockStyle = (columnKey) => {
            const columnWidth = StackedBlockGroupedRow.getColumnWidthForKey(columnKey, props);
            return {
                'width': columnWidth, // Width for each column
                'minWidth': columnWidth,
                'minHeight': props.blockHeight + props.blockVerticalSpacing, // Height for each row
                'paddingLeft': props.blockHorizontalSpacing,
                'paddingRight': props.blockHorizontalSpacing,
                'paddingTop': props.blockVerticalSpacing
            };
        };

        const renderSummaryBlocks = (summaryCountFor = props.countFor, summaryBlockType = 'col-summary') => (
            <div className="blocks-container d-flex header-summary">
                {columnKeys.map(function (columnKey, colIndex) {
                    const isPrimarySummaryBand = summaryBlockType === 'col-secondary-summary';
                    const sectionColumnRows = getColumnSummaryData(columnKey);
                    const sectionRows = getAllSectionRows();
                    const derivedCoverageTotal = summaryCountFor === 'total_coverage'
                        ? _.reduce(sectionColumnRows, function(sum, item) {
                            return sum + getCountValueFromItem(item, 'total_coverage');
                        }, 0)
                        : null;
                    const summedSectionFilesTotal = _.reduce(sectionColumnRows, function(sum, item) {
                        return sum + getCountValueFromItem(item, 'files');
                    }, 0);
                    const rawOverrideSectionFilesTotal = (summaryCountFor === 'files' || summaryCountFor === 'tissue_files')
                        ? StackedBlockGroupedRow.getRawRegularOverrideTotalForColumn(sectionRows, columnKey, props)
                        : null;
                    const sectionFilesTotal = typeof rawOverrideSectionFilesTotal === 'number'
                        ? rawOverrideSectionFilesTotal
                        : summedSectionFilesTotal;
                    // Apply derived fallback only for DSA column summary files.
                    // Other columns continue using backend/standard summary paths.
                    const shouldDeriveDsaFiles = summaryCountFor === 'files'
                        && summaryBlockType === 'col-summary'
                        && columnKey === 'DSA'
                        && (!props.dedupeBenchmarkingDsaAcrossTissues || typeof rawOverrideSectionFilesTotal !== 'number')
                        && !!props.rowSummaryCountsByGroup;
                    const derivedDsaFiles = shouldDeriveDsaFiles
                        ? StackedBlockGroupedRow.getDerivedColumnFilesFromRowSummary(sectionRows, columnKey, props)
                        : null;
                    const groupedRowsDonorCount = getDonorCountFromGroupedRows(columnKey);
                    const donorsCount = isPrimarySummaryBand
                        ? getPrimaryGroupCountFromGroupedRows(columnKey)
                        : (groupedRowsDonorCount || getPrimaryGroupCountFromGroupedRows(columnKey));
                    const totalsCounts = {
                        files: sectionFilesTotal,
                        total_coverage: derivedCoverageTotal ?? 0,
                        donors: donorsCount,
                        donor_count: donorsCount
                    };
                    const rawColumnTotalEntry = sectionColumnRows.length > 0
                        ? {
                            ...sectionColumnRows[0],
                            counts: {
                                ...(sectionColumnRows[0]?.counts || {}),
                                ...totalsCounts
                            }
                        }
                        : null;
                    const summaryCounts = {
                        ...(totalsCounts || {}),
                        donors: donorsCount,
                        ...(summaryCountFor === 'total_coverage' ? { total_coverage: totalsCounts?.total_coverage ?? derivedCoverageTotal ?? 0 } : null),
                        ...((typeof derivedDsaFiles === 'number') ? { files: derivedDsaFiles } : null)
                    };
                    const useRawColumnTotal = rawColumnTotalEntry && (summaryCountFor === 'files' || summaryCountFor === 'tissue_files');
                    const columnSummaryData = summaryCountFor === 'donors'
                        ? [{ counts: { donors: donorsCount } }]
                        : summaryCountFor === 'total_coverage'
                            ? (props.showCoverageSummaries
                                ? [{ counts: { total_coverage: summaryCounts?.total_coverage || 0 } }]
                                : [])
                            : (useRawColumnTotal
                                ? rawColumnTotalEntry
                                : (typeof derivedDsaFiles === 'number'
                                    ? [{ counts: { files: derivedDsaFiles } }]
                                    : sectionColumnRows));
                    const columnTotal = sectionColumnRows.length || 0;
                    const hasOpenBlock = props.openBlock?.columnIdx === colIndex && props.openBlock?.summaryRowType === summaryBlockType;
                    const hasActiveBlock = props.activeBlock?.columnIdx === colIndex && props.activeBlock?.summaryRowType === summaryBlockType;
                    const className = 'column-group-header' + (hasOpenBlock ? ' open-block-column' : '') + (hasActiveBlock ? ' active-block-column' : '');
                    const headerItemStyle = StackedBlockGroupedRow.getHeaderItemStyleForKey(columnKey, props);
                    const summaryBlockStyle = getSummaryBlockStyle(columnKey);
                    return (
                        <div key={'col-summary-' + columnKey} className={className} style={headerItemStyle}>
                            <div className="block-container-group" style={summaryBlockStyle}
                                key={'summary'} data-block-count={columnTotal} data-group-key={columnKey}>
                                <Block
                                    {..._.omit(props, 'group')}
                                    key={`${summaryBlockType}-${colIndex}`}
                                    data={columnSummaryData}
                                    colIndex={colIndex}
                                    blockType={summaryBlockType}
                                    popoverPrimaryTitle={props.rowGroupKey}
                                    columnKey={columnKey}
                                    countFor={summaryCountFor}
                                    summaryCounts={summaryCounts}
                                    summaryRowType={summaryBlockType}
                                />
                            </div>
                        </div>
                    );
                })}
                {(() => {
                    if (summaryCountFor === 'total_coverage' && !props.showCoverageSummaries) return null;
                    const isPrimarySummaryBand = summaryBlockType === 'col-secondary-summary';
                    const sectionRows = getAllSectionRows();
                    // If row summary overrides exist for this grouping field, use them for the
                    // corner overall files value to avoid re-summing potentially overlapping child rows.
                    const overallFilesOverride = StackedBlockGroupedRow.getOverallFilesFromRowSummaryOverrides(sectionRows, props);
                    const overallValue = summaryCountFor === 'donors'
                        ? (isPrimarySummaryBand
                            ? getOverallPrimaryGroupCountFromRows()
                            : (props.overallCounts?.donors ?? props.overallCounts?.donor_count ?? getUniqueDonorCountFromRows(sectionRows)))
                        : summaryCountFor === 'total_coverage'
                            ? (props.overallCounts?.total_coverage ?? _.reduce(sectionRows, function(sum, item) {
                                return sum + getCountValueFromItem(item, 'total_coverage');
                            }, 0))
                        : summaryCountFor === 'tissue_files'
                            ? (props.overallCounts?.files ?? overallFilesOverride ?? _.reduce(sectionRows, function (sum, item) {
                                return sum + (Number(item?.counts?.files) || 0);
                            }, 0))
                            : summaryCountFor === 'files'
                                ? (overallFilesOverride ?? _.reduce(sectionRows, function (sum, item) {
                                    return sum + (Number(item?.counts?.files) || 0);
                                }, 0))
                                : props.overallCounts?.[summaryCountFor];
                    if (overallValue == null) return null;
                    const overallHeaderItemStyle = StackedBlockGroupedRow.getHeaderItemStyleForKey('overall-summary', props);
                    const overallSummaryBlockStyle = getSummaryBlockStyle('overall-summary');
                    const hasOpenBlock = props.openBlock?.columnIdx === columnKeys.length
                        && props.openBlock?.summaryRowType === summaryBlockType;
                    const hasActiveBlock = props.activeBlock?.columnIdx === columnKeys.length
                        && props.activeBlock?.summaryRowType === summaryBlockType;
                    return (
                        <div
                            key={`col-summary-overall-${summaryCountFor}`}
                            className={`column-group-header overall-summary ${summaryBlockType === 'col-secondary-summary' ? 'col-secondary-summary' : ''}${hasOpenBlock ? ' open-block-column' : ''}${hasActiveBlock ? ' active-block-column' : ''}`}
                            style={overallHeaderItemStyle}>
                            <div
                                className="block-container-group"
                                style={overallSummaryBlockStyle}
                                data-block-count={1}
                                data-group-key="overall-summary">
                                <Block
                                    {..._.omit(props, 'group')}
                                    key={`overall-summary-block-${summaryCountFor}`}
                                    data={{
                                        counts: summaryCountFor === 'donors'
                                            ? { ...props.overallCounts, donors: overallValue }
                                            : (summaryCountFor === 'files' || summaryCountFor === 'tissue_files')
                                                ? { ...props.overallCounts, files: overallValue }
                                                : props.overallCounts
                                    }}
                                    colIndex={columnKeys.length}
                                    blockType={summaryBlockType === 'col-secondary-summary' ? 'col-summary' : summaryBlockType}
                                    popoverPrimaryTitle={props.rowGroupKey}
                                    columnKey="overall-summary"
                                    countFor={summaryCountFor}
                                    summaryCounts={summaryCountFor === 'donors'
                                        ? { ...props.overallCounts, donors: overallValue }
                                        : (summaryCountFor === 'files' || summaryCountFor === 'tissue_files')
                                            ? { ...props.overallCounts, files: overallValue }
                                            : props.overallCounts
                                    }
                                    summaryRowType={summaryBlockType}
                                />
                            </div>
                        </div>
                    );
                })()}
            </div>
        );

        return (
            <div className="grouping header-section-lower" style={containerSectionStyle}>
                {props.showUniqueDonorsAssayBand !== false ? (
                    <div className="row grouping-row total-donors-summary-row">
                        <div className="label-section" style={{ ...labelSectionStyle, paddingTop: props.blockVerticalSpacing }}>
                            <div className="label-container text-end" style={{ height: '29px', marginBottom: '1px' }}>
                                <span className="float-start text-500 ps-05">{primarySummaryBandLabel}</span>
                            </div>
                        </div>
                        <div className="col list-section has-header header-for-viz">
                            {renderSummaryBlocks('donors', 'col-secondary-summary')}
                        </div>
                    </div>
                ) : null}
                <div className="row grouping-row">
                    <div className="label-section" style={{ ...labelSectionStyle, paddingTop: props.blockVerticalSpacing }}>
                        <div className="label-container text-end" onClick={props.onSorterClick} style={{ height: '29px', marginBottom: '1px' }}>
                            <span className="float-start text-500 ps-05">{groupingBandLabel}</span>
                            {/* <span className={labelSortIconClassName}>{labelSortIcon}</span> */}
                        </div>
                    </div>
                    <div className="col list-section has-header header-for-viz">
                        {renderSummaryBlocks(props.countFor, 'col-summary')}
                    </div>
                </div>
            </div>
        );
    }

    render(){
        const {
            groupingProperties, depth, titleMap, group, blockHeight, blockVerticalSpacing, blockHorizontalSpacing,
            data, rowTotals, index, showGroupingPropertyTitles, checkCollapsibility,
            activeBlock, openBlock,
            rowGroupsExtended, showRowGroupsExtended, hideFallbackRowGroupHeader = false, fallbackNameForBlankField = 'None' } = this.props;
        const { open: stateOpen } = this.state;

        const getGroupingPropertyTitle = () => {
            if (!Array.isArray(groupingProperties) || !groupingProperties[depth]) return null;
            return titleMap[groupingProperties[depth]] || groupingProperties[depth];
        };

        const getChildRowsKeys = () => (!Array.isArray(data) ? _.keys(data).sort() : null);
        const getHasIdentifiableChildren = (childRowsKeys) => {
            if (!checkCollapsibility) return false;
            return (depth + 2 >= groupingProperties.length) &&
                childRowsKeys && childRowsKeys.length > 0 &&
                !(childRowsKeys.length === 1 && childRowsKeys[0] === 'No value');
        };

        const childRowsKeys = getChildRowsKeys();
        const hasIdentifiableChildren = getHasIdentifiableChildren(childRowsKeys);
        const open = stateOpen && hasIdentifiableChildren;

        const getToggleIcon = () => {
            if (!Array.isArray(data) && data && hasIdentifiableChildren) {
                return (
                    <i
                        className={"clickable icon fas icon-fw icon-" + (open ? 'minus' : 'plus')}
                        onClick={this.toggleOpen}
                    />
                );
            }
            return <i className="icon icon-fw" />;
        };

        const baseClassName = "grouping depth-" + depth + (open ? ' open' : '') + (' row-index-' + index);
        const className = baseClassName +
            (!showGroupingPropertyTitles ? ' no-grouping-property-titles' : '') +
            ((!Array.isArray(data) && data && hasIdentifiableChildren) ? ' may-collapse' : '');

        const hasRowGroupsExtended = showRowGroupsExtended && rowGroupsExtended && _.keys(rowGroupsExtended).length > 0;
        const rowGroupsExtendedKeys = hasRowGroupsExtended
            ? [..._.keys(rowGroupsExtended), ...(hideFallbackRowGroupHeader ? [] : [FALLBACK_GROUP_NAME])]
            : null;
        const rowGroupsExtendedByLowerKey = hasRowGroupsExtended ? _.reduce(_.keys(rowGroupsExtended), (memo, k) => {
            const lk = k.toLowerCase();
            if (memo[lk] == null) memo[lk] = k;
            return memo;
        }, {}) : null;
        const rowHeight = blockHeight + (blockVerticalSpacing * 2) + 1;
        const childBlocks = !open ? StackedBlockGroupedRow.collapsedChildBlocks(data, rowTotals, this.props) : (
            <div className="open-empty-placeholder" style={{ 'height' : rowHeight, 'marginLeft' : blockHorizontalSpacing }}/>
        );
        const maxBlocksInRow  = childBlocks && Math.max.apply(Math.max, _.pluck(_.pluck((childBlocks && childBlocks.props && childBlocks.props.children) || [], 'props'), 'data-block-count'));
        const hasOpenBlock = openBlock?.rowIdx === index && openBlock?.rowKey === group;
        const hasActiveBlock = activeBlock?.rowIdx === index && activeBlock?.rowKey === group;
        const labelContainerClassName = 'label-container' + (hasOpenBlock ? ' open-block-row' : '') + (hasActiveBlock ? ' active-block-row' : '');
        const groupingPropertyTitle = getGroupingPropertyTitle();
        const toggleIcon = getToggleIcon();
        const displayGroup = (typeof group === 'undefined' || group === null || group === '' || group === 'undefined' || group === 'null' || group === fallbackNameForBlankField)
            ? ''
            : group;

        const renderRowGroupsExtended = () => renderVerticalRowGroupsExtended({
            rowGroupsExtended,
            rowGroupsExtendedKeys,
            rowKeys: childRowsKeys,
            rowHeight,
            rowGroupsExtendedByLowerKey,
            renderRow: (k) => (
                <StackedBlockGroupedRow {...this.props} data={data[k]} key={k} group={k} groupPath={[...(this.props.groupPath || []), group]} depth={depth + 1} />
            )
        });

        const renderChildRows = () => (
            <div className="child-blocks">
                {open && childRowsKeys && _.map(childRowsKeys, (k) =>
                    <StackedBlockGroupedRow {...this.props} data={data[k]} key={k} group={k} groupPath={[...(this.props.groupPath || []), group]} depth={depth + 1} />
                )}
            </div>
        );
        return (
            <React.Fragment>
                <div className={className} data-max-blocks-vertical={maxBlocksInRow}>
                    <div className="row grouping-row">
                        <div className="label-section">
                            <div className={labelContainerClassName} style={{ 'minHeight': rowHeight }}>
                                {groupingPropertyTitle && showGroupingPropertyTitles ?
                                    <small className="text-400 mb-0 mt-0">{groupingPropertyTitle}</small>
                                    : null}
                                <h4 className="text-truncate"
                                    data-tip={displayGroup && typeof displayGroup === 'string' && displayGroup.length > 20 ? displayGroup : null}>
                                    {toggleIcon}<span className="inner">{displayGroup}</span>
                                </h4>
                            </div>
                        </div>
                        <div className={"col list-section"}>
                            {childBlocks}
                        </div>
                    </div>

                    {open && toggleIcon && depth > 0 ? <div className="close-button" onClick={this.toggleOpen}>{toggleIcon}</div> : null}

                    <div className="child-blocks">
                        {open && childRowsKeys && hasRowGroupsExtended &&
                            renderRowGroupsExtended()
                        }
                        {open && childRowsKeys && !hasRowGroupsExtended &&
                            renderChildRows()
                        }
                    </div>

                </div>
            </React.Fragment>
        );
    }

}

const Block = React.memo(function Block(props){
    const {
        blockHeight, blockWidth, blockVerticalSpacing, data, rowTotals, parentGrouping, group,
        blockClassName, blockRenderedContents, blockPopover, indexInGroup, colorRanges, summaryBackgroundColor,
        handleBlockMouseEnter, handleBlockMouseLeave, handleBlockClick, rowIndex, colIndex, rowGroupKey, columnKey, openBlock,
        blockType = 'regular', summaryRowType = null
    } = props;

    // Layout / base style
    const style = {
        'height' : blockHeight,
        'width' : '100%', //blockWidth,
        //'lineHeight' : blockHeight + 'px',
        'marginBottom' : blockVerticalSpacing,
        'marginTop' : indexInGroup && indexInGroup > 0 ? blockVerticalSpacing + 1 : 0
    };

    const isSummaryBlock = (type) => type === 'row-summary' || type === 'col-summary' || type === 'col-secondary-summary';

    // Choose source data for summary blocks
    const argData = blockType === 'row-summary' && rowTotals ? rowTotals : data;
    const blockFxnArguments = [argData, props, parentGrouping];

    // Compute className and contents
    let className = "stacked-block";
    if (typeof blockClassName === 'function'){
        className += ' ' + blockClassName.apply(blockClassName, blockFxnArguments);
    } else if (typeof blockClassName === 'string'){
        className += ' ' + blockClassName;
    }

    let contents = ( <span>&nbsp;</span> );
    if (typeof blockRenderedContents === 'function'){
        contents = blockRenderedContents.apply(blockRenderedContents, blockFxnArguments);
    }

    const countFor = props.countFor || 'files';
    const effectiveCountFor = countFor === 'tissue_files' ? 'files' : countFor;
    const blockValue = Array.isArray(argData)
        ? (effectiveCountFor === 'donors'
            ? (() => {
                const uniqueDonorCount = getUniqueDonorCountFromItems(argData);
                if (uniqueDonorCount !== null) return uniqueDonorCount;
                return _.reduce(argData, function (maxValue, item) { return Math.max(maxValue, getCountValueFromItem(item, effectiveCountFor)); }, 0);
            })()
            : _.reduce(argData, function (sum, item) { return sum + getCountValueFromItem(item, effectiveCountFor); }, 0))
        : (argData ? getCountValueFromItem(argData, effectiveCountFor) : 0);
    const shouldShowCoverageSummary = !!props.showCoverageSummaries;
    const shouldShowCompactCoverageTooltip = (() => {
        if (countFor !== 'total_coverage') return false;
        if (!(blockType === 'col-summary' || blockType === 'row-summary' || blockType === 'col-secondary-summary')) return false;
        if (!shouldShowCoverageSummary) return false;
        const compactCoverageText = typeof props.compactCoverageText === 'boolean'
            ? props.compactCoverageText
            : true;
        return formatCoverageDisplayValue(blockValue, compactCoverageText).isCompacted;
    })();
    const compactedCountTooltip = (() => {
        if (countFor === 'total_coverage') {
            return shouldShowCompactCoverageTooltip ? `${formatLocalizedNumber(blockValue)}X` : null;
        }
        return blockValue >= 1000 ? formatLocalizedNumber(blockValue) : null;
    })();
    const hideCoverageBlock = countFor === 'total_coverage' && blockType === 'regular' && blockValue <= 0;

    // Build optional popover after blockValue is known so summary popovers can
    // use the exact rendered count instead of re-deriving from grouped rows.
    let popover = null;
    if (typeof blockPopover === 'function'){
        popover = blockPopover.apply(blockPopover, [argData, {
            ...props,
            computedBlockValue: typeof props?.computedBlockValue === 'number' ? props.computedBlockValue : blockValue
        }, parentGrouping]);
    }

    if (hideCoverageBlock) {
        popover = null;
    }

    // Color selection (summary blocks use a fixed color)
    const getColor = function (value, type = 'regular') {
        if (isSummaryBlock(type)){
            return summaryBackgroundColor || '#000000';
        }
        if (!colorRanges){
            return null;
        }

        const range = colorRanges.find((r) =>
            value >= r.min && (r.max === undefined || value <= r.max)
        );
        return range ? range.color : null;
    };

    let color = getColor(blockValue, blockType);
    // Safety fallback: if a positive value misses a color bucket, still paint it so
    // value-present cells never appear as blank white boxes.
    if (!color && blockType === 'regular' && blockValue > 0 && Array.isArray(colorRanges) && colorRanges.length > 0) {
        color = colorRanges[0].color || null;
    }

    const isOpenBlock = openBlock?.rowIdx === rowIndex && openBlock?.columnIdx === colIndex &&
        ((blockType === 'col-summary' || blockType === 'col-secondary-summary')
            ? (openBlock?.rowGroupKey === rowGroupKey && openBlock?.summaryRowType === summaryRowType)
            : (openBlock?.rowKey === group));

    // Apply open/active styles
    if (hideCoverageBlock) {
        style['backgroundColor'] = 'transparent';
        style['borderColor'] = 'transparent';
        style['pointerEvents'] = 'none';
    } else if (isOpenBlock) {
        if (isSummaryBlock(blockType)) {
            style['color'] = '#8a8aaa';
            style['borderColor'] = '#8a8aaa';
        } else {
            // Keep valid data blocks visually filled while "open" so they don't look empty.
            style['backgroundColor'] = color;
            style['color'] = '#ffffff';
            style['borderColor'] = color;
        }
        style['pointerEvents'] = 'none'; // disable pointer events when block is open
        className += ' is-open-block';
    } else {
        style['backgroundColor'] = color;
    }
    if (blockType === 'col-secondary-summary' && columnKey !== 'overall-summary' && !isOpenBlock) {
        style['backgroundColor'] = '#9C9CFF';
        style['border'] = '1px solid #8686E7';
        style['color'] = '#ffffff';
    }

    // Base block element
    const blockElem = (
        <div
            className={className}
            style={style}
            tabIndex={1}
            data-place="bottom"
            data-block-value={blockValue}
            data-block-type={blockType || 'regular'}
            {...(compactedCountTooltip ? { 'data-tip': compactedCountTooltip } : {})}
            onMouseEnter={() => typeof handleBlockMouseEnter === 'function' && handleBlockMouseEnter(colIndex, rowIndex, group, rowGroupKey, summaryRowType)}
            onMouseLeave={handleBlockMouseLeave}
            onClick={()=> !hideCoverageBlock && popover && handleBlockClick(colIndex, rowIndex, group, rowGroupKey, summaryRowType)}>
            {contents}
        </div>
    );

    // If a popover exists, wrap the block in OverlayTrigger
    if (popover) {
        return (
            <OverlayTrigger
                trigger="click"
                placement="bottom"
                overlay={popover}
                rootClose
                flip={true}
                onToggle={(nextShow) => { if (!nextShow) handleBlockClick(null, null, null, null); }}>
                {blockElem}
            </OverlayTrigger>
        );
    }

    return blockElem;
});
Block.propTypes = {
    blockHeight: PropTypes.number.isRequired,
    blockWidth: PropTypes.number.isRequired,
    blockVerticalSpacing: PropTypes.number.isRequired,
    data: PropTypes.oneOfType([PropTypes.object, PropTypes.array]).isRequired,
    parentGrouping: PropTypes.string,
    group: PropTypes.string,
    blockClassName: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    blockRenderedContents: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    blockPopover: PropTypes.oneOfType([PropTypes.string, PropTypes.func]),
    indexInGroup: PropTypes.number,
    colorRanges: PropTypes.arrayOf(PropTypes.shape({
        min: PropTypes.number.isRequired,
        max: PropTypes.number,
        color: PropTypes.string.isRequired
    })),
    summaryBackgroundColor: PropTypes.string,
    handleBlockMouseEnter: PropTypes.func,
    handleBlockMouseLeave: PropTypes.func,
    handleBlockClick: PropTypes.func,
    rowIndex: PropTypes.number,
    colIndex: PropTypes.number,
    rowGroupKey: PropTypes.string,
    columnKey: PropTypes.string,
    summaryRowType: PropTypes.string,
    openBlock: PropTypes.shape({
        rowIdx: PropTypes.number,
        columnIdx: PropTypes.number,
        rowKey: PropTypes.string,
        rowGroupKey: PropTypes.string,
        summaryRowType: PropTypes.string,
    }),
    blockType: PropTypes.oneOf(['regular', 'row-summary', 'col-summary', 'col-secondary-summary'])
};

// Icons for sorting
function FaIcon(props) {
    const { icon, iconClass } = props;
    const className = `fas icon ${icon} ${iconClass}`;
    return (
        <i className={className} style={{ textAlign: 'right' }} />
    );
}
function SortIconDesc(props) {
    return (
        <FaIcon icon="icon-sort-down" iconClass="align-text-top" />
    );
}
function SortIconAsc(props) {
    return (
        <FaIcon icon="icon-sort-up" iconClass="align-bottom" />
    );
}
function SortIconBoth(props) {
    return (
        <FaIcon icon="icon-sort-down" iconClass="align-text-top" />
    );
}

StackedBlockVisual.Row = StackedBlockGroupedRow;
