'use strict';

import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import memoize from 'memoize-one';

import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';

export default function RetractedFilesTable(props) {
    const { schemas, session, searchHref: propSearchHref } = props;
    const searchHref = 
        propSearchHref || "/search/?type=File&status=retracted&file_status_tracking.released_date!=No+value&sort=-file_status_tracking.retracted_date";

    const columnExtensionMap = {
        "access_status": {
            "widthMap": { lg: 70, md: 70, sm: 70 },
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
        "file_status_tracking.retracted_date": {
            "widthMap": { lg: 140, md: 90, sm: 90 }
        },
        "accession": {
            "widthMap": { lg: 145, md: 120, sm: 120 },
            render: function (result, props) {
                const { '@id': atId, accession } = result || {};

                return (
                    <span className="value text-start">
                        {
                            accession ?
                                <a href={atId} target="_blank" rel="noreferrer noopener">{accession}</a>
                                : '-'
                        }
                    </span>
                );
            }
        },
        "annotated_filename": {
            "widthMap": { lg: 350, md: 200, sm: 200 },
            render: function (result, props) {
                const { '@id': atId, annotated_filename } = result || {};

                return (
                    <span className="value text-start">
                        {
                            annotated_filename ?
                                <a href={atId} target="_blank" rel="noreferrer noopener">{annotated_filename}</a>
                                : '-'
                        }
                    </span>
                );
            }
        },
        "retraction_reason": {
            "widthMap": { lg: 250, md: 120, sm: 120 }
        },
        "replaced_by.display_title": {
            "widthMap": { lg: 170, md: 120, sm: 120 },
            render: function (result, props) {
                const { replaced_by: { '@id': atId, annotated_filename, display_title } = {} } = result || {};
                if (!atId) return null;
                return (
                    <span className="value text-start">
                        <a href={atId} target="_blank" rel="noreferrer noopener">{annotated_filename || display_title}</a>
                    </span>
                );
            }
        },
        "release_tracker_description": {
            "widthMap": { lg: 150, md: 75, sm: 75 }
        },
        "sample_summary.sample_names": {
            "widthMap": { lg: 160, md: 120, sm: 120 }
        },
        "data_generation_summary.sequencing_center": {
            "widthMap": { lg: 110, md: 90, sm: 90 }
        }
    };

    const columns = {
        "access_status": {
            "title": "Access",
        },
        "file_status_tracking.retracted_date": {
            "title": "Retracted On",
        },
        "accession": {
            "title": "Accession",
        },
        "annotated_filename": {
            "title": "File",
        },
        "notes_to_tsv": {
            "title": "Reason of Retraction",
        },
        "replaced_by.display_title": {
            "title": "Replaced By",
        },
        "release_tracker_description": {
            "title": "Assay",
        },
        "sample_summary.sample_names": {
            "title": "Sample",
        },
        "data_generation_summary.sequencing_center": {
            "title": "Center",
        }
    };

    return (
        <div className='retracted-files-table'>
            <EmbeddedItemSearchTable
                searchHref={searchHref}
                schemas={schemas}
                session={session}
                facets={null}
                rowHeight={31}
                columns={columns}
                columnExtensionMap={columnExtensionMap}
            />
        </div>
    );
}