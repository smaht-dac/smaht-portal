'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, ajax, JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { VisualBody } from './StackedBlockVisual';
import { DataMatrixConfigurator, updateColorRanges } from './DataMatrixConfigurator';
import { germLayerTissueMapping } from '../../util/data';


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
     */
    static deepExtend(obj1 = {}, obj2 = {}) {
        // Create a full deep copy of obj1 to ensure it is never mutated
        const result = DataMatrix.deepClone(obj1);

        _.each(obj2, (value, key) => {
            const left = result[key];

            if (DataMatrix.isPlainObject(value) && DataMatrix.isPlainObject(left)) {
                // If both values are plain objects, merge them recursively
                result[key] = DataMatrix.deepExtend(left, value);
            } else if (Array.isArray(value) && Array.isArray(left)) {
                // Merge arrays, remove duplicates, and ensure a new array reference
                result[key] = _.uniq([...left, ...value]);
            } else if (Array.isArray(value)) {
                // Replace with a cloned array to avoid shared references
                result[key] = [...value];
            } else if (DataMatrix.isPlainObject(value)) {
                // Replace with a deep copy to avoid shared object references
                result[key] = DataMatrix.deepClone(value);
            } else {
                // Override primitive values or non-matching types
                result[key] = value;
            }
        });

        return result;
    }

    static DEFAULT_ROW_GROUPS_EXTENDED = DataMatrix.deepExtend(germLayerTissueMapping, {
        Ectoderm: { backgroundColor: '#367151', textColor: '#ffffff', shortName: 'Ecto' },
        Mesoderm: { backgroundColor: '#30975e', textColor: '#ffffff', shortName: 'Meso' },
        Endoderm: { backgroundColor: '#53b27e', textColor: '#ffffff', shortName: 'Endo' },
        'Germ cells': { backgroundColor: '#80c4a0', textColor: '#ffffff', shortName: 'Germ' },
        'Clinically accessible': { backgroundColor: '#70a588', textColor: '#ffffff', shortName: 'Clin' },
    });


    static defaultProps = {
        "query": {
            "url": "/data_matrix_aggregations/?type=File&status=open&limit=all",
            "columnAggFields": ["file_sets.libraries.assay.display_title", "sequencing.sequencer.platform"],
            "rowAggFields": ["donors.display_title", "sample_summary.tissues"]
        },
        "fieldChangeMap": {
            "assay": "file_sets.libraries.assay.display_title",
            "donor": "donors.display_title",
            "tissue": "sample_summary.tissues",
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
        "resultPostProcessFuncKey": null, // function to process results after they are loaded
        "groupingProperties": ["donor", "tissue"], // properties to group by in the matrix
        "columnGrouping": "assay",
        "headerFor": <h3 className="mt-2 mb-0 text-300">SMaHT</h3>,
        "fallbackNameForBlankField": "None",
        /** Which state to set/prioritize if multiple files per group */
        "statePrioritizationForGroups": [],
        "headerPadding": 200,
        "columnGroups": {
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
            }
        },
        "showColumnGroups": true,
        "columnGroupsExtended": {
            "Core Assay": {
                "values": ['Bulk WGS', 'RNA-seq', 'Duplex-seq'],
                "backgroundColor": "#a786c2",
                "textColor": "#ffffff"
            },
            "Extended Assay": {
                "values": ['Single-cell WGS', 'Targeted Seq', 'Single-cell RNA-Seq', 'Other'],
                "backgroundColor": "#d2bde3",
                "textColor": "#ffffff"
            }
        },
        "showColumnGroupsExtended": false,
        "rowGroups": null,
        "showRowGroups": false,
        "autoPopulateRowGroupsProperty": null,
        "rowGroupsExtended": DataMatrix.DEFAULT_ROW_GROUPS_EXTENDED,
        "showRowGroupsExtended": true,
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
        "compositeValueSeparator": " - ",
        "disableConfigurator": true,
        "idLabel": "",
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
    };

    static propTypes = {
        'query': PropTypes.shape({
            'url': PropTypes.string,
            'columnAggFields': PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]).isRequired, // can be a single string or composite value
            'rowAggFields': PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])).isRequired // array element can be a single string or composite value
        }),
        'valueChangeMap': PropTypes.object,
        'fieldChangeMap': PropTypes.object,
        'resultPostProcessFuncKey': PropTypes.string, // function key to process results after they are loaded
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
        'additionalPopoverData': PropTypes.object,
        'xAxisLabel': PropTypes.string,
        'yAxisLabel': PropTypes.string,
        'showAxisLabels': PropTypes.bool,
        'showColumnSummary': PropTypes.bool,
        'defaultOpen': PropTypes.bool,
        'compositeValueSeparator': PropTypes.string,
        'disableConfigurator': PropTypes.bool,
        'idLabel': PropTypes.string,
        'allowedFields': PropTypes.arrayOf(PropTypes.string),
        'baseBrowseFilesPath': PropTypes.string
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

        const colorRanges = this.getColorRanges(props);

        this.state = {
            "mounted": false,
            "_results": null,
            "query": props.query,
            "fieldChangeMap": props.fieldChangeMap,
            "columnGrouping": props.columnGrouping,
            "groupingProperties": props.groupingProperties,
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
            "defaultOpen": props.defaultOpen
        };
    }

    componentDidMount() {
        this.setState({ "mounted": true, "totalFiles": "N/A" });
        this.loadSearchQueryResults();
    }

    componentDidUpdate(pastProps, pastState) {
        const { session } = this.props;
        const { query, fieldChangeMap, columnGrouping, groupingProperties, showColumnSummary, defaultOpen } = this.state;
        if (session !== pastProps.session ||
            !_.isEqual(query, pastState.query) ||
            !_.isEqual(fieldChangeMap, pastState.fieldChangeMap) ||
            columnGrouping !== pastState.columnGrouping ||
            !_.isEqual(groupingProperties, pastState.groupingProperties) ||
            showColumnSummary !== pastState.showColumnSummary ||
            defaultOpen !== pastState.defaultOpen) {
            this.loadSearchQueryResults();
        }
    }

    loadSearchQueryResults() {

        const commonCallback = (result) => {
            const { valueChangeMap, resultPostProcessFuncKey } = this.props;
            const { fieldChangeMap, groupingProperties, autoPopulateRowGroupsProperty } = this.state;
            const resultKey = "_results";
            const updatedState = {};

            const transformedData = { all: [], row_totals: [] };
            const populatedRowGroups = {}; // not implemented yet
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
                if (resultPostProcessFuncKey && typeof DataMatrix.resultPostProcessFuncs[resultPostProcessFuncKey] === 'function') {
                    cloned = DataMatrix.resultPostProcessFuncs[resultPostProcessFuncKey](cloned);
                }
                if (cloned.files && cloned.files > 0) {
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

            _.forEach(result.data, (r) => processResultRow(r, transformedData.all));
            _.forEach(result.row_totals, (r) => processResultRow(r, transformedData.row_totals));

            updatedState[resultKey] = transformedData;
            // sum files in transformedData array
            let totalFiles = 0;
            _.forEach(transformedData.row_totals, (r) => {
                if (r.files && typeof r.files === 'number') {
                    totalFiles += r.files;
                }
            });
            updatedState['totalFiles'] = totalFiles;

            this.setState(updatedState, () => ReactTooltip.rebuild());
        };

        const commonFallback = (result) => {
            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = false;
            this.setState(updatedState);
        };

        const {
            query: { url: requestUrl, columnAggFields: propColumnAggFields, rowAggFields: propRowAggFields },
            fieldChangeMap,
            autoPopulateRowGroupsProperty
        } = this.state;
        this.setState(
            { "_results": null }, // (Re)Set all result states to 'null'
            () => {
                const { compositeValueSeparator = ' ' } = this.props;
                const [url, strQueryParams] = requestUrl.split('?');
                const queryParamsByUrl = DataMatrix.parseQuery(strQueryParams);

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
                    if (idx === 0 && !queryParamsByUrl[f]) {
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
                if (compositeValueSeparator && typeof compositeValueSeparator === 'string') {
                    requestBody['composite_value_separator'] = compositeValueSeparator;
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
            headerFor, valueChangeMap, allowedFields, compositeValueSeparator,
            disableConfigurator = false, idLabel = '', additionalPopoverData = {},
            baseBrowseFilesPath
        } = this.props;
        const {
            query, fieldChangeMap, columnGrouping, groupingProperties,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
            colorRanges, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
            colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep, summaryBackgroundColor,
            defaultOpen = false, totalFiles
        } = this.state;

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
            summaryBackgroundColor, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary, compositeValueSeparator,
            baseBrowseFilesPath
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
            <div>
                {configurator}
                {headerFor || null}
                <VisualBody
                    {..._.pick(this.props, 'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
                    {...bodyProps}
                    columnSubGrouping=""//"state"
                    // eslint-disable-next-line react/destructuring-assignment
                    results={this.state[resultKey]}
                    defaultDepthsOpen={[defaultOpen, false, false]}
                    // keysToInclude={[]}
                />
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
DataMatrix.resultPostProcessFuncs = {
    "cellLinePostProcess": function (result) {
        if (result.dataset && result.donor && result.dataset !== 'tissue') {
            result.donor = result.dataset;
            result.primary_field_override = "dataset";

            if (typeof result.assay !== 'undefined' && typeof result.platform !== 'undefined') {
                if (result.assay.indexOf('Hi-C - ') !== -1 && result.platform !== 'Illumina') {
                    result.files = 0;
                }
                if (result.assay.indexOf('Fiber-seq - ') !== -1 && result.platform !== 'PacBio') {
                    result.files = 0;
                }
                if (result.assay.indexOf('Ultra-Long WGS - ') !== -1 && result.platform !== 'ONT') {
                    result.files = 0;
                }
            }
        }
        return result;
    }
};
