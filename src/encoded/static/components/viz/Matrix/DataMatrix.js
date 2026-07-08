'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { Dropdown } from 'react-bootstrap';
import { console, ajax, JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { FacetList, generateNextHref } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/FacetList';
import { toPng } from 'html-to-image';
import { VisualBody, buildMatrixExportData } from './StackedBlockVisual';
import { DataMatrixConfigurator, updateColorRanges } from './DataMatrixConfigurator';
import { Term } from './../../util/Schemas';
import { compareTissueFacetTerms } from '../../util/data';
import { FILE_BROWSE_HIDE_FACETS } from '../../browse/BrowseView';
import { termTransformFxnWithOverrides } from '../../browse/SearchView';

export function isLocalEnv() {
    if (typeof window !== 'undefined' && window.location && window.location.href) {
        return window.location.href.indexOf('localhost') >= 0 ||
            window.location.href.indexOf('127.0.0.1') >= 0;
    }
    return false;
}

export default class DataMatrix extends React.PureComponent {

    static DONOR_TISSUE_ALL_ASSAYS = 'All';

    static MATRIX_MODES = {
        DONOR_ASSAY: 'donor_assay',
        TISSUE_ASSAY: 'tissue_assay',
        DONOR_TISSUE: 'donor_tissue'
    };

    // State keys that make up a loaded tab's rendered result, snapshotted into
    // (and restored from) the per-tab cache. Deliberately excludes mode-derived
    // display config (query, grouping, countFor, colorRanges, axis labels), which
    // getNextStateForMatrixMode re-derives on every tab switch.
    static TAB_CACHE_STATE_KEYS = [
        '_results',
        'availableDonorTissueAssays',
        'columnGroups',
        'donorTissueAssay',
        'overallCounts',
        'rawRegularCountOverrides',
        'rowGroupsExtended',
        'rowSummaryCountsByGroup',
        'totalFiles',
        'facetsForPanel',
        'facetFiltersForPanel'
    ];

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
            "values": ['WGS - Illumina', 'WGS - PacBio', 'WGS - Standard ONT', 'WGS - UltraLong ONT', 'WGS - Element AVITI', 'Fiber-Seq'],
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
            "values": ['DSA', 'Variant Call Sets'],
            "backgroundColor": "#821881",
            "textColor": "#ffffff",
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
    static DEFAULT_DONOR_TISSUE_COLUMN_GROUPS = DataMatrix.deepClone(DataMatrix.DEFAULT_ROW_GROUPS_EXTENDED);
    static DEFAULT_DONOR_TISSUE_ASSAY_OPTIONS = _.uniq(_.flatten(_.map(DataMatrix.DEFAULT_COLUMN_GROUPS, ({ values = [] }) => values)));


    static defaultProps = {
        "query": {
            "url": "/data_matrix_aggregations/?type=File&status=open&limit=all",
            "columnAggFields": ["assays.display_title", "sequencers.platform"],
            "rowAggFields": ["donors.display_title", "sample_summary.tissues", "sample_summary.category"]
        },
        "fieldChangeMap": {
            "assay": "assays.display_title",
            "donor": "donors.display_title",
            "tissue": "sample_summary.tissues",
            "germLayer": "sample_summary.category",
            "platform": "sequencers.platform",
            "data_type": "data_type",
            "analysis_details": "analysis_details",
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
                "WGS - Element": "WGS - Element AVITI",
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
        "headerPadding": 180,
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
        "colorRangeSegmentStep": 20, // step size for each files/donor segment
        "coverageColorRangeSegmentStep": 200, // step size for each coverage segment
        "summaryBackgroundColor": "#ececff",
        "xAxisLabel": "Assay",
        "yAxisLabel": "Donor",
        "showAxisLabels": true,
        "showColumnSummary": true,
        "defaultOpen": false,
        "defaultExpandedRowIndices": null,
        "valueDelimiter": " - ",
        "disableConfigurator": true,
        "idLabel": "",
        "onDataLoaded": null,
        "debugLoadingDelayMs": 0,
        // allowedFields is for the configurator
        "allowedFields": [
            "donors.display_title",
            "sequencers.display_title",
            "assays.display_title",
            "sample_summary.tissues",
            "data_type",
            "file_format.display_title",
            "data_category",
            "software.display_title",
            "sequencers.platform",
            "sample_summary.studies",
            "dataset",
        ],
        "baseBrowseFilesPath": "/browse/",
        "showCountFor": false,
        "showMatrixModeTabs": true,
        "showUniqueDonorsAssayBand": true,
        "dedupeBenchmarkingDsaAcrossTissues": false,
        "showFacetTermsPanel": false,
        "facetTermsPanelFields": null,
        "excludePrimaryColumnNoValue": true,
        "autoPopulateColumnGroupsMapFields": null,
        "donorTissueColumnGroups": DataMatrix.DEFAULT_DONOR_TISSUE_COLUMN_GROUPS,
        "donorTissueShrinkEmptyColumns": false,
        "donorTissueAssayOptions": DataMatrix.DEFAULT_DONOR_TISSUE_ASSAY_OPTIONS,
        "initialMatrixMode": DataMatrix.MATRIX_MODES.DONOR_ASSAY,
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
        'coverageColorRangeSegmentStep': PropTypes.number,
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
        'defaultExpandedRowIndices': PropTypes.arrayOf(PropTypes.number),
        'valueDelimiter': PropTypes.string,
        'disableConfigurator': PropTypes.bool,
        'idLabel': PropTypes.string,
        'onDataLoaded': PropTypes.func,
        'debugLoadingDelayMs': PropTypes.number,
        'schemas': PropTypes.object,
        'allowedFields': PropTypes.arrayOf(PropTypes.string),
        'baseBrowseFilesPath': PropTypes.string,
        'showCountFor': PropTypes.bool,
        'showMatrixModeTabs': PropTypes.bool,
        'showUniqueDonorsAssayBand': PropTypes.bool,
        'dedupeBenchmarkingDsaAcrossTissues': PropTypes.bool,
        'showFacetTermsPanel': PropTypes.bool,
        'facetTermsPanelFields': PropTypes.arrayOf(PropTypes.string),
        'excludePrimaryColumnNoValue': PropTypes.bool,
        'autoPopulateColumnGroupsMapFields': PropTypes.shape({
            'key': PropTypes.string,
            'value': PropTypes.string
        }),
        'donorTissueColumnGroups': PropTypes.object,
        'donorTissueShrinkEmptyColumns': PropTypes.bool,
        'donorTissueAssayOptions': PropTypes.arrayOf(PropTypes.string),
        'initialMatrixMode': PropTypes.oneOf(_.values(DataMatrix.MATRIX_MODES))
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

    static serializeQuery(params = {}) {
        const parts = [];
        _.each(params, (value, key) => {
            if (typeof value === 'undefined' || value === null) return;
            const values = Array.isArray(value) ? value : [value];
            values.forEach((singleValue) => {
                if (typeof singleValue === 'undefined' || singleValue === null) return;
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(singleValue)}`);
            });
        });
        return parts.join('&');
    }

    static getMappedAssayDisplayValue(row = {}, valueChangeMap = {}, forceCombineWithPlatform = false) {
        if (!row || typeof row.assay === 'undefined' || row.assay === null) {
            return null;
        }
        const assayValueChangeMap = valueChangeMap?.assay || {};
        const assayValue = row.assay;
        const platformValue = row.platform;
        const assayAlreadyIncludesPlatform = typeof assayValue === 'string' && assayValue.indexOf(' - ') > -1;
        const assayWithPlatform = (forceCombineWithPlatform && platformValue && !assayAlreadyIncludesPlatform)
            ? `${assayValue} - ${platformValue}`
            : assayValue;

        return assayValueChangeMap[assayWithPlatform]
            || assayValueChangeMap[assayValue]
            || assayWithPlatform;
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

    getColorRangeSegmentStepForCountFor(countFor, state = this.state) {
        if (countFor === 'total_coverage') {
            return state.coverageColorRangeSegmentStep;
        }
        return state.colorRangeSegmentStep;
    }

    constructor(props) {
        super(props);
        this.loadSearchQueryResults = this.loadSearchQueryResults.bind(this);
        this.onApplyConfiguration = this.onApplyConfiguration.bind(this);
        this.getJsxExport = this.getJsxExport.bind(this);
        this.isProductionEnv = this.isProductionEnv.bind(this);
        this.onCountForChange = this.onCountForChange.bind(this);
        this.onMatrixModeChange = this.onMatrixModeChange.bind(this);
        this.onRefreshActiveTab = this.onRefreshActiveTab.bind(this);
        this.getTabCacheSignature = this.getTabCacheSignature.bind(this);
        this.onDonorTissueAssayChange = this.onDonorTissueAssayChange.bind(this);
        this.onExportJson = this.onExportJson.bind(this);
        this.onExportScreenshot = this.onExportScreenshot.bind(this);
        this.matrixCaptureEl = null;
        this.onFacetFilter = this.onFacetFilter.bind(this);
        this.onFacetFilterMultiple = this.onFacetFilterMultiple.bind(this);
        this.onFacetClearFilters = this.onFacetClearFilters.bind(this);

        const colorRanges = this.getColorRanges(props);
        const normalizedInitialMatrixMode = _.values(DataMatrix.MATRIX_MODES).includes(props.initialMatrixMode)
            ? props.initialMatrixMode
            : DataMatrix.MATRIX_MODES.DONOR_ASSAY;
        const initialState = {
            "mounted": false,
            "isFetching": false,
            "isScreenshotting": false,
            "_results": null,
            "query": props.query,
            "baseRowAggFields": props.query && props.query.rowAggFields ? props.query.rowAggFields : null,
            "baseColumnAggFields": props.query && props.query.columnAggFields ? props.query.columnAggFields : null,
            "fieldChangeMap": props.fieldChangeMap,
            "columnGrouping": props.columnGrouping,
            "baseColumnGrouping": props.columnGrouping,
            "groupingProperties": props.groupingProperties,
            "baseGroupingProperties": props.groupingProperties,
            "colorRanges": colorRanges,
            "columnGroups": props.columnGroups,
            "baseColumnGroups": props.columnGroups,
            "showColumnGroups": props.showColumnGroups,
            "baseShowColumnGroups": props.showColumnGroups,
            "columnGroupsExtended": props.columnGroupsExtended,
            "baseColumnGroupsExtended": props.columnGroupsExtended,
            "showColumnGroupsExtended": props.showColumnGroupsExtended,
            "baseShowColumnGroupsExtended": props.showColumnGroupsExtended,
            "rowGroups": props.rowGroups,
            "showRowGroups": props.showRowGroups,
            "autoPopulateRowGroupsProperty": props.autoPopulateRowGroupsProperty,
            "rowGroupsExtended": props.rowGroupsExtended,
            "baseRowGroupsExtended": props.rowGroupsExtended,
            "showRowGroupsExtended": props.showRowGroupsExtended,
            "baseShowRowGroupsExtended": props.showRowGroupsExtended,
            "xAxisLabel": props.xAxisLabel,
            "baseXAxisLabel": props.xAxisLabel,
            "yAxisLabel": props.yAxisLabel,
            "baseYAxisLabel": props.yAxisLabel,
            "showAxisLabels": props.showAxisLabels,
            "showColumnSummary": props.showColumnSummary,
            "colorRangeBaseColor": props.colorRangeBaseColor,
            "baseColorRangeBaseColor": props.colorRangeBaseColor,
            "colorRangeSegments": props.colorRangeSegments,
            "colorRangeSegmentStep": props.colorRangeSegmentStep,
            "coverageColorRangeSegmentStep": props.coverageColorRangeSegmentStep,
            "summaryBackgroundColor": props.summaryBackgroundColor,
            "defaultOpen": props.defaultOpen,
            "countFor": "files",
            // Distinguishes full shell loading (matrix mode switch) from inline refreshes (count toggles).
            "loadingContext": null,
            "matrixMode": normalizedInitialMatrixMode,
            "donorTissueAssay": DataMatrix.DONOR_TISSUE_ALL_ASSAYS,
            "availableDonorTissueAssays": [],
            "facetsForPanel": [],
            "facetFiltersForPanel": [],
            "facetNavigationHref": props.query && props.query.url ? props.query.url : null
        };
        if (normalizedInitialMatrixMode !== DataMatrix.MATRIX_MODES.DONOR_ASSAY) {
            Object.assign(initialState, this.getNextStateForMatrixMode(normalizedInitialMatrixMode, initialState));
        }
        this.latestLoadRequestId = 0;
        this.loadingDelayTimeout = null;
        // Per-tab (matrix-mode) response cache: switching back to an already
        // loaded tab restores instantly instead of re-fetching. One entry per
        // mode, guarded by a signature over the non-tab fetch inputs (filters /
        // session / base query), so a filter change invalidates it. The Refresh
        // control bypasses it via loadSearchQueryResults({ forceRefresh: true }).
        this.tabCache = {};
        this.state = initialState;
    }

    componentWillUnmount() {
        if (this.loadingDelayTimeout) {
            clearTimeout(this.loadingDelayTimeout);
            this.loadingDelayTimeout = null;
        }
    }

    componentDidMount() {
        this.setState({ "mounted": true, "totalFiles": "N/A" });
        this.loadSearchQueryResults();
    }

    componentDidUpdate(pastProps, pastState) {
        const { session } = this.props;
        const { query, fieldChangeMap, columnGrouping, groupingProperties, showColumnSummary, defaultOpen, countFor } = this.state;
        const countForChanged = countFor !== pastState.countFor;
        const isCoverageToggleOnly =
            countForChanged &&
            ((countFor === 'files' && pastState.countFor === 'total_coverage') ||
                (countFor === 'total_coverage' && pastState.countFor === 'files'));
        const shouldFetchForCountForChange = countForChanged && !isCoverageToggleOnly;
        if (isCoverageToggleOnly) {
            ReactTooltip.rebuild();
        }
        if (session !== pastProps.session ||
            !_.isEqual(query, pastState.query) ||
            !_.isEqual(fieldChangeMap, pastState.fieldChangeMap) ||
            columnGrouping !== pastState.columnGrouping ||
            !_.isEqual(groupingProperties, pastState.groupingProperties) ||
            showColumnSummary !== pastState.showColumnSummary ||
            defaultOpen !== pastState.defaultOpen ||
            shouldFetchForCountForChange ||
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
        this.setState((prevState) => {
            return { facetNavigationHref: (prevState.query && prevState.query.url) || null };
        }, () => {
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
    static transformDSA(
        nonDsaData,
        row_totals,
        dsaData,
        groupingProperties,
        derivedField = 'assay',
        useAssayFamilyCount = false,
        dsaCountStrategy = 'diff'
    ) {
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

        // Build a per-group fallback from raw DSA rows.
        // This avoids overcount when row_totals is exploded by additional dimensions
        // (e.g. donor+tissue with assay/platform/data_type expansions).
        const maxDsaFilesByGroup = {};
        const dsaFilesByGroupAndType = {};
        for (const row of dsaData) {
            const key = makeGroupKey(row);
            const files = getFilesCount(row);
            maxDsaFilesByGroup[key] = Math.max(maxDsaFilesByGroup[key] || 0, files);
            const dataType = String(row?.data_type || 'No value');
            if (!dsaFilesByGroupAndType[key]) {
                dsaFilesByGroupAndType[key] = {};
            }
            dsaFilesByGroupAndType[key][dataType] = Math.max(dsaFilesByGroupAndType[key][dataType] || 0, files);
        }

        // 4) First-pass transform of dsa entries
        const newDsa = dsaData.map((row) => {
            const key = makeGroupKey(row);
            const diffFiles = diffFilesByGroup[key];
            const maxDsaFiles = maxDsaFilesByGroup[key];
            const dsaByTypeTotal = _.reduce(dsaFilesByGroupAndType[key] || {}, (sum, filesByType) => sum + (Number(filesByType) || 0), 0);
            const resolvedFiles = dsaCountStrategy === 'max_dsa_row'
                ? (dsaByTypeTotal || (typeof maxDsaFiles === 'number' ? maxDsaFiles : getFilesCount(row)))
                : (typeof diffFiles === 'number' ? diffFiles : getFilesCount(row));

            return {
                ...row,
                // If we have a diff for this group, use it; otherwise keep original value
                counts: {
                    ...(row.counts || {}),
                    files: resolvedFiles,
                },
                [derivedField]: 'DSA',
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
            const derivedAssayFamilyCount = useAssayFamilyCount
                ? _.chain(rowsInGroup)
                    .pluck('_derivedAssayFamily')
                    .compact()
                    .uniq()
                    .value().length
                : 0;

            // Iterate over all fields of the first row (assuming schema is consistent)
            for (const field of Object.keys(firstRow)) {
                if (field === 'counts') {
                    mergedRow[field] = {
                        ...(firstRow[field] || {}),
                        files: useAssayFamilyCount ? (derivedAssayFamilyCount || getFilesCount(firstRow)) : getFilesCount(firstRow)
                    };
                } else if (field === '_derivedAssayFamily') {
                    continue;
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

    static transformSNV(filteredData, groupingProperties, derivedField = 'assay') {
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

            mergedRow[derivedField] = 'Variant Call Sets';
            return mergedRow;
        });
    }

    /**
     * Some backend rows can arrive with assay label missing ("No value").
     * In donor x tissue view, leaving these rows as-is creates hidden buckets
     * that are counted in "All" but are not selectable in assay dropdown.
     *
     * We remap those rows into visible logical assay buckets:
     * - DSA-like data types -> "DSA"
     * - Variant-call-like rows -> "Variant Call Sets"
     */
    static normalizeMissingAssayBucket(row = null, derivedField = 'assay') {
        if (!row || typeof row !== 'object') return row;
        const assayValue = row[derivedField];
        const isMissingAssay = !assayValue || assayValue === 'No value' || assayValue === 'No value - No value';
        if (!isMissingAssay) return row;

        const dataType = row?.data_type;
        const analysisDetails = row?.analysis_details;
        const dsaDataTypes = new Set(['DSA', 'Chain File', 'Sequence Interval']);
        const isVariantLikeDataType = typeof dataType === 'string' && /(SNV|Indel)/i.test(dataType);
        const isVariantLikeAnalysis = analysisDetails === 'Filtered' || analysisDetails === 'Phased';

        if (dsaDataTypes.has(dataType)) {
            return { ...row, [derivedField]: 'DSA' };
        }

        if (isVariantLikeDataType || isVariantLikeAnalysis) {
            return { ...row, [derivedField]: 'Variant Call Sets' };
        }

        return row;
    }

    /**
     * Ensure assay value is a single comparable string.
     *
     * Why:
     * - During transform/merge, assay can become an array.
     * - Filtering logic and dropdown matching require a scalar string.
     *
     * Rule:
     * - If array => pick first non-empty string.
     * - If string => keep as-is.
     * - Otherwise => null.
     */
    static normalizeAssayToSingleValue(assayValue) {
        if (Array.isArray(assayValue)) {
            const firstValid = _.find(assayValue, (v) => typeof v === 'string' && v.trim() !== '');
            return firstValid || null;
        }
        return typeof assayValue === 'string' ? assayValue : null;
    }

    static buildRawRegularCountOverrides(rows = [], groupingProperties = [], columnGrouping = null, { dedupeBenchmarkingDsaAcrossTissues = false } = {}) {
        if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(groupingProperties) || !columnGrouping) {
            return {};
        }

        return _.reduce(rows, (memo, row) => {
            const columnValue = row?.[columnGrouping];
            const files = Number(row?.counts?.files) || 0;
            const dataTypes = _.chain([row?.data_type])
                .flatten()
                .compact()
                .map((value) => String(value))
                .value();
            const isDsaLikeRow = _.some(dataTypes, (dataType) =>
                dataType === 'DSA' || dataType === 'Chain File' || dataType === 'Sequence Interval'
            );
            if (!columnValue || files <= 0) {
                return memo;
            }

            // Keep raw assay totals for normal columns, but do not leak DSA-like rows
            // back into their parent assay cells. DSA continues to use its own derived path.
            if (isDsaLikeRow && columnValue !== 'DSA') {
                return memo;
            }

            const pathValues = [];
            for (let depth = 0; depth < groupingProperties.length; depth++) {
                const groupingField = groupingProperties[depth];
                const groupingValue = row?.[groupingField];
                if (groupingValue == null || groupingValue === '') {
                    break;
                }
                pathValues.push(String(groupingValue));
                const pathKey = pathValues.join('||');
                if (!memo[depth]) {
                    memo[depth] = {};
                }
                if (!memo[depth][pathKey]) {
                    memo[depth][pathKey] = {};
                }
                const currentValue = memo[depth][pathKey][String(columnValue)] || 0;
                // Benchmarking DSA-like files can be linked to multiple tissues for the
                // same donor. Keep the donor-level override de-duplicated by taking the
                // largest per-child bucket instead of summing repeated references.
                if (dedupeBenchmarkingDsaAcrossTissues && isDsaLikeRow && depth === 0) {
                    memo[depth][pathKey][String(columnValue)] = Math.max(currentValue, files);
                } else {
                    memo[depth][pathKey][String(columnValue)] = currentValue + files;
                }
            }

            return memo;
        }, {});
    }

    loadSearchQueryResults(options = {}) {
        const { forceRefresh = false } = options;
        const requestId = ++this.latestLoadRequestId;
        // Serve from the per-tab cache when this tab was already loaded under the
        // same filter/session context. Runs before any fetch; bumping requestId
        // above also cancels the commit of any in-flight request for the old tab.
        // React flushes this setState before paint (it happens within
        // componentDidUpdate), so a cached tab switch shows no loading flash.
        if (!forceRefresh) {
            const cached = this.tabCache[this.state.matrixMode];
            if (cached && cached.signature === this.getTabCacheSignature()) {
                this.setState(
                    { ...cached.state, isFetching: false, loadingContext: null },
                    () => ReactTooltip.rebuild()
                );
                return;
            }
        }
        const {
            valueChangeMap,
            resultItemPostProcessFuncKey,
            resultTransformedPostProcessFuncKey,
            onDataLoaded,
            debugLoadingDelayMs = 0,
            autoPopulateRowGroupsExtendedMapFields,
            autoPopulateColumnGroupsMapFields,
            dedupeBenchmarkingDsaAcrossTissues = false
        } = this.props;
        const {
            query: { url: requestUrl, columnAggFields: propColumnAggFields, rowAggFields: propRowAggFields },
            fieldChangeMap,
            groupingProperties,
            columnGrouping,
            rowGroups,
            autoPopulateRowGroupsProperty,
            rowGroupsExtended,
            columnGroups,
            matrixMode
        } = this.state;
        const commonCallback = (result) => {
            if (requestId !== this.latestLoadRequestId) {
                return;
            }
            const resultKey = "_results";
            const updatedState = {};

            let transformedData = { all: [], row_totals: [], column_totals: [] };
            const rawProcessedAllRows = [];
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
                if (cloned.counts && Number(cloned.counts.files) > 0) {
                    if (typeof cloned.assay === 'string') {
                        cloned._derivedAssayFamily = (valueChangeMap?.assay || {})[cloned.assay] || cloned.assay;
                    }
                    if (typeof cloned.assay === 'string') {
                        cloned.assay = DataMatrix.getMappedAssayDisplayValue(
                            cloned,
                            valueChangeMap,
                            matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE
                        );
                    }
                    // These safeguards are donor x tissue specific.
                    // Applying them globally can change donor/cell-line assay rollups.
                    if (matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE) {
                        // Keep assay as scalar to avoid "array assay" rows silently missing
                        // from dropdown filtering and summary calculations.
                        cloned.assay = DataMatrix.normalizeAssayToSingleValue(cloned.assay);
                        cloned = DataMatrix.normalizeMissingAssayBucket(cloned, 'assay');
                        if (typeof cloned.assay === 'string') {
                            cloned._derivedAssayFamily = cloned.assay;
                        }
                    }
                    if (valueChangeMap) {
                        _.forEach(_.pairs(valueChangeMap), ([field, changeMap]) => {
                            if (field === 'assay') return;
                            if (typeof cloned[field] === 'string') {
                                cloned[field] = changeMap[cloned[field]] || cloned[field];
                            }
                        });
                    }
                    transformed.push(cloned);
                    if (transformed === transformedData.all) {
                        rawProcessedAllRows.push(_.clone(cloned));
                    }
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
                const cloned = _.clone(r);
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

            // result = resultItemPostProcessFuncKey ? BENCHMARKING_TEST_DATA : (matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE ? PRODUCTION_TEST_DATA_DT : (matrixMode === DataMatrix.MATRIX_MODES.DONOR_ASSAY ? PRODUCTION_TEST_DATA_DA : PRODUCTION_TEST_DATA_TA));

            _.forEach(result.data, (r) => processResultRow(r, transformedData.all));
            _.forEach(result.row_totals, (r) => processResultRow(r, transformedData.row_totals));
            if (Array.isArray(result.column_totals)) {
                _.forEach(result.column_totals, (r) => processColumnTotal(r, transformedData.column_totals));
            }

            if (resultTransformedPostProcessFuncKey && typeof DataMatrix.resultTransformedPostProcessFuncs[resultTransformedPostProcessFuncKey] === 'function') {
                transformedData = DataMatrix.resultTransformedPostProcessFuncs[resultTransformedPostProcessFuncKey](transformedData, groupingProperties, columnGrouping);
            }

            updatedState[resultKey] = transformedData;
            updatedState['isFetching'] = false;
            updatedState['loadingContext'] = null;
            updatedState['overallCounts'] = result.counts || null;
            updatedState['facetsForPanel'] = result.facets || [];
            updatedState['facetFiltersForPanel'] = result.filters || [];
            // Build row-summary overrides from backend facet counts.
            // Benchmarking uses two different row-group sections:
            // - cell lines should summarize by dataset
            // - benchmarking donors should summarize by donor
            // Keep the summary map section-aware so those rows can diverge.
            const buildFacetSummaryCounts = (facetField, valueMap = null) => {
                const facet = _.findWhere(result.facets || [], { field: facetField });
                return facet && Array.isArray(facet.terms)
                    ? _.reduce(facet.terms, (memo, term) => {
                        const key = valueMap?.[term?.key] || term?.key;
                        if (!key || key === 'No value') return memo;
                        memo[key] = { files: Number(term?.doc_count) || 0 };
                        return memo;
                    }, {})
                    : null;
            };
            const donorSummaryCounts = buildFacetSummaryCounts('donors.display_title', valueChangeMap?.donor || {});
            const datasetSummaryCounts = buildFacetSummaryCounts('dataset', valueChangeMap?.donor || {});
            const hasRowGroups = rowGroups && _.keys(rowGroups).length > 0;
            if (hasRowGroups) {
                const rowGroupSummaryCounts = {};
                _.forEach(rowGroups, (rowGroupConfig, rowGroupKey) => {
                    const customUrlParams = rowGroupConfig?.customUrlParams || '';
                    const usesDonorSummary = typeof customUrlParams === 'string' && customUrlParams.indexOf('dataset=tissue') >= 0;
                    const summaryCounts = usesDonorSummary
                        ? donorSummaryCounts
                        : datasetSummaryCounts;
                    if (summaryCounts) {
                        rowGroupSummaryCounts[rowGroupKey] = usesDonorSummary
                            ? { donor: summaryCounts }
                            : { dataset: summaryCounts };
                    }
                });
                updatedState['rowSummaryCountsByGroup'] = _.keys(rowGroupSummaryCounts).length > 0 ? rowGroupSummaryCounts : null;
            } else {
                updatedState['rowSummaryCountsByGroup'] = donorSummaryCounts ? { donor: donorSummaryCounts } : null;
            }
            updatedState['rawRegularCountOverrides'] = DataMatrix.buildRawRegularCountOverrides(
                dedupeBenchmarkingDsaAcrossTissues ? transformedData.all : rawProcessedAllRows,
                groupingProperties,
                columnGrouping,
                { dedupeBenchmarkingDsaAcrossTissues }
            );
            const availableDonorTissueAssays = _.uniq(_.compact(_.map(transformedData.all, (r) => r.assay)));
            updatedState['availableDonorTissueAssays'] = availableDonorTissueAssays;
            // Keep top-level included-properties count aligned with backend search context.
            // Note: backend may return numeric-looking strings; coerce before deciding fallback.
            // Fallback to aggregated rows only if backend count is truly unavailable.
            const backendTotalFiles = Number(result?.counts?.files);
            const totalFiles = Number.isFinite(backendTotalFiles)
                ? backendTotalFiles
                : _.reduce(transformedData.all, (sum, r) => sum + (Number(r?.counts?.files) || 0), 0);
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

            const effectiveAutoPopulateColumnGroupsMapFields = autoPopulateColumnGroupsMapFields ||
                (matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE ? { key: 'germLayer', value: 'tissue' } : null);

            if (effectiveAutoPopulateColumnGroupsMapFields && effectiveAutoPopulateColumnGroupsMapFields.key && effectiveAutoPopulateColumnGroupsMapFields.value) {
                const autoPopulateMap = {};
                _.forEach(transformedData.all, (r) => {
                    const mapKey = r[effectiveAutoPopulateColumnGroupsMapFields.key];
                    const mapValue = r[effectiveAutoPopulateColumnGroupsMapFields.value];
                    if (mapKey && mapValue) {
                        if (!autoPopulateMap[mapKey]) {
                            autoPopulateMap[mapKey] = new Set();
                        }
                        autoPopulateMap[mapKey].add(mapValue);
                    }
                });
                _.forEach(_.keys(autoPopulateMap), (k) => {
                    autoPopulateMap[k] = {
                        values: Array.from(autoPopulateMap[k])
                    };
                });

                updatedState['columnGroups'] = DataMatrix.deepExtend(columnGroups, autoPopulateMap);
            }

            if (matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE) {
                const donorTissueAssayOptions = this.getDonorTissueAssayOptions(availableDonorTissueAssays);
                const currentDonorTissueAssay = this.state.donorTissueAssay;
                const hasCurrentAssay = donorTissueAssayOptions.some(({ value }) => value === currentDonorTissueAssay);
                updatedState['donorTissueAssay'] = hasCurrentAssay ? currentDonorTissueAssay : DataMatrix.DONOR_TISSUE_ALL_ASSAYS;
            }

            const commitLoadedState = () => {
                if (requestId !== this.latestLoadRequestId) {
                    return;
                }
                this.setState(updatedState, () => {
                    ReactTooltip.rebuild();
                    // Cache this tab's loaded result under the current signature so
                    // switching back to it (same filters/session) restores without a refetch.
                    this.tabCache[matrixMode] = {
                        signature: this.getTabCacheSignature(),
                        state: _.pick(this.state, DataMatrix.TAB_CACHE_STATE_KEYS)
                    };
                });
                if (typeof onDataLoaded === 'function') {
                    onDataLoaded({
                        hasData: totalFiles > 0,
                        totalFiles,
                        query: this.state.query,
                        results: transformedData
                    });
                }
            };

            if (this.loadingDelayTimeout) {
                clearTimeout(this.loadingDelayTimeout);
                this.loadingDelayTimeout = null;
            }
            // Optional local-only delay so the intermediate loading treatment is easier to tune.
            if (debugLoadingDelayMs > 0) {
                this.loadingDelayTimeout = setTimeout(commitLoadedState, debugLoadingDelayMs);
            } else {
                commitLoadedState();
            }
        };

        const commonFallback = (result) => {
            if (requestId !== this.latestLoadRequestId) {
                return;
            }

            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = false;
            updatedState['isFetching'] = false;
            updatedState['loadingContext'] = null;
            updatedState['facetsForPanel'] = [];
            updatedState['facetFiltersForPanel'] = [];
            const commitLoadedState = () => {
                if (requestId !== this.latestLoadRequestId) {
                    return;
                }
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

            if (this.loadingDelayTimeout) {
                clearTimeout(this.loadingDelayTimeout);
                this.loadingDelayTimeout = null;
            }
            // Keep error and empty states on the same delayed cadence while debugging loading UI.
            if (debugLoadingDelayMs > 0) {
                this.loadingDelayTimeout = setTimeout(commitLoadedState, debugLoadingDelayMs);
            } else {
                commitLoadedState();
            }
        };
        this.setState(
            { "isFetching": true },
            () => {
                const { valueDelimiter = ' ', excludePrimaryColumnNoValue = true } = this.props;
                const activeHref = this.getEffectiveFacetHref(requestUrl);
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

                if (matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE && fieldChangeMap.assay) {
                    if (fieldChangeMap.tissue) {
                        rowAggFields.push(fieldChangeMap.tissue);
                    }
                    rowAggFields.push(fieldChangeMap.assay);
                    if (fieldChangeMap.platform) {
                        rowAggFields.push(fieldChangeMap.platform);
                    }
                    if (fieldChangeMap.data_type) {
                        rowAggFields.push(fieldChangeMap.data_type);
                    }
                    if (fieldChangeMap.analysis_details) {
                        rowAggFields.push(fieldChangeMap.analysis_details);
                    }
                }

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

    getEffectiveFacetHref(requestUrl = null) {
        const { facetNavigationHref } = this.state;
        return facetNavigationHref || requestUrl || (this.state.query && this.state.query.url) || '';
    }

    getDonorTissueAssayOptions(availableAssays = null) {
        const configuredDisplayValues = this.props.donorTissueAssayOptions || [];
        const hasAvailableAssays = Array.isArray(availableAssays);
        // Dropdown should never hide meaningful rows behind "No value".
        // Map missing assay labels to a visible virtual bucket.
        const normalizeAssayOption = (displayValue) => {
            if (!displayValue || displayValue === 'No value' || displayValue === 'No value - No value') {
                return 'Variant Call Sets';
            }
            return displayValue;
        };
        const assayDisplayValues = _.uniq((hasAvailableAssays
            ? _.uniq(availableAssays)
            : _.uniq(configuredDisplayValues.map((displayValue) => this.props.valueChangeMap?.assay?.[displayValue] || displayValue)))
            .map(normalizeAssayOption))
            .filter((displayValue) => !!displayValue);

        return [
            { label: DataMatrix.DONOR_TISSUE_ALL_ASSAYS, value: DataMatrix.DONOR_TISSUE_ALL_ASSAYS },
            ...assayDisplayValues.map((displayValue) => {
                return {
                    label: displayValue,
                    value: displayValue
                };
            })
        ];
    }

    getDerivedDonorTissueResults(results = null) {
        const { matrixMode, donorTissueAssay, groupingProperties, columnGrouping } = this.state;
        const { donorTissueShrinkEmptyColumns } = this.props;
        if (matrixMode !== DataMatrix.MATRIX_MODES.DONOR_TISSUE || !results) {
            return results;
        }
        const filteredAll = (!donorTissueAssay || donorTissueAssay === DataMatrix.DONOR_TISSUE_ALL_ASSAYS)
            ? (results.all || [])
            : (results.all || []).filter((row) => {
                // Defensive normalization in case any row still carries array assay.
                const assayValue = DataMatrix.normalizeAssayToSingleValue(row?.assay);
                return assayValue === donorTissueAssay;
            });
        const aggregateCounts = (rows = []) => {
            const donorValues = _.chain(rows)
                .map((row) => row?.donor)
                .flatten()
                .compact()
                .map((value) => String(value))
                .uniq()
                .value();

            return {
                files: _.reduce(rows, (sum, row) => sum + (Number(row?.counts?.files) || 0), 0),
                total_coverage: _.reduce(rows, (sum, row) => sum + (Number(row?.counts?.total_coverage) || 0), 0),
                donors: donorValues.length,
                donor_count: donorValues.length
            };
        };

        const aggregateRowsByKeys = (rows = [], keys = []) => {
            if (!Array.isArray(rows) || rows.length === 0) {
                return [];
            }
            const groupedRows = _.groupBy(rows, (row) => JSON.stringify(_.object(keys, keys.map((key) => row?.[key]))));
            return _.chain(groupedRows)
                .values()
                .map((groupRows) => {
                    const firstRow = groupRows[0] || {};
                    return {
                        ..._.pick(firstRow, keys),
                        counts: aggregateCounts(groupRows)
                    };
                })
                .filter((row) => Number(row?.counts?.files) > 0)
                .value();
        };

        const rowTotalKeys = _.chain(results.row_totals || [])
            .map((row) => _.keys(row))
            .flatten()
            .uniq()
            .without('counts', 'index')
            .value();
        const columnTotalKeys = _.chain(results.column_totals || [])
            .map((row) => _.keys(row))
            .flatten()
            .uniq()
            .without('counts', 'index')
            .value();

        const effectiveRowTotalKeys = rowTotalKeys.length > 0
            ? rowTotalKeys
            : _.uniq([...(groupingProperties || []), 'germLayer']);
        const effectiveColumnTotalKeys = columnTotalKeys.length > 0
            ? columnTotalKeys
            : _.uniq([columnGrouping, 'germLayer']);
        const filteredColumnTotals = aggregateRowsByKeys(filteredAll, effectiveColumnTotalKeys);
        const zeroCounts = { files: 0, total_coverage: 0, donors: 0, donor_count: 0 };
        const effectiveColumnTotals = donorTissueShrinkEmptyColumns
            ? filteredColumnTotals
            : _.map(results.column_totals || [], (columnTotalRow) => {
                const matchedColumnTotal = _.find(filteredColumnTotals, (filteredColumnTotalRow) => (
                    filteredColumnTotalRow?.[columnGrouping] === columnTotalRow?.[columnGrouping]
                ));
                return matchedColumnTotal || {
                    ..._.pick(columnTotalRow, effectiveColumnTotalKeys),
                    counts: { ...zeroCounts }
                };
            });
        const facetsForPanel = this.state?.facetsForPanel || [];
        const donorFacet = _.findWhere(facetsForPanel, { field: 'donors.display_title' });
        const donorValueMap = this.props?.valueChangeMap?.donor || {};
        const hasAssayFilter = donorTissueAssay && donorTissueAssay !== DataMatrix.DONOR_TISSUE_ALL_ASSAYS;
        // In donor-tissue mode with assay filtering, facet counts no longer represent global donor totals,
        // so disable donor summary overrides in that case.
        const donorSummaryCounts = !hasAssayFilter && donorFacet && Array.isArray(donorFacet.terms)
            ? _.reduce(donorFacet.terms, (memo, term) => {
                const key = donorValueMap[term?.key] || term?.key;
                if (!key || key === 'No value') return memo;
                memo[key] = { files: Number(term?.doc_count) || 0 };
                return memo;
            }, {})
            : null;

        // In "All", keep donor x tissue overall aligned to visible assay buckets.
        // In filtered mode, aggregate from the already-filtered matrix rows.
        const backendOverallCounts = this.state?.overallCounts || null;
        const visibleAssayOptions = this.getDonorTissueAssayOptions(this.state?.availableDonorTissueAssays || [])
            .map(({ value }) => value)
            .filter((value) => value && value !== DataMatrix.DONOR_TISSUE_ALL_ASSAYS);
        const visibleAssaySet = new Set(visibleAssayOptions);
        const visibleAllRows = (results.all || []).filter((row) => {
            const assayValue = DataMatrix.normalizeAssayToSingleValue(row?.assay);
            return assayValue && visibleAssaySet.has(assayValue);
        });
        const effectiveOverallCounts = hasAssayFilter
            ? aggregateCounts(filteredAll)
            : (aggregateCounts(visibleAllRows) || backendOverallCounts || aggregateCounts(filteredAll));

        return {
            ...results,
            all: filteredAll,
            row_totals: aggregateRowsByKeys(filteredAll, effectiveRowTotalKeys),
            column_totals: effectiveColumnTotals,
            overallCounts: effectiveOverallCounts,
            rowSummaryCountsByGroup: donorSummaryCounts ? { donor: donorSummaryCounts } : null
        };
    }

    getNextStateForMatrixMode(nextMatrixMode, prevState) {
        const {
            baseRowAggFields,
            baseColumnAggFields,
            baseGroupingProperties,
            baseColumnGrouping,
            baseXAxisLabel,
            baseYAxisLabel,
            baseColumnGroups,
            baseShowColumnGroups,
            baseColumnGroupsExtended,
            baseShowColumnGroupsExtended,
            baseRowGroupsExtended,
            baseShowRowGroupsExtended,
            baseColorRangeBaseColor,
            colorRangeSegments
        } = prevState;
        const { donorTissueColumnGroups } = this.props;

        if (nextMatrixMode === DataMatrix.MATRIX_MODES.TISSUE_ASSAY) {
            const countFor = prevState.countFor === 'donors' ? 'donors' : 'tissue_files';
            return {
                matrixMode: nextMatrixMode,
                countFor,
                query: {
                    ...prevState.query,
                    columnAggFields: baseColumnAggFields,
                    rowAggFields: (baseRowAggFields || []).filter((f) => {
                        if (Array.isArray(f)) {
                            return !f.includes('donors.display_title');
                        }
                        return f !== 'donors.display_title';
                    })
                },
                groupingProperties: (baseGroupingProperties || []).filter((p) => p !== 'donor'),
                columnGrouping: baseColumnGrouping,
                xAxisLabel: baseXAxisLabel,
                yAxisLabel: 'Tissue',
                columnGroups: baseColumnGroups,
                showColumnGroups: baseShowColumnGroups,
                columnGroupsExtended: baseColumnGroupsExtended,
                showColumnGroupsExtended: baseShowColumnGroupsExtended,
                rowGroupsExtended: baseRowGroupsExtended,
                showRowGroupsExtended: baseShowRowGroupsExtended,
                colorRanges: this.getColorRanges({
                    colorRangeBaseColor: countFor === 'donors' ? '#8989FF' : baseColorRangeBaseColor,
                    colorRangeSegments,
                    colorRangeSegmentStep: this.getColorRangeSegmentStepForCountFor(countFor, prevState)
                })
            };
        }

        if (nextMatrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE) {
            const donorTissueBaseColor = '#47adff';
            return {
                matrixMode: nextMatrixMode,
                countFor: 'files',
                query: {
                    ...prevState.query,
                    columnAggFields: ['sample_summary.tissues'],
                    rowAggFields: ['donors.display_title', 'sample_summary.category']
                },
                groupingProperties: ['donor'],
                columnGrouping: 'tissue',
                xAxisLabel: 'Tissue',
                yAxisLabel: 'Donor',
                columnGroups: DataMatrix.deepClone(donorTissueColumnGroups || DataMatrix.DEFAULT_DONOR_TISSUE_COLUMN_GROUPS),
                showColumnGroups: true,
                columnGroupsExtended: {},
                showColumnGroupsExtended: false,
                rowGroupsExtended: baseRowGroupsExtended,
                showRowGroupsExtended: false,
                colorRanges: this.getColorRanges({
                    colorRangeBaseColor: donorTissueBaseColor,
                    colorRangeSegments,
                    colorRangeSegmentStep: this.getColorRangeSegmentStepForCountFor('files', prevState)
                }),
                colorRangeBaseColor: donorTissueBaseColor
            };
        }

        return {
            matrixMode: nextMatrixMode,
            countFor: 'files',
            query: {
                ...prevState.query,
                columnAggFields: baseColumnAggFields,
                rowAggFields: baseRowAggFields
            },
            groupingProperties: baseGroupingProperties,
            columnGrouping: baseColumnGrouping,
            xAxisLabel: baseXAxisLabel,
            yAxisLabel: baseYAxisLabel,
            columnGroups: baseColumnGroups,
            showColumnGroups: baseShowColumnGroups,
            columnGroupsExtended: baseColumnGroupsExtended,
            showColumnGroupsExtended: baseShowColumnGroupsExtended,
            rowGroupsExtended: baseRowGroupsExtended,
            showRowGroupsExtended: baseShowRowGroupsExtended,
            colorRanges: this.getColorRanges({
                colorRangeBaseColor: baseColorRangeBaseColor,
                colorRangeSegments,
                colorRangeSegmentStep: this.getColorRangeSegmentStepForCountFor('files', prevState)
            })
        };
    }

    onMatrixModeChange(nextMatrixMode) {
        this.setState((prevState) => {
            return {
                ...this.getNextStateForMatrixMode(nextMatrixMode, prevState),
                // Clear stale cells immediately on matrix-mode switches so the loading shell
                // reflects the next mode instead of briefly showing the previous view's columns.
                // (When the target tab is cached, loadSearchQueryResults restores it before
                // paint, so this null state is not actually shown.)
                _results: null,
                loadingContext: 'matrix-mode'
            };
        });
    }

    /**
     * Signature over the fetch inputs for the active tab. The cache itself is
     * keyed by matrix mode, but sub-views within a mode can change aggregation
     * and grouping fields without changing query.url. A cached tab is safe to
     * restore only when its stored signature still matches the exact request
     * shape. countFor is intentionally omitted: when it changes the fetched
     * response, the aggregation/grouping fields below change with it.
     */
    getTabCacheSignature() {
        const { session } = this.props;
        const { query, facetNavigationHref, fieldChangeMap, showColumnSummary, groupingProperties, columnGrouping } = this.state;
        return JSON.stringify({
            session: session || null,
            baseUrl: (query && query.url) || null,
            facetHref: facetNavigationHref || null,
            columnAggFields: (query && query.columnAggFields) || null,
            rowAggFields: (query && query.rowAggFields) || null,
            columnGrouping: columnGrouping || null,
            groupingProperties: groupingProperties || null,
            fieldChangeMap: fieldChangeMap || null,
            showColumnSummary: showColumnSummary || null
        });
    }

    /**
     * Explicit refresh for the active tab: drop its cache entry and force a fresh
     * fetch (bypassing the cache), showing the full loading shell while it reloads.
     */
    onRefreshActiveTab() {
        delete this.tabCache[this.state.matrixMode];
        this.setState(
            { _results: null, loadingContext: 'matrix-mode' },
            () => this.loadSearchQueryResults({ forceRefresh: true })
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

    /**
     * Exports the currently visualized matrix state (respects matrix mode, files/coverage/donors
     * toggle, and any donor-tissue assay filter) as a downloadable JSON file, rather than the raw
     * `/data_matrix_aggregations` response which isn't structured for consumption.
     */
    onExportJson() {
        const { matrixMode, countFor, groupingProperties, columnGrouping, xAxisLabel, yAxisLabel, rowGroups, showRowGroups } = this.state;
        const { idLabel = '' } = this.props;
        const effectiveResults = this.getDerivedDonorTissueResults(this.state._results) || {};
        const exportData = buildMatrixExportData({
            data: effectiveResults.all || [],
            rowTotals: effectiveResults.row_totals || [],
            columnTotals: effectiveResults.column_totals || [],
            groupingProperties,
            columnGrouping,
            countFor,
            overallCounts: effectiveResults.overallCounts || this.state.overallCounts || null,
            matrixMode,
            rowAxisLabel: yAxisLabel,
            columnAxisLabel: xAxisLabel,
            rowGroups,
            showRowGroups
        });

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const downloadUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        anchor.href = downloadUrl;
        anchor.download = `SMaHT_data-matrix_${matrixMode}_${countFor}_${idLabel || 'export'}_${timestamp}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(downloadUrl);
    }

    /**
     * Downloads a PNG screenshot of the currently displayed matrix grid (headers, row labels,
     * cells and their totals), excluding the facet/counts side panel entirely since it's captured
     * from `.matrix-visual-scroll-content` alone, a sibling of `.matrix-counts-panel`.
     *
     * Targeting the scroll *content* node rather than its `overflow-x:auto` scroll-region
     * ancestor means html-to-image lays it out (and captures it) at its full natural
     * width/height, so the whole matrix is captured even if it currently overflows the
     * viewport/scroll container horizontally.
     */
    async onExportScreenshot() {
        const node = this.matrixCaptureEl;
        const { matrixMode, countFor, isScreenshotting } = this.state;
        if (!node || isScreenshotting) return;

        // The sticky column-header row is pinned via inline styles applied imperatively on
        // scroll (see StackedBlockVisual.syncStickyHeaderOnScroll), not CSS `position: sticky`.
        // Left as-is, the captured image would bake in whatever fixed on-screen coordinates
        // were last computed for the viewport. Clear it so the header renders inline at its
        // natural position for the full-content capture, then restore it afterwards.
        const headerUpperEl = node.querySelector('.grouping.header-section-upper');
        const originalHeaderStyle = headerUpperEl ? headerUpperEl.getAttribute('style') : null;
        if (headerUpperEl) {
            headerUpperEl.removeAttribute('style');
        }
        // The horizontal scroll-sync also applies a separate `translateX(...)` directly on the
        // nested `.row.grouping-row` (to keep header/summary-band columns aligned under the
        // pinned header while scrolling), which lives outside `headerUpperEl`'s own `style`
        // attribute and so survives the reset above. Left in place, the "Total X"/"Total Files"
        // summary rows render visibly shifted relative to the row data beneath them.
        const headerUpperRowEl = headerUpperEl ? headerUpperEl.querySelector('.row.grouping-row') : null;
        const originalHeaderRowTransform = headerUpperRowEl ? headerUpperRowEl.style.transform : null;
        if (headerUpperRowEl) {
            headerUpperRowEl.style.transform = '';
        }

        // `.stacked-block-viz-container` normally carries a `border-left` used to visually
        // separate the grid from the facet/counts panel to its left. Since the screenshot
        // deliberately excludes that panel, the divider has nothing to separate from and would
        // otherwise show up as a stray line down the left edge of the image.
        const vizContainerEl = node.querySelector('.stacked-block-viz-container');
        const originalVizContainerBorder = vizContainerEl ? vizContainerEl.style.borderLeft : null;
        if (vizContainerEl) {
            vizContainerEl.style.borderLeft = 'none';
        }

        // The "Total X" / "Total Files" summary-band labels rely on a `float-start` span inside
        // a `text-end` (right-aligned) container to sit flush-left despite the container's own
        // right alignment - unlike regular row labels, which are plain right-aligned `<h4>`s with
        // no float. This renders correctly on-screen, but html-to-image's cloned render doesn't
        // reliably reproduce float positioning for these bands in benchmarking's row-group-
        // sectioned view (each section gets its own band, several stacked among many sibling
        // rows) - CSS-level overrides (text-align, flex) proved unreliable across cases, so
        // instead pin each span to its own *measured, currently-correct* on-screen position in
        // absolute pixels before capture. This can't be wrong because it's not re-deriving the
        // position from CSS at all - it's copying the position the browser already rendered.
        const summaryLabelContainers = Array.from(node.querySelectorAll('.grouping.header-section-lower .label-container.text-end'));
        const originalSummaryLabelStyles = summaryLabelContainers.map((el) => el.getAttribute('style'));
        const summaryLabelSpans = summaryLabelContainers.map((el) => el.querySelector(':scope > .float-start'));
        const originalSummaryLabelSpanStyles = summaryLabelSpans.map((el) => (el ? el.getAttribute('style') : null));
        summaryLabelContainers.forEach((el, i) => {
            const span = summaryLabelSpans[i];
            if (!span) return;
            const containerRect = el.getBoundingClientRect();
            const spanRect = span.getBoundingClientRect();
            const offsetLeft = spanRect.left - containerRect.left;
            const offsetTop = spanRect.top - containerRect.top;
            el.style.position = 'relative';
            span.style.float = 'none';
            span.style.position = 'absolute';
            span.style.left = `${offsetLeft}px`;
            span.style.top = `${offsetTop}px`;
            span.style.margin = '0';
        });

        this.setState({ isScreenshotting: true });
        try {
            const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 });
            const anchor = document.createElement('a');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            anchor.href = dataUrl;
            anchor.download = `data-matrix_${matrixMode}_${countFor}_${timestamp}.png`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
        } catch (e) {
            console.error('Failed to capture matrix screenshot', e);
        } finally {
            if (headerUpperEl) {
                if (originalHeaderStyle) {
                    headerUpperEl.setAttribute('style', originalHeaderStyle);
                } else {
                    headerUpperEl.removeAttribute('style');
                }
            }
            if (headerUpperRowEl) {
                headerUpperRowEl.style.transform = originalHeaderRowTransform || '';
            }
            if (vizContainerEl) {
                vizContainerEl.style.borderLeft = originalVizContainerBorder || '';
            }
            summaryLabelContainers.forEach((el, i) => {
                if (originalSummaryLabelStyles[i]) {
                    el.setAttribute('style', originalSummaryLabelStyles[i]);
                } else {
                    el.removeAttribute('style');
                }
            });
            summaryLabelSpans.forEach((el, i) => {
                if (!el) return;
                if (originalSummaryLabelSpanStyles[i]) {
                    el.setAttribute('style', originalSummaryLabelSpanStyles[i]);
                } else {
                    el.removeAttribute('style');
                }
            });
            this.setState({ isScreenshotting: false });
        }
    }

    onCountForChange(e) {
        const nextValue = e && e.target ? e.target.value : 'files';
        this.setState((prevState) => {
            const isCoverageToggleOnly =
                (nextValue === 'files' && prevState.countFor === 'total_coverage') ||
                (nextValue === 'total_coverage' && prevState.countFor === 'files');
            const nextState = {
                countFor: nextValue,
                matrixMode: (nextValue === 'donors' || nextValue === 'tissue_files')
                    ? DataMatrix.MATRIX_MODES.TISSUE_ASSAY
                    : prevState.matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE
                        ? prevState.matrixMode
                        : DataMatrix.MATRIX_MODES.DONOR_ASSAY
            };
            const baseRowAggFields = prevState.baseRowAggFields || (prevState.query && prevState.query.rowAggFields) || [];
            const baseGroupingProperties = prevState.baseGroupingProperties || prevState.groupingProperties || [];
            const baseColorRangeBaseColor = prevState.baseColorRangeBaseColor || prevState.colorRangeBaseColor;
            const isTissueViewCount = nextValue === 'donors' || nextValue === 'tissue_files';

            if (isTissueViewCount) {
                const removeDonorAggregation = nextValue !== 'donors';
                nextState.query = {
                    ...prevState.query,
                    rowAggFields: removeDonorAggregation
                        ? (baseRowAggFields || []).filter((f) => {
                            if (Array.isArray(f)) {
                                return !f.includes('donors.display_title');
                            }
                            return f !== 'donors.display_title';
                        })
                        : baseRowAggFields
                };
                nextState.groupingProperties = (baseGroupingProperties || []).filter((p) => p !== 'donor');
                nextState.colorRanges = this.getColorRanges({
                    colorRangeBaseColor: nextValue === 'donors' ? '#8989FF' : baseColorRangeBaseColor,
                    colorRangeSegments: prevState.colorRangeSegments,
                    colorRangeSegmentStep: this.getColorRangeSegmentStepForCountFor(nextValue, prevState)
                });
            } else {
                // In Donor x Tissue mode, files <-> coverage is display-only.
                // Keep current query/grouping to avoid a one-time query-shape flip/refetch.
                if (prevState.matrixMode !== DataMatrix.MATRIX_MODES.DONOR_TISSUE) {
                    nextState.query = {
                        ...prevState.query,
                        rowAggFields: baseRowAggFields
                    };
                    nextState.groupingProperties = baseGroupingProperties;
                }
                nextState.colorRanges = this.getColorRanges({
                    colorRangeBaseColor: baseColorRangeBaseColor,
                    colorRangeSegments: prevState.colorRangeSegments,
                    colorRangeSegmentStep: this.getColorRangeSegmentStepForCountFor(nextValue, prevState)
                });
            }

            if (nextValue !== prevState.countFor && !isCoverageToggleOnly) {
                nextState.loadingContext = 'count-toggle';
            }

            return nextState;
        });
    }

    onDonorTissueAssayChange(e) {
        const nextValue = e && e.target ? e.target.value : '';
        this.setState({ donorTissueAssay: nextValue });
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

    render() {
        const {
            headerFor, valueChangeMap, allowedFields, valueDelimiter,
            disableConfigurator = false, idLabel = '', additionalPopoverData = {},
            baseBrowseFilesPath, browseFilteringTransformFuncKey, showCountFor, showMatrixModeTabs,
            showFacetTermsPanel, facetTermsPanelFields, donorTissueShrinkEmptyColumns,
            headerPadding, showUniqueDonorsAssayBand, schemas,
            dedupeBenchmarkingDsaAcrossTissues = false,
            titleMap, statePrioritizationForGroups, fallbackNameForBlankField
        } = this.props;
        const {
            query, fieldChangeMap, columnGrouping, groupingProperties,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
            colorRanges, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
            colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep, summaryBackgroundColor,
            defaultOpen = false, totalFiles, countFor, overallCounts, facetsForPanel, facetFiltersForPanel, isFetching,
            matrixMode, donorTissueAssay, availableDonorTissueAssays, rowSummaryCountsByGroup, loadingContext,
            isScreenshotting, _results: rawResults
        } = this.state;

        const effectiveFacetHref = this.getEffectiveFacetHref(query?.url);
        const isTissueMatrixCount = matrixMode === DataMatrix.MATRIX_MODES.TISSUE_ASSAY;
        const effectiveHeaderPadding = matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE ? 232 : headerPadding;
        const effectiveYAxisLabel = isTissueMatrixCount ? 'Tissue' : yAxisLabel;
        const effectiveResults = this.getDerivedDonorTissueResults(rawResults);
        const effectiveOverallCounts = effectiveResults?.overallCounts || overallCounts;
        // Row-summary overrides are useful for donor/assay benchmarking rollups,
        // but in donor/tissue mode they can conflict with assay-dropdown totals.
        // Keep donor/tissue overall driven by effective overallCounts only.
        const effectiveRowSummaryCountsByGroup = matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE
            ? null
            : (rowSummaryCountsByGroup || null);
        // In donor/tissue mode, assay dropdown refines matrix rendering only.
        // Keep header included-properties count anchored to unfiltered backend context.
        const effectiveTotalFiles = totalFiles;

        const isLoading = rawResults === null && query && query.url !== null && typeof query.url !== 'undefined';
        const isRefreshing = !!(isFetching && rawResults !== null && rawResults !== false);
        // Count toggles keep the current header/labels visible; matrix-mode switches use the blank shell.
        const isCountToggleRefreshing = isRefreshing && loadingContext === 'count-toggle';
        const isTissueMatrix = matrixMode === DataMatrix.MATRIX_MODES.TISSUE_ASSAY;
        const isDonorTissueMatrix = matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE;
        const isCoverageView = countFor === 'total_coverage';
        const showCountsPanel = showCountFor;
        const shouldShowMatrixModeTabs = showCountFor && showMatrixModeTabs && idLabel !== 'benchmarking';
        const showFacetsPanel = showFacetTermsPanel;
        const showLeftPanel = showCountsPanel || showFacetsPanel;
        const bodyProps = {
            query, groupingProperties, fieldChangeMap, valueChangeMap, columnGrouping, colorRanges,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended, additionalPopoverData,
            summaryBackgroundColor, xAxisLabel, yAxisLabel: effectiveYAxisLabel, showAxisLabels, showColumnSummary, valueDelimiter,
            baseBrowseFilesPath,
            activeFacetHref: effectiveFacetHref || query?.url || null,
            showUniqueDonorsAssayBand,
            shrinkEmptyColumns: matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE
                ? donorTissueShrinkEmptyColumns
                : true,
            countFor,
            // Donor-oriented coverage views keep the default cell width and rely on compact labels
            // instead of widening each matrix cell.
            compactCoverageText: countFor === 'total_coverage' && (
                matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE ||
                matrixMode === DataMatrix.MATRIX_MODES.DONOR_ASSAY
            ),
            // Coverage summary totals are only meaningful in Donor x Tissue.
            showCoverageSummaries: matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE,
            // Donor x Tissue should not expose expand controls.
            disableRowExpand: matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE,
            // Donor x Tissue blocks are informational; disable click-to-open highlighting/popover selection.
            disableBlockOpen: matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE,
            isGridRefreshing: isCountToggleRefreshing,
            // Avoid showing the fallback N/A germ-layer band while a donor/tissue refresh is in flight.
            hideFallbackColumnGroupHeader: matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE && isRefreshing,
            // Avoid showing the fallback row band while any matrix view is refreshing.
            hideFallbackRowGroupHeader: isRefreshing,
            overallCounts: effectiveOverallCounts,
            // Use mode-appropriate summary overrides: donor/tissue mode may null these out
            // under assay filter to avoid inconsistencies with facet-driven contexts.
            rowSummaryCountsByGroup: effectiveRowSummaryCountsByGroup,
            dedupeBenchmarkingDsaAcrossTissues,
            // Donor x Assay and Tissue x Assay both benefit from raw per-row
            // file overrides to keep summary columns aligned with visible cells.
            // Donor x Tissue derives its own filtered donor/tissue aggregates
            // and should not reuse assay-oriented raw override maps.
            rawRegularCountOverrides: matrixMode !== DataMatrix.MATRIX_MODES.DONOR_TISSUE
                ? (this.state.rawRegularCountOverrides || null)
                : null,
            ...(countFor === 'total_coverage' && matrixMode === DataMatrix.MATRIX_MODES.TISSUE_ASSAY
                ? { blockWidth: 60, blockHorizontalExtend: 10 }
                : {}),
            browseFilteringTransformFunc: browseFilteringTransformFuncKey
                ? ((filteringProperties, blockType) => {
                    const transformFn = DataMatrix.browseFilteringTransformFuncs[browseFilteringTransformFuncKey];
                    if (typeof transformFn !== 'function') return filteringProperties;
                    return transformFn(filteringProperties, blockType, {
                        matrixMode,
                        donorTissueAssay,
                        valueChangeMap
                    });
                })
                : null
        };

        const colAgg = Array.isArray(query.columnAggFields) ? query.columnAggFields : [query.columnAggFields];
        const rowAgg1 = Array.isArray(query.rowAggFields[0]) ? query.rowAggFields[0] : [query.rowAggFields[0]];
        const rowAgg2 = query.rowAggFields.length > 1 ? Array.isArray(query.rowAggFields[1]) ? query.rowAggFields[1] : [query.rowAggFields[1]] : null;
        const rowAgg3 = query.rowAggFields.length > 2 ? Array.isArray(query.rowAggFields[2]) ? query.rowAggFields[2] : [query.rowAggFields[2]] : null;
        const donorTissueAssayOptions = this.getDonorTissueAssayOptions(availableDonorTissueAssays);

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
                    const assaySelect = isDonorTissueMatrix ? (
                        <div className="matrix-assay-select-control">
                            <div className="matrix-assay-select-inline">
                                <label className="matrix-assay-select-label" htmlFor={`matrix-assay-select-${idLabel || 'default'}`}>
                                    <i className="icon fas icon-dna" /> Assay
                                </label>
                                <select
                                    id={`matrix-assay-select-${idLabel || 'default'}`}
                                    className="form-select form-select-sm matrix-assay-select"
                                    value={donorTissueAssay}
                                    onChange={this.onDonorTissueAssayChange}>
                                    {donorTissueAssayOptions.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    ) : null;

                    const metricToggle = showCountsPanel ? (
                        <div className={isDonorTissueMatrix ? "matrix-visual-metric-controls" : "matrix-top-controls matrix-visual-metric-controls"}>
                            <div className="matrix-counts-toggle matrix-counts-toggle-inline">
                                <IconToggle
                                    options={isTissueMatrix ? [
                                        {
                                            title: (
                                                <React.Fragment>
                                                    <i className="icon fas icon-file me-1" /> Files
                                                </React.Fragment>
                                            ),
                                            dataTip: 'Toggle file count view',
                                            btnCls: 'btn-sm',
                                            onClick: () => this.onCountForChange({ target: { value: 'tissue_files' } })
                                        },
                                        {
                                            title: (
                                                <React.Fragment>
                                                    <i className="icon fas icon-users me-1" /> Donors
                                                </React.Fragment>
                                            ),
                                            dataTip: 'Toggle donor count view',
                                            btnCls: 'btn-sm',
                                            onClick: () => this.onCountForChange({ target: { value: 'donors' } })
                                        }
                                    ] : [
                                        {
                                            title: (
                                                <React.Fragment>
                                                    <i className="icon fas icon-file me-1" /> Files
                                                </React.Fragment>
                                            ),
                                            dataTip: 'Toggle file count view',
                                            btnCls: 'btn-sm',
                                            onClick: () => this.onCountForChange({ target: { value: 'files' } })
                                        },
                                        {
                                            title: (
                                                <React.Fragment>
                                                    <i className="icon fas icon-stream me-1" /> Coverage
                                                </React.Fragment>
                                            ),
                                            dataTip: 'Toggle coverage view',
                                            btnCls: 'btn-sm',
                                            onClick: () => this.onCountForChange({ target: { value: 'total_coverage' } })
                                        }
                                    ]}
                                    activeIdx={isTissueMatrix ? (countFor === 'tissue_files' ? 0 : 1) : (isCoverageView ? 1 : 0)}
                                    divCls="view-toggle p-1"
                                />
                            </div>
                            {isCountToggleRefreshing ? (
                                <div className="matrix-inline-refresh-indicator" aria-hidden="true">
                                    <i className="icon icon-spin icon-circle-notch fas" />
                                </div>
                            ) : null}
                        </div>
                    ) : null;

                    const headerLeftControls = (assaySelect || metricToggle) ? (
                        isDonorTissueMatrix ? (
                            <div className="matrix-donor-tissue-controls-stack">
                                {metricToggle}
                                {assaySelect}
                            </div>
                        ) : (
                            <React.Fragment>
                                {assaySelect}
                                {metricToggle}
                            </React.Fragment>
                        )
                    ) : null;

                    return (
                        <div className="matrix-mode-layout">
                            <div className={`matrix-mode-body d-flex${showLeftPanel ? "" : " no-left-panel"}`}>
                                {showLeftPanel ? (
                                    <div className={`matrix-counts-panel ${showFacetTermsPanel ? 'has-facets-panel' : ''}`}>
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
                                                <div className="matrix-facet-terms-wrapper">
                                                    {typeof totalFiles === 'number' ? (
                                                        <div className="matrix-total-files-count">
                                                            {`${effectiveTotalFiles.toLocaleString()} Files`}
                                                        </div>
                                                    ) : null}
                                                    <div className="matrix-facet-terms-panel mt-1 search-view-controls-and-results">
                                                        <FacetList
                                                            facets={visibleFacets}
                                                            context={{ filters: facetFiltersForPanel || [] }}
                                                            termTransformFxn={termTransformFxnWithOverrides(visibleFacets)}
                                                            facetListSortFxns={{ 'sample_summary.tissues': compareTissueFacetTerms }}
                                                            title="Properties"
                                                            showClearFiltersButton={false}
                                                            onClearFilters={this.onFacetClearFilters}
                                                            onFilter={this.onFacetFilter}
                                                            onFilterMultiple={this.onFacetFilterMultiple}
                                                            href={effectiveFacetHref || query?.url || null}
                                                            schemas={schemas || null}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })() : (
                                            <div className="matrix-facet-terms-wrapper">
                                                <div className="matrix-total-files-count">
                                                    {typeof totalFiles === 'number' ? `${effectiveTotalFiles.toLocaleString()} Files` : 'Loading…'}
                                                </div>
                                                <div className="matrix-facet-terms-panel mt-1 search-view-controls-and-results" aria-hidden="true" style={{ minHeight: '160px' }} />
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                                <div className="matrix-visual-panel flex-grow-1">
                                    <div className={`matrix-mode-tabs-row d-flex align-items-center justify-content-between${shouldShowMatrixModeTabs ? '' : ' no-tabs'}`}>
                                        {shouldShowMatrixModeTabs ? (
                                            <div className="matrix-mode-tabs">
                                                <button
                                                    type="button"
                                                    className={`matrix-mode-tab ${matrixMode === DataMatrix.MATRIX_MODES.DONOR_ASSAY ? 'active' : ''}`}
                                                    onClick={() => this.onMatrixModeChange(DataMatrix.MATRIX_MODES.DONOR_ASSAY)}>
                                                    <i className="icon fas icon-user me-05" /> Donor x Assay
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`matrix-mode-tab ${matrixMode === DataMatrix.MATRIX_MODES.TISSUE_ASSAY ? 'active' : ''}`}
                                                    onClick={() => this.onMatrixModeChange(DataMatrix.MATRIX_MODES.TISSUE_ASSAY)}>
                                                    <i className="icon fas icon-lungs me-05" /> Tissue x Assay
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`matrix-mode-tab ${matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE ? 'active' : ''}`}
                                                    onClick={() => this.onMatrixModeChange(DataMatrix.MATRIX_MODES.DONOR_TISSUE)}>
                                                    <i className="icon fas icon-dna me-05" /> Donor x Tissue
                                                </button>
                                            </div>
                                        ) : <div />}
                                        <div className="matrix-export-controls d-flex align-items-center gap-2">
                                            <Dropdown align="end" className="matrix-export-dropdown">
                                                <Dropdown.Toggle
                                                    variant="outline-secondary"
                                                    size="sm"
                                                    id={`matrix-export-dropdown-${idLabel || 'default'}`}
                                                    disabled={isLoading}>
                                                    <i className="icon icon-download fas me-03" />Export
                                                </Dropdown.Toggle>
                                                <Dropdown.Menu>
                                                    <Dropdown.Item
                                                        disabled={isScreenshotting}
                                                        onClick={this.onExportScreenshot}>
                                                        <i className={`icon fas me-05 ${isScreenshotting ? 'icon-spin icon-circle-notch' : 'icon-camera'}`} /> {isScreenshotting ? 'Capturing…' : 'Screenshot (PNG)'}
                                                    </Dropdown.Item>
                                                    <Dropdown.Item
                                                        disabled={!effectiveResults}
                                                        onClick={this.onExportJson}>
                                                        <i className="icon icon-file fas me-05" /> Export JSON
                                                    </Dropdown.Item>
                                                </Dropdown.Menu>
                                            </Dropdown>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-secondary matrix-mode-refresh-btn"
                                                title="Refresh this tab's data"
                                                aria-label="Refresh this tab's data"
                                                disabled={isFetching}
                                                onClick={this.onRefreshActiveTab}>
                                                <i className={`icon fas icon-sync-alt${isFetching ? ' icon-spin' : ''}`} /> Refresh
                                            </button>
                                        </div>
                                    </div>
                                    <div className="matrix-visual-scroll-region">
                                        <div className="matrix-visual-scroll-content" ref={(el) => { this.matrixCaptureEl = el; }}>
                                            <VisualBody
                                                {...{ titleMap, statePrioritizationForGroups, fallbackNameForBlankField }}
                                                {...bodyProps}
                                                headerPadding={effectiveHeaderPadding}
                                                headerLeftControls={headerLeftControls}
                                                showLoadingHeaderLeftControls={loadingContext === 'count-toggle'}
                                                columnSubGrouping=""// leave blank for now
                                                isLoading={isLoading}
                                                results={effectiveResults || { all: [], row_totals: [], column_totals: [] }}
                                                defaultDepthsOpen={[defaultOpen, false, false]}
                                                defaultExpandedRowIndices={this.props.defaultExpandedRowIndices}
                                                // keysToInclude={[]}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })() : (
                    <div className="matrix-visual-scroll-region">
                        <div className="matrix-visual-scroll-content" ref={(el) => { this.matrixCaptureEl = el; }}>
                            <VisualBody
                                {...{ titleMap, statePrioritizationForGroups, fallbackNameForBlankField }}
                                {...bodyProps}
                                headerPadding={effectiveHeaderPadding}
                                headerLeftControls={null}
                                showLoadingHeaderLeftControls={false}
                                columnSubGrouping=""// leave blank for now
                                isLoading={isLoading}
                                results={effectiveResults || { all: [], row_totals: [], column_totals: [] }}
                                defaultDepthsOpen={[defaultOpen, false, false]}
                                defaultExpandedRowIndices={this.props.defaultExpandedRowIndices}
                                // keysToInclude={[]}
                            />
                        </div>
                    </div>
                )}
            </div>
        );
        const isTissueMatrixMode = matrixMode !== DataMatrix.MATRIX_MODES.DONOR_ASSAY;
        const isDonorTissueMatrixMode = matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE;
        const dataMatrixClassName = `data-matrix${isTissueMatrixMode ? ' matrix-mode-tissue' : ''}${isDonorTissueMatrixMode ? ' matrix-mode-donor-tissue' : ''}`;
        return (
            <div id={`data-matrix-for_${idLabel}`} className={dataMatrixClassName} data-files-count={totalFiles}>
                <div className={`row matrix-render-surface${isRefreshing ? ' is-refreshing' : ''}`}>
                    {body}
                    {isRefreshing && !isCountToggleRefreshing ? (
                        <div className="matrix-refresh-overlay d-flex align-items-center justify-content-center">
                            <i className="icon icon-spin icon-circle-notch fas" />
                        </div>
                    ) : null}
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
        const variantCallAnalysisDetails = ['Filtered', 'Phased'];
        const variantCallSetData = nonDsaData.filter((row) => variantCallAnalysisDetails.includes(row['analysis_details']));
        const nonDsaNonVariantCallSetData = nonDsaData.filter((row) => !variantCallAnalysisDetails.includes(row['analysis_details']));
        const derivedLabelField = columnGrouping === 'assay' ? columnGrouping : 'assay';
        const derivedGroupingProperties = columnGrouping === 'assay'
            ? groupingProperties
            : _.uniq([...(groupingProperties || []), columnGrouping]);

        const transformedDsa = DataMatrix.transformDSA(
            nonDsaData,
            data.row_totals,
            dsaData,
            derivedGroupingProperties,
            derivedLabelField,
            // Keep DSA in "file count" mode for all matrix modes.
            // Assay-family counting inflated donor x tissue tuples (e.g. SMHT023/3AC => 3 instead of 1).
            false,
            // For non-assay grouping (e.g. Donor x Tissue), use max raw DSA row count per tuple
            // instead of row_totals diff, which can be exploded by assay/platform dimensions.
            columnGrouping === 'assay' ? 'diff' : 'max_dsa_row'
        );
        const transformedSnv = DataMatrix.transformSNV(variantCallSetData, derivedGroupingProperties, derivedLabelField);

        return {
            ...data,
            all: nonDsaNonVariantCallSetData.concat(transformedDsa).concat(transformedSnv)
        };
    }
};
DataMatrix.browseFilteringTransformFuncs = {
    "analysisDerivedColumns": function (filteringProperties, blockType, matrixContext = null) {
        const assayField = 'assays.display_title';
        const platformField = 'sequencers.platform';
        const isDonorTissueMode = matrixContext?.matrixMode === DataMatrix.MATRIX_MODES.DONOR_TISSUE;
        const selectedDonorTissueAssay = matrixContext?.donorTissueAssay;
        const hasSelectedDonorTissueAssay = isDonorTissueMode &&
            selectedDonorTissueAssay &&
            selectedDonorTissueAssay !== DataMatrix.DONOR_TISSUE_ALL_ASSAYS;

        // Donor x Tissue regular cells might not include assay in URL params.
        // Inject currently selected assay to keep browse links scoped correctly.
        if (hasSelectedDonorTissueAssay && typeof filteringProperties[assayField] === 'undefined') {
            const assayValueMap = matrixContext?.valueChangeMap?.assay || {};
            const rawAssayCandidates = _.filter(_.keys(assayValueMap), (rawKey) => assayValueMap[rawKey] === selectedDonorTissueAssay);
            const rawSelectedAssay = rawAssayCandidates[0] || selectedDonorTissueAssay;
            const delim = ' - ';
            const splitIdx = typeof rawSelectedAssay === 'string' ? rawSelectedAssay.lastIndexOf(delim) : -1;

            // If selected assay contains platform suffix (e.g. "WGS - ONT"), split into raw assay + platform.
            if (splitIdx > 0) {
                const rawAssay = rawSelectedAssay.slice(0, splitIdx);
                const rawPlatform = rawSelectedAssay.slice(splitIdx + delim.length);
                filteringProperties[assayField] = rawAssay;
                if (rawPlatform) {
                    filteringProperties[platformField] = rawPlatform;
                }
            } else {
                filteringProperties[assayField] = rawSelectedAssay;
            }
        }

        const assayFilterRaw = filteringProperties[assayField];
        const assayFilterList = Array.isArray(assayFilterRaw)
            ? assayFilterRaw
            : (typeof assayFilterRaw === 'string' ? [assayFilterRaw] : []);
        const hasAssayFilter = assayFilterList.length > 0;
        const hasDSAAssayFilter = assayFilterList.includes('DSA');
        const hasVariantCallSetsAssayFilter = assayFilterList.includes('Variant Call Sets');

        if (hasDSAAssayFilter) {
            // extend data_type filter to include Chain File along with DSA
            filteringProperties['data_type'] = [...(filteringProperties['data_type'] || []), 'DSA', 'Chain File', 'Sequence Interval'];
            delete filteringProperties[assayField];
        } else if (hasVariantCallSetsAssayFilter) {
            filteringProperties['analysis_details'] = [...(filteringProperties['analysis_details'] || []), 'Filtered', 'Phased'];
            filteringProperties['data_type!'] = [...(filteringProperties['data_type!'] || []), 'DSA', 'Chain File', 'Sequence Interval'];
            delete filteringProperties[assayField];
        } else if (
            // IMPORTANT:
            // Only apply non-DSA exclusion when an assay filter exists.
            // In donor x tissue, regular blocks may not carry assays.display_title in URL params;
            // forcing data_type! in that case incorrectly removes DSA/Chain rows.
            ((blockType === 'regular') && hasAssayFilter) ||
            ((blockType === 'col-summary' || blockType === 'col-secondary-summary') && hasAssayFilter)
        ) {
            // for non-DSA columns we exclude DSA-related data types;
            // for overall summary (no assay filter) keep all data types.
            // Keep filtered/phased rows in their parent assay browse links so
            // regular blocks and summary columns match raw backend assay totals.
            filteringProperties['data_type!'] = [...(filteringProperties['data_type!'] || []), 'DSA', 'Chain File', 'Sequence Interval'];
        }
        return filteringProperties;
    }
};
