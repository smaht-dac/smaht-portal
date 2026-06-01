'use strict';

import React from 'react';
import _ from 'underscore';
import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';

// Renamed Files query
const RENAMED_FILES_QUERY = '/search/?type=File&tags=rename';

/**
 * Utility function to extract previous the file name from note_to_tsv
 * @param {Array} notesToTsv - The notes_to_tsv array from the file object
 * @returns {string|null} - The previous file name if found, otherwise null
 */
const extractPreviousFileName = (notesToTsv = null) => {
    if (!notesToTsv || !Array.isArray(notesToTsv)) return null;

    for (let note of notesToTsv) {
        const splitStr = note?.split('This file was originally named ');
        if (note && splitStr?.length > 1) {
            return splitStr[1].split(' due')[0];
        }
    }
    return null;
};

const RenamedFilesColumnExtensionMap = {
    access_status: {
        widthMap: { lg: 70, md: 70, sm: 70 },
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
            return <span className="value text-start">{access_status}</span>;
        },
    },
    // Workaround for displaying tags on multiple columns
    'tags.0': {
        widthMap: { lg: 140, md: 140, sm: 140 },
        render: function (result, parentProps) {
            const { tags } = result || {};

            const renameDate = (tags || [])
                .find((s) => s.includes('renamed_on'))
                ?.split('|')?.[1];
            return <span className="value text-start">{renameDate}</span>;
        },
    },
    // Workaround for displaying tags on multiple columns
    'tags.1': {
        widthMap: { lg: 220, md: 220, sm: 220 },
        render: function (result, parentProps) {
            const { tags } = result || {};

            const renameReason = (tags || [])
                .find((s) => s.includes('rename_reason'))
                ?.split('|')?.[1];
            return <span className="value text-start">{renameReason}</span>;
        },
    },
    notes_to_tsv: {
        widthMap: { lg: 500, md: 400, sm: 400 },
        render: function (result, parentProps) {
            const { notes_to_tsv } = result || {};

            const renameString = extractPreviousFileName(notes_to_tsv);

            return renameString ? (
                <span className="value text-start">{renameString}</span>
            ) : null;
        },
    },
};

const RenamedFilesColumns = {
    access_status: {
        title: 'Access',
    },
    'tags.0': {
        title: 'Renamed On',
    },
    'tags.1': {
        title: 'Rename Reason',
    },
    notes_to_tsv: {
        title: 'Previous File Name',
    },
    accession: {
        title: 'Accession',
    },
    annotated_filename: {
        title: 'File',
    },
};

export default function RetractedFilesTable(props) {
    const { schemas, session, searchHref: propSearchHref } = props;
    const searchHref =
        propSearchHref ||
        '/search/?type=File&status=retracted&file_status_tracking.release_dates.initial_release_date!=No+value&sort=-file_status_tracking.status_tracking.retracted_date';

    const columnExtensionMap = {
        access_status: {
            widthMap: { lg: 70, md: 70, sm: 70 },
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
        'file_status_tracking.status_tracking.retracted_date': {
            widthMap: { lg: 140, md: 90, sm: 90 },
        },
        accession: {
            widthMap: { lg: 145, md: 120, sm: 120 },
            render: function (result, props) {
                const { '@id': atId, accession } = result || {};

                return (
                    <span className="value text-start">
                        {accession ? (
                            <a
                                href={atId}
                                target="_blank"
                                rel="noreferrer noopener">
                                {accession}
                            </a>
                        ) : (
                            '-'
                        )}
                    </span>
                );
            },
        },
        annotated_filename: {
            widthMap: { lg: 350, md: 200, sm: 200 },
            render: function (result, props) {
                const { '@id': atId, annotated_filename } = result || {};

                return (
                    <span className="value text-start">
                        {annotated_filename ? (
                            <a
                                href={atId}
                                target="_blank"
                                rel="noreferrer noopener">
                                {annotated_filename}
                            </a>
                        ) : (
                            '-'
                        )}
                    </span>
                );
            },
        },
        retraction_reason: {
            widthMap: { lg: 250, md: 120, sm: 120 },
            render: function (result, props) {
                const { retraction_reason } = result || {};
                if (!retraction_reason) return null;
                return (
                    <span className="value text-start">
                        {capitalizeSentence(retraction_reason)}
                    </span>
                );
            },
        },
        'replaced_by.display_title': {
            widthMap: { lg: 170, md: 120, sm: 120 },
            render: function (result, props) {
                const {
                    replaced_by: {
                        '@id': atId,
                        annotated_filename,
                        display_title,
                    } = {},
                } = result || {};
                if (!atId) return null;
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
        release_tracker_description: {
            widthMap: { lg: 150, md: 75, sm: 75 },
        },
        'sample_summary.sample_names': {
            widthMap: { lg: 160, md: 120, sm: 120 },
        },
        'data_generation_summary.sequencing_center': {
            widthMap: { lg: 110, md: 90, sm: 90 },
        },
    };

    const columns = {
        access_status: {
            title: 'Access',
        },
        'file_status_tracking.status_tracking.retracted_date': {
            title: 'Retracted On',
        },
        accession: {
            title: 'Accession',
        },
        annotated_filename: {
            title: 'File',
        },
        retraction_reason: {
            title: 'Reason of Retraction',
        },
        'replaced_by.display_title': {
            title: 'Replaced By',
        },
        release_tracker_description: {
            title: 'Assay',
        },
        'sample_summary.sample_names': {
            title: 'Sample',
        },
        'data_generation_summary.sequencing_center': {
            title: 'Center',
        },
    };

    return (
        <div className="retracted-files-table">
            <EmbeddedItemSearchTable
                searchHref={searchHref}
                schemas={schemas}
                session={session}
                facets={null}
                rowHeight={31}
                columns={columns}
                columnExtensionMap={columnExtensionMap}
            />
            <EmbeddedItemSearchTable
                searchHref={RENAMED_FILES_QUERY}
                schemas={schemas}
                session={session}
                facets={null}
                rowHeight={31}
                columns={RenamedFilesColumns}
                columnExtensionMap={RenamedFilesColumnExtensionMap}
            />
        </div>
    );
}
