'use strict';

import React, { useMemo } from 'react';
import _ from 'underscore';

import { console, object, navigate, JWT } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';


import { parseAnalysisSteps } from '@hms-dbmi-bgm/react-workflow-viz';
import { WorkflowDetailPane } from './components/Workflow/WorkflowDetailPane';
import { WorkflowNodeElement } from './components/Workflow/WorkflowNodeElement';
import { WorkflowGraphSection } from './components/Workflow/WorkflowGraphSectionControls';
import DefaultItemView from './DefaultItemView';
import { groupSimilarProvenanceSteps } from './components/Workflow/ProvenanceGraphStepsFetchingController';


export function checkIfIndirectOrReferenceNodesExist(steps){
    const graphData = parseAnalysisSteps(steps, { 'showIndirectFiles' : true, 'showReferenceFiles' : true });
    const anyIndirectPathIONodes = _.any(graphData.nodes, function(n){
        return (n.nodeType === 'output' && n.meta && n.meta.in_path === false);
    });
    const anyReferenceFileNodes = _.any(graphData.nodes, function(n){
        return (n.ioType === 'reference file');
    });
    return { anyIndirectPathIONodes, anyReferenceFileNodes };
}


export function commonGraphPropsFromProps(props){
    const graphProps = {
        'href'              : props.href,
        'renderDetailPane'  : function(selectedNode, paneProps){
            return (
                <WorkflowDetailPane {...paneProps} {..._.pick(props, 'session', 'schemas', 'context', 'legendItems', 'windowWidth')} selectedNode={selectedNode} />
            );
        },
        'renderNodeElement' : function(node, graphProps){
            return <WorkflowNodeElement {...graphProps} {..._.pick(props, 'schemas', 'windowWidth')} node={node}/>;
        },
        'rowSpacingType'    : 'wide',
        'nodeClassName'     : function(node){
            const runDataFile = node.meta && node.meta.run_data && node.meta.run_data.file;
            const hasGroupedFiles = Array.isArray(runDataFile) ?
                runDataFile.some(function(f){ return f && f.grouped_files; }) :
                runDataFile && runDataFile.grouped_files;
            if (hasGroupedFiles || (node.nodeType && node.nodeType.indexOf('group') > -1)) {
                return 'node-grouped';
            }
            return '';
        },
        'onNodeClick'       : typeof props.onNodeClick !== 'undefined' ? props.onNodeClick : null,
        'windowWidth'       : props.windowWidth
    };

    return graphProps;
}


export default class MetaWorkflowRunView extends DefaultItemView {

    constructor(props){
        super(props);
        this.getTabViewContents = this.getTabViewContents.bind(this);
        this.state = {
            'mounted' : false,
            'includeAllRunsInSteps' : false
        };
        this.toggleAllRuns = _.throttle(this.toggleAllRuns.bind(this), 1000, { trailing: false });
    }

    componentDidMount(){
        this.setState({ 'mounted' : true });
    }

    getTabViewContents(){
        const { context, windowHeight, windowWidth } = this.props;
        const { mounted, includeAllRunsInSteps } = this.state;
        const width = windowWidth - 60;


        // Eventually:



        // TODO: Include only if ... enough data to visualize exists/valid.
        const tabs = [
            {
                tab : <span><i className="icon icon-sitemap icon-rotate-90 fas icon-fw"/> Graph</span>,
                key : 'graph',
                content : (
                    <MetaWorkflowRunDataTransformer {...{ context, includeAllRunsInSteps }}>
                        <WorkflowGraphSection
                            {...this.props}
                            mounted={this.state.mounted}
                            width={width}
                            includeAllRunsInSteps={includeAllRunsInSteps}
                            toggleAllRuns={this.toggleAllRuns}
                        />
                    </MetaWorkflowRunDataTransformer>
                )
            }
        ];
        const tabContents =  _.map(tabs.concat(this.getCommonTabs()), (tabObj) => // Common properties
            _.extend(tabObj, {
                'style' : { 'minHeight' : Math.max((mounted && windowHeight && windowHeight - 300) || 0, 600) }
            })
        );

        // Check if the user is an admin
        if (_.contains(JWT.getUserDetails().groups, "admin")) {

            // If so, show the details pane instead of the graph by default (ask from bioinfo/wranglers)
            // tabContents[1].isDefault = true;
        }
            
        return tabContents;

    }

    toggleAllRuns(){
        this.setState(function({ includeAllRunsInSteps }){
            return { 'includeAllRunsInSteps' : !includeAllRunsInSteps };
        });
    }

}



