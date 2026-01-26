'use strict';

import React, { useState } from 'react';
import memoize from 'memoize-one';
import _ from 'underscore';
import { Modal, OverlayTrigger, Popover } from 'react-bootstrap';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
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
import { BrowseSummaryStatsViewer } from './browse-view/BrowseSummaryStatController';
import { FacetCharts } from './components/FacetCharts';
import { navigate } from '../util/navigate';
import { BrowseViewAboveFacetListComponent } from './browse-view/BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './browse-view/BrowseViewAboveSearchTableControls';
import { transformedFacets } from './SearchView';
import { BrowseDonorBody } from './browse-view/BrowseDonor';
import { BrowseProtectedDonorBody } from './browse-view/BrowseProtectedDonor';
import { renderProtectedAccessPopover } from '../item-pages/PublicDonorView';
import { useUserDownloadAccess } from '../util/hooks';
import { DonorMetadataDownloadButton } from '../shared/DonorMetadataDownloadButton';

export const BROWSE_STATUS_FILTERS =
    'status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network';

export const BROWSE_LINKS = {
    file:
        '/browse/?type=File&sample_summary.studies=Production&dataset!=No+value&' +
        BROWSE_STATUS_FILTERS,
    donor:
        '/browse/?type=Donor&study=Production&tags=has_released_files&' +
        BROWSE_STATUS_FILTERS,
    protected_donor:
        '/browse/?type=ProtectedDonor&study=Production&tags=has_released_files&' +
        BROWSE_STATUS_FILTERS,
};

export default function BrowseView(props) {
    return <BrowseViewBody {...props} />;
}

// Modal for empty Donor and ProtectedDonor Browse
export const NoResultsBrowseModal = ({
    type,
    context = { total: 0 },
    href,
    userDownloadAccess,
    isAccessResolved,
}) => {
    const userDownloadAccessUpdated = isAccessResolved;
    const isPublicUser = userDownloadAccess?.['open-network'] === false;
    const hasNoResults = context?.total === 0;
    const isBaseBrowsePath =
        decodeURIComponent(new URL(href).pathname + new URL(href).search) ===
        BROWSE_LINKS[type];

    /**
     * Show No results modal if all of the following are true:
     * - `userDownloadAccess` has reached a stable state
     * - The user is not a member of the SMaHT consortium
     * - There are no files in the search results
     * - The URL is the base browse path (no additional filters applied)
     */
    const shouldShowNoResultsModal =
        userDownloadAccessUpdated &&
        isPublicUser &&
        hasNoResults &&
        isBaseBrowsePath;

    return shouldShowNoResultsModal ? (
        <Modal id="download-access-required-modal" show={true} centered>
            <Modal.Body>
                <div className="callout-card protected-data">
                    <img
                        src="/static/img/SMaHT_Vertical-Logo-Solo_FV.png"
                        alt="SMaHT Logo"
                    />
                    <h4>
                        SMaHT {type === 'file' ? 'Production' : 'Donor'} Data:{' '}
                        <br />
                        Official Release - Coming Soon
                    </h4>
                    <span>
                        Check back for updates on the official
                        <br /> release of SMaHT Production Data.
                    </span>
                </div>
            </Modal.Body>
        </Modal>
    ) : null;
};

const BrowseFileBody = (props) => {
    const useCompactFor = ['xs', 'sm', 'md', 'xxl'];
    const {
        context,
        session,
        href,
        windowWidth,
        windowHeight,
        isFullscreen,
        userDownloadAccess,
        isAccessResolved,
    } = props;

    const initialFields = [
        'sample_summary.tissues',
        'sequencing.sequencer.display_title',
    ];

    return (
        <>
            <h2 className="browse-summary-header">SMaHT Data Summary</h2>
            <Alerts alerts={props.alerts} className="mt-2" />
            <div className="row browse-viz-container">
                <div className="stats-column col-auto">
                    <BrowseSummaryStatsViewer
                        {...{
                            session,
                            href,
                            windowWidth,
                            useCompactFor,
                            mapping: 'all',
                        }}
                    />
                </div>
                <div className="col ps-0">
                    <div
                        id="facet-charts-container"
                        className="container ps-0 ps-xl-4">
                        <FacetCharts
                            {..._.pick(
                                props,
                                'context',
                                'href',
                                'session',
                                'schemas',
                                'browseBaseState'
                            )}
                            {...{
                                windowWidth,
                                windowHeight,
                                navigate,
                                isFullscreen,
                                initialFields,
                                mapping: 'all',
                            }}
                        />
                    </div>
                </div>
            </div>
            <hr />
            <BrowseViewControllerWithSelections {...props}>
                <BrowseFileSearchTable
                    userDownloadAccess={userDownloadAccess}
                />
            </BrowseViewControllerWithSelections>
            {context?.total === 0 && (
                <NoResultsBrowseModal
                    type="file"
                    href={href}
                    userDownloadAccess={userDownloadAccess}
                    isAccessResolved={isAccessResolved}
                />
            )}
        </>
    );
};

