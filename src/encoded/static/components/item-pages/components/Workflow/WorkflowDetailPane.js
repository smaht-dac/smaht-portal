'use strict';

import React, { useEffect, useMemo, useState } from 'react';
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

    const { nodeType } = node;
    const mergedCount = node && node._mergedCount;
    const compactedNote = (mergedCount && mergedCount > 1) ? `${mergedCount} similar nodes compacted in this view` : null;

    const file = getFile(node);
    const compactedFiles = getCompactedFilesFromNode(node);
    const isCompactedFileGroup = !!(file && mergedCount > 1 && compactedFiles.length > 1);
    const isAuxiliaryCompactedGroup = !!(isCompactedFileGroup && node && node._isAuxiliaryGroup);
    let body, title, typeName;

    if (file){
        const { display_title, accession, '@id': atId } = file;
        typeName = schemaTransforms.getItemTypeTitle(file, schemas) || "File";
        const isGroupedBundle = Array.isArray(file.grouped_files);
        if (isCompactedFileGroup){
            typeName = "Compacted Files";
            const groupTitle = isAuxiliaryCompactedGroup ? 'auxiliary' : (
                (file.file_format && (file.file_format.display_title || file.file_format.file_format)) ||
                (node && node.meta && node.meta.file_format && (node.meta.file_format.display_title || node.meta.file_format.file_format)) ||
                'file'
            );
            title = `${compactedFiles.length} ${groupTitle} files`;
        } else
        if (isGroupedBundle){
            title = display_title || accession;
        } else if (context && context['@id'] === atId) {
            title = accession || display_title;
        } else {
            title = <a href={atId}>{accession || display_title}</a>;
        }

        body = <FileDetailBody {...props} {...{file, title, typeName, canDownloadFile, compactedNote, isCompactedFileGroup, compactedFiles, isAuxiliaryCompactedGroup}} />;
    } else if (nodeType === "step"){
        const { meta = {}, name: stepNodeName } = node;
        const compactedSteps = getCompactedStepsFromNode(node);
        const isCompactedStepGroup = (node && node._mergedCount > 1) || compactedSteps.length > 1;
        const { '@id': stepID, workflow = null, display_title } = meta;
        const { '@id': workflowID, display_title: workflowTitle } = workflow || {};
        typeName = isCompactedStepGroup ? "Workflow Steps" : "Workflow Step";
        if (workflowID && workflowTitle) {
            typeName = isCompactedStepGroup ? "Workflow Runs" : "Workflow Run";
        }
        if (isCompactedStepGroup && node.title) {
            title = node.title;
        } else if (stepID && display_title) {
            title = <a href={stepID}>{display_title}</a>;
        } else {
            title = display_title || stepNodeName;
        }
        body = <StepDetailBody {...props} {...{title, typeName, compactedNote}} />;
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
    const { node, file, deselectNode, title, typeName, showDetailsInPopup, canDownloadFile, session, compactedNote, isCompactedFileGroup = false, compactedFiles: compactedFilesFromProps = [], isAuxiliaryCompactedGroup = false } = props;
    const {
        "@id": atId,
        output_type: outputType,
        quality_metric: propQC,
        quality_metrics: propQCs = [],
        file_format: { display_title: dataFormat } = {},
        file_size = 0,
        status,
        biological_replicates: biologicalReplicates = [],
        technical_replicates: technicalReplicates = [],
        mapped_to_genome_assembly: mappingAssembly,
        genome_annotation: genomeAnnotation,
        software_versions: softwareVersions = [],
        date_created: dateCreated,
        lab,
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
    const compactedFiles = Array.isArray(compactedFilesFromProps) ? compactedFilesFromProps : getCompactedFilesFromNode(node);
    const labName = (lab && (lab.title || lab.display_title)) || null;
    const softwareSummary = Array.isArray(softwareVersions) && softwareVersions.length > 0
        ? softwareVersions.map(function(sw){
            const item = sw && sw.software ? sw.software : sw;
            if (!item) return null;
            const name = item.name || item.title || item.display_title || '';
            const version = sw && sw.version ? sw.version : item.version;
            return [name, version].filter(Boolean).join(' ');
        }).filter(Boolean).join(', ')
        : null;
    const bioRepDisplay = Array.isArray(biologicalReplicates) && biologicalReplicates.length > 0 ? `[${biologicalReplicates.join(', ')}]` : null;
    const techRepDisplay = Array.isArray(technicalReplicates) && technicalReplicates.length > 0 ? `[${technicalReplicates.join(', ')}]` : null;

    const statusText = valueTransforms.capitalizeSentence(status);
    const statusWithIcon = <StatusBadge status={status} text={statusText} />;

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

    const summaryRows = [
        { label: "Status", value: statusWithIcon, showAlways: true },
        { label: "Output", value: outputType },
        { label: "Data Format", value: dataFormat },
        { label: "File Size", value: valueTransforms.bytesToLargerUnit(file_size), showAlways: true },
        { label: "Data Category", value: dataCategory },
        { label: "Data Type", value: dataType },
        { label: "Sequencing Center", value: sequencing_center },
        { label: "Generated By", value: submissionCenter }
    ];

    const detailRows = [
        { label: "Biological Replicate(s)", value: bioRepDisplay },
        { label: "Technical Replicate(s)", value: techRepDisplay },
        { label: "Mapping Assembly", value: mappingAssembly },
        { label: "Genome Annotation", value: genomeAnnotation },
        { label: "Lab", value: labName },
        { label: "Date Added", value: dateCreated, isDate: true },
        { label: "Public Release Date", value: released, isDate: true },
        { label: "Software", value: softwareSummary },
        { label: "Experimental Assay", value: experimentalAssay },
        { label: "Sequencing Platform", value: sequencingPlatform },
        { label: "Dataset Target Coverage", value: targetGroupCoverage && (targetGroupCoverage + 'X') }
    ];
    const hasSummaryRows = hasRenderableRows(summaryRows);
    const hasDetailRows = hasRenderableRows(detailRows);
    const showSingleFileSections = !isCompactedFileGroup;

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
                <ValueRow label="Compact View" value={compactedNote} />
                <div className="workflow-detail-summary-bar">
                    {!isCompactedFileGroup ? <QualityMetricBtn {...qualityMetric} /> : null}
                    {!isCompactedFileGroup && downloadButton ? <div className="workflow-download-btn-wrap">{downloadButton}</div> : null}
                </div>
                {groupedFiles ? <GroupedFilesList files={groupedFiles} title="Grouped Files" /> : null}
                {!groupedFiles && compactedFiles.length > 1 ? (
                    <GroupedFilesList files={compactedFiles} title={isAuxiliaryCompactedGroup ? "Auxiliary Files" : "Compacted Files"} tabByFormat={isAuxiliaryCompactedGroup} />
                ) : null}
                {!groupedFiles && showSingleFileSections && (
                    <React.Fragment>
                        {hasSummaryRows ? (
                            <DetailSection title="Summary">
                                <DetailGrid rows={summaryRows} />
                            </DetailSection>
                        ) : null}
                        {hasDetailRows ? (
                            <DetailSection title="Metadata">
                                <DetailGrid rows={detailRows} />
                            </DetailSection>
                        ) : null}
                        {!hasSummaryRows && !hasDetailRows ? (
                            <div className="workflow-detail-empty-message">
                                No additional metadata available.
                            </div>
                        ) : null}
                    </React.Fragment>
                )}
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

function GroupedFilesList({ files = [], title = "Grouped Files", tabByFormat = false }){
    if (!Array.isArray(files) || files.length === 0) return null;
    const totalSize = files.reduce(function(total, file){
        const fileSize = file && typeof file.file_size === 'number' ? file.file_size : 0;
        return total + fileSize;
    }, 0);
    const formatCounts = files.reduce(function(memo, file){
        const ff = file && file.file_format;
        const formatLabel = typeof ff === 'string' ? ff : ((ff && (ff.display_title || ff.file_format)) || 'unknown');
        memo[formatLabel] = (memo[formatLabel] || 0) + 1;
        return memo;
    }, {});
    const formatSummary = Object.keys(formatCounts).map(function(formatLabel){
        return `${formatCounts[formatLabel]} ${formatLabel}`;
    }).join(', ');
    const statusCounts = files.reduce(function(memo, file){
        const status = (file && file.status) || 'unknown';
        memo[status] = (memo[status] || 0) + 1;
        return memo;
    }, {});
    const statusSummary = Object.keys(statusCounts).map(function(status){
        return `${statusCounts[status]} ${valueTransforms.capitalizeSentence(status)}`;
    }).join(', ');

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
    const filesByFormat = useMemo(function(){
        return files.reduce(function(memo, file){
            const key = (formatFileFormat(file) || 'unknown').toLowerCase();
            if (!memo[key]) memo[key] = [];
            memo[key].push(file);
            return memo;
        }, {});
    }, [files]);
    const formatTabs = useMemo(function(){
        return Object.keys(filesByFormat)
            .map(function(key){
                return { key, count: filesByFormat[key].length };
            })
            .sort(function(a, b){
                return b.count - a.count || a.key.localeCompare(b.key);
            });
    }, [filesByFormat]);
    const [activeFormat, setActiveFormat] = useState(null);
    const selectedFormat = (tabByFormat && formatTabs.length > 0)
        ? (activeFormat && filesByFormat[activeFormat] ? activeFormat : formatTabs[0].key)
        : null;
    const visibleFiles = selectedFormat ? filesByFormat[selectedFormat] : files;

    return (
        <div className="detail-row">
            <label className="d-block">{title}</label>
            <div className="mb-08">
                <small className="text-500">
                    {files.length} files
                    {totalSize > 0 ? ` • ${valueTransforms.bytesToLargerUnit(totalSize)}` : ''}
                    {formatSummary ? ` • ${formatSummary}` : ''}
                    {statusSummary ? ` • ${statusSummary}` : ''}
                </small>
            </div>
            {tabByFormat && formatTabs.length > 1 ? (
                <div className="workflow-file-format-tabs mb-08">
                    {formatTabs.map(function(tab){
                        const isActive = tab.key === selectedFormat;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                className={"btn btn-sm " + (isActive ? "btn-primary" : "btn-outline-secondary")}
                                onClick={function(){ setActiveFormat(tab.key); }}>
                                {tab.key} <span className="ms-04">({tab.count})</span>
                            </button>
                        );
                    })}
                </div>
            ) : null}
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
                        { visibleFiles.map(function(f, idx){
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

function getCompactedFilesFromNode(node){
    const compactedNodes = Array.isArray(node && node._compactedNodes) ? node._compactedNodes : [];
    if (compactedNodes.length === 0) return [];
    const seen = new Set();
    const files = [];
    compactedNodes.forEach(function(n){
        const runDataFile = n && n.meta && n.meta.run_data && n.meta.run_data.file;
        const list = Array.isArray(runDataFile) ? runDataFile : (runDataFile ? [runDataFile] : []);
        list.forEach(function(f){
            if (!f) return;
            const key = f['@id'] || f.accession || f.uuid || JSON.stringify([f.display_title, f.file_format && (f.file_format.file_format || f.file_format.display_title), f.file_size]);
            if (seen.has(key)) return;
            seen.add(key);
            files.push(f);
        });
    });
    return files;
}

function getCompactedStepsFromNode(node){
    const compactedNodes = Array.isArray(node && node._compactedNodes) ? node._compactedNodes : [];
    if (compactedNodes.length === 0) return [];
    const seen = new Set();
    const steps = [];
    compactedNodes.forEach(function(n){
        if (!n || (n.nodeType || '') !== 'step') return;
        const key = n.id || n.name || (n.meta && (n.meta.uuid || n.meta['@id'] || n.meta.display_title));
        if (!key || seen.has(key)) return;
        seen.add(key);
        steps.push(n);
    });
    return steps;
}

function StepDetailBody(props){
    const { node, deselectNode, title, typeName, showDetailsInPopup, context, schemas, compactedNote } = props;
    const { meta = {}, _inputs = [], _outputs = [], name: stepNodeName } = node;
    const compactedSteps = getCompactedStepsFromNode(node);
    const isCompactedStepGroup = (node && node._mergedCount > 1) || compactedSteps.length > 1;
    const {
        workflow = null,
        analysis_step_types: analysisStepTypes = [],
        aliases: stepAliases = [],
        software_versions: softwareVersions = [],
        input_files: inputFiles = [],
        output_files: outputFiles = []
    } = meta;
    const workflowTitle = (workflow && (workflow.display_title || workflow.title || workflow.name)) || null;
    const workflowHref = workflow && workflow['@id'] ? workflow['@id'] : null;
    const stepGroupItems = (compactedSteps.length > 0 ? compactedSteps : [node]).filter(Boolean);
    const groupStepTypes = _.uniq(
        stepGroupItems.reduce(function(all, stepNode){
            const m = (stepNode && stepNode.meta) || {};
            return all.concat(
                normalizeToList(m.analysis_step_types),
                normalizeToList(m.step_type)
            );
        }, []).filter(Boolean)
    );
    const groupStepNames = _.uniq(stepGroupItems.map(function(stepNode){
        const m = (stepNode && stepNode.meta) || {};
        return m.display_title || m.title || stepNode.name || null;
    }).filter(Boolean));
    const groupWorkflowTitles = _.uniq(stepGroupItems.map(function(stepNode){
        const wf = stepNode && stepNode.meta && stepNode.meta.workflow;
        return wf && (wf.display_title || wf.title || wf.name);
    }).filter(Boolean));
    const groupInputArgCount = _.reduce(stepGroupItems, function(sum, stepNode){
        const stepInputs = Array.isArray(stepNode && stepNode._inputs) ? stepNode._inputs.length : 0;
        return sum + stepInputs;
    }, 0);
    const groupOutputArgCount = _.reduce(stepGroupItems, function(sum, stepNode){
        const stepOutputs = Array.isArray(stepNode && stepNode._outputs) ? stepNode._outputs.length : 0;
        return sum + stepOutputs;
    }, 0);

    const stepTypeValue = normalizeToList(analysisStepTypes, _inputs)
        .concat(normalizeToList(meta.step_type, _inputs))
        .filter(Boolean)
        .join(', ');

    const aliasesValue = normalizeToList(stepAliases)
        .concat(stepNodeName ? [stepNodeName] : [])
        .filter(Boolean)
        .join(', ');

    const inputValue = summarizeIOList(_inputs, 'source').join(', ');
    const outputValue = summarizeIOList(_outputs, 'target').join(', ');
    const softwareValue = summarizeSoftware(softwareVersions);
    const inputFilesCount = Array.isArray(inputFiles) ? inputFiles.length : 0;
    const outputFilesCount = Array.isArray(outputFiles) ? outputFiles.length : 0;

    const summaryRows = isCompactedStepGroup ? [
        { label: "Grouped Steps", value: stepGroupItems.length, showAlways: true },
        { label: "Step Type(s)", value: groupStepTypes.join(', ') || null },
        { label: "Step Names", value: groupStepNames.slice(0, 8).join(', ') + (groupStepNames.length > 8 ? ` (+${groupStepNames.length - 8} more)` : '') },
        { label: "Pipeline(s)", value: groupWorkflowTitles.join(', ') || null }
    ] : [
        { label: "Step Type", value: stepTypeValue },
        { label: "Step Alias(es)", value: aliasesValue },
        { label: "Input", value: inputValue },
        { label: "Output", value: outputValue },
        { label: "Pipeline", value: workflowHref ? <a href={workflowHref}>{workflowTitle || workflowHref}</a> : workflowTitle },
        { label: "Software", value: softwareValue }
    ];

    const detailRows = isCompactedStepGroup ? [
        { label: "Input Arguments (total)", value: groupInputArgCount || null },
        { label: "Output Arguments (total)", value: groupOutputArgCount || null }
    ] : [
        { label: "Input Arguments", value: Array.isArray(_inputs) ? _inputs.length : null },
        { label: "Output Arguments", value: Array.isArray(_outputs) ? _outputs.length : null },
        { label: "Input Files", value: inputFilesCount || null },
        { label: "Output Files", value: outputFilesCount || null }
    ];
    const hasSummaryRows = hasRenderableRows(summaryRows);
    const hasDetailRows = hasRenderableRows(detailRows);

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
                {compactedNote ? (
                    <ValueRow label="Compact View" value={compactedNote} />
                ) : null}
                {isCompactedStepGroup ? (
                    <GroupedStepsList steps={stepGroupItems} title="Compacted Steps" />
                ) : null}
                {hasSummaryRows ? (
                    <DetailSection title="Summary">
                        <DetailGrid rows={summaryRows} />
                    </DetailSection>
                ) : null}
                {hasDetailRows ? (
                    <DetailSection title="Metadata">
                        <DetailGrid rows={detailRows} />
                    </DetailSection>
                ) : null}
                {!hasSummaryRows && !hasDetailRows ? (
                    <div className="workflow-detail-empty-message">
                        No additional step metadata available.
                    </div>
                ) : null}
            </div>
        </React.Fragment>
    );
}

function GroupedStepsList({ steps = [], title = "Compacted Steps" }){
    if (!Array.isArray(steps) || steps.length === 0) return null;
    return (
        <div className="detail-row">
            <label className="d-block">{title}</label>
            <div className="table-responsive">
                <table className="table table-sm mb-0 grouped-files-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}>#</th>
                            <th>Step</th>
                            <th>Type</th>
                            <th className="text-end">In Args</th>
                            <th className="text-end">Out Args</th>
                        </tr>
                    </thead>
                    <tbody>
                        {steps.map(function(stepNode, idx){
                            const m = (stepNode && stepNode.meta) || {};
                            const stepName = m.display_title || m.title || stepNode.name || '-';
                            const stepType = normalizeToList(m.analysis_step_types)
                                .concat(normalizeToList(m.step_type))
                                .filter(Boolean)
                                .join(', ');
                            const inCount = Array.isArray(stepNode && stepNode._inputs) ? stepNode._inputs.length : 0;
                            const outCount = Array.isArray(stepNode && stepNode._outputs) ? stepNode._outputs.length : 0;
                            return (
                                <tr key={(stepNode.id || stepNode.name || idx) + '-' + idx}>
                                    <td>{idx + 1}</td>
                                    <td>{stepName}</td>
                                    <td>{stepType || '-'}</td>
                                    <td className="text-end">{inCount}</td>
                                    <td className="text-end">{outCount}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
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

function DetailSection({ title, children }){
    return (
        <div className="workflow-detail-section">
            <h5 className="workflow-detail-section-title">{title}</h5>
            {children}
        </div>
    );
}

function DetailGrid({ rows = [] }){
    return (
        <div className="workflow-detail-grid">
            {rows.map(function(row, idx){
                const { label, value, showAlways = false, fallbackValue = '-', isDate = false } = row;
                const valueNode = value ? (!isDate ? value : <LocalizedTime timestamp={value} formatType="date-md" dateTimeSeparator=" " />) : fallbackValue;
                if (!value && !showAlways) return null;
                return (
                    <div className="workflow-detail-grid-row" key={`${label}-${idx}`}>
                        <div className="workflow-detail-grid-label">{label}</div>
                        <div className="workflow-detail-grid-value">{valueNode}</div>
                    </div>
                );
            })}
        </div>
    );
}

function hasRenderableRows(rows = []){
    return rows.some(function(row){
        if (!row) return false;
        const { value, showAlways = false } = row;
        return !!value || !!showAlways;
    });
}

function normalizeToList(value, fallbackList = []){
    if (Array.isArray(value)) return value;
    if (value) return [value];
    return Array.isArray(fallbackList) ? [] : [];
}

function summarizeIOList(list = [], sourceOrTarget = 'source'){
    if (!Array.isArray(list)) return [];
    const names = [];
    list.forEach(function(io){
        if (!io) return;
        const ioName = io.name || (io.meta && io.meta.name) || null;
        const endpoints = Array.isArray(io[sourceOrTarget]) ? io[sourceOrTarget] : [];
        if (endpoints.length > 0){
            endpoints.forEach(function(ep){
                if (ep && ep.name) names.push(ep.name);
            });
        } else if (ioName){
            names.push(ioName);
        }
    });
    return _.uniq(names.filter(Boolean));
}

function summarizeSoftware(softwareVersions = []){
    if (!Array.isArray(softwareVersions)) return null;
    const software = softwareVersions.map(function(sw){
        const item = sw && sw.software ? sw.software : sw;
        if (!item) return null;
        const name = item.name || item.title || item.display_title || '';
        const version = sw && sw.version ? sw.version : item.version;
        return [name, version].filter(Boolean).join(' ');
    }).filter(Boolean);
    return software.length > 0 ? software.join(', ') : null;
}

function StatusBadge({ status, text }){
    return (
        <span className={`workflow-status-badge status-${status || 'unknown'}`}>
            <i className="status-indicator-dot me-06" data-status={status} />
            {text || '-'}
        </span>
    );
}
