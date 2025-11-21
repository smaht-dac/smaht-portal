'use strict';

import React from 'react';
import {
    JWT,
    ajax,
    object,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    fallbackCallback,
    formatDate,
    getLink,
    createBadge,
    createWarningIcon,
    getQcResults,
    getQcResultsSummary,
    getCommentsList,
    getTargetCoverage,
    isReleasedExternally,
    isReleasedInternally
} from './submissionStatusUtils';

import {
    PAGE_SIZE,
    SUBMISSION_STATUS_TAGS,
    DEFAULT_FILTER,
} from './submissionStatusConfig';

import { SubmissionStatusFilter } from './SubmissionStatusFilter';

import { FileGroupQCModal } from './SubmissionStatusFileGroupQcModal';

import * as d3 from 'd3';

class SubmissionStatusComponent extends React.PureComponent {
    constructor(props) {
        super(props);

        const userDetails = JWT.getUserInfo();

        this.state = {
            initialLoading: true,
            loading: false,
            fileSets: [],
            hasError: false,
            tablePage: 0,
            filter: DEFAULT_FILTER,
            fileSetIdSearch: '',
            numTotalFileSets: 0,
            visibleCommentInputs: [],
            submittedFilesVisibility: [],
            comments: {},
            newComments: {},
            isUserAdmin: userDetails.details.groups?.includes('admin'),
            modal: null,
        };
    }

    changePage = (change) => {
        this.setState(
            (prevState) => ({
                tablePage: prevState.tablePage + change,
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    };

    toggleCommentInputField = (fs_uuid) => {
        let newVisibleInputs = this.state.visibleCommentInputs;
        if (newVisibleInputs.includes(fs_uuid)) {
            const i = newVisibleInputs.indexOf(fs_uuid);
            newVisibleInputs.splice(i, 1);
        } else {
            newVisibleInputs.push(fs_uuid);
        }
        this.setState(
            (prevState) => ({
                visibleCommentInputs: newVisibleInputs,
            }),
            function () {
                this.forceUpdate();
            }
        );
    };

    handleToggleCommentInputField = (e, fs_uuid) => {
        e.preventDefault();
        this.toggleCommentInputField(fs_uuid);
    };

    getData = () => {
        const payload = {
            limit: PAGE_SIZE,
            from: this.state.tablePage * PAGE_SIZE,
            filter: this.state.filter,
            fileSetSearchId: this.state.fileSetIdSearch,
        };

        ajax.load(
            '/get_submission_status/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                this.setState({
                    initialLoading: false,
                    loading: false,
                    fileSets: resp.file_sets,
                    numTotalFileSets: resp.total_filesets,
                });
            },
            'POST',
            fallbackCallback,
            JSON.stringify(payload)
        );
    };

    componentDidMount() {
        this.getData();
    }

    setFilter = (filterName, selection) => {
        const filter = this.state.filter;
        filter[filterName] = selection;
        this.applyFilter(filter);
    };

