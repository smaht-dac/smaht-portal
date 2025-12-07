'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import { format as dateFormat } from "date-fns";
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

function fileIDsMatch(a, b) {
    const idFrom = (file) => file && (file['@id'] || file.uuid || file.accession || file);
    return !!idFrom(a) && idFrom(a) === idFrom(b);
}

function cloneRunData(runData = {}) {
    const cloned = { ...runData };
    if (Array.isArray(runData.file)) cloned.file = runData.file.slice();
    if (Array.isArray(runData.value)) cloned.value = runData.value.slice();
    if (Array.isArray(runData.meta)) cloned.meta = runData.meta.slice();
    else if (runData.meta && typeof runData.meta === 'object') cloned.meta = { ...runData.meta };
    return cloned;
}

function cloneIO(io = {}, linkKey) {
    const cloned = { ...io };
    if (io[linkKey]) {
        cloned[linkKey] = io[linkKey].map((entry) => ({ ...entry }));
    }
    if (io.run_data) cloned.run_data = cloneRunData(io.run_data);
    if (io.meta) cloned.meta = { ...io.meta };
    return cloned;
}

function cloneStep(step = {}) {
    return {
        ...step,
        meta: step.meta ? { ...step.meta } : {},
        inputs: (step.inputs || []).map((io) => cloneIO(io, 'source')),
        outputs: (step.outputs || []).map((io) => cloneIO(io, 'target'))
    };
}

function mergeRunData(target = {}, incoming = {}) {
    const merged = { ...target };
    const incomingFiles = Array.isArray(incoming.file) ? incoming.file : incoming.file ? [incoming.file] : [];
    const incomingValues = Array.isArray(incoming.value) ? incoming.value : typeof incoming.value !== 'undefined' ? [incoming.value] : [];

    if (incomingFiles.length) {
        const files = Array.isArray(merged.file) ? merged.file.slice() : [];
        const meta = Array.isArray(merged.meta) ? merged.meta.slice() : Array.isArray(incoming.meta) ? [] : merged.meta;

        incomingFiles.forEach((file, idx) => {
            const existingIdx = files.findIndex((existingFile) => fileIDsMatch(existingFile, file));
            if (existingIdx === -1) {
                files.push(file);
                if (Array.isArray(meta)) {
                    meta.push(Array.isArray(incoming.meta) ? incoming.meta[idx] : null);
                }
            }
        });

        merged.file = files;
        if (Array.isArray(meta)) {
            merged.meta = meta;
        } else if (Array.isArray(incoming.meta) && !merged.meta) {
            merged.meta = incoming.meta.slice();
        }
    }

    if (incomingValues.length) {
        const values = Array.isArray(merged.value) ? merged.value.slice() : [];
        incomingValues.forEach((val) => {
            if (!values.includes(val)) {
                values.push(val);
            }
        });
        merged.value = values;
        if (!merged.meta && incoming.meta && !Array.isArray(incoming.meta)) {
            merged.meta = { ...incoming.meta };
        }
    }

    if (typeof merged.type === 'undefined' && incoming.type) {
        merged.type = incoming.type;
    }

    return merged;
}

function mergeEdgeEntries(existingList = [], incomingList = []) {
    const merged = existingList.slice();
    incomingList.forEach((entry) => {
        const keyParts = [
            entry.step || '',
            entry.name || '',
            entry.for_file || '',
            entry.grouped_by || '',
            entry.grouped_by && entry[entry.grouped_by] || ''
        ];
        const key = keyParts.join('|');
        if (!merged.some((existing) => {
            const existingKeyParts = [
                existing.step || '',
                existing.name || '',
                existing.for_file || '',
                existing.grouped_by || '',
                existing.grouped_by && existing[existing.grouped_by] || ''
            ];
            return existingKeyParts.join('|') === key;
        })) {
            merged.push({ ...entry });
        }
    });
    return merged;
}

