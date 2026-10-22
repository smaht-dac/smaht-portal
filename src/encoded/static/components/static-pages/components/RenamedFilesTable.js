'use strict';

import React, { useState, useEffect, useRef } from 'react';
import {
    EmbeddedItemSearchTable,
    SearchTableTitle,
} from '../../item-pages/components/EmbeddedItemSearchTable';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';

// Renamed Files query. `sort=-tags` lists newest renames first, since a
// descending sort uses each file's alphabetically highest tag, which for renamed
// files is `renamed_on|YYYY-MM-DD`. A file with a tag that sorts after it (e.g.
// `reviewed`) is ordered by that tag instead. Ascending would compare `rename`,
// so the column itself stays unsortable. `sort=accession` breaks ties between
// files renamed on the same day; without it pages can overlap, which makes the
// table reload when loading more results.
const RENAMED_FILES_QUERY =
    '/search/?type=File&tags=rename&sort=-tags&sort=accession';

// Facets shown in the table (the retracted files table uses these plus its own)
export const RENAMED_FILES_FACET_FIELDS = [
    'access_status',
    'donors.display_title',
    'donors.donor_groups',
    'sample_summary.tissues',
    'assays.display_title',
    'sequencers.display_title',
    'file_format.display_title',
    'data_category',
    'data_type',
    'sequencing_center.display_title',
    'file_status_tracking.release_dates.initial_release',
];

const filterRenamedFilesFacets = (facet) =>
    RENAMED_FILES_FACET_FIELDS.includes(facet?.field);

export const ROW_HEIGHT = 31;
export const RESULTS_BODY_HEIGHT = ROW_HEIGHT * 17;

// The facet column's header/padding is ~36px taller than the results header
// row, so the facets body is shorter to make both columns end at the same line
export const FACETS_BODY_HEIGHT = RESULTS_BODY_HEIGHT - 36;

/**
 * Shows a shadow at the bottom of the results while there are more rows to
 * scroll to. Attach `outerRef` to the table wrapper and add the
 * `show-scroll-shadow` class to it while `showShadow` is true.
 */
export function useScrollShadow() {
    const outerRef = useRef(null);
    const [showShadow, setShowShadow] = useState(false);

    // Tracks scroll container to show shadow whenever there is more content
    // below the visible area
    useEffect(() => {
        const outer = outerRef.current;
        if (!outer) return;

        const updateShadow = ({ scrollTop, clientHeight, scrollHeight }) => {
            setShowShadow(scrollTop + clientHeight < scrollHeight - 2);
        };

        // Capture-phase listener on the outer scroll container to update the shadow
        // state whenever the scroll position changes
        const onScroll = (e) => {
            if (e.target?.classList?.contains('react-infinite-container')) {
                updateShadow(e.target);
            }
        };
        outer.addEventListener('scroll', onScroll, {
            passive: true,
            capture: true,
        });

        // Observer recomputes shadow state whenever the results change.
        // Checks are batched to one per frame.
        let frameId = null;
        const observer = new MutationObserver(() => {
            if (frameId !== null) return;
            frameId = window.requestAnimationFrame(() => {
                frameId = null;
                const scrollContainer = outer.querySelector(
                    '.react-infinite-container'
                );
                if (scrollContainer) updateShadow(scrollContainer);
            });
        });
        observer.observe(outer, { childList: true, subtree: true });

        return () => {
            outer.removeEventListener('scroll', onScroll, { capture: true });
            observer.disconnect();
            if (frameId !== null) window.cancelAnimationFrame(frameId);
        };
    }, []);

    return { outerRef, showShadow };
}

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
    const { outerRef, showShadow } = useScrollShadow();

    return (
        <div
            className={
                'renamed-files-table' +
                (showShadow ? ' show-scroll-shadow' : '')
            }
            ref={outerRef}>
            <EmbeddedItemSearchTable
                searchHref={RENAMED_FILES_QUERY}
                schemas={schemas}
                session={session}
                filterFacetFxn={filterRenamedFilesFacets}
                rowHeight={ROW_HEIGHT}
                maxFacetsBodyHeight={FACETS_BODY_HEIGHT}
                maxResultsBodyHeight={RESULTS_BODY_HEIGHT}
                columns={RenamedFilesColumns}
                columnExtensionMap={RenamedFilesColumnExtensionMap}
                embeddedTableHeader={<RenamedFilesTableHeader />}
            />
        </div>
    );
}
