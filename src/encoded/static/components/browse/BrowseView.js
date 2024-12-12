'use strict';

import React, { useState, useCallback, useEffect } from 'react';
import memoize from 'memoize-one';
import _ from 'underscore';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import {
    schemaTransforms,
    analytics,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
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
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { BrowseViewControllerWithSelections } from '../static-pages/components/TableControllerWithSelections';
import { AboveTableControlsBase } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/above-table-controls/AboveTableControlsBase';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

export default function BrowseView(props) {
    console.log('BrowseView context', props.context);
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
        const { alerts } = this.props;

        // We don't need full screen btn on SMaHT
        const passProps = _.omit(
            this.props,
            'isFullscreen',
            'toggleFullScreen',
            'isCaseSearch'
        );

        //const filters = BrowseView.filteredFilters(context.filters || []);

        return (
            <div className="search-page-outer-container" id="content">
                <SlidingSidebarLayout>
                    <div>
                        <h3 className="browse-links-header">
                            Browse Production Data By
                        </h3>
                        <div className="browse-links">
                            <BrowseLink type="File" />
                            <BrowseLink type="Donor" />
                            <BrowseLink type="Tissue" />
                            <BrowseLink type="Assay" />
                        </div>
                    </div>
                    <div>
                        <h2 className="browse-summary-header">
                            SMaHT Data Summary
                        </h2>
                        <Alerts alerts={alerts} className="mt-2" />
                        <div>
                            <div className="browse-summary d-flex flex-row p-4 mt-2 mb-3 flex-wrap">
                                <BrowseSummaryStatController type="File" />
                                <BrowseSummaryStatController type="Donor" />
                                <BrowseSummaryStatController type="Tissue" />
                                <BrowseSummaryStatController type="Assay" />
                                <BrowseSummaryStatController type="File Size" />
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
        href,
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

    console.log('BROWSEVIEWSEARCHTABLE PROPS', props);
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
        <AboveSmahtSearchViewTableControls
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
        </AboveSmahtSearchViewTableControls>
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
            widthMap: { lg: 63, md: 63, sm: 63 },
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
            colTitle: 'File',
            widthMap: { lg: 500, md: 400, sm: 300 },
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
        // Data Category
        data_category: {
            colTitle: 'Data Category',
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
            colTitle: 'Data Type',
            widthMap: { lg: 155, md: 155, sm: 150 },
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
        // Format
        'file_format.display_title': {
            colTitle: 'Format',
            widthMap: { lg: 100, md: 90, sm: 80 },
        },
        // Assay
        'file_sets.assay.display_title': {
            colTitle: 'Assay',
            widthMap: { lg: 130, md: 130, sm: 130 },
        },
        // Platform
        'file_sets.sequencing.sequencer.display_title': {
            colTitle: 'Platform',
            widthMap: { lg: 170, md: 160, sm: 150 },
        },
        // Generated By
        'submission_centers.display_title': {
            colTitle: 'Generated By',
            widthMap: { lg: 150, md: 150, sm: 150 },
            render: function (result, parentProps) {
                const { submission_centers: gccs = [] } = result || {};
                if (gccs.length === 0) return null;
                return (
                    <span className="value text-start">
                        {gccs.map((gcc) => gcc.display_title).join(', ')}
                    </span>
                );
            },
        },
        // Sequencing Center
        'sequencing_center.display_title': {
            widthMap: { lg: 135, md: 135, sm: 135 },
            colTitle: 'Seq Center',
        },
        // Method
        'software.display_title': {
            colTitle: 'Method',
            widthMap: { lg: 151, md: 151, sm: 130 },
        },
        // File Size
        file_size: {
            colTitle: 'File Size',
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
        // Submission Date
        date_created: {
            colTitle: 'Submission Date',
            widthMap: { lg: 180, md: 160, sm: 140 },
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
            ]}
            columns={{
                '@type': {},
                access_status: {},
                annotated_filename: {},
                data_type: {},
                'file_format.display_title': {},
                data_category: {},
                'submission_centers.display_title': {},
                date_created: {},
                file_size: {},
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

const BrowseSummaryStatController = (props) => {
    const { type } = props;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [value, setValue] = useState('');
    const [units, setUnits] = useState('');

    const postData = {
        type: type !== 'File Size' ? type : 'File',
        status: 'released',
    };

    const callbackFxn = useCallback((resp) => {
        console.log('BrowseSummaryStatController resp', resp);
        resp.forEach((facet) => {
            if (facet.field == 'status' && type != 'File Size') {
                facet.terms.forEach((term) => {
                    if (term.key == 'released') {
                        setValue(term.doc_count);
                    }
                });
            } else if (facet.field == 'file_size' && type == 'File Size') {
                setValue(valueTransforms.bytesToLargerUnitNoUnits(facet.sum));
                setUnits(valueTransforms.bytesToLargerUnitOnly(facet.sum));
            }
            setLoading(false);
            setError(false);
        });
    });

    const fallbackFxn = useCallback((resp) => {
        console.log('BrowseSummaryStatController error', resp);
        setLoading(false);
        setError(true);
    });

    const getStatistics = useCallback(() => {
        if (!loading) setLoading(true);
        if (error) setError(false);

        ajax.load(
            `/peek-metadata/`,
            callbackFxn,
            'POST',
            fallbackFxn,
            JSON.stringify(postData)
        );
    }, [callbackFxn, fallbackFxn]);

    // On mount, get statistics
    useEffect(() => {
        getStatistics();
    }, []);

    return <BrowseSummaryStat {...{ value, type, loading, units }} />;
};

const BrowseSummaryStat = React.memo(function BrowseSummaryStat(props) {
    const { type, value, loading, units } = props;

    let subtitle;
    switch (type) {
        case 'File':
            subtitle = 'Files Generated';
            break;
        case 'Donor':
            subtitle = 'Donors';
            break;
        case 'Tissue':
            subtitle = 'Tissues';
            break;
        case 'Assay':
            subtitle = 'Assays';
            break;
        case 'File Size':
            subtitle = 'Total File Size';
            break;
        default:
            throw new Error(
                'Error in BrowseSummaryStat - Must provide a valid type.'
            );
    }

    return (
        <div className="browse-summary-stat d-flex flex-row">
            <BrowseLinkIcon {...{ type }} cls="mt-04" />
            <div className="ms-2">
                {loading && (
                    <div className="browse-summary-stat-value">
                        {' '}
                        <i className="icon icon-circle-notch icon-spin fas" />
                    </div>
                )}
                {!loading && (
                    <>
                        <div className="browse-summary-stat-value">
                            {value}
                            {units && <span>{units}</span>}
                        </div>
                    </>
                )}
                <div className="browse-summary-stat-subtitle">{subtitle}</div>
            </div>
        </div>
    );
});

const BrowseLink = React.memo(function BrowseLink(props) {
    const { type } = props;

    return (
        <a href={`/browse/?type=${type}`} className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
});

const BrowseLinkIcon = React.memo(function BrowseLinkIcon(props) {
    const { type, cls } = props;

    let iconCls;
    let dataAttribute;

    switch (type) {
        case 'File':
            iconCls = 'file';
            dataAttribute = 'file';
            break;
        case 'Donor':
            iconCls = 'users';
            dataAttribute = 'donor';
            break;
        case 'Tissue':
            iconCls = 'lungs';
            dataAttribute = 'tissue';
            break;
        case 'Assay':
            iconCls = 'dna';
            dataAttribute = 'assay';
            break;
        case 'File Size':
            iconCls = 'download';
            dataAttribute = 'file-size';
            break;
        default:
            throw new Error(
                'Error in BrowseLinkIcon - Must provide a valid type.'
            );
    }

    return (
        <div
            className={'browse-link-icon ' + cls}
            data-icon-type={dataAttribute}>
            <i className={`icon fas icon-xl icon-${iconCls}`} />
        </div>
    );
});

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

/**
 * Header section of the File Overview Table. Passed as a child to
 * EmbeddedSearchView (SPC), and recieves props from SelectedItemsController
 */
const BrowseViewAboveFacetListComponent = (props) => {
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

const AboveSmahtSearchViewTableControls = React.memo(
    function AboveSmahtSearchViewTableControls(props) {
        const {
            topLeftChildren,
            children,
            isFullscreen,
            windowWidth,
            toggleFullScreen,
            sortBy,
        } = props;

        return (
            <AboveTableControlsBase
                useSmahtLayout
                {...{
                    children,
                    topLeftChildren,
                    isFullscreen,
                    windowWidth,
                    toggleFullScreen,
                    sortBy,
                }}
                panelMap={AboveTableControlsBase.getCustomColumnSelectorPanelMapDefinition(
                    props
                )}></AboveTableControlsBase>
        );
    }
);

pageTitleViews.register(BrowseViewPageTitle, 'Browse');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'selection');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'add');
