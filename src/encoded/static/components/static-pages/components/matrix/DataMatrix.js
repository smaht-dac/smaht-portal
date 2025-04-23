'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, object, ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { VisualBody } from '../';
import { DataMatrixConfigurator, updateColorRanges } from './DataMatrixConfigurator';


export default class DataMatrix extends React.PureComponent {

    static defaultProps = {
        "query": {
            "url": "/data_matrix_aggregations/?type=SubmittedFile&limit=all",
            "column_agg_fields": "",
            "row_agg_fields": [""]
        },
        "valueChangeMap": {},
        "fieldChangeMap": {},
        "groupingProperties": [],
        "columnGrouping": "",
        "headerFor": <h3 className="mt-2 mb-0 text-300">SMaHT</h3>,
        "fallbackNameForBlankField": "None",
        /** Which state to set/prioritize if multiple files per group */
        "statePrioritizationForGroups" : [],
        "headerPadding"             : 200,
        "columnGroups"              : null,
        "columnGroupsExtended"      : null,
        "rowGroups"                 : null,
        "rowGroupsExtended"         : null,
        "titleMap"                  : {},
        "columnSubGroupingOrder": [],
        "colorRanges": [
                { min: 0, max: 25, color: '#ff0000' },
                { min: 25, max: 50, color: '#00ff00' },
                { min: 50, max: 100, color: '#0000ff' },
                { min: 100 }
        ],
        "baseColorOverride": null, // color hex or rgba code (if set, will override colorRanges)
        "allowedFields": [
            "donors.display_title",
            "sequencing.sequencer.display_title",
            "data_generation_summary.assays",
            "sample_summary.tissues",
            "data_type",
            "file_format.display_title",
            "data_category",
            "software.display_title"
        ],
        "disableConfigurator": false,
        "useTestData": false // to be removed
    };

    static propTypes = {
        'query': PropTypes.shape({
            'url': PropTypes.string,
            'column_agg_fields': PropTypes.oneOfType(PropTypes.string, PropTypes.arrayOf(PropTypes.string)).isRequired, // can be a single string or composite value
            'row_agg_fields': PropTypes.arrayOf(PropTypes.oneOfType(PropTypes.string, PropTypes.arrayOf(PropTypes.string))).isRequired // array element can be a single string or composite value
        }),
        'valueChangeMap': PropTypes.object,
        'fieldChangeMap': PropTypes.object,
        'groupingProperties': PropTypes.arrayOf(PropTypes.string),
        'columnGrouping': PropTypes.string,
        'headerFor': PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
        'sectionStyle': PropTypes.object,
        'fallbackNameForBlankField': PropTypes.string,
        'statePrioritizationForGroups': PropTypes.arrayOf(PropTypes.string),
        'headerPadding': PropTypes.number,
        'titleMap': PropTypes.object,
        'columnSubGroupingOrder': PropTypes.arrayOf(PropTypes.string),
        'colorRanges': PropTypes.arrayOf(PropTypes.object),
        'baseColorOverride': PropTypes.string,
        'allowedFields': PropTypes.arrayOf(PropTypes.string),
        'disableConfigurator': PropTypes.bool,
        'columnGroups': PropTypes.object,
        'columnGroupsExtended': PropTypes.object,
        'rowGroups': PropTypes.object,
        'rowGroupsExtended': PropTypes.object
    };

    static convertResult(result, fieldChangeMap, valueChangeMap, statusStateTitleMap, fallbackNameForBlankField) {

        const convertedResult = _.clone(result);

        if (fieldChangeMap) {
            _.forEach(_.pairs(fieldChangeMap), function ([fieldToMapTo, fieldToMapFrom]) {
                let value = object.getNestedProperty(result, fieldToMapFrom, fieldToMapTo);
                if (Array.isArray(value)) { // Only allow single vals.
                    value = _.uniq(_.flatten(value));
                    if (value.length > 1) {
                        console.warn("We have 2+ of a grouping value", fieldToMapFrom, value, result);
                    }
                    value = value[0] || fallbackNameForBlankField;
                }
                convertedResult[fieldToMapTo] = value;
            }, {});
        }

        // Change values (e.g. shorten some):
        if (valueChangeMap) {
            _.forEach(_.pairs(valueChangeMap), function ([field, changeMap]) {
                if (typeof convertedResult[field] === "string") { // If present
                    convertedResult[field] = changeMap[convertedResult[field]] || convertedResult[field];
                }
            });
        }

        // Standardized state from status
        // TODO Use similar by-data-source structure as fieldChangeMap & valueChangeMap
        if (statusStateTitleMap) {
            const [stateTitleToSave] = _.find(_.pairs(statusStateTitleMap), function ([titleToSave, validStatuses]) { return validStatuses.indexOf(result.status) > -1; });
            convertedResult.state = stateTitleToSave || fallbackNameForBlankField;
        }

        return convertedResult;
    }

