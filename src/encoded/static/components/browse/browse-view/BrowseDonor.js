import React, { useState, useEffect, useMemo } from 'react';
import * as _ from 'underscore';
import { SelectAllFilesButton } from '../../static-pages/components/SelectAllAboveTableComponent';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { tissueToCategory } from '../../util/data';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowseViewAboveFacetListComponent } from './BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './BrowseViewAboveSearchTableControls';
import { BROWSE_STATUS_FILTERS, BROWSE_LINKS } from '../BrowseView';
import { columnExtensionMap as originalColExtMap } from '../columnExtensionMap';
import { transformedFacets } from '../SearchView';
import { CustomTableRowToggleOpenButton } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons/basicColumnExtensionMap';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { BrowseDonorVizWrapper } from './BrowseDonorVizWrapper';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { DonorMetadataDownloadButton } from '../../shared/DonorMetadataDownloadButton';

/**
 * Format tissue data by grouping it into predefined categories.
 * @param {*} data - The raw tissue data to format.
 * @returns {Object} - The formatted tissue data grouped by category.
 */
const formatTissueData = (data) => {
    const defaultTissueCategories = {
        Ectoderm: {
            title: 'Ectoderm',
            values: [],
        },
        Endoderm: {
            title: 'Endoderm',
            values: [],
        },
        Mesoderm: {
            title: 'Mesoderm',
            values: [],
        },
        'Germ cells': {
            title: 'Germ',
            values: [],
        },
        'Clinically accessible': {
            title: 'Clinical',
            values: [],
        },
    };

    if (!data) return defaultTissueCategories;

    // group data by tissue category
    const grouped_data = data.reduce((acc, { key }) => {
        // if category is not present in lookup map, assign to 'Unknown' group
        const tissueCategory = tissueToCategory.get(key) || 'Unknown';

        if (!acc[tissueCategory]) {
            acc[tissueCategory] = { title: tissueCategory, values: [key] };
        } else {
            // If category exists, push tissue to that category
            acc[tissueCategory].values.push(key);
        }
        return acc;
    }, defaultTissueCategories);

    return grouped_data;
};

/**
 * TissueDetailPane component that displays tissue data for a donor. Fetches tissue
 * data based on the donor's display title and formats it for display.
 * @param {*} itemDetails - The details of the item to display.
 * @returns TissueDetailPane component that displays tissue data for a donor.
 */
