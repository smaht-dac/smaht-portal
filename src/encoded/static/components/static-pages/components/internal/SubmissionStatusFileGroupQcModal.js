'use strict';

import React from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import Form from 'react-bootstrap/Form';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import * as d3 from 'd3';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import {
    createBadge,
    fallbackCallback,
    formatQcValue,
    getQcBagdeType,
    shortenStringKeepBothEnds,
    getCommentsList,
    getTargetCoverage,
} from './utils';

class FileGroupQCModalComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.props = props;
        this.state = {
            initialLoading: true,
            loading: false,
            warnings: [],
            currentFileSet: this.props.fileSet,
            fileSets: {},
            visibleFileSets: [this.props.fileSet.uuid],
            isUserAdmin: this.props.isUserAdmin,
            submittedFiles: [],
            processedFiles: [],
            parentReloadNecessary: false,
            commentInputVisible: false,
            newComment: '',
            estimatedTotalCoverage: 'NA',
        };
    }

    componentDidMount() {
        this.getData();
    }

    getData = () => {
        const payload = {
            fileSetUuid: this.state.currentFileSet.uuid,
            fileGroup: this.state.currentFileSet.file_group,
        };

        ajax.load(
            '/get_file_group_qc/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                const allFileSets = resp.filesets;
                const files = resp.files_with_qcs;
                // We need to reformat the QC values so that we have fast access to
                // individual values
                files.forEach((file) => {
                    file['qc_values_dict'] = this.reformatQcValues(
                        file.quality_metric?.qc_values
                    );
                });

                const submittedFiles = files.filter(
                    (file) => !file.is_output_file
                );
                const processedFiles = files.filter(
                    (file) => file.is_output_file
                );

                this.setState({
                    initialLoading: false,
                    submittedFiles: submittedFiles,
                    processedFiles: processedFiles,
                    fileSets: allFileSets,
                    warnings: resp.warnings,
                    estimatedTotalCoverage:
                        this.getEstimatedCoverage(processedFiles),
                });
            },
            'POST',
            fallbackCallback,
            JSON.stringify(payload)
        );
    };

    // We need to index the qc values from the portal by derived_from for efficient access
    reformatQcValues = (qcValues) => {
        const result = {};
        qcValues.forEach((qcValue) => {
            result[qcValue.derived_from] = qcValue;
        });
        return result;
    };

    getEstimatedCoverage = (processedFiles) => {
        const coverage_metric = 'mosdepth:total';
        const filesSeen = [];
        let estimated_coverage = 0;
        if (processedFiles.length === 0) {
            return 'NA';
        }
        for (const pf of processedFiles) {
            const qcValues = pf['qc_values_dict'];
            if (coverage_metric in qcValues) {
                // If there are multiple QM items for the same file we don't want to count the coverage more than once
                if (filesSeen.includes(pf.accession)) {
                    continue;
                }
                const cov = qcValues[coverage_metric]['value'];
                estimated_coverage += cov;
                filesSeen.push(pf.accession);
            }
        }
        return estimated_coverage > 0.0
            ? formatQcValue(estimated_coverage)
            : 'NA';
    };

    toggleTag = (fileSetUuid, tag) => {
        const allFileSets = JSON.parse(JSON.stringify(this.state.fileSets));
        const currentFileSetTags = allFileSets[fileSetUuid]['tags'];
        if (currentFileSetTags.includes(tag)) {
            const index = currentFileSetTags.indexOf(tag);
            currentFileSetTags.splice(index, 1);
        } else {
            currentFileSetTags.push(tag);
        }
        const payload = {
            tags: currentFileSetTags,
        };
        this.setState(
            (prevState) => ({
                loading: true,
            }),
            function () {
                ajax.load(
                    fileSetUuid,
                    (resp) => {
                        if (resp.status !== 'success') {
                            console.error(resp);
                            return;
                        } else {
                            this.setState({
                                fileSets: allFileSets,
                                parentReloadNecessary: true,
                                loading: false,
                            });
                        }
                    },
                    'PATCH',
                    fallbackCallback,
                    JSON.stringify(payload)
                );
            }
        );
    };

    getFileSetTags = (filesetUuid) => {
        const relevantTags = ['reviewed', 'ready_to_release'];
        const filesetStatusTags = relevantTags.map((tag) => {
            const fileSetTags = this.state.fileSets[filesetUuid]['tags'];
            const badgeType =
                fileSetTags && fileSetTags.includes(tag) ? 'info' : 'lighter';

            const cn = 'badge clickable mx-1 bg-' + badgeType;
            return (
                <span
                    className={cn}
                    onClick={() => this.toggleTag(filesetUuid, tag)}>
                    {tag}
                </span>
            );
        });
        return filesetStatusTags;
    };

    getQcTable = (files) => {
        if (files.length === 0) {
            return (
                <div className="text-center m-4">
                    There are no files to display.
                </div>
            );
        }

        // Get list of all occuring qc values
        const qc_value_derived_from_list = [];
        const qc_value_derived_from_to_key = {};
        files.forEach((file) => {
            const qc_values = file.quality_metric?.qc_values;
            qc_values.forEach((qc_value) => {
                const df = qc_value.derived_from;
                qc_value_derived_from_list.push(df);
                qc_value_derived_from_to_key[df] = qc_value.key;
            });
        });
        const qc_value_derived_from_list_unique = [
            ...new Set(qc_value_derived_from_list),
        ];

        const loadingSymbol = this.state.loading ? (
            <i className="icon icon-fw fas icon-spinner icon-spin me-1"></i>
        ) : (
            ''
        );

        // Table header construction
        const header = [
            <th>
                <div className="d-flex justify-content-between">
                    <div>QC value</div>
                    <div>{loadingSymbol}</div>
                </div>
            </th>,
        ];
        let numTableColumns = 1;
        files.forEach((file) => {
            if (!this.state.visibleFileSets.includes(file.fileset_uuid)) {
                return;
            }
            const retracted =
                file.status === 'retracted'
                    ? <span className="ps-1">{createBadge('danger', 'Retracted')}</span>
                    : '';
            const tags = this.state.isUserAdmin
                ? this.getFileSetTags(file.fileset_uuid)
                : '';
            header.push(
                <th>
                    <span className="text-wrap" title={file.display_title}>
                        {file.accession} {retracted}
                    </span>
                    <br />
                    <small
                        className="text-wrap"
                        title={file.fileset_submitted_id}>
                        {shortenStringKeepBothEnds(
                            file.fileset_submitted_id,
                            18
                        )}
                    </small>
                    <br />
                    <span className="text-wrap">{tags}</span>
                </th>
            );
            numTableColumns++;
        });

        // Table body construction
        const body = [];
        qc_value_derived_from_list_unique.forEach((qc_derived_from) => {
            const qc_key = qc_value_derived_from_to_key[qc_derived_from];
            const row = [<td className="text-start">{qc_key}</td>];
            files.forEach((file) => {
                if (!this.state.visibleFileSets.includes(file.fileset_uuid)) {
                    return;
                }
                if (!file.qc_values_dict.hasOwnProperty(qc_derived_from)) {
                    row.push(<td></td>);
                    return;
                }
                const qc_value = file.qc_values_dict[qc_derived_from];
                let badge = '';
                if (qc_value.hasOwnProperty('flag')) {
                    const flag = qc_value['flag'];
                    const badgeType = getQcBagdeType(flag);
                    badge = createBadge(badgeType, flag);
                }

                row.push(
                    <td>
                        <span className="px-1">
                            {formatQcValue(qc_value.value)}
                        </span>
                        {badge}
                    </td>
                );
            });
            body.push(<tr>{row}</tr>);
        });

        // We prefer the sticky table header, but that does not allow for a responsive table
        // Switch to a responsive table when there are too many columns
        if (numTableColumns < 5) {
            return (
                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead className="sticky-top ss-qc-review-fixed-thead">
                        <tr>{header}</tr>
                    </thead>
                    <tbody>{body}</tbody>
                </table>
            );
        } else {
            return (
                <div className="table-responsive">
                    <table className="table table-hover table-striped table-bordered table-sm">
                        <thead>
                            <tr>{header}</tr>
                        </thead>
                        <tbody>{body}</tbody>
                    </table>
                </div>
            );
        }
    };

    toggleFileset = (e, uuid) => {
        const visibleFileSets = JSON.parse(
            JSON.stringify(this.state.visibleFileSets)
        );
        const index = visibleFileSets.indexOf(uuid);
        if (index === -1) {
            visibleFileSets.push(uuid);
        } else {
            visibleFileSets.splice(index, 1);
        }
        this.setState({
            visibleFileSets: visibleFileSets,
        });
    };

    handleToggleCommentInputField = (e) => {
        if (e) {
            e.preventDefault();
        }
        this.setState((prevState) => ({
            commentInputVisible: !prevState.commentInputVisible,
        }));
    };

    handleCommentInput = (comment) => {
        this.setState({
            newComment: comment,
        });
    };

    addComment = () => {
        this.setState({
            loading: true,
        });
        const comment = this.state.newComment;
        if (!comment) {
            return;
        }
        this.handleToggleCommentInputField(null);
        const fileSets = JSON.parse(JSON.stringify(this.state.fileSets));

        for (const fsUuid in fileSets) {
            const fileSet = fileSets[fsUuid];
            fileSet.comments.push(comment);
            const payload = {
                comments: fileSet.comments,
            };
            ajax.load(
                fileSet.uuid,
                (resp) => {
                    if (resp.status !== 'success') {
                        console.error(resp);
                        return;
                    }
                },
                'PATCH',
                fallbackCallback,
                JSON.stringify(payload)
            );
        }

        this.setState(
            (prevState) => ({
                fileSets: fileSets,
                loading: false,
                parentReloadNecessary: true,
                newComment: '',
            }),
            function () {
                this.forceUpdate();
            }
        );
    };

    hideModal = () => {
        this.props.closeModal(null, this.state.parentReloadNecessary);
    };

    getModal(modelBody) {
        return (
            <Modal show size="xl" onHide={this.hideModal}>
                <Modal.Header closeButton>
                    <Modal.Title>Review File Group QC</Modal.Title>
                </Modal.Header>
                <Modal.Body>{modelBody}</Modal.Body>
            </Modal>
        );
    }

    render() {
        const { currentFileSet, submittedFiles, processedFiles } = this.state;
        const submittedFilesTable = this.getQcTable(submittedFiles);
        const processedFilesTable = this.getQcTable(processedFiles);

        if (this.state.initialLoading) {
            const modalBody = (
                <div className="p-5 text-center">
                    <i className="icon icon-fw fas icon-spinner icon-spin me-1"></i>
                    Loading
                </div>
            );
            return this.getModal(modalBody);
        }

        const targetCoverage = getTargetCoverage(currentFileSet.sequencing);

        const estimatedTotalCoverageCopyString =
            this.state.estimatedTotalCoverage !== 'NA'
                ? d3.format(',.1f')(this.state.estimatedTotalCoverage) + 'X'
                : '';

        const estimatedCoverage =
            this.state.estimatedTotalCoverage === 'NA' ? (
                ''
            ) : (
                <span>
                    , Calculated coverage:{' '}
                    <strong>{this.state.estimatedTotalCoverage}x</strong>
                    <object.CopyWrapper
                        value={estimatedTotalCoverageCopyString}
                        className=""
                        data-tip={'Click to copy group coverage'}
                        wrapperElement="span"
                        iconProps={{
                            style: { fontSize: '0.875rem', marginLeft: 3 },
                        }}></object.CopyWrapper>
                </span>
            );

        const assays = currentFileSet.libraries?.map((lib) => {
            const assay = lib.assay?.display_title;
            return <span key={assay}>{assay}</span>;
        });

        const filesetList = Object.keys(this.state.fileSets).map((uuid) => {
            const fs = this.state.fileSets[uuid];
            const comments = getCommentsList(
                uuid,
                fs.comments,
                false, // Removing comments from the modal is currently disabled / not yet implemented
                null, // Removing comments from the modal is currently disabled / not yet implemented
                'Comment: '
            );

            const isChecked = fs['uuid'] === this.state.currentFileSet.uuid;
            return (
                <li key={fs['uuid']}>
                    <Form.Check
                        defaultChecked={isChecked}
                        type="checkbox"
                        id={fs['submitted_id']}
                        label={fs['submitted_id']}
                        onChange={(e) => this.toggleFileset(e, uuid)}
                    />
                    {comments}
                </li>
            );
        });

        const addCommentSection = (
            <span className={this.state.isUserAdmin ? 'ms-1' : 'collapse'}>
                <a
                    href="#"
                    onClick={(e) => this.handleToggleCommentInputField(e)}>
                    <i className="icon fas icon-plus-circle icon-fw"></i>
                    Add comment to all filesets
                </a>
                <div
                    className={
                        this.state.commentInputVisible
                            ? 'input-group input-group-sm mb-1'
                            : 'collapse'
                    }>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Your comment"
                        value={this.state.newComment}
                        onChange={(e) =>
                            this.handleCommentInput(e.target.value)
                        }
                    />
                    <div className="input-group">
                        <div className="input-group-text">
                            <i
                                className="fas icon icon-save clickable"
                                onClick={() => this.addComment()}></i>
                        </div>
                    </div>
                </div>
            </span>
        );

        const warnings = this.state.warnings.map((warning) => {
            return (
                <div className="alert alert-warning">
                    <i className="icon icon-exclamation-circle fas me-1" />
                    {warning}
                </div>
            );
        });

        const modalBody = (
            <div>
                {warnings}
                <ul>
                    <li key="ssfgm-fg">
                        <strong>File group:</strong>{' '}
                        {currentFileSet.file_group_str}
                    </li>
                    <li key="ssfgm-seq">
                        <strong>Sequencer:</strong>{' '}
                        {currentFileSet.sequencing?.sequencer?.display_title} (
                        {targetCoverage}
                        {estimatedCoverage})
                    </li>
                    <li key="ssfgm-assay">
                        <strong>Assay:</strong> {assays}
                    </li>
                    <li key="ssfgm-filesets">
                        <strong>Filesets:</strong>
                        {addCommentSection}
                        <ul className="ss-fileset-list list-unstyled fw-normal">
                            {filesetList}
                        </ul>
                    </li>
                </ul>
                <Tabs
                    defaultActiveKey="processed-files"
                    id="uncontrolled-tab-example"
                    className="my-3">
                    <Tab eventKey="processed-files" title="Processed files">
                        {processedFilesTable}
                    </Tab>
                    <Tab eventKey="submitted-files" title="Submitted files">
                        {submittedFilesTable}
                    </Tab>
                </Tabs>
            </div>
        );
        return this.getModal(modalBody);
    }
}

export const FileGroupQCModal = React.memo(function FileGroupQCModal(props) {
    return <FileGroupQCModalComponent {...props} />;
});
