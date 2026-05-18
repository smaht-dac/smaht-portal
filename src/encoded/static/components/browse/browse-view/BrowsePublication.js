import React, { useState, useEffect, useMemo } from 'react';
import * as _ from 'underscore';
import { SelectAllFilesButton } from '../../static-pages/components/SelectAllAboveTableComponent';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowseViewAboveFacetListComponent } from './BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './BrowseViewAboveSearchTableControls';
import { BrowsePublicationSearchTable } from '../components/PublicationSearchTable';
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
        <div className="data-summary">
            <div className="donor-statistic publications d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Publications
                </div>
                <div className="donor-statistic-value text-center">
                    {publicationCount}
                </div>
            </div>
            <div className="donor-statistic journals d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Journals / Preprints
                </div>
                <div className="donor-statistic-value text-center">
                    {journalCount}
                </div>
            </div>
            <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Files Analyzed
                </div>
                <div className="donor-statistic-value text-center">0</div>
            </div>
        </div>
    );
};

// Browse Publication Body Component
export const BrowsePublicationBody = (props) => {
    const { context } = props;

    useEffect(() => {
        console.log('BrowsePublicationBody props', props);
    }, []);

    return (
        <div className="browse-publication-body text-gray-70">
            <div className="introduction">
                <div className="text">
                    <div>
                        <span>
                            <span className="text-slate-70 fw-medium">
                                Benchmarking
                            </span>
                            <span className="text-gray-20"> | </span>
                            <span className="text-slate-70 fw-light">
                                Publication
                            </span>
                        </span>
                        <h2 className="text-gray-70 fw-semibold fs-3">
                            Benchmarking Somatic Mutation Detection
                        </h2>
                        <p className="fw-light">
                            Somatic mosaicism is important yet hard to detect.
                            The SMaHT Network benchmarked sequencing and
                            computational methods across multiple samples using
                            deep short- and long-read data. We integrated bulk,
                            single-cell, and duplex approaches, and made use of
                            donor-specific assemblies and the pangenome for
                            accurate detection of somatic mutation, identifying
                            optimal, genome-wide strategies.
                        </p>
                        <p className="fw-light">
                            Here, we present the compendium of papers as the
                            result of the benchmarking studies from the SMaHT
                            Network.
                        </p>
                    </div>
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
                <BrowsePublicationSearchTable
                    {...props}
                    header_title="Variant Detection from SMaHT Working Groups"
                />
            </BrowseViewControllerWithSelections>
        </div>
    );
};
