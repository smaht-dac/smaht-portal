'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, ajax, JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { VisualBody } from './StackedBlockVisual';
import { DataMatrixConfigurator, updateColorRanges } from './DataMatrixConfigurator';


export default class DataMatrix extends React.PureComponent {

    static defaultProps = {
        "query": {
            "url": "/data_matrix_aggregations/?type=File&limit=all",
            "columnAggFields": "",
            "rowAggFields": [""]
        },
        "valueChangeMap": {},
        "fieldChangeMap": {},
        "resultPostProcessFuncKey": null, // function to process results after they are loaded
        "groupingProperties": [],
        "columnGrouping": "",
        "headerFor": <h3 className="mt-2 mb-0 text-300">SMaHT</h3>,
        "fallbackNameForBlankField": "None",
        /** Which state to set/prioritize if multiple files per group */
        "statePrioritizationForGroups" : [],
        "headerPadding"             : 200,
        "columnGroups"              : null,
        "showColumnGroups"          : true,
        "columnGroupsExtended"      : null,
        "showColumnGroupsExtended"  : true,
        "rowGroups"                 : null,
        "showRowGroups"             : true,
        "autoPopulateRowGroupsProperty" : null,
        "rowGroupsExtended"         : null,
        "showRowGroupsExtended"     : true,
        "titleMap"                  : {},
        "columnSubGroupingOrder": [],
        "colorRangeBaseColor": null, // color hex or rgba code (if set, will override colorRanges)
        "colorRangeSegments": 5, // split color ranges into 5 equal parts
        "colorRangeSegmentStep": 20, // step size for each segment
        "summaryBackgroundColor": "#d91818",
        "allowedFields": [],
        "xAxisLabel": "X",
        "yAxisLabel": "Y",
        "showAxisLabels": true,
        "showColumnSummary": true,
        "defaultOpen": false,
        "compositeValueSeparator": " ",
        "disableConfigurator": true,
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
        'allowedFields': PropTypes.arrayOf(PropTypes.string),
        'columnGroups': PropTypes.object,
        'showColumnGroups': PropTypes.bool,
        'columnGroupsExtended': PropTypes.object,
        'showColumnGroupsExtended': PropTypes.bool,
        'rowGroups': PropTypes.object,
        'showRowGroups': PropTypes.bool,
        'autoPopulateRowGroupsProperty': PropTypes.string,
        'rowGroupsExtended': PropTypes.object,
        'showRowGroupsExtended': PropTypes.bool,
        'xAxisLabel': PropTypes.string,
        'yAxisLabel': PropTypes.string,
        'showAxisLabels': PropTypes.bool,
        'showColumnSummary': PropTypes.bool,
        'defaultOpen': PropTypes.bool,
        'compositeValueSeparator': PropTypes.string,
        'disableConfigurator': PropTypes.bool,
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
        this.setState({ "mounted": true });
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

            updatedState[resultKey] = result;
            let transfermedData = [];
            const populatedRowGroups = {}; // not implemented yet
            _.forEach(updatedState[resultKey], (r) => {
                if (fieldChangeMap) {
                    _.forEach(_.pairs(fieldChangeMap), function ([fieldToMapTo, fieldToMapFrom]) {
                        if (typeof r[fieldToMapFrom] !== 'undefined' && fieldToMapTo !== fieldToMapFrom) { // If present
                            r[fieldToMapTo] = r[fieldToMapFrom];
                            delete r[fieldToMapFrom];
                        }
                    }, {});
                }
                if (resultPostProcessFuncKey && typeof DataMatrix.resultPostProcessFuncs[resultPostProcessFuncKey] === 'function') {
                    r = DataMatrix.resultPostProcessFuncs[resultPostProcessFuncKey](r);
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
                if (autoPopulateRowGroupsProperty && r[autoPopulateRowGroupsProperty]) {
                    const rowGroupKey = r[autoPopulateRowGroupsProperty];
                    if (!populatedRowGroups[rowGroupKey]) {
                        populatedRowGroups[rowGroupKey] = [];
                    }
                    populatedRowGroups[rowGroupKey].push(r[groupingProperties[0]]);
                }
            });

            updatedState[resultKey] = transfermedData;

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
        this.setState({
            ...this.state,
            query: {
                ...this.state.query,
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
        });
    }

    getAllowedPropKeys() {
        return Object.keys(DataMatrix.propTypes);
    }

    getJsxExport() {
        const allowedKeys = Object.keys(DataMatrix.propTypes);
        const filteredProps = allowedKeys.reduce((acc, key) => {
            if (this.props.hasOwnProperty(key)) {
                acc[key] = this.state[key] || this.props[key];
            }
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
            return window.location.href.indexOf('data.smaht.org') >= 0 || window.location.href.indexOf('staging.smaht.org') >= 0;
        }
        return false;
    }

    render() {
        const {
            headerFor, valueChangeMap, allowedFields, compositeValueSeparator,
            disableConfigurator = false
        } = this.props;
        const {
            query, fieldChangeMap, columnGrouping, groupingProperties,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
            colorRanges, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary,
            colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep, summaryBackgroundColor,
            defaultOpen = false
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
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
            summaryBackgroundColor, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary, compositeValueSeparator,
        };

        const colAgg = Array.isArray(query.columnAggFields) ? query.columnAggFields : [query.columnAggFields];
        const rowAgg1 = Array.isArray(query.rowAggFields[0]) ? query.rowAggFields[0] : [query.rowAggFields[0]];
        const rowAgg2 = query.rowAggFields.length > 1 ? Array.isArray(query.rowAggFields[1]) ? query.rowAggFields[1] : [query.rowAggFields[1]] : null;
        const rowAgg3 = query.rowAggFields.length > 2 ? Array.isArray(query.rowAggFields[2]) ? query.rowAggFields[2] : [query.rowAggFields[2]] : null;

        const fieldToNameMap = _.invert(this.state.fieldChangeMap);

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
            <div className="static-section data-matrix">
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
        }
        return result;
    }
};
