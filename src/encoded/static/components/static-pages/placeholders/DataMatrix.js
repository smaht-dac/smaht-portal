'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, object, ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { VisualBody } from '../components';
import { DataMatrixConfigurator, updateColorRanges } from './DataMatrixConfigurator';


export class DataMatrix extends React.PureComponent {

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
        "headerColumnsOrder"        : [],
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
            "software.display_title",
            "file_format.display_title",
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
        'additionalData': PropTypes.object,
        'disableConfigurator': PropTypes.bool
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
            updatedState[resultKey] = result["@graph"] || [];
            updatedState[resultKey] = _.map(updatedState[resultKey], (r) => this.standardizeResult(r));

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

    onApplyConfiguration(searchUrl, column, row1, row2, ranges) {
        console.log(searchUrl, column, row1, row2, ranges);
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
            colorRanges: ranges
        });
    }

    render() {
        const { headerFor, sectionStyle, valueChangeMap, additionalData, allowedFields, disableConfigurator = false } = this.props;
        const { queries, fieldChangeMap, columnGrouping, groupingProperties, colorRanges } = this.state;

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
            groupingProperties, fieldChangeMap, valueChangeMap, columnGrouping,
            additionalData, listingClassName, labelClassName, colorRanges
        };
        
        const configurator = !disableConfigurator && (
            <DataMatrixConfigurator
                columnDimensions={allowedFields}
                rowDimensions={allowedFields}
                searchUrl={queries.url}
                selectedColumnValue={queries.url_fields[0]}
                selectedRow1Value={queries.url_fields[1]}
                selectedRow2Value={queries.url_fields.length > 2 ? queries.url_fields[2] : null}
                colorRanges={colorRanges}
                onApply={this.onApplyConfiguration}
            />
        );
        
        const body = (
            <div className={sectionClassName}>
                {configurator}
                {/* { (headerFor && headerFor) || {null} } */}
                <VisualBody
                    {..._.pick(this.props, 'headerColumnsOrder', 'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
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
