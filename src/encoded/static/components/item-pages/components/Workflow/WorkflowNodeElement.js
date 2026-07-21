'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { console, object, valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
//import { ViewMetricButton } from './WorkflowDetailPane/FileDetailBodyMetricsView';


// These functions are used here and may be re-used in WorkflowDetailPane.js and similar.

export function isNodeParameter(node){
    return node.ioType === 'parameter';
}

export function isNodeFile(node){
    return WorkflowNodeElement.ioFileTypes.has(node.ioType);
}

export function isNodeGroup(node){
    return ((node.nodeType || '').indexOf('group') > -1);
}

export function isNodeQCMetric(node){
    if (node.ioType === 'qc') return true;
    if (node.ioType === 'report') return true;
    if (node.meta && node.meta.type === 'QC') return true;
    if (node.meta && node.meta.type === 'report') return true;
    if (node.meta && node.meta.run_data && node.meta.run_data.type === 'quality_metric') return true;
    return false;
}

export function doesRunDataExist(node){
    if (isNodeGroup(node)){
        return (
            node.meta && node.meta.run_data && node.meta.run_data.file
            && Array.isArray(node.meta.run_data.file) && node.meta.run_data.file.length > 0 && typeof node.meta.run_data.file[0]['@id'] === 'string'
            /* && typeof node.meta.run_data.file.display_title === 'string'*/
        );
    } else if (isNodeParameter(node)){
        return (node.meta && node.meta.run_data && (
            typeof node.meta.run_data.value === 'string' ||
            typeof node.meta.run_data.value === 'number' ||
            typeof node.meta.run_data.value === 'boolean'
        ));
    } else if (isNodeFile(node)) { // Uncomment this in-line comment once all Workflows have been upgraded and have 'step.inputs[]|outputs[].meta.type'
        return (
            node.meta && node.meta.run_data && node.meta.run_data.file
            && typeof node.meta.run_data.file['@id'] === 'string'
            /* && typeof node.meta.run_data.file.display_title === 'string'*/
        );
    }
}

function getNodeRunDataFiles(node){
    const runDataFile = node && node.meta && node.meta.run_data && node.meta.run_data.file;
    if (Array.isArray(runDataFile)) return runDataFile;
    if (runDataFile) return [runDataFile];
    return [];
}

function compactStepTitle(rawTitle){
    if (typeof rawTitle !== 'string') return rawTitle;
    const cleaned = rawTitle.replace(/^sentieon\s+/i, '').trim();
    if (cleaned.length <= 28) return cleaned;
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length < 2) return cleaned;
    const first = words.slice(0, 2).join(' ');
    const acronym = words.slice(2).map(function(w){ return w.charAt(0).toUpperCase(); }).join('');
    if (!acronym) return first;
    return first + ' ' + acronym;
}

function humanizeStepTitle(rawTitle){
    if (typeof rawTitle !== 'string') return rawTitle;
    const normalized = rawTitle.toLowerCase().replace(/\[[^\]]+\]/g, '').trim();
    const aliases = [
        [/fastp/, 'FASTQ read cleanup'],
        [/bwa[-\s]?mem/, 'Read alignment'],
        [/addreadgroups?/, 'Add read groups'],
        [/locuscollector/, 'Collect duplicate metrics'],
        [/shards?\s+to\s+readgroups?/, 'Shard reads by group'],
        [/realigner/, 'Local realignment'],
        [/qualcal/, 'Base quality recalibration'],
        [/samtools\s+merge/, 'Merge BAM files'],
        [/bam\s+to\s+cram/, 'Convert BAM to CRAM']
    ];
    const matched = aliases.find(function([re]){ return re.test(normalized); });
    if (matched) return matched[1];
    return compactStepTitle(rawTitle.replace(/\s*\[[^\]]+\]\s*/g, '').trim());
}


/** TODO codify what we want shown here and cleanup code - breakup into separate functional components */

export class WorkflowNodeElement extends React.PureComponent {

    static propTypes = {
        'node' : PropTypes.object.isRequired,
        'title': PropTypes.string,
        'disabled' : PropTypes.bool,
        'selected' : PropTypes.bool,
        'related'  : PropTypes.oneOfType([PropTypes.bool, PropTypes.string]),
        'columnWidth' : PropTypes.number
    };

    static ioFileTypes = new Set(['data file', 'QC', 'reference file', 'report']);