const renderBrowseBody = (props) => {
    switch (props.context['@type'][0]) {
        case 'FileSearchResults':
            return <BrowseFileBody {...props} />;
        case 'DonorSearchResults':
            return <BrowseDonorBody {...props} />;
        case 'ProtectedDonorSearchResults':
            return <BrowseProtectedDonorBody {...props} />;
        // case 'TissueSearchResults':
        //     return <BrowseTissueBody {...props} />;
        // case 'AssaySearchResults':
        //     return <BrowseAssayBody {...props} />;
        default:
            null;
    }
};

/**
 * Component for rendering the content on the Browse page, checking for user permissions and
 * displaying the appropriate content.
 * @param {Object} props
 * @returns
 */
const BrowseViewContent = (props) => {
    const { context, session } = props;
    const { userDownloadAccess, isAccessResolved } =
        useUserDownloadAccess(session);

    // Include `userDownloadAccess` in the props passed to child components
    const passProps = {
        ...props,
        context: {
            ...context,
            clear_filters: BROWSE_LINKS.file,
        },
        userDownloadAccess,
        isAccessResolved,
    };

    return (
        <SlidingSidebarLayout openByDefault={false}>
            <div className="sidebar-nav-body">
                <h3 className="browse-links-header">
                    Browse Production Data By
                </h3>
                <div className="browse-links">
                    <BrowseLink type="File" />
                    <BrowseLink
                        type="Donor"
                        userDownloadAccess={userDownloadAccess}
                        session={session}
                    />
                    <BrowseLink type="Tissue" disabled />
                    <BrowseLink type="Assay" disabled />
                </div>
            </div>
            <div className="browse-body">{renderBrowseBody(passProps)}</div>
        </SlidingSidebarLayout>
    );
};

export class BrowseViewBody extends React.PureComponent {
    constructor(props) {
        super(props);
        this.memoized = {
            transformedFacets: memoize(transformedFacets),
        };
    }

    render() {
        return (
            <div className="search-page-outer-container" id="content">
                <BrowseViewContent {...this.props} />
            </div>
        );
    }
}

export const BrowseFileSearchTable = (props) => {
    const {
        session,
        context,
        currentAction,
        schemas,
        selectedItems,
        onSelectItem,
        onResetSelectedItems,
        userDownloadAccess,
    } = props;
    const facets = transformedFacets(context, currentAction, schemas);
    const tableColumnClassName = 'results-column col';
    const facetColumnClassName = 'facets-column col-auto';

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    const passProps = _.omit(props, 'isFullscreen', 'toggleFullScreen');

    const aboveFacetListComponent = <BrowseViewAboveFacetListComponent />;
    const aboveTableComponent = (
        <BrowseViewAboveSearchTableControls
            topLeftChildren={
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
            }>
            <div className="d-flex gap-2">
                <DonorMetadataDownloadButton session={session} />
                {userDownloadAccess?.['protected'] ? (
                    <SelectedItemsDownloadButton
                        id="download_tsv_multiselect"
                        disabled={selectedItems.size === 0}
                        className="download-button has-access btn btn-primary btn-sm me-05 align-items-center"
                        {...{ selectedItems, session }}
                        analyticsAddItemsToCart>
                        <i className="icon icon-download fas me-03" />
                        Download {selectedItems.size} Selected Files
                    </SelectedItemsDownloadButton>
                ) : (
                    <OverlayTrigger
                        trigger={['hover', 'focus']}
                        placement="top"
                        overlay={renderProtectedAccessPopover()}>
                        <button
                            className="download-button btn btn-primary btn-sm me-05 align-items-center"
                            disabled={true}>
                            <i className="icon icon-download fas me-03" />
                            Download {selectedItems.size} Selected Files
                        </button>
                    </OverlayTrigger>
                )}
            </div>
        </BrowseViewAboveSearchTableControls>
    );

    const { columnExtensionMap, columns, hideFacets } =
        createBrowseFileColumnExtensionMap(selectedFileProps);

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
                columns,
                hideFacets,
            }}
            useCustomSelectionController
            hideStickyFooter
            isFullscreen={false}
            toggleFullScreen={() => {}}
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

    let BrowseType = null;
    switch (context['@type'][0]) {
        case 'FileSearchResults':
            BrowseType = 'File';
            break;
        case 'DonorSearchResults':
            BrowseType = 'Donor';
            break;
        default:
            break;
    }

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
                        <span>
                            {BrowseType ? `Browse By ${BrowseType}` : 'Browse'}
                        </span>
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