export function transformMetaWorkflowRunToSteps (metaWorkflowRunItem) {
    // TODO
    const {
        workflow_runs = [],
        meta_workflow = {},
        // No longer used
        // input:  mwfrInputList = []
    } = metaWorkflowRunItem;

    const { workflows = [] } = meta_workflow;
    const workflowsByName = {};
    workflows.forEach(function(workflow){
        const { name } = workflow;
        workflowsByName[name] = workflow;
    });

    // Combine MWF + MWFR data:
    const combinedMWFRs = workflow_runs.map(function(workflowRun){
        const { name } = workflowRun;
        const workflowForRun = workflowsByName[name] || {};
        return {
            // Deep-copy (or selectively deep copy), else "input" list/object references from workflow
            // will be shared between different runs of same workflow.
            ...JSON.parse(JSON.stringify(workflowForRun)),
            ...workflowRun
        };
    });

    const incompleteSteps = combinedMWFRs.map(function(workflowRunObject){
        const {
            // This 'name' is same as workflow name, we don't use it because want unique name/identifier for each step.
            // name,
            workflow,
            workflow_run: {
                display_title,
                "@id": workflowRunAtID,
                input_files: wfrItemInputFileObjects,
                output_files: wfrItemOutputFileObjects,
                parameters: wfrItemInputParameters
            } = {},
            input = [],
            output = []
        } = workflowRunObject;

        const inputFileObjectsGroupedByArgName  = _.groupBy(wfrItemInputFileObjects, "workflow_argument_name");
        const inputParametersGroupedByArgName   = _.groupBy(wfrItemInputParameters, "workflow_argument_name");
        const outputFileObjectsGroupedByArgName = _.groupBy(wfrItemOutputFileObjects, "workflow_argument_name");

        const initialStep = {
            // name,
            "name": workflowRunAtID,
            "meta": {
                "@id": workflowRunAtID,
                workflow,
                display_title,
            },
            "inputs": [],
            "outputs": []
        };


        input.forEach(function(wfrObjectInputObject){
            const {
                argument_name,
                argument_type,
                source: mwfrSourceStepName,
                source_argument_name,
                // files = [],
                // value: nonFileValue
            } = wfrObjectInputObject;

            // Each file contains "workflow_run_outputs" (WFR it came from) + "workflow_run_inputs" (WFR it going to) (if applicable)
            const filesForThisInput = inputFileObjectsGroupedByArgName[argument_name] || [];
            const filesLen = filesForThisInput.length;

            const parametersForThisInput = inputParametersGroupedByArgName[argument_name] || [];
            const paramsLen = parametersForThisInput.length;

            const initialSource = {
                "name": source_argument_name || argument_name
            };

            const initialSourceList = [];

            if (filesLen > 0) {
                filesForThisInput.forEach(function(fileObject){
                    const { value: fileItem } = fileObject;
                    const { "@id": fileAtID, workflow_run_outputs = [] } = fileItem || {};
                    const [ { "@id": outputOfWFRAtID } = {} ] = workflow_run_outputs;
                    const sourceObject = { ...initialSource, "for_file": fileAtID };
                    if (outputOfWFRAtID) {
                        sourceObject.step = outputOfWFRAtID;
                    }
                    initialSourceList.push(sourceObject);
                });
            } else {
                initialSourceList.push(initialSource);
            }

            const isParameter = argument_type === "parameter";

            let isReferenceFileInput = false;
            if (filesLen > 0) {
                isReferenceFileInput = _.every(filesForThisInput, function(fileObject){
                    const { value: fileItem } = fileObject;
                    const { "@type": fileAtType = [] } = fileItem || {};
                    return fileAtType.indexOf("FileReference") > -1;
                });
            }

            const stepInputObject = {
                "name": argument_name,
                "source": initialSourceList,
                "meta": {
                    // TODO: Reconsider this evaluation of "global"
                    "global": !mwfrSourceStepName,
                    // TODO: It seems all MWFR output files provided are 'in-path' and we don't see the indirect files
                    // in the MWFR.workflow_runs.outputs. If this changes (or is currently inaccurate) maybe we can infer or
                    // have "in_path=false" added to those outputs and then enable the "Show Indirect Files" checkbox.
                    "in_path": true,
                    "type": (
                        // Don't need to set QC or report for input... I think...
                        isParameter ? "parameter"
                            : isReferenceFileInput ? "reference file"
                                : filesLen > 0 ? "data file"
                                    : null
                    ),
                    // "cardinality": // TODO maybe
                },
                "run_data": {
                    "type": isParameter ? "parameter" : "input"
                }
            };

            if (filesLen > 0) {
                stepInputObject.run_data.file = _.pluck(filesForThisInput, "value");
                stepInputObject.run_data.meta = filesForThisInput.map(function({ value, ...remainingProperties }){
                    return remainingProperties;
                });
            } else if (paramsLen > 0) { // WorkflowViz supports only 1 parameter per input argument at time being.
                const [ firstParameterObject ] = parametersForThisInput;
                const { value, ...remainingFirstParameterObjectProperties } = firstParameterObject;
                // We can have multiple values but only 1 'meta' object.
                stepInputObject.run_data.value = _.pluck(parametersForThisInput, "value");
                stepInputObject.run_data.meta = remainingFirstParameterObjectProperties;
            }

            initialStep.inputs.push(stepInputObject);
        });


        output.forEach(function(wfrOutputObject){

            const {
                argument_name,
                argument_type,
                //source: mwfrSourceStepName,
                source_argument_name,
                file,
                value: nonFileValue
            } = wfrOutputObject;

            // Each file contains "workflow_run_outputs" (WFR it came from) + "workflow_run_inputs" (WFR it going to) (if applicable)
            const [ outputFileObject ] = outputFileObjectsGroupedByArgName[argument_name] || [];

            const initialTargetList = [];
            const initialTarget = {
                "name": source_argument_name || argument_name
            };


            if (outputFileObject) {
                const { value: fileItem } = outputFileObject;
                const { "@id": fileAtID, workflow_run_inputs = [] } = fileItem || {};
                //const { "@id": outputOfWFRAtID } = workflow_run_output || {};
                if (workflow_run_inputs.length > 0){
                    workflow_run_inputs.forEach(function(inputOfWFR){
                        const { "@id": inputOfWFRAtID } = inputOfWFR || {};
                        // TODO: Exclude targets that aren't in MWFR.workflow_runs
                        const targetObject = {
                            ...initialTarget,
                            "for_file": fileAtID,
                            "step": inputOfWFRAtID
                        };
                        initialTargetList.push(targetObject);
                    });
                } else {
                    initialTargetList.push({ ...initialTarget, "for_file": fileAtID });
                }
            } else {
                initialTargetList.push(initialTarget);
            }

            // if (file) {
            //     const { "@id": fileAtID } = file || {};
            //     initialTargetList.push( { ...initialTarget, "for_file": fileAtID } );
            // } else {
            //     initialTargetList.push(initialTarget);
            // }


            // TODO handle values other than file...

            const stepOutputObject = {
                "name": argument_name,
                "target": initialTargetList,
                "meta": {
                    // "global": !wfrSourceStepName,
                    // "in_path": ???,
                    "type": (
                        // TODO Check if QC or report for input... I think...
                        // Re-use strategy for determining is reference file from inputs
                        argument_type === "parameter" ? "parameter"
                            : file ? "data file"
                                : null
                    ),
                    // "cardinality": // TODO maybe
                },
                "run_data": {
                    "type": "output"
                }
            };

            if (outputFileObject) {
                stepOutputObject.run_data.file = [ outputFileObject.value ];
                stepOutputObject.run_data.meta = [ { "type": "Output processed file" } ];
            }

            // TODO handle 'nonFileValue' if needed.

            initialStep.outputs.push(stepOutputObject);

        });

        return initialStep;

    });

    return incompleteSteps;
}

