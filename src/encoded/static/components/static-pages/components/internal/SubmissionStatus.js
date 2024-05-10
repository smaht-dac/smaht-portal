'use strict';

import React from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    fallbackCallback,
    formatDate,
    getLink,
    createBadge,
    createWarningIcon,
} from './submissionStatusUtils';

import {
    PAGE_SIZE,
    SUBMISSION_STATUS_TAGS,
    DEFAULT_FILTER,
} from './submissionStatusConfig';

import { SubmissionStatusFilter } from './SubmissionStatusFilter';

class SubmissionStatusComponent extends React.PureComponent {
    constructor(props) {
        super(props);
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
            comments: {},
            newComments: {},
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
                <div className="ml-1 ss-padding-top-3">
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

        return (
            <li className="ss-line-height-140">
                Comments:{' '}
                <a
                    href="#"
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
                    <div className="input-group-append">
                        <div className="input-group-text">
                            <i
                                className="fas icon icon-save clickable"
                                onClick={() => this.addComment(fs)}></i>
                        </div>
                    </div>
                </div>
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

    removeComment = (fs, comment) => {
        this.setState((prevState) => ({
            loading: true,
        }));
        const filesets = JSON.parse(JSON.stringify(this.state.fileSets));
        let newCommentsForRelevantFileset = [];
        filesets.forEach((fileset) => {
            if (fileset.uuid === fs.uuid) {
                newCommentsForRelevantFileset = fileset.comments ?? [];
                newCommentsForRelevantFileset =
                    newCommentsForRelevantFileset.filter(function (e) {
                        return e !== comment;
                    });
                fileset['comments'] = newCommentsForRelevantFileset;
            }
        });
        this.patchComment(fs.uuid, filesets, newCommentsForRelevantFileset);
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

    patchComment = (fs_uuid, filesets, comments) => {
        const payload = {
            comments: comments,
        };
        this.patchFileset(fs_uuid, filesets, payload);
    };

    getComments = (fs) => {
        const fs_comments = fs.comments;
        if (!fs_comments) {
            return;
        }
        const comments = [];
        fs_comments.forEach((c) => {
            comments.push(
                <li className="ss-line-height-140">
                    <strong>{c}</strong>
                    <span
                        className="far icon icon-fw icon-trash-alt text-muted pl-1 clickable"
                        onClick={() => this.removeComment(fs, c)}></span>
                </li>
            );
        });

        return <ul>{comments}</ul>;
    };

    getSubmissionTableBody = () => {
        const tbody = this.state.fileSets.map((fs) => {
            const sequencer = fs.sequencing?.sequencer;
            const targeCoverage = fs.sequencing?.target_coverage || 'NA';
            const status_badge_type =
                fs.status == 'released' ? 'success' : 'warning';
            const status = createBadge(status_badge_type, fs.status);
            let fs_details = [
                <li className="ss-line-height-140">Status: {status}</li>,
                <li className="ss-line-height-140">
                    Sequencer:{' '}
                    {getLink(sequencer?.uuid, sequencer?.display_title)} (Target
                    coverage: {targeCoverage}x)
                </li>,
            ];

            fs.libraries?.forEach((lib) => {
                fs_details.push(
                    <li className="ss-line-height-140">
                        Library: {getLink(lib.uuid, lib.display_title)}
                    </li>
                );
                lib.analyte?.samples?.forEach((sample) => {
                    fs_details.push(
                        <li className="ss-line-height-140">
                            Sample: {getLink(sample.uuid, sample.display_title)}
                        </li>
                    );
                });
                fs_details.push(
                    <li className="ss-line-height-140">
                        Assay: {lib.assay?.display_title}
                    </li>
                );
            });

            fs_details = (
                <small>
                    <ul>
                        {fs_details}
                        {this.getCommentInputField(fs)}
                        {this.getComments(fs)}
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
                    <li className="text-left pb-1">
                        {getLink(
                            mwfr.accession,
                            mwfr.meta_workflow?.display_title
                        )}
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
                const cn = 'badge clickable badge-' + badgeType;
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
            });

            return (
                <tr key={fs.accession}>
                    <td
                        className="p-0"
                        data-tip={
                            'File group: ' + fs.file_group
                        }
                        style={{
                            backgroundColor: fs.file_group_color,
                            width: '5px',
                        }}></td>
                    <td className="text-left ss-fileset-column">
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
                            {fs.submitted_files.num_submitted_files} files
                        </small>
                        <small className="d-block ss-line-height-140">
                            {fs.submitted_files.file_formats}
                        </small>
                    </td>
                    <td>
                        <div className="ss-line-height-140">
                            {fs.submitted_files.num_files_copied_to_o2 ==
                            fs.submitted_files.num_fileset_files
                                ? ''
                                : createWarningIcon()}
                            {fs.submitted_files.num_files_copied_to_o2} /{' '}
                            {fs.submitted_files.num_fileset_files} files
                        </div>

                        <div className="ss-line-height-140 small">
                            have O2 path set
                        </div>
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
                    <i className="icon icon-fw fas icon-spinner icon-spin mr-1"></i>
                    Loading
                </div>
            );
        }
        let loadingSpinner = '';
        if (this.state.loading) {
            loadingSpinner = (
                <div className="py-2">
                    <i className="icon icon-spin icon-spinner fas mr-1"></i>
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
                                    <div className="ml-auto p-2">
                                        {this.getPageination()}
                                    </div>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th
                                className="text-left ss-fileset-column"
                                colSpan={2}>
                                <div className="d-flex flex-row flex-wrap justify-content-between">
                                    <div className="flex-fill">File Set</div>
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
                            <th className="text-left">Submission</th>
                            <th className="text-left">O2 status</th>
                            <th className="text-left">MetaWorkflowRuns</th>
                            <th className="text-left">
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
            </React.Fragment>
        );
    }
}

export const SubmissionStatus = React.memo(function SubmissionStatus(props) {
    return <SubmissionStatusComponent {...props} />;
});
