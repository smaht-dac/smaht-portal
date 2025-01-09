'use strict';

import React from 'react';
import memoize from 'memoize-one';
import _ from 'underscore';
import { OverlayTrigger, Popover } from 'react-bootstrap';

import {
    schemaTransforms,
    analytics,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';

import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

import { columnExtensionMap as originalColExtMap } from './columnExtensionMap';
import { Schemas } from './../util';
import {
    PageTitleContainer,
    TitleAndSubtitleUnder,
    pageTitleViews,
    EditingItemPageTitle,
    OnlyTitle,
} from './../PageTitleSection';
import SlidingSidebarLayout from './../shared/SlidingSidebarLayout';
import {
    SelectAllFilesButton,
    SelectedItemsDownloadButton,
} from '../static-pages/components/SelectAllAboveTableComponent';
import { BrowseViewControllerWithSelections } from '../static-pages/components/TableControllerWithSelections';
import { BrowseLink } from './browse-view/BrowseLink';
import { BrowseSummaryStatController } from './browse-view/BrowseSummaryStatController';
import { BrowseViewAboveFacetListComponent } from './browse-view/BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './browse-view/BrowseViewAboveSearchTableControls';

export default function BrowseView(props) {
    const { session } = props;
    return <BrowseViewBody {...props} key={session} />;
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

    constructor(props) {
        super(props);
        this.memoized = {
            transformedFacets: memoize(BrowseViewBody.transformedFacets),
        };
    }

    render() {
        const { alerts } = this.props;

        // We don't need full screen btn on SMaHT
        const passProps = _.omit(
            this.props,
            'isFullscreen',
            'toggleFullScreen',
            'isCaseSearch'
        );

        return (
            <div className="search-page-outer-container" id="content">
                <SlidingSidebarLayout openByDefault={false}>
                    <div>
                        <h3 className="browse-links-header">
                            Browse Production Data By
                        </h3>
                        <div className="browse-links">
                            <BrowseLink type="File" />
                            <BrowseLink type="Donor" disabled />
                            <BrowseLink type="Tissue" disabled />
                            <BrowseLink type="Assay" disabled />
                        </div>
                    </div>
                    <div className="browse-body">
                        <h2 className="browse-summary-header">
                            SMaHT Data Summary
                        </h2>
                        <Alerts alerts={alerts} className="mt-2" />
                        <div>
                            <div className="browse-summary d-flex flex-row mt-2 mb-3 flex-wrap">
                                <BrowseSummaryStatController
                                    type="File"
                                    useSearch
                                    additionalSearchQueries="&sample_summary.studies=Production"
                                />
                                <BrowseSummaryStatController type="Donor" />
                                <BrowseSummaryStatController type="Tissue" />
                                <BrowseSummaryStatController type="Assay" />
                                <BrowseSummaryStatController
                                    type="File Size"
                                    useSearch
                                    additionalSearchQueries="&sample_summary.studies=Production"
                                />
                            </div>
                        </div>
                        <hr />
                        <BrowseViewControllerWithSelections {...passProps}>
                            <BrowseViewSearchTable />
                        </BrowseViewControllerWithSelections>
                    </div>
                </SlidingSidebarLayout>
            </div>
        );
    }
}

const BrowseViewSearchTable = (props) => {
    const {
        session,
        context,
        currentAction,
        schemas,
        selectedItems,
        onSelectItem,
        onResetSelectedItems,
    } = props;
    const facets = BrowseViewBody.transformedFacets(
        context,
        currentAction,
        schemas
    );
    const tableColumnClassName = 'results-column col';
    const facetColumnClassName = 'facets-column col-auto';

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    const passProps = _.omit(
        props,
        'isFullscreen',
        'toggleFullScreen',
        'isCaseSearch'
    );

    const aboveFacetListComponent = <BrowseViewAboveFacetListComponent />;
    const aboveTableComponent = (
        <BrowseViewAboveSearchTableControls
            topLeftChildren={
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
            }>
            <SelectedItemsDownloadButton
                id="download_tsv_multiselect"
                disabled={selectedItems.size === 0}
                className="btn btn-primary btn-sm me-05 align-items-center"
                {...{ selectedItems, session }}
                analyticsAddItemsToCart>
                <i className="icon icon-download fas me-03" />
                Download {selectedItems.size} Selected Files
            </SelectedItemsDownloadButton>
        </BrowseViewAboveSearchTableControls>
    );

    /**
     * A column extension map speifically for benchmarking tables.
     * Some of these things may be worth moving to the global colextmap eventually.
     */
    const columnExtensionMap = {
        ...originalColExtMap, // Pull in defaults for all tables
        // Then overwrite or add onto the ones that already are there:
        // Select all button
        '@type': {
            colTitle: (
                // Context now passed in from HeadersRowColumn (for file count)
                <SelectAllFilesButton {...selectedFileProps} type="checkbox" />
            ),
            hideTooltip: true,
            noSort: true,
            widthMap: { lg: 40, md: 40, sm: 40 },
            render: (result, parentProps) => {
                return (
                    <SelectionItemCheckbox
                        {...{ selectedItems, onSelectItem, result }}
                        isMultiSelect={true}
                    />
                );
            },
        },
        // Access
        access_status: {
            widthMap: { lg: 60, md: 60, sm: 60 },
            colTitle: <i className="icon icon-lock fas" data-tip="Access" />,
            render: function (result, parentProps) {
                const { access_status } = result || {};

                if (access_status === 'Protected') {
                    return (
                        <span className="value">
                            <i
                                className="icon icon-lock fas"
                                data-tip="Protected"
                            />
                        </span>
                    );
                }
                return (
                    <span className="value text-start">{access_status}</span>
                );
            },
        },
        // File
        annotated_filename: {
            widthMap: { lg: 500, md: 400, sm: 300 },
            colTitle: (
                <>
                    File
                    <TypeColumnTitlePopover
                        className="pb-1 px-1 filename-popover-color"
                        popID="type-title-popover"
                        tooltip="Click for more information">
                        <h1>Need Image</h1>
                    </TypeColumnTitlePopover>
                </>
            ),
            render: function (result, parentProps) {
                const {
                    '@id': atId,
                    display_title,
                    annotated_filename,
                } = result || {};

                return (
                    <span className="value text-start">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener">
                            {annotated_filename || display_title}
                        </a>
                    </span>
                );
            },
        },
        // Donor
        donors: {
            widthMap: { lg: 181, md: 181, sm: 181 },
            render: function (result, parentProps) {
                const { donors: { 0: { display_title } = {} } = [] } =
                    result || {};
                return display_title || null;
            },
        },
        // Assay
        'file_sets.libraries.assay.display_title': {
            widthMap: { lg: 136, md: 136, sm: 136 },
        },
        // Tissue
        'sample_summary.tissues': {},
        // Data Category
        data_category: {
            render: function (result, parentProps) {
                const { data_category = [] } = result || {};
                if (data_category.length === 0) {
                    return null;
                } else if (data_category.length === 1) {
                    return data_category[0];
                } else {
                    return data_category.join(', ');
                }
            },
        },
        // Data Type
        data_type: {
            widthMap: { lg: 124, md: 124, sm: 124 },
            render: function (result, parentProps) {
                const { data_type = [] } = result || {};
                if (data_type.length === 0) {
                    return null;
                } else if (data_type.length === 1) {
                    return data_type[0];
                } else {
                    return data_type.join(', ');
                }
            },
        },
        // File Size
        file_size: {
            widthMap: { lg: 105, md: 100, sm: 100 },
            render: function (result, parentProps) {
                const value = result?.file_size;
                if (!value) return null;
                return (
                    <span className="value text-end">
                        {valueTransforms.bytesToLargerUnit(value)}
                    </span>
                );
            },
        },
        // Released
        date_created: {
            colTitle: 'Released',
            widthMap: { lg: 115, md: 115, sm: 115 },
            render: function (result, parentProps) {
                const value = result?.date_created;
                if (!value) return null;
                return (
                    <span className="value text-end">
                        <LocalizedTime
                            timestamp={value}
                            formatType="date-file"
                        />
                    </span>
                );
            },
        },
        // Platform
        'file_sets.sequencing.sequencer.display_title': {
            widthMap: { lg: 170, md: 160, sm: 150 },
        },
        // Format
        'file_format.display_title': {
            widthMap: { lg: 100, md: 90, sm: 80 },
        },
        // Software
        'software.display_title': {
            widthMap: { lg: 151, md: 151, sm: 151 },
        },
    };

    return (
        <CommonSearchView
            {...passProps}
            {...{
                columnExtensionMap,
                tableColumnClassName,
                facetColumnClassName,
                facets,
                aboveFacetListComponent,
                aboveTableComponent,
            }}
            hideFacets={[
                'dataset',
                'file_sets.libraries.analytes.samples.sample_sources.code',
                'status',
                'validation_errors.name',
                'version',
                'sample_summary.studies',
                'submission_centers.display_title',
                'software.display_title',
            ]}
            columns={{
                '@type': {
                    title: 'Selected',
                },
                access_status: {
                    title: 'Access',
                },
                annotated_filename: {
                    title: 'File',
                },
                donors: {
                    title: 'Donor',
                },
                'sample_summary.tissues': {
                    title: 'Tissue',
                },
                'file_sets.libraries.assay.display_title': {
                    title: 'Assay',
                },
                file_size: {
                    title: 'File Size',
                },
                date_created: {
                    // TODO: is this correct?
                    title: 'Release Date',
                },
                'file_sets.sequencing.sequencer.display_title': {
                    title: 'Platform',
                },
                'file_format.display_title': {
                    title: 'Format',
                },
                data_type: {
                    title: 'Data Type',
                },
                'software.display_title': {
                    title: 'Software',
                },
            }}
            useCustomSelectionController
            hideStickyFooter
            currentAction={'multiselect'}
            renderDetailPane={null}
            termTransformFxn={Schemas.Term.toName}
            separateSingleTermFacets={false}
            rowHeight={31}
            openRowHeight={40}
        />
    );
};

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
            alerts={[]}
            className="container-wide pb-2"
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
                        data-name="Data"
                        key="/data">
                        <span>Data</span>
                        <i className="icon icon-fw icon-angle-right fas" />
                    </div>
                    <div
                        className="static-breadcrumb nonclickable"
                        data-name="Production"
                        key="/browse">
                        <span>Browse By File</span>
                    </div>
                </div>
                <OnlyTitle className={commonCls + ' mx-0 px-0'}>
                    SMaHT Production Data
                </OnlyTitle>
            </div>
        </PageTitleContainer>
    );
});

const TypeColumnTitlePopover = function (props) {
    const {
        children = [],
        className,
        popID,
        tooltip,
        placement = 'auto',
    } = props || {};

    const popover = (
        <Popover id={popID}>
            <Popover.Body>{children}</Popover.Body>
        </Popover>
    );
    const cls =
        'btn btn-link text-decoration-none' +
        (className ? ' ' + className : '');
    return (
        <OverlayTrigger
            trigger="click"
            overlay={popover}
            rootClose
            rootCloseEvent="click"
            {...{ placement }}>
            {function ({ ref, ...triggerHandlers }) {
                return (
                    <button
                        type="button"
                        ref={ref}
                        {...triggerHandlers}
                        className={cls}
                        data-tip={tooltip || 'Click for more information'}>
                        <i className="icon icon-info-circle fas" />
                    </button>
                );
            }}
        </OverlayTrigger>
    );
};

pageTitleViews.register(BrowseViewPageTitle, 'Browse');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'selection');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'add');
