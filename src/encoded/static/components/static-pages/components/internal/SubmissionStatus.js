'use strict';

import React from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const PAGE_SIZE = 30;

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
            },
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

    getSubmissionCenters() {
        ajax.load(
            '/search/?type=SubmissionCenter',
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

    getData() {
        const payload = {
            limit: PAGE_SIZE,
            from: this.state.tablePage * PAGE_SIZE,
            filter: this.state.filter,
        };

        ajax.load(
            '/get_submission_status/',
            (resp) => {
                if(resp.error){
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
                tablePage: 0,
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
                    <option value="released">Released, Restricted, Public</option>
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

        return (
            <div className="d-flex flex-row-reverse">
                {navButtons}
                <div className="pt-1 mx-2 ">{message}</div>
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

    patchComment = (fs_uuid, filesets, comments) => {
        const payload = {
            comments: comments,
        };

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
            let fs_details = [
                <li className="ss-line-height-140">
                    Sequencer:{' '}
                    {getLink(sequencer?.uuid, sequencer?.display_title)}
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
                let badgeType = 'warning';
                if (mwfr.final_status == 'completed') {
                    badgeType = 'success';
                } else if (mwfr.final_status == 'failed') {
                    badgeType = 'error';
                }
                const mwfr_badge = createBadge(badgeType, mwfr.final_status);

                mwfrs.push(
                    <li className="text-left pt-1">
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
                    <ul>{mwfrs}</ul>
                );
            const status_badge_type =
                fs.status == 'released' ? 'success' : 'warning';
            const status = createBadge(status_badge_type, fs.status);

            return (
                <tr key={fs.accession}>
                    <td className="text-left">
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
                    <td>{status}</td>
                    <td>{formatDate(fs.date_created)}</td>
                    <td>
                        {fs.submitted_files.is_upload_complete
                            ? formatDate(fs.submitted_files.date_uploaded)
                            : createBadge('warning', 'in progress')}
                        <div className="mt-1">
                            {fs.submitted_files.num_submitted_files} files
                        </div>
                        <small>{fs.submitted_files.file_formats}</small>
                    </td>
                    <td>
                        {fs.submitted_files.num_files_copied_to_o2 ==
                        fs.submitted_files.num_submitted_files
                            ? ''
                            : createWarningIcon()}
                        {fs.submitted_files.num_files_copied_to_o2} /{' '}
                        {fs.submitted_files.num_submitted_files} files
                    </td>
                    <td >{mwfrs}</td>
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
                <span>
                    <i className="icon icon-fw fas icon-spinner icon-spin mt-1 mr-1"></i>
                </span>
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
                    <div className="ml-auto p-2 h3">{loadingSpinner}</div>
                </div>
                <div className="d-flex">
                    <div className="ml-auto p-2">{this.getPageination()}</div>
                </div>
                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead className='sticky-top ss-top-40'>
                        <tr>
                            <th className="text-left">File Set</th>
                            <th className="text-left">Status</th>
                            <th className="text-left">
                                Metatdata
                                <br />
                                Submission
                            </th>
                            <th className="text-left">
                                Data
                                <br />
                                Submission
                            </th>
                            <th className="text-left">Copied to O2</th>
                            <th className="text-left">MetaWorkflowRuns</th>
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
