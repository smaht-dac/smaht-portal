'use strict';

import React from 'react';
import _ from 'underscore';
import memoize from 'memoize-one';
import DropdownButton from 'react-bootstrap/esm/DropdownButton';
import DropdownItem from 'react-bootstrap/esm/DropdownItem';

import Graph, { GraphParser, parseAnalysisSteps, parseBasicIOAnalysisSteps } from '@hms-dbmi-bgm/react-workflow-viz';
import { Checkbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Checkbox';
import { CollapsibleItemViewButtonToolbar } from './../CollapsibleItemViewButtonToolbar';
import { checkIfIndirectOrReferenceNodesExist, commonGraphPropsFromProps } from '../../MetaWorkflowRunView';
import { WorkflowDetailPane } from './WorkflowDetailPane';
import { WorkflowNodeElement } from './WorkflowNodeElement';
import { Legend } from './Legend';

function nodeDisplayLabel(node = {}) {
    return (node.title || node.name || '').toString().trim();
}

function extractNodeFileFormat(node = {}) {
    const metaFF = node && node.meta && node.meta.file_format;
    const runDataFile = node && node.meta && node.meta.run_data && node.meta.run_data.file;
    const pickFormat = function(ff){
        if (!ff) return null;
        if (typeof ff === 'string') return ff.toLowerCase();
        return (ff.file_format || ff.display_title || '').toString().toLowerCase() || null;
    };
    const fromMeta = pickFormat(metaFF);
    if (fromMeta) return fromMeta;
    if (Array.isArray(runDataFile) && runDataFile.length > 0){
        const first = runDataFile[0];
        return pickFormat(first && first.file_format);
    }
    if (runDataFile){
        return pickFormat(runDataFile.file_format);
    }
    return null;
}

const ESSENTIAL_FORMATS = new Set([
    'fastq_gz', 'fastq', 'bam', 'cram', 'vcf_gz', 'vcf', 'bwt', 'fa', 'fasta', 'interval_list'
]);

const AUXILIARY_FORMATS = new Set([
    'txt', 'pdf', 'json', 'zip', 'tsv', 'csv', 'log', 'html', 'yaml', 'yml', 'metrics'
]);

function isAuxiliaryNode(node = {}) {
    const format = extractNodeFileFormat(node);
    const ioType = ((node && node.ioType) || '').toLowerCase();
    if (ioType === 'qc' || ioType === 'report') return true;
    if (!format) return false;
    if (AUXILIARY_FORMATS.has(format)) return true;
    if (ESSENTIAL_FORMATS.has(format)) return false;
    // Unknown formats default to auxiliary in compact view to reduce noise.
    return true;
}

function relatedStepAnchor(node = {}) {
    const outputOf = node && node.outputOf;
    if (outputOf && (outputOf.id || outputOf.name)) return outputOf.id || outputOf.name;
    const inputOf = node && node.inputOf;
    if (Array.isArray(inputOf) && inputOf.length > 0){
        const first = inputOf[0];
        if (first && (first.id || first.name)) return first.id || first.name;
    }
    return 'no-step';
}

function updateAuxGroupLabel(node = {}) {
    if (!node || !node._isAuxiliaryGroup) return;
    const count = node._mergedCount || 1;
    const fmt = 'auxiliary';
    const noun = count === 1 ? 'file' : 'files';
    node.name = `${count} ${fmt} ${noun}`;
    node.title = node.name;
}

function reindexByColumn(nodes = []) {
    const byColumn = _.groupBy(nodes, function(node){ return node.column || 0; });
    _.forEach(byColumn, function(colNodes){
        _.sortBy(colNodes, function(node){ return node.y || node.indexInColumn || 0; })
            .forEach(function(node, idx){
                node.indexInColumn = idx;
            });
    });
}

function coalesceGraphForCompactMode(graphData = {}) {
    const { nodes = [], edges = [] } = graphData;
    if (!Array.isArray(nodes) || nodes.length === 0) return graphData;

    const mergedNodes = [];
    const mergeMap = new Map(); // original node object -> merged node object
    const mergedByKey = new Map();

    function compactKey(node) {
        const nodeType = node.nodeType || '';
        const col = typeof node.column === 'number' ? node.column : 0;
        const label = nodeDisplayLabel(node).toLowerCase();
        if (nodeType === 'step') return `step|${col}|${label}`;
        if (nodeType === 'input' || nodeType === 'output' || nodeType === 'input-group' || nodeType === 'output-group') {
            // Aggressively compact auxiliary artifacts (txt/pdf), which are often
            // diagnostics and dominate the view without improving pipeline readability.
            if ((nodeType === 'input' || nodeType === 'output') && isAuxiliaryNode(node)) {
                const ioType = (node.ioType || '').toLowerCase();
                const stepAnchor = relatedStepAnchor(node);
                return `${nodeType}|${col}|${ioType}|${stepAnchor}|aux-super-group`;
            }
            return `${nodeType}|${col}|${label}|${(node.ioType || '').toLowerCase()}`;
        }
        return null;
    }

    nodes.forEach(function(node){
        const key = compactKey(node);
        if (!key) {
            mergeMap.set(node, node);
            mergedNodes.push(node);
            return;
        }

        const existing = mergedByKey.get(key);
        if (!existing) {
            const cloned = { ...node, _mergedCount: 1, _compactedNodes: [node] };
            if ((node.nodeType === 'input' || node.nodeType === 'output') && isAuxiliaryNode(node)) {
                cloned._isAuxiliaryGroup = true;
            }
            updateAuxGroupLabel(cloned);
            mergedByKey.set(key, cloned);
            mergeMap.set(node, cloned);
            mergedNodes.push(cloned);
            return;
        }

        existing._mergedCount = (existing._mergedCount || 1) + 1;
        if (!Array.isArray(existing._compactedNodes)) existing._compactedNodes = [];
        existing._compactedNodes.push(node);
        if ((node.nodeType === 'input' || node.nodeType === 'output') && isAuxiliaryNode(node)) {
            existing._isAuxiliaryGroup = true;
        }
        updateAuxGroupLabel(existing);
        if (node.isCurrentContext) existing.isCurrentContext = true;
        mergeMap.set(node, existing);
    });

    const dedupEdges = new Map();
    const mergedEdges = [];
    edges.forEach(function(edge){
        const source = mergeMap.get(edge.source) || edge.source;
        const target = mergeMap.get(edge.target) || edge.target;
        if (!source || !target || source === target) return;
        const edgeKey = `${source.id || source.name || ''}|${target.id || target.name || ''}`;
        if (dedupEdges.has(edgeKey)) return;
        dedupEdges.set(edgeKey, true);
        mergedEdges.push({ ...edge, source, target });
    });

    reindexByColumn(mergedNodes);
    return { ...graphData, nodes: mergedNodes, edges: mergedEdges };
}

export class WorkflowGraphSection extends React.PureComponent {

    constructor(props){
        super(props);
        this.commonGraphProps = this.commonGraphProps.bind(this);
        this.parseAnalysisSteps = this.parseAnalysisSteps.bind(this);
        this.onToggleShowDetailsInPopup = _.throttle(this.onToggleShowDetailsInPopup.bind(this), 1000);
        this.onChangeShowChartType      = _.throttle(this.onChangeShowChartType.bind(this), 1000, { trailing : false });
        this.onToggleShowParameters     = _.throttle(this.onToggleShowParameters.bind(this), 1000);
        this.onToggleReferenceFiles     = _.throttle(this.onToggleReferenceFiles.bind(this), 1000);
        this.onToggleIndirectFiles      = _.throttle(this.onToggleIndirectFiles.bind(this), 1000);
        this.onToggleExpandedDetails    = _.throttle(this.onToggleExpandedDetails.bind(this), 1000);
        this.onChangeRowSpacingType     = _.throttle(this.onChangeRowSpacingType.bind(this), 1000, { trailing : false });
        this.renderDetailPane = this.renderDetailPane.bind(this);
        this.renderNodeElement = this.renderNodeElement.bind(this);

        this.memoized = {
            parseAnalysisSteps : memoize(parseAnalysisSteps),
            parseBasicIOAnalysisSteps: memoize(parseBasicIOAnalysisSteps),
            checkIfIndirectOrReferenceNodesExist : memoize(checkIfIndirectOrReferenceNodesExist)
        };

        this.state = {
            // Start with compact graph for readability; user can switch to detailed Analysis Steps.
            'showChart': 'basic',
            'showExpandedDetails': false,
            'showDetailsInPopup': true,
            'showParameters' : false,
            'showReferenceFiles' : false,
            'rowSpacingType' : 'compact',
            'showIndirectFiles': false
        };
    }


    parseAnalysisSteps(steps){
        const { showReferenceFiles, showParameters, showIndirectFiles, showChart, showExpandedDetails } = this.state;
        const parsingOptions = { showReferenceFiles, showParameters, "showIndirectFiles": true };
        const graphData = (showChart === 'basic' ?
            this.memoized.parseBasicIOAnalysisSteps(steps, {}, parsingOptions)
            :
            this.memoized.parseAnalysisSteps(steps, parsingOptions)
        );
        if (showChart === 'basic' && !showExpandedDetails) {
            return coalesceGraphForCompactMode(graphData);
        }
        return graphData;
    }

    commonGraphProps(){
        const { steps, includeAllRunsInSteps } = this.props;
        const { showParameters, showReferenceFiles, rowSpacingType } = this.state;
        const graphData = this.parseAnalysisSteps(steps);
        const { nodes = [] } = graphData;
        const { width: viewportWidth = 1200 } = this.props;

        const maxColumn = _.reduce(nodes, function(memo, node){
            return Math.max(memo, typeof node.column === 'number' ? node.column : 0);
        }, 0);
        const columnCount = maxColumn + 1;
        const minNodeWidth = 170;
        const maxNodeWidth = 260;
        const minSpacing = 70;
        const maxSpacing = 220;
        const innerMargin = { top: 70, bottom: 70, left: 28, right: 28 };
        const availableWidth = Math.max(900, viewportWidth - 30);

        let columnWidth = 210;
        let columnSpacing = 120;
        if (columnCount >= 2){
            const targetNodeWidth = Math.max(
                minNodeWidth,
                Math.min(maxNodeWidth, Math.floor((availableWidth * 0.58) / columnCount))
            );
            const remaining = availableWidth - innerMargin.left - innerMargin.right - (columnCount * targetNodeWidth);
            const targetSpacing = Math.floor(remaining / (columnCount - 1));
            columnWidth = targetNodeWidth;
            columnSpacing = Math.max(minSpacing, Math.min(maxSpacing, targetSpacing));
        }

        // Filter out legend items which aren't relevant for this context.
        const keepItems = ['Input File', 'Output File', 'Input Reference File'];
        if (showParameters){
            keepItems.push('Input Parameter');
        }
        if (showReferenceFiles){
            keepItems.push('Input Reference File');
        }
        keepItems.push('Intermediate File');

        const legendItems = _.pick(WorkflowDetailPane.Legend.defaultProps.items, keepItems);
        const commonGraphProps = commonGraphPropsFromProps({ ...this.props, legendItems });
        return {
            ...commonGraphProps,
            ...graphData,
            rowSpacingType,
            innerMargin,
            columnWidth,
            columnSpacing,
            legendItems,
            zoomControlsPortalSelector: '.workflow-zoom-controls-slot',
            renderDetailPane: this.renderDetailPane,
            renderNodeElement: this.renderNodeElement
        };
    }

    onChangeShowChartType(eventKey, evt){
        this.setState(function ({ showChart }) {
            if (eventKey === showChart) return null;
            return { 'showChart': eventKey };
        });
    }

    onToggleShowDetailsInPopup(){
        this.setState(function({ showDetailsInPopup }){
            return { 'showDetailsInPopup' : !showDetailsInPopup };
        });
    }

    onToggleShowParameters(){
        this.setState(function({ showParameters }){
            return { 'showParameters' : !showParameters };
        });
    }

    onToggleReferenceFiles(){
        this.setState(function({ showReferenceFiles }){
            return { 'showReferenceFiles' : !showReferenceFiles };
        });
    }

    onToggleIndirectFiles(){
        this.setState(function({ showIndirectFiles }){
            return { 'showIndirectFiles' : !showIndirectFiles };
        });
    }

    onToggleExpandedDetails(){
        this.setState(function({ showExpandedDetails }){
            return {
                showExpandedDetails: !showExpandedDetails,
                showChart: !showExpandedDetails ? 'detail' : 'basic'
            };
        });
    }

    onChangeRowSpacingType(eventKey, evt){
        this.setState(function({ rowSpacingType }){
            if (eventKey === rowSpacingType) return null;
            return { 'rowSpacingType' : eventKey };
        });
    }

    renderNodeElement(node, graphProps){
        const { windowWidth, schemas } = this.props;
        return <WorkflowNodeElement {...graphProps} schemas={schemas} windowWidth={windowWidth} node={node}/>;
    }

    renderDetailPane(node, graphProps){
        const { context, schemas, canDownloadFile } = this.props;
        const { showDetailsInPopup } = this.state;
        return <WorkflowDetailPane {...graphProps} {...{ context, node, schemas, showDetailsInPopup, canDownloadFile }} />;
    }

    render(){
        const { rowSpacingType, showParameters, showReferenceFiles, showIndirectFiles, showDetailsInPopup, showChart, showExpandedDetails } = this.state;
        const { context, mounted, width, steps = [] } = this.props;
        const { anyIndirectPathIONodes, anyReferenceFileNodes } = this.memoized.checkIfIndirectOrReferenceNodesExist(context.steps || steps);
        const commonGraphProps = this.commonGraphProps();

        let body = null;
        if (!Array.isArray(steps) || !mounted) {
            body = null;
        } else {
            body = (
                <div className="graph-with-inline-legend">
                    <div className="graph-toolbar-row">
                        <Legend items={commonGraphProps.legendItems} title={null} />
                    </div>
                    <div className="graph-canvas-row">
                        <Graph {...commonGraphProps} />
                    </div>
                </div>
            );
        }

        return (
            <div className="tabview-container-fullscreen-capable meta-workflow-view-container meta-workflow-viewing-detail">
                <h3 className="tab-section-title container-wide">
                    <span>Graph</span>
                    <WorkflowGraphSectionControls
                        {..._.pick(this.props, 'context', 'href', 'windowWidth', 'includeAllRunsInSteps', 'toggleAllRuns', 'isLoadingGraphSteps')}
                        showChartType={showChart}
                        rowSpacingType={rowSpacingType}
                        // Parameters are available but not visualized because of high number of them
                        // In future, need to adjust ReactWorkflowViz parsing code to re-use paramater nodes
                        // of same value and same/similar target, if possible.
                        showParameters={showParameters}
                        showDetailsInPopup={showDetailsInPopup}
                        showReferenceFiles={showReferenceFiles}
                        showExpandedDetails={showExpandedDetails}
                        // `showIndirectFiles=false` doesn't currently work in parsing for MWFRs, needs research.
                        // showIndirectFiles={showIndirectFiles}
                        onChangeShowChartType={this.onChangeShowChartType}
                        onRowSpacingTypeSelect={this.onChangeRowSpacingType}
                        onToggleShowParameters={this.onToggleShowParameters}
                        onToggleReferenceFiles={this.onToggleReferenceFiles}
                        // onToggleIndirectFiles={this.onToggleIndirectFiles}
                        isReferenceFilesCheckboxDisabled={!anyReferenceFileNodes}
                        onToggleShowDetailsInPopup={this.onToggleShowDetailsInPopup}
                        onToggleExpandedDetails={this.onToggleExpandedDetails}
                    />
                </h3>
                <hr className="tab-section-title-horiz-divider"/>
                { body }
            </div>
        );

    }

}

export const WorkflowGraphSectionControls = React.memo(function WorkflowGraphSectionControls(props){
    const {
        showChartType, showReferenceFiles, showParameters, showIndirectFiles,
        onChangeShowChartType, onToggleReferenceFiles, onToggleShowParameters, onToggleIndirectFiles,
        windowWidth, context,
        rowSpacingType, onRowSpacingTypeSelect,
        includeAllRunsInSteps, toggleAllRuns, isLoadingGraphSteps,
        showDetailsInPopup, onToggleShowDetailsInPopup,
        showExpandedDetails, onToggleExpandedDetails
    } = props;
    return (
        <CollapsibleItemViewButtonToolbar windowWidth={windowWidth}>
            {typeof showDetailsInPopup === "boolean" ?
                <ShowDetailsInPopupCheckBox checked={showDetailsInPopup} onChange={onToggleShowDetailsInPopup} disabled={false} />
                : null}
            <ExpandedDetailsCheckbox checked={showExpandedDetails} onChange={onToggleExpandedDetails} />
            <ShowAllRunsCheckbox checked={includeAllRunsInSteps} onChange={toggleAllRuns} disabled={isLoadingGraphSteps} />
            { typeof showReferenceFiles === "boolean" ?
                <ReferenceFilesCheckbox checked={showReferenceFiles} onChange={onToggleReferenceFiles} />
                : null }
            { typeof showParameters === "boolean" ?
                <ParametersFileCheckbox checked={showParameters} onChange={onToggleShowParameters} />
                : null }
            { typeof showIndirectFiles === "boolean" ?
                <IndirectFilesCheckbox checked={showIndirectFiles} onChange={onToggleIndirectFiles} />
                : null }
            {/* <IndirectFilesCheckbox checked={showIndirectFiles} onChange={onParsingOptChange} /> */}
            {/* Keep as fallback control, but primary exploration is explicit expanded-details toggle. */}
            <ChartTypeDropdown context={context} showChartType={showChartType} onSelect={onChangeShowChartType} />
            <RowSpacingTypeSelect rowSpacingType={rowSpacingType} onSelect={onRowSpacingTypeSelect} />
            <div className="workflow-zoom-controls-slot" />
        </CollapsibleItemViewButtonToolbar>
    );
});

function ExpandedDetailsCheckbox({ checked, onChange, disabled = false }){
    return (
        <Checkbox checked={!!checked} onChange={onChange} disabled={disabled}
            className="checkbox-container for-state-showExpandedDetails" name="showExpandedDetails">
            Expanded Details
        </Checkbox>
    );
}

function analysisStepsSet(context){
    // if (!context) return false;
    // if (!Array.isArray(context.steps)) return false;
    // if (context.steps.length === 0) return false;
    return true;
}

function RowSpacingTypeSelect(props){
    const { rowSpacingType, onSelect } = props;
    const titleMap = {
        "compact" : "Centered",
        "stacked" : "Stacked",
        "wide" : "Spread"
    };
    return (
        <DropdownButton onSelect={onSelect} title={titleMap[rowSpacingType]} variant="outline-dark" align="end">
            <DropdownItem active={rowSpacingType === "compact"} eventKey="compact">Centered</DropdownItem>
            <DropdownItem active={rowSpacingType === "stacked"} eventKey="stacked">Stacked</DropdownItem>
            <DropdownItem active={rowSpacingType === "wide"} eventKey="wide">Spread</DropdownItem>
        </DropdownButton>
    );
}

function ReferenceFilesCheckbox({ checked, onChange, disabled }){
    if (typeof onChange !== 'function') return null;
    if (typeof checked === 'undefined') return null;
    return (
        <Checkbox checked={checked} onChange={onChange} disabled={disabled || checked === null}
            className="checkbox-container for-state-showReferenceFiles" name="showReferenceFiles">
            Reference Files
        </Checkbox>
    );
}

/**
 * Meant for Workflow and WorkflowRunView only, not Provenance Graphs.
 * Required props below --
 *
 * @prop {Object} context - JSON of Item containing workflow steps.
 * @prop {string} showChartType - Type of chart shown. 'Detail' and 'basic' supported.
 * @prop {function} onChangeShowChartType - Callback accepting key of new chart type.
 */
function ChartTypeDropdown({ context, showChartType, onSelect }){
    const titleMap = {
        'detail': 'Detailed Steps',
        'basic': 'Compact View',
        'cwl': 'CWL Graph'
    };

    const detail = analysisStepsSet(context) ? (
        <DropdownItem eventKey="detail" active={showChartType === 'detail'}>
            Detailed Steps
        </DropdownItem>
    ) : null;

    const basic = (
        <DropdownItem eventKey="basic" active={showChartType === 'basic'}>
            Compact View
        </DropdownItem>
    );

    return (
        <DropdownButton id="detail-granularity-selector" key="chart-type"
            className="for-state-showChart" variant="outline-dark"
            onSelect={onSelect}
            title={titleMap[showChartType]}>
            { basic }{ detail }
        </DropdownButton>
    );
}

function IndirectFilesCheckbox({ checked, onChange, disabled }){
    if (typeof onChange !== 'function') return null;
    if (typeof checked === 'undefined') return null;
    return (
        <Checkbox checked={checked} onChange={onChange} disabled={disabled || checked === null}
            className="checkbox-container for-state-showIndirectFiles" name="showIndirectFiles">
            Indirect Files
        </Checkbox>
    );
}

function ShowAllRunsCheckbox({ checked, onChange, disabled }){
    if (typeof onChange !== 'function') return null;
    if (typeof checked === 'undefined') return null;
    return (
        <Checkbox checked={checked || checked === null} onChange={onChange} disabled={disabled || checked === null}
            className="checkbox-container for-state-allRuns" name="allRuns">
            All Runs
        </Checkbox>
    );
}

function ParametersFileCheckbox({ checked, onChange, disabled }) {
    if (typeof onChange !== 'function') return null;
    if (typeof checked === 'undefined') return null;
    return (
        <Checkbox checked={checked} onChange={onChange} disabled={disabled || checked === null}
            className="checkbox-container for-state-showParameters" name="showParameters">
            Parameters
        </Checkbox>
    );
}

function ShowDetailsInPopupCheckBox({ checked, onChange, disabled }){
    if (typeof onChange !== 'function') return null;
    if (typeof checked === 'undefined') return null;
    return (
        <Checkbox checked={checked || checked === null} onChange={onChange} disabled={disabled || checked === null}
            className="checkbox-container for-state-detailsInPopup" name="detailsInPopup">
            Details in Popup
        </Checkbox>
    );
}
