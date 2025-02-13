'use strict';

import React from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { fallbackCallback } from './submissionStatusUtils';

import {
    SUBMISSION_STATUS_TAGS,
    DEFAULT_FILTER,
} from './submissionStatusConfig';

const DEFAULT_SELECT = (
    <React.Fragment>
        <select className="form-select" defaultValue="all">
            <option value="all">All</option>
        </select>
    </React.Fragment>
);

class SubmissionStatusFilterComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            submission_centers: [],
            filter: DEFAULT_FILTER,
            assays: [],
            sequencers: [],
            cell_culture_mixtures_and_tissues: [],
            cell_lines: [],
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
                items.sort((a, b) => {
                    return a.title < b.title ? -1 : 1;
                });
                this.setState({
                    [state_variable]: items,
                });
            },
            'GET',
            fallbackCallback
        );
    };

    // Does not includes tissues for now
    getSampleSourceCodes = (type, state_variable) => {
        ajax.load(
            `/search/?code%21=No+value&type=${type}&limit=300`,
            (resp) => {
                const res = resp['@graph'];
                const items = res.map((item) => {
                    return {
                        title: item.display_title,
                        code: item.code,
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
        this.getSampleSourceCodes('SampleSource', 'cell_culture_mixtures_and_tissues');
        this.getSampleSourceCodes('CellLine', 'cell_lines');
    }

    setFilter = (filterName, selection) => {
        const filter = JSON.parse(JSON.stringify(this.state.filter));
        filter[filterName] = selection;
        this.props.setFilter(filterName, selection);
        this.setState((prevState) => ({
            filter: filter,
        }));
    };

    getSelect = (options, defaultValue, filterName) => {
        return (
            <React.Fragment>
                <select
                    className="form-select"
                    defaultValue={defaultValue}
                    onChange={(e) =>
                        this.setFilter(filterName, e.target.value)
                    }>
                    {options}
                </select>
            </React.Fragment>
        );
    };

    getSubmissionCenterSelect = () => {
        
        const options = [ 
            <option value="all">All</option>,
            <option value="all_gcc">All GCCs</option>
        ];
        const options_gcc = [];
        const options_other = []

        this.state.submission_centers.forEach((sc) => {
            const op = <option value={sc.title}>{sc.title}</option>;
            if(sc.title.includes("GCC")){
                options_gcc.push(op);
            }else{
                options_other.push(op);
            }
        });
        if(options_gcc.length > 0){
            options.push(<optgroup label="GCCs">{options_gcc}</optgroup>);
        }
        if(options_other.length > 0){
            options.push(<optgroup label="Other">{options_other}</optgroup>);
        }
        const defaultValue = 'all_gcc';
        const filterName = 'submission_center';
        return this.getSelect(options, defaultValue, filterName);
    };

    getFilesetStatusSelect = () => {
        const options = [
            <option value="all">All</option>,
            <option value="in review">In Review</option>,
            <option value="released">Released, Restricted, Public</option>,
        ];
        const defaultValue = 'in review';
        const filterName = 'fileset_status';
        return this.getSelect(options, defaultValue, filterName);
    };

    getAssaySelect() {
        if (this.state.assays == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.assays.forEach((sc) => {
            options.push(<option value={sc.title}>{sc.title}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'assay';
        return this.getSelect(options, defaultValue, filterName);
    }

    getSequencerSelect() {
        if (this.state.sequencers == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.sequencers.forEach((sc) => {
            options.push(<option value={sc.title}>{sc.title}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'sequencer';
        return this.getSelect(options, defaultValue, filterName);
    }

    getCellCultureMixtureAndTissueSelect() {
        if (this.state.cell_culture_mixtures_and_tissues == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.cell_culture_mixtures_and_tissues.forEach((sc) => {
            options.push(<option value={sc.code}>{sc.code}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'cell_culture_mixtures_and_tissues';
        return this.getSelect(options, defaultValue, filterName);
    }

    getCellLineSelect() {
        if (this.state.cell_lines == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.cell_lines.forEach((sc) => {
            options.push(<option value={sc.code}>{sc.code}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'cell_line';
        return this.getSelect(options, defaultValue, filterName);
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
            const cn = 'badge clickable me-1 bg-' + badgeType;
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
                                Cell Line: {this.getCellLineSelect()}
                            </div>
                            <div className="p-2">
                                Cell Culture Mixture / Tissue:{this.getCellCultureMixtureAndTissueSelect()}
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
                                <div>FileSet includes Tags:</div>
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
