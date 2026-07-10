import React, { useState, useEffect } from 'react';
import { SelectAllFilesButton } from '../../static-pages/components/SelectAllAboveTableComponent';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import { BROWSE_STATUS_FILTERS } from '../BrowseView';
import { columnExtensionMap as originalColExtMap } from '../columnExtensionMap';
import { CustomTableRowToggleOpenButton } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons/basicColumnExtensionMap';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { getTissueCategoryFromFacetTerm } from '../../util/data';

export const formatTissueData = (data) => {
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

    // Flatten any nested terms
    const flattenedTissueTerms = data.flatMap((t) => {
        if (Array.isArray(t?.terms) && t.terms.length > 0) {
            return t.terms;
        }
        return t ? [t] : [];
    });

    const grouped_data = flattenedTissueTerms.reduce((acc, { key }) => {
        // if category is not present in lookup map, assign to 'Unknown' group
        const tissueCategory = getTissueCategoryFromFacetTerm(key) || 'Unknown';

        if (!acc[tissueCategory]) {
            acc[tissueCategory] = { title: tissueCategory, values: [key] };
        } else {
            acc[tissueCategory].values.push(key);
        }
        return acc;
    }, defaultTissueCategories);

    return grouped_data;
};

const TissueDetailPane = React.memo(function TissueDetailPane({
    itemDetails,
    panelDetails,
}) {
    const [tissueData, setTissueData] = useState(null);

    useEffect(() => {
        const searchURL = `/search/?type=File&${BROWSE_STATUS_FILTERS}&dataset!=No+value&donors.display_title=${itemDetails.display_title}`;

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
                                            .map((tissue, j) => (
                                                <li key={j}>
                                                    <span>
                                                        <a
                                                            href={`/browse/?type=File&${BROWSE_STATUS_FILTERS}&dataset!=No+value&donors.display_title=${itemDetails.display_title}&sample_summary.tissues=${tissue}`}
                                                            target="_blank"
                                                            rel="noreferrer noopener">
                                                            {tissue}
                                                        </a>
                                                    </span>
                                                </li>
                                            ))}
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

export const formatAssayData = (data, labelOverridesFromFacets = {}) => {
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
        Other: {
            title: 'Other',
            values: [],
        },
    };

    const grouped_data = data.reduce((acc, item) => {
        const assayCategory = item?.key ?? 'Other';

        const labelOverrides = {};
        if (labelOverridesFromFacets?.[assayCategory]) {
            labelOverrides[assayCategory] =
                labelOverridesFromFacets[assayCategory];
        }

        const termsMap = item?.terms?.map((t) => {
            if (labelOverridesFromFacets[t?.key]) {
                labelOverrides[t.key] = labelOverridesFromFacets[t.key];
            }
            return t?.key;
        });

        if (!acc[assayCategory]) {
            acc[assayCategory] = {
                title: assayCategory,
                values: termsMap,
                label_overrides: labelOverrides ?? {},
            };
        } else {
            acc[assayCategory].values.push(...termsMap);
        }
        return acc;
    }, defaultAssayCategories);

    return grouped_data;
};

const AssayDetailPane = React.memo(function AssayDetailPane({
    itemDetails,
    panelDetails,
}) {
    const [assayData, setAssayData] = useState(null);

    useEffect(() => {
        const searchURL = `/search/?type=File&${BROWSE_STATUS_FILTERS}&dataset!=No+value&donors.display_title=${itemDetails.display_title}`;

        if (panelDetails?.searchCache) {
            const assayFacets = panelDetails?.searchCache?.facets?.find(
                (f) => f.field === 'assays.display_title'
            );

            const termsFromFacets = assayFacets?.terms || [];
            const labelOverridesFromFacets = assayFacets?.label_overrides || {};

            setAssayData(
                formatAssayData(termsFromFacets, labelOverridesFromFacets)
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
                    {Object.keys(assayData).reduce((acc, key) => {
                        return acc + assayData[key].values.length;
                    }, 0)}{' '}
                </b>
                Assays across all tissues
            </div>
            <div className="detail-body">
                {Object?.keys(assayData).map((category, i) => {
                    const {
                        title,
                        values = [],
                        label_overrides = {},
                    } = assayData[category];

                    const categoryTitle = label_overrides?.[title] ?? title;
                    const categoryAssays = values;

                    return (
                        <div key={i} className="tissue-category">
                            <div className="header-container">
                                <h3>{categoryTitle}</h3>
                            </div>
                            <div className="tissue-list-container">
                                {categoryAssays.length > 0 ? (
                                    <ul>
                                        {categoryAssays
                                            .sort((a, b) => a.localeCompare(b))
                                            .map((assay, j) => {
                                                const assayTitle =
                                                    label_overrides?.[assay] ??
                                                    assay;

                                                // Note: The assay link uses the original assay term
                                                return (
                                                    <li key={j}>
                                                        <span>
                                                            <a
                                                                href={`/browse/?type=File&${BROWSE_STATUS_FILTERS}&dataset!=No+value&donors.display_title=${itemDetails.display_title}&assays.display_title=${assay}`}
                                                                target="_blank"
                                                                rel="noreferrer noopener">
                                                                {assayTitle}
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

export const customRenderDetailPane = (
    itemDetails = {},
    rowIndex,
    panelWidth,
    panelDetails = {}
) => {
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

export function createBaseDonorColumnExtensionMap({
    selectedItems,
    onSelectItem,
    onResetSelectedItems,
}) {
    const columnExtensionMap = {
        ...originalColExtMap,
        '@type': {
            colTitle: (
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
        external_id: {
            widthMap: { lg: 120, md: 120, sm: 120 },
            colTitle: <>Donor</>,
            render: function (result, parentProps) {
                const {
                    '@id': atId,
                    display_title,
                    external_id,
                } = result || {};

                return (
                    <span className="value text-start">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener">
                            {external_id || display_title}
                        </a>
                    </span>
                );
            },
        },
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
                const ageString = result.age === 89 ? '89+' : result?.age;
                return (
                    <span className="value text-center w-100">{ageString}</span>
                );
            },
        },
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

                const tissueFacet = data?.facets?.find(
                    (f) => f.field === 'sample_summary.tissues'
                );
                const tissueTerms = tissueFacet?.has_group_by
                    ? tissueFacet?.original_terms || tissueFacet?.terms
                    : tissueFacet?.terms;
                const tissueCount = tissueTerms?.length;

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

                const { data, loading } = parentProps?.fetchedProps;

                const assayCount = data?.facets
                    ?.find((f) => f.field === 'assays.display_title')
                    ?.terms?.reduce(
                        (acc, curr) => acc + (curr?.terms?.length ?? 1),
                        0
                    );

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
        files: {
            noSort: true,
            colAlignment: 'text-end',
            widthMap: { lg: 90, md: 90, sm: 90 },
            render: function (result, parentProps) {
                const { data, loading } = parentProps?.fetchedProps;

                // File count comes from the search response's `total` rather
                // than a `type` facet: `additional_facet=type` combined with
                // `skip_default_facets=true` makes snovault infer an invalid
                // `stats` aggregation on the `type` keyword field (HTTP 400).
                // The query already filters `type=File`, so `total` here is
                // exactly the File count.
                const fileCount = data?.total;

                if (loading) {
                    return <span className="value text-center loading"></span>;
                } else {
                    return fileCount ? (
                        <a
                            className="value text-center"
                            href={`/browse/?type=File&${BROWSE_STATUS_FILTERS}&dataset!=No+value&donors.display_title=${result?.display_title}`}>
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
                const { data, loading } = parentProps?.fetchedProps;

                const fileSize = data?.facets?.find(
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
        'sequencers.display_title': {
            widthMap: { lg: 170, md: 160, sm: 150 },
        },
        'file_format.display_title': {
            widthMap: { lg: 100, md: 90, sm: 80 },
        },
        'software.display_title': {
            widthMap: { lg: 151, md: 151, sm: 151 },
        },
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
        '@type': { title: 'Selected' },
        external_id: { title: 'Donor' },
        age: { title: 'Age' },
        sex: { title: 'Sex' },
        tissues: { title: 'Tissues' },
        assays: { title: 'Assays' },
        files: { title: 'Files' },
        file_size: { title: 'File Size' },
        hardy_scale: { title: 'Hardy Scale' },
    };

    const hideFacets = [
        'dataset',
        'file_sets.libraries.analytes.samples.sample_sources.code',
        'status',
        'tissue.display_title',
        'validation_errors.name',
        'version',
        'study',
        'submission_centers.display_title',
        'software.display_title',
        'tags',
    ];

    return { columnExtensionMap, columns, hideFacets };
}
