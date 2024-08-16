import React from 'react';
import _ from 'underscore';

import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';

import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';
import { TableControllerWithSelections } from '../TableControllerWithSelections';
import {
    SelectAllAboveTableComponent,
    SelectAllFilesButton,
} from '../SelectAllAboveTableComponent';

export const ChallengeTableWrapper = (props) => {
    const { searchHref, schemas, facets, session, href, context } = props;
    return (
        <TableControllerWithSelections
            {...{ searchHref, schemas, facets, session, href, context }}>
            <ChallengeTable />
        </TableControllerWithSelections>
    );
};

const ChallengeTable = (props) => {
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
    } = props;

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    /**
     * A column extension map speifically for benchmarking tables.
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
        // File
        filename: {
            colTitle: 'File',
            widthMap: { lg: 500, md: 400, sm: 300 },
            render: function (result, parentProps) {
                const {
                    '@id': atId,
                    filename,
                    display_title,
                    annotated_filename,
                } = result || {};

                return (
                    <span className="value text-left">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener">
                            {filename || annotated_filename || display_title}
                        </a>
                    </span>
                );
            },
        },
        description: {
            colTitle: 'Description',
            widthMap: { lg: 500, md: 400, sm: 300 },
            render: function (result) {
                return result?.description;
            },
        },
        version: {
            colTitle: 'Version',
            widthMap: { lg: 105, md: 100, sm: 100 },
            render: function (result) {
                return result?.version;
            },
        },
        // File Size
        file_size: {
            colTitle: 'File Size',
            widthMap: { lg: 105, md: 100, sm: 100 },
            render: function (result, parentProps) {
                const value = result?.file_size;
                if (!value) return null;
                return (
                    <span className="value text-right">
                        {valueTransforms.bytesToLargerUnit(value)}
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
                        session,
                        selectedItems,
                        onSelectItem,
                        onResetSelectedItems,
                        href,
                        searchHref,
                    }}
                />
            }
            rowHeight={31}
            // maxHeight={200}
            {...{
                searchHref,
                schemas,
                session,
                selectedItems,
                onSelectItem,
                onResetSelectedItems,
            }}
            columnExtensionMap={benchmarkingColExtMap}
            facets={null}
            hideColumns={[
                'display_title',
                'sequencing_center.display_title', // Seq. Center
                'file_sets.libraries.assay.display_title', // Assay
                'file_status_tracking.released_date', // Release Date
                'file_sets.sequencing.sequencer.display_title', // Platform
                'software.display_title', // Method
                'date_created', // Submission Date
                'file_format.display_title', // Format
                'submission_centers.display_title', // Generated By
                'access_status', // Access
                'data_type', // Data Category
            ]}
            columns={{
                '@type': {},
                filename: {},
                description: {},
                version: {},
                file_size: {},
            }}
            clearSelectedItemsOnFilter
        />
    );
};
