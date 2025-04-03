'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _, { clone } from 'underscore';
import memoize from 'memoize-one';
import url from 'url';
import queryString from 'query-string';
import OverlayTrigger from 'react-bootstrap/esm/OverlayTrigger';
import { Popover, Button } from 'react-bootstrap';
import { console, object, logger } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { roundLargeNumber } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';


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
        const { groupingProperties, columnGrouping } = blockProps;
        var count = 0;
        if (Array.isArray(data)) {
            count = data.length;
        } else if (data) {
            count = 1;
        }
        if (count >= 1000){
            const decimal = count >= 10000 ? 0 : 1;
            return <span style={{ 'fontSize' : '0.70rem', 'position' : 'relative', 'top' : -1 }} data-tip={count}>{ roundLargeNumber(count, decimal) }</span>;
        }
        else if (count >= 100){
            return <span style={{ 'fontSize' : '0.80rem', 'position' : 'relative', 'top' : -1 }}>{ count }</span>;
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
        const { queryUrl, fieldChangeMap, valueChangeMap, titleMap, groupingProperties, columnGrouping } = this.props;
        const { depth } = blockProps;
        const isGroup = (Array.isArray(data) && data.length > 1) || false;
        let aggrData;

        const additionalItems = _.filter(data, function (item) { return item.is_additional_data === true; });

        if (!isGroup && Array.isArray(data)){
            data = data[0];
        }

        if (isGroup){
            const keysToInclude = _.uniq(_.keys(titleMap).concat(['sub_cat', 'sub_cat_title', columnGrouping]).concat(groupingProperties));
            aggrData = StackedBlockVisual.aggregateObjectFromList(
                data, keysToInclude, ['sub_cat_title'] // We use this property as an object key (string) so skip parsing to React JSX list;
            );

            // Custom parsing down into string -- remove 'Default' from list and ensure is saved as string.
            if (Array.isArray(aggrData.sub_cat_title)){
                aggrData.sub_cat_title = _.without(_.uniq(aggrData.sub_cat_title), 'Default');
                if (aggrData.sub_cat_title.length !== 1){ // If multiple or if none.
                    aggrData.sub_cat_title = 'Assay Details';
                } else {
                    aggrData.sub_cat_title = aggrData.sub_cat_title[0];
                }
            }
        } else {
            aggrData = data;
            if (aggrData.sub_cat_title && aggrData.sub_cat_title === "Default"){ // Or maybe remove entirely? <- handled in standardize4DNResult()
                aggrData.sub_cat_title = 'Assay Details';
            }
        }

        const groupingPropertyCurrent = groupingProperties[depth] || null;
        const groupingPropertyCurrentTitle = (
            groupingPropertyCurrent === 'sub_cat' ? aggrData['sub_cat_title'] // <- Special case
                : (groupingPropertyCurrent && titleMap[groupingPropertyCurrent]) || groupingPropertyCurrent || null
        );
        const groupingPropertyCurrentValue = aggrData[groupingPropertyCurrent];

        // Generate title area which shows current grouping vals.
        const yAxisGroupingTitle = (columnGrouping && titleMap[columnGrouping]) || columnGrouping || null;
        const yAxisGroupingValue = (isGroup ? data[0][columnGrouping] : data[columnGrouping]) || null;
        const popoverTitle = (
            <div className="clearfix matrix-popover-title">
                <div className="x-axis-title">
                    <div className="text-300">{groupingPropertyCurrentTitle}</div>
                    <div className="text-400">{groupingPropertyCurrentValue}</div>
                </div>
                <div className="mid-icon">
                    <i className="icon icon-times fas"/>
                </div>
                <div className="y-axis-title">
                    <div className="text-300">{yAxisGroupingTitle}</div>
                    <div className="text-400">{yAxisGroupingValue}</div>
                </div>
            </div>
        );

        function makeSearchButton(disabled=false){
            const currentFilteringProperties = groupingProperties.slice(0, depth + 1).concat([columnGrouping]);
            const currentFilteringPropertiesVals = _.object(
                _.map(currentFilteringProperties, function(property){
                    const facetField = fieldChangeMap[property];
                    let facetTerm = aggrData[property];
                    if (valueChangeMap && valueChangeMap[property]){
                        const reversedValChangeMapForCurrSource = VisualBody.invert(valueChangeMap[property]);
                        facetTerm = reversedValChangeMapForCurrSource[facetTerm] || facetTerm;
                    }
                    return [ facetField, facetTerm ];
                })
            );

            const initialHref = queryUrl;
            const hrefParts = url.parse(initialHref, true);
            const hrefQuery = _.clone(hrefParts.query);
            //override path
            hrefParts.pathname = '/search/';
            delete hrefQuery.limit;
            delete hrefQuery.field;
            _.extend(hrefQuery, currentFilteringPropertiesVals);
            hrefParts.search = '?' + queryString.stringify(hrefQuery);
            const linkHref = url.format(hrefParts);

            return (
                <Button disabled={disabled} href={linkHref} target="_blank" bsStyle="primary" className="w-100 mt-1">View Files</Button>
            );
        }

        function makeSingleItemButton(disabled=false) {
            let path = object.itemUtil.atId(data);
            const hrefParts = url.parse(queryUrl, true);
            if (hrefParts && hrefParts.hostname && hrefParts.protocol) {
                path = hrefParts.protocol + "//" + hrefParts.hostname + path;
            }// else will be abs path relative to current domain.
            return (
                <Button disabled={disabled} href={path} target="_blank" bsStyle="primary" className="w-100 mt-1">View File</Button>
            );
        }

        // We will render only values shown in titleMap _minus_ groupingProperties & columnGrouping
        const keysToShow = _.without(_.keys(titleMap), columnGrouping, ...groupingProperties);
        const keyValsToShow = _.pick(aggrData, ...keysToShow);

        // 'sub_cat' and 'sub_cat_title' are special case where we want sub_cat_title as key and sub_cat as value.
        if (
            (typeof titleMap.sub_cat !== 'undefined' || typeof titleMap.sub_cat_title !== 'undefined') &&
            (aggrData.sub_cat && aggrData.sub_cat !== 'No value' && aggrData.sub_cat_title)
        ){
            keyValsToShow[aggrData.sub_cat_title] = aggrData.sub_cat;
            delete keyValsToShow.sub_cat;
            delete keyValsToShow.sub_cat_title;
        }

        // format title by experiment set counts
        let title;
        const dataLength = Array.isArray(data) ? data.length : 1;
        const onlyNonAdditionalItemsCount = dataLength - additionalItems.length;
        if (onlyNonAdditionalItemsCount > 0 && additionalItems.length > 0) {
            title = `${dataLength} Experiment Set(s) (${additionalItems.length} - Planned)`;
        } else if (onlyNonAdditionalItemsCount > 0 && additionalItems.length === 0) {
            title = `${dataLength} File(s)`;
        } else if (onlyNonAdditionalItemsCount === 0 && additionalItems.length > 0) {
            title = `${additionalItems.length} - Planned Experiment Set(s)`;
        }

        const viewButtonDisabled = (onlyNonAdditionalItemsCount === 0 && additionalItems.length > 0) || false;
        return (
            <Popover id="jap-popover" title={popoverTitle} style={{ maxWidth : 540, width: '100%' }}>
                { isGroup ?
                    <div className="inner">
                        <h5 className="text-400 mt-08 mb-15 text-center"><b>{ title }</b></h5>
                        <hr className="mt-0 mb-1"/>
                        { StackedBlockVisual.generatePopoverRowsFromJSON(keyValsToShow, this.props) }
                        { makeSearchButton(viewButtonDisabled) }
                    </div>
                    :
                    <div className="inner">
                        <h5 className="text-400 mt-08 mb-15 text-center"><b>{title}</b></h5>
                        <hr className="mt-0 mb-1" />
                        {StackedBlockVisual.generatePopoverRowsFromJSON(keyValsToShow, this.props)}
                        { makeSearchButton(viewButtonDisabled)/* makeSingleItemButton(viewButtonDisabled) */}
                    </div>
                }
            </Popover>
        );

    }

    render(){
        const { results } = this.props;
        return (
            <StackedBlockVisual data={results} checkCollapsibility
                {..._.pick(this.props, 
                    'groupingProperties', 'columnGrouping', 'titleMap', 'headerPadding',
                    'columnSubGrouping', 'defaultDepthsOpen', 'duplicateHeaders', 'headerColumnsOrder',
                    'columnSubGroupingOrder', 'labelClassName', 'listingClassName', 'colorRanges', 'columnGroups')}
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
        'blockVerticalSpacing' : 2,
        'blockHorizontalSpacing' : 2,
        'duplicateHeaders' : true,
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
    }

    constructor(props){
        super(props);
        this.renderContents = this.renderContents.bind(this);
        this.handleSorterClick = _.throttle(this.handleSorterClick.bind(this), 250);
        var state = {
            'sorting' : 'both',
            'sortField': null,
            'mounted' : true,
            'activeRow': null,
            'activeColumn': null,
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
        const { data : propData, groupingProperties, columnGrouping } = this.props;
        const { mounted, sorting, sortField, activeRow, activeColumn } = this.state;
        if (!mounted) return null;
        let tempData = [].concat(propData);
        
        const data = extendListObjectsWithIndex(tempData);
        const nestedData = groupByMultiple(data, groupingProperties); // { 'Grant1' : { Lab1: { PI1: [...], PI2: [...] }, Lab2: {} } }
        let columnGroups = null;
        if (typeof columnGrouping === 'string'){
            columnGroups = _.groupBy(data, columnGrouping);
            if (_.keys(columnGroups) < 2) {
                columnGroups = null;
            } else {
                _.keys(columnGroups).forEach(function(k){
                    columnGroups[k] = _.pluck(columnGroups[k], 'index');
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
                        sortedKeys.push(this.memoized.sortBlock(nestedData[k], columnGroups, k, sortField))
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
                leftAxisKeys.sort();
            }

            return _.map(leftAxisKeys, (k, idx) =>
                <StackedBlockGroupedRow {...this.props} groupedDataIndices={columnGroups} parentState={this.state} data={nestedData[k]}
                    key={k} group={k} depth={0} index={idx} toggleGroupingOpen={this.toggleGroupingOpen} 
                    onSorterClick={this.handleSorterClick} sorting={sorting} sortField={sortField}
                    handleMouseEnter={this.handleMouseEnter} handleMouseLeave={this.handleMouseLeave}
                    activeColumn={activeColumn} activeRow={activeRow} />
            );
        } else {
            // TODO: Render ... plain blocks w/o left column?
        }

    }

    handleMouseEnter = (row, column) => {
        this.setState({ activeRow: row, activeColumn: column });
    };

    handleMouseLeave = () => {
        this.setState({ activeRow: null, activeColumn: null });
    };

    render() {
        let className = "stacked-block-viz-container";
        if (this.props.duplicateHeaders) {
            className += ' with-duplicated-headers';
        }
        if (this.state.activeColumn !== null || this.state.activeRow !== null) {
            className += ' has-active-block';
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
    static sortBlock (data, groupedDataIndices, groupingKey, sortField) {

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

    static hexToRgba = memoize(function (hex, opacity) {
        if (!hex) return null;
        // Remove the '#' character if present
        hex = hex.replace('#', '');

        // If using shorthand (3 digits), convert to full 6 digits
        if (hex.length === 3) {
            hex = hex.split('').map(ch => ch + ch).join('');
        }

        // Parse the R, G, B values from hex to decimal
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Return the RGBA color string
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
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

        const commonProps = _.pick(props, 'blockHeight', 'blockHorizontalSpacing', 'blockVerticalSpacing',
            'groupingProperties', 'depth', 'titleMap', 'blockClassName', 'blockRenderedContents',
            'groupedDataIndices', 'headerColumnsOrder', 'columnGrouping', 'blockPopover', 'colorRanges',
            'activeRow', 'activeColumn', 'handleMouseEnter', 'handleMouseLeave');
        const width = (props.blockHeight + (props.blockHorizontalSpacing * 2)) + 1;
        const containerGroupStyle = {
            'width'         : width, // Width for each column
            'minWidth'      : width,
            'minHeight'     : props.blockHeight + props.blockVerticalSpacing,               // Height for each row
            'paddingLeft'   : props.blockHorizontalSpacing,
            'paddingRight'  : props.blockHorizontalSpacing,
            'paddingTop'    : props.blockVerticalSpacing
        };
        const containerGroupActiveStyle = _.extend({}, containerGroupStyle, { backgroundColor: StackedBlockGroupedRow.hexToRgba(props.colorRanges[0]?.color, 0.2) });
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
                if (Array.isArray(props.headerColumnsOrder)){
                    columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, props.headerColumnsOrder);
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
                if (Array.isArray(props.headerColumnsOrder)){
                    columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, props.headerColumnsOrder);
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

                    const style = (
                        (props.activeRow === props.index && colIdx <= props.activeColumn) ||
                        (props.activeColumn === colIdx && props.index <= props.activeRow)
                    ) ? containerGroupActiveStyle : containerGroupStyle;

                    return (
                        <div className="block-container-group" style={style}
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
        evt.stopPropagation();
        this.setState(function({ open }){
            return { "open" : !open };
        });
    }

    render(){
        const {
            groupingProperties, depth, titleMap, group, blockHeight, blockVerticalSpacing, blockHorizontalSpacing, headerColumnsOrder,
            data, groupedDataIndices, index, duplicateHeaders, showGroupingPropertyTitles, checkCollapsibility, headerPadding, labelClassName, listingClassName,
            onSorterClick, sorting, sortField, activeRow, activeColumn, columnGroups } = this.props;
        const { open } = this.state;

        let groupingPropertyTitle = null;
        if (Array.isArray(groupingProperties) && groupingProperties[depth]){
            groupingPropertyTitle = titleMap[groupingProperties[depth]] || groupingProperties[depth];
        }

        let className = "grouping depth-" + depth + (open ? ' open' : '') + (duplicateHeaders && depth === 0 ? ' with-duplicated-headers' : '') + (' row-index-' + index) + (!showGroupingPropertyTitles ? ' no-grouping-property-titles' : '');
        let toggleIcon = null;

        const childRowsKeys = !Array.isArray(data) ? _.keys(data).sort() : null;
        const hasIdentifiableChildren = !checkCollapsibility ? true : (depth + 2 >= groupingProperties.length) && childRowsKeys && childRowsKeys.length > 0 && !(childRowsKeys.length === 1 && childRowsKeys[0] === 'No value');

        if (!Array.isArray(data) && data && hasIdentifiableChildren){
            toggleIcon = <i className={"clickable icon fas icon-fw icon-" + (open ? 'minus' : 'plus')} onClick={this.toggleOpen} />;
            className += ' may-collapse';
        } else { // ?
            toggleIcon = <i className="icon icon-fw" />;
        }
        const hasColumnGroups = columnGroups && _.keys(columnGroups).length > 0;

        let header = null;
        if (depth === 0 && groupedDataIndices && ((open && duplicateHeaders) || index === 0)){
            const columnWidth = (blockHeight + (blockHorizontalSpacing * 2)) + 1;
            const headerItemStyle = { 'width' : columnWidth, 'minWidth' : columnWidth };
            let columnKeys = _.keys(groupedDataIndices);
            if (Array.isArray(headerColumnsOrder)){
                columnKeys = StackedBlockGroupedRow.sortByArray(columnKeys, headerColumnsOrder);
            }

            /** EXPERIMENTAL */
            //TODO: Move this to a separate function
            const mergeValues = function (tiersObj) {
                const merged = [];
                Object.keys(tiersObj).forEach(tier => {
                    merged.push(...tiersObj[tier].values);
                });
                return merged;
            }
            // override
            columnKeys = hasColumnGroups ? StackedBlockGroupedRow.sortByArray(columnKeys, mergeValues(columnGroups)) : columnKeys;
            /** END EXPERIMENTAL */

            header = (
                <React.Fragment>
                    <div className="d-flex header-col-text">
                        {columnKeys.map(function (columnKey, colIndex) {
                            return (
                                <div key={'col-' + columnKey} className={'column-group-header' + (activeColumn === colIndex ? ' active-column' : '')} style={headerItemStyle}>
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
                                _.keys(columnGroups).map(function (groupKey) {
                                    const colCount = _.intersection(columnKeys, columnGroups[groupKey]?.values || []).length;
                                    if (colCount === 0) {
                                        return null;
                                    }
                                    const groupColumnWidth = colCount * columnWidth;
                                    const groupedHeaderItemStyle = {
                                        width: groupColumnWidth,
                                        minWidth: groupColumnWidth
                                    }; // EXPERIMENTAL                                
                                    groupedHeaderItemStyle.backgroundColor = columnGroups[groupKey].backgroundColor; // EXPERIMENTAL
                                    groupedHeaderItemStyle.color = columnGroups[groupKey].textColor; // EXPERIMENTAL
                                    return (
                                        <div key={'col-' + groupKey} className={'column-group-header'} style={groupedHeaderItemStyle}>
                                            <div className="inner">
                                                <span>{groupKey}</span>
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

                            return (
                                <div key={'col-' + columnKey} className={'column-group-header' + (activeColumn === colIndex ? ' active-column' : '')} style={headerItemStyle}>
                                    <div data-index={columnKey} onClick={onSorterClick}>
                                        <span className={countSortIconClassName}>{countSortIcon}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </React.Fragment>
            );
        }

        const rowHeight = blockHeight + (blockVerticalSpacing * 2) + 1;
        const childBlocks = !open ? StackedBlockGroupedRow.collapsedChildBlocks(data, this.props) : (
            <div className="open-empty-placeholder" style={{ 'height' : rowHeight, 'marginLeft' : blockHorizontalSpacing }}/>
        );
        const maxBlocksInRow  = childBlocks && Math.max.apply(Math.max, _.pluck(_.pluck((childBlocks && childBlocks.props && childBlocks.props.children) || [], 'props'), 'data-block-count'));

        let labelSectionStyle = null;
        let listSectionStyle = null;
        if (depth === 0 && index === 0){ // Add padding-top to first 1 to align w/ top padding.
            const extPadding = hasColumnGroups ? 86 : 60;
            labelSectionStyle = { 'paddingTop' : Math.max(0, headerPadding + extPadding - rowHeight) };
            listSectionStyle = { 'paddingTop' : headerPadding };
        }

        //sort row label
        let labelSortIcon;
        if ((sorting === "desc") && !sortField) {
            labelSortIcon = <SortIconDesc />;
        } else if ((sorting === "asc") && !sortField) {
            labelSortIcon = <SortIconAsc />;
        } else {
            labelSortIcon = <SortIconBoth />;
        }
        const labelSortIconClassName = 'column-sort-icon' + (['asc', 'desc'].indexOf(sorting) > -1 && !sortField ? ' active' : '');

        return (
            <div className={className} data-max-blocks-vertical={maxBlocksInRow}>
                <div className="row grouping-row">
                    <div className={"col label-section " + labelClassName} style={labelSectionStyle}>
                        {(index === 0 && depth === 0) ? (
                            <div className="text-end" onClick={onSorterClick}>
                                <span className={labelSortIconClassName}>{labelSortIcon}</span>
                            </div>
                        ) : null}
                        <div className={"label-container" + (index === activeRow ? " active-row" : "")} style={{ 'minHeight' : rowHeight }}>
                            { groupingPropertyTitle && showGroupingPropertyTitles ?
                                <small className="text-400 mb-0 mt-0">{ groupingPropertyTitle }</small>
                                : null }
                            <h4 className="text-truncate"
                                data-tip={group && typeof group === 'string' && group.length > 20 ? group : null}>
                                { toggleIcon }<span className="inner">{ group }</span>
                            </h4>
                        </div>
                        {/* this.childLabels() */}
                    </div>
                    <div className={"col list-section " + listingClassName + (header ? ' has-header header-for-viz' : '')} style={listSectionStyle}>
                        {header}
                        {childBlocks}
                    </div>
                </div>

                { open && toggleIcon && depth > 0 ? <div className="close-button" onClick={this.toggleOpen}>{ toggleIcon }</div> : null }

                <div className="child-blocks">
                    { open && childRowsKeys && _.map(childRowsKeys, (k)=>
                        <StackedBlockGroupedRow {...this.props} data={data[k]} key={k} group={k} depth={depth + 1} />
                    ) }
                </div>

            </div>
        );
    }

}

const Block = React.memo(function Block(props){
    const {
        blockHeight, blockVerticalSpacing, data, parentGrouping,
        blockClassName, blockRenderedContents, blockPopover, indexInGroup, colorRanges,
        handleMouseEnter, handleMouseLeave, rowIndex, colIndex, activeRow, activeColumn
    } = props;

    const style = {
        'height' : blockHeight,
        'width' : blockHeight,
        'lineHeight' : blockHeight + 'px',
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

    const getColor = function (value) {
        const range = colorRanges.find(r => 
          value >= r.min && (r.max === undefined || value < r.max)
        );
        return range ? range.color : null;
      }
      

    const dataLength = data?.length || 0;
    style['backgroundColor'] = getColor(dataLength);

    if (rowIndex === activeRow) {
        className += ' active-row';
    }

    if (colIndex === activeColumn) {
        className += ' active-column';
    }

    const blockElem = (
        <div className={className} style={style} tabIndex={1} data-place="bottom" data-block-value={dataLength}
            onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)} onMouseLeave={handleMouseLeave}>
            {contents}
        </div>
    );

    if (popover){
        return <OverlayTrigger trigger="click" placement="bottom" overlay={popover} rootClose>{ blockElem }</OverlayTrigger>;
    }

    return blockElem;
});

function FaIcon(props) {
    const { icon, iconClass } = props;
    const className = `fas icon ${icon} ${iconClass}`;
    return (
        <i className={className} align="right" />
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
