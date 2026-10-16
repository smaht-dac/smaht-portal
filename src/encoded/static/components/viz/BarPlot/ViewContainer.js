'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import * as vizUtil from '@hms-dbmi-bgm/shared-portal-components/es/components/viz/utilities';
import { console, isServerSide, logger } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { barplot_color_cycler } from './../ColorCycler';
import { CursorViewBounds } from './../ChartDetailCursor';
import { Schemas } from './../../util';
import { getTissueSampleTypeColor, getTissueLineDotFill, TISSUE_SAMPLE_TYPE_ORDER } from './tissue-sample-type-colors';



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
        const { node: d, isSelected, isHoveredOver, canBeHighlighted, sectionCount, sectionIndex, subBarLayout } = this.props;
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
            if (subBarLayout === 'grouped') {
                const parentCount = d.parent.count || 0;
                height = parentCount > 0 ? (d.count / parentCount) * 100 + '%' : '0%';
            } else {
                // Use a percentage for styling purposes because we want the outermost bar height
                // to transition and child bar sections to stay aligned to it.
                //new implementation - sum d.parent.bars.count - normalize height since we want to keep the outermost bar height consistent - uozturk
                var parentBarsCount = _.reduce(d.parent.bars, function(sum, bar){
                    return sum + bar.count;
                }, 0);
                height = (d.count / parentBarsCount) * 100 + '%';
                // old implementation
                // height = (d.count / d.parent.count) * 100 + '%';
            }
        }

        const isGrouped = subBarLayout === 'grouped' && d.parent;
        const width = (subBarLayout === 'grouped' && sectionCount)
            ? (100 / sectionCount) + '%'
            : '100%';
        const marginLeft = (subBarLayout === 'grouped' && sectionIndex > 0) ? '1px' : null;
        const label = isGrouped ? (
            <span
                className="bar-part-label"
                style={{
                    position: 'absolute',
                    top: '-16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    color: '#2a2a2a',
                    whiteSpace: 'nowrap'
                }}>
                {d.count}
            </span>
        ) : null;

        return (
            <div className={className} ref={this.barSectionElemRef}
                style={{
                    height,
                    width,
                    marginLeft,
                    position: isGrouped ? 'relative' : null,
                    'backgroundColor' : color
                    //width: '100%', //(this.props.isNew && d.pastWidth) || (d.parent || d).attr.width,
                }}
                data-key={this.props['data-key'] || null} data-term={d.parent ? d.term : null}
                data-count={d.count} data-color={color} data-target-height={d.attr.height}
                key={'bar-part-' + (d.parent ? d.parent.term + '~' + d.term : d.term)}
                onMouseEnter={this.mouseEnter} onMouseLeave={this.mouseLeave} onClick={this.click}
            >
                {label}
            </div>
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
        if (this.props.subBarLayout === 'grouped') return;
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

    renderBarSection(d, i, all){
        var { hoverTerm, hoverParentTerm, selectedTerm, selectedParentTerm, onBarPartClick,
                onBarPartMouseEnter, onBarPartMouseOver, onBarPartMouseLeave,
                aggregateType, canBeHighlighted, subBarLayout } = this.props,
            key = d.term || d.name || i,
            isHoveredOver   = CursorViewBounds.isSelected(d, hoverTerm, hoverParentTerm),
            isSelected      = CursorViewBounds.isSelected(d, selectedTerm, selectedParentTerm);

        return (
            <BarSection {...{ isHoveredOver, isSelected, key, aggregateType, canBeHighlighted, subBarLayout }} data-key={key} node={d}
                sectionCount={all && all.length ? all.length : null}
                sectionIndex={i}
                onClick={onBarPartClick} onMouseEnter={onBarPartMouseEnter} onMouseLeave={onBarPartMouseLeave} isRemoving={d.removing} />
        );
    }

    render(){
        const { canBeHighlighted, showBarCount, node: d, subBarLayout } = this.props;
        const hasSubSections = Array.isArray(d.bars);
        const barSections = (hasSubSections ?
            // If needed, remove sort + reverse to keep order of heaviest->lightest aggs regardless of color
            barplot_color_cycler.sortObjectsByColorPalette(d.bars).reverse() : [_.extend({}, d, { color : '#5da5da' })]
        );
        const useGroupedBars = subBarLayout === 'grouped' && hasSubSections;
        let className = "chart-bar";
        const showTopLabel = showBarCount && !useGroupedBars;
        const topLabel = showTopLabel ? <span className="bar-top-label" key="text-label">{ d.count }</span> : null;

        if (!canBeHighlighted)  className += ' no-highlight';
        else                    className += ' no-highlight-color';

        return (
            <div
                className={className}
                data-term={d.term}
                data-count={d.count}
                data-field={Array.isArray(d.bars) && d.bars.length > 0 ? d.bars[0].field : null}
                key={"bar-" + d.term}
                style={this.barStyle()}
                ref={this.barElemRef}>
                { topLabel }
                { useGroupedBars ? (
                    <div className="bar-sections grouped" style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
                        { _.map(barSections, this.renderBarSection) }
                    </div>
                ) : (
                    _.map(barSections, this.renderBarSection)
                ) }
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
                        'aggregateType', 'showType', 'canBeHighlighted', 'subBarLayout')}
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
    }

    getCoordsCallback(node, containerPosition, boundsHeight){
        var bottomOffset = (this.props && this.props.styleOptions && this.props.styleOptions.offset && this.props.styleOptions.offset.bottom) || 0;
        var leftOffset = (this.props && this.props.styleOptions && this.props.styleOptions.offset && this.props.styleOptions.offset.left) || 0;
        const { subBarLayout } = this.props;

        var barYPos = node.attr.height;

        if (node.parent){
            if (subBarLayout === 'grouped') {
                barYPos = node.attr.height;
            } else {
                var done = false;
                barYPos = _.reduce(
                    node.parent.bars,//.slice(0).reverse(),
                    //_.sortBy(node.parent.bars, 'term').reverse(),
                    function(m, siblingNode){
                        if (done) return m;
                        if (siblingNode.term === node.term){
                            done = true;
                        }
                        return m + siblingNode.attr.height;
                    },
                    0
                );
            }
        }

        let xCenter = (node.parent || node).attr.x + ((node.parent || node).attr.width / 2);
        if (node.parent && subBarLayout === 'grouped') {
            const ordered = barplot_color_cycler.sortObjectsByColorPalette(node.parent.bars).reverse();
            const idx = _.findIndex(ordered, (b) => b.term === node.term);
            if (idx >= 0 && ordered.length > 0) {
                const sectionWidth = (node.parent.attr.width || 0) / ordered.length;
                xCenter = node.parent.attr.x + (sectionWidth * idx) + (sectionWidth / 2);
            }
        }

        return {
            'x' : containerPosition.left + leftOffset + xCenter,
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


/**
 * Shared by Browse by Tissue's line, thin grouped and thin stacked charts: the
 * subdivision field name plus every sub-term worth drawing. Excludes any
 * term whose count is 0 across EVERY tissue (e.g. "Not specified" -- its
 * own files resolve a tissue via a different relationship chain than the
 * one `sample_summary.sample_names` walks, so they never contribute to this
 * table's own distinct-sample cardinality even though real Files exist for
 * that term) per explicit request -- a series that's flat at 0 everywhere
 * never carries any real information, just an extra always-empty legend
 * entry (AggregatedLegend mirrors this same filter).
 */
function getTissueSubTerms(bars) {
    // Every tissue that has any real sub-bar at all shares the same
    // subdivision field, so the first one found is enough.
    const firstBarWithSubs = _.find(bars, (bar) => Array.isArray(bar.bars) && bar.bars.length > 0);
    const subdivisionField = firstBarWithSubs ? firstBarWithSubs.bars[0].field : null;
    const terms = _.uniq(_.flatten(_.map(bars, (bar) => _.map(bar.bars || [], (b) => b.term))))
        .filter((term) => _.any(bars, (bar) => {
            const existingNode = _.findWhere(bar.bars || [], { term });
            return existingNode && existingNode.count > 0;
        }));
    return { subdivisionField, terms };
}

/**
 * A tissue's own node for `term` -- or, for a tissue with none of that
 * sample type, a synthetic, real-shaped 0-count node (per explicit request:
 * drawn, not hidden/skipped), so it still gets a mark and a popover.
 */
function getTissueSubNode(bar, term, subdivisionField) {
    return _.findWhere(bar.bars || [], { term }) || {
        field: subdivisionField,
        term,
        name: Schemas.Term.toName(subdivisionField, term),
        count: 0,
        donors: 0,
        files: 0,
        samples: 0,
        all_donor_ids: [],
        parent: bar
    };
}

/**
 * Line-chart rendering for Browse by Tissue's own "Sample Type" subdivision
 * (per explicit request: same chart/data as the stacked-bar version, just
 * lines+dots instead of bars) -- a sibling to Bar/BarSection/ViewContainer
 * above, not a mode switch inside them, so every other BarPlot.Chart usage
 * (Browse by File/Donor, gated by `mapping` in Chart.js's own render)
 * keeps rendering through the original, completely untouched bar code.
 *
 * Reuses the exact same `leftAxis`/`bottomAxis` markup and `styleOptions`/
 * `width`/`height` coordinate system the bar version uses (both built
 * generically in Chart.js, mapping-agnostic), so this chart's own axes/
 * scale land on the same pixels a bar chart would have for the same data --
 * only the plotted marks themselves (this component's own <svg>) differ.
 *
 * A "count" here is always already resolved to whatever `aggregateType`
 * Chart.js chose (e.g. 'samples' for Browse by Tissue) -- see genBarData's
 * own `barNode.count`/`.samples`/etc in Chart.js.
 */
class LineChartViewContainer extends React.PureComponent {

    /**
     * Mirrors PopoverViewContainer's own identical-purpose method, but
     * reads a point's own already-known (x,y) (attached to its node as
     * `__x`/`__y` below) instead of reconstructing a bar section's
     * position from stacked heights -- there's no stacking here, so the
     * position is just wherever the dot was actually drawn.
     */
    static getCoordsCallback(node, containerPosition){
        return {
            'x' : containerPosition.left + (node.__x || 0),
            'y' : containerPosition.top + (node.__y || 0),
        };
    }

    render(){
        const {
            topLevelField, width, height, leftAxis, bottomAxis, styleOptions, bars,
            fullHeightCount, onNodeMouseEnter, onNodeMouseLeave, onNodeClick,
            hoverTerm, hoverParentTerm, selectedTerm, selectedParentTerm
        } = this.props;
        const { offset } = styleOptions;
        const insetHeight = Math.max(height - offset.top - offset.bottom, 0);
        const { subdivisionField, terms: allTerms } = getTissueSubTerms(bars);
        // By screen X position (already assigned by genChartBarDims,
        // typically descending value -- same left-to-right order the
        // bottom axis labels use), NOT alphabetically by term -- an SVG
        // `<polyline>` draws its segments in exactly the order its points
        // are listed, so anything else here would zigzag across the
        // chart instead of tracing a left-to-right line.
        const orderedBars = bars.slice().sort(function (a, b) {
            return a.attr.x - b.attr.x;
        });

        const series = _.map(allTerms, function (term) {
            const points = _.map(orderedBars, function (bar) {
                // A tissue with none of this sample type still gets a
                // (synthetic, 0-count) point rather than a gap in the line.
                const node = getTissueSubNode(bar, term, subdivisionField);
                const count = node.count || 0;
                const x = offset.left + bar.attr.x + (bar.attr.width / 2);
                const y = offset.top + insetHeight - (fullHeightCount > 0 ? (count / fullHeightCount) * insetHeight : 0);
                // Attached directly to the node (not just the point
                // wrapper) so the click-to-filter popover -- which only
                // ever receives the node itself, via onNodeClick -- can
                // still recover exactly where on screen it was drawn (see
                // LineChartViewContainer.getCoordsCallback above).
                node.__x = x;
                node.__y = y;
                return { node, count, x, y };
            });
            return { term, points };
        });

        return (
            <div className="bar-plot-chart chart-container line-chart no-highlight"
                data-field={topLevelField.field} style={{ height, width }}>
                { leftAxis }
                <svg className="line-chart-svg" width={width} height={height}
                    style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                    { _.map(series, function (s) {
                        const { stroke } = getTissueSampleTypeColor(s.term);
                        const pointsAttr = _.map(s.points, function (p) { return p.x + ',' + p.y; }).join(' ');
                        return (
                            // `data-term` (deliberately no `data-field` on
                            // this same element -- see the SCSS comment on
                            // `.line-chart-series` for why) is what lets
                            // the legend's own hover (Legend.Term's
                            // vizUtil.highlightTerm(field, term, color),
                            // called regardless of chart type) find and
                            // toggle `.highlight` on exactly this series,
                            // the same DOM-attribute contract the bar
                            // chart's own .bar-part elements already rely
                            // on for the identical effect.
                            <g key={s.term} className="line-chart-series" data-term={s.term}>
                                <polyline points={pointsAttr} fill="none" stroke={stroke} strokeWidth={2} />
                                { _.map(s.points, function (p, i) {
                                    // A 0-count point keeps its series' own color too,
                                    // per explicit request -- it used to switch to a
                                    // muted grey.
                                    const swatch = getTissueSampleTypeColor(s.term);
                                    // Popover's own swatch (ChartDetailCursor's
                                    // Body) prefers `leafNode.color`, falling
                                    // back to the generic cycler otherwise --
                                    // every node here needs this set to match
                                    // its own dot, not the cycler's unrelated
                                    // assignment.
                                    p.node.color = swatch.stroke;
                                    const isHighlighted = (
                                        CursorViewBounds.isSelected(p.node, hoverTerm, hoverParentTerm) ||
                                        CursorViewBounds.isSelected(p.node, selectedTerm, selectedParentTerm)
                                    );
                                    return (
                                        // eslint-disable-next-line react/no-array-index-key
                                        <circle key={i} cx={p.x} cy={p.y}
                                            r={isHighlighted ? 6 : 4.5}
                                            fill={getTissueLineDotFill(swatch.fill)}
                                            stroke={swatch.stroke}
                                            strokeWidth={isHighlighted ? 2.5 : 1.5}
                                            style={{ cursor: 'pointer' }}
                                            onMouseEnter={(evt) => onNodeMouseEnter(p.node, evt)}
                                            onMouseLeave={(evt) => onNodeMouseLeave(p.node, evt)}
                                            onClick={(evt) => onNodeClick(p.node, evt)} />
                                    );
                                }) }
                            </g>
                        );
                    }) }
                </svg>
                { bottomAxis }
            </div>
        );
    }
}

/**
 * Wraps LineChartViewContainer with the same CursorViewBounds interactivity
 * PopoverViewContainer gives the bar version (hover/click popovers, "sticky"
 * selection) -- see LineChartViewContainer's own comment for why this is a
 * sibling wrapper rather than a change to PopoverViewContainer itself.
 */
export class PopoverLineChartViewContainer extends React.PureComponent {

    render(){
        return (
            <CursorViewBounds {..._.pick(this.props, 'height', 'width', 'cursorContainerMargin', 'actions', 'href', 'context', 'schemas', 'mapping', 'aggregateType')}
                eventCategory="BarPlot"
                highlightTerm={false} clickCoordsFxn={LineChartViewContainer.getCoordsCallback}>
                <LineChartViewContainer {...this.props} />
            </CursorViewBounds>
        );
    }
}


// Browse by Tissue's thin bars (ThinGroupedChartViewContainer/
// ThinStackedChartViewContainer, below) -- one shared thin-mark style so the
// Sample Type and every-other-Group-By charts read as one family.
const THIN_GROUPED_BAR_WIDTH = 10;
const THIN_STACKED_BAR_WIDTH = 12;
// Surface gap between 2 adjacent grouped bars / 2 stacked segments.
const THIN_BAR_GAP = 2;
const THIN_BAR_TOP_RADIUS = 4;

// A rect whose top 2 corners only are rounded (the bar's data end) -- the
// baseline end stays square, anchored to the axis.
function topRoundedRectPath(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h));
    return [
        'M', x, y + h,
        'L', x, y + radius,
        'Q', x, y, x + radius, y,
        'L', x + w - radius, y,
        'Q', x + w, y, x + w, y + radius,
        'L', x + w, y + h,
        'Z'
    ].join(' ');
}

