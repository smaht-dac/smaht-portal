'use strict';

import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import memoize from 'memoize-one';
import _ from 'underscore';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { navigate, Schemas } from './../util';
import { columnExtensionMap as originalColExtMap } from './columnExtensionMap';
import { transformedFacets, SearchViewPageTitle } from './SearchView';
import { BrowseViewAboveSearchTableControls } from './browse-view/BrowseViewAboveSearchTableControls';
import {
    SelectAllFilesButton,
    SelectedItemsDownloadButton,
} from '../static-pages/components/SelectAllAboveTableComponent';
import { createBrowseFileColumnExtensionMap } from './BrowseView';
import {
    pageTitleViews,
    PageTitleContainer,
    TitleAndSubtitleBeside,
} from '../PageTitleSection';
import { useUserDownloadAccess } from '../util/hooks';
import { compareFacetTermsByTissueAndCode } from '../util/data';

export default function FileSearchView(props) {
    const { schemas, session, facets, href, context } = props;
    if (!context.facets) return null;
    return (
        <div className="search-page-container container-wide" id="content">
            <SelectedItemsController
                {...{ context, href }}
                currentAction={'multiselect'}>
                <FileTableWithSelectedFilesCheckboxes
                    {...{ schemas, facets, session, href, context }}
                />
            </SelectedItemsController>
        </div>
    );
}

// Download button for admin users only
const SearchViewDownloadButton = ({ session, selectedItems }) => {
    const { userDownloadAccess } = useUserDownloadAccess(session);

    // Enable if user has admin access (aka all true in userDownloadAccess)
    return Object.values(userDownloadAccess).every((v) => v) ? (
        <SelectedItemsDownloadButton
            id="download_tsv_multiselect"
            disabled={selectedItems.size === 0}
            className="btn btn-primary btn-sm me-05 align-items-center"
            {...{ selectedItems, session }}
            analyticsAddItemsToCart>
            <i className="icon icon-download fas me-03" />
            Download {selectedItems.size} Selected Files
        </SelectedItemsDownloadButton>
    ) : (
        <SelectedItemsDownloadButton
            id="download_tsv_multiselect"
            disabled={true}
            className="download-button btn btn-primary btn-sm me-05 align-items-center">
            <i className="icon icon-download fas me-03" />
            Download {selectedItems.size} Selected Files
        </SelectedItemsDownloadButton>
    );
};

function FileTableWithSelectedFilesCheckboxes(props) {
    const {
        context,
        href,
        schemas,
        navigate: propNavigate = navigate,
        windowHeight,
        windowWidth,
        registerWindowOnScrollHandler,
        toggleFullScreen,
        isFullscreen,
        session,
        selectedItems,
        onSelectItem,
        selectItem,
        onResetSelectedItems,
        columnExtensionMap: propColumnExtensionMap = originalColExtMap,
        currentAction,
    } = props;

    const facets = useMemo(
        function () {
            return transformedFacets(context, currentAction, schemas);
        },
        [context, currentAction, session, schemas]
    );

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    const { columnExtensionMap, columns, hideFacets } = useMemo(
        function () {
            let { columnExtensionMap, columns, hideFacets } =
                createBrowseFileColumnExtensionMap(selectedFileProps);
            columnExtensionMap = _.extend(
                {},
                propColumnExtensionMap,
                columnExtensionMap
            );
            return { columnExtensionMap, columns, hideFacets };
        },
        [propColumnExtensionMap, selectedFileProps]
    );

    const tableColumnClassName = 'results-column col';
    const facetColumnClassName = 'facets-column col-auto';
    const facetListSortFxns = useMemo(
        () => ({
            'sample_summary.tissues': compareFacetTermsByTissueAndCode,
        }),
        []
    );

    const aboveTableComponent = (
        <BrowseViewAboveSearchTableControls
            topLeftChildren={
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
            }>
            {<SearchViewDownloadButton {...{ session, selectedItems }} />}
        </BrowseViewAboveSearchTableControls>
    );
    const aboveFacetListComponent = (
        <AboveFacetList {...{ context, currentAction }} />
    );

    const passProps = {
        href,
        context,
        facets,
        session,
        schemas,
        windowHeight,
        windowWidth,
        registerWindowOnScrollHandler,
        aboveTableComponent,
        aboveFacetListComponent,
        tableColumnClassName,
        facetColumnClassName,
        columnExtensionMap,
        facetListSortFxns,
        navigate: propNavigate,
        toggleFullScreen,
        isFullscreen, // todo: remove maybe, pass only to AboveTableControls
        keepSelectionInStorage: true,
        separateSingleTermFacets: false,
        columns,
        hideFacets,
        rowHeight: 31,
        openRowHeight: 40,
    };

    return (
        <CommonSearchView
            {...passProps}
            termTransformFxn={Schemas.Term.toName}
        />
    );
}
FileTableWithSelectedFilesCheckboxes.propTypes = {
    // Props' type validation based on contents of this.props during render.
    href: PropTypes.string.isRequired,
    columnExtensionMap: PropTypes.object,
    context: PropTypes.shape({
        columns: PropTypes.objectOf(PropTypes.object).isRequired,
        total: PropTypes.number.isRequired,
    }).isRequired,
    facets: PropTypes.arrayOf(
        PropTypes.shape({
            title: PropTypes.string.isRequired,
        })
    ),
    schemas: PropTypes.object,
    selectItem: PropTypes.func,
    selectedItems: PropTypes.objectOf(PropTypes.object),
};

