import React, { useEffect } from 'react';
import * as _ from 'underscore';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowsePublicationSearchTable } from '../components/PublicationSearchTable';

// Browse Publication Body Component
export const BrowsePublicationBody = (props) => {
    return (
        <div className="browse-publication-body text-gray-70">
            <BrowseViewControllerWithSelections {...props}>
                <BrowsePublicationSearchTable {...props} />
            </BrowseViewControllerWithSelections>
        </div>
    );
};
