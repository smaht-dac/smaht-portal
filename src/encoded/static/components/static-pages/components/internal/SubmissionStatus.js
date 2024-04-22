'use strict';

import React from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const PAGE_SIZE = 30;

// Status tags
const REVIEWED = 'reviewed';
const STATUS_TAGS = [REVIEWED];

// O2 tags
const DOWNLOAD_SUBMITTED_FILES_COMPLETE = 'submitted_files_copied';
const DOWNLOAD_OUTPUT_FILES_COMPLETE = 'output_files_copied';
const O2_TAGS = [
    DOWNLOAD_SUBMITTED_FILES_COMPLETE,
    DOWNLOAD_OUTPUT_FILES_COMPLETE,
];

const SUBMISSION_STATUS_TAGS = STATUS_TAGS.concat(O2_TAGS);

function formatDate(date_str) {
    if (!date_str) {
        return '';
    }
    const date_options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    };
    const date = new Date(date_str);

    return date.toLocaleDateString('en-US', date_options);
}

function getLink(identifier, title) {
    const href = '/' + identifier;
    return (
        <a href={href} target="_blank">
            {title}
        </a>
    );
}

function createBadge(type, description) {
    const cn = 'badge text-white badge-' + type;
    return <span className={cn}>{description}</span>;
}

function createWarningIcon() {
    return (
        <span className="p-1 text-large text-warning">
            <i className="icon fas icon-exclamation-triangle icon-fw"></i>
        </span>
    );
}

const fallbackCallback = (errResp, xhr) => {
    // Error callback
    console.error(errResp);
};

class SubmissionStatusComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            initialLoading: true,
            loading: false,
            fileSets: [],
            hasError: false,
            tablePage: 0,
            filter: {
                submission_center: 'all_gcc',
                fileset_status: 'in review',
                include_tags: [],
                exclude_tags: [],
            },
            fileSetIdSearch: "",
            numTotalFileSets: 0,
            submission_centers: [],
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

    getSubmissionCenters = () => {
        ajax.load(
            '/search/?type=SubmissionCenter&limit=50',
            (resp) => {
                const res = resp['@graph'];
                const submission_centers = res.map((sc) => {
                    return {
                        title: sc.title,
                    };
                });
                this.setState({
                    submission_centers: submission_centers,
                });
            },
            'GET',
            fallbackCallback
        );
    }

    getData = () => {
        const payload = {
            limit: PAGE_SIZE,
            from: this.state.tablePage * PAGE_SIZE,
            filter: this.state.filter,
            fileSetSearchId: this.state.fileSetIdSearch
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
    }

    componentDidMount() {
        this.getSubmissionCenters();
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
                fileSetIdSearch: "",
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

    getSubmissionCenterSelect() {
        if (this.state.submission_centers == 0) {
            return (
                <React.Fragment>
                    <select className="custom-select" defaultValue="all">
                        <option value="all">All</option>
                    </select>
                </React.Fragment>
            );
        } else {
            const options = [
                <option value="all">All</option>,
                <option value="all_gcc">All GCCs</option>,
            ];
            this.state.submission_centers.forEach((sc) => {
                options.push(<option value={sc.title}>{sc.title}</option>);
            });
            return (
                <React.Fragment>
                    <select
                        className="custom-select"
                        defaultValue="all_gcc"
                        onChange={(e) =>
                            this.setFilter('submission_center', e.target.value)
                        }>
                        {options}
                    </select>
                </React.Fragment>
            );
        }
    }

    getFilesetStatusSelect = () => {
        return (
            <React.Fragment>
                <select
                    className="custom-select"
                    defaultValue="in review"
                    onChange={(e) =>
                        this.setFilter('fileset_status', e.target.value)
                    }>
                    <option value="all">All</option>
                    <option value="in review">In Review</option>
                    <option value="released">
                        Released, Restricted, Public
                    </option>
                </select>
            </React.Fragment>
        );
    };

    getFilesetCreationInput = (filter_name) => {
        return (
            <React.Fragment>
                <input
                    type="date"
                    className="form-control"
                    onChange={(e) =>
                        this.setFilter(filter_name, e.target.value)
                    }
                />
            </React.Fragment>
        );
    };

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

    toggleTagFilter = (type, tag) => {
        this.setState(
            (prevState) => ({
                loading: true,
            }),
            function () {
                const tags = this.state.filter[type];
                if (tags.includes(tag)) {
                    const index = tags.indexOf(tag);
                    tags.splice(index, 1);
                } else {
                    tags.push(tag);
                }
                this.setFilter(type, tags);
            }
        );
    };

    getTagFilter = (type) => {
        return SUBMISSION_STATUS_TAGS.map((tag) => {
            const badgeType = this.state.filter[type].includes(tag)
                ? 'info'
                : 'lighter';
            const cn = 'badge clickable mr-1 badge-' + badgeType;
            return (
                <div
                    className={cn}
                    onClick={() => this.toggleTagFilter(type, tag)}>
                    {tag}
                </div>
            );
        });
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
                <small className="text-muted text-uppercase">Filter</small>
                <div className="d-flex flex-wrap bg-light p-1">
                    <div className="p-2 ss-max-width-250">
                        Submission Center: {this.getSubmissionCenterSelect()}
                    </div>
                    <div className="p-2 ss-max-width-250">
                        FileSet Status: {this.getFilesetStatusSelect()}
                    </div>
                    <div className="p-2 ss-max-width-250">
                        Metadata submitted - From:{' '}
                        {this.getFilesetCreationInput('fileset_created_from')}
                    </div>
                    <div className="p-2 ss-max-width-250">
                        Metadata submitted - To:{' '}
                        {this.getFilesetCreationInput('fileset_created_to')}
                    </div>
                    <div className="p-2">
                        <div>FileSet inlcudes Tags:</div>
                        {this.getTagFilter('include_tags')}
                    </div>
                    <div className="p-2">
                        <div>FileSet excludes Tags:</div>
                        {this.getTagFilter('exclude_tags')}
                    </div>
                </div>

                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead className="sticky-top ss-top-40">
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
                            <th className="text-left ss-fileset-column">
                                <div className="d-flex flex-row flex-wrap justify-content-between">
                                    <div className='flex-fill'>File Set</div>
                                    <div className='flex-fill'>
                                        <input
                                            type="text"
                                            onChange={(e) =>
                                                this.handleSearchByFilesetId(e.target.value)
                                            }
                                            value={this.state.fileSetIdSearch}
                                            class="form-control form-control-sm"
                                            placeholder="Search by FileSet ID or Accession"
                                        />
                                    </div>
                                </div>
                            </th>
                            <th className="text-left">Submission</th>
                            <th className="text-left">O2 status</th>
                            <th className="text-left">MetaWorkflowRuns</th>
                            <th className="text-left">Tags</th>
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