/**
 * Thin grouped bars for Browse by Tissue's "Group By: Sample Type" chart --
 * per design feedback, the default over the line chart above (still
 * selectable, see UIControlsWrapper's Bars/Lines toggle). Each tissue gets
 * one thin bar per sample type, right next to each other (not stacked:
 * Fixed/Frozen/Fresh are counted independently, so they don't sum to a
 * meaningful whole). Plain rectangles with a rounded top -- an earlier
 * lollipop version (thin stem + dot) was dropped per design feedback. A
 * tissue with none of a sample type leaves that bar's slot empty (still
 * hoverable, so its 0 can be read in the popover).
 *
 * Same coordinate system/axes contract as LineChartViewContainer (see its
 * own comment), and the same `.line-chart-series[data-term]` grouping so
 * legend hover fades the other sample types here too.
 */
class ThinGroupedChartViewContainer extends React.PureComponent {

    // Each bar carries its own drawn top (x,y) -- see
    // LineChartViewContainer's own identical method.
    static getCoordsCallback(node, containerPosition){
        return LineChartViewContainer.getCoordsCallback(node, containerPosition);
    }

    render(){
        const {
            topLevelField, width, height, leftAxis, bottomAxis, styleOptions, bars,
            fullHeightCount, onNodeMouseEnter, onNodeMouseLeave, onNodeClick,
            hoverTerm, hoverParentTerm, selectedTerm, selectedParentTerm
        } = this.props;
        const { offset } = styleOptions;
        const insetHeight = Math.max(height - offset.top - offset.bottom, 0);
        const baselineY = offset.top + insetHeight;
        const { subdivisionField, terms } = getTissueSubTerms(bars);
        // Fixed left-to-right bar order within every tissue, so a given
        // sample type is always in the same slot -- never by count.
        const orderedTerms = _.sortBy(terms, (term) => {
            const idx = TISSUE_SAMPLE_TYPE_ORDER.indexOf(term);
            return (idx === -1 ? TISSUE_SAMPLE_TYPE_ORDER.length : idx) + '~' + term;
        });
        const termCount = Math.max(orderedTerms.length, 1);

        const series = _.map(orderedTerms, function (term, termIndex) {
            const points = _.map(bars, function (bar) {
                const node = getTissueSubNode(bar, term, subdivisionField);
                const count = node.count || 0;
                // The tissue's bars sit flush side by side (THIN_BAR_GAP
                // apart) around its own center, where its x-axis label is --
                // narrowed only if a crowded chart's slot can't fit them.
                const slotWidth = Math.min(
                    (bar.attr.width || 0) / termCount,
                    THIN_GROUPED_BAR_WIDTH + THIN_BAR_GAP
                );
                const barWidth = Math.max(slotWidth - THIN_BAR_GAP, 1);
                const xCenter = offset.left + bar.attr.x + (bar.attr.width / 2) + (termIndex - (termCount - 1) / 2) * slotWidth;
                const y = baselineY - (fullHeightCount > 0 ? (count / fullHeightCount) * insetHeight : 0);
                node.__x = xCenter;
                node.__y = y;
                return { node, count, xCenter, y, slotWidth, barWidth };
            });
            return { term, points };
        });

        return (
            <div className="bar-plot-chart chart-container line-chart thin-grouped-chart no-highlight"
                data-field={topLevelField.field} style={{ height, width }}>
                { leftAxis }
                <svg className="line-chart-svg" width={width} height={height}
                    style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                    { _.map(series, function (s) {
                        const swatch = getTissueSampleTypeColor(s.term);
                        return (
                            // See LineChartViewContainer's own comment on
                            // `data-term` (legend hover highlighting).
                            <g key={s.term} className="line-chart-series" data-term={s.term}>
                                { _.map(s.points, function (p, i) {
                                    // Popover swatch -- see LineChartViewContainer.
                                    p.node.color = swatch.stroke;
                                    const isHighlighted = (
                                        CursorViewBounds.isSelected(p.node, hoverTerm, hoverParentTerm) ||
                                        CursorViewBounds.isSelected(p.node, selectedTerm, selectedParentTerm)
                                    );
                                    const barHeight = baselineY - p.y;
                                    return (
                                        // eslint-disable-next-line react/no-array-index-key
                                        <g key={i} style={{ cursor: 'pointer' }}
                                            onMouseEnter={(evt) => onNodeMouseEnter(p.node, evt)}
                                            onMouseLeave={(evt) => onNodeMouseLeave(p.node, evt)}
                                            onClick={(evt) => onNodeClick(p.node, evt)}>
                                            { barHeight > 0 ? (
                                                <path
                                                    d={topRoundedRectPath(p.xCenter - (p.barWidth / 2), p.y, p.barWidth, barHeight, THIN_BAR_TOP_RADIUS)}
                                                    fill={swatch.stroke}
                                                    stroke={isHighlighted ? 'rgba(0,0,0,0.35)' : 'none'}
                                                    strokeWidth={1.5} />
                                            ) : null }
                                            {/* Invisible hit target -- the bar's whole
                                                slot, a little taller than the bar
                                                itself so even a 0 (no bar) or a very
                                                short bar stays easy to hover. */}
                                            <rect x={p.xCenter - (p.slotWidth / 2)} y={p.y - 8}
                                                width={p.slotWidth} height={barHeight + 8}
                                                fill="transparent" />
                                        </g>
                                    );
                                }) }
                            </g>
                        );
                    }) }
                </svg>
                { bottomAxis }
            </div>
        );
    }
}

