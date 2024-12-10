'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import { format as dateFormat } from "date-fns";
import _ from 'underscore';
import ReactTooltip from 'react-tooltip';
import { console, object, ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

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
                this.setState({
                    'graphSteps' : this.identifiersToIntegers(res),
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
            uriOpts.all_runs = "True";
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
