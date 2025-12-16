'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import * as vizUtil from '@hms-dbmi-bgm/shared-portal-components/es/components/viz/utilities';
import { console, isServerSide, logger } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { barplot_color_cycler } from './../ColorCycler';
import { CursorViewBounds } from './../ChartDetailCursor';



/**
 * Outputs a section of a bar.
 *
 * @class BarSection
 * @type {Component}
 */
class BarSection extends React.PureComponent {

    constructor(props){
        super(props);
        _.bindAll(this, 'mouseEnter', 'mouseLeave', 'click');
        this.barSectionElemRef = React.createRef();
    }

    /**
     * Call the `onMouseLeave` prop callback fxn in preparation
     * to dismount in order to clean up if necessary.
     *
     * @todo Maybe check for `props.isHoveredOver` first?
     */
    componentWillUnmount(){
        var { isSelected, isHoveredOver, onMouseLeave, node } = this.props;
        if (this.barSectionElemRef.current && (isSelected || isHoveredOver)){
            onMouseLeave(node, { 'relatedTarget' : this.barSectionElemRef.current });
        }
    }

    mouseEnter(e){
        const { onMouseEnter, node } = this.props;
        return onMouseEnter && onMouseEnter(node, e);
    }

    mouseLeave(e){
        const { onMouseLeave, node } = this.props;
        return onMouseLeave && onMouseLeave(node, e);
    }

    click(e){
        const { onClick, node } = this.props;
        return onClick && onClick(node, e);
    }

    /**
     * @returns {Element} - A div element representing a bar section.
     */
    render(){
        const { node: d, isSelected, isHoveredOver, canBeHighlighted, siblingSections = null, rootBarHeight = null } = this.props;
        const color           = d.color || barplot_color_cycler.colorForNode(d);
        let className = "bar-part";

        if (d.parent)           className += ' multiple-parts';
        if (isSelected)         className += ' selected';
        if (isHoveredOver)      className += ' hover';
        if (!canBeHighlighted)  className += ' no-highlight';
        else                    className += ' no-highlight-color';

        var height;
        if (!d.parent) { // No sub-buckets
            height = '100%';
        } else {
            // Use a percentage for styling purposes because we want the outermost bar height
            // to transition and child bar sections to stay aligned to it.
            var totalHeightForPercent = null;
            if (rootBarHeight && d.attr && typeof d.attr.height === 'number') {
                totalHeightForPercent = rootBarHeight;
                height = ((d.attr.height || 0) / totalHeightForPercent) * 100 + '%';
            } else if (Array.isArray(siblingSections) && siblingSections.length > 0) {
                const combinedHeight = _.reduce(siblingSections, function (sum, bar) {
                    return sum + ((bar && bar.attr && typeof bar.attr.height === 'number') ? bar.attr.height : 0);
                }, 0);
                if (combinedHeight > 0 && d.attr && typeof d.attr.height === 'number') {
                    height = (d.attr.height / combinedHeight) * 100 + '%';
                }
            }

            if (!height) {
                var parentBarsCount = _.reduce(d.parent.bars, function(sum, bar){
                    return sum + bar.count;
                }, 0);
                height = parentBarsCount ? (d.count / parentBarsCount) * 100 + '%' : '0%';
            }
        }

        // Use the primary grouping term for highlighting so legend hover matches all fragments of a primary bucket,
        // but still keep the secondary term available for future use.
        const highlightTermKey = (
            d.parent && d.parent.parent ?
                d.parent.term :
                d.term
        );
        const highlightFieldKey = (
            d.parent && d.parent.parent ?
                d.parent.field :
                d.field
        );

        return (
            <div className={className} ref={this.barSectionElemRef}
                style={{
                    height, 'backgroundColor' : color
                    //width: '100%', //(this.props.isNew && d.pastWidth) || (d.parent || d).attr.width,
                }}
                data-key={this.props['data-key'] || null}
                data-term={highlightTermKey || null}
                data-secondary-term={d.parent ? d.term : null}
                data-field={highlightFieldKey}
                data-count={d.count} data-color={color} data-target-height={d.attr.height}
                key={'bar-part-' + (d.parent ? d.parent.term + '~' + d.term : d.term)}
                onMouseEnter={this.mouseEnter} onMouseLeave={this.mouseLeave} onClick={this.click}
            />
        );
    }
}


/**
 * Outputs a vertical bar containing bar sections.
 *
 * @class Bar
 * @type {Component}
 */
