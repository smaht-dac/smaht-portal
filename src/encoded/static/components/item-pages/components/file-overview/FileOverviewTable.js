import React from 'react';
import { OverlayTrigger, Popover } from 'react-bootstrap';

import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    SelectedItemsController,
    SelectionItemCheckbox,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';

import {
    SelectAllFilesButton,
    SelectedItemsDownloadButton,
} from '../../../static-pages/components/SelectAllAboveTableComponent';
import { EmbeddedItemSearchTable } from '../EmbeddedItemSearchTable';

/**
 * Wraps the File Overview Table in a SelectedItemsController component, which
 * tracks information about a user's selection and passes them as props to the
 * FileOverviewTable component.
 */
export const FileOverviewTableController = (props) => {
    const {
        embeddedTableHeaderText,
        associatedFilesSearchHref,
        schemas,
        session,
        href,
        context,
    } = props;

    return (
        <SelectedItemsController
            {...{ context, href }}
            currentAction={'multiselect'}>
            <FileOverviewTable
                associatedFilesSearchHref={associatedFilesSearchHref}
                {...{
                    context,
                    session,
                    schemas,
                    href,
                    searchHref: associatedFilesSearchHref,
                    embeddedTableHeaderText,
                }}
            />
        </SelectedItemsController>
    );
};

/**
 * Renders the Embedded Search Table with custom data columns.
 */
