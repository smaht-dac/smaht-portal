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

function isPrimaryDataNode(node = {}) {
    const nodeType = (node && node.nodeType) || '';
    const ioType = ((node && node.ioType) || '').toLowerCase();
    if (nodeType !== 'input' && nodeType !== 'output') return false;
    if (ioType === 'reference file' || ioType === 'parameter') return false;
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
    // Keep `name` stable for relation/path computations in react-workflow-viz.
    // Use `title` as the user-facing grouped label.
    node.title = `${count} ${fmt} ${noun}`;
}

function updateStepGroupLabel(node = {}) {
    if (!node || !node._isAuxStepGroup) return;
    const count = node._mergedCount || 1;
    const noun = count === 1 ? 'step' : 'steps';
    node.title = `${count} auxiliary ${noun}`;
}

/**
 * Reassigns node.column values so that the workflow graph renders as a proper
 * left-to-right DAG instead of a flat "all steps in one column" layout.
 *
 * Uses context.meta_workflow.workflows (always present on MetaWorkflowRun items)
 * to determine step ordering. Each MWF workflow step has input[j].source giving
 * the upstream step name. We build a level map (longest-path topological sort)
 * then connect graph step nodes to levels via their workflow @id.
 *
 * Falls back to edge/node connectivity for non-MetaWorkflow graphs (plain
 * Workflow/WorkflowRun views where context.meta_workflow is absent).
 *
 * Mutates nodes in place; idempotent.
 */

/**
 * After library parsing, group nodes that represent the same set of files may appear twice:
 * once as an output of a step (with run_data.file = group_obj from collapseRunDataFilesOnStep)
 * and once as an input (with a different synthetic @id for the same underlying files).
 * This merges duplicate IO nodes by matching them on their underlying file @ids.
 * Mutates graphData in place.
 */
function mergeGroupedFileNodes(graphData = {}) {
    const { nodes, edges } = graphData;
    if (!nodes || !edges) return;

    function fileSetKey(n) {
        const rf = n.meta && n.meta.run_data && n.meta.run_data.file;
        if (!rf) return null;
        if (Array.isArray(rf.grouped_files) && rf.grouped_files.length > 0) {
            const ids = rf.grouped_files.map(function(f) { return f && f['@id']; }).filter(Boolean).sort();
            return ids.length > 0 ? 'group:' + ids.join('|') : null;
        }
        const fid = rf['@id'];
        if (fid && fid.indexOf('group:') !== 0) {
            return 'file:' + fid;
        }
        return null;
    }

    const keyToNodes = new Map();
    nodes.forEach(function(n) {
        if (n.nodeType === 'step') return;
        const key = fileSetKey(n);
        if (!key) return;
        if (!keyToNodes.has(key)) keyToNodes.set(key, []);
        keyToNodes.get(key).push(n);
    });

    const toRemove = new Set();
    keyToNodes.forEach(function(fileNodes) {
        if (fileNodes.length <= 1) return;
        const primary = fileNodes.find(function(n) { return n.outputOf; }) || fileNodes[0];
        fileNodes.forEach(function(dup) {
            if (dup === primary) return;
            if (Array.isArray(dup.inputOf)) {
                if (!primary.inputOf) primary.inputOf = [];
                dup.inputOf.forEach(function(s) {
                    if (primary.inputOf.indexOf(s) === -1) primary.inputOf.push(s);
                });
            }
            if (dup.outputOf && !primary.outputOf) primary.outputOf = dup.outputOf;
            edges.forEach(function(e) {
                if (e.source === dup) e.source = primary;
                if (e.target === dup) e.target = primary;
            });
            toRemove.add(dup);
        });
    });

    if (toRemove.size > 0) {
        graphData.nodes = nodes.filter(function(n) { return !toRemove.has(n); });
    }
}