class Bar extends React.PureComponent {

    constructor(props){
        super(props);
        this.verifyCounts = this.verifyCounts.bind(this);
        this.barStyle = this.barStyle.bind(this);
        this.renderBarSection = this.renderBarSection.bind(this);
        this.getRenderableSections = this.getRenderableSections.bind(this);
        this.state = {
            'mounted' : false
        };
        this.barElemRef = React.createRef();
    }

    componentDidMount(){
        this.verifyCounts();
    }

    componentDidUpdate(pastProps){
        if (this.props.node !== pastProps.node){
            this.verifyCounts();
        }
    }

    /**
     * Double check sum of bar parts and report an Exception to Sentry.io if doesn't match.
     * Do this in a setTimeout because it doesn't affect rendering or site UI.
     */
    verifyCounts(){
        var d = this.props.node;
        if (!d.bars) return;
        setTimeout(()=>{
            var combinedChildrenCount = _.reduce(d.bars, function(sum, bar){
                return sum + bar.count;
            }, 0);
            if (combinedChildrenCount && d.count !== combinedChildrenCount){
                var errorMsg = (
                    "Data Error: 1 or more ExperimentSets was counted multiple times for 'group by' field '" +
                    d.bars[0].field + "'."
                );
                logger.error(errorMsg);
            }
        }, 0);
    }

    barStyle(){
        const { node, styleOptions } = this.props;
        const style = {};

        // Position bar's x coord via translate3d CSS property for CSS3 transitioning.
        style.transform = vizUtil.style.translate3d(node.attr.x, 0, 0);
        style.left = styleOptions.offset.left;
        style.bottom = styleOptions.offset.bottom;
        style.width = node.attr.width;
        style.height = node.attr.height;

        return style;
    }

    getRenderableSections() {
        const { node, aggregateType = 'files' } = this.props;
        if (!Array.isArray(node.bars)) {
            return [_.extend({}, node, { 'color': node.color || '#5da5da', 'baseColor': node.baseColor || node.color })];
        }

        const sections = [];
        const sortedPrimaryBars = node.bars.slice(0).sort(function(a, b){
            const aCount = typeof a[aggregateType] === 'number' ? a[aggregateType] : a.count || 0;
            const bCount = typeof b[aggregateType] === 'number' ? b[aggregateType] : b.count || 0;
            return aCount - bCount;
        });

        _.forEach(sortedPrimaryBars, function (child) {
            child.baseColor = child.baseColor || child.color;
            if (Array.isArray(child.bars) && child.bars.length > 0) {
                _.forEach(child.bars, function (grandChild) {
                    grandChild.baseColor = grandChild.baseColor || child.baseColor || child.color;
                    sections.push(grandChild);
                });
            } else {
                sections.push(child);
            }
        });

        if (sections.length === 0) {
            return [_.extend({}, node, { 'color': node.color || '#5da5da', 'baseColor': node.baseColor || node.color })];
        }

        return sections;
    }

    renderBarSection(d, i, all){
        var { hoverTerm, hoverParentTerm, selectedTerm, selectedParentTerm, onBarPartClick,
                onBarPartMouseEnter, onBarPartMouseOver, onBarPartMouseLeave,
                aggregateType, canBeHighlighted } = this.props,
            key = d.term || d.name || i,
            isHoveredOver   = CursorViewBounds.isSelected(d, hoverTerm, hoverParentTerm),
            isSelected      = CursorViewBounds.isSelected(d, selectedTerm, selectedParentTerm);

        return (
            <BarSection {...{ isHoveredOver, isSelected, key, aggregateType, canBeHighlighted }} data-key={key} node={d}
                rootBarHeight={(this.props.node && this.props.node.attr && this.props.node.attr.height) || null}
                siblingSections={all}
                onClick={onBarPartClick} onMouseEnter={onBarPartMouseEnter} onMouseLeave={onBarPartMouseLeave} isRemoving={d.removing} />
        );
    }

    render(){
        const { canBeHighlighted, showBarCount, node: d } = this.props;
        const barSections = this.getRenderableSections();
        let className = "chart-bar";
        const topLabel = showBarCount ? <span className="bar-top-label" key="text-label">{ d.count }</span> : null;

        if (!canBeHighlighted)  className += ' no-highlight';
        else                    className += ' no-highlight-color';

        return (
            <div
                className={className}
                data-term={d.term}
                data-count={d.count}
                data-field={d.field || (Array.isArray(d.bars) && d.bars.length > 0 ? d.bars[0].field : null)}
                key={"bar-" + d.term}
                style={this.barStyle()}
                ref={this.barElemRef}>
                { topLabel }
                { _.map(barSections, this.renderBarSection) }
            </div>
        );
    }
}

