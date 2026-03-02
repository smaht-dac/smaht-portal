'use strict';

import React from 'react';
import { DEFAULT_SELECT, getItemsFromPortal, getSelect } from './utils';

import {
    ANALYSIS_RUN_TAGS,
    ANALYSIS_RUN_DEFAULT_FILTER,
    PRIMARY_PRODUCTION_TISSUES,
    ANALYSIS_TYPES
} from './config';

class AnalysisRunFilterComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            filter: ANALYSIS_RUN_DEFAULT_FILTER,
            analysisTypes: [],
            donors: [],
            tissues: [],
        };
    }

    getAnalysisTypes = () => {
        const items = [];
        ANALYSIS_TYPES.forEach((type) => {
            items.push({
                title: type,
                code: type,
            });
        });
        this.setState({
            analysisTypes: items,
        });
    };

    getTissues = () => {
        const items = [];
        PRIMARY_PRODUCTION_TISSUES.forEach((tissue) => {
            items.push({
                title: tissue,
                code: tissue,
            });
        });
        this.setState({
            tissues: items,
        });
    };

    componentDidMount() {
        getItemsFromPortal(
            'Donor',
            '&submission_centers.display_title=NDRI+TPC',
            200,
            (items) => {
                this.setState({ donors: items });
            }
        );
        this.getTissues();
        this.getAnalysisTypes();
    }

    setFilter = (filterName, selection) => {
        const filter = JSON.parse(JSON.stringify(this.state.filter));
        filter[filterName] = selection;
        this.props.setFilter(filterName, selection);
        this.setState((prevState) => ({
            filter: filter,
        }));
    };

    getDonorSelect() {
        if (this.state.donors == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.donors.forEach((d) => {
            options.push(<option value={d.title}>{d.title}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'donor';
        return getSelect(options, defaultValue, filterName, this.setFilter);
    }

    getTissueSelect() {
        if (this.state.tissues == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.tissues.forEach((sc) => {
            options.push(<option value={sc.code}>{sc.code}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'tissue';
        return getSelect(options, defaultValue, filterName, this.setFilter);
    }

    getAnalysisTypeSelect() {
        if (this.state.analysisTypes == 0) {
            return DEFAULT_SELECT;
        }

        const options = [<option value="all">All</option>];
        this.state.analysisTypes.forEach((sc) => {
            options.push(<option value={sc.code}>{sc.code}</option>);
        });
        const defaultValue = 'all';
        const filterName = 'analysis_type';
        return getSelect(options, defaultValue, filterName, this.setFilter);
    }

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
        return ANALYSIS_RUN_TAGS.map((tag) => {
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
                        <div className="col-lg-4">
                            <div className="p-2">
                                Analysis:
                                {this.getAnalysisTypeSelect()}
                            </div>
                        </div>
                        <div className="col-lg-4">
                            <div className="p-2">
                                Tissue:
                                {this.getTissueSelect()}
                            </div>
                        </div>
                        <div className="col-lg-4">
                            <div className="p-2">
                                Donor: {this.getDonorSelect()}
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="p-2">
                                <div>Analysis Run includes Tags:</div>
                                {this.getTagFilter('include_tags')}
                            </div>
                        </div>
                        <div className="col-md-4">
                            <div className="p-2">
                                <div>Analysis Run excludes Tags:</div>
                                {this.getTagFilter('exclude_tags')}
                            </div>
                        </div>
                    </div>
                </div>
            </React.Fragment>
        );
    }
}

export const AnalysisRunFilter = React.memo(function AnalysisRunFilter(props) {
    return <AnalysisRunFilterComponent {...props} />;
});
