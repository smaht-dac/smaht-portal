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

export class WorkflowGraphSection extends React.PureComponent {

    constructor(props){
        super(props);
        this.commonGraphProps = this.commonGraphProps.bind(this);
        this.parseAnalysisSteps = this.parseAnalysisSteps.bind(this);
        this.onToggleShowDetailsInPopup = _.throttle(this.onToggleShowDetailsInPopup.bind(this), 1000);
        this.onToggleShowParameters     = _.throttle(this.onToggleShowParameters.bind(this), 1000);
        this.onToggleReferenceFiles     = _.throttle(this.onToggleReferenceFiles.bind(this), 1000);
        this.onToggleIndirectFiles      = _.throttle(this.onToggleIndirectFiles.bind(this), 1000);
        this.onChangeRowSpacingType     = _.throttle(this.onChangeRowSpacingType.bind(this), 1000, { trailing : false });
        this.renderDetailPane = this.renderDetailPane.bind(this);
        this.renderNodeElement = this.renderNodeElement.bind(this);

        this.memoized = {
            parseAnalysisSteps : memoize(parseAnalysisSteps),
            checkIfIndirectOrReferenceNodesExist : memoize(checkIfIndirectOrReferenceNodesExist)
        };

        this.state = {
            'showDetailsInPopup': true,
            'showParameters' : false,
            'showReferenceFiles' : false,
            'rowSpacingType' : 'stacked',
            'showIndirectFiles': false
        };
    }


    parseAnalysisSteps(steps){
        const { showReferenceFiles, showParameters, showIndirectFiles } = this.state;
        const parsingOptions = { showReferenceFiles, showParameters, "showIndirectFiles": true };
        return this.memoized.parseAnalysisSteps(steps, parsingOptions);
    }

    commonGraphProps(){
        const { steps } = this.props;
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
            renderDetailPane: this.renderDetailPane,
            renderNodeElement: this.renderNodeElement
        };
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
        const { context, schemas } = this.props;
        const { showDetailsInPopup } = this.state;
        return <WorkflowDetailPane {...graphProps} {...{ context, node, schemas, showDetailsInPopup }} />;
    }

    render(){
        const { rowSpacingType, showParameters, showReferenceFiles, showIndirectFiles, showDetailsInPopup } = this.state;
        const { context, mounted, width, steps = [] } = this.props;
        const { anyIndirectPathIONodes, anyReferenceFileNodes } = this.memoized.checkIfIndirectOrReferenceNodesExist(context.steps || steps);

        let body = null;
        if (!Array.isArray(steps) || !mounted) {
            body = null;
        } else {
            body = (
                <Graph { ...this.commonGraphProps() } />
            );
        }

        return (
            <div className="tabview-container-fullscreen-capable meta-workflow-view-container meta-workflow-viewing-detail">
                <h3 className="tab-section-title container-wide">
                    <span>Graph</span>
                    <WorkflowGraphSectionControls
                        {..._.pick(this.props, 'context', 'href', 'windowWidth')}
                        showChartType="detail"
                        rowSpacingType={rowSpacingType}
                        // Parameters are available but not visualized because of high number of them
                        // In future, need to adjust ReactWorkflowViz parsing code to re-use paramater nodes
                        // of same value and same/similar target, if possible.
                        showParameters={showParameters}
                        showDetailsInPopup={showDetailsInPopup}
                        showReferenceFiles={showReferenceFiles}
                        // `showIndirectFiles=false` doesn't currently work in parsing for MWFRs, needs research.
                        // showIndirectFiles={showIndirectFiles}
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
        showReferenceFiles, showParameters, showIndirectFiles,
        onToggleReferenceFiles, onToggleShowParameters, onToggleIndirectFiles,
        windowWidth,
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
            <RowSpacingTypeSelect rowSpacingType={rowSpacingType} onSelect={onRowSpacingTypeSelect} />
        </CollapsibleItemViewButtonToolbar>
    );
});

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