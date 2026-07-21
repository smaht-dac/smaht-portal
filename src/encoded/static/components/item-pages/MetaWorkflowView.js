'use strict';

import React, { useMemo } from 'react';
import _ from 'underscore';

import DefaultItemView from './DefaultItemView';
import { WorkflowGraphSection } from './components/Workflow/WorkflowGraphSectionControls';
import { identifiersToIntegers } from './MetaWorkflowRunView';


export function transformMetaWorkflowToSteps(metaWorkflowItem){
    const { workflows = [] } = metaWorkflowItem || {};
    const workflowNames = new Set(_.pluck(workflows, 'name').filter(Boolean));

    const steps = workflows.map(function(workflowObj){
        const {
            name,
            workflow,
            input = [],
            dependencies = [],
            custom_pf_fields = {}
        } = workflowObj;

        const dependencyInputs = (dependencies || []).filter(function(depName){
            return depName && workflowNames.has(depName);
        }).map(function(depName){
            return {
                'name'   : `dependency:${depName}`,
                'source' : [ { 'name': depName, 'step': depName } ],
                'meta'   : { 'global': false, 'in_path': true, 'type': 'parameter' },
                'run_data': { 'type': 'input' }
            };
        });

        const stepInputs = input.map(function(workflowInput){
            const {
                argument_name,
                argument_type,
                source: sourceStepName,
                source_argument_name,
                files = [],
                value
            } = workflowInput;

            const initialSource = { 'name': source_argument_name || argument_name };
            const sourceList = sourceStepName ? [ { ...initialSource, 'step': sourceStepName } ] : [ initialSource ];

            const fileList = Array.isArray(files) ? files : [];
            const isParameter = argument_type && argument_type !== 'file';
            const isReferenceFile = fileList.length > 0 && fileList.every(function(fileWrapper){
                const { file } = fileWrapper || {};
                return file && Array.isArray(file['@type']) && file['@type'].indexOf('FileReference') > -1;
            });

            const runData = { 'type': isParameter ? 'parameter' : 'input' };
            if (fileList.length > 0){
                runData.file = fileList.map(function(fileWrapper){ return fileWrapper.file; }).filter(Boolean);
                runData.meta = fileList.map(function(fileWrapper){
                    const { file, ...rest } = fileWrapper || {};
                    return rest;
                });
            } else if (typeof value !== 'undefined'){
                runData.value = value;
            }

            return {
                'name'   : argument_name,
                'source' : sourceList,
                'meta'   : {
                    'global' : !sourceStepName,
                    'in_path': true,
                    'type'   : (
                        isParameter ? 'parameter'
                            : isReferenceFile ? 'reference file'
                                : fileList.length > 0 ? 'data file'
                                    : null
                    )
                },
                run_data : runData
            };
        });

        const outputsFromCustomPF = Object.keys(custom_pf_fields || {}).map(function(outputName){
            const metaFromPF = custom_pf_fields[outputName];
            return {
                'name'   : outputName,
                'target' : [],
                'meta'   : { 'type': 'data file' },
                'run_data': {
                    'type': 'output',
                    'meta': metaFromPF ? [ metaFromPF ] : undefined
                }
            };
        });

        return {
            'name'   : name,
            'meta'   : {
                workflow,
                'display_title': (workflow && (workflow.display_title || workflow.title || workflow.name)) || name
            },
            'inputs' : stepInputs.concat(dependencyInputs),
            'outputs': outputsFromCustomPF
        };
    });

    const stepsByName = _.indexBy(steps, 'name');
    steps.forEach(function(step){
        (step.inputs || []).forEach(function(input){
            (input.source || []).forEach(function(sourceEntry){
                const { step: sourceStepName } = sourceEntry;
                if (!sourceStepName || !stepsByName[sourceStepName]) return;
                const outputName = sourceEntry.name || input.name;
                const sourceStep = stepsByName[sourceStepName];
                let outputObject = (sourceStep.outputs || []).find(function(output){ return output.name === outputName; });
                if (!outputObject){
                    outputObject = {
                        'name'   : outputName,
                        'target' : [],
                        'meta'   : { 'type': 'data file' },
                        'run_data': { 'type': 'output' }
                    };
                    sourceStep.outputs.push(outputObject);
                }
                const hasTarget = outputObject.target.some(function(t){ return t.step === step.name && t.name === input.name; });
                if (!hasTarget){
                    outputObject.target.push({ 'name': input.name, 'step': step.name });
                }
            });
        });
    });

    return steps;
}


function MetaWorkflowDataTransformer(props){
    const { context, children } = props;
    const steps = useMemo(function(){
        const baseSteps = transformMetaWorkflowToSteps(context);
        return identifiersToIntegers(baseSteps);
    }, [ context ]);
    return React.cloneElement(children, { steps });
}


export default class MetaWorkflowView extends DefaultItemView {

    constructor(props){
        super(props);
        this.getTabViewContents = this.getTabViewContents.bind(this);
        this.state = { 'mounted' : false };
    }

    componentDidMount(){
        this.setState({ 'mounted' : true });
    }

    getTabViewContents(){
        const { context, windowHeight, windowWidth } = this.props;
        const { mounted } = this.state;
        const width = windowWidth - 60;

        const tabs = [
            {
                tab : <span><i className="icon icon-sitemap icon-rotate-90 fas icon-fw"/> Graph</span>,
                key : 'graph',
                content : (
                    <MetaWorkflowDataTransformer context={context}>
                        <WorkflowGraphSection
                            {...this.props}
                            mounted={mounted}
                            width={width}
                            includeAllRunsInSteps={undefined}
                        />
                    </MetaWorkflowDataTransformer>
                )
            }
        ];
        const tabContents = _.map(tabs.concat(this.getCommonTabs()), function(tabObj){
            return _.extend(tabObj, {
                'style' : { 'minHeight' : Math.max((mounted && windowHeight && windowHeight - 300) || 0, 600) }
            });
        });
        return tabContents;
    }

}