/**
 * Wraps ThinGroupedChartViewContainer with the same CursorViewBounds
 * interactivity the line/bar versions get -- see PopoverLineChartViewContainer.
 */
export class PopoverThinGroupedChartViewContainer extends React.PureComponent {

    render(){
        return (
            <CursorViewBounds {..._.pick(this.props, 'height', 'width', 'cursorContainerMargin', 'actions', 'href', 'context', 'schemas', 'mapping', 'aggregateType')}
                eventCategory="BarPlot"
                highlightTerm={false} clickCoordsFxn={ThinGroupedChartViewContainer.getCoordsCallback}>
                <ThinGroupedChartViewContainer {...this.props} />
            </CursorViewBounds>
        );
    }
}


/**
 * Thin stacked-bar rendering for Browse by Tissue's every other Group By
 * (e.g. Sequencing Center's GCCs) under the "Bars" chart style -- per
 * design feedback, stacked like the portal's other bar charts, but in the
 * same thin-mark style as the Sample Type grouped bars above so the 2
 * read as one family. Each tissue is one 12px bar at its own center, split
 * into one segment per term (2px gap between segments, rounded top).
 *
 * Like the portal's own stacked bars (BarSection), a bar's full height is
 * the tissue's own total, and its segments split that height in proportion
 * to their counts -- a sample can count under more than 1 term, so the
 * segments' raw counts don't always add up to the total exactly.
 *
 * Segments stack in one fixed term order everywhere (largest overall total
 * at the bottom, matching the legend's own count order), so a given term
 * always sits in the same position -- never re-ranked per tissue.
 */
