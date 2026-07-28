import React from 'react';
import { SelectAllFilesButton } from '../../static-pages/components/SelectAllAboveTableComponent';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
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
import { buildDonorPeekMetadataHref } from './BrowseDonorPeekMetadata';

export { formatTissueData, formatAssayData } from './BrowseDonorBase';

export function createBrowseProtectedDonorColumnExtensionMap(props) {
    const { columnExtensionMap, columns, hideFacets } =
        createBaseDonorColumnExtensionMap(props);
    return {
        columnExtensionMap: {
            ...columnExtensionMap,
            // Cancer History
            'medical_history.cancer_history': {
                widthMap: { lg: 160, md: 160, sm: 160 },
                colAlignment: 'text-start',
                render: function (result) {
                    const cancer_history =
                        result?.medical_history?.[0]?.cancer_history;
                    return cancer_history ? (
                        <span className="value text-start">
                            {cancer_history}
                        </span>
                    ) : null;
                },
            },
            // Tobacco Use
            'medical_history.tobacco_use': {
                widthMap: { lg: 115, md: 115, sm: 115 },
                colAlignment: 'text-start',
                render: function (result) {
                    const tobacco_use =
                        result?.medical_history?.[0]?.tobacco_use;
                    return tobacco_use ? (
                        <span className="value text-start">{tobacco_use}</span>
                    ) : null;
                },
            },
            // Alcohol Use
            'medical_history.alcohol_use': {
                widthMap: { lg: 105, md: 105, sm: 105 },
                colAlignment: 'text-start',
                render: function (result) {
                    const alcohol_use =
                        result?.medical_history?.[0]?.alcohol_use;
                    return alcohol_use ? (
                        <span className="value text-start">{alcohol_use}</span>
                    ) : null;
                },
            },
        },
        columns: {
            ...columns,
            'medical_history.cancer_history': { title: 'Cancer History' },
            'medical_history.tobacco_use': { title: 'Tobacco' },
            'medical_history.alcohol_use': { title: 'Alcohol' },
        },
        hideFacets,
    };
}

// Search Table
const BrowseProtectedDonorSearchTable = (props) => {
    const {
        session,
        context,
        currentAction,
        schemas,
        selectedItems,
        onSelectItem,
        onResetSelectedItems,
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
            clear_filters: BROWSE_LINKS.protected_donor,
        },
        defaultColAlignment: 'text-left',
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
        createBrowseProtectedDonorColumnExtensionMap(selectedFileProps);

    const facetListSortFxns = {
        hardy_scale: (a, b) => a.key - b.key,
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

// Browse Protected Donor Body Component
export const BrowseProtectedDonorBody = (props) => {
    const { context, alerts, href, userDownloadAccess, isAccessResolved } =
        props;
    return (
        <React.Fragment>
            <Alerts alerts={alerts} className="mt-2" />
            <BrowseDonorVizWrapper {...props} mapping="protected-donor" />
            <hr />
            <DonorDataProvider
                key={href}
                buildHref={buildDonorPeekMetadataHref}>
                <BrowseViewControllerWithSelections {...props}>
                    <BrowseProtectedDonorSearchTable />
                </BrowseViewControllerWithSelections>
                {context?.total === 0 && (
                    <NoResultsBrowseModal
                        type="protected_donor"
                        context={context}
                        href={href}
                        userDownloadAccess={userDownloadAccess}
                        isAccessResolved={isAccessResolved}
                    />
                )}
            </DonorDataProvider>
        </React.Fragment>
    );
};
