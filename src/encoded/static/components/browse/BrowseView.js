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
import { DetailPaneStateCache } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/DetailPaneStateCache';
import { columnExtensionMap } from './columnExtensionMap';
import { Schemas } from './../util';
import {
    PageTitleContainer,
    TitleAndSubtitleUnder,
    pageTitleViews,
    EditingItemPageTitle,
    OnlyTitle,
} from './../PageTitleSection';
import SlidingSidebarLayout from './../shared/SlidingSidebarLayout';

export default function BrowseView(props) {
    const {
        context: { '@type': searchPageType = ['ItemSearchResults'] },
    } = props;
    const isCaseSearch = searchPageType[0] === 'CaseSearchResults';

    if (isCaseSearch) {
        return (
            <DetailPaneStateCache>
                <BrowseViewBody {...props} {...{ isCaseSearch }} />
            </DetailPaneStateCache>
        );
    }

    return <BrowseViewBody {...props} />;
}

export class BrowseViewBody extends React.PureComponent {
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
    static filterFacet(facet, currentAction) {
        // Set in backend or schema for facets which are under development or similar.
        if (facet.hide_from_view) return false;

        // Remove the @type facet while in selection mode.
        if (facet.field === 'type' && currentAction === 'selection')
            return false;

        return true;
    }

    /** Filter the `@type` facet options down to abstract types only (if none selected) for Search. */
    static transformedFacets(context, currentAction, schemas) {
        // Clone/filter list of facets.
        // We may filter out type facet completely at this step,
        // in which case we can return out of func early.
        const facets = context.facets.filter(function (facet) {
            return BrowseViewBody.filterFacet(facet, currentAction);
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
                analytics.exception('CGAP SearchView - ' + errMsg);
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

    /** Not currently used. */
    static filteredFilters(filters) {
        const typeFilterCount = filters.reduce(function (m, { field }) {
            if (field === 'type') return m + 1;
            return m;
        }, 0);
        return filters.filter(function ({ field, term }) {
            if (field === 'type') {
                if (term === 'Item') {
                    return false;
                }
                if (typeFilterCount === 1) {
                    return false;
                }
            }
            return true;
        });
    }

    constructor(props) {
        super(props);
        this.memoized = {
            transformedFacets: memoize(BrowseViewBody.transformedFacets),
            filteredFilters: memoize(BrowseViewBody.filteredFilters),
        };
    }

    render() {
        const {
            isCaseSearch = false,
            context,
            currentAction,
            schemas,
        } = this.props;

        // We don't need full screen btn on CGAP as already full width.
        const passProps = _.omit(
            this.props,
            'isFullscreen',
            'toggleFullScreen',
            'isCaseSearch'
        );

        //const filters = BrowseView.filteredFilters(context.filters || []);
        const facets = this.memoized.transformedFacets(
            context,
            currentAction,
            schemas
        );
        const tableColumnClassName = 'results-column col';
        const facetColumnClassName = 'facets-column col-auto';

        return (
            <div className="search-page-outer-container" id="content">
                <SlidingSidebarLayout>
                    <div>NAV</div>
                    <CommonSearchView
                        {...passProps}
                        {...{
                            columnExtensionMap,
                            tableColumnClassName,
                            facetColumnClassName,
                            facets,
                        }}
                        renderDetailPane={null}
                        termTransformFxn={Schemas.Term.toName}
                        separateSingleTermFacets={false}
                        rowHeight={31}
                        openRowHeight={40}
                    />
                </SlidingSidebarLayout>
            </div>
        );
    }
}

const BrowseViewPageTitle = React.memo(function BrowseViewPageTitle(props) {
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

    const commonCls = 'col-12';

    return (
        <PageTitleContainer
            alerts={alerts}
            className="container-wide pb-2"
            alertsBelowTitleContainer>
            <div className="container-wide m-auto p-xl-0">
                {/* {!breadCrumbsVisible ? (
                    <StaticPageBreadcrumbs
                        {...{ context, session, href }}
                        key="breadcrumbs"
                        className={commonCls + ' mx-0 px-0'}
                    />
                ) : null} */}
                <OnlyTitle className={commonCls + ' mx-0 px-0'}>
                    SMaHT Production Data
                </OnlyTitle>
            </div>
        </PageTitleContainer>
    );
});

pageTitleViews.register(BrowseViewPageTitle, 'Browse');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'selection');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'add');
