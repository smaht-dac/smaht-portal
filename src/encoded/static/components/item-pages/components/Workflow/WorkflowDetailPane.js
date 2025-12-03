'use strict';

import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import Modal from 'react-bootstrap/esm/Modal';
import { object, layout, schemaTransforms, valueTransforms, capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { Legend } from './Legend';
import { ItemFileAttachment } from './../ItemFileAttachment';
import { isNodeFile, isNodeGroup, isNodeParameter, isNodeQCMetric } from './WorkflowNodeElement';
import { SelectedItemsDownloadButton } from '../../../static-pages/components/SelectAllAboveTableComponent';
import ReactTooltip from 'react-tooltip';

export function getFile(node){
    if (!isNodeFile(node)) return null;
    const { meta : { run_data = null } = {} } = node;
    return (run_data && run_data.file) || null;
}

export const WorkflowDetailPane = React.memo(function WorkflowDetailPane(props){
    const { context, schemas, node, minHeight, deselectNode, showDetailsInPopup = false, canDownloadFile = false } = props;
    
    useEffect(()=>{
        ReactTooltip.rebuild();
    }, [node]);
    
    if (!node){
        return <div className="detail-pane-container no-contents"/>;
    }

    console.log('SELECTED NODE', node, minHeight);

    const { nodeType } = node;

    const file = getFile(node);
    let body, title, typeName;

    if (file){
        const { display_title, accession, '@id': atId } = file;
        typeName = schemaTransforms.getItemTypeTitle(file, schemas) || "File";
        const isGroupedBundle = Array.isArray(file.grouped_files);
        if (isGroupedBundle){
            title = display_title || accession;
        } else if (context && context['@id'] === atId) {
            title = accession || display_title;
        } else {
            title = <a href={atId}>{accession || display_title}</a>;
        }

        body = <FileDetailBody {...props} {...{file, title, typeName, canDownloadFile}} />;
    } else if (nodeType === "step"){
        const { meta = {}, name: stepNodeName } = node;
        const { '@id': stepID, workflow = null, display_title } = meta;
        const { '@id': workflowID, display_title: workflowTitle } = workflow || {};
        typeName = "Workflow Step";
        if (workflowID && workflowTitle) {
            typeName = "Workflow Run";
        }
        if (stepID && display_title) {
            title = <a href={stepID}>{display_title}</a>;
        } else {
            title = display_title || stepNodeName;
        }
        body = <StepDetailBody {...props} {...{title, typeName}} />;
    }

    return !showDetailsInPopup ?
        (
            <div className="detail-pane-container has-selected-node" style={{ minHeight }}>
                <div className="detail-pane-inner">{body}</div>
            </div>
        ) :
        (
            <Modal show size="lg" dialogClassName="workflow-detail-modal-dialog" onHide={deselectNode}>
                <Modal.Header closeButton className="workflow-chart-detail-pane-modal-header">
                    <Modal.Title>
                        <div className="title-box">
                            <label>{typeName}</label>
                            <h3>{title}</h3>
                        </div>
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="workflow-chart-detail-pane-modal-body">
                    <div className="workflow-chart-outer-container">
                        <div className="workflow-chart-inner-container">
                            <div className="state-container" style={{ minWidth: '730px' }}>
                                <div className="detail-pane-container has-selected-node" style={{ minWidth: '730px' }}>
                                    <div className="detail-pane-inner" style={{ minWidth: '730px' }}>
                                        {body}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Modal.Body>
            </Modal>
        );
});
WorkflowDetailPane.Legend = Legend;

function FileDetailBody(props){
    const { node, file, deselectNode, title, typeName, showDetailsInPopup, canDownloadFile, session } = props;
    const {
        "@Id": atId,
        quality_metric: propQC,
        quality_metrics: propQCs = [],
        file_format: { display_title: dataFormat } = {},
        file_size = 0,
        status,
        data_generation_summary: {
            sequencing_center,
            assays: [experimentalAssay] = [],
            data_category: [dataCategory] = [],
            data_type: [dataType] = [],
            sequencing_platforms: [sequencingPlatform] = [],
            submission_centers: [submissionCenter] = [],
            target_group_coverage: [targetGroupCoverage] = []
        } = {},
        file_status_tracking: { released } = {}
    } = file;

    const qualityMetric = propQC || (Array.isArray(propQCs) && propQCs.length > 0 ? propQCs[0] : {});
    const groupedFiles = file && Array.isArray(file.grouped_files) ? file.grouped_files : null;

    const statusWithIcon = (
        <React.Fragment>
            <i
                className="status-indicator-dot me-07"
                data-status={status}
            />
            {valueTransforms.capitalizeSentence(status)}
        </React.Fragment>
    );

    const downloadEnabled = (canDownloadFile === true) && ['public', 'released'].indexOf(status) !== -1;
    const downloadButton =  downloadEnabled && (
        <SelectedItemsDownloadButton
            id="download_tsv_multiselect"
            className="btn btn-primary btn-sm me-05 align-items-center download-file-button"
            session={session}
            selectedItems={new Map([[atId, file]])}
            disabled={false}
            analyticsAddItemsToCart>
            <i className="icon icon-download fas me-07" />
            Download File
        </SelectedItemsDownloadButton>
    );

    return (
        <React.Fragment>
            {!showDetailsInPopup &&
                <div className="title-box row">
                    <div className="col-11">
                        <label>{typeName}</label>
                        <h3>{title}</h3>
                    </div>
                    <div className="col-auto">
                        <i className="icon icon-times fas clickable" onClick={deselectNode} />
                    </div>
                </div>
            }
            <div className="details">
                <QualityMetricBtn {...qualityMetric} />
                {groupedFiles ? <GroupedFilesList files={groupedFiles} /> : null}
                {!groupedFiles && (
                    <React.Fragment>
                        <ValueRow label="Status" value={statusWithIcon} />
                        <ValueRow label="Data Format" value={dataFormat} />
                        <ValueRow label="Size" value={valueTransforms.bytesToLargerUnit(file_size)} />
                        <ValueRow label="Public Release Date" value={released} isDate />
                        <ValueRow label="Data Category" value={dataCategory} />
                        <ValueRow label="Data Type" value={dataType} />
                        <ValueRow label="Sequencing Center" value={sequencing_center} />
                        <ValueRow label="Generated By" value={submissionCenter} />
                        <ValueRow label="Experimental Assay" value={experimentalAssay} />
                        <ValueRow label="Sequencing Platform" value={sequencingPlatform} />
                        <ValueRow label="Dataset Target Coverage" value={targetGroupCoverage && (targetGroupCoverage + 'X')} />
                    </React.Fragment>
                )}
                <ValueRow label="" value={downloadButton} />
            </div>
        </React.Fragment>
    );
}

function QualityMetricBtn(props){
    const { '@id' : qmID, url: qmURL, overall_quality_status = null } = props;
    if (!qmID || !qmURL) return null;
    return (
        <div className="detail-row">
            <a href={qmURL} target="_blank" rel="noreferrer noopener" className="btn btn-outline-dark">
                Quality Metric
            </a>
        </div>
    );
}

function GroupedFilesList({ files = [] }){
    if (!Array.isArray(files) || files.length === 0) return null;
    function formatStatus(f){
        const { status } = f || {};
        if (!status) return null;
        return (
            <span>
                <i className="status-indicator-dot me-05" data-status={status} />
                {valueTransforms.capitalizeSentence(status)}
            </span>
        );
    }
    function formatFileFormat(f){
        const { file_format: ff } = f || {};
        if (!ff) return null;
        if (typeof ff === 'string') return ff;
        return ff.display_title || ff.file_format || null;
    }
    function formatSize(f){
        const { file_size } = f || {};
        if (!file_size && file_size !== 0) return null;
        return valueTransforms.bytesToLargerUnit(file_size);
    }
    return (
        <div className="detail-row">
            {/* <label className="d-block">Grouped Files</label> */}
            <div className="table-responsive">
                <table className="table table-sm mb-0 grouped-files-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th style={{ minWidth: '260px' }}>File</th>
                            <th>Status</th>
                            <th>Format</th>
                            <th className="text-end">Size</th>
                        </tr>
                    </thead>
                    <tbody>
                        { files.map(function(f, idx){
                            const { '@id': fid, display_title: dt } = f || {};
                            const content = fid ? <a href={fid}>{dt || fid}</a> : (dt || 'File');
                            return (
                                <tr key={fid || idx}>
                                    <td>{idx + 1}</td>
                                    <td className="text-truncate" data-tip={dt || fid}>{content}</td>
                                    <td>{formatStatus(f)}</td>
                                    <td>{formatFileFormat(f)}</td>
                                    <td className="text-end">{formatSize(f)}</td>
                                </tr>
                            );
                        }) }
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function StepDetailBody(props){
    const { node, deselectNode, title, typeName, showDetailsInPopup, context, schemas } = props;
    // const { meta = {}, name: stepNodeName } = node;
    // const { '@id' : stepID, workflow = null, display_title } = meta;
    // const { '@id' : workflowID, display_title: workflowTitle } = workflow || {};
    return (
        <React.Fragment>
            {!showDetailsInPopup &&
                <div className="title-box row">
                    <div className="col-11">
                        <label>{typeName}</label>
                        <h3>{title}</h3>
                    </div>
                    <div className="col-auto">
                        <i className="icon icon-times fas clickable" onClick={deselectNode} />
                    </div>
                </div>
            }
        </React.Fragment>
    );
}

function ValueRow({ value, label = '[Label]', showAlways = false, fallbackValue = '-', isDate = false }) {
    if (value || showAlways) {
        return (
            <div className="detail-row">
                <label className="d-block">{label}</label>
                {value ? (!isDate ? value : <LocalizedTime timestamp={value} formatType="date-md" dateTimeSeparator=" " />) : fallbackValue}
            </div>
        );
    }
    return null;
}
