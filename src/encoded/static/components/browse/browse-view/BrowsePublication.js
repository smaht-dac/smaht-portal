import React from 'react';
import * as _ from 'underscore';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowsePublicationSearchTable } from '../components/PublicationSearchTable';

// Browse Publication Body Component
export const BrowsePublicationBody = (props) => {
    return (
        <div className="browse-publication-body text-gray-70">
            <div className="publication-collections-breadcrumb">
                <span>SMaHT Data</span>
                <span className="crumb-divider">|</span>
                <span>Publications</span>
            </div>
            <div className="publication-collections-heading-row">
                <h2 className="publication-collections-heading">
                    <b>Browse</b> all <b>SMaHT Publications</b>
                </h2>
                <a
                    className="publication-collections-search-btn"
                    href="/publication-collections">
                    <i className="icon icon-bookmark fas"></i>
                    Browse all Collections
                </a>
            </div>
            <BrowseViewControllerWithSelections {...props}>
                <BrowsePublicationSearchTable {...props} />
            </BrowseViewControllerWithSelections>
        </div>
    );
};