    static getFileFormat(node){
        /** @see https://medium.com/@JasonCust/fun-with-destructuring-assignments-ba5717c8d7e **/
        const {
            meta : {
                file_format: metaFileFormat = null,
                run_data: nodeRunData = null
            }
        } = node;
        const { file : { file_format : fileFileFormat = null } = {} } = (nodeRunData || {});
        if (object.itemUtil.isAnItem(fileFileFormat)) {
            // The file_format attached to file itself (if any) is most accurate.
            return fileFileFormat;
        } else if (object.itemUtil.isAnItem(metaFileFormat)) {
            // This might be inaccurate if multiple files of different formats are in an array for same input/output argument.
            // Is only option available for when viewing a Workflow Item (vs WorkflowRun, Provenance Graph)
            return metaFileFormat;
        }
        return null;
    }

    static getFileFormatString(node){
        if (node && node._isAuxiliaryGroup) {
            return "aux";
        }
        const fileFormatItem = WorkflowNodeElement.getFileFormat(node);

        if (!fileFormatItem) {

            const fileFormatStrDeprecated = (node.meta && typeof node.meta.file_format === 'string' && node.meta.file_format) || null;
            if (fileFormatStrDeprecated){
                return fileFormatStrDeprecated;
            }

            // Some extra glitter to show lack of defined file_format.
            // Assuming is Workflow visualization with no run data or file_format definition pre-defined.
            return "Any file format";
        }
        return (fileFormatItem && (fileFormatItem.file_format || fileFormatItem.display_title)) || null;
    }

    icon(){
        const { node } = this.props;
        const { ioType, nodeType } = node;
        const fileFormatAsString = WorkflowNodeElement.getFileFormatString(node);
        let iconClass;

        if (nodeType === 'input-group' || nodeType === 'output-group'){
            iconClass = 'folder-open fas';
        } else if (nodeType === 'input' || nodeType === 'output'){
            const runDataFile = node.meta && node.meta.run_data && node.meta.run_data.file;
            const hasGroupedFiles = Array.isArray(runDataFile) ?
                runDataFile.some(function(f){ return f && f.grouped_files; }) :
                runDataFile && runDataFile.grouped_files;
            if (hasGroupedFiles) {
                iconClass = 'folder-open fas';
            } else if (fileFormatAsString === 'zip' || fileFormatAsString === 'tar' || fileFormatAsString === 'gz') {
                iconClass = 'file-archive far';
            } else if (typeof ioType === 'undefined'){
                iconClass = 'question fas';
            } else if (typeof ioType === 'string') {
                if (isNodeQCMetric(node)) {
                    iconClass = 'check-square far';
                } else if (isNodeParameter(node) || ioType.indexOf('int') > -1 || ioType.indexOf('string') > -1){
                    iconClass = 'wrench fas';
                } else if (isNodeFile(node)){
                    iconClass = 'file-alt fas';
                } else {
                    iconClass = 'question fas';
                }
            } else if (Array.isArray(ioType)) { // Deprecated?
                if (
                    ioType[0] === 'File' ||
                    (ioType[0] === 'null' && ioType[1] === 'File')
                ){
                    iconClass = 'file-alt fas';
                } else if (
                    (ioType[0] === 'int' || ioType[0] === 'string') ||
                    (ioType[0] === 'null' && (ioType[1] === 'int' || ioType[1] === 'string'))
                ){
                    iconClass = 'wrench fas';
                }
            }

        } else if (nodeType === 'step'){
            iconClass = 'cogs fas';
        }
        if (!iconClass) {
            iconClass = 'question fas';
        }
        return <i className={"icon icon-fw icon-" + iconClass}/>;
    }