function reassignColumnsFromTopology(graphData = {}, context = {}) {
    const { nodes = [], edges = [] } = graphData;
    if (nodes.length === 0) return;

    const stepNodes = nodes.filter(function(n) { return n.nodeType === 'step'; });
    if (stepNodes.length === 0) return;

    // --- Build edge-based file↔step maps (used for file column propagation) ---
    const fileInputSteps = new Map();  // file node → Set<step nodes it feeds>
    const fileOutputStep = new Map();  // file node → step node that produced it
    edges.forEach(function(edge) {
        const s = edge.source, t = edge.target;
        if (!s || !t) return;
        if (s.nodeType !== 'step' && t.nodeType === 'step') {
            if (!fileInputSteps.has(s)) fileInputSteps.set(s, new Set());
            fileInputSteps.get(s).add(t);
        } else if (s.nodeType === 'step' && t.nodeType !== 'step') {
            fileOutputStep.set(t, s);
        }
    });

    // --- Attempt to derive step levels from MetaWorkflow definition ---
    // context.meta_workflow.workflows[i]:
    //   .name        — MWF step name (e.g. "bwa_mem")
    //   .workflow    — linked workflow item (has "@id")
    //   .input[j].source — name of the upstream MWF step (if any)
    const mwfWorkflows = context && context.meta_workflow && Array.isArray(context.meta_workflow.workflows)
        ? context.meta_workflow.workflows : [];

    // Map: workflow @id  →  MWF step name
    const wfIdToMwfName = {};
    // Map: MWF step name → Set<upstream MWF step names>
    const mwfPred = {};
    mwfWorkflows.forEach(function(mwfStep) {
        const { name } = mwfStep;
        if (!name) return;
        if (!mwfPred[name]) mwfPred[name] = new Set();
        const wfId = mwfStep.workflow && (mwfStep.workflow['@id'] || mwfStep.workflow);
        if (wfId) wfIdToMwfName[wfId] = name;
        (mwfStep.input || []).forEach(function(inp) {
            if (inp.source) mwfPred[name].add(inp.source);
        });
    });

    // Topological longest-path BFS on MWF step names → level
    const mwfLevel = {};
    const mwfNames = Object.keys(mwfPred);
    if (mwfNames.length > 1) {
        const mwfSucc = {};
        mwfNames.forEach(function(n) { mwfSucc[n] = new Set(); });
        mwfNames.forEach(function(n) {
            mwfPred[n].forEach(function(p) { if (mwfSucc[p]) mwfSucc[p].add(n); });
        });
        const inDeg = {};
        mwfNames.forEach(function(n) { inDeg[n] = mwfPred[n].size; });
        const queue = [];
        mwfNames.forEach(function(n) {
            if (inDeg[n] === 0) { mwfLevel[n] = 0; queue.push(n); }
        });
        let head = 0;
        while (head < queue.length) {
            const n = queue[head++];
            const lv = mwfLevel[n];
            (mwfSucc[n] || new Set()).forEach(function(s) {
                mwfLevel[s] = Math.max(mwfLevel[s] || 0, lv + 1);
                inDeg[s]--;
                if (inDeg[s] <= 0) queue.push(s);
            });
        }
    }

    // Map graph step nodes → level via workflow @id → MWF step name → level
    const stepLevel = new Map();
    let hasMwfLevels = false;
    stepNodes.forEach(function(n) {
        const wfId = n.meta && n.meta.workflow && (n.meta.workflow['@id'] || n.meta.workflow);
        const mwfName = wfIdToMwfName[wfId];
        if (mwfName !== undefined && mwfLevel[mwfName] !== undefined) {
            stepLevel.set(n, mwfLevel[mwfName]);
            if (mwfLevel[mwfName] > 0) hasMwfLevels = true;
        }
    });

    // --- Fallback: derive levels from edge/node connectivity ---
    if (!hasMwfLevels) {
        const stepByName = new Map();
        stepNodes.forEach(function(n) { stepByName.set(n.name, n); });
        const stepPred = new Map();
        stepNodes.forEach(function(n) { stepPred.set(n, new Set()); });

        const addDep = function(upstream, downstream) {
            if (!upstream || !downstream || upstream === downstream) return;
            if (stepPred.has(downstream)) stepPred.get(downstream).add(upstream);
        };

        fileInputSteps.forEach(function(downstreamSteps, fileNode) {
            const upstream = fileOutputStep.get(fileNode);
            if (!upstream) return;
            downstreamSteps.forEach(function(ds) { addDep(upstream, ds); });
        });
        nodes.forEach(function(node) {
            if (node.nodeType === 'step') return;
            const upstream = node.outputOf;
            if (!upstream) return;
            (node.inputOf || []).forEach(function(ds) { addDep(upstream, ds); });
            (node._target || []).forEach(function(t) {
                if (t.step == null) return;
                addDep(upstream, stepByName.get(t.step));
            });
        });
        nodes.forEach(function(node) {
            if (node.nodeType === 'step') return;
            if (!Array.isArray(node.inputOf) || !Array.isArray(node._source)) return;
            node._source.forEach(function(s) {
                if (s.step == null) return;
                const upstream = stepByName.get(s.step);
                if (!upstream) return;
                node.inputOf.forEach(function(ds) { addDep(upstream, ds); });
            });
        });

        const stepSucc = new Map();
        stepNodes.forEach(function(n) { stepSucc.set(n, new Set()); });
        stepPred.forEach(function(preds, n) {
            preds.forEach(function(p) { if (stepSucc.has(p)) stepSucc.get(p).add(n); });
        });
        const inDeg2 = new Map();
        stepNodes.forEach(function(n) { inDeg2.set(n, stepPred.get(n).size); });
        const queue2 = [];
        stepNodes.forEach(function(n) {
            if (inDeg2.get(n) === 0) { stepLevel.set(n, 0); queue2.push(n); }
        });
        let head2 = 0;
        while (head2 < queue2.length) {
            const n = queue2[head2++];
            const lv = stepLevel.get(n);
            stepSucc.get(n).forEach(function(s) {
                stepLevel.set(s, Math.max(stepLevel.get(s) || 0, lv + 1));
                const rem = (inDeg2.get(s) || 1) - 1;
                inDeg2.set(s, rem);
                if (rem <= 0) queue2.push(s);
            });
        }
        const anyLevel = stepNodes.some(function(n) { return (stepLevel.get(n) || 0) > 0; });
        if (!anyLevel) return;
    }

    // --- Apply step columns (library formula: col = (level+1)*2 - 1) ---
    stepNodes.forEach(function(n) {
        if (!stepLevel.has(n)) return;
        n.column = (stepLevel.get(n) + 1) * 2 - 1;
    });

    // --- Propagate to file nodes ---
    nodes.forEach(function(n) {
        if (n.nodeType === 'step') return;
        const producedBy = fileOutputStep.get(n) || n.outputOf;
        if (producedBy && stepLevel.has(producedBy)) {
            n.column = producedBy.column + 1;
            return;
        }
        const consumers = fileInputSteps.get(n);
        if (consumers && consumers.size > 0) {
            let minStepCol = Infinity;
            consumers.forEach(function(s) {
                if (typeof s.column === 'number') minStepCol = Math.min(minStepCol, s.column);
            });
            if (minStepCol !== Infinity) n.column = Math.max(0, minStepCol - 1);
        }
    });
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

function mergeUniqueNodeRefs(existingList, incomingList){
    const left = Array.isArray(existingList) ? existingList : [];
    const right = Array.isArray(incomingList) ? incomingList : [];
    if (right.length === 0) return left;
    const seen = new Set(left.map(function(n){ return (n && (n.id || n.name)) || null; }));
    const merged = left.slice();
    right.forEach(function(n){
        const key = (n && (n.id || n.name)) || null;
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(n);
    });
    return merged;
}

function mergeNodeConnectivity(targetNode = {}, incomingNode = {}){
    // Preserve relation/path discovery after compaction by aggregating references
    // that react-workflow-viz uses for selection/path highlighting.
    targetNode.inputOf = mergeUniqueNodeRefs(targetNode.inputOf, incomingNode.inputOf);
    targetNode.outputOf = targetNode.outputOf || incomingNode.outputOf || null;
    targetNode.inputNodes = mergeUniqueNodeRefs(targetNode.inputNodes, incomingNode.inputNodes);
    targetNode.outputNodes = mergeUniqueNodeRefs(targetNode.outputNodes, incomingNode.outputNodes);
    targetNode._source = mergeUniqueNodeRefs(targetNode._source, incomingNode._source);
    targetNode._target = mergeUniqueNodeRefs(targetNode._target, incomingNode._target);
}

function coalesceGraphForCompactMode(graphData = {}, options = {}) {
    const { nodes = [], edges = [] } = graphData;
    const {
        groupStepNodes = false,
        groupCoreFiles = true,
        groupAuxiliaryFiles = true
    } = options;
    if (!Array.isArray(nodes) || nodes.length === 0) return graphData;

    const stepNodeHints = new Map();
    if (groupStepNodes) {
        const stepToOutputs = new Map();
        edges.forEach(function(edge){
            const source = edge && edge.source;
            const target = edge && edge.target;
            if (!source || !target) return;
            if ((source.nodeType || '') !== 'step') return;
            if ((target.nodeType || '') !== 'output' && (target.nodeType || '') !== 'output-group') return;
            if (!stepToOutputs.has(source)) stepToOutputs.set(source, []);
            stepToOutputs.get(source).push(target);
        });

        nodes.forEach(function(node){
            if ((node.nodeType || '') !== 'step') return;
            const outputNodes = stepToOutputs.get(node) || [];
            if (outputNodes.length === 0) return;
            const allAuxOutputs = outputNodes.every(function(outNode){
                return isPrimaryDataNode(outNode) && isAuxiliaryNode(outNode);
            });
            if (allAuxOutputs) {
                stepNodeHints.set(node, 'aux-step');
            }
        });
    }

    const mergedNodes = [];
    const mergeMap = new Map(); // original node object -> merged node object
    const mergedByKey = new Map();

    function compactKey(node) {
        const nodeType = node.nodeType || '';
        const col = typeof node.column === 'number' ? node.column : 0;
        const label = nodeDisplayLabel(node).toLowerCase();
        if (nodeType === 'step') {
            // Expanded details can still be noisy on repeated runs. Allow optional
            // coalescing of exact step-title duplicates in the same column.
            if (!groupStepNodes) return null;
            const hint = stepNodeHints.get(node);
            if (hint === 'aux-step') {
                return `${nodeType}|${col}|aux-step-group`;
            }
            return `${nodeType}|${col}|${label}|step-coalesced`;
        }
        if (nodeType === 'input' || nodeType === 'output' || nodeType === 'input-group' || nodeType === 'output-group') {
            // Compact by side+step+format (ignoring argument-name text) to reduce repeated
            // bam/fastq/etc while preserving directionality and step context.
            if (isPrimaryDataNode(node)) {
                const ioType = (node.ioType || 'data file').toLowerCase();
                const fmt = extractNodeFileFormat(node) || 'any';
                const tier = isAuxiliaryNode(node) ? 'aux' : 'core';
                // Keep all auxiliary artifacts in a single bucket per side/column
                // to avoid fragmented 15+4+1 style groups.
                if (tier === 'aux') {
                    if (!groupAuxiliaryFiles) return null;
                    return `${nodeType}|${col}|${ioType}|tier:aux|io-compact`;
                }
                // Core pipeline files still grouped by format.
                if (!groupCoreFiles) return null;
                return `${nodeType}|${col}|${ioType}|fmt:${fmt}|tier:${tier}|io-compact`;
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
            if (isPrimaryDataNode(node) && isAuxiliaryNode(node)) {
                cloned._isAuxiliaryGroup = true;
            }
            if ((node.nodeType || '') === 'step' && stepNodeHints.get(node) === 'aux-step') {
                cloned._isAuxStepGroup = true;
            }
            updateAuxGroupLabel(cloned);
            updateStepGroupLabel(cloned);
            mergedByKey.set(key, cloned);
            mergeMap.set(node, cloned);
            mergedNodes.push(cloned);
            return;
        }

        existing._mergedCount = (existing._mergedCount || 1) + 1;
        if (!Array.isArray(existing._compactedNodes)) existing._compactedNodes = [];
        existing._compactedNodes.push(node);
        if (isPrimaryDataNode(node) && isAuxiliaryNode(node)) {
            existing._isAuxiliaryGroup = true;
        }
        if ((node.nodeType || '') === 'step' && stepNodeHints.get(node) === 'aux-step') {
            existing._isAuxStepGroup = true;
        }
        mergeNodeConnectivity(existing, node);
        updateAuxGroupLabel(existing);
        updateStepGroupLabel(existing);
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
        const { context } = this.props;
        const parsingOptions = { showReferenceFiles, showParameters, "showIndirectFiles": true };
        const graphData = (showChart === 'basic' ?
            this.memoized.parseBasicIOAnalysisSteps(steps, {}, parsingOptions)
            :
            this.memoized.parseAnalysisSteps(steps, parsingOptions)
        );
        mergeGroupedFileNodes(graphData);
        reassignColumnsFromTopology(graphData, context);
        if (showChart === 'basic' && !showExpandedDetails) {
            return coalesceGraphForCompactMode(graphData, {
                groupStepNodes: false,
                groupCoreFiles: true,
                groupAuxiliaryFiles: true
            });
        }
        if (showChart === 'detail' && showExpandedDetails) {
            // Keep detailed step-level graph, but reduce visual noise:
            // 1) group duplicated step nodes by title in the same column
            // 2) group auxiliary and repeated core file nodes
            return coalesceGraphForCompactMode(graphData, {
                groupStepNodes: true,
                groupCoreFiles: true,
                groupAuxiliaryFiles: true
            });
        }
        return graphData;
    }

    commonGraphProps(){
        const { steps, includeAllRunsInSteps } = this.props;
        const { showParameters, showReferenceFiles, rowSpacingType, showDetailsInPopup } = this.state;
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
            dimNonPathOnSelect: !showDetailsInPopup,
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
