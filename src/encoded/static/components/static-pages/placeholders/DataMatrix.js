'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { console, object, ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { VisualBody } from '../components';


export class DataMatrix extends React.PureComponent {

    static defaultProps = {
        "queries": {
            "url": "https://www.encodeproject.org/search/?type=Experiment&biosample_summary=H1-hESC&biosample_summary=HFFc6&status!=archived&status!=revoked&limit=all",
            "url_fields": ["assay_slims", "biosample_summary", "assay_term_name", "description", "lab", "status"]
        },
        "valueChangeMap": {
            "cell_type": {
                "H1": "H1-hESC"
            },
            "state": {
                "released": "Submitted"
            }
        },
        "fieldChangeMap": {
            "experiment_category": "assay_slims",
            "experiment_type": "assay_term_name",
            "cell_type": "biosample_summary",
            "lab_name": "lab.title",
            "short_description": "description",
            "state": "status"
        },
        "groupingProperties": ["experiment_category", "experiment_type"],
        "columnGrouping": "cell_type",
        "headerFor": <h3 className="mt-2 mb-0 text-300">ENCODE</h3>,
        "sectionStyle": {
            "sectionClassName": "col-6",
            "labelClassName": "col-4",
            "listingClassName": "col-8"
        },
        "fallbackNameForBlankField" : "None",
        /** Which state to set/prioritize if multiple expsets per group */
        "statePrioritizationForGroups" : ["Submitted", "Internal Release", "In Submission", "Planned", "Out of date", "Deleted"],
        "headerPadding"             : 300,
        "headerColumnsOrder"        : ["H1-hESC", "H1-DE", "HFFc6"],
        "titleMap"                  : {
            "sub_cat"                   : "AnyStringHereBecauseSubCatTitleIsUsed",
            "experiment_type"           : "Experiment Type",
            "cell_type"                 : "Cell Type",
            "lab_name"                  : "Lab",
            "experiment_category"       : "Category",
            "state"                     : "Submission Status",
            "short_description"         : "Description",
        },
        "columnSubGroupingOrder": ["Submitted", "In Submission", "Planned", "Not Planned"],
        "colorLevelClassMap": function (data) {
            const dataLength = data?.length || 0;
            if (dataLength < 10) {
                return 'bg-color-low';
            } else if (dataLength >= 10 && dataLength < 20) {
                return 'bg-color-medium';
            } else {
                return 'bg-color-high';
            }
        }
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
        'additionalData': PropTypes.object
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
        this.state = {
            "mounted"  : false,
            "_results" : null
        };
    }

    standardizeResult(result){
        const { fallbackNameForBlankField, statusStateTitleMap, fieldChangeMap : propFieldChangeMap, valueChangeMap, groupingPropertiesSearchParamMap } = this.props;
        const fieldChangeMap = propFieldChangeMap || groupingPropertiesSearchParamMap; // prop name `groupingPropertiesSearchParamMap` has been deprecated.

        const fullResult = DataMatrix.convertResult(
            result, fieldChangeMap, valueChangeMap, statusStateTitleMap, fallbackNameForBlankField
        );

        // Remove accessions from short description(s).
        if (fieldChangeMap.short_description && fieldChangeMap.short_description === "experiments_in_set.display_title"){
            let experiment_titles = _.map(result.experiments_in_set || [], function(exp){
                return exp.display_title.replace(" - " + exp.accession, "");
            });
            experiment_titles = _.uniq(experiment_titles);
            if (experiment_titles.length > 1){
                console.warn("We have 2+ experiment titles (experiments_in_set.display_title, minus accession) for ", result);
            }
            _.extend(fullResult, { "short_description" : experiment_titles[0] || null });
        }

        // Remove sub_cat_title & sub_cat (special case) if are "Default" & "None"
        if (fullResult.sub_cat === fallbackNameForBlankField && fullResult.sub_cat_title === "Default"){
            delete fullResult.sub_cat;
            delete fullResult.sub_cat_title;
        }

        return fullResult;
    }

    componentDidMount(){
        this.setState({ "mounted" : true });
        this.loadSearchQueryResults();
    }

    componentDidUpdate(pastProps, pastState){
        const { session } = this.props;
        if (session !== pastProps.session){
            this.loadSearchQueryResults();
        }
    }

    loadSearchQueryResults(){

        const commonCallback = (result) => {
            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = result["@graph"] || [];
            updatedState[resultKey] = _.map(updatedState[resultKey], (r) => this.standardizeResult(r));

            this.setState(updatedState);
        };

        const commonFallback = (result) => {
            const resultKey = "_results";
            const updatedState = {};
            updatedState[resultKey] = false;
            this.setState(updatedState);
        };

        const { queries } = this.props;
        this.setState(
            { "_results": null }, // (Re)Set all result states to 'null'
            () => {
                    // eslint-disable-next-line react/destructuring-assignment
                    let requestUrl = queries.url;
                    // eslint-disable-next-line react/destructuring-assignment
                    const requestUrlFields = queries.url_fields;

                    if (typeof requestUrl !== 'string' || !requestUrl) return;

                    if (Array.isArray(requestUrlFields) && requestUrlFields.length > 0) {
                        _.forEach(requestUrlFields, function (f) {
                            requestUrl += '&field=' + encodeURIComponent(f);
                        });
                    }
                    // Exclude 'Authorization' header for requests to different domains (not allowed).
                    const excludedHeaders = (requestUrl.slice(0, 4) === 'http') ? ['Authorization', 'Content-Type'] : null;
                    ajax.load(requestUrl, (r) => commonCallback(r), 'GET', (r) => commonFallback(r), null, {}, excludedHeaders);
            }
        );
    }

    render() {
        const {
            queries, groupingProperties, columnGrouping, headerFor, sectionStyle, colorLevelClassMap: propColorLevelClassMap,
            fieldChangeMap, valueChangeMap, additionalData
        } = this.props;

        const isLoading = 
                // eslint-disable-next-line react/destructuring-assignment
                this.state['_results'] === null && queries &&
                queries.url !== null && typeof queries.url !== 'undefined';

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
        const colorLevelClassMap = propColorLevelClassMap || null;
        const additional = additionalData;
        const body = (
            <div className={sectionClassName}>
                {/* { (headerFor && headerFor) || {null} } */}
                <VisualBody
                    {..._.pick(this.props, 'headerColumnsOrder',
                        'titleMap', 'statePrioritizationForGroups', 'fallbackNameForBlankField', 'headerPadding')}
                    queryUrl={url}
                    groupingProperties={groupingProperties}
                    fieldChangeMap={fieldChangeMap}
                    valueChangeMap={valueChangeMap}
                    columnGrouping={columnGrouping}
                    additionalData={additional}
                    duplicateHeaders={false}
                    columnSubGrouping="state"
                    labelClassName={labelClassName}
                    listingClassName={listingClassName}
                    colorLevelClassMap={colorLevelClassMap}
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
