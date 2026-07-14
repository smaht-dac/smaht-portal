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

// Limits simultaneous requests to avoid flooding the server while rows fill in quickly
const CONCURRENCY_LIMIT = 4;

// Context for holding per-donor facet data fetched in display order
export const DonorDataContext = createContext({
    getDonorData: () => {
        return { data: null, loading: true };
    },
    enqueueDonor: () => {},
    version: 0,
});

/**
 * Provides per-donor facet data fetched in display order with a limited
 * concurrency queue. Each cell registers itself via `enqueueDonor()` when
 * it mounts. Rows loaded by infinite scroll are handled automatically.
 */
export const DonorDataProvider = ({ buildHref, children }) => {
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
                    url: buildHref({ display_title: displayTitle }),
                });
                dispatch();
            }
        },
        [buildHref, dispatch]
    );

    const getDonorData = useCallback(
        (displayTitle) =>
            cacheRef.current.get(displayTitle) ?? { data: null, loading: true },
        []
    );

    const contextValue = useMemo(
        () => {
            return { getDonorData, enqueueDonor, version };
        },
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
