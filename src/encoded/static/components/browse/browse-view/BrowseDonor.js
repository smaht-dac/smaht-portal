import React, { useState, useEffect } from 'react';
import { SelectAllFilesButton } from '../../static-pages/components/SelectAllAboveTableComponent';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowseViewAboveFacetListComponent } from './BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './BrowseViewAboveSearchTableControls';
import {
    BROWSE_LINKS,
    NoResultsBrowseModal,
} from '../BrowseView';
import { transformedFacets } from '../SearchView';
import { BrowseDonorVizWrapper } from './BrowseDonorVizWrapper';
import { DonorMetadataDownloadButton } from '../../shared/DonorMetadataDownloadButton';
import {
    customRenderDetailPane,
    createBaseDonorColumnExtensionMap,
} from './BrowseDonorBase';
import { DonorDataProvider } from './BrowseDonorDataProvider';

export function createBrowseDonorColumnExtensionMap(props) {
    const { columnExtensionMap, columns, hideFacets } =
        createBaseDonorColumnExtensionMap(props);
    return {
        columnExtensionMap,
        columns,
        hideFacets,
    };
}

// Search Table
const BrowseDonorSearchTable = (props) => {
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

    const passProps = {
        ...props,
        context: {
            ...context,
            clear_filters: BROWSE_LINKS.donor,
        },
    };

    const aboveFacetListComponent = <BrowseViewAboveFacetListComponent />;
    const aboveTableComponent = (
        <BrowseViewAboveSearchTableControls
            topLeftChildren={
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
            }>
            <div className="d-flex gap-2">
                <DonorMetadataDownloadButton session={session} />
            </div>
        </BrowseViewAboveSearchTableControls>
    );

    const { columnExtensionMap, columns, hideFacets } =
        createBrowseDonorColumnExtensionMap(selectedFileProps);

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
            renderDetailPane={customRenderDetailPane}
            useCustomSelectionController
            hideStickyFooter
            termTransformFxn={Schemas.Term.toName}
            separateSingleTermFacets={false}
            rowHeight={31}
            openRowHeight={100}
        />
    );
};

// Banner Component to allow redirect to ProtectedDonor view after login
const RedirectBanner = ({ href }) => {
    return href ? (
        <div className="callout data-available">
            <span className="callout-text">
                <i className="icon icon-users fas"></i> You are currently
                viewing limited donor information. If you have dbGaP- or
                DUA-based access,{' '}
                <a href={href?.replace('type=Donor', 'type=ProtectedDonor')}>
                    click here
                </a>{' '}
                to view full donor information.
            </span>
        </div>
    ) : null;
};

// Browse Donor Body Component
export const BrowseDonorBody = (props) => {
    const [showRedirectBanner, setShowRedirectBanner] = useState(false);
    const { context, session, href, userDownloadAccess, isAccessResolved } =
        props;

    useEffect(() => {
        if (session && userDownloadAccess?.['protected']) {
            setShowRedirectBanner(true);
        }
    }, [session, userDownloadAccess]);

    return (
        <DonorDataProvider>
            <>
                {showRedirectBanner && <RedirectBanner href={props?.href} />}
                <BrowseDonorVizWrapper {...props} mapping="donor" />
                <hr />
                <BrowseViewControllerWithSelections {...props}>
                    <BrowseDonorSearchTable />
                </BrowseViewControllerWithSelections>
                {context?.total === 0 && (
                    <NoResultsBrowseModal
                        type="donor"
                        context={context}
                        href={href}
                        userDownloadAccess={userDownloadAccess}
                        isAccessResolved={isAccessResolved}
                    />
                )}
            </>
        </DonorDataProvider>
    );
};
