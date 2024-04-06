'use strict';

import React from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const PAGE_SIZE = 5;

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

function createBadge(type, description) {
    const cn = 'badge text-white badge-' + type;
    return <span className={cn}>{description}</span>;
}

const fallbackCallback = (errResp, xhr) => {
    // Error callback
    this.setState({
        hasError: true,
    });
    console.warn(errResp);
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
            filter: {},
            numTotalFileSets: 0,
            submission_centers: [],
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
                this.setState({
                    initialLoading: false,
                    loading: false,
                    fileSets: resp.file_sets,
                    numTotalFileSets: resp.total_filesets,
                });
                //console.log(resp.file_sets);
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
            const options = [<option value="all">All</option>];
            this.state.submission_centers.forEach((sc) => {
                options.push(<option value={sc.title}>{sc.title}</option>);
            });
            return (
                <React.Fragment>
                    <select
                        className="custom-select"
                        defaultValue="all"
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
                    defaultValue="all"
                    onChange={(e) =>
                        this.setFilter('fileset_status', e.target.value)
                    }>
                    <option value="all">All</option>
                    <option value="in review">In Review</option>
                    <option value="released">Released</option>
                </select>
            </React.Fragment>
        );
    };

    getFilesetCreationFrom = () => {
        return (
            <React.Fragment>
                <input
                    type="date"
                    className="form-control"
                    onChange={(e) =>
                        this.setFilter('fileset_created_from', e.target.value)
                    }
                />
            </React.Fragment>
        );
    };

    getFilesetCreationTo = () => {
        return (
            <React.Fragment>
                <input
                    type="date"
                    className="form-control"
                    onChange={(e) =>
                        this.setFilter('fileset_created_to', e.target.value)
                    }
                />
            </React.Fragment>
        );
    };

    getLink = (identifier, title) => {
        const href = '/' + identifier;
        return (
            <a href={href} target="_blank">
                {title}
            </a>
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

    getSubmissionTableBody = () => {
        const tbody = this.state.fileSets.map((fs) => {
            const submission_centers = fs.submission_centers.map((sc) => {
                return <div>{sc}</div>;
            });

            let seq_lib_assay = [
                <li className="line-height-140">
                    Sequencing:{' '}
                    {this.getLink(
                        fs.sequencing.uuid,
                        fs.sequencing.display_title
                    )}
                </li>,
            ];

            fs.libraries.forEach((lib) => {
                seq_lib_assay.push(
                    <li className="line-height-140">
                        Library: {this.getLink(lib.uuid, lib.display_title)}
                    </li>
                );
                seq_lib_assay.push(
                    <li className="line-height-140">
                        Assay: {lib.assay_display_title}
                    </li>
                );
            });
            seq_lib_assay = (
                <small>
                    <ul>{seq_lib_assay}</ul>
                </small>
            );

            let mwfrs = [];
            fs.meta_workflow_runs.forEach((mwfr) => {
                let badgeType = 'warning';
                if (mwfr.final_status == 'completed') {
                    badgeType = 'success';
                } else if (mwfr.final_status == 'failed') {
                    badgeType = 'error';
                }
                const mwfr_badge = createBadge(badgeType, mwfr.final_status);

                mwfrs.push(
                    <li className="text-left">
                        {this.getLink(
                            mwfr.accession,
                            mwfr.meta_workflow_display_title
                        )}
                        <br />
                        <small className="line-height-140">
                            Created: {formatDate(mwfr.date_created)}. Status:{' '}
                            {mwfr_badge}
                        </small>
                    </li>
                );
            });
            const mwfr_bg = mwfrs.length == 0 ? 'ss-bg-warning-light' : '';
            mwfrs = <ul>{mwfrs}</ul>;
            const status_badge_type =
                fs.status == 'released' ? 'success' : 'warning';
            const status = createBadge(status_badge_type, fs.status);

            return (
                <tr key={fs.accession}>
                    <td className="text-left">
                        {this.getLink(fs.accession, fs.display_title)}
                        {seq_lib_assay}
                    </td>
                    <td>{status}</td>
                    <td className="">{formatDate(fs.date_created)}</td>
                    <td
                        className={
                            fs.submitted_files.is_upload_complete
                                ? ''
                                : 'ss-bg-warning-light'
                        }>
                        {fs.submitted_files.is_upload_complete
                            ? formatDate(fs.submitted_files.date_uploaded)
                            : 'In Progress'}
                        <br />({fs.submitted_files.num_submitted_files} files)
                    </td>
                    <td
                        className={
                            fs.submitted_files.num_files_copied_to_o2 ==
                            fs.submitted_files.num_submitted_files
                                ? ''
                                : 'ss-bg-warning-light'
                        }>
                        {fs.submitted_files.num_files_copied_to_o2} /{' '}
                        {fs.submitted_files.num_submitted_files} files
                    </td>
                    <td className={mwfr_bg}>{mwfrs}</td>
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
                <div className="d-flex bg-light p-1">
                    <div className="p-2">
                        Submission Center: {this.getSubmissionCenterSelect()}
                    </div>
                    <div className="p-2">
                        FileSet Status: {this.getFilesetStatusSelect()}
                    </div>
                    <div className="p-2">
                        Metadata submitted - From:{' '}
                        {this.getFilesetCreationFrom()}
                    </div>
                    <div className="p-2">
                        Metadata submitted - To: {this.getFilesetCreationTo()}
                    </div>
                    <div className="ml-auto p-2 h3">{loadingSpinner}</div>
                </div>
                <div className="d-flex">
                    <div className="ml-auto p-2">{this.getPageination()}</div>
                </div>
                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead>
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
