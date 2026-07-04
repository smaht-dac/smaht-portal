'use strict';

import React from 'react';
import {
    EmbeddedItemSearchTable,
    SearchTableTitle,
} from '../../item-pages/components/EmbeddedItemSearchTable';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';

// Renamed Files query
const RENAMED_FILES_QUERY = '/search/?type=File&tags=rename';

// Renamed Files header component containing total count
function RenamedFilesTableHeader({ context, href }) {
    return context?.total > 0 ? (
        <SearchTableTitle
            totalCount={context?.total}
            href={href}
            title="Renamed File"
            headerElement="h4"
        />
    ) : null;
}

/**
 * Utility function to extract previous the file name from notes_to_tsv
 * @param {Array} notesToTsv - The notes_to_tsv array from the file object
 * @returns {string|null} - The previous file name if found, otherwise null
 *
 * Note: expects one of the notes to include a string in the format "This
 * file was originally named [previous_file_name] due to [reason]."
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
    // Use undefined column names as work around to render custom columns
    renamed_on_tag: {
        noSort: true,
        widthMap: { lg: 140, md: 140, sm: 140 },
        render: function (result, parentProps) {
            const { tags } = result || {};

            const renameDate = (tags || [])
                .find((s) => s.includes('renamed_on'))
                ?.split('|')?.[1];
            return <span className="value text-start">{renameDate}</span>;
        },
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
    // Use undefined column names as work around to render custom columns
    rename_reason_tag: {
        noSort: true,
        widthMap: { lg: 220, md: 220, sm: 220 },
        render: function (result, parentProps) {
            const { tags } = result || {};

            let renameReason = (tags || [])
                .find((s) => s.includes('rename_reason'))
                ?.split('|')?.[1];

            // Formats rename reason tag to be more human readable
            if (renameReason) {
                renameReason = capitalizeSentence(
                    renameReason.replace(/_/g, ' ')
                );
            }
            return <span className="value text-start">{renameReason}</span>;
        },
    },
    notes_to_tsv: {
        noSort: true,
        widthMap: { lg: 500, md: 400, sm: 400 },
        render: function (result, parentProps) {
            const { notes_to_tsv } = result || {};

            const renameString = extractPreviousFileName(notes_to_tsv);

            return renameString ? (
                <span className="value text-start">{renameString}</span>
            ) : null;
        },
    },
    annotated_filename: {
        widthMap: { lg: 500, md: 400, sm: 400 },
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
};

const RenamedFilesColumns = {
    access_status: {
        title: 'Access',
    },
    renamed_on_tag: {
        title: 'Renamed On',
    },
    accession: {
        title: 'Accession',
    },
    notes_to_tsv: {
        title: 'Incorrect File Name',
    },
    rename_reason_tag: {
        title: 'Rename Reason',
    },
    annotated_filename: {
        title: 'Current File Name',
    },
};

export default function RenamedFilesTable(props) {
    const { session, schemas } = props;
    return (
        <div className="renamed-files-table">
            <EmbeddedItemSearchTable
                searchHref={RENAMED_FILES_QUERY}
                schemas={schemas}
                session={session}
                facets={null}
                rowHeight={31}
                columns={RenamedFilesColumns}
                columnExtensionMap={RenamedFilesColumnExtensionMap}
                embeddedTableHeader={<RenamedFilesTableHeader />}
            />
        </div>
    );
}
