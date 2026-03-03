'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, ajax, JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { FacetList, generateNextHref } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/FacetList';
import { VisualBody } from './StackedBlockVisual';
import { DataMatrixConfigurator, updateColorRanges } from './DataMatrixConfigurator';
import { Term } from './../../util/Schemas';
import { compareTissueFacetTerms } from '../../util/data';
import { FILE_BROWSE_HIDE_FACETS } from '../../browse/BrowseView';


export default class DataMatrix extends React.PureComponent {

    static isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

    // Simple recursive deep clone that works with objects and arrays
    static deepClone(value) {
        if (Array.isArray(value)) {
            return value.map(DataMatrix.deepClone);
        }
        if (DataMatrix.isPlainObject(value)) {
            return _.mapObject(value, DataMatrix.deepClone);
        }
        return value;
    }

    /**
     * Deeply merges two objects without mutating the original objects.
     * We don't use deepExtend from @hms-dbmi-bgm/shared-portal-components/es/components/util/object since
     * it doesn't handle arrays and also mutates obj1
     * @param {Object} obj1 - The first object to merge.
     * @param {Object} obj2 - The second object to merge.
     * @param {boolean} ignoreCase - Whether to ignore case when matching keys.
     */
    static deepExtend(obj1 = {}, obj2 = {}, ignoreCase = true) {
        // Create a full deep copy of obj1 to ensure it is never mutated
        const result = DataMatrix.deepClone(obj1);
        const lowerKeyMap = ignoreCase ? _.reduce(_.keys(result), (memo, k) => {
            const lk = k.toLowerCase();
            // Preserve first-seen key to keep a stable reference
            if (memo[lk] == null) memo[lk] = k;
            return memo;
        }, {}) : null;

        _.each(obj2, (value, key) => {
            const resolvedKey = (ignoreCase && lowerKeyMap)
                ? (lowerKeyMap[key.toLowerCase()] || key)
                : key;
            const left = result[resolvedKey];

            if (DataMatrix.isPlainObject(value) && DataMatrix.isPlainObject(left)) {
                // If both values are plain objects, merge them recursively
                result[resolvedKey] = DataMatrix.deepExtend(left, value, ignoreCase);
            } else if (Array.isArray(value) && Array.isArray(left)) {
                // Merge arrays, remove duplicates, and ensure a new array reference
                result[resolvedKey] = _.uniq([...left, ...value]);
            } else if (Array.isArray(value)) {
                // Replace with a cloned array to avoid shared references
                result[resolvedKey] = [...value];
            } else if (DataMatrix.isPlainObject(value)) {
                // Replace with a deep copy to avoid shared object references
                result[resolvedKey] = DataMatrix.deepClone(value);
            } else {
                // Override primitive values or non-matching types
                result[resolvedKey] = value;
            }
        });

        return result;
    }

    static DEFAULT_ROW_GROUPS_EXTENDED = {
        Ectoderm: { backgroundColor: '#367151', textColor: '#ffffff', shortName: 'Ecto' },
        Mesoderm: { backgroundColor: '#30975e', textColor: '#ffffff', shortName: 'Meso' },
        Endoderm: { backgroundColor: '#53b27e', textColor: '#ffffff', shortName: 'Endo' },
        'Germ cells': { backgroundColor: '#80c4a0', textColor: '#ffffff', shortName: 'Germ' },
        'Clinically accessible': { backgroundColor: '#70a588', textColor: '#ffffff', shortName: 'Clin' },
    };
    static DEFAULT_COLUMN_GROUPS = {
        "Bulk WGS": {
            "values": ['WGS - Illumina', 'WGS - PacBio', 'Fiber-Seq', 'WGS - Standard ONT', 'WGS - UltraLong ONT'],
            "backgroundColor": "#e04141",
            "textColor": "#ffffff",
            "shortName": "WGS"
        },
        "RNA-seq": {
            "values": ['RNA-Seq - Illumina', 'Kinnex'],
            "backgroundColor": "#ad48ad",
            "textColor": "#ffffff",
            "shortName": "RNA"
        },
        "Duplex-seq": {
            "values": ['NanoSeq', 'CODEC', 'ppmSeq', 'VISTA-Seq', 'CompDuplex-Seq', 'HiDEF-seq'],
            "backgroundColor": "#2b4792",
            "textColor": "#ffffff",
            "shortName": "Dupl"
        },
        "Single-cell WGS": {
            "values": ['PTA-amplified WGS', 'MALBAC-amplified WGS', 'WGS DLP+'],
            "backgroundColor": "#aac536",
            "textColor": "#ffffff",
            "shortName": "scWGS"
        },
        "Targeted Seq": {
            "values": ['HAT-Seq', 'L1-ONT', 'TEnCATS'],
            "backgroundColor": "#e1d567",
            "textColor": "#ffffff",
            "shortName": "Tgtd"
        },
        "Single-cell RNA-Seq": {
            "values": ['snRNA-Seq', 'Slide-tags snRNA-Seq', 'STORM-Seq', 'Tranquil-Seq', '10X Genomics Xenium'],
            "backgroundColor": "#d0b284",
            "textColor": "#ffffff",
            "shortName": "scRNA"
        },
        "Other": {
            "values": ['Hi-C', 'scDip-C', 'Strand-Seq', 'ATAC-Seq', 'NT-Seq', 'varCUT&Tag', 'GoT-ChA'],
            "backgroundColor": "#76cbbe",
            "textColor": "#ffffff"
        },
        "Analysis": {
            "values": ['DSA', 'SNV'],
            "backgroundColor": "#cccccc",
            "textColor": "#000000",
            "shortName": "ANL"
        }
    };
    static DEFAULT_COLUMN_GROUPS_EXTENDED = {
        "Core Assay": {
            "values": ['Bulk WGS', 'RNA-seq', 'Duplex-seq'],
            "backgroundColor": "#a786c2",
            "textColor": "#ffffff"
        },
        "Extended Assay": {
            "values": ['Single-cell WGS', 'Targeted Seq', 'Single-cell RNA-Seq', 'Other', 'Analysis'],
            "backgroundColor": "#d2bde3",
            "textColor": "#ffffff"
        }
    };