    /**
     * specifically designed for the bar_plot_aggregations endpoint
     * transforms the data into a format that can be used by the DataMatrix component
     * TODO: repeating records is not ideal, but it is necessary to display the data in the matrix
     * @param {*} aggregatorJson 
     * @param {*} fieldMap 
     * @returns 
     */
    static transformData(aggregatorJson, fieldMap) {
        const result = [];

        // 1) Find which key (e.g., "assay" or "donor") corresponds to the top-level field,
        //    such as "file_sets.libraries.assay.display_title".
        const topLevelKey = Object.keys(fieldMap).find(
            (k) => fieldMap[k] === aggregatorJson.field
        );

        // 2) Iterate over top-level "terms"
        for (const [topTermValue, topTermObj] of Object.entries(aggregatorJson.terms)) {
            // 3) Find which key corresponds to the sub-level field,
            //    e.g., "donors.display_title".
            const subLevelKey = Object.keys(fieldMap).find(
                (k) => fieldMap[k] === topTermObj.field
            );

            // 4) Iterate over the sub-level terms
            for (const [subTermValue, subTermObj] of Object.entries(topTermObj.terms)) {
                const repeatCount = subTermObj.files || 0;
                // 5) Repeat the record as many times as the subTermObj.files value
                for (let i = 0; i < repeatCount; i++) {
                    const item = {};
                    item[topLevelKey] = topTermValue; // e.g. { assay: "Fiber-seq" }
                    item[subLevelKey] = subTermValue; // e.g. { donor: "TEST_DONOR_MALE" }
                    result.push(item);
                }
            }
        }

        return result;
    }