/**
 * React Component for wrapping the generated markup of BarPlot.Chart.
 * Also contains Components Bar and BarSection as static children, for wrapping output bar and bar parts.
 *
 * The top-level ViewContainer component contains state for interactivity of the generated chart mark-up.
 * The child Bar and BarSection components are stateless and utilize the state passed down from ViewContainer.
 */
export class ViewContainer extends React.Component {

    static Bar = Bar;
    static BarSection = BarSection;

    static defaultProps = {
        'canBeHighlighted' : true
    };

    constructor(props){
        super(props);
        this.verifyCounts = this.verifyCounts.bind(this);
        this.renderBars = this.renderBars.bind(this);
        this.nodeRef = React.createRef();
    }

    componentDidMount(){
        this.verifyCounts();
    }

    componentDidUpdate(pastProps){
        if (this.props.bars !== pastProps.bars || this.props.aggregateType !== pastProps.aggregateType || this.props.topLevelField !== pastProps.topLevelField){
            this.verifyCounts();
        }
    }

    /**
     * Double check sum of bar parts and report an Exception to Sentry.io if doesn't match.
     * Do this in a setTimeout because it doesn't affect rendering or site UI.
     */
    verifyCounts(){
        const { bars, topLevelField, aggregateType } = this.props,
            totalCount = topLevelField && topLevelField.total && topLevelField.total[aggregateType];

        if (!totalCount || !bars) return;

        setTimeout(()=>{
            // warning-level message for console
            const combinedChildrenCount = _.reduce(bars, function(sum, bar){
                return sum + bar.count;
            }, 0);
            if (combinedChildrenCount && totalCount !== combinedChildrenCount){
                const warnMsg = (
                    "Data Warning: 1 or more " + aggregateType + " was counted multiple times for 'group by' field '" +
                    bars[0].field + "' (" + totalCount + " vs " + combinedChildrenCount + ")"
                );
                console.warn(warnMsg);
            }
            // error-level message for sentry.io
            const barAggregateTypeCount = _.reduce(bars, function (sum, bar) {
                if (bar.bars && Array.isArray(bar.bars)) {
                    _.forEach(bar.bars, (b) => { sum = sum + (b[aggregateType] || 0); });
                }
                return sum;
            }, 0);
            if (combinedChildrenCount && barAggregateTypeCount && barAggregateTypeCount !== combinedChildrenCount) {
                const errorMsg = (
                    "Data Error: bar.count totals and bar['" + aggregateType + "'] totals are not matching for '" +
                    bars[0].field + "' (" + barAggregateTypeCount + " vs " + combinedChildrenCount + ")"
                );
                logger.error(errorMsg);
            }
        }, 0);
    }

    /**
     * Passes props to and renders child 'Bar' Components.
     * Passes in own state, high-level props if child prop not set, and extends event handlers.
     *
     * @returns {Component[]} Array of 'Bar' React Components.
     */
    renderBars(){
        const { bars, onNodeMouseEnter, onNodeMouseLeave, onNodeClick } = this.props;

        return _.map(bars.sort(function(a,b){ // key will be term or name, if available
            return (a.term || a.name) < (b.term || b.name) ? -1 : 1;
        }), (d,i,a) =>
            <CSSTransition classNames="barplot-transition" unmountOnExit timeout={{ enter: 10, exit: 750 }} key={d.term || d.name || i} nodeRef={this.nodeRef}>
                <Bar key={d.term || d.name || i} node={d}
                    showBarCount={true}
                    {..._.pick(this.props, 'selectedParentTerm', 'selectedTerm', 'hoverParentTerm', 'hoverTerm', 'styleOptions',
                        'aggregateType', 'showType', 'canBeHighlighted')}
                    onBarPartMouseEnter={onNodeMouseEnter} onBarPartMouseLeave={onNodeMouseLeave} onBarPartClick={onNodeClick} />
            </CSSTransition>
        );
    }