export const FileOverviewTable = (props) => {
    const {
        context,
        href,
        searchHref,
        schemas,
        session,
        associatedFilesSearchHref = '',
        embeddedTableHeaderText = '',
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
        originalColExtMap,
    } = props;

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    const FileOverviewColExtMap = {
        ...originalColExtMap,
        // Select all button
        '@type': {
            colTitle: (
                <SelectAllFilesButton {...selectedFileProps} type="checkbox" />
            ),
            hideTooltip: true,
            noSort: true,
            widthMap: { lg: 50, md: 50, sm: 50 },
            render: (result, parentProps) => {
                return (
                    <SelectionItemCheckbox
                        {...{ selectedItems, onSelectItem, result }}
                        isMultiSelect={true}
                    />
                );
            },
        },
        // File Name
        annotated_filename: {
            widthMap: { lg: 500, md: 400, sm: 300 },
            colTitle: 'File Name',
            render: function (result) {
                const {
                    '@id': atId,
                    display_title,
                    annotated_filename,
                } = result || {};

                return (
                    <span className="value">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="link-underline-hover">
                            {annotated_filename || display_title}
                        </a>
                    </span>
                );
            },
            noSort: true,
        },

        // Pipeline
        'software.display_title': {
            widthMap: { lg: 200, md: 150, sm: 130 },
            colTitle: 'Pipeline',
            render: function (result) {
                const value = result?.software;
                return value ? (
                    <span className="value">
                        {result.software.map((s) => s.display_title).join(', ')}
                    </span>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
        // Version
        'software.version': {
            widthMap: { lg: 130, md: 120, sm: 130 },
            colTitle: 'Version',
            render: function (result) {
                return result?.software?.length > 0 ? (
                    <span className="value">
                        {result.software.map((s) => s.version).join(', ')}
                    </span>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
        // Status
        status: {
            widthMap: { lg: 140, md: 120, sm: 100 },
            colTitle: 'Status',
            render: function (result, parentProps) {
                const value = result?.status;
                if (!value) return null;
                return (
                    <span className="value">
                        <i
                            className="status-indicator-dot me-07"
                            data-status={value}
                        />
                        {capitalizeSentence(value)}
                    </span>
                );
            },
            noSort: true,
        },
        // Notes
        tsv_notes: {
            widthMap: { lg: 160, md: 150, sm: 140 },
            colTitle: 'Notes',
            render: function (result, parentProps) {
                const { notes_to_tsv = [] } = result;

                if (notes_to_tsv.length === 0) {
                    return null;
                }

                const popover = (
                    <Popover id="popover-basic">
                        <Popover.Header as="h3" className="mt-0">
                            Notes
                        </Popover.Header>
                        <Popover.Body>
                            {notes_to_tsv.map((note, i) => {
                                return <p key={i}>{note}</p>;
                            })}
                        </Popover.Body>
                    </Popover>
                );

                return (
                    <OverlayTrigger
                        trigger="click"
                        placement="top"
                        overlay={popover}>
                        <button
                            type="button"
                            className="btn btn-link btn-xs text-truncate">
                            <i className="icon icon-exclamation-triangle fas text-warning me-05" />
                            View Notes
                        </button>
                    </OverlayTrigger>
                );
            },
            noSort: true,
        },
        // Release Date
        release_date: {
            widthMap: { lg: 180, md: 160, sm: 140 },
            colTitle: 'Release Date',
            render: function (result) {
                const value = result?.file_status_tracking?.released;
                return value ? (
                    <span className="value">
                        <LocalizedTime
                            timestamp={value}
                            formatType="date-file"
                        />
                    </span>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
        // File Size
        file_size: {
            widthMap: { lg: 140, md: 100, sm: 100 },
            colTitle: 'Size',
            render: function (result, parentProps) {
                const value = result?.file_size;
                if (!value) return null;
                return (
                    <span className="value">
                        {valueTransforms.bytesToLargerUnit(value)}
                    </span>
                );
            },
            noSort: true,
        },
    };

    return (
        <>
            <h2 className="header">{embeddedTableHeaderText}</h2>
            <EmbeddedItemSearchTable
                key={session}
                embeddedTableHeader={
                    <FileOverviewAboveTableComponent
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
                {...{
                    searchHref: associatedFilesSearchHref,
                    schemas,
                    session,
                    selectedItems,
                    onSelectItem,
                    onResetSelectedItems,
                }}
                facets={null}
                columnExtensionMap={FileOverviewColExtMap}
                hideColumns={[
                    'display_title',
                    'access_status',
                    'data_type',
                    'file_sets.sequencing.sequencer.display_title',
                    'file_format.display_title',
                    'submission_centers.display_title',
                    'file_sets.libraries.assay.display_title',
                    'sequencing_center.display_title',
                ]}
                columns={{
                    '@type': {},
                    annotated_filename: {},
                    'software.display_title': {},
                    'software.version': {},
                    status: {},
                    tsv_notes: {},
                    release_date: {},
                    file_size: {},
                }}
            />
        </>
    );
};

/**
 * Header section of the File Overview Table. Passed as a child to
 * EmbeddedSearchView (SPC), and recieves props from SelectedItemsController
 */
const FileOverviewAboveTableComponent = (props) => {
    const {
        href,
        searchHref,
        context,
        onFilter,
        schemas,
        isContextLoading = false, // Present only on embedded search views,
        navigate,
        sortBy,
        sortColumns,
        hiddenColumns,
        addHiddenColumn,
        removeHiddenColumn,
        columnDefinitions,
        session,
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    } = props;
    const totalResultCount = context?.total ?? 0;

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    return (
        <div className="d-flex w-100 mb-05">
            <div className="col-auto ms-0 ps-0">
                <span className="text-400" id="results-count">
                    {totalResultCount}
                </span>{' '}
                Results
            </div>
            <div className="ms-auto col-auto me-0 pe-0">
                <SelectAllFilesButton
                    {...selectedFileProps}
                    context={context}
                />
                <SelectedItemsDownloadButton
                    id="download_tsv_multiselect"
                    disabled={selectedItems?.size === 0}
                    className="btn btn-primary btn-sm me-05 align-items-center"
                    {...{ selectedItems, session }}
                    analyticsAddItemsToCart>
                    <i className="icon icon-download fas me-07" />
                    Download {selectedItems?.size} Selected Files
                </SelectedItemsDownloadButton>
            </div>
        </div>
    );
};
