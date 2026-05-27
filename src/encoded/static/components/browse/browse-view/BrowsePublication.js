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

// Browse Publication Body Component
export const BrowsePublicationBody = (props) => {
    const { context } = props;

    useEffect(() => {
        console.log('BrowsePublicationBody props', props);
    }, []);

    return (
        <div className="browse-publication-body text-gray-70">
            <BrowseViewControllerWithSelections {...props}>
                <BrowsePublicationSearchTable {...props} />
            </BrowseViewControllerWithSelections>
        </div>
    );
};
