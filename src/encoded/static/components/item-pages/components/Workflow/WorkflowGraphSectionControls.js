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
        this.onChangeRowSpacingType     = _.throttle(this.onChangeRowSpacingType.bind(this), 1000, { trailing : false });
        this.renderDetailPane = this.renderDetailPane.bind(this);
        this.renderNodeElement = this.renderNodeElement.bind(this);

        this.memoized = {
            parseAnalysisSteps : memoize(parseAnalysisSteps),
            parseBasicIOAnalysisSteps: memoize(parseBasicIOAnalysisSteps),
            checkIfIndirectOrReferenceNodesExist : memoize(checkIfIndirectOrReferenceNodesExist)
        };

        this.state = {
            'showChart': analysisStepsSet(props.context) ? 'detail' : 'basic',
            'showDetailsInPopup': true,
            'showParameters' : false,
            'showReferenceFiles' : false,
            'rowSpacingType' : 'stacked',
            'showIndirectFiles': false
        };
    }


    parseAnalysisSteps(steps){
        const { showReferenceFiles, showParameters, showIndirectFiles, showChart } = this.state;
        const parsingOptions = { showReferenceFiles, showParameters, "showIndirectFiles": true };
        return (showChart === 'basic' ?
            this.memoized.parseBasicIOAnalysisSteps(steps, {}, parsingOptions)
            :
            this.memoized.parseAnalysisSteps(steps, parsingOptions)
        );
    }

    commonGraphProps(){
        const { steps, includeAllRunsInSteps } = this.props;
        const { showParameters, showReferenceFiles, rowSpacingType } = this.state;
        const graphData = this.parseAnalysisSteps(steps);

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
            legendItems,
            scale: includeAllRunsInSteps ? 0.85 : 1.0,
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
        const { rowSpacingType, showParameters, showReferenceFiles, showIndirectFiles, showDetailsInPopup, showChart } = this.state;
        const { context, mounted, width, steps = [] } = this.props;
        const { anyIndirectPathIONodes, anyReferenceFileNodes } = this.memoized.checkIfIndirectOrReferenceNodesExist(context.steps || steps);
        const commonGraphProps = this.commonGraphProps();

        let body = null;
        if (!Array.isArray(steps) || !mounted) {
            body = null;
        } else {
            body = (
                <React.Fragment>
                    <Graph {...commonGraphProps} />
                    <Legend items={commonGraphProps.legendItems} />
                </React.Fragment>
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
                        // `showIndirectFiles=false` doesn't currently work in parsing for MWFRs, needs research.
                        // showIndirectFiles={showIndirectFiles}
                        onChangeShowChartType={this.onChangeShowChartType}
                        onRowSpacingTypeSelect={this.onChangeRowSpacingType}
                        onToggleShowParameters={this.onToggleShowParameters}
                        onToggleReferenceFiles={this.onToggleReferenceFiles}
                        // onToggleIndirectFiles={this.onToggleIndirectFiles}
                        isReferenceFilesCheckboxDisabled={!anyReferenceFileNodes}
                        onToggleShowDetailsInPopup={this.onToggleShowDetailsInPopup}
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
        showDetailsInPopup, onToggleShowDetailsInPopup
    } = props;
    return (
        <CollapsibleItemViewButtonToolbar windowWidth={windowWidth}>
            {typeof showDetailsInPopup === "boolean" ?
                <ShowDetailsInPopupCheckBox checked={showDetailsInPopup} onChange={onToggleShowDetailsInPopup} disabled={false} />
                : null}
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
            <ChartTypeDropdown context={context} showChartType={showChartType} onSelect={onChangeShowChartType} />
            <RowSpacingTypeSelect rowSpacingType={rowSpacingType} onSelect={onRowSpacingTypeSelect} />
        </CollapsibleItemViewButtonToolbar>
    );
});

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
        'detail': 'Analysis Steps',
        'basic': 'Basic Inputs & Outputs',
        'cwl': 'CWL Graph'
    };

    const detail = analysisStepsSet(context) ? (
        <DropdownItem eventKey="detail" active={showChartType === 'detail'}>
            Analysis Steps
        </DropdownItem>
    ) : null;

    const basic = (
        <DropdownItem eventKey="basic" active={showChartType === 'basic'}>
            Basic Inputs & Outputs
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
