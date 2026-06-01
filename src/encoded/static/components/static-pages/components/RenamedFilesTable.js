'use strict';

import React from 'react';
import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';

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
    // Workaround for displaying tags on multiple columns
    'tags.1': {
        noSort: true,
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

export default function RenamedFilesTable(props) {
    const { session, schemas } = props;
    return (
        <div className="renamed-files-table retracted-files-table">
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
