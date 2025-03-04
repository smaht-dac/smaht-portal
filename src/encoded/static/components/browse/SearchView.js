'use strict';

import React from 'react';
import memoize from 'memoize-one';
import _ from 'underscore';
import url from 'url';

import {
    memoizedUrlParse,
    schemaTransforms,
    analytics,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { AboveSearchViewTableControls } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/above-table-controls/AboveSearchViewTableControls';
import { DetailPaneStateCache } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/DetailPaneStateCache';
import { columnExtensionMap } from './columnExtensionMap';
import { Schemas } from './../util';
import {
    TitleAndSubtitleBeside,
    PageTitleContainer,
    TitleAndSubtitleUnder,
    pageTitleViews,
    EditingItemPageTitle,
} from './../PageTitleSection';

/**
    * Function which is passed into a `.filter()` call to
    * filter context.facets down, usually in response to frontend-state.
    *
    * Currently is meant to filter out type facet if we're in selection mode,
    * as well as some fields from embedded 'experiment_set' which might
    * give unexpected results.
    *
    * @todo Potentially get rid of this and do on backend.
    *
    * @param {{ field: string }} facet - Object representing a facet.
    * @returns {boolean} Whether to keep or discard facet.
    */
export function filterFacet(facet, currentAction) {
    // Set in backend or schema for facets which are under development or similar.
    if (facet.hide_from_view) return false;

    // Remove the @type facet while in selection mode.
    if (facet.field === 'type' && currentAction === 'selection')
        return false;

    return true;
}

/** Filter the `@type` facet options down to abstract types only (if none selected) for Search. */
export function transformedFacets(context, currentAction, schemas) {
    // Clone/filter list of facets.
    // We may filter out type facet completely at this step,
    // in which case we can return out of func early.
    const facets = context.facets.filter(function (facet) {
        return filterFacet(facet, currentAction);
    });

    // Find facet for '@type'
    const searchItemTypes =
        schemaTransforms.getAllSchemaTypesFromSearchContext(context); // "Item" is excluded

    if (searchItemTypes.length > 0) {
        console.info(
            "A (non-'Item') type filter is present. Will skip filtering Item types in Facet."
        );
        // Keep all terms/leaf-types - backend should already filter down to only valid sub-types through
        // nature of search itself.

        if (searchItemTypes.length > 1) {
            const errMsg =
                'More than one "type" filter is selected. This is intended to not occur, at least as a consequence of interacting with the UI. Perhaps have entered multiple types into URL.';
            analytics.exception('SMaHT SearchView - ' + errMsg);
            console.warn(errMsg);
        }

        return facets;
    }

    const typeFacetIndex = _.findIndex(facets, { field: 'type' });
    if (typeFacetIndex === -1) {
        console.error(
            'Could not get type facet, though some filter for it is present.'
        );
        return facets; // Facet not present, return.
    }

    // Avoid modifying in place.
    facets[typeFacetIndex] = _.clone(facets[typeFacetIndex]);

    // Show only base types for when itemTypesInSearch.length === 0 (aka 'type=Item').
    facets[typeFacetIndex].terms = _.filter(
        facets[typeFacetIndex].terms,
        function (itemType) {
            const parentType = schemaTransforms.getAbstractTypeForType(
                itemType.key,
                schemas
            );
            return !parentType || parentType === itemType.key;
        }
    );

    return facets;
}

export default function SearchView(props) {
    const {
        context: { '@type': searchPageType = ['ItemSearchResults'] },
    } = props;

    return <SearchViewBody {...props} />;
}

export class SearchViewBody extends React.PureComponent {
   
    constructor(props) {
        super(props);
        this.memoized = {
            transformedFacets: memoize(transformedFacets)
        };
    }

    render() {
        const {
            context,
            currentAction,
            schemas,
        } = this.props;

        // We don't need full screen btn on CGAP as already full width.
        const passProps = _.omit(
            this.props,
            'isFullscreen',
            'toggleFullScreen'
        );

        const facets = this.memoized.transformedFacets(
            context,
            currentAction,
            schemas
        );
        const tableColumnClassName = 'results-column col';
        const facetColumnClassName = 'facets-column col-auto';
        const aboveTableComponent = (
            <AboveSearchViewTableControls customizationButtonClassName='btn btn-sm btn-outline-secondary mt-05' />
        );

        return (
            <div
                className="container-wide search-page-outer-container"
                id="content">
                <CommonSearchView
                    {...passProps}
                    {...{
                        columnExtensionMap,
                        tableColumnClassName,
                        facetColumnClassName,
                        facets,
                    }}
                    aboveTableComponent={aboveTableComponent}
                    renderDetailPane={null}
                    termTransformFxn={Schemas.Term.toName}
                    separateSingleTermFacets={false}
                    rowHeight={31}
                    openRowHeight={40}
                    defaultColAlignment="text-start"
                />
            </div>
        );
    }
}

const SearchViewPageTitle = React.memo(function SearchViewPageTitle(props) {
    const { context, schemas, currentAction, alerts } = props;

    if (currentAction === 'add') {
        // Fallback unless any custom PageTitles registered for @type=<ItemType>SearchResults & currentAction=add
        return (
            <EditingItemPageTitle
                {...{ context, schemas, currentAction, alerts }}
            />
        );
    }

    if (currentAction === 'selection' || currentAction === 'multiselect') {
        return (
            <PageTitleContainer alerts={alerts} className="container-wide">
                <TitleAndSubtitleUnder subtitle="Drag and drop Items from this view into other window(s).">
                    Selecting
                </TitleAndSubtitleUnder>
            </PageTitleContainer>
        );
    }

    const thisTypeTitle = schemaTransforms.getSchemaTypeFromSearchContext(
        context,
        schemas
    );
    const subtitle = thisTypeTitle ? (
        <span>
            <small className="text-300">for</small> {thisTypeTitle}
        </span>
    ) : null;

    return (
        <PageTitleContainer
            alerts={[]}
            className="container-wide pb-2 mb-2"
            alertsBelowTitleContainer>
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
                    Search
                </TitleAndSubtitleBeside>
            </div>
        </PageTitleContainer>
    );
});

pageTitleViews.register(SearchViewPageTitle, 'Search');
pageTitleViews.register(SearchViewPageTitle, 'Search', 'selection');
pageTitleViews.register(SearchViewPageTitle, 'Search', 'add');
