'use strict';

import React from 'react';
import {
    JWT,
    ajax,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    fallbackCallback,
    formatDate,
    getLink,
    createBadge,
    getStatusBadgeType,
    createWarningIcon,
    getCommentsList,
    getCommentInputField,
    getPagination,
    copyBtn,
} from './utils';

import {
    PAGE_SIZE,
    ANALYSIS_RUN_TAGS,
    ANALYSIS_RUN_DEFAULT_FILTER,
} from './config';

import { AnalysisRunFilter } from './AnalsysiRunFilter';

class AnalysisRunsComponent extends React.PureComponent {
    constructor(props) {
        super(props);

        const userDetails = JWT.getUserInfo();

        this.state = {
            initialLoading: true,
            loading: false,
            analysisRuns: [],
            hasError: false,
            tablePage: 0,
            filter: ANALYSIS_RUN_DEFAULT_FILTER,
            analysisRunSearchId: '',
            numTotalAnalysisRuns: 0,
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

    toggleCommentInputField = (ar_uuid) => {
        let newVisibleInputs = this.state.visibleCommentInputs;
        if (newVisibleInputs.includes(ar_uuid)) {
            const i = newVisibleInputs.indexOf(ar_uuid);
            newVisibleInputs.splice(i, 1);
        } else {
            newVisibleInputs.push(ar_uuid);
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

    handleToggleCommentInputField = (e, ar_uuid) => {
        e.preventDefault();
        this.toggleCommentInputField(ar_uuid);
    };

    getData = () => {
        const payload = {
            limit: PAGE_SIZE,
            from: this.state.tablePage * PAGE_SIZE,
            filter: this.state.filter,
            analysisRunSearchId: this.state.analysisRunSearchId,
        };

        ajax.load(
            '/get_analysis_runs/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                this.setState({
                    initialLoading: false,
                    loading: false,
                    analysisRuns: resp.analysis_runs,
                    numTotalAnalysisRuns: resp.total_analysis_runs,
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

    applyFilter = (filter) => {
        this.setState(
            (prevState) => ({
                filter: filter,
                analysisRunSearchId: '',
                tablePage: 0,
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    };

    handleSearchById = (id) => {
        this.setState(
            (prevState) => ({
                analysisRunSearchId: id,
                tablePage: 0,
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    };

    refresh = () => {
        this.setState(
            (prevState) => ({
                loading: true,
            }),
            function () {
                this.getData();
            }
        );
    };

    handleCommentInput = (ar, comment) => {
        const newComments = JSON.parse(JSON.stringify(this.state.newComments));
        newComments[ar.uuid] = comment;
        this.setState((prevState) => ({
            newComments: newComments,
        }));
    };

    removeComment = (arUuid, comment) => {
        this.setState((prevState) => ({
            loading: true,
        }));
        const analysisRuns = JSON.parse(
            JSON.stringify(this.state.analysisRuns)
        );
        let newComments = [];
        analysisRuns.forEach((fileset) => {
            if (fileset.uuid === arUuid) {
                newComments = fileset.comments ?? [];
                newComments = newComments.filter(function (e) {
                    return e !== comment;
                });
                fileset['comments'] = newComments;
            }
        });
        this.patchAnalysisRun(arUuid, analysisRuns, {
            comments: newComments,
        });
    };

    addComment = (ar) => {
        this.setState((prevState) => ({
            loading: true,
        }));
        const comment = this.state.newComments[ar.uuid];
        if (!comment) {
            return;
        }
        this.toggleCommentInputField(ar.uuid);
        const analysisRuns = JSON.parse(
            JSON.stringify(this.state.analysisRuns)
        );
        let newComments = [];

        analysisRuns.forEach((analysisRun) => {
            if (analysisRun.uuid === ar.uuid) {
                newComments = analysisRun.comments ?? [];
                newComments.unshift(comment);
                analysisRun['comments'] = newComments;
            }
        });
        this.patchAnalysisRun(ar.uuid, analysisRuns, {
            comments: newComments,
        });
    };

    patchAnalysisRun = (ar_uuid, analysisRuns, payload) => {
        ajax.load(
            ar_uuid,
            (resp) => {
                if (resp.status !== 'success') {
                    console.error(resp);
                    return;
                } else {
                    this.setState(
                        (prevState) => ({
                            analysisRuns: analysisRuns,
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
        if (!fileset.tags) {
            fileset.tags = [tag];
        } else if (fileset.tags.includes(tag)) {
            fileset.tags = fileset.tags.filter((t) => t !== tag);
        } else {
            fileset.tags.push(tag);
        }
        this.setState({ loading: true });
        this.patchAnalysisRun(fileset.uuid, this.state.analysisRuns, { tags: fileset.tags });
    };

    getAnalysisRunTableBody = () => {
        const tbody = this.state.analysisRuns.map((ar) => {
            const tissues = [...new Map(ar.tissues?.map((t) => [t.tissue_type, t]) ?? []).values()]
                .sort((a, b) => a.tissue_type.localeCompare(b.tissue_type));
            const donors = [...new Map(ar.donors?.map((d) => [d.accession, d]) ?? []).values()]
                .sort((a, b) => a.display_title.localeCompare(b.display_title));
            
            let details = [
                <li className="ss-line-height-140">Type: {ar.analysis_type}</li>
            ];
            if (donors.length > 0) {
                const donorDetails  = [];
                donors.forEach((d) => {
                    const link = getLink(d.accession, d.display_title);
                    donorDetails.push(<span>{link}{copyBtn(d.accession, '0.65rem')}</span>);
                });
                details.push(
                    <li className="ss-line-height-140">Donors: {donorDetails}</li>
                );
            }
            if (tissues.length > 0) {
                const tissueDetails  = [];
                tissues.forEach((d) => {
                    const link = getLink(d.accession, d.tissue_type);
                    tissueDetails.push(<span>{link}{copyBtn(d.accession, '0.65rem')}</span>);
                });
                details.push(
                    <li className="ss-line-height-140">
                        Tissues: {tissueDetails}
                    </li>
                );
            }
            
            const commentHandlers = {
                handleToggleCommentInputField:
                    this.handleToggleCommentInputField,
                handleCommentInput: this.handleCommentInput,
                addComment: this.addComment,
            };

            details = (
                <small>
                    <ul>
                        {details}
                        {getCommentInputField(
                            ar,
                            this.state.isUserAdmin,
                            this.state.visibleCommentInputs,
                            commentHandlers
                        )}
                        {getCommentsList(
                            ar.uuid,
                            ar.comments,
                            this.state.isUserAdmin,
                            this.removeComment
                        )}
                    </ul>
                </small>
            );

            let mwfrs = [];
            ar.meta_workflow_runs?.forEach((mwfr) => {
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
                        {copyBtn(mwfr.accession)}
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

            const analysisRunTags = ANALYSIS_RUN_TAGS.map((tag) => {
                const badgeType =
                    ar.tags && ar.tags.includes(tag) ? 'info' : 'lighter';

                if (this.state.isUserAdmin) {
                    const cn = 'badge clickable bg-' + badgeType;
                    return (
                        <React.Fragment>
                            <div
                                className={cn}
                                onClick={() => this.toggleTag(ar, tag)}>
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

            let final_outputs = [];
            ar.final_outputs?.forEach((fo) => {
                const badgeType = getStatusBadgeType(fo.status);
                const fo_badge = createBadge(badgeType, fo.status);
                final_outputs.push(
                    <li className="text-start pb-1">
                         <a href={fo.accession} target="_blank" data-tip={fo.display_title}>
                            {fo.accession}
                        </a>
                        {copyBtn(fo.accession)}
                        <small className='d-block ss-line-height-140'>Status: {fo_badge}</small>
                        
                    </li>
                );
            });
            final_outputs = final_outputs.length === 0 ? "-" : final_outputs;
            final_outputs = <ul className="list-unstyled">{final_outputs}</ul>;

            return (
                <tr key={ar.accession}>
                    <td className="text-start ss-fileset-column">
                        {getLink(ar.accession, ar.description || ar.analysis_type)}
                        {copyBtn(ar.accession)}
                        {details}
                    </td>
                    <td>
                        <div className="p-1">{final_outputs}</div>
                    </td>
                    <td>
                        <div className="p-1">{mwfrs}</div>
                    </td>
                    <td>{analysisRunTags}</td>
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
                <AnalysisRunFilter setFilter={this.setFilter} />

                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead className="sticky-top ss-fixed-thead">
                        <tr>
                            <td
                                colSpan={4}
                                className="bg-white border border-white border-bottom-0">
                                <div className="d-flex">
                                    {loadingSpinner}
                                    <div className="ms-auto p-2">
                                        {getPagination(
                                            'AnalysisRun',
                                            this.state,
                                            this.state.numTotalAnalysisRuns,
                                            this.changePage,
                                            this.refresh
                                        )}
                                    </div>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th
                                className="text-start ss-fileset-column"
                                colSpan={1}>
                                <div className="d-flex flex-row flex-wrap justify-content-between">
                                    <div className="flex-fill">
                                        Analysis Run
                                    </div>
                                    <div className="flex-fill">
                                        <input
                                            type="text"
                                            onChange={(e) =>
                                                this.handleSearchById(
                                                    e.target.value
                                                )
                                            }
                                            value={
                                                this.state.analysisRunSearchId
                                            }
                                            className="form-control form-control-sm"
                                            placeholder="Search by accession"
                                        />
                                    </div>
                                </div>
                            </th>
                            <th className="text-start">Final Outputs</th>
                            <th className="text-start">MetaWorkflowRuns</th>
                            <th className="text-start">Tags</th>
                        </tr>
                    </thead>
                    <tbody>{this.getAnalysisRunTableBody()}</tbody>
                </table>
                {this.state.modal}
            </React.Fragment>
        );
    }
}

export const AnalysisRuns = React.memo(function AnalysisRuns(props) {
    return <AnalysisRunsComponent {...props} />;
});
