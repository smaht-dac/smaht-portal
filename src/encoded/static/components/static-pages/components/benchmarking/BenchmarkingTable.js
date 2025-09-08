import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import _ from 'underscore';
import { Modal, Tabs, Tab } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';

import {
    ajax,
    analytics,
    memoizedUrlParse,
    object,
    logger,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    LocalizedTime,
    display as dateTimeDisplay,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import {
    SelectedItemsController,
    SelectionItemCheckbox,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';

import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';
import {
    SelectAllAboveTableComponent,
    SelectAllFilesButton,
} from '../SelectAllAboveTableComponent';

export const BenchmarkingTable = (props) => {
    const {
        searchHref,
        schemas,
        facets,
        session,
        href,
        columnExtensionMap: originalColExtMap,
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
        tabMap,
        deniedAccessPopoverType,
    } = props;

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    /**
     * A column extension map specifically for benchmarking tables.
     * Some of these things may be worth moving to the global colextmap eventually.
     */
    const benchmarkingColExtMap = {
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
        <EmbeddedItemSearchTable
            key={session}
            embeddedTableHeader={
                <SelectAllAboveTableComponent
                    {...{
                        facets,
                        session,
                        selectedItems,
                        onSelectItem,
                        onResetSelectedItems,
                        href,
                        searchHref,
                        deniedAccessPopoverType,
                    }}
                />
            }
            rowHeight={31}
            maxFacetsBodyHeight={700}
            maxResultsBodyHeight={735}
            {...{
                searchHref,
                schemas,
                session,
                facets,
                selectedItems,
                onSelectItem,
                onResetSelectedItems,
            }}
            columnExtensionMap={benchmarkingColExtMap}
            hideFacets={
                tabMap?.facetsToHide || [
                    'dataset',
                    'file_sets.libraries.analytes.samples.sample_sources.code',
                    'status',
                    'validation_errors.name',
                    'version',
                    // File facets used in production browse ui
                    'access_status',
                    'donors.display_title',
                    'donors.age',
                    'donors.sex',
                    'sample_summary.tissues',
                    'date_created',
                ]
            }
            hideColumns={['display_title']}
            clearSelectedItemsOnFilter
            columns={tabMap?.columns}
        />
    );
};
