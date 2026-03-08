'use strict';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import DataMatrix from '../../viz/Matrix/DataMatrix';

export function DataMatrixComparisonTabs({ session, tabs }) {
    const tabConfigs = useMemo(() => tabs || [], [tabs]);

    const normalizeTabKey = useCallback((value) => {
        if (typeof value !== 'string') return null;
        let decoded;
        try {
            decoded = decodeURIComponent(value);
        } catch (e) {
            decoded = value;
        }
        decoded = decoded.trim().replace(/^#/, '');
        if (!decoded) return null;
        return decoded.split(/[/?&]/)[0].toLowerCase();
    }, []);

    const getHashKey = useCallback(() => {
        if (typeof window === 'undefined') return null;
        const hash = window.location.hash || '';
        if (!hash) return null;
        return normalizeTabKey(hash);
    }, [normalizeTabKey]);

    const keysMatch = useCallback((left, right) => {
        const leftNormalized = normalizeTabKey(left);
        const rightNormalized = normalizeTabKey(right);
        if (!leftNormalized || !rightNormalized) return false;
        return leftNormalized === rightNormalized;
    }, [normalizeTabKey]);

    const resolveTabKey = useCallback((key) => {
        if (!key) return null;
        const found = tabConfigs.find((tab) => keysMatch(tab.key, key));
        return found?.key ?? null;
    }, [tabConfigs, keysMatch]);

    const setHashKey = useCallback((key) => {
        if (typeof window === 'undefined') return;
        if (!key) return;
        const nextHash = `#${encodeURIComponent(key)}`;
        if (window.location.hash === nextHash) return;
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, '', nextHash);
        } else {
            window.location.hash = nextHash;
        }
    }, []);

    const [tabDataState, setTabDataState] = useState(() => (
        tabConfigs.reduce((acc, tab) => {
            acc[tab.key] = { hasData: null, totalFiles: null, loaded: false };
            return acc;
        }, {})
    ));

    const [activeKey, setActiveKey] = useState(() => {
        const hashKey = getHashKey();
        const resolvedHashKey = resolveTabKey(hashKey);
        if (resolvedHashKey) return resolvedHashKey;
        const hasProduction = tabConfigs.find((tab) => tab.key === 'production');
        return hasProduction ? 'production' : tabConfigs[0]?.key ?? null;
    });

    useEffect(() => {
        // Only reset when the tab set actually changes (by keys).
        setTabDataState((prev) => {
            const next = tabConfigs.reduce((acc, tab) => {
                const existing = prev[tab.key];
                acc[tab.key] = existing ?? { hasData: null, totalFiles: null, loaded: false };
                return acc;
            }, {});
            return next;
        });

        if (!tabConfigs.length) return;
        const hashKey = getHashKey();
        const resolvedHashKey = resolveTabKey(hashKey);
        if (resolvedHashKey) {
            if (resolvedHashKey !== activeKey) setActiveKey(resolvedHashKey);
            return;
        }
        if (activeKey && resolveTabKey(activeKey)) return;
        const preferred = tabConfigs.find((tab) => tab.key === 'production') || tabConfigs[0];
        setActiveKey(preferred?.key ?? null);
        // activeKey intentionally omitted from deps to avoid clobbering user selection on data reload.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabConfigs, session, getHashKey, resolveTabKey]);

    useEffect(() => {
        if (!tabConfigs.length) return;
        const visibleTabs = tabConfigs.filter((tab) => tabDataState[tab.key]?.hasData !== false);
        const hashKey = getHashKey();
        const resolvedHashKey = resolveTabKey(hashKey);

        // Always prioritize URL hash on initial load / refresh.
        if (resolvedHashKey) {
            if (activeKey !== resolvedHashKey) {
                setActiveKey(resolvedHashKey);
            }
            return;
        }

        if (visibleTabs.length === 0) {
            if (activeKey !== null) setActiveKey(null);
            return;
        }

        const activeIsVisible = activeKey && visibleTabs.some((tab) => tab.key === activeKey);
        if (activeIsVisible) return;

        const tabsWithData = visibleTabs.filter((tab) => tabDataState[tab.key]?.hasData);
        const preferred = tabsWithData.find((tab) => tab.key === 'production') || tabsWithData[0];
        const nextActive = preferred ? preferred.key : visibleTabs[0].key;

        if (nextActive !== activeKey) {
            setActiveKey(nextActive);
        }
    }, [activeKey, tabConfigs, tabDataState, session, getHashKey, resolveTabKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onHashChange = () => {
            const hashKey = getHashKey();
            if (!hashKey) return;
            const resolvedHashKey = resolveTabKey(hashKey);
            if (resolvedHashKey) {
                setActiveKey(resolvedHashKey);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [getHashKey, tabConfigs, resolveTabKey]);

    const handleDataLoaded = useCallback((tabKey) => (payload = {}) => {
        const totalFiles = typeof payload.totalFiles === 'number' ? payload.totalFiles : 0;
        const hasData = typeof payload.hasData === 'boolean' ? payload.hasData : totalFiles > 0;
        setTabDataState((prev) => ({
            ...prev,
            [tabKey]: { hasData, totalFiles, loaded: true }
        }));
    }, []);

    const hasAnyLoaded = tabConfigs.some((tab) => tabDataState[tab.key]?.loaded);
    const allLoaded = tabConfigs.length > 0 && tabConfigs.every((tab) => tabDataState[tab.key]?.loaded);
    const isLoading = tabConfigs.length > 0 && !hasAnyLoaded;

    useEffect(() => {
        if (hasAnyLoaded || !tabConfigs.length) return;
        const timeout = setTimeout(() => {
            setTabDataState((prev) => {
                let changed = false;
                const next = { ...prev };
                tabConfigs.forEach((tab) => {
                    if (!next[tab.key]?.loaded) {
                        next[tab.key] = { hasData: false, totalFiles: 0, loaded: true };
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        }, 10000);
        return () => clearTimeout(timeout);
    }, [hasAnyLoaded, tabConfigs, session]);

    if (!tabConfigs.length) return null;

    const hashKeyForVisibility = getHashKey();
    const tabIsVisible = (tab) => {
        if (hashKeyForVisibility && keysMatch(tab.key, hashKeyForVisibility)) return true;
        // During initial load, keep all tabs visible; after load, hide ones with no data.
        if (!allLoaded && !hasAnyLoaded) return true;
        return tabDataState[tab.key]?.hasData !== false;
    };

    const visibleTabs = tabConfigs.filter(tabIsVisible);
    const renderTabs = allLoaded ? visibleTabs : tabConfigs;
    const hashKeyForRender = getHashKey();
    const validHashKeyForRender = resolveTabKey(hashKeyForRender);
    const effectiveActiveKey = validHashKeyForRender || activeKey;
    const selectedKey = effectiveActiveKey || renderTabs[0]?.key || null;
    const selectedTab = tabConfigs.find((tab) => tab.key === selectedKey) || tabConfigs[0] || null;
    const getMatrixTitle = useCallback((tab) => {
        if (!tab) return null;
        if (typeof tab.matrixTitle === 'string' && tab.matrixTitle) {
            return tab.matrixTitle;
        }
        if (typeof tab.title === 'string' && tab.title) {
            return `${tab.title} Matrix`;
        }
        return null;
    }, []);

    const getTabIconClass = useCallback((tab) => {
        if (!tab) return null;
        if (typeof tab.iconCls === 'string' && tab.iconCls) return tab.iconCls;
        if (tab.key === 'benchmarking') return 'icon-hourglass-half';
        if (tab.key === 'production') return 'icon-lungs';
        return null;
    }, []);

    return (
        <div key="data-matrix-tabs" className="data-matrix-container container-fluid px-0">
            <div className="row">
                <div className="tabs-container d-flex flex-column" aria-busy={isLoading}>
                    {isLoading ? (
                        <div className="tabs-loading-overlay d-flex align-items-center justify-content-center">
                            <i className="icon icon-spin icon-circle-notch fas" />
                        </div>
                    ) : null}
                    <div className="tab-headers d-flex flex-wrap gap-3">
                        {renderTabs.map((tab) => {
                            const isActive = tab.key === selectedTab?.key;
                            const hasDataFlag = tabDataState[tab.key]?.hasData;
                            const dataHasContent = hasDataFlag === false && allLoaded ? 'false' : 'true';
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className={`tab-header ${tab.className || ''} ${isActive ? 'is-active' : 'is-inactive'} ${!allLoaded ? 'is-loading' : ''}`}
                                    data-has-data={dataHasContent}
                                    onClick={() => {
                                        setActiveKey(tab.key);
                                        setHashKey(tab.key);
                                    }}
                                    aria-pressed={isActive}
                                    aria-controls={`data-matrix-panel-${tab.key}`}>
                                    <span className="title">
                                        {getTabIconClass(tab) ? (
                                            <i className={`icon fas ${getTabIconClass(tab)} me-15`} />
                                        ) : null}
                                        {tab.title}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {!isLoading && visibleTabs.length === 0 ? (
                        <div className="tab-card w-100">
                            <div className="body d-flex align-items-center justify-content-center">
                                <span className="text-secondary">
                                    No data is currently available
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="tab-panels-wrapper position-relative">
                            {selectedTab ? (
                                <div
                                    key={selectedTab.key}
                                    className={`tab-card ${selectedTab.className || ''} is-active`}
                                    aria-hidden={false}>
                                    <div
                                        className="body d-flex justify-content-start overflow-auto"
                                        id={`data-matrix-panel-${selectedTab.key}`}>
                                        <div className="matrix-panel-content w-100">
                                            {getMatrixTitle(selectedTab) ? (
                                                <div className="matrix-panel-title">
                                                    <h2>{getMatrixTitle(selectedTab)}</h2>
                                                </div>
                                            ) : null}
                                            <DataMatrix
                                                {...(selectedTab.matrixProps || {})}
                                                key={(selectedTab.matrixProps && selectedTab.matrixProps.key) || selectedTab.key}
                                                session={session}
                                                onDataLoaded={handleDataLoaded(selectedTab.key)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const tabShape = PropTypes.shape({
    key: PropTypes.string.isRequired,
    title: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
    iconCls: PropTypes.string,
    matrixTitle: PropTypes.string,
    className: PropTypes.string,
    matrixProps: PropTypes.object.isRequired
});

DataMatrixComparisonTabs.propTypes = {
    session: PropTypes.any,
    tabs: PropTypes.arrayOf(tabShape).isRequired
};