    render(){
        var { topLevelField, width, height, leftAxis, bottomAxis } = this.props,
            anyHiddenOtherTerms = topLevelField.other_doc_count || _.any(_.values(topLevelField.terms), function(tV){
                return tV.other_doc_count;
            });
        return (
            <div className="bar-plot-chart chart-container no-highlight"
                data-field={topLevelField.field} style={{ height, width }}
                /*
                onMouseLeave={(evt)=>{
                    if (ChartDetailCursor.isTargetDetailCursor(evt.relatedTarget)){
                        return false;
                    }
                    var newState = {};
                    if (this.state.hoverBarSectionTerm) {
                        newState.hoverBarSectionParentTerm = newState.hoverBarSectionTerm = null;
                    }
                    if (this.state.selectedBarSectionTerm) {
                        newState.selectedBarSectionParentTerm = newState.selectedBarSectionTerm = null;
                    }
                    if (_.keys(newState).length > 0){
                        this.setState(newState);
                    }
                }}
                */
            >
                { anyHiddenOtherTerms ?
                    <div className="terms-excluded-notice text-smaller">
                        <p className="mb-0">* Only up to the top 30 terms are shown.</p>
                    </div>
                    : null }
                { leftAxis }
                {/* allExpsBarDataContainer && allExpsBarDataContainer.component */}
                <TransitionGroup>{ this.renderBars() }</TransitionGroup>
                { bottomAxis }
            </div>
        );

    }

}


/**
 * Wraps ViewContainer with PopoverViewBounds, which feeds it
 * props.onNodeMouseEnter(node, evt), props.onNodeMouseLeave(node, evt), props.onNodeClick(node, evt),
 * props.selectedTerm, props.selectedParentTerm, props.hoverTerm, and props.hoverParentTerm.
 *
 * @export
 * @class PopoverViewContainer
 * @extends {React.Component}
 */
export class PopoverViewContainer extends React.PureComponent {

    static propTypes = {
        'height' : PropTypes.number,
        'width'  : PropTypes.number,
        'cursorDetailActions': PropTypes.arrayOf(PropTypes.shape({
            'title' : PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
            'function' : PropTypes.oneOfType([PropTypes.string, PropTypes.func]).isRequired,
            'disabled' : PropTypes.oneOfType([PropTypes.bool, PropTypes.func]).isRequired,
        }))
    };

    static defaultProps = {
        'cursorContainerMargin' : 100
    };

    constructor(props){
        super(props);
        this.getCoordsCallback = this.getCoordsCallback.bind(this);
        this.heightToTop = this.heightToTop.bind(this);
        this.getRootNode = this.getRootNode.bind(this);
    }

    getRootNode(node){
        let current = node;
        while (current && current.parent){
            current = current.parent;
        }
        return current || node;
    }

    heightToTop(node){
        if (!node) return 0;
        const parent = node.parent;
        if (!parent || !Array.isArray(parent.bars)) {
            return (node.attr && typeof node.attr.height === 'number') ? node.attr.height : 0;
        }
        let heightWithinParent = 0;
        let found = false;
        _.forEach(parent.bars, function(sibling){
            if (found) return;
            heightWithinParent += (sibling.attr && typeof sibling.attr.height === 'number') ? sibling.attr.height : 0;
            if (sibling === node) {
                found = true;
            }
        });

        return this.heightToTop(parent) - ((parent.attr && parent.attr.height) || 0) + heightWithinParent;
    }

    getCoordsCallback(node, containerPosition, boundsHeight){
        var bottomOffset = (this.props && this.props.styleOptions && this.props.styleOptions.offset && this.props.styleOptions.offset.bottom) || 0;
        var leftOffset = (this.props && this.props.styleOptions && this.props.styleOptions.offset && this.props.styleOptions.offset.left) || 0;

        var rootNode = this.getRootNode(node);
        const rootAttrs = (rootNode && rootNode.attr) || {};
        const rootX = typeof rootAttrs.x === 'number' ? rootAttrs.x : 0;
        const rootWidth = typeof rootAttrs.width === 'number' ? rootAttrs.width : 0;
        var barYPos = this.heightToTop(node);

        return {
            'x' : containerPosition.left + leftOffset + rootX + (rootWidth / 2),
            'y' : containerPosition.top + boundsHeight - bottomOffset - barYPos,
        };
    }

    render(){
        return (
            <CursorViewBounds {..._.pick(this.props, 'height', 'width', 'cursorContainerMargin', 'actions', 'href', 'context', 'schemas', 'mapping')}
                eventCategory="BarPlot" // For Analytics events
                highlightTerm={false} clickCoordsFxn={this.getCoordsCallback}>
                <ViewContainer {...this.props} />
            </CursorViewBounds>
        );
    }
}