    applyFilter(filter) {
        this.setState(
            (prevState) => ({
                filter: filter,
                fileSetIdSearch: '',
                tablePage: 0,
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    }

    handleSearchByFilesetId(id) {
        this.setState(
            (prevState) => ({
                fileSetIdSearch: id,
                tablePage: 0,
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    }

    refresh() {
        this.setState(
            (prevState) => ({
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    }

    getPageination = () => {
        let message = 'No FileSets found';
        if (this.state.numTotalFileSets > 0) {
            message = `Displaying FileSet ${
                this.state.tablePage * PAGE_SIZE + 1
            }-${Math.min(
                (this.state.tablePage + 1) * PAGE_SIZE,
                this.state.numTotalFileSets
            )} of ${this.state.numTotalFileSets}`;
        }

        const navButtons = [];
        if (
            this.state.numTotalFileSets > PAGE_SIZE &&
            (this.state.tablePage + 1) * PAGE_SIZE <=
                this.state.numTotalFileSets
        ) {
            navButtons.push(
                <button
                    className="btn btn-primary btn-sm"
                    onClick={() => this.changePage(1)}>
                    Next
                </button>
            );
        }

        if (this.state.tablePage > 0) {
            navButtons.push(
                <button
                    className="btn btn-primary btn-sm mx-2"
                    onClick={() => this.changePage(-1)}>
                    Previous
                </button>
            );
        }

        const syncIconClass = this.state.loading
            ? 'icon fas icon-spinner icon-spin'
            : 'icon fas icon-sync-alt clickable';

        return (
            <div className="d-flex flex-row-reverse">
                <div className="ms-1 ss-padding-top-3">
                    <i
                        className={syncIconClass}
                        onClick={() => this.refresh()}></i>
                </div>
                {navButtons}
                <div className="mx-2 ss-padding-top-3">{message}</div>
            </div>
        );
    };

    getCommentInputField = (fs) => {
        const commentInputClass = this.state.visibleCommentInputs.includes(
            fs.uuid
        )
            ? 'input-group input-group-sm mb-1'
            : 'collapse';

        const commentInputField = this.state.isUserAdmin ? (
            <React.Fragment>
                <a
                    href="#"
                    className="link-underline-hover"
                    onClick={(e) =>
                        this.handleToggleCommentInputField(e, fs.uuid)
                    }>
                    <i className="icon fas icon-plus-circle icon-fw"></i>
                    Add
                </a>
                <div className={commentInputClass}>
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Your comment"
                        onChange={(e) =>
                            this.handleCommentInput(fs, e.target.value)
                        }
                    />
                    <div className="input-group">
                        <div className="input-group-text">
                            <i
                                className="fas icon icon-save clickable"
                                onClick={() => this.addComment(fs)}></i>
                        </div>
                    </div>
                </div>
            </React.Fragment>
        ) : (
            ''
        );

        return (
            <li className="ss-line-height-140">
                Comments: {commentInputField}
            </li>
        );
    };

    handleCommentInput = (fs, comment) => {
        const newComments = JSON.parse(JSON.stringify(this.state.newComments));
        newComments[fs.uuid] = comment;
        this.setState((prevState) => ({
            newComments: newComments,
        }));
    };

    removeComment = (fsUuid, comment) => {
        this.setState((prevState) => ({
            loading: true,
        }));
        const filesets = JSON.parse(JSON.stringify(this.state.fileSets));
        let newCommentsForRelevantFileset = [];
        filesets.forEach((fileset) => {
            if (fileset.uuid === fsUuid) {
                newCommentsForRelevantFileset = fileset.comments ?? [];
                newCommentsForRelevantFileset =
                    newCommentsForRelevantFileset.filter(function (e) {
                        return e !== comment;
                    });
                fileset['comments'] = newCommentsForRelevantFileset;
            }
        });
        this.patchComment(fsUuid, filesets, newCommentsForRelevantFileset);
    };

    addComment = (fs) => {
        this.setState((prevState) => ({
            loading: true,
        }));
        const comment = this.state.newComments[fs.uuid];
        if (!comment) {
            return;
        }
        this.toggleCommentInputField(fs.uuid);
        const filesets = JSON.parse(JSON.stringify(this.state.fileSets));
        let newCommentsForRelevantFileset = [];

        filesets.forEach((fileset) => {
            if (fileset.uuid === fs.uuid) {
                newCommentsForRelevantFileset = fileset.comments ?? [];
                newCommentsForRelevantFileset.unshift(comment);
                fileset['comments'] = newCommentsForRelevantFileset;
            }
        });
        this.patchComment(fs.uuid, filesets, newCommentsForRelevantFileset);
    };

    patchFileset = (fs_uuid, filesets, payload) => {
        ajax.load(
            fs_uuid,
            (resp) => {
                if (resp.status !== 'success') {
                    console.error(resp);
                    return;
                } else {
                    this.setState(
                        (prevState) => ({
                            fileSets: filesets,
                            loading: false,
                        }),
                        function () {
                            this.forceUpdate();
                        }
                    );
                }
            },
            'PATCH',
            fallbackCallback,
            JSON.stringify(payload)
        );
    };

    toggleTag = (fileset, tag) => {
        this.setState(
            (prevState) => ({
                loading: true,
            }),
            function () {
                if (!fileset.tags) {
                    fileset.tags = [tag];
                } else if (fileset.tags.includes(tag)) {
                    const index = fileset.tags.indexOf(tag);
                    fileset.tags.splice(index, 1);
                } else {
                    fileset.tags.push(tag);
                }
                const payload = {
                    tags: fileset.tags ?? null,
                };
                this.patchFileset(fileset.uuid, this.state.fileSets, payload);
            }
        );
    };

    toggleSubmittedFiles = (fileset) => {
        const sfv = [...this.state.submittedFilesVisibility];
        if (sfv.includes(fileset.uuid)) {
            const index = sfv.indexOf(fileset.uuid);
            sfv.splice(index, 1);
        } else {
            sfv.push(fileset.uuid);
        }

        this.setState((prevState) => ({
            submittedFilesVisibility: sfv,
        }));
    };

    patchComment = (fs_uuid, filesets, comments) => {
        const payload = {
            comments: comments,
        };
        this.patchFileset(fs_uuid, filesets, payload);
    };

    toggleFileGroupQc = (fs, reload = false) => {
        if (this.state.modal) {
            this.setState({
                modal: null,
            });
            if (reload) {
                this.refresh();
            }
            return;
        }
        this.setState({
            modal: (
                <FileGroupQCModal
                    closeModal={this.toggleFileGroupQc}
                    fileSet={fs}
                    isUserAdmin={this.state.isUserAdmin}></FileGroupQCModal>
            ),
        });
    };

    getSubmissionTableBody = () => {
        const tbody = this.state.fileSets.map((fs) => {
            const sequencer = fs.sequencing?.sequencer;
            const tissueTypes = fs.tissue_types && fs.tissue_types.length
                ? '(' + fs.tissue_types.join(', ') + ')'
                : null;
            const targetCoverage = getTargetCoverage(fs.sequencing);
            const status_badge_type =
                isReleasedExternally(fs.status) ? 'success' : 'warning';
            const status = createBadge(status_badge_type, fs.status);
            let fs_details = [
                <li className="ss-line-height-140">Status: {status}</li>,
                <li className="ss-line-height-140">
                    Sequencer:{' '}
                    {getLink(sequencer?.uuid, sequencer?.display_title)} (
                    {targetCoverage})
                </li>,
            ];

            fs.libraries?.forEach((lib) => {
                fs_details.push(
                    <li className="ss-line-height-140">
                        Library: {getLink(lib.uuid, lib.display_title)}
                    </li>
                );
                const rin_number = [];
                lib.analytes?.forEach((analyte) => {
                    if (analyte.rna_integrity_number) {
                        rin_number.push(analyte.rna_integrity_number);
                    }
                    analyte.samples?.forEach((sample) => {
                        
                        fs_details.push(
                            <li className="ss-line-height-140">
                                Sample:{' '}
                                {getLink(sample.uuid, sample.display_title)} {tissueTypes}
                            </li>
                        );
                    });
                });
                
                const rin_details =
                    rin_number.length > 0
                        ? `– RIN: ${rin_number.join(', ')}`
                        : '';

                fs_details.push(
                    <li className="ss-line-height-140">
                        Assay: {lib.assay?.display_title} {rin_details}
                    </li>
                );
            });

            fs_details = (
                <small>
                    <ul>
                        {fs_details}
                        {this.getCommentInputField(fs)}
                        {getCommentsList(
                            fs.uuid,
                            fs.comments,
                            this.state.isUserAdmin,
                            this.removeComment
                        )}
                    </ul>
                </small>
            );

            let mwfrs = [];
            fs.meta_workflow_runs?.forEach((mwfr) => {
                if (mwfr.status === 'deleted') {
                    return;
                }
                let badgeType = 'warning';
                if (mwfr.final_status == 'completed') {
                    badgeType = 'success';
                } else if (mwfr.final_status == 'failed') {
                    badgeType = 'danger';
                }
                const mwfr_badge = createBadge(badgeType, mwfr.final_status);

                mwfrs.push(
                    <li className="text-start pb-1">
                        {getLink(
                            mwfr.accession,
                            mwfr.meta_workflow?.display_title
                        )}
                        <object.CopyWrapper
                            value={mwfr.accession}
                            className=""
                            data-tip={'Click to copy accession'}
                            wrapperElement="span"
                            iconProps={{
                                style: { fontSize: '0.875rem', marginLeft: 3 },
                            }}></object.CopyWrapper>
                        <small className="d-block ss-line-height-140">
                            Created: {formatDate(mwfr.date_created)}. Status:{' '}
                            {mwfr_badge}
                        </small>
                    </li>
                );
            });

            mwfrs =
                mwfrs.length == 0 ? (
                    <div>{createWarningIcon()} No workflows have been run</div>
                ) : (
                    <ul className="list-unstyled">{mwfrs}</ul>
                );

            const filesetStatusTags = SUBMISSION_STATUS_TAGS.map((tag) => {
                const badgeType =
                    fs.tags && fs.tags.includes(tag) ? 'info' : 'lighter';

                if (this.state.isUserAdmin) {
                    const cn = 'badge clickable bg-' + badgeType;
                    return (
                        <React.Fragment>
                            <div
                                className={cn}
                                onClick={() => this.toggleTag(fs, tag)}>
                                {tag}
                            </div>
                            <br />
                        </React.Fragment>
                    );
                } else {
                    const cn = 'badge bg-' + badgeType;
                    return (
                        <React.Fragment>
                            <div className={cn}>{tag}</div>
                            <br />
                        </React.Fragment>
                    );
                }
            });

            const submittedFilesQc = getQcResults(fs.submitted_files.qc_infos);
            const submittedFilesQcSummary = getQcResultsSummary(
                fs.submitted_files.qc_infos
            );

            const areSubmittedFilesExpanded =
                this.state.submittedFilesVisibility.includes(fs.uuid);

            const outputFilesQc = getQcResults(fs.output_files.qc_infos, true);

            let unaligned_reads_badge = '';
            const status_unaligned_reads =
                fs.submitted_files.overall_status_unaligned_reads;
            if (status_unaligned_reads === 'archived') {
                const tooltip =
                    fs.submitted_files.num_unaligned_reads_files +
                    ' submitted Unaligned Reads files have been archived';
                unaligned_reads_badge = createBadge(
                    'warning',
                    status_unaligned_reads,
                    tooltip
                );
            } else if (status_unaligned_reads === 'deleted') {
                const tooltip =
                    fs.submitted_files.num_unaligned_reads_files +
                    ' submitted Unaligned Reads files have been deleted';
                unaligned_reads_badge = createBadge(
                    'danger',
                    status_unaligned_reads,
                    tooltip
                );
            }

            return (
                <tr key={fs.accession}>
                    <td
                        className="p-0"
                        data-tip={'File group: ' + fs.file_group_str}
                        style={{
                            backgroundColor: fs.file_group_color,
                            width: '5px',
                        }}></td>
                    <td className="text-start ss-fileset-column">
                        {getLink(fs.accession, fs.display_title)}
                        <object.CopyWrapper
                            value={fs.accession}
                            className=""
                            data-tip={'Click to copy accession'}
                            wrapperElement="span"
                            iconProps={{
                                style: { fontSize: '0.875rem', marginLeft: 3 },
                            }}></object.CopyWrapper>
                        {fs_details}
                    </td>
                    <td>
                        <div className="ss-font-size-10 text-secondary ss-line-height-140">
                            Metadata submission
                        </div>
                        <div>{formatDate(fs.date_created)}</div>
                        <div className="ss-font-size-10 text-secondary ss-line-height-140 mt-1">
                            Data submission
                        </div>
                        {fs.submitted_files.is_upload_complete
                            ? formatDate(fs.submitted_files.date_uploaded)
                            : createBadge('warning', 'in progress')}
                        <small className="d-block ss-line-height-140">
                            {fs.submitted_files.num_submitted_files} files{' '}
                            {unaligned_reads_badge}
                        </small>
                        <small className="d-block ss-line-height-140">
                            {fs.submitted_files.file_formats}
                        </small>
                    </td>
                    <td>
                        <small className="d-block text-secondary ss-line-height-140">
                            Submitted files / QC
                            <span
                                className={
                                    areSubmittedFilesExpanded
                                        ? 'far icon icon-fw icon-minus-square ps-1 clickable'
                                        : 'far icon icon-fw icon-plus-square ps-1 clickable'
                                }
                                onClick={() =>
                                    this.toggleSubmittedFiles(fs)
                                }></span>
                        </small>
                        <small className="ss-line-height-140 mt-1">
                            {areSubmittedFilesExpanded
                                ? submittedFilesQc
                                : submittedFilesQcSummary}
                        </small>

                        <small className="d-block text-secondary ss-line-height-140 mt-1">
                            Processed files / QC
                        </small>
                        <small className="ss-line-height-140 mt-1">
                            {outputFilesQc}
                        </small>

                        <small className="d-block text-secondary ss-line-height-140 mt-2">
                            <div
                                className="ss-link"
                                onClick={() => this.toggleFileGroupQc(fs)}>
                                Review File Group QC
                            </div>
                        </small>
                    </td>
                    <td>
                        <div className="p-1">{mwfrs}</div>
                    </td>
                    <td>{filesetStatusTags}</td>
                </tr>
            );
        });
        return tbody;
    };

    render() {
        if (this.state.initialLoading) {
            return (
                <div className="p-5 text-center">
                    <i className="icon icon-fw fas icon-spinner icon-spin me-1"></i>
                    Loading
                </div>
            );
        }
        let loadingSpinner = '';
        if (this.state.loading) {
            loadingSpinner = (
                <div className="py-2">
                    <i className="icon icon-spin icon-spinner fas me-1"></i>
                    Loading
                </div>
            );
        }

        return (
            <React.Fragment>
                <SubmissionStatusFilter setFilter={this.setFilter} />

                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead className="sticky-top ss-fixed-thead">
                        <tr>
                            <td
                                colSpan={6}
                                className="bg-white border border-white border-bottom-0">
                                <div className="d-flex">
                                    {loadingSpinner}
                                    <div className="ms-auto p-2">
                                        {this.getPageination()}
                                    </div>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th
                                className="text-start ss-fileset-column"
                                colSpan={2}>
                                <div className="d-flex flex-row flex-wrap justify-content-between">
                                    <div className="flex-fill">
                                        File Set
                                        <object.CopyWrapper
                                            value={this.state.fileSets
                                                .map((fs) => fs.accession)
                                                .join(' -f ')}
                                            className=""
                                            data-tip={
                                                'Copy file set accessions for use in magma'
                                            }
                                            wrapperElement="span"
                                            iconProps={{
                                                style: {
                                                    fontSize: '0.875rem',
                                                    marginLeft: 3,
                                                },
                                            }}></object.CopyWrapper>
                                    </div>
                                    <div className="flex-fill">
                                        <input
                                            type="text"
                                            onChange={(e) =>
                                                this.handleSearchByFilesetId(
                                                    e.target.value
                                                )
                                            }
                                            value={this.state.fileSetIdSearch}
                                            className="form-control form-control-sm"
                                            placeholder="Search by FileSet ID or Accession"
                                        />
                                    </div>
                                </div>
                            </th>
                            <th className="text-start">Submission</th>
                            <th className="text-start">
                                QC status
                                <object.CopyWrapper
                                    value={this.state.fileSets
                                        .filter((fs) => fs.final_output_file_accession)
                                        .map((fs) => fs.final_output_file_accession)
                                        .join(' -f ')}
                                    className=""
                                    data-tip={
                                        'Copy accessions of processed files for release'
                                    }
                                    wrapperElement="span"
                                    iconProps={{
                                        style: {
                                            fontSize: '0.875rem',
                                            marginLeft: 3,
                                        },
                                    }}></object.CopyWrapper>
                            </th>
                            <th className="text-start">MetaWorkflowRuns</th>
                            <th className="text-start">
                                Tags{' '}
                                <i
                                    className="icon icon-fw fas icon-info-circle"
                                    data-tip={
                                        '"reviewed": Alignment worklfows have been run and results are technically ok. "ready_to_release": Output files can be released to the portal.'
                                    }></i>
                            </th>
                        </tr>
                    </thead>
                    <tbody>{this.getSubmissionTableBody()}</tbody>
                </table>
                {this.state.modal}
            </React.Fragment>
        );
    }
}

export const SubmissionStatus = React.memo(function SubmissionStatus(props) {
    return <SubmissionStatusComponent {...props} />;
});