/**
 *  A column extension map specifically for browse view file tables.
 */
export function createBrowseFileColumnExtensionMap({
    selectedItems,
    onSelectItem,
    onResetSelectedItems,
}) {
    const columnExtensionMap = {
        ...originalColExtMap, // Pull in defaults for all tables
        // Then overwrite or add onto the ones that already are there:
        display_title: {
            default_hidden: true,
        },
        // Select all button
        '@type': {
            colTitle: (
                // Context now passed in from HeadersRowColumn (for file count)
                <SelectAllFilesButton
                    {...{ selectedItems, onSelectItem, onResetSelectedItems }}
                    type="checkbox"
                />
            ),
            hideTooltip: true,
            noSort: true,
            widthMap: { lg: 60, md: 60, sm: 60 },
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
                        className="pb-08 px-1 filename-popover-color"
                        popID="type-title-popover"
                        tooltip="Click for more information">
                        <img
                            width="500"
                            src="/static/img/Browse by file - file name breakdown.png"
                            alt="File nomenclature breakdown"
                        />
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
            widthMap: { lg: 102, md: 102, sm: 102 },
            render: function (result, parentProps) {
                // Get user download access from parent props
                const { userDownloadAccess = {} } = parentProps || {};
                const {
                    donors: {
                        0: {
                            ['@id']: donorLink,
                            display_title,
                            protected_donor,
                        } = {},
                    } = [],
                } = result || {};

                return donorLink ? (
                    <a
                        target="_blank"
                        href={
                            userDownloadAccess?.['protected'] &&
                            protected_donor?.['@id']
                                ? protected_donor?.['@id']
                                : donorLink
                        }>
                        {display_title}
                    </a>
                ) : null;
            },
        },
        // Assay
        'file_sets.libraries.assay.display_title': {
            widthMap: { lg: 100, md: 100, sm: 100 },
        },
        // Tissue
        'sample_summary.tissues': {
            widthMap: { lg: 145, md: 145, sm: 145 },
        },
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
        'file_status_tracking.release_dates.initial_release_date': {
            colTitle: 'Released',
            widthMap: { lg: 115, md: 115, sm: 115 },
            render: function (result, parentProps) {
                const value =
                    result?.file_status_tracking?.release_dates
                        ?.initial_release_date;
                if (!value) return null;
                return <span className="value text-end">{value}</span>;
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
        // Date Created
        date_created: {
            widthMap: { lg: 151, md: 151, sm: 151 },
            default_hidden: true,
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

    const columns = {
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
        'file_sets.sequencing.sequencer.display_title': {
            title: 'Platform',
        },
        'file_status_tracking.release_dates.initial_release_date': {
            title: 'Release Date',
        },
        file_size: {
            title: 'File Size',
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
        date_created: {
            title: 'Date Created',
        },
    };

    const hideFacets = [
        'dataset',
        'file_sets.libraries.analytes.samples.sample_sources.code',
        'status',
        'validation_errors.name',
        'version',
        'sample_summary.studies',
        'submission_centers.display_title',
        'software.display_title',
        'donors.tags',
    ];

    return { columnExtensionMap, columns, hideFacets };
}

pageTitleViews.register(BrowseViewPageTitle, 'Browse');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'selection');
pageTitleViews.register(BrowseViewPageTitle, 'Browse', 'add');
