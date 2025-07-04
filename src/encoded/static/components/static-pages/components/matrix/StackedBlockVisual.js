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
import { roundLargeNumber } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';
import { isPrimitive } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/misc';

const FALLBACK_GROUP_NAME = 'N/A';

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

export class VisualBody extends React.PureComponent {

    static blockRenderedContents(data, blockProps){
        var count = 0;
        if (Array.isArray(data)) {
            count = data.length;
        } else if (data) {
            count = 1;
        }
        if (count >= 1000){
            const decimal = count >= 10000 ? 0 : 1;
            return <span style={{ 'fontSize' : '0.80rem', 'position' : 'relative', 'top' : -1 }} data-tip={count}>{ roundLargeNumber(count, decimal) }</span>;
        }
        else if (count >= 100){
            return <span style={{ 'fontSize' : '0.90rem', 'position' : 'relative', 'top' : -1 }}>{ count }</span>;
        }
        return <span>{ count }</span>;
    }
    /**
     * replacement of underscore's invert function.
     * While underscore's invert requires all of object's values should be
     * unique and string serializable, VisualBody.invert allows multiple
     * mappings and convert them to array.
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

    constructor(props){
        super(props);
        this.blockPopover = this.blockPopover.bind(this);
    }

    /**
     * @param {*} data A File or list of Files, represented by a block/tile.
     * @param {Object} props Props passed in from the StackedBlockVisual Component instance.
     */
    blockPopover(data, blockProps, parentGrouping){
        const {
            query: { url: queryUrl, columnAggFields },
            fieldChangeMap, valueChangeMap, titleMap,
            groupingProperties, columnGrouping, compositeValueSeparator
        } = this.props;
        const { depth, blockType = null, columnToRowsMapping, popoverPrimaryTitle, rowGroups, rowGroupKey } = blockProps;
        const isGroup = (Array.isArray(data) && data.length >= 1) || false;
        let aggrData;

        if (!isGroup && Array.isArray(data)){
            data = data[0];
        }

        if (isGroup){
            const keysToInclude = _.uniq(_.keys(titleMap).concat([columnGrouping]).concat(groupingProperties)).concat(['primary_field_override']);
            aggrData = StackedBlockVisual.aggregateObjectFromList(
                data, keysToInclude, [] // We use this property as an object key (string) so skip parsing to React JSX list;
            );
        } else {
            aggrData = data;
        }

        if(!aggrData){
            return;
        }

        const primaryGroupingProperty = groupingProperties[0] || null;
        const primaryGroupingPropertyTitle = popoverPrimaryTitle || (primaryGroupingProperty && titleMap[primaryGroupingProperty]) || primaryGroupingProperty || null;
        let primaryGroupingPropertyValue = aggrData[primaryGroupingProperty];
        const secondaryGroupingProperty = groupingProperties[1] || null;
        const secondaryGroupingPropertyTitle = (secondaryGroupingProperty && titleMap[secondaryGroupingProperty]) || secondaryGroupingProperty || null;
        const secondaryGroupingPropertyValue = aggrData[secondaryGroupingProperty];

        // Generate title area which shows current grouping vals.
        const yAxisGroupingTitle = (columnGrouping && titleMap[columnGrouping]) || columnGrouping || null;
        let yAxisGroupingValue = null;
        if(isGroup){
            yAxisGroupingValue = data[0][columnGrouping];
            if (blockType === 'row-summary') {
                yAxisGroupingValue = _.uniq(_.pluck(data, columnGrouping)).length > 1 ? 'Multiple' : data[0][columnGrouping];
            }
        } else {
            yAxisGroupingValue = data[columnGrouping];
        }

        // for column summaries, find a way to assign value instead of '-' placeholder to supply more information
        if (!primaryGroupingPropertyValue && yAxisGroupingValue && (blockType === 'col-summary') && columnToRowsMapping && columnToRowsMapping[yAxisGroupingValue]?.length > 0) {
            // If primaryGroupingPropertyValue is not set, we try to get it from columnToRowsMapping
            // which is a map of columnGrouping to groupingProperties.
            primaryGroupingPropertyValue = columnToRowsMapping[yAxisGroupingValue].length > 1 ? 'Multiple' : columnToRowsMapping[yAxisGroupingValue][0];
        }

        function makeSearchButton(disabled=false){
            const currentFilteringProperties = groupingProperties.slice(0, depth + 1).concat([columnGrouping]);
            const currentFilteringPropertiesPairs = _.map(currentFilteringProperties, function (property) {
                let facetField = fieldChangeMap[property] || property;
                let facetTerm = aggrData[property];
                if (valueChangeMap && valueChangeMap[property]) {
                    const reversedValChangeMapForCurrSource = VisualBody.invert(valueChangeMap[property]);
                    facetTerm = reversedValChangeMapForCurrSource[facetTerm] || facetTerm;
                }

                // workaround for the case when dataset is used as cell_line
                if (aggrData.primary_field_override && property === groupingProperties[0]) {
                    facetField = aggrData.primary_field_override;
                }

                //TODO: handle composite values in a smart way, this workaround is too hacky
                if (Array.isArray(columnAggFields) && columnAggFields.length >= 2 && facetTerm &&
                    compositeValueSeparator && typeof compositeValueSeparator === 'string') {
                    // If columnAggFields is an array, we assume the first element is the field and the second is the extended term.
                    if (typeof facetTerm === 'string' && facetTerm.indexOf(compositeValueSeparator) > -1) {
                        let extendedFacetTerm;
                        [facetTerm, extendedFacetTerm] = facetTerm.split(compositeValueSeparator);
                        return [[facetField, facetTerm], [columnAggFields[1], extendedFacetTerm]];
                    } else if (Array.isArray(facetTerm) && _.all(_.map(facetTerm, (term) => typeof term === 'string' && term.indexOf(compositeValueSeparator) > -1))) {
                        // If facetTerm is an array, we assume all elements are strings with the same format.
                        return [[facetField, facetTerm[0].split(compositeValueSeparator)[0]], [columnAggFields[1], _.map(facetTerm, (term) => term.split(compositeValueSeparator)[1])]];
                    }
                }

                return [facetField, facetTerm];
            });

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

            const currentFilteringPropertiesVals = convertPairsToObject(currentFilteringPropertiesPairs);//_.object(currentFilteringPropertiesPairs);

            let initialHref = queryUrl;
            if(rowGroups && rowGroupKey && rowGroups[rowGroupKey]?.customUrlParams && blockType === 'col-summary')
            {
                // If rowGroups is defined and rowGroupKey is set, we use customUrlParams from rowGroups
                initialHref += '&' + rowGroups[rowGroupKey].customUrlParams;
            }

            const hrefParts = url.parse(initialHref, true);
            const hrefQuery = _.clone(hrefParts.query);

            _.forEach(currentFilteringPropertiesPairs, ([field]) => {
                if (hrefQuery[field]) delete hrefQuery[field];
                if (hrefQuery[field + '!']) delete hrefQuery[field + '!'];
            });

            //override path
            hrefParts.pathname = '/search/';
            delete hrefQuery.limit;
            delete hrefQuery.field;
            _.extend(hrefQuery, currentFilteringPropertiesVals);
            hrefParts.search = '?' + queryString.stringify(hrefQuery);
            const linkHref = url.format(hrefParts);

            return (
                <Button disabled={disabled} href={linkHref} target="_blank" variant="primary" className="w-100 mt-1">Browse Files</Button>
            );
        }

        // We will render only values shown in titleMap _minus_ groupingProperties & columnGrouping
        const keysToShow = _.without(_.keys(titleMap), columnGrouping, ...groupingProperties);
        const keyValsToShow = _.pick(aggrData, ...keysToShow);

        const viewButtonDisabled = false;
        return (
            <Popover id="jap-popover">
                <Popover.Body>
                    {isGroup ?
                        <div className="inner">
                            <div className="row primary-row pb-1 pt-1">
                                <div className="col-6">
                                    <div className="text-400 me-05 text-capitalize text-muted">{primaryGroupingPropertyTitle}</div>
                                    <div className="text-500">{primaryGroupingPropertyValue || '-'}</div>
                                </div>
                                <div className="col-6 text-end">
                                    <div className="text-400 me-05 text-capitalize text-muted">{yAxisGroupingTitle}</div>
                                    <div className="text-500">{yAxisGroupingValue || '-'}</div>
                                </div>
                            </div>
                            <div className="row secondary-row pb-1 mt-1">
                                <div className="col-5">
                                    {depth > 0 ? (
                                        <React.Fragment>
                                            <div className="label text-400 text-capitalize text-muted">{secondaryGroupingPropertyTitle}:</div>
                                            <div className="value text-500"><span className="text-success me-05">●</span>{secondaryGroupingPropertyValue}</div>
                                        </React.Fragment>
                                    ) : null}
                                </div>
                                <div className="col-7 text-end">
                                    <div className="label text-400 text-muted">Total Files</div>
                                    <div className="value text-600">{data.length}</div>
                                </div>
                            </div>
                            {StackedBlockVisual.generatePopoverRowsFromJSON(keyValsToShow, this.props)}
                            {makeSearchButton(viewButtonDisabled)}
                        </div>
                        :
                        <div className="inner">
                            <h5 className="text-400 mt-08 mb-15 text-center"><b>{"title"}</b></h5>
                            <hr className="mt-0 mb-1" />
                            {StackedBlockVisual.generatePopoverRowsFromJSON(keyValsToShow, this.props)}
                            {makeSearchButton(viewButtonDisabled)}
                        </div>
                    }
                </Popover.Body>
            </Popover>
        );

    }

