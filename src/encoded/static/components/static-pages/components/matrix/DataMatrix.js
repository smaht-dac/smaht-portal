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
        "queries": {
            "url": "/search/?type=SubmittedFile&limit=all",
            "url_fields": []
        },
        "valueChangeMap": {},
        "fieldChangeMap": {},
        "groupingProperties": [],
        "columnGrouping": "",
        "headerFor": <h3 className="mt-2 mb-0 text-300">SMaHT</h3>,
        "sectionStyle": {
            "sectionClassName": "col-12",
            "labelClassName": "col-2",
            "listingClassName": "col-10"
        },
        "fallbackNameForBlankField" : "None",
        /** Which state to set/prioritize if multiple files per group */
        "statePrioritizationForGroups" : [],
        "headerPadding"             : 200,
        "headerColumnsOrder"        : [], // soon to be deprecated, use columnGroups instead
        "columnGroups": null,
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
            "file_sets.libraries.assay.display_title",
            "sample_summary.tissues",
            "data_type",
            "file_format.display_title",
            "data_category",
            "software.display_title"
        ],
        "disableConfigurator": false
    };

    static propTypes = {
        'queries': PropTypes.object.isRequired,
        'valueChangeMap': PropTypes.object,
        'fieldChangeMap': PropTypes.object,
        'groupingProperties': PropTypes.arrayOf(PropTypes.string),
        'columnGrouping': PropTypes.string,
        'headerFor': PropTypes.oneOfType([PropTypes.element, PropTypes.string]),
        'sectionStyle': PropTypes.object,
        'fallbackNameForBlankField': PropTypes.string,
        'statePrioritizationForGroups': PropTypes.arrayOf(PropTypes.string),
        'headerPadding': PropTypes.number,
        'headerColumnsOrder': PropTypes.arrayOf(PropTypes.string),
        'titleMap': PropTypes.object,
        'columnSubGroupingOrder': PropTypes.arrayOf(PropTypes.string),
        'colorRanges': PropTypes.arrayOf(PropTypes.object),
        'baseColorOverride': PropTypes.string,
        'allowedFields': PropTypes.arrayOf(PropTypes.string),
        'disableConfigurator': PropTypes.bool,
        'columnGroups': PropTypes.object,
    };

    static convertResult(result, fieldChangeMap, valueChangeMap, statusStateTitleMap, fallbackNameForBlankField){

        const convertedResult = _.clone(result);

        if (fieldChangeMap){
            _.forEach(_.pairs(fieldChangeMap), function([ fieldToMapTo, fieldToMapFrom ]){
                let value = object.getNestedProperty(result, fieldToMapFrom, fieldToMapTo);
                if (Array.isArray(value)){ // Only allow single vals.
                    value = _.uniq(_.flatten(value));
                    if (value.length > 1){
                        console.warn("We have 2+ of a grouping value", fieldToMapFrom, value, result);
                    }
                    value = value[0] || fallbackNameForBlankField;
                }
                convertedResult[fieldToMapTo] = value;
            }, {});
        }

        // Change values (e.g. shorten some):
        if (valueChangeMap){
            _.forEach(_.pairs(valueChangeMap), function([field, changeMap]){
                if (typeof convertedResult[field] === "string"){ // If present
                    convertedResult[field] = changeMap[convertedResult[field]] || convertedResult[field];
                }
            });
        }

        // Standardized state from status
        // TODO Use similar by-data-source structure as fieldChangeMap & valueChangeMap
        if (statusStateTitleMap){
            const [ stateTitleToSave ] = _.find(_.pairs(statusStateTitleMap), function([titleToSave, validStatuses]){ return validStatuses.indexOf(result.status) > -1; });
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
            "mounted"  : false,
            "_results" : null,
            "queries"  : props.queries,
            "fieldChangeMap": props.fieldChangeMap,
            "columnGrouping": props.columnGrouping,
            "groupingProperties": props.groupingProperties,
            "headerColumnsOrder": props.headerColumnsOrder || [],
            "colorRanges": colorRangesOverriden || props.colorRanges || []
        };
    }

    standardizeResult(result){
        const { fallbackNameForBlankField, statusStateTitleMap, valueChangeMap } = this.props;
        const { fieldChangeMap } = this.state;
        
        const fullResult = DataMatrix.convertResult(
            result, fieldChangeMap, valueChangeMap, statusStateTitleMap, fallbackNameForBlankField
        );

        return fullResult;
    }

    componentDidMount(){
        this.setState({ "mounted" : true });
        this.loadSearchQueryResults();
    }

    componentDidUpdate(pastProps, pastState){
        const { session } = this.props;
        const { queries, fieldChangeMap, columnGrouping, groupingProperties } = this.state;
        if (session !== pastProps.session ||
            !_.isEqual(queries, pastState.queries) ||
            !_.isEqual(fieldChangeMap, pastState.fieldChangeMap) ||
            columnGrouping !== pastState.columnGrouping ||
            !_.isEqual(groupingProperties, pastState.groupingProperties)) {
            this.loadSearchQueryResults();
        }
    }

    loadSearchQueryResults(){

        const commonCallback = (result) => {
            const resultKey = "_results";
            const updatedState = {};
            if (typeof result["other_doc_count"] === 'undefined') {
                updatedState[resultKey] = result["@graph"] || [];
                updatedState[resultKey] = _.map(updatedState[resultKey], (r) => this.standardizeResult(r));
            } else {
                updatedState[resultKey] = DataMatrix.transformData(TEST_DATA/*result*/, this.state.fieldChangeMap);
            }

            this.setState(updatedState, () => ReactTooltip.rebuild());
        };

        const commonFallback = (result) => {
            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = false;
            this.setState(updatedState);
        };

        const { queries } = this.state;
        this.setState(
            { "_results": null }, // (Re)Set all result states to 'null'
            () => {
                    // eslint-disable-next-line react/destructuring-assignment
                    let requestUrl = queries.url;
                    // eslint-disable-next-line react/destructuring-assignment
                    const requestUrlFields = JSON.parse(JSON.stringify(queries.url_fields));

                    if (typeof requestUrl !== 'string' || !requestUrl) return;

                    if (Array.isArray(requestUrlFields) && requestUrlFields.length > 0) {
                        _.forEach(requestUrlFields, function (f) {
                            requestUrl += '&field=' + encodeURIComponent(f) + '&' + f + '!=No+value';
                        });
                    }
                    // Exclude 'Authorization' header for requests to different domains (not allowed).
                    const excludedHeaders = (requestUrl.slice(0, 4) === 'http') ? ['Authorization', 'Content-Type'] : null;
                    ajax.load(requestUrl, (r) => commonCallback(r), 'GET', (r) => commonFallback(r), null, {}, excludedHeaders);
            }
        );
    }

    onApplyConfiguration(searchUrl, column, row1, row2, headerColumnsOrder, ranges) {
        console.log(searchUrl, column, row1, row2, headerColumnsOrder, ranges);
        this.setState({
            queries: {
                ...this.state.queries,
                url: searchUrl,
                url_fields: row2 ? [column, row1, row2] : [column, row1]
            },
            fieldChangeMap: {
                [DataMatrixConfigurator.getNestedFieldName(column)]: column,
                [DataMatrixConfigurator.getNestedFieldName(row1)]: row1
            },
            columnGrouping: DataMatrixConfigurator.getNestedFieldName(column),
            groupingProperties: [DataMatrixConfigurator.getNestedFieldName(row1)],
            headerColumnsOrder: headerColumnsOrder || [],
            colorRanges: ranges
        });
    }

    render() {
        const { headerFor, sectionStyle, valueChangeMap, allowedFields, columnGroups, disableConfigurator = false } = this.props;
        const { queries, fieldChangeMap, columnGrouping, groupingProperties, headerColumnsOrder, colorRanges } = this.state;

        const isLoading = 
                // eslint-disable-next-line react/destructuring-assignment
                this.state['_results'] === null && queries && queries.url !== null && typeof queries.url !== 'undefined';

        if (isLoading){
            return (
                <div>
                    <div className="text-center mt-5 mb-5" style={{ fontSize: '2rem', opacity: 0.5 }}><i className="mt-3 icon icon-spin icon-circle-notch fas"/></div>
                </div>
            );
        }

        const resultKey = "_results";
        const url = queries.url;
        const sectionClassName = sectionStyle['sectionClassName'] || "col-12";
        const labelClassName = sectionStyle['labelClassName'] || "col-2";
        const listingClassName = sectionStyle['listingClassName'] || "col-10";
        const bodyProps = {
            groupingProperties, fieldChangeMap, valueChangeMap, columnGrouping, headerColumnsOrder,
            listingClassName, labelClassName, colorRanges, columnGroups
        };
        
        const configurator = !disableConfigurator && (
            <DataMatrixConfigurator
                columnDimensions={allowedFields}
                rowDimensions={allowedFields}
                searchUrl={queries.url}
                selectedColumnValue={queries.url_fields[0]}
                selectedRow1Value={queries.url_fields[1]}
                selectedRow2Value={queries.url_fields.length > 2 ? queries.url_fields[2] : null}
                headerColumnsOrderValue={headerColumnsOrder}
                colorRanges={colorRanges}
                onApply={this.onApplyConfiguration}
            />
        );
        
        const body = (
            <div className={sectionClassName}>
                {configurator}
                {/* { (headerFor && headerFor) || {null} } */}
                <VisualBody
                    {..._.pick(this.props, 'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
                    queryUrl={url}
                    {...bodyProps}
                    duplicateHeaders={false}
                    columnSubGrouping="state"
                    // eslint-disable-next-line react/destructuring-assignment
                    results={this.state[resultKey]}
                    //defaultDepthsOpen={[true, false, false]}
                    //keysToInclude={[]}
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

const TEST_DATA = {
    "field": "donors.display_title",
    "terms":
    {
        "ISLET1":
        {
            "term": "ISLET1",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 2790
            },
            "terms":
            {
                "scDip-C":
                {
                    "files": 2790
                }
            },
            "other_doc_count": 0
        },
        "DONOR_LB":
        {
            "term": "DONOR_LB",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 238
            },
            "terms":
            {
                "WGS":
                {
                    "files": 233
                },
                "HAT-seq":
                {
                    "files": 3
                },
                "RNA-seq":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "COLO829":
        {
            "term": "COLO829",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 228
            },
            "terms":
            {
                "WGS":
                {
                    "files": 193
                },
                "Fiber-seq":
                {
                    "files": 12
                },
                "NanoSeq":
                {
                    "files": 8
                },
                "Ultra-Long WGS":
                {
                    "files": 8
                },
                "HiDEF-seq":
                {
                    "files": 4
                },
                "RNA-seq":
                {
                    "files": 4
                },
                "HAT-seq":
                {
                    "files": 2
                },
                "varCUT&Tag":
                {
                    "files": 2
                },
                "ATAC-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "LIBD75":
        {
            "term": "LIBD75",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 220
            },
            "terms":
            {
                "Single-cell MALBAC WGS":
                {
                    "files": 215
                },
                "TEnCATS":
                {
                    "files": 3
                },
                "WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "NC0":
        {
            "term": "NC0",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 200
            },
            "terms":
            {
                "scStrand-seq":
                {
                    "files": 182
                },
                "Single-cell PTA WGS":
                {
                    "files": 9
                },
                "WGS":
                {
                    "files": 9
                }
            },
            "other_doc_count": 0
        },
        "ST002":
        {
            "term": "ST002",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 81
            },
            "terms":
            {
                "WGS":
                {
                    "files": 56
                },
                "NanoSeq":
                {
                    "files": 18
                },
                "RNA-seq":
                {
                    "files": 5
                },
                "Kinnex":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "ST001":
        {
            "term": "ST001",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 78
            },
            "terms":
            {
                "WGS":
                {
                    "files": 52
                },
                "NanoSeq":
                {
                    "files": 17
                },
                "RNA-seq":
                {
                    "files": 6
                },
                "Kinnex":
                {
                    "files": 2
                },
                "Fiber-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "936_49F":
        {
            "term": "936_49F",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 36
            },
            "terms":
            {
                "scVISTA-seq":
                {
                    "files": 30
                },
                "Microbulk VISTA-seq":
                {
                    "files": 3
                },
                "VISTA-seq":
                {
                    "files": 3
                }
            },
            "other_doc_count": 0
        },
        "ST003":
        {
            "term": "ST003",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 30
            },
            "terms":
            {
                "WGS":
                {
                    "files": 19
                },
                "NanoSeq":
                {
                    "files": 9
                },
                "Kinnex":
                {
                    "files": 1
                },
                "RNA-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "ST004":
        {
            "term": "ST004",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 28
            },
            "terms":
            {
                "WGS":
                {
                    "files": 17
                },
                "NanoSeq":
                {
                    "files": 8
                },
                "RNA-seq":
                {
                    "files": 2
                },
                "Fiber-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "P5246":
        {
            "term": "P5246",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 23
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 21
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "CB0":
        {
            "term": "CB0",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 22
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 20
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P5844":
        {
            "term": "P5844",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 20
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 18
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P5818":
        {
            "term": "P5818",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 17
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 15
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "SMHT008":
        {
            "term": "SMHT008",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 16
            },
            "terms":
            {
                "WGS":
                {
                    "files": 15
                },
                "RNA-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "P1740":
        {
            "term": "P1740",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 15
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 13
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P4643":
        {
            "term": "P4643",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 15
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 13
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P5182":
        {
            "term": "P5182",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 15
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 13
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P4546":
        {
            "term": "P4546",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 14
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 12
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P4925":
        {
            "term": "P4925",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 11
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 9
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "P5554":
        {
            "term": "P5554",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 11
            },
            "terms":
            {
                "CompDuplex-seq":
                {
                    "files": 9
                },
                "PCR WGS":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "SMHT004":
        {
            "term": "SMHT004",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 10
            },
            "terms":
            {
                "WGS":
                {
                    "files": 10
                }
            },
            "other_doc_count": 0
        },
        "UMB1465":
        {
            "term": "UMB1465",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 7
            },
            "terms":
            {
                "ATAC-seq":
                {
                    "files": 4
                },
                "CODEC":
                {
                    "files": 2
                },
                "PCR WGS":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "UMB5278":
        {
            "term": "UMB5278",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 4
            },
            "terms":
            {
                "CODEC":
                {
                    "files": 2
                },
                "ATAC-seq":
                {
                    "files": 1
                },
                "PCR WGS":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "SN001":
        {
            "term": "SN001",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 2
            },
            "terms":
            {
                "varCUT&Tag":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "SN002":
        {
            "term": "SN002",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 2
            },
            "terms":
            {
                "varCUT&Tag":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "SN003":
        {
            "term": "SN003",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 2
            },
            "terms":
            {
                "varCUT&Tag":
                {
                    "files": 2
                }
            },
            "other_doc_count": 0
        },
        "UMB1864":
        {
            "term": "UMB1864",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 1
            },
            "terms":
            {
                "ATAC-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "UMB4428":
        {
            "term": "UMB4428",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 1
            },
            "terms":
            {
                "ATAC-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        },
        "UMB4638":
        {
            "term": "UMB4638",
            "field": "file_sets.libraries.assay.display_title",
            "total":
            {
                "files": 1
            },
            "terms":
            {
                "ATAC-seq":
                {
                    "files": 1
                }
            },
            "other_doc_count": 0
        }
    },
    "total":
    {
        "files": 4140
    },
    "other_doc_count": 2,
    "time_generated": "2025-03-27 12:38:40.553343"
};