const TissueDetailPane = React.memo(function TissueDetailPane({
    itemDetails,
    panelDetails,
}) {
    const [tissueData, setTissueData] = useState(null);

    useEffect(() => {
        const searchURL = `/search/?type=File&${BROWSE_STATUS_FILTERS}&donors.display_title=${itemDetails.display_title}`;

        // Use cached search results if available from parent
        if (panelDetails?.searchCache) {
            setTissueData(
                formatTissueData(
                    panelDetails?.searchCache?.facets?.find(
                        (f) => f.field === 'sample_summary.tissues'
                    )?.terms || []
                )
            );
        } else {
            panelDetails.searchRequest(searchURL);
        }
    }, [panelDetails.searchCache]);

    return tissueData && Object?.keys(tissueData)?.length > 0 ? (
        <div className="detail-content">
            <div className="detail-header">
                <i className="icon icon-lungs fas"></i>
                <b>
                    {/* Calculate total tissue count */}
                    {Object.keys(tissueData).reduce(
                        (acc, key) => acc + tissueData[key].values.length,
                        0
                    )}{' '}
                </b>
                Tissues for Donor {itemDetails.display_title}
            </div>
            <div className="detail-body">
                {Object?.keys(tissueData).map((category, i) => {
                    const tissues = tissueData[category]['values'] || [];

                    return (
                        <div key={i} className="tissue-category">
                            <div className="header-container">
                                <h3>{tissueData[category]?.title}</h3>
                            </div>
                            <div className="tissue-list-container">
                                {tissues.length > 0 ? (
                                    <ul>
                                        {tissues
                                            .sort((a, b) => a.localeCompare(b))
                                            .map((tissue, j) => {
                                                // Create a link to search for files with this tissue
                                                return (
                                                    <li key={j}>
                                                        <span>
                                                            <a
                                                                href={`/search/?type=File&${BROWSE_STATUS_FILTERS}&donors.display_title=${itemDetails.display_title}&sample_summary.tissues=${tissue}`}
                                                                target="_blank"
                                                                rel="noreferrer noopener">
                                                                {tissue}
                                                            </a>
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                ) : (
                                    <span className="text-secondary">N/A</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    ) : (
        <div className="detail-content">
            <div className="detail-header">
                <i className="icon icon-spin icon-circle-notch"></i>
            </div>
        </div>
    );
});

/**
 * Format tissue data by grouping it into predefined categories.
 * @param {*} data - The raw tissue data to format.
 * @returns {Object} - The formatted tissue data grouped by category.
 */
const formatAssayData = (data) => {
    const defaultAssayCategories = {
        'Bulk WGS': {
            title: 'Bulk WGS',
            values: [],
        },
        'Bulk RNA-seq': {
            title: 'RNA-seq',
            values: [],
        },
        'Duplex-seq WGS': {
            title: 'Duplex-seq',
            values: [],
        },
        WGA: {
            title: 'Single-cell WGS',
            values: [],
        },
        'Repeat Element Targeted Sequencing': {
            title: 'Targeted Seq',
            values: [],
        },
        'Single-cell RNA-seq': {
            title: 'Single-cell RNA-Seq',
            values: [],
        },
        Other: {
            title: 'Other',
            values: [],
        },
    };

    // group data by assay category
    const grouped_data = data.reduce((acc, item) => {
        const assayCategory = item?.key || 'Other';

        if (!acc[assayCategory]) {
            acc[assayCategory] = {
                title: assayCategory,
                values: item?.terms.map((t) => t.key),
            };
        } else {
            // If category exists, push tissue to that category
            acc[assayCategory].values.push(...item?.terms.map((t) => t.key));
        }
        return acc;
    }, defaultAssayCategories);

    return grouped_data;
};

/**
 * AssayDetailPane component that displays assay data for a donor. Fetches assay
 * data based on the donor's display title and formats it for display.
 * @param {*} itemDetails - The details of the item to display.
 * @returns AssayDetailPane component that displays tissue data for a donor.
 */
const AssayDetailPane = React.memo(function AssayDetailPane({
    itemDetails,
    panelDetails,
}) {
    const [assayData, setAssayData] = useState(null);

    useEffect(() => {
        const searchURL = `/search/?type=File&${BROWSE_STATUS_FILTERS}&donors.display_title=${itemDetails.display_title}`;

        // Use cached search results if available from parent
        if (panelDetails?.searchCache) {
            setAssayData(
                formatAssayData(
                    panelDetails?.searchCache?.facets?.find(
                        (f) =>
                            f.field ===
                            'file_sets.libraries.assay.display_title'
                    )?.terms || []
                )
            );
        } else {
            panelDetails.searchRequest(searchURL);
        }
    }, [panelDetails.searchCache]);

    return assayData && Object?.keys(assayData)?.length > 0 ? (
        <div className="detail-content">
            <div className="detail-header">
                <i className="icon icon-dna fas"></i>
                <b>
                    {/* Calculate total tissue count */}
                    {Object.keys(assayData).reduce((acc, key) => {
                        return acc + assayData[key].values.length;
                    }, 0)}{' '}
                </b>
                Assays across all tissues
            </div>
            <div className="detail-body">
                {Object?.keys(assayData).map((category, i) => {
                    const assays = assayData[category]['values'] || [];
                    return (
                        <div key={i} className="tissue-category">
                            <div className="header-container">
                                <h3>{assayData[category]?.title}</h3>
                            </div>
                            <div className="tissue-list-container">
                                {assays.length > 0 ? (
                                    <ul>
                                        {assays
                                            .sort((a, b) => a.localeCompare(b))
                                            .map((assay, j) => {
                                                // Create a link to search for files with this assay
                                                return (
                                                    <li key={j}>
                                                        <span>
                                                            <a
                                                                href={`/search/?type=File&${BROWSE_STATUS_FILTERS}&donors.display_title=${itemDetails.display_title}&&file_sets.libraries.assay.display_title=${assay}`}
                                                                target="_blank"
                                                                rel="noreferrer noopener">
                                                                {assay}
                                                            </a>
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                ) : (
                                    <span className="text-secondary">N/A</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    ) : (
        <div className="detail-content">
            <div className="detail-header">
                <i className="icon icon-spin icon-circle-notch"></i>
            </div>
        </div>
    );
});

// Detail Pane
const customRenderDetailPane = (
    itemDetails = {},
    rowIndex,
    panelWidth,
    panelDetails = {}
) => {
    // set the corresponding detail pane based on `detailPaneType`
    let detailPane;

    switch (panelDetails?.detailPaneType) {
        case 'tissue':
            detailPane = (
                <TissueDetailPane
                    itemDetails={itemDetails}
                    panelDetails={panelDetails}
                />
            );
            break;
        case 'assay':
            detailPane = (
                <AssayDetailPane
                    itemDetails={itemDetails}
                    panelDetails={panelDetails}
                />
            );
            break;
        default:
            break;
    }

    return <div className="detail-pane">{detailPane}</div>;
};

// A column extension map specifically for browse view file tables.
export function createBrowseDonorColumnExtensionMap({
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
            colTitle: <>Donor</>,
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
        // Age
        age: {
            widthMap: { lg: 100, md: 100, sm: 100 },
            colTitle: (
                <span>
                    Age
                    <i
                        className="icon icon-fw icon-info-circle fas"
                        data-tip="Note: ages 89 and above are denoted as 89+"
                    />
                </span>
            ),
            render: function (result, parentProps) {
                if (!result?.age) return null;
                else {
                    const ageString = result.age === 89 ? '89+' : result?.age;
                    return (
                        <span className="value text-center w-100">
                            {ageString}
                        </span>
                    );
                }
            },
        },
        // Sex
        sex: {
            widthMap: { lg: 80, md: 80, sm: 80 },
            render: function (result, parentProps) {
                return (
                    <span className="value text-center w-100">
                        {result?.sex?.substring(0, 1) ?? null}
                    </span>
                );
            },
        },
        // Tissues
        tissues: {
            noSort: true,
            colAlignment: 'text-end',
            widthMap: { lg: 120, md: 120, sm: 120 },
            render: function (result, parentProps) {
                const {
                    href,
                    context,
                    rowNumber,
                    detailOpen,
                    toggleDetailOpen,
                    detailPaneType,
                    handleCellClick,
                } = parentProps;

                const { data, loading } = parentProps?.fetchedProps;

                const tissueCount = data?.find(
                    (f) => f.field === 'sample_summary.tissues'
                )?.terms?.length;

                if (loading) {
                    return <span className="value text-center loading"></span>;
                } else {
                    return tissueCount ? (
                        <div
                            className={
                                'inner-value-container' +
                                (detailOpen ? ' detail-open' : ' detail-closed')
                            }>
                            <CustomTableRowToggleOpenButton
                                {...{
                                    result,
                                    href,
                                    context,
                                    rowNumber,
                                    detailOpen,
                                    toggleDetailOpen,
                                    isActive: detailPaneType === 'tissue',
                                    customToggleDetailClose: (props) => {
                                        if (detailPaneType === 'assay') {
                                            handleCellClick('tissue');
                                        } else {
                                            handleCellClick(null);
                                            toggleDetailOpen();
                                        }
                                    },
                                    customToggleDetailOpen: (props) => {
                                        handleCellClick('tissue');
                                        toggleDetailOpen();
                                    },
                                    toggleOpenIcon: (
                                        <>
                                            {tissueCount} Tissue
                                            {tissueCount > 1 ? 's' : ''}
                                            <i className="icon icon-circle-plus"></i>
                                        </>
                                    ),
                                    toggleCloseIcon: (
                                        <>
                                            {tissueCount} Tissue
                                            {tissueCount > 1 ? 's' : ''}
                                            <i className="icon icon-circle-minus"></i>
                                        </>
                                    ),
                                }}>
                                {tissueCount} Tissue
                                {tissueCount > 1 ? 's' : ''}
                            </CustomTableRowToggleOpenButton>
                        </div>
                    ) : null;
                }
            },
        },
        // Assays
        assays: {
            noSort: true,
            colAlignment: 'text-end',
            widthMap: { lg: 120, md: 120, sm: 120 },
            render: function (result, parentProps) {
                const {
                    href,
                    context,
                    rowNumber,
                    detailOpen,
                    toggleDetailOpen,
                    detailPaneType,
                    handleCellClick,
                } = parentProps;

                const { data, loading, error } = parentProps?.fetchedProps;

                const assayCount = data
                    ?.find(
                        (f) =>
                            f.field ===
                            'file_sets.libraries.assay.display_title'
                    )
                    ?.terms?.reduce(
                        (acc, curr) => acc + (curr?.terms?.length ?? 1),
                        0
                    );

                if (loading) {
                    return <span className="value text-center loading"></span>;
                } else {
                    return assayCount ? (
                        <div
                            className={
                                'inner-value-container' +
                                (detailOpen ? ' detail-open' : ' detail-closed')
                            }>
                            <CustomTableRowToggleOpenButton
                                {...{
                                    result,
                                    href,
                                    context,
                                    rowNumber,
                                    detailOpen,
                                    toggleDetailOpen,
                                    isActive: detailPaneType === 'assay',
                                    customToggleDetailClose: (props) => {
                                        if (detailPaneType === 'tissue') {
                                            handleCellClick('assay');
                                        } else {
                                            handleCellClick(null);
                                            toggleDetailOpen();
                                        }
                                    },
                                    customToggleDetailOpen: (props) => {
                                        handleCellClick('assay');
                                        toggleDetailOpen();
                                    },
                                    toggleOpenIcon: (
                                        <>
                                            {assayCount} Assay
                                            {assayCount > 1 ? 's' : ''}
                                            <i className="icon icon-circle-plus"></i>
                                        </>
                                    ),
                                    toggleCloseIcon: (
                                        <>
                                            {assayCount} Assay
                                            {assayCount > 1 ? 's' : ''}
                                            <i className="icon icon-circle-minus"></i>
                                        </>
                                    ),
                                }}></CustomTableRowToggleOpenButton>
                        </div>
                    ) : null;
                }
            },
        },
        // Files
        files: {
            noSort: true,
            colAlignment: 'text-end',
            widthMap: { lg: 90, md: 90, sm: 90 },
            render: function (result, parentProps) {
                const { data, loading, error } = parentProps?.fetchedProps;

                const fileCount = data
                    ?.find((f) => f.field === 'type')
                    ?.terms?.find((term) => term.key === 'File')?.doc_count;

                if (loading) {
                    return (
                        <span className="value text-center loading">
                            {/* <i className="icon icon-circle-notch icon-spin fas"></i> */}
                        </span>
                    );
                } else {
                    return fileCount ? (
                        <a
                            className="value text-center"
                            href={`/browse/?type=File&${BROWSE_STATUS_FILTERS}&donors.display_title=${result?.display_title}`}>
                            {fileCount} File{fileCount > 1 ? 's' : ''}
                        </a>
                    ) : null;
                }
            },
        },
        file_size: {
            noSort: true,
            colAlignment: 'text-end',
            widthMap: { lg: 90, md: 90, sm: 90 },
            render: function (result, parentProps) {
                const {
                    href,
                    context,
                    rowNumber,
                    detailOpen,
                    toggleDetailOpen,
                } = parentProps;

                const { data, loading, error } = parentProps?.fetchedProps;

                const fileSize = data?.find(
                    (f) => f.field === 'file_size'
                )?.sum;

                if (loading) {
                    return (
                        <span className="value text-center loading">
                            {/* <i className="icon icon-circle-notch icon-spin fas"></i> */}
                        </span>
                    );
                } else {
                    return fileSize ? (
                        <span className="value text-center">
                            {valueTransforms.bytesToLargerUnit(
                                fileSize,
                                0,
                                false,
                                true
                            )}{' '}
                            {valueTransforms.bytesToLargerUnit(
                                fileSize,
                                0,
                                true,
                                false
                            )}
                        </span>
                    ) : null;
                }
            },
        },
        // Hardy Scale
        hardy_scale: {
            widthMap: { lg: 140, md: 140, sm: 140 },
            render: function (result, parentProps) {
                return (
                    <span className="value text-center">
                        {result?.hardy_scale ?? null}
                    </span>
                );
            },
        },
        // Data Type
        data_type: {
            noSort: true,
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
        // Released
        'file_status_tracking.release_dates.initial_release_date': {
            colTitle: 'Released',
            widthMap: { lg: 115, md: 115, sm: 115 },
            render: function (result, parentProps) {
                const value = result?.file_status_tracking?.release_dates?.initial_release_date;
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
        annotated_filename: {
            title: 'Donor',
        },
        age: {
            title: 'Age',
        },
        sex: {
            title: 'Sex',
        },
        tissues: {
            title: 'Tissues',
        },
        assays: {
            title: 'Assays',
        },
        files: {
            title: 'Files',
        },
        file_size: {
            title: 'File Size',
        },
        hardy_scale: {
            title: 'Hardy Scale',
        },
    };

    const hideFacets = [
        'tissues',
        'dataset',
        'file_sets.libraries.analytes.samples.sample_sources.code',
        'status',
        'validation_errors.name',
        'version',
        'study',
        'submission_centers.display_title',
        'software.display_title',
        'tags',
    ];

    return { columnExtensionMap, columns, hideFacets };
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

    // Pass modified context to CommonSearchView to set default filters
    const passProps = {
        ...props,
        context: {
            ...context,
            clear_filters: BROWSE_LINKS.donor,
        },
        // Provide a search for populating custom column(s)
        customColumnSearchHref: (result) =>
            `/peek-metadata/?additional_facet=file_size&${BROWSE_STATUS_FILTERS}&type=File&donors.display_title=` +
            result?.display_title,
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
                <i className="icon icon-users fas"></i> Welcome to the SMaHT
                Data Portal! Please{' '}
                <a href={href?.replace('type=Donor', 'type=ProtectedDonor')}>
                    click here
                </a>{' '}
                to load complete donor data.
            </span>
        </div>
    ) : null;
};

// Browse Donor Body Component
export const BrowseDonorBody = (props) => {
    const [showRedirectBanner, setShowRedirectBanner] = useState(false);
    const { session, userDownloadAccess } = props;

    useEffect(() => {
        if (session && userDownloadAccess?.['protected']) {
            setShowRedirectBanner(true);
        }
    }, [session, userDownloadAccess]);

    return (
        <>
            {showRedirectBanner && <RedirectBanner href={props?.href} />}
            <BrowseDonorVizWrapper {...props} mapping="donor" />
            <hr />
            <BrowseViewControllerWithSelections {...props}>
                <BrowseDonorSearchTable />
            </BrowseViewControllerWithSelections>
        </>
    );
};