    render(){
        const { results } = this.props;
        return (
            <StackedBlockVisual data={results} checkCollapsibility
                {..._.pick(this.props,
                    'groupingProperties', 'columnGrouping', 'titleMap', 'headerPadding',
                    'columnSubGrouping', 'defaultDepthsOpen',
                    'columnSubGroupingOrder', 'colorRanges',
                    'columnGroups', 'showColumnGroups', 'columnGroupsExtended', 'showColumnGroupsExtended',
                    'rowGroups', 'showRowGroups', 'rowGroupsExtended', 'showRowGroupsExtended',
                    'summaryBackgroundColor', 'xAxisLabel', 'yAxisLabel', 'showAxisLabels', 'showColumnSummary')}
                blockPopover={this.blockPopover}
                blockRenderedContents={VisualBody.blockRenderedContents}
            />
        );
    }
}

export class StackedBlockVisual extends React.PureComponent {

    static defaultProps = {
        'groupingProperties' : ['grant_type', 'center_name',  'lab_name'],
        'columnGrouping' : null,
        'blockHeight' : 28,
        'blockWidth': 35,
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

    static generatePopoverRowsFromJSON(d, props){
        const { groupingProperties, columnGrouping, titleMap } = props;
        const out = [];

        _.forEach(_.keys(d), function(property){
            let val = d[property];
            if (!val) return;

            const boldIt = (
                (groupingProperties && groupingProperties.indexOf(property) > -1) ||
                (columnGrouping && columnGrouping === property)
            );

            if (typeof val === 'object'){
                if (object.isAnItem(val)) {
                    val = object.itemUtil.generateLink(val, true, property);
                } else if (val.props && val.type) {
                    // Do nothing.
                } else {
                    val = <code>{ JSON.stringify(val) }</code>;
                }
            }

            const rowElem = (
                <div className="row popover-entry mb-07" key={property}>
                    <div className="col-5 col-md-4">
                        <div className="text-500 text-ellipsis-continer text-end">
                            { ((titleMap && titleMap[property]) || property) + (val ? ':' : '') }
                        </div>
                    </div>
                    <div className={"col-7 col-md-8" + (boldIt ? ' text-600' : '')}>{ val }</div>
                </div>
            );

            out.push(rowElem);
        });

        return out;
    }

    static aggregateObjectFromList = function(dataList, keysToShow, skipParsingKeys=null){

        if (!keysToShow) keysToShow = _.keys(dataList[0]);

        const moreData = _.reduce(
            dataList,
            function(m, o){
                var i, currKey;
                for (i = 0; i < keysToShow.length; i++){
                    currKey = keysToShow[i];
                    if (typeof o[currKey] === 'number'){
                        if (m[currKey] === null){
                            m[currKey] = 0;
                        }
                        m[currKey] += o[currKey];
                    } else {
                        if (m[currKey] === null){
                            m[currKey] = new Set();
                        }
                        m[currKey].add(o[currKey]);
                    }
                }
                return m;
            },
            _.object(_.zip(keysToShow, [].fill.call({ 'length' : keysToShow.length }, null, 0, keysToShow.length)))
        );

        const skipParsingKeysObj = Array.isArray(skipParsingKeys) && _.object(_.map(skipParsingKeys, function(k){ return [k, true]; }));

        // Convert vals (in Set form) to rendered JSX list
        _.forEach(_.keys(moreData), function(k){
            if (typeof moreData[k] === 'number'){ // Already handled above
                return;
            }

            moreData[k] = _.filter(Array.from(moreData[k]));

            if (moreData[k].length === 0){
                delete moreData[k];
            } else if (moreData[k].length > 1){
                if (skipParsingKeysObj && skipParsingKeysObj[k]){
                    return;
                }
                var showLength = 5,
                    remainingLength = moreData[k].length - showLength;

                if (_.any(moreData[k], function(md){ return md && typeof md === 'object'; })){
                    if (!_.every(moreData[k], object.itemUtil.isAnItem)) {
                        moreData[k] = <span className="text-600">({ moreData[k].length } <span className="text-400">Objects</span>)</span>;
                        return;
                    }
                    moreData[k] = _.uniq(moreData[k], false, object.itemUtil.atId);
                    if (moreData[k].length === 1) {
                        moreData[k] = moreData[k][0];
                        return;
                    }
                    var itemLinks = _.map(_.filter(moreData[k], function(md){ return md && typeof md === 'object' && md.display_title; }), object.itemUtil.generateLink);
                    if (itemLinks && itemLinks.length > 0) remainingLength = itemLinks.length - showLength;
                    moreData[k] = (
                        <div>
                            <span className="text-600">({ itemLinks.length || moreData[k].length } <span className="text-400">Objects</span>)</span>
                            <ol>
                                { _.map(itemLinks.slice(0,showLength), (v,i)=> <li key={i}>{ v }</li> ) }
                            </ol>
                            { remainingLength > 0 ? <div className="more-items-count"> and { remainingLength } more...</div> : null }
                        </div>
                    );
                    return;
                }

                moreData[k] = (
                    <div>
                        <ol>
                            { _.map(moreData[k].slice(0, showLength), (v,i)=> <li key={i}>{ v }</li> ) }
                        </ol>
                        { remainingLength > 0 ? <div className="more-items-count"> and { remainingLength } more...</div> : null }
                    </div>
                );

            } else {
                moreData[k] = moreData[k][0];
            }
        });

        return moreData;
    };

    static pluralize = function(input){
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

        this.state = state;
    }

    componentDidMount(){
        this.setState({ 'mounted' : true });
    }

    componentWillUnmount(){
        this.setState({ 'mounted' : false });
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

    renderContents(){
        const { data : propData, groupingProperties, columnGrouping, columnGroups, showColumnGroups, rowGroups, showRowGroups, showColumnSummary } = this.props;
        const { mounted, sorting, sortField, activeBlock, openBlock } = this.state;
        if (!mounted) return null;
        const tempData = [].concat(propData);

        const data = extendListObjectsWithIndex(tempData);
        const nestedData = groupByMultiple(data, groupingProperties); // { 'Grant1' : { Lab1: { PI1: [...], PI2: [...] }, Lab2: {} } }
        let groupedDataIndices = null;
        if (typeof columnGrouping === 'string'){
            groupedDataIndices = _.groupBy(data, columnGrouping);
            if (_.keys(groupedDataIndices) < 2) {
                groupedDataIndices = null;
            } else {
                _.keys(groupedDataIndices).forEach(function(k){
                    groupedDataIndices[k] = _.pluck(groupedDataIndices[k], 'index');
                });
            }
        }

        if (!Array.isArray(nestedData) && nestedData) {
            let leftAxisKeys = _.keys(nestedData);

            if (sorting !== 'both') {
                //sort by counts
                if (typeof sortField !== 'undefined') {
                    const sortedKeys = [];
                    _.map(leftAxisKeys, (k) =>
                        sortedKeys.push(this.memoized.sortBlock(nestedData[k], groupedDataIndices, k, sortField))
                    );

                    if (sorting === 'asc') {
                        sortedKeys.sort((a, b) => a.count - b.count);
                    } else if (sorting === 'desc') {
                        sortedKeys.sort((a, b) => b.count - a.count);
                    }

                    //get sorted data keys
                    leftAxisKeys = _.map(sortedKeys, (key) =>
                        key['groupingKey']
                    );
                } else { //sort by row labels
                    if (sorting === 'asc') {
                        leftAxisKeys.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
                    } else if (sorting === 'desc') {
                        leftAxisKeys.sort((a, b) => b.toLowerCase().localeCompare(a.toLowerCase()));
                    }
                }
            } else {
                // leftAxisKeys.sort();
                leftAxisKeys = rowGroups ? StackedBlockGroupedRow.sortByArray(leftAxisKeys, StackedBlockGroupedRow.mergeValues(rowGroups)) : leftAxisKeys.sort();
            }
            const hasRowGroups = showRowGroups && rowGroups && _.keys(rowGroups).length > 0;
            const rowGroupsKeys = hasRowGroups ? [..._.keys(rowGroups), FALLBACK_GROUP_NAME] : null;

            // convert to { columnGrouping: [groupingProperties] }
            const columnToRowsMappingFunc = function (data) {
                const result = {};

                data.forEach((item) => {
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

            const columnsAndHeaderProps = {
                ...this.props,
                groupedDataIndices,
                activeBlock,
                openBlock,
                handleBlockClick: this.handleBlockClick,
                handleBlockMouseEnter: this.handleBlockMouseEnter,
                handleBlockMouseLeave: this.handleBlockMouseLeave,
                columnToRowsMapping: columnToRowsMappingFunc(tempData),
            };

            if (rowGroupsKeys) {
                let outerIdx = -1;
                return (
                    <React.Fragment>
                        {StackedBlockGroupedRow.columnsAndHeader(columnsAndHeaderProps)}
                        {
                            _.map(rowGroupsKeys, (groupKey, groupKeyIdx) => {
                                const { values, backgroundColor, textColor } = rowGroups[groupKey] || { values: [], backgroundColor: '#ffffff', textColor: '#000000' };

                                let rowKeys = [];
                                if (groupKey === FALLBACK_GROUP_NAME) { //special case for N/A
                                    const allValues = StackedBlockGroupedRow.mergeValues(rowGroups);
                                    // not intersecting childRowsKeys and allValues
                                    rowKeys = StackedBlockGroupedRow.difference(leftAxisKeys, allValues);
                                } else {
                                    rowKeys = StackedBlockGroupedRow.intersection(leftAxisKeys, values || []);
                                }

                                const containerSectionStyle = { backgroundColor: backgroundColor, color: textColor };
                                if (showColumnSummary || groupKeyIdx > 0) {
                                    containerSectionStyle['marginTop'] = 20;
                                }
                                const labelSectionStyle = { };
                                const hasColumnGroups = showColumnGroups && columnGroups && _.keys(columnGroups).length > 0;
                                let columnKeys = _.keys(groupedDataIndices);
                                if (hasColumnGroups) {
                                    columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, StackedBlockGroupedRow.mergeValues(columnGroups));
                                }
                                const columnWidth = 44;
                                const headerItemStyle = {};

                                return _.map(rowKeys, (k, idx) => {
                                    let rowGroupsSummaryProps = null;
                                    if (idx === 0) {
                                        const tmpData = _.flatten(_.flatten(_.map(_.pick(nestedData, (v, k) => rowKeys.indexOf(k) !== -1), _.values)));
                                        let filteredGroupedDataIndices = _.groupBy(tmpData, columnGrouping);
                                        if (_.keys(filteredGroupedDataIndices) < 2) {
                                            filteredGroupedDataIndices = null;
                                        } else {
                                            _.keys(filteredGroupedDataIndices).forEach(function (k) {
                                                filteredGroupedDataIndices[k] = _.pluck(filteredGroupedDataIndices[k], 'index');
                                            });
                                        }

                                        const columnToRowsMapping = columnToRowsMappingFunc(tmpData);

                                        rowGroupsSummaryProps = {
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

                                    outerIdx++;
                                    return (
                                        <React.Fragment>
                                            {rowGroupsSummaryProps && StackedBlockGroupedRow.rowGroupsSummary(rowGroupsSummaryProps)}
                                            <StackedBlockGroupedRow {...this.props} groupedDataIndices={groupedDataIndices} parentState={this.state} data={nestedData[k]}
                                                key={k} group={k} depth={0} index={outerIdx} toggleGroupingOpen={this.toggleGroupingOpen}
                                                onSorterClick={this.handleSorterClick} sorting={sorting} sortField={sortField}
                                                handleBlockMouseEnter={this.handleBlockMouseEnter} handleBlockMouseLeave={this.handleBlockMouseLeave} handleBlockClick={this.handleBlockClick}
                                                activeBlock={activeBlock} openBlock={openBlock} popoverPrimaryTitle={groupKey} />
                                        </React.Fragment>
                                    );
                                });
                            })
                        }
                    </React.Fragment>
                );
            } else {
                return (
                    <React.Fragment>
                        {StackedBlockGroupedRow.columnsAndHeader(columnsAndHeaderProps)}
                        {
                            _.map(leftAxisKeys, (k, idx) =>
                                <StackedBlockGroupedRow {...this.props} groupedDataIndices={groupedDataIndices} parentState={this.state} data={nestedData[k]}
                                    key={k} group={k} depth={0} index={idx} toggleGroupingOpen={this.toggleGroupingOpen}
                                    onSorterClick={this.handleSorterClick} sorting={sorting} sortField={sortField}
                                    handleBlockMouseEnter={this.handleBlockMouseEnter} handleBlockMouseLeave={this.handleBlockMouseLeave} handleBlockClick={this.handleBlockClick}
                                    activeBlock={activeBlock} openBlock={openBlock} />
                            )
                        }
                    </React.Fragment>
                );
            }
        } else {
            // TODO: Render ... plain blocks w/o left column?
        }

    }

    handleBlockMouseEnter = (columnIdx, rowIdx, rowKey, rowGroupKey) => {
        const { openBlock } = this.state;
        if (openBlock) return;
        this.setState({ activeBlock: (columnIdx !== null || rowIdx !== null) ? { columnIdx, rowIdx, rowKey, rowGroupKey } : null });
    };

    handleBlockMouseLeave = () => {
        this.setState({ activeBlock: null });
    };

    handleBlockClick = (columnIdx, rowIdx, rowKey, rowGroupKey) => {
        const openBlock = (columnIdx !== null || rowIdx !== null) ? { columnIdx, rowIdx, rowKey, rowGroupKey } : null;
        if (openBlock) {
            setTimeout(() => {
                this.setState({ openBlock: openBlock });
            }, 100);
        } else {
            this.setState({ openBlock: null });
        }
    };

    render() {
        const { openBlock, activeBlock } = this.state;
        let className = "stacked-block-viz-container";
        if (activeBlock) {
            className += ' has-active-block';
        }
        if (openBlock) {
            className += ' has-open-block';
        }
        return (
            <div className={className}>
                {this.renderContents()}
            </div>
        );
    }


}

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
            merged.push(...obj[tier].values);
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

    /** @todo Convert to functional memoized React component */
    static collapsedChildBlocks = memoize(function(data, props){

        var allChildBlocksPerChildGroup = null, // Forgot what this was -- seems to be null in /joint-analysis at least
            allChildBlocks = null;

        if (Array.isArray(data)){
            allChildBlocks = data;
        } else {
            allChildBlocks = StackedBlockGroupedRow.flattenChildBlocks(data);
        }

        if (typeof props.columnSubGrouping !== 'string' && !Array.isArray(data)) {
            allChildBlocksPerChildGroup = _.map(_.pairs(data), function(pair){
                return [pair[0], StackedBlockGroupedRow.flattenChildBlocks(pair[1])];
            });
        }

        const commonProps = _.pick(props, 'blockHeight', 'blockWidth', 'blockHorizontalSpacing', 'blockVerticalSpacing',
            'groupingProperties', 'depth', 'titleMap', 'blockClassName', 'blockRenderedContents',
            'groupedDataIndices', 'columnGrouping', 'blockPopover', 'colorRanges', 'summaryBackgroundColor',
            'activeBlock', 'openBlock', 'handleBlockMouseEnter', 'handleBlockMouseLeave', 'handleBlockClick', 'group', 'popoverPrimaryTitle');
        const width = (props.blockWidth + (props.blockHorizontalSpacing * 2)) + props.blockHorizontalExtend;
        const containerGroupStyle = {
            'width'         : width, // Width for each column
            'minWidth'      : width,
            'minHeight'     : props.blockHeight + props.blockVerticalSpacing,               // Height for each row
            'paddingLeft'   : props.blockHorizontalSpacing,
            'paddingRight'  : props.blockHorizontalSpacing,
            'paddingTop'    : props.blockVerticalSpacing
        };
        const groupedDataIndicesPairs = (props.groupedDataIndices && _.pairs(props.groupedDataIndices)) || [];
        let inner = null;
        let blocksByColumnGroup;
        let columnKeys;

        if (groupedDataIndicesPairs.length > 0){
            // If columns exist, distribute these blocks by column!
            // Otherwise (else statement @ end) we'll probably just stack em left-to-right.

            if (allChildBlocksPerChildGroup){
                // Generate block per each child or child group when nothing else to regroup by.

                blocksByColumnGroup = _.object(_.map(groupedDataIndicesPairs, function(pair){
                    var listOfIndicesForGroup = pair[1];
                    return [
                        pair[0],
                        _.filter(_.map(allChildBlocksPerChildGroup, function(cPair){
                            if (Array.isArray(cPair[1])){
                                var res = _.filter(cPair[1], function(cBlock){ return listOfIndicesForGroup.indexOf(cBlock.index) > -1; });
                                if (res.length > 0) return [cPair[0], res];
                                if (res.length === 0) return null;
                            } else if (listOfIndicesForGroup.indexOf(cPair[1].index) > -1){
                                return [cPair[0], [cPair[1]]];
                            } else return null;
                        }), function(block){ return block !== null; })];
                }));

                columnKeys = _.keys(blocksByColumnGroup);
                if (props.columnGroups && _.keys(props.columnGroups).length > 0){
                    // We need to sort the column keys by the order of the column groups.
                    columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, StackedBlockGroupedRow.mergeValues(props.columnGroups));
                }

                inner = _.map(columnKeys, function(k, colIdx){
                    return (
                        <div className="block-container-group" style={containerGroupStyle}
                            key={k} data-group-key={k}>
                            { _.map(blocksByColumnGroup[k], ([ key, blockData ], i) =>
                                <Block key={key || i} {...commonProps} data={blockData} indexInGroup={i} />
                            ) }
                        </div>
                    );
                });

            } else {
                blocksByColumnGroup = _.object(_.map(groupedDataIndicesPairs, function([ columnKey, listOfIndicesForGroup ]){
                    return [
                        columnKey,
                        _.filter(_.map(allChildBlocks, function(blockData){
                            if (listOfIndicesForGroup.indexOf(blockData.index) > -1){
                                return blockData;
                            } else {
                                return null;
                            }
                        }), function(block){ return block !== null; })];
                }));

                columnKeys = _.keys(blocksByColumnGroup);
                if (props.columnGroups && _.keys(props.columnGroups).length > 0){
                    // We need to sort the column keys by the order of the column groups.
                    columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, StackedBlockGroupedRow.mergeValues(props.columnGroups));
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
                        <div className="block-container-group" style={containerGroupStyle}
                            key={k} data-block-count={blocksForGroup.length} data-group-key={k}>
                            { _.map(blocksForGroup, function(blockData, i){
                                var parentGrouping = (props.titleMap && props.titleMap[props.groupingProperties[props.depth - 1]]) || null;
                                var subGrouping = (props.titleMap && props.titleMap[props.columnSubGrouping]) || null;
                                if (Array.isArray(blockData)) {
                                    // We have columnSubGrouping so these are -pairs- of (0) columnSubGrouping val, (1) blocks
                                    blockData = blockData[1];
                                }
                                return <Block key={i} {...commonProps} {...{ parentGrouping, subGrouping }} data={blockData} indexInGroup={i} rowIndex={props.index} colIndex={colIdx} />;
                            }) }
                        </div>
                    );
                });
                // add summary column block
                let rowSummaryBlock = null;
                const totalRowCount = _.reduce(_.map(blocksByColumnGroup, function(b){ return b.length; }), function(m, n){ return m + n; }, 0);
                if (totalRowCount > 0){
                    rowSummaryBlock = (
                        <div className="block-container-group" style={containerGroupStyle}
                            key={'total'} data-block-count={totalRowCount} data-group-key={'row-summary'}>
                            <Block {...commonProps} data={allChildBlocks} rowIndex={props.index} blockType="row-summary" />
                        </div>
                    );
                }
                inner.push(rowSummaryBlock);

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
        var initOpen = (Array.isArray(props.defaultDepthsOpen) && props.defaultDepthsOpen[props.depth]) || false;
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

    static columnsAndHeader(props) {
        const {
            blockWidth, blockHeight, blockHorizontalSpacing, blockVerticalSpacing, blockHorizontalExtend, headerPadding,
            columnGrouping, sorting, sortField, onSorterClick, groupedDataIndices, openBlock, activeBlock,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            summaryBackgroundColor, xAxisLabel, yAxisLabel, showAxisLabels, showColumnSummary
        } = props;

        const hasColumnGroups = showColumnGroups && columnGroups && _.keys(columnGroups).length > 0;
        const hasColumnGroupsExtended = showColumnGroupsExtended && columnGroupsExtended && _.keys(columnGroupsExtended).length > 0;

        const columnGroupsKeys = hasColumnGroups ? [..._.keys(columnGroups), FALLBACK_GROUP_NAME] : null;

        const rowHeight = blockHeight + (blockVerticalSpacing * 2) + 1;
        const columnWidth = (blockWidth + (blockHorizontalSpacing * 2)) + blockHorizontalExtend;
        const headerItemStyle = { 'width': columnWidth, 'minWidth': columnWidth };
        const sorterActiveStyle = _.extend({}, headerItemStyle);

        const extPadding = 60 + (hasColumnGroups ? 26 : 0) + (hasColumnGroupsExtended ? 30 : 0);
        const labelSectionStyle = { 'paddingTop': Math.max(0, headerPadding + extPadding - rowHeight) };
        const listSectionStyle = { 'paddingTop': headerPadding };

        let columnKeys = _.keys(groupedDataIndices);
        if (hasColumnGroups) {
            columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, StackedBlockGroupedRow.mergeValues(columnGroups));
        }
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
            label: yAxisLabel,
            labelSectionStyle,
            columnKeys,
            columnWidth,
            headerItemStyle,
        };

        return (
            <React.Fragment>
                <div className="grouping header-section-upper">
                    <div className="row grouping-row">
                        <div className="label-section d-flex flex-column" style={labelSectionStyle}>
                            {showAxisLabels &&
                                <div className="axis-container flex-grow-1">
                                    <div className="x-axis">{xAxisLabel || 'X'}</div>
                                    <div className="y-axis">
                                        <div className="y-label">{yAxisLabel || 'Y'}</div>
                                        <div className="y-arrow">↓</div>
                                    </div>

                                </div>
                            }
                        </div>
                        <div className="col list-section has-header header-for-viz" style={listSectionStyle}>
                            <div className="d-flex header-col-text">
                                {columnKeys.map(function (columnKey, colIndex) {
                                    const hasOpenBlock = openBlock?.columnIdx === colIndex;
                                    const hasActiveBlock = activeBlock?.columnIdx === colIndex;
                                    const className = 'column-group-header' + (hasOpenBlock ? ' open-block-column' : '') + (hasActiveBlock ? ' active-block-column' : '');
                                    return (
                                        <div key={'col-' + columnKey} className={className} style={headerItemStyle}>
                                            <div className="inner">
                                                <span>{columnKey}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {hasColumnGroups &&
                                <div className="d-flex header-group-text">
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
                                            const groupColumnWidth = colSpan * columnWidth;
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
                            }
                            {hasColumnGroupsExtended &&
                                <div className="d-flex header-group-text">
                                    {
                                        _.keys(columnGroupsExtended).map(function (groupExtendedKey) {
                                            const colCount = _.reduce(columnGroupsExtended[groupExtendedKey].values, function (memo, groupKey) {
                                                const count = StackedBlockGroupedRow.intersection(columnKeys, columnGroups[groupKey]?.values || []).length;
                                                return memo + count;
                                            }, 0);

                                            if (colCount === 0) return null;

                                            const groupColumnWidth = colCount * columnWidth;
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
                            }
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
                                    const style = (activeBlock?.column === colIndex) ? sorterActiveStyle : headerItemStyle;
                                    return (
                                        <div key={'col-' + columnKey} className={'column-group-header' + extraClassName} style={style}>
                                            <div data-index={columnKey} onClick={onSorterClick}>
                                                <span className={countSortIconClassName}>{countSortIcon}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
                {showColumnSummary && StackedBlockGroupedRow.rowGroupsSummary(rowGroupsSummaryProps)}
            </React.Fragment>
        );
    }

    static rowGroupsSummary({ label, labelSectionStyle, columnKeys, columnWidth, headerItemStyle, containerSectionStyle, ...props } ) {
        return (
            <div className="grouping header-section-lower" style={containerSectionStyle}>
                <div className="row grouping-row">
                    <div className="label-section" style={{ ...labelSectionStyle, paddingTop: props.blockVerticalSpacing }}>
                        <div className="label-container text-end" onClick={props.onSorterClick} style={{ height: '29px', marginBottom: '1px' }}>
                            <span className="float-start text-500 ps-05">{label}</span>
                            {/* <span className={labelSortIconClassName}>{labelSortIcon}</span> */}
                        </div>
                    </div>
                    <div className="col list-section has-header header-for-viz">
                        <div className="blocks-container d-flex header-summary">
                            {columnKeys.map(function (columnKey, colIndex) {
                                const columnTotal = props.groupedDataIndices[columnKey]?.length || 0;
                                const style = {
                                    'width': columnWidth, // Width for each column
                                    'minWidth': columnWidth,
                                    'minHeight': props.blockHeight + props.blockVerticalSpacing, // Height for each row
                                    'paddingLeft': props.blockHorizontalSpacing,
                                    'paddingRight': props.blockHorizontalSpacing,
                                    'paddingTop': props.blockVerticalSpacing
                                };

                                // converts {"Fiber-Seq": [1475, 1476], "Kinnex": [1506, 1507]} to [{ "Fiber-Seq": 1475 }, { "Fiber-Seq": 1476 }, { "Kinnex": 1506 }, { "Kinnex": 1507 }];
                                const toColumnSummaryData = (inputObj, keyField) => {
                                    const result = [];

                                    for (const [key, values] of Object.entries(inputObj)) {
                                        values.forEach((val) => {
                                            result.push({
                                                [keyField]: key,
                                                index: val
                                            });
                                        });
                                    }

                                    return result;
                                };
                                const columnSummaryData = toColumnSummaryData(_.pick(props.groupedDataIndices, columnKey), props.columnGrouping);
                                const hasOpenBlock = props.openBlock?.columnIdx === colIndex;
                                const hasActiveBlock = props.activeBlock?.columnIdx === colIndex;
                                const className = 'column-group-header' + (hasOpenBlock ? ' open-block-column' : '') + (hasActiveBlock ? ' active-block-column' : '');
                                return (
                                    <div key={'col-summary-' + columnKey} className={className} style={headerItemStyle}>
                                        <div className="block-container-group" style={style}
                                            key={'summary'} data-block-count={columnTotal} data-group-key={'column-summary'}>
                                            <Block {..._.omit(props, 'group')} data={columnSummaryData} colIndex={colIndex} blockType="col-summary" popoverPrimaryTitle={props.rowGroupKey} />
                                        </div>
                                    </div>
                                );
                            }, this)}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    render(){
        const {
            groupingProperties, depth, titleMap, group, blockHeight, blockVerticalSpacing, blockHorizontalSpacing,
            data, index, showGroupingPropertyTitles, checkCollapsibility,
            activeBlock, openBlock,
            rowGroupsExtended, showRowGroupsExtended } = this.props;
        const { open: stateOpen } = this.state;

        let groupingPropertyTitle = null;
        if (Array.isArray(groupingProperties) && groupingProperties[depth]){
            groupingPropertyTitle = titleMap[groupingProperties[depth]] || groupingProperties[depth];
        }

        const childRowsKeys = !Array.isArray(data) ? _.keys(data)/*.sort()*/ : null;
        const hasIdentifiableChildren = !checkCollapsibility ? true : (depth + 2 >= groupingProperties.length) && childRowsKeys && childRowsKeys.length > 0 && !(childRowsKeys.length === 1 && childRowsKeys[0] === 'No value');

        let open = stateOpen;
        if (open && !hasIdentifiableChildren) {
            open = false;
        }

        let className = "grouping depth-" + depth + (open ? ' open' : '') + (' row-index-' + index) + (!showGroupingPropertyTitles ? ' no-grouping-property-titles' : '');
        let toggleIcon = null;

        if (!Array.isArray(data) && data && hasIdentifiableChildren){
            toggleIcon = <i className={"clickable icon fas icon-fw icon-" + (open ? 'minus' : 'plus')} onClick={this.toggleOpen} />;
            className += ' may-collapse';
        } else { // ?
            toggleIcon = <i className="icon icon-fw" />;
        }
        const hasRowGroupsExtended = showRowGroupsExtended && rowGroupsExtended && _.keys(rowGroupsExtended).length > 0;
        const rowGroupsExtendedKeys = hasRowGroupsExtended ? [..._.keys(rowGroupsExtended), FALLBACK_GROUP_NAME] : null;

        const rowHeight = blockHeight + (blockVerticalSpacing * 2) + 1;
        const childBlocks = !open ? StackedBlockGroupedRow.collapsedChildBlocks(data, this.props) : (
            <div className="open-empty-placeholder" style={{ 'height' : rowHeight, 'marginLeft' : blockHorizontalSpacing }}/>
        );
        const maxBlocksInRow  = childBlocks && Math.max.apply(Math.max, _.pluck(_.pluck((childBlocks && childBlocks.props && childBlocks.props.children) || [], 'props'), 'data-block-count'));
        const hasOpenBlock = openBlock?.rowIdx === index && openBlock?.rowKey === group;
        const hasActiveBlock = activeBlock?.rowIdx === index && activeBlock?.rowKey === group;
        const labelContainerClassName = 'label-container' + (hasOpenBlock ? ' open-block-row' : '') + (hasActiveBlock ? ' active-block-row' : '');
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
                                    data-tip={group && typeof group === 'string' && group.length > 20 ? group : null}>
                                    {toggleIcon}<span className="inner">{group}</span>
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
                            _.map(rowGroupsExtendedKeys, function (rgKey, idx) {
                                const { values, backgroundColor, textColor } = rowGroupsExtended[rgKey] || { values: [], backgroundColor: '#ffffff', textColor: '#000000' };

                                let rowGroupChildRowsKeys;
                                if (rgKey === FALLBACK_GROUP_NAME) { //special case for N/A
                                    const allValues = StackedBlockGroupedRow.mergeValues(rowGroupsExtended);
                                    // not intersecting childRowsKeys and allValues
                                    rowGroupChildRowsKeys = StackedBlockGroupedRow.difference(childRowsKeys, allValues);
                                } else {
                                    rowGroupChildRowsKeys = StackedBlockGroupedRow.intersection(childRowsKeys, values);
                                }
                                const rowSpan = rowGroupChildRowsKeys.length;

                                if (rowSpan === 0) return null;

                                const label = (rgKey.length > (rowSpan * 4)) && rowGroupsExtended[rgKey].shortName ? rowGroupsExtended[rgKey].shortName : rgKey;
                                return (
                                    <div className="vertical-container">
                                        <div className="vertical-container-label" style={{ backgroundColor, color: textColor, height: rowHeight * rowSpan }}>
                                            <span data-tip={rgKey !== label ? rgKey : null}>{label}</span>
                                        </div>
                                        <div className="vertical-container-rows">
                                            {
                                                _.map(rowGroupChildRowsKeys, (k) =>
                                                    <StackedBlockGroupedRow {...this.props} data={data[k]} key={k} group={k} depth={depth + 1} />
                                                )
                                            }
                                        </div>
                                    </div>
                                );
                            }, this)
                        }
                        {open && childRowsKeys && !hasRowGroupsExtended &&
                            <div className="child-blocks">
                                {open && childRowsKeys && _.map(childRowsKeys, (k) =>
                                    <StackedBlockGroupedRow {...this.props} data={data[k]} key={k} group={k} depth={depth + 1} />
                                )}
                            </div>
                        }
                    </div>

                </div>
            </React.Fragment>
        );
    }

}

const Block = React.memo(function Block(props){
    const {
        blockHeight, blockWidth, blockVerticalSpacing, data, parentGrouping, group,
        blockClassName, blockRenderedContents, blockPopover, indexInGroup, colorRanges, summaryBackgroundColor,
        handleBlockMouseEnter, handleBlockMouseLeave, handleBlockClick, rowIndex, colIndex, rowGroupKey, openBlock,
        blockType = 'regular'
    } = props;

    const style = {
        'height' : blockHeight,
        'width' : '100%', //blockWidth,
        //'lineHeight' : blockHeight + 'px',
        'marginBottom' : blockVerticalSpacing,
        'marginTop' : indexInGroup && indexInGroup > 0 ? blockVerticalSpacing + 1 : 0
    };

    const blockFxnArguments = [data, props, parentGrouping];

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

    let popover = null;
    if (typeof blockPopover === 'function'){
        popover = blockPopover.apply(blockPopover, blockFxnArguments);
    }

    const getColor = function (value, blockType = 'regular') {
        if (isSummaryBlock(blockType)){
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

    const dataLength = data?.length || 0;
    const color = getColor(dataLength, blockType);

    if (openBlock?.rowIdx === rowIndex && openBlock?.columnIdx === colIndex &&
        (blockType === 'col-summary' ? (openBlock?.rowGroupKey === rowGroupKey) : (openBlock?.rowKey === group))) {
        style['color'] = color;
        style['borderColor'] = color;
        style['pointerEvents'] = 'none'; // disable pointer events when block is open
        className += ' is-open-block';
    } else {
        style['backgroundColor'] = color;
    }

    const blockElem = (
        <div
            className={className}
            style={style}
            tabIndex={1}
            data-place="bottom"
            data-block-value={dataLength}
            data-block-type={blockType || 'regular'}
            onMouseEnter={() => typeof handleBlockMouseEnter === 'function' && handleBlockMouseEnter(colIndex, rowIndex, group, rowGroupKey)}
            onMouseLeave={handleBlockMouseLeave}
            onClick={()=> popover && handleBlockClick(colIndex, rowIndex, group, rowGroupKey)}>
            {contents}
        </div>
    );

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
    openBlock: PropTypes.shape({
        rowIdx: PropTypes.number,
        columnIdx: PropTypes.number,
        rowKey: PropTypes.string,
        rowGroupKey: PropTypes.string,
    }),
    blockType: PropTypes.oneOf(['regular', 'row-summary', 'col-summary'])
};

function isSummaryBlock(blockType) {
    return blockType === 'row-summary' || blockType === 'col-summary';
}
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
