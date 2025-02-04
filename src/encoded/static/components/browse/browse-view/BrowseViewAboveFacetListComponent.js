import React from 'react';

/**
 * Header section of the Browse Table. Passed as a child to
 * EmbeddedSearchView (SPC), and recieves props from SelectedItemsController
 */
export const BrowseViewAboveFacetListComponent = (props) => {
    const { context } = props;

    const totalResultCount = context?.total ?? 0;

    return (
        <div className="above-facets-table-row d-flex w-100">
            <div className="col-auto ms-0 ps-0">
                <span className="text-400" id="results-count">
                    {totalResultCount}
                </span>{' '}
                Results
            </div>
        </div>
    );
};