    tooltip(){
        const { node } = this.props;
        const { nodeType, meta, name } = node;
        let output = '';
        let hasRunDataFile = false;

        // Titles
        // Node Type -specific
        if (nodeType === 'step'){
            if (meta && meta.workflow){
                output += '<small>Workflow Run</small>'; // Workflow Run
            } else {
                output += '<small>Step</small>'; // Reg Step
            }
            // Step Title
            const stepTitle = (
                (meta && (meta.display_title || meta.name))
                || node.title
                || name
                || 'Workflow step'
            );
            output += '<h5 class="text-600 tooltip-title">' + stepTitle + '</h5>';
        }

        if (nodeType === 'input-group'){
            output += '<small>Input Argument</small>';
        }

        if (nodeType === 'input' || nodeType === 'output'){
            let argumentName = nodeType;
            argumentName = argumentName.charAt(0).toUpperCase() + argumentName.slice(1);
            hasRunDataFile = isNodeFile(node) && doesRunDataExist(node);
            const runDataFiles = getNodeRunDataFiles(node);
            const groupedFilesCount = runDataFiles.reduce(function(total, file){
                const grouped = Array.isArray(file && file.grouped_files) ? file.grouped_files.length : 0;
                return total + grouped;
            }, 0);
            const fileTitle = hasRunDataFile && (
                runDataFiles.length > 1
                    ? `${runDataFiles.length} grouped entries${groupedFilesCount > 0 ? ` (${groupedFilesCount} files)` : ''}`
                    : (runDataFiles[0] && (runDataFiles[0].display_title || runDataFiles[0].accession))
            );
            if (fileTitle) {
                output += '<small>' + argumentName + ' File</small>';
                output += '<h5 class="text-600 tooltip-title">' + fileTitle + '</h5>';
                output += '<hr class="mt-08 mb-05"/>';
            }
            if (argumentName === 'Input' || argumentName === 'Output'){
                argumentName += ' Argument &nbsp; <span class="text-500 text-monospace">' + name + '</span>';
            }
            output += '<small class="mb-03 d-inline-block">' + argumentName + '</small>';
        }

        // If file, and has file-size, add it (idk, why not)
        const runDataFiles = getNodeRunDataFiles(node);
        const totalFileSize = hasRunDataFile ? runDataFiles.reduce(function(total, file){
            return total + (typeof file.file_size === 'number' ? file.file_size : 0);
        }, 0) : 0;
        if (totalFileSize){
            output += '<div class="mb-05"><span class="text-300">Size:</span> ' + valueTransforms.bytesToLargerUnit(totalFileSize) + '</div>';
        }

        // Workflow name, if any
        if (nodeType === 'step' && meta && meta.workflow && meta.workflow.display_title){ // Workflow
            //title
            output += '<hr class="mt-08 mb-05"/><div class="mb-05 mt-08"><span class="text-600">Workflow: </span><span class="text-400">' + node.meta.workflow.display_title + '</span></div>';
        }

        // Description
        const description = (
            (typeof node.description === 'string' && node.description)
            || (meta && typeof meta.description === 'string' && meta.description)
            || (meta.run_data && meta.run_data.meta && meta.run_data.meta.description)
            || (meta.run_data && meta.run_data.file && typeof meta.run_data.file === 'object' && meta.run_data.file.description)
        );
        if (description){
            output += '<hr class="mt-05 mb-05"/>';
            output += '<small class="mb-05 d-inline-block">' + description + '</small>';
        }

        return output;
    }

    aboveNodeTitle(){
        const { node, title, columnWidth } = this.props;
        const fileFormatAsString = WorkflowNodeElement.getFileFormatString(node);
        const elemProps = {
            'style'         : { 'maxWidth' : columnWidth },
            'className'     : "text-truncate above-node-title",
            'key'           : 'above-node-title'
        };

        if (node.nodeType === 'input-group'){
            return <div {...elemProps}>{ title }</div>;
        }

        // If WorkflowRun & Workflow w/ steps w/ name
        if (node.nodeType === 'step' && node.meta.workflow
            && Array.isArray(node.meta.workflow.steps)
            && node.meta.workflow.steps.length > 0
            && typeof node.meta.workflow.steps[0].name === 'string'
        ){
            //elemProps.className += ' text-monospace';
            return <div {...elemProps}>{ _.pluck(node.meta.workflow.steps, 'name').join(', ') }</div>;
        }

        // If Parameter
        if (isNodeParameter(node)){
            if (doesRunDataExist(node)){
                elemProps.className += ' text-monospace';
                return <div {...elemProps}>{ node.name }</div>;
            }
            return <div {...elemProps}>Parameter</div>;
        }

        // If File
        if (isNodeFile(node)){
            if (fileFormatAsString) {
                return <div {...elemProps}>{ fileFormatAsString }</div>;
            }
            elemProps.className += ' text-monospace';
            return <div {...elemProps}>{ title }</div>;
        }

        // If Analysis Step (---  this case is unused since node.meta.workflow.steps is used up above?)
        if (node.nodeType === 'step' && node.meta.uuid){
            if (node.meta.uuid && Array.isArray(node.meta.analysis_step_types) && node.meta.analysis_step_types.length > 0){
                return <div {...elemProps}>{  _.map(node.meta.analysis_step_types, valueTransforms.capitalize).join(', ') }</div>;
            }
        }

        // If IO Arg w/o file but w/ format
        if ((node.nodeType === 'input' || node.nodeType === 'output') && fileFormatAsString){
            return <div {...elemProps}>{ fileFormatAsString }</div>;
        }

        // QC Report
        if (node.ioType === 'qc') {
            return <div {...elemProps}>Quality Control Metric</div>;
        }

        // Default-ish for IO node
        if (typeof node.ioType === 'string') {
            return <div {...elemProps}>{ valueTransforms.capitalize(node.ioType) }</div>;
        }

        return null;

    }