class ThinStackedChartViewContainer extends React.PureComponent {

    static getCoordsCallback(node, containerPosition){
        return LineChartViewContainer.getCoordsCallback(node, containerPosition);
    }

    render(){
        const {
            topLevelField, width, height, leftAxis, bottomAxis, styleOptions, bars,
            fullHeightCount, onNodeMouseEnter, onNodeMouseLeave, onNodeClick,
            hoverTerm, hoverParentTerm, selectedTerm, selectedParentTerm
        } = this.props;
        const { offset } = styleOptions;
        const insetHeight = Math.max(height - offset.top - offset.bottom, 0);
        const baselineY = offset.top + insetHeight;
        const { terms } = getTissueSubTerms(bars);
        const totalsByTerm = {};
        _.forEach(bars, function (bar) {
            _.forEach(bar.bars || [], function (b) {
                totalsByTerm[b.term] = (totalsByTerm[b.term] || 0) + (b.count || 0);
            });
        });
        // Bottom -> top.
        const orderedTerms = _.sortBy(_.sortBy(terms), (term) => -(totalsByTerm[term] || 0));

        const segmentsByTerm = {};
        const totalLabels = [];
        _.forEach(bars, function (bar) {
            const xCenter = offset.left + bar.attr.x + (bar.attr.width / 2);
            const barHeight = fullHeightCount > 0 ? ((bar.count || 0) / fullHeightCount) * insetHeight : 0;
            const sections = _.filter(_.map(orderedTerms, (term) => _.findWhere(bar.bars || [], { term })), (b) => b && b.count > 0);
            const sectionSum = _.reduce(sections, (sum, b) => sum + b.count, 0);
            let yBottom = baselineY;
            _.forEach(sections, function (node, i) {
                const isTop = i === sections.length - 1;
                const fullSegmentHeight = sectionSum > 0 ? (node.count / sectionSum) * barHeight : 0;
                // The gap comes out of each lower segment's own top, so
                // the bar's overall top still lands exactly on its total.
                const drawnHeight = Math.max(fullSegmentHeight - (isTop ? 0 : THIN_BAR_GAP), 1);
                const yTop = yBottom - fullSegmentHeight;
                node.__x = xCenter;
                node.__y = yTop;
                (segmentsByTerm[node.term] = segmentsByTerm[node.term] || []).push({
                    node, isTop, xCenter, yTop, drawnHeight, fullSegmentHeight
                });
                yBottom = yTop;
            });
            if (sections.length > 0) {
                totalLabels.push({ key: bar.term, x: xCenter, y: baselineY - barHeight, count: bar.count });
            }
        });

        return (
            <div className="bar-plot-chart chart-container line-chart thin-stacked-chart no-highlight"
                data-field={topLevelField.field} style={{ height, width }}>
                { leftAxis }
                <svg className="line-chart-svg" width={width} height={height}
                    style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
                    { _.map(orderedTerms, function (term) {
                        const swatch = getTissueSampleTypeColor(term);
                        return (
                            // See LineChartViewContainer's own comment on
                            // `data-term` (legend hover highlighting).
                            <g key={term} className="line-chart-series" data-term={term}>
                                { _.map(segmentsByTerm[term] || [], function (seg, i) {
                                    // Popover swatch -- see LineChartViewContainer.
                                    seg.node.color = swatch.stroke;
                                    const isHighlighted = (
                                        CursorViewBounds.isSelected(seg.node, hoverTerm, hoverParentTerm) ||
                                        CursorViewBounds.isSelected(seg.node, selectedTerm, selectedParentTerm)
                                    );
                                    const x = seg.xCenter - (THIN_STACKED_BAR_WIDTH / 2);
                                    return (
                                        // eslint-disable-next-line react/no-array-index-key
                                        <g key={i} style={{ cursor: 'pointer' }}
                                            onMouseEnter={(evt) => onNodeMouseEnter(seg.node, evt)}
                                            onMouseLeave={(evt) => onNodeMouseLeave(seg.node, evt)}
                                            onClick={(evt) => onNodeClick(seg.node, evt)}>
                                            <path
                                                d={seg.isTop
                                                    ? topRoundedRectPath(x, seg.yTop, THIN_STACKED_BAR_WIDTH, seg.drawnHeight, THIN_BAR_TOP_RADIUS)
                                                    : topRoundedRectPath(x, seg.yTop + THIN_BAR_GAP, THIN_STACKED_BAR_WIDTH, seg.drawnHeight, 0)}
                                                fill={swatch.stroke}
                                                stroke={isHighlighted ? 'rgba(0,0,0,0.35)' : 'none'}
                                                strokeWidth={1.5} />
                                            {/* Invisible hit target, wider than the 12px bar itself. */}
                                            <rect x={seg.xCenter - 14} y={seg.yTop} width={28}
                                                height={Math.max(seg.fullSegmentHeight, 6)} fill="transparent" />
                                        </g>
                                    );
                                }) }
                            </g>
                        );
                    }) }
                    { _.map(totalLabels, function (label) {
                        return (
                            <text key={label.key} x={label.x} y={label.y - 6} textAnchor="middle"
                                className="thin-stacked-total-label" fontSize="0.75rem" fill="#4A5868">
                                { label.count }
                            </text>
                        );
                    }) }
                </svg>
                { bottomAxis }
            </div>
        );
    }
}

/**
 * Wraps ThinStackedChartViewContainer with the same CursorViewBounds
 * interactivity the line/bar versions get -- see PopoverLineChartViewContainer.
 */
export class PopoverThinStackedChartViewContainer extends React.PureComponent {

    render(){
        return (
            <CursorViewBounds {..._.pick(this.props, 'height', 'width', 'cursorContainerMargin', 'actions', 'href', 'context', 'schemas', 'mapping', 'aggregateType')}
                eventCategory="BarPlot"
                highlightTerm={false} clickCoordsFxn={ThinStackedChartViewContainer.getCoordsCallback}>
                <ThinStackedChartViewContainer {...this.props} />
            </CursorViewBounds>
        );
    }
}
