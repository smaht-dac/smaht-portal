'use strict';

import React, { useState, useEffect, useRef } from 'react';
import _ from 'underscore';
import {
    EmbeddedItemSearchTable,
    SearchTableTitle,
} from '../../item-pages/components/EmbeddedItemSearchTable';
import { capitalizeSentence } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';

// Retracted Files header component containing total count
function RetractedFilesTableHeader({ context, href }) {
    return context?.total > 0 ? (
        <SearchTableTitle
            totalCount={context?.total}
            href={href}
            title="Retracted File"
            headerElement="h4"
        />
    ) : null;
}

export default function RetractedFilesTable(props) {
    const { schemas, session, searchHref: propSearchHref } = props;
    const searchHref =
        propSearchHref ||
        '/search/?type=File&status=retracted&file_status_tracking.release_dates.initial_release_date!=No+value&sort=-file_status_tracking.status_tracking.retracted';

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
        // state whenever the scroll position changes.
        const onScroll = (e) => updateShadow(e.target);
        outer.addEventListener('scroll', onScroll, {
            passive: true,
            capture: true,
        });

        // Observer to compute the initial shadow state as soon as the virtual
        // scroll container appears after the first load
        const observer = new MutationObserver(() => {
            const scrollContainer = outer.querySelector(
                '.react-infinite-container'
            );
            if (!scrollContainer) return;
            updateShadow(scrollContainer);
            observer.disconnect();
        });
        observer.observe(outer, { childList: true, subtree: true });

        return () => {
            outer.removeEventListener('scroll', onScroll, { capture: true });
            observer.disconnect();
        };
    }, []);

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
        'file_status_tracking.status_tracking.retracted': {
            widthMap: { lg: 140, md: 90, sm: 90 },
            render: function (result, props) {
                const { file_status_tracking = {} } = result || {};
                const { status_tracking = {} } = file_status_tracking || {};
                const { retracted_date } = status_tracking || {};
                return retracted_date ? (
                    <span className="value text-start">{retracted_date}</span>
                ) : null;
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
            widthMap: { lg: 180, md: 140, sm: 140 },
            colAlignment: 'text-start',
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
            colAlignment: 'text-start',
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
        assays: {
            colTitle: 'Assays',
            widthMap: { lg: 100, md: 75, sm: 75 },
            colAlignment: 'text-start',
            render: function (result, props) {
                const assayString =
                    result?.assays?.length > 0
                        ? result.assays
                              .map((assay) => assay?.display_title)
                              .join(', ')
                        : null;
                if (!assayString) return null;
                return <span className="value text-start">{assayString}</span>;
            },
        },
        release_tracker_description: {
            colTitle: 'Description',
            widthMap: { lg: 250, md: 75, sm: 75 },
            colAlignment: 'text-start',
            render: function (result, props) {
                return result?.release_tracker_description ? (
                    <span className="value text-start">
                        {result.release_tracker_description}
                    </span>
                ) : null;
            },
        },
        'sample_summary.sample_names': {
            widthMap: { lg: 160, md: 120, sm: 120 },
            colAlignment: 'text-start',
            render: function (result, props) {
                const { sample_summary, sample_sources } = result || {};

                // Pull out either sample names or sample sources
                const samplesList =
                    sample_summary?.sample_names?.length > 0
                        ? sample_summary.sample_names
                        : sample_sources?.map(
                              (source) => source.display_title
                          ) || null;

                const sampleNames = samplesList?.join(', ');
                return sampleNames ? (
                    <span className="value text-start">{sampleNames}</span>
                ) : null;
            },
        },
        'data_generation_summary.sequencing_center': {
            widthMap: { lg: 110, md: 90, sm: 90 },
        },
    };

    const columns = {
        access_status: {
            title: 'Access',
        },
        'file_status_tracking.status_tracking.retracted': {
            title: 'Retracted On',
        },
        accession: {
            title: 'Accession',
        },
        annotated_filename: {
            title: 'File',
        },
        retraction_reason: {
            title: 'Retraction Reason',
        },
        'replaced_by.display_title': {
            title: 'Replaced By',
        },
        assays: {
            title: 'Assays',
        },
        release_tracker_description: {
            title: 'Description',
        },
        'sample_summary.sample_names': {
            title: 'Sample',
        },
        'data_generation_summary.sequencing_center': {
            title: 'Center',
        },
    };

    return (
        <div
            className="retracted-files-table"
            ref={outerRef}
            style={{ position: 'relative' }}>
            <EmbeddedItemSearchTable
                searchHref={searchHref}
                schemas={schemas}
                session={session}
                facets={null}
                rowHeight={31}
                maxResultsBodyHeight={600}
                columns={columns}
                columnExtensionMap={columnExtensionMap}
                embeddedTableHeader={<RetractedFilesTableHeader />}
            />
            {showShadow && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        background:
                            'linear-gradient(to bottom, transparent, rgba(255,255,255,0.88))',
                        pointerEvents: 'none',
                        zIndex: 10,
                    }}
                />
            )}
        </div>
    );
}