    static defaultProps = {
        "query": {
            "url": "/data_matrix_aggregations/?type=File&status=open&limit=all",
            "columnAggFields": ["file_sets.libraries.assay.display_title", "sequencing.sequencer.platform"],
            "rowAggFields": ["donors.display_title", "sample_summary.tissues", "sample_summary.category"]
        },
        "fieldChangeMap": {
            "assay": "file_sets.libraries.assay.display_title",
            "donor": "donors.display_title",
            "tissue": "sample_summary.tissues",
            "germLayer": "sample_summary.category",
            "platform": "sequencing.sequencer.platform",
            "data_type": "data_type",
            "file_format": "file_format.display_title",
            "data_category": "data_category",
            "software": "software.display_title",
            "study": "sample_summary.studies",
            "dataset": "dataset",
        },
        "valueChangeMap": {
            "assay": {
                "scDip-C - Illumina": "scDip-C",
                "CompDuplex-seq - Illumina": "CompDuplex-Seq",
                "Kinnex - PacBio": "Kinnex",
                "Fiber-seq - PacBio": "Fiber-Seq",
                "Fiber-seq - Illumina": "Fiber-Seq",
                "Fiber-seq - ONT": "Fiber-Seq",
                "RNA-seq - Illumina": "RNA-Seq - Illumina",
                "NanoSeq - Illumina": "NanoSeq",
                "ATAC-seq - Illumina": "ATAC-Seq",
                "varCUT&Tag - Illumina": "varCUT&Tag",
                "VISTA-seq - Illumina": "VISTA-Seq",
                "scVISTA-seq - Illumina": "VISTA-Seq",
                "Microbulk VISTA-seq - Illumina": "VISTA-Seq",
                "CODEC - Illumina": "CODEC",
                "Single-cell MALBAC WGS - ONT": "MALBAC-amplified WGS",
                "Single-cell MALBAC WGS - Illumina": "MALBAC-amplified WGS",
                "Single-cell PTA WGS - ONT": "PTA-amplified WGS",
                "Single-cell PTA WGS - Illumina": "PTA-amplified WGS",
                "TEnCATS - ONT": "TEnCATS",
                "WGS - ONT": "WGS - Standard ONT",
                "Ultra-Long WGS - ONT": "WGS - UltraLong ONT",
                "HiDEF-seq - Illumina": "HiDEF-seq",
                "HiDEF-seq - PacBio": "HiDEF-seq",
                "Hi-C - Illumina": "Hi-C",
                "Hi-C - PacBio": "Hi-C",
                "Hi-C - ONT": "Hi-C",
            },
            "tissue": {
                "endocrine pancreas": "Endocrine pancreas",
            },
            "study": {
                "Benchmarking": "Donors"
            },
            "donor": {
                "colo829t": "COLO829T",
                "colo829bl": "COLO829BL",
                "colo829blt_50to1": "COLO829BLT50",
                "colo829blt_in_silico": "In silico BLT50",
                "colo829_snv_indel_challenge_data": "Truth Set",
                "hapmap": "HapMap Mixture",
                "mei_detection_challenge_data": "Downsampled",
                "lb_fibroblast": "LB-LA2 Fibroblast",
                "lb_ipsc_1": "LB-LA2 iPSC-1",
                "lb_ipsc_2": "LB-LA2 iPSC-2",
                "lb_ipsc_4": "LB-LA2 iPSC-4",
                "lb_ipsc_52": "LB-LA2 iPSC-52",
                "lb_ipsc_60": "LB-LA2 iPSC-60",
                "ipsc_snv_indel_challenge_data": "Truth Set",
            }
        },
        "resultItemPostProcessFuncKey": null, // function to process result item after they are loaded
        "resultTransformedPostProcessFuncKey": null, // function to process result items array for e.g. DSA transformation
        "browseFilteringTransformFuncKey": null, // function to transform filtering properties when browsing files
        "groupingProperties": ["donor", "tissue"], // properties to group by in the matrix
        "columnGrouping": "assay",
        "headerFor": <h3 className="mt-2 mb-0 text-300">SMaHT</h3>,
        "fallbackNameForBlankField": "None",
        /** Which state to set/prioritize if multiple files per group */
        "statePrioritizationForGroups": [],
        "headerPadding": 200,
        "columnGroups": DataMatrix.DEFAULT_COLUMN_GROUPS,
        "showColumnGroups": true,
        "columnGroupsExtended": DataMatrix.DEFAULT_COLUMN_GROUPS_EXTENDED,
        "showColumnGroupsExtended": false,
        "rowGroups": null,
        "showRowGroups": false,
        "autoPopulateRowGroupsProperty": null,
        "rowGroupsExtended": DataMatrix.DEFAULT_ROW_GROUPS_EXTENDED,
        "showRowGroupsExtended": true,
        "autoPopulateRowGroupsExtendedMapFields": { 
            key: "germLayer",
            value: "tissue"
        },
        "additionalPopoverData": {
            "COLO829T":{
                "secondary": "Melanoma",
                "secondaryCategory": "Ectoderm"
            },
            "COLO829BL": {
                "secondary": "Blood",
                "secondaryCategory": "Mesoderm"
            },
            "HapMap Mixture": {
                "secondary": "Blood",
                "secondaryCategory": "Mesoderm"
            }
        },
        "titleMap": {},
        "columnSubGroupingOrder": [],
        "colorRangeBaseColor": "#47adff", // color hex or rgba code (if set, will override colorRanges)
        "colorRangeSegments": 5, // split color ranges into 5 equal parts
        "colorRangeSegmentStep": 20, // step size for each segment
        "summaryBackgroundColor": "#ececff",
        "xAxisLabel": "Assay",
        "yAxisLabel": "Donor",
        "showAxisLabels": true,
        "showColumnSummary": true,
        "defaultOpen": false,
        "valueDelimiter": " - ",
        "disableConfigurator": true,
        "idLabel": "",
        "onDataLoaded": null,
        // allowedFields is for the configurator
        "allowedFields": [
            "donors.display_title",
            "sequencing.sequencer.display_title",
            "file_sets.libraries.assay.display_title",
            "sample_summary.tissues",
            "data_type",
            "file_format.display_title",
            "data_category",
            "software.display_title",
            "sequencing.sequencer.platform",
            "sample_summary.studies",
            "dataset",
        ],
        "baseBrowseFilesPath": "/browse/",
        "showCountFor": false,
        "showFacetTermsPanel": false,
        "facetTermsPanelFields": null,
        "excludePrimaryColumnNoValue": true,
    };