    static parseQuery(queryString) {
        const params = queryString.split('&');
        const result = {};

        const decodeQueryParam = function (p) {
            return decodeURIComponent(p.replace(/\+/g, " "));
        }

        params.forEach(param => {
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
            if (result.hasOwnProperty(key)) {
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

    constructor(props) {
        super(props);
        this.standardizeResult = this.standardizeResult.bind(this);
        this.loadSearchQueryResults = this.loadSearchQueryResults.bind(this);
        this.onApplyConfiguration = this.onApplyConfiguration.bind(this);

        let colorRangesOverriden = null;
        if (props.colorRanges && props.baseColorOverride) {
            colorRangesOverriden = updateColorRanges(props.colorRanges, props.baseColorOverride, -100);
        }

        this.state = {
            "mounted": false,
            "_results": null,
            "query": props.query,
            "fieldChangeMap": props.fieldChangeMap,
            "columnGrouping": props.columnGrouping,
            "groupingProperties": props.groupingProperties,
            "colorRanges": colorRangesOverriden || props.colorRanges || []
        };
    }

    standardizeResult(result) {
        const { fallbackNameForBlankField, statusStateTitleMap, valueChangeMap } = this.props;
        const { fieldChangeMap } = this.state;

        const fullResult = DataMatrix.convertResult(
            result, fieldChangeMap, valueChangeMap, statusStateTitleMap, fallbackNameForBlankField
        );

        return fullResult;
    }

    componentDidMount() {
        this.setState({ "mounted": true });
        this.loadSearchQueryResults();
    }

    componentDidUpdate(pastProps, pastState) {
        const { session } = this.props;
        const { query, fieldChangeMap, columnGrouping, groupingProperties } = this.state;
        if (session !== pastProps.session ||
            !_.isEqual(query, pastState.query) ||
            !_.isEqual(fieldChangeMap, pastState.fieldChangeMap) ||
            columnGrouping !== pastState.columnGrouping ||
            !_.isEqual(groupingProperties, pastState.groupingProperties)) {
            this.loadSearchQueryResults();
        }
    }

    loadSearchQueryResults() {

        const commonCallback = (result) => {
            const { valueChangeMap } = this.props;
            const { fieldChangeMap } = this.state;
            const resultKey = "_results";
            const updatedState = {};
            // if (typeof result["other_doc_count"] === 'undefined') {
            //     updatedState[resultKey] = result["@graph"] || [];
            //     updatedState[resultKey] = _.map(updatedState[resultKey], (r) => this.standardizeResult(r));
            // } else {
            //     updatedState[resultKey] = DataMatrix.transformData(result, this.state.fieldChangeMap);
            // }
            updatedState[resultKey] = this.props.useTestData ? TEST_DATA_2 : result;
            let transfermedData = [];
            _.forEach(updatedState[resultKey], (r) => {
                if (fieldChangeMap) {
                    _.forEach(_.pairs(fieldChangeMap), function ([fieldToMapTo, fieldToMapFrom]) {
                        if (typeof r[fieldToMapFrom] !== 'undefined') {
                            r[fieldToMapTo] = r[fieldToMapFrom];
                            delete r[fieldToMapFrom];
                        }
                    }, {});
                }
                if (r.files && r.files > 0) {
                    transfermedData = transfermedData.concat(
                        _.times(r.files, function () {
                            const cloned = _.clone(r);
                            delete cloned.files;

                            // Change values (e.g. shorten some):
                            if (valueChangeMap) {
                                _.forEach(_.pairs(valueChangeMap), function ([field, changeMap]) {
                                    if (typeof cloned[field] === "string") { // If present
                                        cloned[field] = changeMap[cloned[field]] || cloned[field];
                                    }
                                });
                            }    

                            return cloned;
                        }));
                }
            });
            // TODO: re-implement query to remove hardcoded filtering
            // transfermedData = _.filter(transfermedData, function (r) { return r.donor.indexOf('SMHT') > -1 || r.donor.indexOf('ST') > -1; });

            updatedState[resultKey] = transfermedData;

            this.setState(updatedState, () => ReactTooltip.rebuild());
        };

        const commonFallback = (result) => {
            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = false;
            this.setState(updatedState);
        };

        const { query } = this.state;
        this.setState(
            { "_results": null }, // (Re)Set all result states to 'null'
            () => {
                let requestUrl = query.url;
                const [url, strQueryParams] = requestUrl.split('?');
                const queryParamsByUrl = DataMatrix.parseQuery(strQueryParams);

                const colAggFields = typeof query.column_agg_fields === 'string' ? [query.column_agg_fields] : query.column_agg_fields;
                const rowAggFields = typeof query.row_agg_fields === 'string' ? [query.row_agg_fields] : query.row_agg_fields;

                if (typeof requestUrl !== 'string' || !requestUrl) return;

                const searchQueryParams = { field: [], type: 'SubmittedFile', limit: 'all' };
                if (rowAggFields.length > 0 || colAggFields.length > 0) {
                    _.forEach(rowAggFields, function (f) {
                        searchQueryParams.field.push(f);
                        searchQueryParams[f + '!'] = "No value";
                    });
                    if (colAggFields.length > 0) {
                        _.forEach(colAggFields, function (f, idx) {
                            searchQueryParams.field.push(f);
                            if (idx === 0) {
                                searchQueryParams[f + '!'] = "No value";
                            }
                        });
                    }
                }

                const requestBody = {
                    "search_query_params": _.extend({}, searchQueryParams, queryParamsByUrl),
                    "column_agg_fields": query.column_agg_fields,
                    "row_agg_fields": query.row_agg_fields,
                    "flatten_values": true
                };

                // Exclude 'Authorization' header for requests to different domains (not allowed).
                const excludedHeaders = (requestUrl.slice(0, 4) === 'http') ? ['Authorization', 'Content-Type'] : null;
                ajax.load(url, (r) => commonCallback(r), 'POST', (r) => commonFallback(r), JSON.stringify(requestBody), {}, excludedHeaders);
            }
        );
    }

    onApplyConfiguration(searchUrl, column, row1, row2, ranges) {
        console.log(searchUrl, column, row1, row2, ranges);
        this.setState({
            query: {
                ...this.state.query,
                url: searchUrl,
                agg_fields: row2 ? [column, row1, row2] : [column, row1]
            },
            fieldChangeMap: {
                [DataMatrixConfigurator.getNestedFieldName(column)]: column,
                [DataMatrixConfigurator.getNestedFieldName(row1)]: row1
            },
            columnGrouping: DataMatrixConfigurator.getNestedFieldName(column),
            groupingProperties: [DataMatrixConfigurator.getNestedFieldName(row1)],
            colorRanges: ranges
        });
    }

    render() {
        const { headerFor, sectionStyle, valueChangeMap, allowedFields, columnGroups, columnGroupsExtended, rowGroups, rowGroupsExtended, disableConfigurator = false } = this.props;
        const { query, fieldChangeMap, columnGrouping, groupingProperties, colorRanges } = this.state;

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
        const url = query.url;
        const bodyProps = {
            groupingProperties, fieldChangeMap, valueChangeMap, columnGrouping,
            colorRanges, columnGroups, columnGroupsExtended, rowGroups, rowGroupsExtended
        };

        const configurator = !disableConfigurator && (
            <DataMatrixConfigurator
                columnDimensions={allowedFields}
                rowDimensions={allowedFields}
                searchUrl={query.url}
                selectedColumnValue={query.column_agg_fields[0]}
                selectedRow1Value={query.row_agg_fields[0]}
                selectedRow2Value={query.row_agg_fields.length > 2 ? query.row_agg_fields[1] : null}
                initialColumnGroups={columnGroups}
                initialColumnGroupsExtended={columnGroupsExtended} //not implemented yet
                initialRowGroups={rowGroups} //not implemented yet
                initialRowGroupsExtended={rowGroupsExtended} //not implemented yet
                colorRanges={colorRanges}
                onApply={this.onApplyConfiguration}
            />
        );

        const body = (
            <div>
                {configurator}
                {/* { (headerFor && headerFor) || {null} } */}
                <VisualBody
                    {..._.pick(this.props, 'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
                    queryUrl={url}
                    {...bodyProps}
                    columnSubGrouping="state"
                    // eslint-disable-next-line react/destructuring-assignment
                    results={this.state[resultKey]}
                    // defaultDepthsOpen={[true, false, false]}
                    // keysToInclude={[]}
                />
            </div>
        );

        return (
            <div className="static-section data-matrix">
                <div className="row">
                    {body}
                </div>
            </div>
        );
    }
}

const TEST_DATA = [
    {
        "assay": "ppmSeq",
        "donor": "ST001",
        "tissue": "Blood"
    },
    {
        "assay": "ATAC-Seq",
        "donor": "ST002",
        "tissue": "Lung"
    },
    {
        "assay": "Slide-tags snRNA-Seq",
        "donor": "SMHT001",
        "tissue": "Brain - Cerebellum"
    },
    {
        "assay": "WGS - Standard ONT",
        "donor": "SMHT001",
        "tissue": "Brain - Frontal lobe"
    },
    {
        "assay": "WGS - Illumina",
        "donor": "SMHT001",
        "tissue": "Brain - Hippocampus"
    },
    {
        "assay": "10X Genomics Xenium",
        "donor": "SMHT001",
        "tissue": "Brain - Temporal lobe"
    },
    {
        "assay": "CODEC",
        "donor": "SMHT001",
        "tissue": "Skin - Abdomen (non-exposed)"
    },
    {
        "assay": "NanoSeq",
        "donor": "SMHT001",
        "tissue": "Skin - Calf (sun-exposed)"
    },
    {
        "assay": "NanoSeq",
        "donor": "SMHT001",
        "tissue": "Aorta"
    },
    {
        "assay": "WGS - UltraLong ONT",
        "donor": "SMHT001",
        "tissue": "Fibroblast"
    },
    {
        "assay": "10X Genomics Xenium",
        "donor": "SMHT001",
        "tissue": "Heart"
    },
    {
        "assay": "WGS - Standard ONT",
        "donor": "SMHT001",
        "tissue": "Muscle"
    },
    {
        "assay": "STORM-Seq",
        "donor": "SMHT001",
        "tissue": "Colon - Ascending"
    },
    {
        "assay": "10X Genomics Xenium",
        "donor": "SMHT001",
        "tissue": "Colon - Descending"
    },
    {
        "assay": "NT-Seq",
        "donor": "SMHT001",
        "tissue": "Esophagus"
    },
    {
        "assay": "L1-ONT",
        "donor": "SMHT001",
        "tissue": "Liver"
    },
    {
        "assay": "Fiber-Seq",
        "donor": "SMHT001",
        "tissue": "Lung"
    },
    {
        "assay": "TEnCATS",
        "donor": "SMHT001",
        "tissue": "Ovary"
    },
    {
        "assay": "PTA-amplified WGS",
        "donor": "SMHT001",
        "tissue": "Testis"
    },
    {
        "assay": "WGS - PacBio",
        "donor": "SMHT001",
        "tissue": "Blood"
    },
    {
        "assay": "WGS - Illumina",
        "donor": "SMHT001",
        "tissue": "Buccal swab"
    },
    {
        "assay": "RNA-Seq - Illumina",
        "donor": "ST003",
        "tissue": "Aorta"
    },
    {
        "assay": "Kinnex",
        "donor": "SMHT006",
        "tissue": "Testis"
    },
    {
        "assay": "VISTA-Seq",
        "donor": "SMHT005",
        "tissue": "Blood"
    },
    {
        "assay": "CompDuplex-Seq",
        "donor": "SMHT020",
        "tissue": "Fibroblast"
    },
    {
        "assay": "HiDEF-Seq",
        "donor": "SMHT022",
        "tissue": "Buccal swab"
    },
    {
        "assay": "MALBAC-amplified WGS",
        "donor": "SMHT007",
        "tissue": "Brain - Cerebellum"
    },
    {
        "assay": "WGS DLP+",
        "donor": "SMHT004",
        "tissue": "Liver"
    },
    {
        "assay": "HAT-Seq",
        "donor": "SMHT009",
        "tissue": "Heart"
    },
    {
        "assay": "snRNA-Seq",
        "donor": "SMHT001",
        "tissue": "Aorta"
    },
    {
        "assay": "Tranquil-Seq",
        "donor": "SMHT009",
        "tissue": "Brain - Temporal lobe"
    },
    {
        "assay": "Hi-C",
        "donor": "ST003",
        "tissue": "Esophagus"
    },
    {
        "assay": "scDip-C",
        "donor": "ST004",
        "tissue": "Colon - Descending"
    },
    {
        "assay": "Strand-Seq",
        "donor": "SMHT012",
        "tissue": "Heart"
    },
    {
        "assay": "varCUT&Tag",
        "donor": "SMHT027",
        "tissue": "Brain - Temporal lobe"
    },
    {
        "assay": "GoT-ChA",
        "donor": "SMHT015",
        "tissue": "Brain - Hippocampus"
    },
    {
        "assay": "L1-ONT",
        "donor": "SMHT008",
        "tissue": "Muscle"
    },
    {
        "assay": "Strand-Seq",
        "donor": "SMHT023",
        "tissue": "Colon - Descending"
    },
    {
        "assay": "TEnCATS",
        "donor": "SMHT024",
        "tissue": "Aorta"
    },
    {
        "assay": "Tranquil-Seq",
        "donor": "SMHT029",
        "tissue": "Brain - Hippocampus"
    },
    {
        "assay": "WGS - PacBio",
        "donor": "SMHT006",
        "tissue": "Muscle"
    },
    {
        "assay": "Fiber-Seq",
        "donor": "SMHT006",
        "tissue": "Brain - Temporal lobe"
    },
    {
        "assay": "HiDEF-Seq",
        "donor": "SMHT007",
        "tissue": "Lung"
    },
    {
        "assay": "Slide-tags snRNA-Seq",
        "donor": "SMHT012",
        "tissue": "Skin - Calf (sun-exposed)"
    },
    {
        "assay": "CompDuplex-Seq",
        "donor": "SMHT012",
        "tissue": "Aorta"
    },
    {
        "assay": "STORM-Seq",
        "donor": "SMHT007",
        "tissue": "Brain - Hippocampus"
    },
    {
        "assay": "snRNA-Seq",
        "donor": "SMHT004",
        "tissue": "Blood"
    },
    {
        "assay": "10X Genomics Xenium",
        "donor": "SMHT006",
        "tissue": "Skin - Calf (sun-exposed)"
    },
    {
        "assay": "MALBAC-amplified WGS",
        "donor": "SMHT015",
        "tissue": "Heart"
    },
    {
        "assay": "varCUT&Tag",
        "donor": "SMHT027",
        "tissue": "Fibroblast"
    },
    {
        "assay": "STORM-Seq",
        "donor": "SMHT009",
        "tissue": "Brain - Frontal lobe"
    },
    {
        "assay": "NanoSeq",
        "donor": "ST002",
        "tissue": "Colon - Ascending"
    },
    {
        "assay": "HiDEF-Seq",
        "donor": "SMHT007",
        "tissue": "Brain - Hippocampus"
    },
    {
        "assay": "Kinnex",
        "donor": "SMHT029",
        "tissue": "Colon - Ascending"
    },
    {
        "assay": "Kinnex",
        "donor": "SMHT023",
        "tissue": "Esophagus"
    },
    {
        "assay": "NT-Seq",
        "donor": "SMHT022",
        "tissue": "Skin - Abdomen (non-exposed)"
    },
    {
        "assay": "CODEC",
        "donor": "SMHT001",
        "tissue": "Fibroblast"
    },
    {
        "assay": "10X Genomics Xenium",
        "donor": "SMHT027",
        "tissue": "Blood"
    },
    {
        "assay": "CODEC",
        "donor": "SMHT029",
        "tissue": "Liver"
    },
    {
        "assay": "NT-Seq",
        "donor": "SMHT029",
        "tissue": "Esophagus"
    }
];

const TEST_DATA_2 = [
    {
        "data_generation_summary.assays": "scDip-C - Illumina",
        "donors.display_title": "ISLET1",
        "sample_summary.tissues": "endocrine pancreas",
        "files": 4904
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 188
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 126
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Skin",
        "files": 12
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 174
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 70
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Skin",
        "files": 12
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Brain",
        "files": 48
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Skin",
        "files": 24
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Colon",
        "files": 20
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Muscle",
        "files": 12
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Blood",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Esophagus",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Heart",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Liver",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 136
    },
    {
        "data_generation_summary.assays": "WGS - Illumina",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 134
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "CB0",
        "sample_summary.tissues": "Blood",
        "files": 30
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P5246",
        "sample_summary.tissues": "Brain",
        "files": 30
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P5844",
        "sample_summary.tissues": "Brain",
        "files": 25
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P1740",
        "sample_summary.tissues": "Brain",
        "files": 20
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P4546",
        "sample_summary.tissues": "Brain",
        "files": 20
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P4643",
        "sample_summary.tissues": "Brain",
        "files": 20
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P5182",
        "sample_summary.tissues": "Brain",
        "files": 20
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P5818",
        "sample_summary.tissues": "Brain",
        "files": 20
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P4925",
        "sample_summary.tissues": "Brain",
        "files": 15
    },
    {
        "data_generation_summary.assays": "CompDuplex-seq - Illumina",
        "donors.display_title": "P5554",
        "sample_summary.tissues": "Brain",
        "files": 15
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Colon",
        "files": 8
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Skin",
        "files": 8
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Aorta",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Blood",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Esophagus",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Heart",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Liver",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Lung",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Muscle",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Testis",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 14
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 12
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Blood",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Colon",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Esophagus",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Heart",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Liver",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Muscle",
        "files": 4
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 12
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - ONT",
        "donors.display_title": "LIBD75",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "Single-cell MALBAC WGS - ONT",
        "donors.display_title": "LIBD75",
        "sample_summary.tissues": "Brain",
        "files": 121
    },
    {
        "data_generation_summary.assays": "Single-cell MALBAC WGS - Illumina",
        "donors.display_title": "LIBD75",
        "sample_summary.tissues": "Brain",
        "files": 94
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 17
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 11
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 13
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 11
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 11
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Blood",
        "files": 2
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Colon",
        "files": 2
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Esophagus",
        "files": 2
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Lung",
        "files": 2
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT004",
        "sample_summary.tissues": "Muscle",
        "files": 2
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 9
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Heart",
        "files": 2
    },
    {
        "data_generation_summary.assays": "RNA-seq - Illumina",
        "donors.display_title": "SMHT008",
        "sample_summary.tissues": "Muscle",
        "files": 2
    },
    {
        "data_generation_summary.assays": "NanoSeq - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 12
    },
    {
        "data_generation_summary.assays": "NanoSeq - Illumina",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 12
    },
    {
        "data_generation_summary.assays": "NanoSeq - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 12
    },
    {
        "data_generation_summary.assays": "NanoSeq - Illumina",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 12
    },
    {
        "data_generation_summary.assays": "NanoSeq - Illumina",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 12
    },
    {
        "data_generation_summary.assays": "NanoSeq - Illumina",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 12
    },
    {
        "data_generation_summary.assays": "WGS - PacBio",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 11
    },
    {
        "data_generation_summary.assays": "WGS - PacBio",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - PacBio",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 10
    },
    {
        "data_generation_summary.assays": "WGS - PacBio",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 8
    },
    {
        "data_generation_summary.assays": "WGS - PacBio",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 7
    },
    {
        "data_generation_summary.assays": "WGS - PacBio",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 7
    },
    {
        "data_generation_summary.assays": "scVISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Brain",
        "files": 10
    },
    {
        "data_generation_summary.assays": "scVISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Heart",
        "files": 10
    },
    {
        "data_generation_summary.assays": "scVISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Liver",
        "files": 10
    },
    {
        "data_generation_summary.assays": "Fiber-seq - PacBio",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 8
    },
    {
        "data_generation_summary.assays": "Fiber-seq - PacBio",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 1
    },
    {
        "data_generation_summary.assays": "Fiber-seq - PacBio",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 6
    },
    {
        "data_generation_summary.assays": "Fiber-seq - PacBio",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 2
    },
    {
        "data_generation_summary.assays": "Fiber-seq - PacBio",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 5
    },
    {
        "data_generation_summary.assays": "Fiber-seq - PacBio",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 5
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "CB0",
        "sample_summary.tissues": "Blood",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P1740",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P4546",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P4643",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P4925",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P5182",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P5246",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P5554",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P5818",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "P5844",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "UMB1465",
        "sample_summary.tissues": "Brain",
        "files": 1
    },
    {
        "data_generation_summary.assays": "PCR WGS - Illumina",
        "donors.display_title": "UMB5278",
        "sample_summary.tissues": "Brain",
        "files": 1
    },
    {
        "data_generation_summary.assays": "Kinnex - PacBio",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Colon",
        "files": 4
    },
    {
        "data_generation_summary.assays": "Kinnex - PacBio",
        "donors.display_title": "ST002",
        "sample_summary.tissues": "Lung",
        "files": 4
    },
    {
        "data_generation_summary.assays": "Kinnex - PacBio",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Lung",
        "files": 4
    },
    {
        "data_generation_summary.assays": "Kinnex - PacBio",
        "donors.display_title": "ST001",
        "sample_summary.tissues": "Liver",
        "files": 2
    },
    {
        "data_generation_summary.assays": "Kinnex - PacBio",
        "donors.display_title": "ST003",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "Kinnex - PacBio",
        "donors.display_title": "ST004",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB1465",
        "sample_summary.tissues": "Aorta",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB1465",
        "sample_summary.tissues": "Brain",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB1465",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB1465",
        "sample_summary.tissues": "Lung",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB1864",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB4428",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB4638",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB5278",
        "sample_summary.tissues": "Brain",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB6032",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "ATAC-seq - Illumina",
        "donors.display_title": "UMB936",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "varCUT&Tag - Illumina",
        "donors.display_title": "SN001",
        "sample_summary.tissues": "Skin",
        "files": 2
    },
    {
        "data_generation_summary.assays": "varCUT&Tag - Illumina",
        "donors.display_title": "SN002",
        "sample_summary.tissues": "Skin",
        "files": 2
    },
    {
        "data_generation_summary.assays": "varCUT&Tag - Illumina",
        "donors.display_title": "SN003",
        "sample_summary.tissues": "Kidney",
        "files": 2
    },
    {
        "data_generation_summary.assays": "CODEC - Illumina",
        "donors.display_title": "UMB1465",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "CODEC - Illumina",
        "donors.display_title": "UMB5278",
        "sample_summary.tissues": "Brain",
        "files": 2
    },
    {
        "data_generation_summary.assays": "Microbulk VISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Brain",
        "files": 1
    },
    {
        "data_generation_summary.assays": "Microbulk VISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "Microbulk VISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Liver",
        "files": 1
    },
    {
        "data_generation_summary.assays": "TEnCATS - ONT",
        "donors.display_title": "LIBD75",
        "sample_summary.tissues": "Brain",
        "files": 3
    },
    {
        "data_generation_summary.assays": "VISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Brain",
        "files": 1
    },
    {
        "data_generation_summary.assays": "VISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Heart",
        "files": 1
    },
    {
        "data_generation_summary.assays": "VISTA-seq - Illumina",
        "donors.display_title": "936_49F",
        "sample_summary.tissues": "Liver",
        "files": 1
    }
];