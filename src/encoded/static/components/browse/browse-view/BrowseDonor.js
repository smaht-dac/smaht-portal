import React, { useState, useEffect } from 'react';

import * as _ from 'underscore';
import { Popover } from 'react-bootstrap';
import url from 'url';

import {
    SelectAllFilesButton,
    SelectedItemsDownloadButton,
} from '../../static-pages/components/SelectAllAboveTableComponent';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { SearchView as CommonSearchView } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/SearchView';
import { Schemas } from '../../util';
import { tissueToCategory } from '../../util/data';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { BrowseViewControllerWithSelections } from '../../static-pages/components/TableControllerWithSelections';
import { BrowseViewAboveFacetListComponent } from './BrowseViewAboveFacetListComponent';
import { BrowseViewAboveSearchTableControls } from './BrowseViewAboveSearchTableControls';
import { BrowseSummaryStatController } from './BrowseSummaryStatController';
import { DonorMetadataDownloadButton } from '../BrowseView';
import { columnExtensionMap as originalColExtMap } from '../columnExtensionMap';
import { transformedFacets } from '../SearchView';
import { FacetCharts } from './../components/FacetCharts';
import DonorCohortViewChart from '../components/DonorCohortViewChart';
import { renderHardyScaleDescriptionPopover } from '../../item-pages/components/donor-overview/ProtectedDonorViewDataCards';
import { CustomTableRowToggleOpenButton } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons/basicColumnExtensionMap';