    static propTypes = {
        'query': PropTypes.shape({
            'url': PropTypes.string,
            'columnAggFields': PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired, // can be a single string or composite value
            'rowAggFields': PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])).isRequired // array element can be a single string or composite value
        }),
        'valueChangeMap': PropTypes.object,
        'fieldChangeMap': PropTypes.object,
        'resultItemPostProcessFuncKey': PropTypes.string, // function key to process results after they are loaded
        'resultTransformedPostProcessFuncKey': PropTypes.string, // function key to process result items array for e.g. DSA transformation
        'browseFilteringTransformFuncKey': PropTypes.string, // function key to transform filtering properties when browsing files
        'groupingProperties': PropTypes.arrayOf(PropTypes.string),
        'columnGrouping': PropTypes.string,
        'headerFor': PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
        'fallbackNameForBlankField': PropTypes.string,
        'statePrioritizationForGroups': PropTypes.arrayOf(PropTypes.string),
        'headerPadding': PropTypes.number,
        'titleMap': PropTypes.object,
        'columnSubGroupingOrder': PropTypes.arrayOf(PropTypes.string),
        'colorRangeBaseColor': PropTypes.string,
        'colorRangeSegments': PropTypes.number,
        'colorRangeSegmentStep': PropTypes.number,
        'summaryBackgroundColor': PropTypes.string,
        'columnGroups': PropTypes.object,
        'showColumnGroups': PropTypes.bool,
        'columnGroupsExtended': PropTypes.object,
        'showColumnGroupsExtended': PropTypes.bool,
        'rowGroups': PropTypes.object,
        'showRowGroups': PropTypes.bool,
        'autoPopulateRowGroupsProperty': PropTypes.string,
        'rowGroupsExtended': PropTypes.object,
        'showRowGroupsExtended': PropTypes.bool,
        'autoPopulateRowGroupsExtendedMapFields': PropTypes.shape({
            'key': PropTypes.string,
            'value': PropTypes.string
        }),
        'additionalPopoverData': PropTypes.object,
        'xAxisLabel': PropTypes.string,
        'yAxisLabel': PropTypes.string,
        'showAxisLabels': PropTypes.bool,
        'showColumnSummary': PropTypes.bool,
        'defaultOpen': PropTypes.bool,
        'valueDelimiter': PropTypes.string,
        'disableConfigurator': PropTypes.bool,
        'idLabel': PropTypes.string,
        'onDataLoaded': PropTypes.func,
        'schemas': PropTypes.object,
        'allowedFields': PropTypes.arrayOf(PropTypes.string),
        'baseBrowseFilesPath': PropTypes.string,
        'showCountFor': PropTypes.bool,
        'showFacetTermsPanel': PropTypes.bool,
        'facetTermsPanelFields': PropTypes.arrayOf(PropTypes.string),
        'excludePrimaryColumnNoValue': PropTypes.bool
    };

    static parseQuery(queryString) {
        const params = queryString.split('&');
        const result = {};

        const decodeQueryParam = function (p) {
            return decodeURIComponent(p.replace(/\+/g, " "));
        };

        params.forEach((param) => {
            let key, value;

            // If the parameter contains '!=', split on that operator
            if (param.includes('!=')) {
                // Split by '!=' and then append the operator back to the key
                [key, value] = param.split('!=');
                key = decodeQueryParam(key) + '!';
                value = decodeQueryParam(value);
            } else {
                // Otherwise split on '=' as usual
                [key, value] = param.split('=');
                key = decodeQueryParam(key);
                value = decodeQueryParam(value);
            }

            // If the same key already exists, convert or append to an array
            if (key in result) {
                if (Array.isArray(result[key])) {
                    result[key].push(value);
                } else {
                    result[key] = [result[key], value];
                }
            } else {
                // Otherwise just set the value
                result[key] = value;
            }
        });

        return result;
    }

    getColorRanges({ colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep }) {
        let colorRanges = [];
        for (let i = 0; i < colorRangeSegments; i++) {
            const min = i * colorRangeSegmentStep + 1;
            const max = (i < colorRangeSegments - 1) ? (i + 1) * colorRangeSegmentStep : undefined;
            colorRanges.push({ min, max, color: colorRangeBaseColor });
        }
        colorRanges = updateColorRanges(colorRanges, colorRangeBaseColor, -100);
        return colorRanges;
    }

    constructor(props) {
        super(props);
        this.loadSearchQueryResults = this.loadSearchQueryResults.bind(this);
        this.onApplyConfiguration = this.onApplyConfiguration.bind(this);
        this.getJsxExport = this.getJsxExport.bind(this);
        this.isProductionEnv = this.isProductionEnv.bind(this);
        this.onCountForChange = this.onCountForChange.bind(this);
        this.onFacetFilter = this.onFacetFilter.bind(this);
        this.onFacetFilterMultiple = this.onFacetFilterMultiple.bind(this);
        this.onFacetClearFilters = this.onFacetClearFilters.bind(this);

        const colorRanges = this.getColorRanges(props);

        this.state = {
            "mounted": false,
            "_results": null,
            "query": props.query,
            "baseRowAggFields": props.query && props.query.rowAggFields ? props.query.rowAggFields : null,
            "fieldChangeMap": props.fieldChangeMap,
            "columnGrouping": props.columnGrouping,
            "groupingProperties": props.groupingProperties,
            "baseGroupingProperties": props.groupingProperties,
            "colorRanges": colorRanges,
            "columnGroups": props.columnGroups,
            "showColumnGroups": props.showColumnGroups,
            "columnGroupsExtended": props.columnGroupsExtended,
            "showColumnGroupsExtended": props.showColumnGroupsExtended,
            "rowGroups": props.rowGroups,
            "showRowGroups": props.showRowGroups,
            "autoPopulateRowGroupsProperty": props.autoPopulateRowGroupsProperty,
            "rowGroupsExtended": props.rowGroupsExtended,
            "showRowGroupsExtended": props.showRowGroupsExtended,
            "xAxisLabel": props.xAxisLabel,
            "yAxisLabel": props.yAxisLabel,
            "showAxisLabels": props.showAxisLabels,
            "showColumnSummary": props.showColumnSummary,
            "colorRangeBaseColor": props.colorRangeBaseColor,
            "colorRangeSegments": props.colorRangeSegments,
            "colorRangeSegmentStep": props.colorRangeSegmentStep,
            "summaryBackgroundColor": props.summaryBackgroundColor,
            "defaultOpen": props.defaultOpen,
            "countFor": "files",
            "facetsForPanel": [],
            "facetFiltersForPanel": [],
            "facetNavigationHref": props.query && props.query.url ? props.query.url : null
        };
    }

    componentDidMount() {
        this.setState({ "mounted": true, "totalFiles": "N/A" });
        this.loadSearchQueryResults();
    }

    componentDidUpdate(pastProps, pastState) {
        const { session } = this.props;
        const { query, fieldChangeMap, columnGrouping, groupingProperties, showColumnSummary, defaultOpen, countFor } = this.state;
        if (session !== pastProps.session ||
            !_.isEqual(query, pastState.query) ||
            !_.isEqual(fieldChangeMap, pastState.fieldChangeMap) ||
            columnGrouping !== pastState.columnGrouping ||
            !_.isEqual(groupingProperties, pastState.groupingProperties) ||
            showColumnSummary !== pastState.showColumnSummary ||
            defaultOpen !== pastState.defaultOpen ||
            countFor !== pastState.countFor ||
            this.state.facetNavigationHref !== pastState.facetNavigationHref) {
            this.loadSearchQueryResults();
        }
    }

    onFacetFilter(facet, term, callback) {
        const { query, facetNavigationHref, facetFiltersForPanel } = this.state;
        const currentHref = facetNavigationHref || (query && query.url) || '';
        const currentFilters = facetFiltersForPanel || [];
        const nextHref = generateNextHref(currentHref, currentFilters, facet, term);
        this.setState({ facetNavigationHref: nextHref }, () => {
            if (typeof callback === 'function') callback();
        });
    }

    onFacetFilterMultiple(filterObjArr = [], callback = null) {
        const { query, facetNavigationHref, facetFiltersForPanel } = this.state;
        let nextHref = facetNavigationHref || (query && query.url) || '';
        const currentFilters = facetFiltersForPanel || [];

        if (!Array.isArray(filterObjArr) || filterObjArr.length === 0) {
            if (typeof callback === 'function') callback();
            return;
        }

        filterObjArr.forEach((obj) => {
            const { facet, term } = obj || {};
            if (!facet || !term) return;
            nextHref = generateNextHref(nextHref, currentFilters, facet, term);
        });

        this.setState({ facetNavigationHref: nextHref }, () => {
            if (typeof callback === 'function') callback();
        });
    }

    onFacetClearFilters(e = null, callback = null) {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        const baseHref = (this.state.query && this.state.query.url) || null;
        this.setState({ facetNavigationHref: baseHref }, () => {
            if (typeof callback === 'function') callback();
        });
    }

    /* Transform DSA entries by:
        1) For each group defined by groupingProperties, compute:
            diff_files = row_totals.counts.files - all.counts.files
        2) For each dsa entry, set counts.files = diff_files for its group (if exists)
        3) Merge dsa entries by groupingProperties:
            - counts.files: take from any row (they should all be equal after step 2)
            - other fields: distinct values; single => scalar, multiple => array
    */
    static transformDSA(nonDsaData, row_totals, dsaData, groupingProperties, columnGrouping) {
        const getFilesCount = (row) => Number(row && row.counts && row.counts.files) || 0;

        // Helper: build a grouping key like "COLO829BL||No value"
        const makeGroupKey = (row) =>
            groupingProperties.map((prop) => String(row[prop])).join('||');

        // 1) Compute group totals from row_totals
        const rowTotalsByGroup = {};
        for (const row of row_totals) {
            const key = makeGroupKey(row);
            const files = getFilesCount(row);
            rowTotalsByGroup[key] = (rowTotalsByGroup[key] || 0) + files;
        }

        // 2) Compute group totals from all
        const allTotalsByGroup = {};
        for (const row of nonDsaData) {
            const key = makeGroupKey(row);
            const files = getFilesCount(row);
            allTotalsByGroup[key] = (allTotalsByGroup[key] || 0) + files;
        }

        // 3) For each group, compute the difference
        const diffFilesByGroup = {};
        Object.keys(rowTotalsByGroup).forEach((key) => {
            const rowTotals = rowTotalsByGroup[key] || 0;
            const allTotals = allTotalsByGroup[key] || 0;
            diffFilesByGroup[key] = rowTotals - allTotals;
        });

        // 4) First-pass transform of dsa entries
        const newDsa = dsaData.map((row) => {
            const key = makeGroupKey(row);
            const diffFiles = diffFilesByGroup[key];

            return {
                ...row,
                // If we have a diff for this group, use it; otherwise keep original value
                counts: {
                    ...(row.counts || {}),
                    files: typeof diffFiles === 'number' ? diffFiles : getFilesCount(row),
                },
                // Overwrite the columnGrouping field with "DSA"
                [columnGrouping]: 'DSA',
            };
        });

        // 5) SECOND PASS: merge dsa rows by groupingProperties
        //    - Same donor+tissue => single row
        //    - counts.files: take from any row (they should all be equal)
        //    - other fields: distinct values; single => scalar, multiple => array

        // Group rows by groupingProperties key
        const dsaGrouped = {};
        for (const row of newDsa) {
            const key = makeGroupKey(row);
            if (!dsaGrouped[key]) {
                dsaGrouped[key] = [];
            }
            dsaGrouped[key].push(row);
        }

        // Merge rows inside each group
        const mergedDsa = Object.values(dsaGrouped).map((rowsInGroup) => {
            const firstRow = rowsInGroup[0];
            const mergedRow = {};

            // Iterate over all fields of the first row (assuming schema is consistent)
            for (const field of Object.keys(firstRow)) {
                if (field === 'counts') {
                    // Rule 1: counts.files value is same; take from one row
                    mergedRow[field] = firstRow[field];
                } else {
                    // Rule 2: collect distinct values for this field across group
                    const values = Array.from(
                        new Set(rowsInGroup.map((r) => r[field]))
                    );

                    // If only one distinct value, store as scalar, otherwise as array
                    mergedRow[field] = values.length === 1 ? values[0] : values;
                }
            }

            return mergedRow;
        });

        // 6) Return new object, keeping all and row_totals unchanged
        return mergedDsa;
    }

    static transformSNV(filteredData, groupingProperties, columnGrouping) {
        const getFilesCount = (row) => Number(row && row.counts && row.counts.files) || 0;
        const getCoverageCount = (row) => Number(row && row.counts && row.counts.total_coverage) || 0;
        const makeGroupKey = (row) =>
            groupingProperties.map((prop) => String(row[prop])).join('||');

        const snvGrouped = {};
        for (const row of filteredData) {
            const key = makeGroupKey(row);
            if (!snvGrouped[key]) {
                snvGrouped[key] = [];
            }
            snvGrouped[key].push(row);
        }

        return Object.values(snvGrouped).map((rowsInGroup) => {
            const firstRow = rowsInGroup[0];
            const mergedRow = {};

            for (const field of Object.keys(firstRow)) {
                if (field === 'counts') {
                    mergedRow[field] = {
                        ...(firstRow[field] || {}),
                        files: rowsInGroup.reduce((sum, row) => sum + getFilesCount(row), 0),
                        total_coverage: rowsInGroup.reduce((sum, row) => sum + getCoverageCount(row), 0)
                    };
                } else {
                    const values = Array.from(new Set(rowsInGroup.map((r) => r[field])));
                    mergedRow[field] = values.length === 1 ? values[0] : values;
                }
            }

            mergedRow[columnGrouping] = 'SNV';
            return mergedRow;
        });
    }

    loadSearchQueryResults() {

        const commonCallback = (result) => {
            const {
                valueChangeMap,
                resultItemPostProcessFuncKey,
                resultTransformedPostProcessFuncKey,
                onDataLoaded,
                autoPopulateRowGroupsExtendedMapFields
            } = this.props;
            const {
                fieldChangeMap,
                groupingProperties,
                columnGrouping,
                autoPopulateRowGroupsProperty,
                rowGroupsExtended
            } = this.state;
            const resultKey = "_results";
            const updatedState = {};

            let transformedData = { all: [], row_totals: [], column_totals: [] };
            const populatedRowGroups = {}; // not implemented yet
            // Helper to process each result row
            const processResultRow = (r, transformed) => {
                let cloned = _.clone(r);
                if (fieldChangeMap) {
                    _.forEach(_.pairs(fieldChangeMap), ([fieldToMapTo, fieldToMapFrom]) => {
                        if (typeof cloned[fieldToMapFrom] !== 'undefined' && fieldToMapTo !== fieldToMapFrom) {
                            cloned[fieldToMapTo] = cloned[fieldToMapFrom];
                            delete cloned[fieldToMapFrom];
                        }
                    });
                }
                if (resultItemPostProcessFuncKey && typeof DataMatrix.resultItemPostProcessFuncs[resultItemPostProcessFuncKey] === 'function') {
                    cloned = DataMatrix.resultItemPostProcessFuncs[resultItemPostProcessFuncKey](cloned);
                }
                if (cloned.counts && cloned.counts.files && cloned.counts.files > 0) {
                    if (valueChangeMap) {
                        _.forEach(_.pairs(valueChangeMap), ([field, changeMap]) => {
                            if (typeof cloned[field] === 'string') {
                                cloned[field] = changeMap[cloned[field]] || cloned[field];
                            }
                        });
                    }
                    transformed.push(cloned);
                }
                if (autoPopulateRowGroupsProperty && cloned[autoPopulateRowGroupsProperty]) {
                    const rowGroupKey = cloned[autoPopulateRowGroupsProperty];
                    if (!populatedRowGroups[rowGroupKey]) {
                        populatedRowGroups[rowGroupKey] = [];
                    }
                    populatedRowGroups[rowGroupKey].push(cloned[groupingProperties[0]]);
                }
            };

            const processColumnTotal = (r, transformed) => {
                let cloned = _.clone(r);
                if (fieldChangeMap) {
                    _.forEach(_.pairs(fieldChangeMap), ([fieldToMapTo, fieldToMapFrom]) => {
                        if (typeof cloned[fieldToMapFrom] !== 'undefined' && fieldToMapTo !== fieldToMapFrom) {
                            cloned[fieldToMapTo] = cloned[fieldToMapFrom];
                            delete cloned[fieldToMapFrom];
                        }
                    });
                }
                if (valueChangeMap) {
                    _.forEach(_.pairs(valueChangeMap), ([field, changeMap]) => {
                        if (typeof cloned[field] === 'string') {
                            cloned[field] = changeMap[cloned[field]] || cloned[field];
                        }
                    });
                }
                transformed.push(cloned);
            };

            //result = resultItemPostProcessFuncKey && this.isLocalEnv() ? BENCHMARKING_TEST_DATA : PRODUCTION_TEST_DATA;

            _.forEach(result.data, (r) => processResultRow(r, transformedData.all));
            _.forEach(result.row_totals, (r) => processResultRow(r, transformedData.row_totals));
            if (Array.isArray(result.column_totals)) {
                _.forEach(result.column_totals, (r) => processColumnTotal(r, transformedData.column_totals));
            }

            if (resultTransformedPostProcessFuncKey && typeof DataMatrix.resultTransformedPostProcessFuncs[resultTransformedPostProcessFuncKey] === 'function') {
                transformedData = DataMatrix.resultTransformedPostProcessFuncs[resultTransformedPostProcessFuncKey](transformedData, groupingProperties, columnGrouping);
            }

            updatedState[resultKey] = transformedData;
            updatedState['overallCounts'] = result.counts || null;
            updatedState['facetsForPanel'] = result.facets || [];
            updatedState['facetFiltersForPanel'] = result.filters || [];
            // sum files in transformedData array
            let totalFiles = 0;
            _.forEach(transformedData.row_totals, (r) => {
                if (r.counts && typeof r.counts.files === 'number') {
                    totalFiles += r.counts.files;
                }
            });
            updatedState['totalFiles'] = totalFiles;

            //extend existing rowGroupsExtended from transformed data using mapping fields  
            if (autoPopulateRowGroupsExtendedMapFields && autoPopulateRowGroupsExtendedMapFields.key && autoPopulateRowGroupsExtendedMapFields.value) {
                //get [key]: [value array] mapping
                const autoPopulateMap = {};
                _.forEach(transformedData.all, (r) => {
                    const mapKey = r[autoPopulateRowGroupsExtendedMapFields.key];
                    const mapValue = r[autoPopulateRowGroupsExtendedMapFields.value];
                    if (mapKey && mapValue) {
                        if (!autoPopulateMap[mapKey]) {
                            autoPopulateMap[mapKey] = new Set();
                        }
                        autoPopulateMap[mapKey].add(mapValue);
                    }
                });
                //convert Set to values array
                _.forEach(_.keys(autoPopulateMap), (k) => {
                    autoPopulateMap[k] = {
                        values: Array.from(autoPopulateMap[k])
                    };
                });
                
                updatedState['rowGroupsExtended'] = DataMatrix.deepExtend(rowGroupsExtended, autoPopulateMap);
            }

            this.setState(updatedState, () => ReactTooltip.rebuild());
            if (typeof onDataLoaded === 'function') {
                onDataLoaded({
                    hasData: totalFiles > 0,
                    totalFiles,
                    query: this.state.query,
                    results: transformedData
                });
            }
        };

        const commonFallback = (result) => {
            const { onDataLoaded } = this.props;

            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = false;
            updatedState['facetsForPanel'] = [];
            updatedState['facetFiltersForPanel'] = [];
            this.setState(updatedState);
            if (typeof onDataLoaded === 'function') {
                onDataLoaded({
                    hasData: false,
                    totalFiles: 0,
                    query: this.state.query,
                    results: null,
                    error: result
                });
            }
        };

        const {
            query: { url: requestUrl, columnAggFields: propColumnAggFields, rowAggFields: propRowAggFields },
            fieldChangeMap,
            autoPopulateRowGroupsProperty
        } = this.state;
        this.setState(
            { "_results": null }, // (Re)Set all result states to 'null'
            () => {
                const { valueDelimiter = ' ', excludePrimaryColumnNoValue = true } = this.props;
                const activeHref = this.state.facetNavigationHref || requestUrl;
                const [url, baseQueryString = ''] = requestUrl.split('?');
                const [, activeQueryString = ''] = activeHref.split('?');
                const baseQueryParamsByUrl = baseQueryString ? DataMatrix.parseQuery(baseQueryString) : {};
                const activeQueryParamsByUrl = activeQueryString ? DataMatrix.parseQuery(activeQueryString) : {};

                const mergeQueryParamsKeepingBase = (baseParams = {}, activeParams = {}) => {
                    const merged = _.clone(activeParams);
                    _.forEach(baseParams, (baseValue, key) => {
                        const baseValues = Array.isArray(baseValue) ? baseValue : [baseValue];
                        const activeValue = merged[key];
                        const activeValues = typeof activeValue === 'undefined'
                            ? []
                            : (Array.isArray(activeValue) ? activeValue : [activeValue]);
                        merged[key] = _.uniq([...(activeValues || []), ...baseValues]);
                    });
                    return merged;
                };

                const queryParamsByUrl = mergeQueryParamsKeepingBase(baseQueryParamsByUrl, activeQueryParamsByUrl);

                const colAggFields = Array.isArray(propColumnAggFields) ? propColumnAggFields : [propColumnAggFields];
                const rowAggFields = [];

                if (Array.isArray(propRowAggFields)) {
                    _.forEach(propRowAggFields, function (f) {
                        if (typeof f === 'string' || (Array.isArray(f) && f.length == 1)) {
                            rowAggFields.push(typeof f === 'string' ? f : f[0]);
                        } else {
                            rowAggFields.push(f);
                        }
                    });
                } else {
                    rowAggFields.push(propRowAggFields);
                };

                if (typeof requestUrl !== 'string' || !requestUrl) return;

                const searchQueryParams = { field: [], type: 'File', limit: 'all' };

                _.forEach(rowAggFields || [], function (f, idx) {
                    if (typeof f === 'string') {
                        searchQueryParams.field.push(f);
                    } else {
                        searchQueryParams.field.push(...f);
                    }
                });
                _.forEach(colAggFields || [], function (f, idx) {
                    searchQueryParams.field.push(f);
                    if (excludePrimaryColumnNoValue && idx === 0 && !queryParamsByUrl[f]) {
                        searchQueryParams[f + '!'] = "No value";
                    }
                });

                //add additional field to populate row groups
                if (autoPopulateRowGroupsProperty) {
                    if (fieldChangeMap[autoPopulateRowGroupsProperty]) {
                        rowAggFields.push(fieldChangeMap[autoPopulateRowGroupsProperty]);
                    }
                }

                const requestBody = {
                    "search_query_params": _.extend({}, searchQueryParams, queryParamsByUrl),
                    "column_agg_fields": colAggFields,
                    "row_agg_fields": rowAggFields,
                    "flatten_values": true
                };
                if (valueDelimiter && typeof valueDelimiter === 'string') {
                    requestBody['value_delimiter'] = valueDelimiter;
                }
                // Exclude 'Authorization' header for requests to different domains (not allowed).
                const excludedHeaders = (requestUrl.slice(0, 4) === 'http') ? ['Authorization', 'Content-Type'] : null;
                ajax.load(url, (r) => commonCallback(r), 'POST', (r) => commonFallback(r), JSON.stringify(requestBody), {}, excludedHeaders);
            }
        );
    }

    onApplyConfiguration({
        searchUrl, columnAggField, rowAggField1, rowAggField2, rowAggField3,
        columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
        rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
        xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
        colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep, summaryBackgroundColor, defaultOpen }) {
        console.log(
            searchUrl, columnAggField, rowAggField1, rowAggField2,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended, rowGroupsExtended, showRowGroupsExtended,
            xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
            colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep, summaryBackgroundColor, defaultOpen);

        const newColorRanges = this.getColorRanges({ colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep });
        const invertedFieldChangeMap = _.invert(this.state.fieldChangeMap);
        const newColumnGrouping = columnAggField ? invertedFieldChangeMap[columnAggField[0]] : null;
        const newGroupingProperties = Array.isArray(rowAggField2) && rowAggField2.length > 0 ? [invertedFieldChangeMap[rowAggField1[0]], invertedFieldChangeMap[rowAggField2[0]]] : [invertedFieldChangeMap[rowAggField1[0]]];

        const rowAggFields = [rowAggField1, rowAggField2, rowAggField3].filter((f) => f && f.length > 0).map((f) => Array.isArray(f) ? f : [f]);
        this.setState((prevState) => {
            return {
                ...prevState,
                query: {
                    ...prevState.query,
                    url: searchUrl,
                    columnAggFields: columnAggField,
                    rowAggFields: rowAggFields
                },
                facetNavigationHref: searchUrl,
                columnGrouping: newColumnGrouping,
                groupingProperties: newGroupingProperties,
                columnGroups: columnGroups,
                showColumnGroups: showColumnGroups,
                columnGroupsExtended: columnGroupsExtended,
                showColumnGroupsExtended: showColumnGroupsExtended,
                rowGroups: rowGroups,
                showRowGroups: showRowGroups,
                rowGroupsExtended: rowGroupsExtended,
                showRowGroupsExtended: showRowGroupsExtended,
                summaryBackgroundColor: summaryBackgroundColor,
                xAxisLabel: xAxisLabel,
                yAxisLabel: yAxisLabel,
                showAxisLabels: showAxisLabels,
                showColumnSummary: showColumnSummary,
                defaultOpen: defaultOpen,
                colorRanges: newColorRanges,
                colorRangeBaseColor: colorRangeBaseColor,
                colorRangeSegments: colorRangeSegments,
                colorRangeSegmentStep: colorRangeSegmentStep,
            };
        });
    }

    onCountForChange(e) {
        const nextValue = e && e.target ? e.target.value : 'files';
        this.setState((prevState) => {
            const nextState = { countFor: nextValue };
            const baseRowAggFields = prevState.baseRowAggFields || (prevState.query && prevState.query.rowAggFields) || [];
            const baseGroupingProperties = prevState.baseGroupingProperties || prevState.groupingProperties || [];
            const baseColorRangeBaseColor = prevState.colorRangeBaseColor;

            if (nextValue === 'donors') {
                nextState.query = {
                    ...prevState.query,
                    rowAggFields: (baseRowAggFields || []).filter((f) => {
                        if (Array.isArray(f)) {
                            return !f.includes('donors.display_title');
                        }
                        return f !== 'donors.display_title';
                    })
                };
                nextState.groupingProperties = (baseGroupingProperties || []).filter((p) => p !== 'donor');
                nextState.colorRanges = this.getColorRanges({
                    colorRangeBaseColor: '#9B5DE0',
                    colorRangeSegments: prevState.colorRangeSegments,
                    colorRangeSegmentStep: prevState.colorRangeSegmentStep
                });
            } else {
                nextState.query = {
                    ...prevState.query,
                    rowAggFields: baseRowAggFields
                };
                nextState.groupingProperties = baseGroupingProperties;
                nextState.colorRanges = this.getColorRanges({
                    colorRangeBaseColor: baseColorRangeBaseColor,
                    colorRangeSegments: prevState.colorRangeSegments,
                    colorRangeSegmentStep: prevState.colorRangeSegmentStep
                });
            }

            return nextState;
        });
    }

    getAllowedPropKeys() {
        return Object.keys(DataMatrix.propTypes);
    }

    getJsxExport() {
        const allowedKeys = Object.keys(DataMatrix.propTypes);
        const { ...props } = this.props;
        const { ...state } = this.state;
        const filteredProps = allowedKeys.reduce((acc, key) => {
            acc[key] = state[key] ?? props[key];
            return acc;
        }, {});

        const propLines = Object.entries(filteredProps).map(([key, value]) => {
            if (typeof value === 'string') {
                return `  ${key}="${value}"`;
            } else {
                return `  ${key}={${JSON.stringify(value)}}`;
            }
        });

        // add fixed props
        propLines.push(`  key="data-matrix-key"`);
        propLines.push(`  session={session}`);

        return `<DataMatrix\n${propLines.join('\n')}\n/>`;
    }

    isAdminUser() {
        const userGroups = JWT.getUserGroups() || null;
        return userGroups && userGroups.indexOf('admin') >= 0;
    }

    isProductionEnv() {
        if (window && window.location && window.location.href) {
            return window.location.href.indexOf('data.smaht.org') >= 0 ||
                window.location.href.indexOf('staging.smaht.org') >= 0 ||
                window.location.href.indexOf('devtest.smaht.org') >= 0;
        }
        return false;
    }

    isLocalEnv() {
        if (window && window.location && window.location.href) {
            return window.location.href.indexOf('localhost') >= 0 ||
                window.location.href.indexOf('127.0.0.1') >= 0;
        }
        return false;
    }

    render() {
        const {
            headerFor, valueChangeMap, allowedFields, valueDelimiter,
            disableConfigurator = false, idLabel = '', additionalPopoverData = {},
            baseBrowseFilesPath, browseFilteringTransformFuncKey, showCountFor,
            showFacetTermsPanel, facetTermsPanelFields
        } = this.props;
        const {
            query, fieldChangeMap, columnGrouping, groupingProperties,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
            colorRanges, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
            colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep, summaryBackgroundColor,
            defaultOpen = false, totalFiles, countFor, overallCounts, facetsForPanel, facetFiltersForPanel
        } = this.state;

        const effectiveYAxisLabel = countFor === 'donors' ? 'Tissue' : yAxisLabel;

        const isLoading =
            // eslint-disable-next-line react/destructuring-assignment
            this.state['_results'] === null && query && query.url !== null && typeof query.url !== 'undefined';

        if (isLoading) {
            return (
                <div>
                    <div className="text-center mt-5 mb-5" style={{ fontSize: '2rem', opacity: 0.5 }}>
                        <i className="mt-3 icon icon-spin icon-circle-notch fas" />
                    </div>
                </div>
            );
        }

        const resultKey = "_results";
        const bodyProps = {
            query, groupingProperties, fieldChangeMap, valueChangeMap, columnGrouping, colorRanges,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended, additionalPopoverData,
            summaryBackgroundColor, xAxisLabel, yAxisLabel: effectiveYAxisLabel, showAxisLabels, showColumnSummary, valueDelimiter,
            baseBrowseFilesPath,
            activeFacetHref: this.state.facetNavigationHref || query?.url || null,
            countFor,
            overallCounts,
            ...(countFor === 'total_coverage' ? { blockWidth: 60, blockHorizontalExtend: 10 } : {}),
            browseFilteringTransformFunc: browseFilteringTransformFuncKey ? DataMatrix.browseFilteringTransformFuncs[browseFilteringTransformFuncKey] : null
        };

        const colAgg = Array.isArray(query.columnAggFields) ? query.columnAggFields : [query.columnAggFields];
        const rowAgg1 = Array.isArray(query.rowAggFields[0]) ? query.rowAggFields[0] : [query.rowAggFields[0]];
        const rowAgg2 = query.rowAggFields.length > 1 ? Array.isArray(query.rowAggFields[1]) ? query.rowAggFields[1] : [query.rowAggFields[1]] : null;
        const rowAgg3 = query.rowAggFields.length > 2 ? Array.isArray(query.rowAggFields[2]) ? query.rowAggFields[2] : [query.rowAggFields[2]] : null;

        const fieldToNameMap = _.invert(fieldChangeMap);

        const configurator = !disableConfigurator && this.isAdminUser() && !this.isProductionEnv() && (
            <DataMatrixConfigurator
                dimensions={allowedFields}
                fieldToNameMap={fieldToNameMap}
                searchUrl={query.url}
                initialColumnAggField={colAgg}
                initialRowAggField1={rowAgg1}
                initialRowAggField2={rowAgg2}
                initialRowAggField3={rowAgg3}
                initialColumnGroups={columnGroups}
                initialShowColumnGroups={showColumnGroups}
                initialColumnGroupsExtended={columnGroupsExtended}
                initialShowColumnGroupsExtended={showColumnGroupsExtended}
                initialRowGroups={rowGroups}
                initialShowRowGroups={showRowGroups}
                initialRowGroupsExtended={rowGroupsExtended}
                initialShowRowGroupsExtended={showRowGroupsExtended}
                initialSummaryBackgroundColor={summaryBackgroundColor}
                initialXAxisLabel={xAxisLabel}
                initialYAxisLabel={yAxisLabel}
                initialShowAxisLabels={showAxisLabels}
                initialShowColumnSummary={showColumnSummary}
                initialDefaultOpen={defaultOpen}
                initialColorRangeBaseColor={colorRangeBaseColor}
                initialColorRangeSegments={colorRangeSegments}
                initialColorRangeSegmentStep={colorRangeSegmentStep}
                onApply={this.onApplyConfiguration}
                onJsxExport={this.getJsxExport}
            />
        );

        const body = (
            <div className="w-100">
                {configurator}
                {headerFor || null}
                {(showCountFor || showFacetTermsPanel) ? (() => {
                    const isTissueMatrix = countFor === 'donors';
                    const isCoverageView = countFor === 'total_coverage';
                    const showCountsPanel = showCountFor && !isTissueMatrix;
                    const showFacetsPanel = showFacetTermsPanel;
                    const showLeftPanel = showCountsPanel || showFacetsPanel;

                    return (
                        <div className="matrix-mode-layout">
                            {showCountFor ? (
                                <div className="matrix-mode-tabs mb-2">
                                    <button
                                        type="button"
                                        className={`matrix-mode-tab ${!isTissueMatrix ? 'active' : ''}`}
                                        onClick={() => this.onCountForChange({ target: { value: isCoverageView ? 'total_coverage' : 'files' } })}>
                                        <i className="icon fas icon-user me-05" /> Donor x Assay Matrix
                                    </button>
                                    <button
                                        type="button"
                                        className={`matrix-mode-tab ${isTissueMatrix ? 'active' : ''}`}
                                        onClick={() => this.onCountForChange({ target: { value: 'donors' } })}>
                                        <i className="icon fas icon-lungs me-05" /> Tissue x Assay Matrix
                                    </button>
                                </div>
                            ) : null}
                            <div className="matrix-mode-body d-flex">
                                {showLeftPanel ? (
                                <div className={`matrix-counts-panel ${showFacetTermsPanel ? 'has-facets-panel' : ''}`}>
                                    {showCountsPanel ? (
                                        <React.Fragment>
                                        <div className="matrix-counts-title">Counts</div>
                                        <div className="matrix-counts-toggle">
                                            <IconToggle
                                                options={[
                                                    {
                                                        title: (
                                                            <React.Fragment>
                                                                <i className="icon fas icon-file me-1" /> File View
                                                            </React.Fragment>
                                                        ),
                                                        dataTip: 'Toggle file count view',
                                                        btnCls: 'w-100 btn-sm',
                                                        onClick: () => this.onCountForChange({ target: { value: 'files' } })
                                                    },
                                                    {
                                                        title: (
                                                            <React.Fragment>
                                                                <i className="icon fas icon-stream me-1" /> Coverage View
                                                            </React.Fragment>
                                                        ),
                                                        dataTip: 'Toggle coverage view',
                                                        btnCls: 'w-100 btn-sm',
                                                        onClick: () => this.onCountForChange({ target: { value: 'total_coverage' } })
                                                    }
                                                ]}
                                                activeIdx={isCoverageView ? 1 : 0}
                                                divCls="view-toggle p-1"
                                            />
                                        </div>
                                        </React.Fragment>
                                    ) : null}
                                    {showFacetsPanel ? (() => {
                                            const includedFacetFields = Array.isArray(facetTermsPanelFields) && facetTermsPanelFields.length > 0
                                                ? new Set(facetTermsPanelFields)
                                                : null;
                                            const hideFacetFields = new Set(FILE_BROWSE_HIDE_FACETS || []);
                                            hideFacetFields.add('type');
                                            const visibleFacets = _.filter(facetsForPanel || [], (facet) => {
                                                if (!facet || !facet.field || !Array.isArray(facet.terms) || facet.terms.length === 0) {
                                                    return false;
                                                }
                                                if (hideFacetFields.has(facet.field)) {
                                                    return false;
                                                }
                                                if (!includedFacetFields) {
                                                    return true;
                                                }
                                                return includedFacetFields.has(facet.field);
                                            });

                                            if (visibleFacets.length === 0) {
                                                return null;
                                            }

                                            return (
                                                <div className="matrix-facet-terms-panel mt-1 search-view-controls-and-results">
                                                    <FacetList
                                                        facets={visibleFacets}
                                                        context={{ filters: facetFiltersForPanel || [] }}
                                                        termTransformFxn={Term.toName}
                                                        facetListSortFxns={{ 'sample_summary.tissues': compareTissueFacetTerms }}
                                                        title="Properties"
                                                        showClearFiltersButton={false}
                                                        onClearFilters={this.onFacetClearFilters}
                                                        onFilter={this.onFacetFilter}
                                                        onFilterMultiple={this.onFacetFilterMultiple}
                                                        maxFacetsBodyHeight={340}
                                                        href={this.state.facetNavigationHref || query?.url || null}
                                                        schemas={this.props.schemas || null}
                                                    />
                                                </div>
                                            );
                                        })() : null}
                                </div>
                                ) : null}
                                <div className="matrix-visual-panel flex-grow-1">
                                    <VisualBody
                                        {..._.pick(this.props, 'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
                                        {...bodyProps}
                                        columnSubGrouping=""// leave blank for now
                                        // eslint-disable-next-line react/destructuring-assignment
                                        results={this.state[resultKey]}
                                        defaultDepthsOpen={[defaultOpen, false, false]}
                                        // keysToInclude={[]}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })() : (
                    <VisualBody
                        {..._.pick(this.props, 'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
                        {...bodyProps}
                        columnSubGrouping=""// leave blank for now
                        // eslint-disable-next-line react/destructuring-assignment
                        results={this.state[resultKey]}
                        defaultDepthsOpen={[defaultOpen, false, false]}
                        // keysToInclude={[]}
                    />
                )}
            </div>
        );
        return (
            <div id={`data-matrix-for_${idLabel}`} className="data-matrix" data-files-count={totalFiles}>
                <div className="row">
                    {body}
                </div>
            </div>
        );
    }
}
// hack for overcoming the react-jsx-parser's function props
DataMatrix.resultItemPostProcessFuncs = {
    "cellLinePostProcess": function (result) {
        if (result.dataset && result.donor && result.dataset !== 'tissue') {
            result.donor = result.dataset;
            result.primary_field_override = "dataset";

            if (typeof result.assay !== 'undefined' && typeof result.platform !== 'undefined') {
                if (result.assay.indexOf('Hi-C - ') !== -1 && result.platform !== 'Illumina') {
                    result.counts = { ...(result.counts || {}), files: 0 };
                }
                if (result.assay.indexOf('Fiber-seq - ') !== -1 && result.platform !== 'PacBio') {
                    result.counts = { ...(result.counts || {}), files: 0 };
                }
                if (result.assay.indexOf('Ultra-Long WGS - ') !== -1 && result.platform !== 'ONT') {
                    result.counts = { ...(result.counts || {}), files: 0 };
                }
            }
        }
        return result;
    }
};
DataMatrix.resultTransformedPostProcessFuncs = {
    "analysisDerivedColumns": function (data, groupingProperties, columnGrouping) {
        const dsaData = data.all.filter((row) => row['data_type'] === 'DSA' || row['data_type'] === 'Chain File' || row['data_type'] === 'Sequence Interval');
        const nonDsaData = data.all.filter((row) => row['data_type'] !== 'DSA' && row['data_type'] !== 'Chain File' && row['data_type'] !== 'Sequence Interval');
        const snvData = nonDsaData.filter((row) => row['analysis_details'] === 'Filtered');
        const nonDsaNonSnvData = nonDsaData.filter((row) => row['analysis_details'] !== 'Filtered');

        const transformedDsa = DataMatrix.transformDSA(nonDsaData, data.row_totals, dsaData, groupingProperties, columnGrouping);
        const transformedSnv = DataMatrix.transformSNV(snvData, groupingProperties, columnGrouping);

        return {
            ...data,
            all: nonDsaNonSnvData.concat(transformedDsa).concat(transformedSnv)
        };
    }
};
DataMatrix.browseFilteringTransformFuncs = {
    "analysisDerivedColumns": function (filteringProperties, blockType) {
        const assayField = 'file_sets.libraries.assay.display_title';
        const hasAssayFilter = typeof filteringProperties[assayField] !== 'undefined';
        const studies = filteringProperties['sample_summary.studies'];
        const studiesList = Array.isArray(studies) ? studies : (typeof studies === 'string' ? [studies] : []);
        const isProductionStudy = studiesList.includes('Production');

        if (filteringProperties[assayField] === 'DSA') {
            // extend data_type filter to include Chain File along with DSA
            filteringProperties['data_type'] = [...(filteringProperties['data_type'] || []), 'DSA', 'Chain File', 'Sequence Interval'];
            delete filteringProperties[assayField];
        } else if (filteringProperties[assayField] === 'SNV') {
            filteringProperties['analysis_details'] = [...(filteringProperties['analysis_details'] || []), 'Filtered'];
            filteringProperties['data_type!'] = [...(filteringProperties['data_type!'] || []), 'DSA', 'Chain File', 'Sequence Interval'];
            delete filteringProperties[assayField];
        } else if (
            (blockType === 'regular') ||
            ((blockType === 'col-summary' || blockType === 'col-secondary-summary') && hasAssayFilter)
        ) {
            // for non-DSA columns we exclude DSA-related data types;
            // for overall summary (no assay filter) keep all data types.
            filteringProperties['data_type!'] = [...(filteringProperties['data_type!'] || []), 'DSA', 'Chain File', 'Sequence Interval'];
            if (isProductionStudy) {
                filteringProperties['analysis_details!'] = [...(filteringProperties['analysis_details!'] || []), 'Filtered'];
            }
        }
        return filteringProperties;
    }
};