function mergeIOLists(targetList = [], incomingList = [], linkKey) {
    incomingList.forEach((io) => {
        const existing = targetList.find((existingIO) => existingIO.name === io.name);
        if (!existing) {
            targetList.push(cloneIO(io, linkKey));
            return;
        }
        existing[linkKey] = mergeEdgeEntries(existing[linkKey], io[linkKey]);
        if (io.run_data) {
            existing.run_data = mergeRunData(existing.run_data, io.run_data);
        }
    });
}

function getWorkflowGroupingKey(step = {}) {
    const { workflow = null } = step.meta || {};
    if (!workflow || typeof workflow !== 'object') return null;
    return workflow['@id'] || workflow.uuid || workflow.accession || workflow.display_title || workflow.name || null;
}

function createGroupedStep(step, groupKey) {
    const groupedStep = cloneStep(step);
    groupedStep.name = groupKey;
    const workflowTitle = groupedStep.meta.workflow && (groupedStep.meta.workflow.display_title || groupedStep.meta.workflow.name);
    groupedStep.meta = {
        ...groupedStep.meta,
        display_title: workflowTitle || groupedStep.meta.display_title,
        grouped_workflow_runs: [step.name]
    };
    return groupedStep;
}

function mergeGroupedStep(targetStep, sourceStep) {
    if (!Array.isArray(targetStep.meta.grouped_workflow_runs)) {
        targetStep.meta.grouped_workflow_runs = [];
    }
    if (targetStep.meta.grouped_workflow_runs.indexOf(sourceStep.name) === -1) {
        targetStep.meta.grouped_workflow_runs.push(sourceStep.name);
    }
    mergeIOLists(targetStep.inputs, sourceStep.inputs || [], 'source');
    mergeIOLists(targetStep.outputs, sourceStep.outputs || [], 'target');
}

function rewriteStepReferences(steps = [], nameMap = {}) {
    steps.forEach((step) => {
        (step.inputs || []).forEach(({ source = [] }) => {
            source.forEach((sourceEntry) => {
                if (sourceEntry.step && nameMap[sourceEntry.step]) {
                    sourceEntry.step = nameMap[sourceEntry.step];
                }
            });
        });
        (step.outputs || []).forEach(({ target = [] }) => {
            target.forEach((targetEntry) => {
                if (targetEntry.step && nameMap[targetEntry.step]) {
                    targetEntry.step = nameMap[targetEntry.step];
                }
            });
        });
    });
}

function collapseRunDataFilesOnStep(step) {
    function collapseIO(io) {
        const { run_data: runData } = io || {};
        if (!runData || !Array.isArray(runData.file) || runData.file.length <= 1) {
            return;
        }

        const files = runData.file;
        const metas = Array.isArray(runData.meta) ? runData.meta : [];

        function formatKey(file) {
            const fmt = file && file.file_format;
            if (!fmt) return { key: 'unknown', label: 'files' };
            if (typeof fmt === 'string') return { key: fmt, label: fmt };
            return {
                key: fmt['@id'] || fmt.uuid || fmt.display_title || 'unknown',
                label: fmt.display_title || fmt.file_format || 'files'
            };
        }

        const groupedByFormat = files.reduce(function(memo, file, idx) {
            const { key, label } = formatKey(file);
            if (!memo[key]) memo[key] = { label, list: [] };
            memo[key].list.push({ file, meta: metas[idx] });
            return memo;
        }, {});

        // If only one format group and a single file, leave untouched.
        const formatGroups = Object.keys(groupedByFormat);
        if (formatGroups.length === 1 && groupedByFormat[formatGroups[0]].list.length === 1) {
            return;
        }

        const idSafeStep = (step.name || '').replace(/[^a-zA-Z0-9:_-]/g, '_') || 'group';
        const idSafeArg = (io.name || '').replace(/[^a-zA-Z0-9:_-]/g, '_') || 'io';

        const groupedFiles = [];
        const groupedMeta = [];
        formatGroups.forEach(function(groupKey, idx) {
            const { label, list } = groupedByFormat[groupKey];
            if (list.length === 1) {
                groupedFiles.push(list[0].file);
                groupedMeta.push(list[0].meta || null);
                return;
            }
            const [first] = list;
            const groupedId = `group:${idSafeStep}:${idSafeArg}:${idx}`;
            const groupedFile = {
                '@id': groupedId,
                'display_title': `${list.length} similar files`,
                'file_format': first.file && first.file.file_format
            };
            groupedFile.grouped_files = list.map(({ file }) => file);
            groupedFiles.push(groupedFile);
            groupedMeta.push(list[0].meta || null);
        });

        runData.file = groupedFiles;
        if (groupedMeta.length > 0) {
            runData.meta = groupedMeta;
        } else if (Array.isArray(runData.meta)) {
            runData.meta = runData.meta[0] || null;
        }
    }
    (step.inputs || []).forEach(collapseIO);
    (step.outputs || []).forEach(collapseIO);
}