import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

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
        Fibroblast: {
            title: 'Fibroblast',
            values: [],
        },
    };

    if(!data) return defaultTissueCategories;

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
        const searchURL = `/search/?type=File&donors.display_title=${itemDetails.display_title}`;

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
                                        {tissues.map((tissue, j) => {
                                            // Create a link to search for files with this tissue
                                            return (
                                                <li key={j}>
                                                    <span>
                                                        <a
                                                            href={`/search/?type=File&donors.display_title=${itemDetails.display_title}&sample_summary.tissues=${tissue}`}
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
        const searchURL = `/search/?type=File&donors.display_title=${itemDetails.display_title}`;

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
                                        {assays.map((assay, j) => {
                                            // Create a link to search for files with this assay
                                            return (
                                                <li key={j}>
                                                    <span>
                                                        <a
                                                            href={`/search/?type=File&donors.display_title=${itemDetails.display_title}&&file_sets.libraries.assay.display_title=${assay}`}
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
            widthMap: { lg: 80, md: 80, sm: 80 },
            render: function (result, parentProps) {
                return <span>{result?.age ?? null}</span>;
            },
        },
        // Sex
        sex: {
            widthMap: { lg: 80, md: 80, sm: 80 },
            render: function (result, parentProps) {
                return <span>{result?.sex?.substring(0, 1) ?? null}</span>;
            },
        },
        // Tissues
        'sample_summary.tissues': {
            noSort: true,
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

                const tissueCount = data?.find(
                    (f) => f.field === 'sample_summary.tissues'
                )?.terms?.length;

                if (loading) {
                    return (
                        <span className="value text-center loading">
                            {/* <i className="icon icon-circle-notch icon-spin fas"></i> */}
                        </span>
                    );
                } else {
                    return tissueCount ? (
                        <div
                            className={
                                'inner-value-container' +
                                (detailOpen ? ' detail-open' : ' detail-closed')
                            }>
                            <a
                                className="value text-center"
                                href={`/search/?type=File&donors.display_title=${result?.display_title}`}>
                                {tissueCount} Tissue
                                {tissueCount > 1 ? 's' : ''}
                            </a>
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
                                        <i className="icon icon-circle-plus"></i>
                                    ),
                                    toggleCloseIcon: (
                                        <i className="icon icon-circle-minus"></i>
                                    ),
                                }}>
                            </CustomTableRowToggleOpenButton>
                        </div>
                    ) : null;
                }
            },
        },
        // Assays
        assays: {
            noSort: true,
            widthMap: { lg: 105, md: 100, sm: 100 },
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

                const assayCount = data?.find(
                    (f) => f.field === 'file_sets.libraries.assay.display_title'
                )?.terms?.length;

                if (loading) {
                    return (
                        <span className="value text-center loading">
                            {/* <i className="icon icon-circle-notch icon-spin fas"></i> */}
                        </span>
                    );
                } else {
                    return assayCount ? (
                        <div
                            className={
                                'inner-value-container' +
                                (detailOpen ? ' detail-open' : ' detail-closed')
                            }>
                            <a
                                className="value text-center"
                                href={`/search/?type=File&donors.display_title=${result?.display_title}`}>
                                {assayCount} Assay{assayCount > 1 ? 's' : ''}
                            </a>
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
                                        <i className="icon icon-circle-plus"></i>
                                    ),
                                    toggleCloseIcon: (
                                        <i className="icon icon-circle-minus"></i>
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
            widthMap: { lg: 105, md: 100, sm: 100 },
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
                            href={`/search/?type=File&donors.display_title=${result?.display_title}`}>
                            {fileCount} File{fileCount > 1 ? 's' : ''}
                        </a>
                    ) : null;
                }
            },
        },
        file_size: {
            noSort: true,
            widthMap: { lg: 105, md: 100, sm: 100 },
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
            widthMap: { lg: 150, md: 150, sm: 150 },
            render: function (result, parentProps) {
                return <span>{result?.hardy_scale ?? null}</span>;
            },
        },
        // Assays
        'file_sets.libraries.assay.display_title': {
            widthMap: { lg: 136, md: 136, sm: 136 },
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
        'file_status_tracking.released_date': {
            colTitle: 'Released',
            widthMap: { lg: 115, md: 115, sm: 115 },
            render: function (result, parentProps) {
                const value = result?.file_status_tracking?.released_date;
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
        // display_title: {
        //     title: 'display_title',
        // },
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
        'sample_summary.tissues': {
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
        'dataset',
        'file_sets.libraries.analytes.samples.sample_sources.code',
        'status',
        'validation_errors.name',
        'version',
        'study',
        'submission_centers.display_title',
        'software.display_title',
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
    } = props;

    const facets = transformedFacets(context, currentAction, schemas);
    const tableColumnClassName = 'results-column col';
    const facetColumnClassName = 'facets-column col-auto';

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    const passProps = props;

    const aboveFacetListComponent = <BrowseViewAboveFacetListComponent />;
    const aboveTableComponent = (
        <BrowseViewAboveSearchTableControls
            topLeftChildren={
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
            }>
            {session && <DonorMetadataDownloadButton session={session} />}
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

    const { columnExtensionMap, columns, hideFacets } =
        createBrowseDonorColumnExtensionMap(selectedFileProps);

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
            renderDetailPane={customRenderDetailPane}
            useCustomSelectionController
            hideStickyFooter
            currentAction={'multiselect'}
            termTransformFxn={Schemas.Term.toName}
            separateSingleTermFacets={false}
            rowHeight={31}
            openRowHeight={100}
        />
    );
};

/**
 * Donor self-reported ethnicity data
 * This data is used to visualize the distribution of self-reported ethnicities among donors.
 */
const donorSelfReportedEthnicityData = [
    { group: 'American Indian or Alaska Native', blue: 1, pink: 0, total: 10 },
    // { group: 'Asian', blue: 8, pink: 0, total: 83 },
    // { group: 'Black or African American', blue: 11, pink: 0, total: 83 },
    { group: 'Hispanic, Latino or Spanish Origin', blue: 1, pink: 0, total: 10 },
    // { group: 'Middle Eastern or North African', blue: 15, pink: 0, total: 83 },
    // { group: 'Native Hawaiian or Other Pacific Islander', blue: 10, pink: 0, total: 83 },
    // { group: 'Other', blue: 8, pink: 0, total: 83 },
    { group: 'White', blue: 7, pink: 0, total: 10 },
    { group: 'More than 1 Race/Ethnicity', blue: 1, pink: 0, total: 10 },
];

/**
 * Renders a popover with information about donor self-reported ethnicities.
 * @param {*} customId - The custom ID for the popover.
 * @returns - The popover component.
 */
export const renderEthnicityPopover = (customId) => (
    <Popover id={customId || "chart-info-popover-ethnicity"} style={{ maxWidth: 400 }} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr>
                        <th className="text-left">
                            Donor Privacy Notice
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            These are aggregated sums only. SMaHT Network does not release self-reported ethnicity information for individual donors.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

// Browse Donor Body Component
export const BrowseDonorBody = (props) => {
    const [toggleViewIndex, setToggleViewIndex] = useState(1);
    const [donorAgeGroupData, setDonorAgeGroupData] = useState();
    const [donorHardyScaleData, setDonorHardyScaleData] = useState();
    const [loading, setLoading] = useState(false);
    const { alerts, windowWidth, windowHeight, navigate, isFullscreen, href, session } = props;
    const initialFields = ['sample_summary.tissues'];

    useEffect(() => {
        const dataUrl = '/bar_plot_aggregations/';

        const hrefParts = url.parse(href, true);
        const hrefQuery = _.clone(hrefParts.query);
        delete hrefQuery.limit;
        delete hrefQuery.field;

        const requestBody = {
            "search_query_params": hrefQuery,
            "fields_to_aggregate_for": ["hardy_scale", "sex", "age"]
        };
        const commonCallback = (rawData) => {

            // Age intervals
            const ageGroups = [
                { label: '18-30', min: 18, max: 30 },
                { label: '31-55', min: 31, max: 55 },
                { label: '56-65', min: 56, max: 65 },
                { label: '66-75', min: 66, max: 75 },
                { label: '76-85', min: 76, max: 85 },
                { label: '≥86', min: 86, max: Infinity }
            ];

            const hardyScaleRange = [0, 1, 2, 3, 4];

            // Donor Hardy Scale Data
            const updatedDonorHardyScaleData = hardyScaleRange.map((scaleValue) => {
                const scale = rawData.terms[scaleValue] || null;
                let totalCount = 0;

                if (scale) {
                    for (const sexKey in scale.terms) {
                        totalCount += scale.terms[sexKey].total.doc_count;
                    }
                }

                return {
                    group: String(scaleValue),
                    blue: totalCount,
                    pink: 0,
                    total: rawData.total.doc_count
                };
            });

            // Donor Age Group Data (Male → blue, Female → pink)
            const updatedDonorAgeGroupData = ageGroups.map((group) => {
                let blueCount = 0;
                let pinkCount = 0;

                Object.values(rawData.terms).forEach((scale) => {
                    Object.values(scale.terms).forEach((sex) => {
                        Object.entries(sex.terms).forEach(([age, info]) => {
                            const ageNum = parseInt(age, 10);
                            if (ageNum >= group.min && ageNum <= group.max) {
                                if (sex.term === "Male") blueCount += info.doc_count;
                                if (sex.term === "Female") pinkCount += info.doc_count;
                            }
                        });
                    });
                });

                return {
                    group: group.label,
                    blue: blueCount,
                    pink: pinkCount,
                    total: rawData.total.doc_count
                };
            });

            setDonorAgeGroupData(updatedDonorAgeGroupData);
            setDonorHardyScaleData(updatedDonorHardyScaleData);
            setLoading(false);
        };
        const commonFallback = (r) => {
            if (r && r.error) {
                console.error('Error fetching data:', r.error);
                setDonorAgeGroupData([]);
                setDonorHardyScaleData([]);
            } else {
                console.log('Data fetched successfully:', r);
            }
            setLoading(false);
        };
        setLoading(true);
        // Perform any necessary side effects here
        ajax.load(dataUrl, (r) => commonCallback(r), 'POST', (r) => commonFallback(r), JSON.stringify(requestBody), {}, null);

    }, [session, href]);

    const statsProps = { valueContainerCls: "ms-15 pt-1 d-flex align-items-center" };

    return (
        <>
            <Alerts alerts={alerts} className="mt-2" />
            <div className="row browse-viz-container">
                <div className="stats-column col-auto">
                    <h2 className="browse-summary-header">
                        {toggleViewIndex === 0 ? 'Data' : 'Cohort'} Summary
                    </h2>
                    <div>
                        <div className="browse-summary stats-compact d-flex flex-column mt-2 mb-25 flex-wrap">
                            <BrowseSummaryStatController type="File" {... statsProps} />
                            <BrowseSummaryStatController type="Donor" {... statsProps} />
                            <BrowseSummaryStatController type="Tissue" {... statsProps} />
                            <BrowseSummaryStatController type="Assay" {... statsProps} />
                            <hr />
                            <BrowseSummaryStatController
                                type="File Size"
                                additionalSearchQueries="&additional_facet=file_size"
                                {...statsProps}
                            />
                        </div>
                    </div>
                    <IconToggle
                        options={[
                            {
                                title: <React.Fragment><i className="icon fas icon-fas icon-database me-1" /> Data View</React.Fragment>,
                                dataTip: 'Toggle data view',
                                btnCls: 'w-100 btn-sm',
                                onClick: () => setToggleViewIndex(0),
                            },
                            {
                                title: <React.Fragment><i className="icon fas icon-fas icon-users me-1" /> Cohort View</React.Fragment>,
                                dataTip: 'Toggle cohort view',
                                btnCls: 'w-100 btn-sm',
                                onClick: () => setToggleViewIndex(1),
                            },
                        ]}
                        activeIdx={toggleViewIndex}
                        divCls="view-toggle p-1"
                    />
                </div>
                <div className="col ps-0">
                    {toggleViewIndex === 0 ? (
                        <div
                            id="facet-charts-container"
                            className="container ps-4">
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
                                }}
                            />
                        </div>
                    ) : (
                        <div className="donor-cohort-view-chart-container">
                            <DonorCohortViewChart
                                title="Donor Age Groups"
                                data={session ? donorAgeGroupData : []}
                                chartWidth="auto"
                                chartHeight={420}
                                chartType="stacked"
                                topStackColor="#2F62AA"
                                bottomStackColor="#B79AEF"
                                xAxisTitle="Age Group"
                                yAxisTitle="Donors"
                                legendTitle="Donor Sex"
                                showLegend
                                session={session}
                                loading={loading}
                            />

                            <DonorCohortViewChart
                                title="Donor Hardy Scale"
                                data={session ? donorHardyScaleData : []}
                                chartWidth="auto"
                                chartHeight={420}
                                chartType="single"
                                topStackColor="#56A9F5"
                                xAxisTitle="Hardy Scale"
                                yAxisTitle="Donors"
                                popover={session && renderHardyScaleDescriptionPopover()}
                                session={session}
                                loading={loading}
                            />

                            <DonorCohortViewChart
                                title="Donor Self-Reported Ethnicity"
                                data={session ? donorSelfReportedEthnicityData : []}
                                chartWidth="auto"
                                chartHeight={420}
                                chartType="horizontal"
                                topStackColor="#14B3BB"
                                xAxisTitle="Donors"
                                yAxisTitle="Ethnicity"
                                popover={session && renderEthnicityPopover()}
                                session={session}
                            />

                        </div>
                    )}
                </div>
            </div>
            <hr />
            <BrowseViewControllerWithSelections {...props}>
                <BrowseDonorSearchTable />
            </BrowseViewControllerWithSelections>
        </>
    );
};
