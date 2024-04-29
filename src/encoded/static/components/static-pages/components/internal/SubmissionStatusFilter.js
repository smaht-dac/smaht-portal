'use strict';

import React from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { fallbackCallback } from './submissionStatusUtils';

import {
    SUBMISSION_STATUS_TAGS,
    DEFAULT_FILTER,
} from './submissionStatusConfig';

class SubmissionStatusFilterComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            submission_centers: [],
            filter: DEFAULT_FILTER,
            assays: [],
            sequencers: [],
        };
    }

    getItemsFromPortal = (type, state_variable) => {
        ajax.load(
            `/search/?type=${type}&limit=100`,
            (resp) => {
                const res = resp['@graph'];
                const items = res.map((item) => {
                    return {
                        title: item.display_title,
                    };
                });
                this.setState({
                    [state_variable]: items,
                });
            },
            'GET',
            fallbackCallback
        );
    };

    componentDidMount() {
        this.getItemsFromPortal('SubmissionCenter', 'submission_centers');
        this.getItemsFromPortal('Assay', 'assays');
        this.getItemsFromPortal('Sequencer', 'sequencers');
    }

    setFilter = (filterName, selection) => {
        const filter = JSON.parse(JSON.stringify(this.state.filter));
        filter[filterName] = selection;
        this.props.setFilter(filterName, selection);
        this.setState((prevState) => ({
            filter: filter,
        }));
    };

    getSubmissionCenterSelect = () => {
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
    };

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

    getAssaySelect() {
        if (this.state.assays == 0) {
            return (
                <React.Fragment>
                    <select className="custom-select" defaultValue="all">
                        <option value="all">All</option>
                    </select>
                </React.Fragment>
            );
        } else {
            const options = [<option value="all">All</option>];
            this.state.assays.forEach((sc) => {
                options.push(<option value={sc.title}>{sc.title}</option>);
            });
            return (
                <React.Fragment>
                    <select
                        className="custom-select"
                        defaultValue="all"
                        onChange={(e) =>
                            this.setFilter('assay', e.target.value)
                        }>
                        {options}
                    </select>
                </React.Fragment>
            );
        }
    }

    getSequencerSelect() {
        if (this.state.sequencers == 0) {
            return (
                <React.Fragment>
                    <select className="custom-select" defaultValue="all">
                        <option value="all">All</option>
                    </select>
                </React.Fragment>
            );
        } else {
            const options = [<option value="all">All</option>];
            this.state.sequencers.forEach((sc) => {
                options.push(<option value={sc.title}>{sc.title}</option>);
            });
            return (
                <React.Fragment>
                    <select
                        className="custom-select"
                        defaultValue="all"
                        onChange={(e) =>
                            this.setFilter('sequencer', e.target.value)
                        }>
                        {options}
                    </select>
                </React.Fragment>
            );
        }
    }

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

    toggleTagFilter = (type, tag) => {
        const tags = this.state.filter[type];
        if (tags.includes(tag)) {
            const index = tags.indexOf(tag);
            tags.splice(index, 1);
        } else {
            tags.push(tag);
        }
        this.setFilter(type, tags);
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

    render() {
        return (
            <React.Fragment>
                <small className="text-muted text-uppercase">Filter</small>
                <div className="bg-light p-1">
                    <div className="row">
                        <div className="col-lg-3">
                            <div className="p-2">
                                Submission Center:{' '}
                                {this.getSubmissionCenterSelect()}
                            </div>
                            <div className="p-2">
                                FileSet Status: {this.getFilesetStatusSelect()}
                            </div>
                        </div>
                        <div className="col-lg-3">
                            <div className="p-2">
                                Assay: {this.getAssaySelect()}
                            </div>
                            <div className="p-2">
                                Sequencer: {this.getSequencerSelect()}
                            </div>
                        </div>
                        <div className="col-lg-3">
                            <div className="p-2">
                                Metadata submitted - From:{' '}
                                {this.getFilesetCreationInput(
                                    'fileset_created_from'
                                )}
                            </div>
                            <div className="p-2">
                                Metadata submitted - To:{' '}
                                {this.getFilesetCreationInput(
                                    'fileset_created_to'
                                )}
                            </div>
                        </div>
                        <div className="col-md-6">
                            <div className="p-2">
                                <div>FileSet inlcudes Tags:</div>
                                {this.getTagFilter('include_tags')}
                            </div>
                        </div>
                        <div className="col-md-6">
                            <div className="p-2">
                                <div>FileSet excludes Tags:</div>
                                {this.getTagFilter('exclude_tags')}
                            </div>
                        </div>
                    </div>
                </div>
            </React.Fragment>
        );
    }
}

export const SubmissionStatusFilter = React.memo(
    function SubmissionStatusFilter(props) {
        return <SubmissionStatusFilterComponent {...props} />;
    }
);
