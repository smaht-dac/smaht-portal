import React, { useState, useEffect, useMemo } from 'react';
import * as _ from 'underscore';
import { SelectAllFilesButton } from '../../static-pages/components/SelectAllAboveTableComponent';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowseViewAboveFacetListComponent } from './BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './BrowseViewAboveSearchTableControls';
import {
    BROWSE_STATUS_FILTERS,
    BROWSE_LINKS,
    NoResultsBrowseModal,
} from '../BrowseView';
import { columnExtensionMap as originalColExtMap } from '../columnExtensionMap';
import { transformedFacets } from '../SearchView';
import { CustomTableRowToggleOpenButton } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons/basicColumnExtensionMap';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { BrowseDonorVizWrapper } from './BrowseDonorVizWrapper';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { DonorMetadataDownloadButton } from '../../shared/DonorMetadataDownloadButton';

// Sttatistics for Publication Browse
const PublicationStatistics = ({ context, isLoading = false }) => {
    console.log('PublicationStatistics props', context);
    const publicationCount = context?.total || 0;
    const journalCount =
        context?.facets?.find((f) => f.field === 'journal')?.terms?.length || 0;
    return (
        <div className="data-summary d-flex flex-column gap-3">
            <div className="d-flex gap-3">
                <div className="donor-statistic tissues d-flex flex-column p-2 gap-2">
                    <div className="donor-statistic-label text-center">
                        <i className="icon icon-lungs fas"></i>Publications
                    </div>
                    <div className="donor-statistic-value text-center">
                        {publicationCount}
                    </div>
                </div>
                <div className="donor-statistic assays d-flex flex-column p-2 gap-2">
                    <div className="donor-statistic-label text-center">
                        <i className="icon icon-dna fas"></i>Journals /
                        Preprints
                    </div>
                    <div className="donor-statistic-value text-center">
                        {journalCount}
                    </div>
                </div>
                <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                    <div className="donor-statistic-label text-center">
                        <i className="icon icon-file fas"></i>Files Analyzed
                    </div>
                    <div className="donor-statistic-value text-center">0</div>
                </div>
            </div>
        </div>
    );
};

// A column extension map specifically for browse view file tables.
export function createBrowsePublicationColumnExtensionMap({
    selectedItems,
    onSelectItem,
    onResetSelectedItems,
}) {
    const columnExtensionMap = {
        ...originalColExtMap, // Pull in defaults for all tables
        // Then overwrite or add onto the ones that already are there:
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
        // File
        annotated_filename: {
            widthMap: { lg: 120, md: 120, sm: 120 },
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
        // Date Created
        date_created: {
            widthMap: { lg: 151, md: 151, sm: 151 },
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
        annotated_filename: {
            title: 'Donor',
        },
    };

    const hideFacets = [];

    return { columnExtensionMap, columns, hideFacets };
}

// Search Table
const BrowsePublicationSearchTable = (props) => {
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

    // Pass modified context to CommonSearchView to set default filters
    const passProps = {
        ...props,
        context: {
            ...context,
            clear_filters: BROWSE_LINKS.publication,
        },
    };

    const aboveFacetListComponent = <BrowseViewAboveFacetListComponent />;
    const aboveTableComponent = (
        <BrowseViewAboveSearchTableControls
            topLeftChildren={
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
            }></BrowseViewAboveSearchTableControls>
    );

    const { columnExtensionMap, columns, hideFacets } =
        createBrowsePublicationColumnExtensionMap(selectedFileProps);

    // Custom sort functions for specific facet lists
    const facetListSortFxns = {
        hardy_scale: (a, b) => {
            return a.key - b.key;
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
                facetListSortFxns,
                aboveFacetListComponent,
                aboveTableComponent,
                columns,
                hideFacets,
            }}
            useCustomSelectionController
            hideStickyFooter
            termTransformFxn={Schemas.Term.toName}
            separateSingleTermFacets={false}
            rowHeight={31}
            openRowHeight={100}
        />
    );
};

// Browse Publication Body Component
export const BrowsePublicationBody = (props) => {
    const { context, alerts, href, userDownloadAccess, isAccessResolved } =
        props;

    useEffect(() => {
        console.log('BrowsePublicationBody props', props);
    }, []);

    return (
        <div className="browse-publication-body text-gray-70">
            <div className="introduction">
                <div className="text">
                    <span>
                        <span className="text-slate-70 fw-medium">
                            Benchmarking
                        </span>
                        <span className="text-gray-20"> | </span>
                        <span className="text-slate-70 fw-light">
                            Publication
                        </span>
                    </span>
                    <h2 className="text-gray-70">
                        Benchmarking Somatic Mutation Detection
                    </h2>
                    <p>
                        Somatic mosaicism is important yet hard to detect. The
                        SMaHT Network benchmarked sequencing and computational
                        methods across multiple samples using deep short- and
                        long-read data. We integrated bulk, single-cell, and
                        duplex approaches, and made use of donor-specific
                        assemblies and the pangenome for accurate detection of
                        somatic mutation, identifying optimal, genome-wide
                        strategies.
                    </p>
                    <p>
                        Here, we present the compendium of papers as the result
                        of the benchmarking studies from the SMaHT Network.
                    </p>
                    <div className="statistics-block">
                        <PublicationStatistics context={context} />
                    </div>
                </div>
                <div className="image">
                    <img
                        src="/static/img/publication-page-header-img.png"
                        alt="Publication page header image"
                    />
                </div>
            </div>
            <BrowseViewControllerWithSelections {...props}>
                <BrowsePublicationSearchTable />
            </BrowseViewControllerWithSelections>
        </div>
    );
};