/**
 * Converts all step names (and sources/targets' step names) to integers.
 *
 * @todo Improve if needed.
 * @todo Move into ReactWorkflowViz project.
 */
export function identifiersToIntegers(steps){
    const nameDict = {};

    function convertNameToInt(name){
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

    steps.forEach(function(step){
        const { name, inputs = [], outputs = [] } = step;
        step.name = convertNameToInt(name);
        inputs.forEach(function({ source = [] }){
            source.forEach(function(sourceEntry){
                if (!sourceEntry.step) return;
                sourceEntry.step = convertNameToInt(sourceEntry.step);
            });
        });
        outputs.forEach(function({ target = [] }){
            target.forEach(function(targetEntry){
                if (!targetEntry.step) return;
                targetEntry.step = convertNameToInt(targetEntry.step);
            });
        });

    });
    return steps;
}


function MetaWorkflowRunDataTransformer(props){
    const { context, children, includeAllRunsInSteps } = props;
    // TODO: parse context.workflow_runs, context.meta_workflow, context.input, etc...

    const steps = useMemo(function(){
        const baseSteps = transformMetaWorkflowRunToSteps(context);
        const stepsToUse = includeAllRunsInSteps ? baseSteps : groupSimilarProvenanceSteps(baseSteps);
        return identifiersToIntegers(stepsToUse);
    }, [ context, includeAllRunsInSteps ]);

    return React.cloneElement(children, { steps });
}