export function groupSimilarProvenanceSteps(rawSteps = []) {
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) return rawSteps;

    const workflowCounts = rawSteps.reduce(function(memo, step) {
        const key = getWorkflowGroupingKey(step);
        if (!key) return memo;
        memo[key] = (memo[key] || 0) + 1;
        return memo;
    }, {});

    const groupedByKey = {};
    const groupedSteps = [];
    const nameMap = {};

    rawSteps.forEach((step) => {
        const groupKey = getWorkflowGroupingKey(step);
        const shouldGroup = groupKey && workflowCounts[groupKey] > 1;
        if (!shouldGroup) {
            nameMap[step.name] = step.name;
            groupedSteps.push(cloneStep(step));
            return;
        }
        nameMap[step.name] = groupKey;
        if (!groupedByKey[groupKey]) {
            groupedByKey[groupKey] = createGroupedStep(step, groupKey);
            nameMap[groupKey] = groupKey;
            groupedSteps.push(groupedByKey[groupKey]);
        } else {
            mergeGroupedStep(groupedByKey[groupKey], step);
        }
    });

    rewriteStepReferences(groupedSteps, nameMap);
    groupedSteps.forEach(collapseRunDataFilesOnStep);
    return groupedSteps;
}

/**
 * `onMount`, sends ajax POST request to `trace_meta_workflow_run_steps/{uuid}/?{options}`
 * and holds state for holding response, loading state, state for options, and methods
 * for handling those options.
 *
 * Used in FileView and similar ItemViews
 * where need to show a provenance graph.
 *
 * Each ItemType/View that uses this controller should also have
 * a handler for the type on the backend in visualization.py.
 *
 * Can also be used to build a provenance graph view in any other
 * place, e.g. using results from AJAXed ProcessedFile or similar.
 *
 * (Off Topic)
 * In future, maybe we can stop extending DefaultItemView for ItemViews
 * and instead use composition & props for getTabViewContents and such.
 */
export class ProvenanceGraphStepsFetchingController extends React.PureComponent {

    static propTypes = {
        "context": PropTypes.shape({
            "uuid" : PropTypes.string, // We need UUID to send to endpoint, not `@id` as would be used for other requests for resource.
        }),
        "shouldGraphExist": PropTypes.func
    };

    static defaultProps = {
        "shouldGraphExist": function(context){
            console.warn("No `shouldGraphExist` prop is set, will make request even if nothing to trace on item.");
            return true;
        }
    };

    constructor(props){
        super(props);
        this.loadGraphSteps = this.loadGraphSteps.bind(this);
        this.toggleAllRuns = _.throttle(this.toggleAllRuns.bind(this), 1000, { trailing: false });
        this.onToggleShowDetailsInPopup = _.throttle(this.onToggleShowDetailsInPopup.bind(this), 1000, { trailing: false });
        this.state = {
            includeAllRunsInSteps: false,
            showDetailsInPopup: true,
            isLoadingGraphSteps: false,
            graphSteps: null,
            loadingStepsError: null
        };
    }

