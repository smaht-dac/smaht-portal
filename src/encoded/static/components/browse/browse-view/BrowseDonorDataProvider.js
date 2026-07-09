'use strict';

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from '../BrowseView';

const DONOR_PEEK_METADATA_ADDITIONAL_FACETS = [
    'sample_summary.tissues',
    'assays.display_title',
    'file_size',
];

const buildDonorPeekMetadataUrl = (displayTitle) => {
    const additionalFacetParams = DONOR_PEEK_METADATA_ADDITIONAL_FACETS.map(
        (facet) => `additional_facet=${facet}`
    ).join('&');
    return `/peek-metadata/?skip_default_facets=true&${additionalFacetParams}&${BROWSE_STATUS_FILTERS}&dataset!=No+value&type=File&donors.display_title=${encodeURIComponent(displayTitle)}`;
};

// Set a limit on the number of concurrent requests to avoid overloading the server
const CONCURRENCY_LIMIT = 4;

// Context for holding per-donor facet data fetched in display order
export const DonorDataContext = createContext({
    getDonorData: () => ({ data: null, loading: true }),
    enqueueDonor: () => {},
    version: 0,
});

/**
 * Provides per-donor facet data fetched in display order with a limited
 * concurrency queue. Each cell registers itself via `enqueueDonor()` when
 * it mounts. Rows loaded by infinite scroll are handled automatically.
 */
export const DonorDataProvider = ({ children }) => {
    const cacheRef = useRef(new Map());
    const pendingRef = useRef(new Set());
    const queueRef = useRef([]);
    const activeRef = useRef(0);
    const [version, setVersion] = useState(0);

    const dispatch = useCallback(() => {
        if (
            activeRef.current >= CONCURRENCY_LIMIT ||
            queueRef.current.length === 0
        )
            return;

        const { displayTitle, url } = queueRef.current.shift();
        pendingRef.current.delete(displayTitle);
        activeRef.current++;
        cacheRef.current.set(displayTitle, { data: null, loading: true });

        const onComplete = (cacheEntry) => {
            cacheRef.current.set(displayTitle, cacheEntry);
            activeRef.current--;
            setVersion((v) => v + 1);
            dispatch();
        };

        ajax.load(
            url,
            (resp) => onComplete({ data: resp ?? null, loading: false }),
            'GET',
            () => onComplete({ data: null, loading: false })
        );

        dispatch(); // fill any remaining available slots
    }, []);

    const enqueueDonor = useCallback(
        (displayTitle) => {
            if (
                !cacheRef.current.has(displayTitle) &&
                !pendingRef.current.has(displayTitle)
            ) {
                pendingRef.current.add(displayTitle);
                queueRef.current.push({
                    displayTitle,
                    url: buildDonorPeekMetadataUrl(displayTitle),
                });
                dispatch();
            }
        },
        [dispatch]
    );

    const getDonorData = useCallback(
        (displayTitle) =>
            cacheRef.current.get(displayTitle) ?? { data: null, loading: true },
        []
    );

    const contextValue = useMemo(
        () => ({ getDonorData, enqueueDonor, version }),
        [getDonorData, enqueueDonor, version]
    );

    return (
        <DonorDataContext.Provider value={contextValue}>
            {children}
        </DonorDataContext.Provider>
    );
};

/**
 * Wrapper component for donor column cells. Registers the donor with the provider
 * on mount so its data is fetched in queue order, then re-renders when data arrives.
 */
export const DonorDataCell = ({ displayTitle, children }) => {
    const { getDonorData, enqueueDonor } = useContext(DonorDataContext);

    useEffect(() => {
        enqueueDonor(displayTitle);
    }, [displayTitle, enqueueDonor]);

    const { data, loading } = getDonorData(displayTitle);
    return children({ data, loading });
};