function AboveFacetList({ context, currentAction }) {
    const { total = 0, actions = [] } = context;
    let totalResults = null;
    if (total > 0) {
        totalResults = (
            <div>
                <span id="results-count" className="text-500">
                    {total}
                </span>{' '}
                Results
            </div>
        );
    }

    let addButton = null;
    if (!currentAction) {
        const addAction = _.findWhere(actions, { name: 'add' });
        if (addAction && typeof addAction.href === 'string') {
            addButton = (
                <a
                    className="btn btn-primary btn-xs ms-1"
                    href={addAction.href}
                    data-skiprequest="true">
                    <i className="icon icon-fw icon-plus fas me-03 fas" />
                    Create New&nbsp;
                </a>
            );
        }
    }

    return (
        <div className="above-results-table-row text-truncate d-flex align-items-center justify-content-end">
            {totalResults}
            {addButton}
        </div>
    );
}

// Helper function to parse a "YYYY-MM-DD" date string into a Date object in UTC.
function parseDateUTC(dateString) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Note: Month in Date.UTC is 0-indexed.
    return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Generates a dynamic title based on an array of filter objects.
 *
 * This function uses a reduce method to process the filters in a single pass and extract:
 * - An array of all "status" terms.
 * - The first occurrence of the "file_status_tracking.release_dates.initial_release.from" term as the start date.
 * - The first occurrence of the "file_status_tracking.release_dates.initial_release.to" term as the end date.
 *
 * It then performs the following validations:
 * 1. There is at least one "status" filter, and all "status" filters must have the term "released".
 * 2. Both start (from) and end (to) dates are available.
 * 3. The start date must be the first day of a month.
 * 4. The end date must be the last day of the same month and year.
 *
 * If all conditions are met, the function returns a title in the format:
 *    "Released Files in <ShortMonth> <Year>"
 * Otherwise, it returns a fallback title.
 *
 * @param {Array} filters - An array of filter objects, each containing a 'field', 'term', and 'remove' property.
 * @returns The generated title or the fallback title if validations fail.
 */
const FileSearchViewPageTitle = React.memo(function FileSearchViewPageTitle(
    props
) {
    const { context, alerts } = props;
    const { filters = [] } = context || {};

    const fallbackTitle = <SearchViewPageTitle {...props} />;

    if (!Array.isArray(filters) || filters.length === 0) {
        return fallbackTitle;
    }

    // Use reduce to aggregate the required values in one pass.
    const { statuses, from, to } = filters.reduce(
        (acc, filter) => {
            if (filter.field === 'status') {
                acc.statuses.push(filter.term);
            } else if (
                filter.field ===
                    'file_status_tracking.release_dates.initial_release.from' &&
                !acc.from
            ) {
                acc.from = filter.term;
            } else if (
                filter.field ===
                    'file_status_tracking.release_dates.initial_release.to' &&
                !acc.to
            ) {
                acc.to = filter.term;
            }
            return acc;
        },
        { statuses: [], from: null, to: null }
    );

    // Check that there is at least one "status" filter and that all status values are "released".
    if (statuses.length === 0 || statuses.some((term) => term !== 'released')) {
        // Frontend: Please check
        return fallbackTitle;
    }

    // Ensure both from and to dates are present.
    if (!from || !to) {
        return fallbackTitle;
    }

    // Convert the date strings to Date objects using UTC conversion.
    const fromDate = parseDateUTC(from);
    const toDate = parseDateUTC(to);

    // Check if the fromDate is the first day of the month (using UTC).
    if (fromDate.getUTCDate() !== 1) {
        return fallbackTitle;
    }

    // Calculate the last day of the month for fromDate using UTC.
    const lastDayOfMonth = new Date(
        Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 0)
    ).getUTCDate();

    // Validate that toDate is the last day of the same month and year (using UTC).
    if (
        toDate.getUTCDate() !== lastDayOfMonth ||
        fromDate.getUTCFullYear() !== toDate.getUTCFullYear() ||
        fromDate.getUTCMonth() !== toDate.getUTCMonth()
    ) {
        return fallbackTitle;
    }

    // Get the month name in short format using UTC.
    const monthName = fromDate.toLocaleString('default', {
        month: 'short',
        timeZone: 'UTC',
    });
    const subtitle = (
        <span>
            <small className="text-300">in</small>{' '}
            {`${monthName} ${fromDate.getUTCFullYear()}`}
        </span>
    );

    return (
        <PageTitleContainer
            alerts={alerts}
            className="container-wide pb-2 mb-2"
            alertsBelowTitleContainer
            alertsContainerClassName="container-wide">
            <div className="container-wide m-auto p-xl-0">
                {/* Using static breadcrumbs here, but will likely need its own component in future */}
                <div className="static-page-breadcrumbs clearfix mx-0 px-0">
                    <div className="static-breadcrumb" data-name="Home" key="/">
                        <a href="/" className="link-underline-hover">
                            Home
                        </a>
                        <i className="icon icon-fw icon-angle-right fas" />
                    </div>
                    <div
                        className="static-breadcrumb nonclickable"
                        data-name="Search"
                        key="/search">
                        <span>Search</span>
                    </div>
                </div>
                <TitleAndSubtitleBeside subtitle={subtitle}>
                    Released Files
                </TitleAndSubtitleBeside>
            </div>
        </PageTitleContainer>
    );
});
FileSearchViewPageTitle.propTypes = {
    context: PropTypes.object.isRequired,
    alerts: PropTypes.array,
};

pageTitleViews.register(FileSearchViewPageTitle, 'FileSearchResults');
pageTitleViews.register(FileSearchViewPageTitle, 'SubmittedFileSearchResults');