    componentDidMount(){
        this.loadGraphSteps();
    }

    /**
    * Converts all step names (and sources/targets' step names) to integers.
    *
    * @todo Improve if needed.
    * @todo Move into ReactWorkflowViz project.
    */
    identifiersToIntegers(steps) {
        const nameDict = {};

        function convertNameToInt(name) {
            let returnInt;
            const existingInt = nameDict[name];
            if (typeof existingInt === "undefined") {
                // Start count from 1.
                returnInt = nameDict[name] = Object.keys(nameDict).length + 1;
            } else {
                returnInt = existingInt;
            }
            return returnInt;
        }
        steps.forEach(function (step) {
            const { name, inputs = [], outputs = [] } = step;
            step.name = convertNameToInt(name);
            inputs.forEach(function ({ source = [] }) {
                source.forEach(function (sourceEntry) {
                    if (!sourceEntry.step) return;
                    sourceEntry.step = convertNameToInt(sourceEntry.step);
                });
            });
            outputs.forEach(function ({ target = [] }) {
                target.forEach(function (targetEntry) {
                    if (!targetEntry.step) return;
                    targetEntry.step = convertNameToInt(targetEntry.step);
                });
            });

        });
        return steps;
    }

    loadGraphSteps(){
        const { context, shouldGraphExist } = this.props;
        const { uuid } = context;
        if (typeof uuid !== 'string') {
            throw new Error("Expected context.uuid");
        }
        if (typeof shouldGraphExist === 'function' && !shouldGraphExist(context)){
            console.warn("No or not populated workflow_run_outputs field");
            return;
        }

        const { includeAllRunsInSteps, isLoadingGraphSteps } = this.state;
        const callback = (res) => {
            if (Array.isArray(res) && res.length > 0){
                const stepsToUse = includeAllRunsInSteps ? res : groupSimilarProvenanceSteps(res);
                this.setState({
                    'graphSteps' : this.identifiersToIntegers(stepsToUse),
                    'isLoadingGraphSteps' : false
                });
                setTimeout(function () {
                    ReactTooltip.rebuild();
                }, 1000);
            } else {
                this.setState({
                    'graphSteps' : null,
                    'isLoadingGraphSteps' : false,
                    'loadingStepsError' : res.message || res.error || "No steps in response."
                });
            }
        };

        const uriOpts = {
            timestamp: dateFormat(new Date(), 't')
        };

        if (includeAllRunsInSteps){
            uriOpts.all_runs = true;
        }

        const tracingHref = (
            '/trace_meta_workflow_run_steps/' + uuid + '/'
            + '?'
            + Object.keys(uriOpts).map(function(optKey){
                return encodeURIComponent(optKey) + '=' + encodeURIComponent(uriOpts[optKey]);
            }).join('&')
        );

        if (isLoadingGraphSteps){
            console.error("Already loading graph steps");
            return false;
        }

        this.setState({
            'isLoadingGraphSteps' : true,
            'loadingStepsError' : null
        }, ()=>{
            ajax.load(tracingHref, callback, 'GET', callback);
        });
    }

    toggleAllRuns(){
        let doRequest = false;
        this.setState(function({ includeAllRunsInSteps, isLoadingGraphSteps }){
            if (isLoadingGraphSteps){
                return null;
            }
            doRequest = true;
            return { includeAllRunsInSteps: !includeAllRunsInSteps };
        }, ()=>{
            if (!doRequest) return;
            this.loadGraphSteps();
        });
    }

    onToggleShowDetailsInPopup(){
        this.setState(function({ showDetailsInPopup }){
            return { 'showDetailsInPopup' : !showDetailsInPopup };
        });
    }

    render(){
        const { children, ...remainingProps } = this.props;
        const passProps = { ...remainingProps, ...this.state, toggleAllRuns: this.toggleAllRuns, onToggleShowDetailsInPopup: this.onToggleShowDetailsInPopup };
        return React.Children.map(children, (child) => React.cloneElement(child, passProps));
    }

}