    belowNodeTitle(){
        const { node, columnWidth } = this.props;
        const elemProps = {
            'style'     : { 'maxWidth' : columnWidth },
            'className' : "text-truncate below-node-title",
            'key'       : 'below-node-title'
        };

        /*
        if (node.meta && typeof node.meta.argument_type === 'string') {
            return <div {...elemProps}><span className="lighter">{ node.meta.argument_type }</span></div>;
        }
        */
        /*
        if (node.meta && typeof node.meta.argument_format === 'string') {
            return <div {...elemProps}><span className="lighter"><span className="text-500">Format: </span>{ node.meta.argument_format }</span></div>;
        }
        */

        // STEPS -  SOFTWARE USED
        function softwareTitle(s, i){
            if (typeof s.name === 'string' && typeof s.version === 'string'){
                return (
                    <React.Fragment key={object.itemUtil.atId(s) || i}>
                        { i > 0 ? ', ' : null }
                        { s.name } <span className="lighter">v{ s.version }</span>
                    </React.Fragment>
                );
            }
            return (
                <React.Fragment key={object.itemUtil.atId(s) || i}>
                    { i > 0 ? ', ' : null }
                    { s.title || s.display_title }
                </React.Fragment>
            );
        }

        if (node.nodeType === 'step' && node.meta && Array.isArray(node.meta.software_used) && node.meta.software_used.length > 0 && node.meta.software_used[0].title){
            return <div {...elemProps}>{ _.map(node.meta.software_used, softwareTitle) }</div>;
        }


        if (isNodeFile(node) && doesRunDataExist(node)){
            var belowTitle;
            if (node.meta && node.meta.file_type){
                belowTitle = node.meta.file_type;
            } else if (node.meta && node.meta.run_data && node.meta.run_data.file && typeof node.meta.run_data.file === 'object' && node.meta.run_data.file.file_type){
                belowTitle = node.meta.run_data.file.file_type;
            } else {
                belowTitle = <small className="text-monospace" style={{ 'bottom' : -15, 'color' : '#888' }}>{ node.name }</small>;
            }
            return <div {...elemProps}>{ belowTitle }</div>;
        }

        return null;
    }

    nodeTitle(){
        const { node } = this.props;
        const {
            nodeType,
            ioType,
            name,
            title = null,
            meta : {
                workflow,
                run_data
            } = {}
        } = node;

        if (nodeType === 'input-group'){
            var files = node.meta.run_data.file;
            if (Array.isArray(files)){
                var groupedFilesCount = files.reduce(function(total, file){
                    const grouped = Array.isArray(file && file.grouped_files) ? file.grouped_files.length : 1;
                    return total + grouped;
                }, 0);
                return (
                    <div className="node-name">
                        { this.icon() }
                        <b>{ groupedFilesCount }</b> similar file{ groupedFilesCount === 1 ? '' : 's' }
                    </div>
                );
            }
        }

        if (nodeType === 'step'){
            const rawStepTitle =
                (workflow && typeof workflow === 'object' && (workflow.display_title || workflow.name)) ||
                (node.meta && (node.meta.display_title || node.meta.name)) ||
                title ||
                name ||
                'Workflow step';
            const userFacingTitle = humanizeStepTitle(rawStepTitle);
            return <div className="node-name" title={rawStepTitle}>{ this.icon() }{ userFacingTitle || 'Workflow step' }</div>;
        }

        if (isNodeFile(node) && doesRunDataExist(node)){
            if (node && node._mergedCount > 1 && !node._isAuxiliaryGroup){
                const count = node._mergedCount || 1;
                const fmt = WorkflowNodeElement.getFileFormatString(node) || 'file';
                const noun = count === 1 ? 'file' : 'files';
                return (
                    <div className="node-name">
                        { this.icon() }
                        {`${count} ${fmt} ${noun}`}
                    </div>
                );
            }
            if (node && node._isAuxiliaryGroup){
                const count = node._mergedCount || getNodeRunDataFiles(node).length || 1;
                const noun = count === 1 ? 'file' : 'files';
                return (
                    <div className="node-name">
                        { this.icon() }
                        {`${count} auxiliary ${noun}`}
                    </div>
                );
            }
            const runDataFiles = getNodeRunDataFiles(node);
            const firstFile = runDataFiles[0] || {};
            const { accession, display_title } = firstFile;
            return (
                <div className={"node-name" + (accession ? ' text-monospace' : '')}>
                    { this.icon() }
                    { runDataFiles.length > 1 ? `${runDataFiles.length} grouped entries` : accession || display_title || ioType }
                </div>
            );
        }

        if (isNodeParameter(node) && doesRunDataExist(node)){
            return <div className="node-name text-monospace">{ this.icon() }{ run_data.value }</div>;
        }

        // Fallback / Default - use node.name
        return <div className="node-name">{ this.icon() }{ title || name }</div>;
    }

