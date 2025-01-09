import React, { useState, useCallback, useEffect } from 'react';

import {
    ajax,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BrowseLinkIcon } from './BrowseLinkIcon';

export const BrowseSummaryStatController = (props) => {
    const { type, useSearch = false, additionalSearchQueries = '' } = props;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [value, setValue] = useState('');
    const [units, setUnits] = useState('');

    const postData = {
        type: type !== 'File Size' ? type : 'File',
        status: 'released',
    };

    const callbackFxn = useCallback((resp) => {
        console.log('BrowseSummaryStatController resp', resp);
        if (!useSearch) {
            resp.forEach((facet) => {
                if (facet.field == 'status') {
                    facet.terms.forEach((term) => {
                        if (term.key == 'released') {
                            setValue(term.doc_count);
                        }
                    });
                }
            });
        } else {
            // Use search for File count total and File Size total
            const { facets = [], total } = resp;
            if (type === 'File Size') {
                facets.forEach((facet) => {
                    if (facet.field === 'file_size') {
                        setValue(
                            valueTransforms.bytesToLargerUnit(
                                facet.sum,
                                0,
                                false,
                                true
                            )
                        );
                        setUnits(
                            valueTransforms.bytesToLargerUnit(
                                facet.sum,
                                0,
                                true,
                                false
                            )
                        );
                    }
                });
            } else if (type === 'File') {
                setValue(total);
            }
        }
        setLoading(false);
        setError(false);
    });

    const fallbackFxn = useCallback((resp) => {
        console.log('BrowseSummaryStatController error', resp);
        setLoading(false);
        setError(true);
    });

    const getStatistics = useCallback(() => {
        if (!loading) setLoading(true);
        if (error) setError(false);

        if (!useSearch) {
            // Using peek-metadata for basic item counts
            ajax.load(
                `/peek-metadata/`,
                callbackFxn,
                'POST',
                fallbackFxn,
                JSON.stringify(postData)
            );
        } else {
            // Use search for more complicated query-based metrics
            ajax.load(
                `/search/?type=${postData.type}&format=json&status=released&limit=&additional_facet=file_size${additionalSearchQueries}`,
                callbackFxn,
                'GET',
                fallbackFxn
            );
        }
    }, [callbackFxn, fallbackFxn]);

    // On mount, get statistics
    useEffect(() => {
        getStatistics();
    }, []);

    return <BrowseSummaryStat {...{ value, type, loading, units }} />;
};

const BrowseSummaryStat = React.memo(function BrowseSummaryStat(props) {
    const { type, value, loading, units } = props;

    let subtitle;
    switch (type) {
        case 'File':
            subtitle = 'Files Generated';
            break;
        case 'Donor':
            subtitle = 'Donors';
            break;
        case 'Tissue':
            subtitle = 'Tissues';
            break;
        case 'Assay':
            subtitle = 'Assays';
            break;
        case 'File Size':
            subtitle = 'Total File Size';
            break;
        default:
            throw new Error('Must provide a valid type.');
    }

    return (
        <div className="browse-summary-stat d-flex flex-row">
            <BrowseLinkIcon
                {...{ type }}
                cls="mt-04 browse-summary-stat-icon-smaller"
            />
            <div className="ms-2">
                {loading && (
                    <div className="browse-summary-stat-value">
                        {' '}
                        <i className="icon icon-circle-notch icon-spin fas" />
                    </div>
                )}
                {!loading && (
                    <>
                        <div className="browse-summary-stat-value">
                            {!value && value !== 0 ? '-' : value}
                            {units && <span>{units}</span>}
                        </div>
                    </>
                )}
                <div className="browse-summary-stat-subtitle">{subtitle}</div>
            </div>
        </div>
    );
});