    mergedCountBadge(){
        const { node } = this.props;
        const mergedCount = node && node._mergedCount;
        if (!mergedCount || mergedCount < 2) return null;
        return (
            <div className="merged-count-node-badge" title={`${mergedCount} similar nodes are compacted here`}>
                x{mergedCount}
            </div>
        );
    }

    renderNodeBadges(){
        const { node } = this.props;
        if (!isNodeFile(node) || !doesRunDataExist(node)) return null;
        const runDataFiles = getNodeRunDataFiles(node);
        const firstFile = runDataFiles[0] || {};
        const status = (firstFile.status || '').toLowerCase();
        const hasQM = !!(firstFile.quality_metric || (Array.isArray(firstFile.quality_metrics) && firstFile.quality_metrics.length > 0));
        const hasGrouped = runDataFiles.length > 1 || !!firstFile.grouped_files;
        const badges = [];

        if (hasGrouped) badges.push({ key: 'grouped', label: 'G', title: 'Grouped files', cls: 'badge-grouped' });
        if (hasQM) badges.push({ key: 'qm', label: 'Q', title: 'Quality metrics available', cls: 'badge-qm' });
        if (status) badges.push({ key: 'status', label: valueTransforms.capitalizeSentence(status).charAt(0), title: 'Status: ' + valueTransforms.capitalizeSentence(status), cls: 'status-' + status });

        const shown = badges.slice(0, 2);
        if (shown.length === 0) return null;
        return (
            <div className="workflow-node-badges">
                {shown.map(function(badge){
                    return <span key={badge.key} className={'workflow-node-badge ' + badge.cls} title={badge.title}>{badge.label}</span>;
                })}
            </div>
        );
    }

    /**
     * Return a JSX element to be shown at top of right of file node
     * to indicate that a quality metric is present on said file.
     *
     * We can return a <a href={object.itemUtil.atId(qc)}>...</a> element, but
     * seems having a link on node would be bit unexpected if clicked accidentally.
     */
    qcMarker(){
        const { node, selected } = this.props;

        if (!isNodeFile(node) || !doesRunDataExist(node)){
            return null;
        }

        const {
            meta : { run_data : { file : { quality_metric, quality_metrics } = {} } }
        } = node;

        const qc = quality_metric || (Array.isArray(quality_metrics) && quality_metrics.length > 0 ? quality_metrics[0] : null);

        if (!qc) return null;

        const qcStatus = qc.overall_quality_status && qc.overall_quality_status.toLowerCase();
        const markerProps = {
            'className' : "qc-present-node-marker",
            'data-tip'  : "This file has a quality control metric associated with it.",
            'children'  : "QC",
            'key'       : 'qc-marker'
        };

        if (qcStatus){
            if (qcStatus === 'pass')       markerProps.className += ' status-passing';
            else if (qcStatus === 'warn')  markerProps.className += ' status-warning';
            else if (qcStatus === 'error') markerProps.className += ' status-error';
        }

        /*
        if (selected && qc.url){
            markerProps.className += ' clickable';
            return <a href={qc.url} target="_blank" rel="noreferrer noopener" {...markerProps} onClick={function(e){
                e.preventDefault();
                e.stopPropagation();
                ViewMetricButton.openChildWindow(qc.url);
            }} />;
        }
        */

        return <div {...markerProps} />;
    }

    render(){
        return (
            <div className="node-visible-element" key="outer">
                <div className="innermost" data-tip={this.tooltip()} data-place="top" data-html key="node-title">
                    { this.nodeTitle() }
                    { this.renderNodeBadges() }
                    { this.mergedCountBadge() }
                </div>
                { this.qcMarker() }
                { this.belowNodeTitle() }
                { this.aboveNodeTitle() }
            </div>
        );
    }
}
