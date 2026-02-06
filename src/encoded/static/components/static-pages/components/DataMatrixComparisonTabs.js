'use strict';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import DataMatrix from '../../viz/Matrix/DataMatrix';

export function DataMatrixComparisonTabs({ session, tabs }) {
    const tabConfigs = useMemo(() => tabs || [], [tabs]);

    const getHashKey = useCallback(() => {
        if (typeof window === 'undefined') return null;
        const hash = window.location.hash || '';
        if (!hash) return null;
        const cleaned = hash.replace(/^#/, '');
        if (!cleaned) return null;
        return decodeURIComponent(cleaned);
    }, []);

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
        if (hashKey && tabConfigs.some((tab) => tab.key === hashKey)) {
            return hashKey;
        }
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
        if (hashKey && tabConfigs.some((tab) => tab.key === hashKey)) {
            if (hashKey !== activeKey) setActiveKey(hashKey);
            return;
        }
        if (activeKey && tabConfigs.some((tab) => tab.key === activeKey)) return;
        const preferred = tabConfigs.find((tab) => tab.key === 'production') || tabConfigs[0];
        setActiveKey(preferred?.key ?? null);
        // activeKey intentionally omitted from deps to avoid clobbering user selection on data reload.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabConfigs, session, getHashKey]);

    useEffect(() => {
        if (!tabConfigs.length) return;
        const visibleTabs = tabConfigs.filter((tab) => tabDataState[tab.key]?.hasData !== false);

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
    }, [activeKey, tabConfigs, tabDataState, session]);

    useEffect(() => {
        if (!activeKey) return;
        if (typeof window === 'undefined') return;
        if (!window.location.hash) return;
        setHashKey(activeKey);
    }, [activeKey, setHashKey]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onHashChange = () => {
            const hashKey = getHashKey();
            if (!hashKey) return;
            if (tabConfigs.some((tab) => tab.key === hashKey)) {
                setActiveKey(hashKey);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [getHashKey, tabConfigs]);

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

    const tabIsVisible = (tab) => {
        // During initial load, keep all tabs visible; after load, hide ones with no data.
        if (!allLoaded && !hasAnyLoaded) return true;
        return tabDataState[tab.key]?.hasData !== false;
    };

    const visibleTabs = tabConfigs.filter(tabIsVisible);
    // Always render all panels so they can refetch when session changes, even if hidden.
    const panelsToRender = tabConfigs;
    const renderTabs = allLoaded ? visibleTabs : tabConfigs;
    const activeTab = visibleTabs.find((tab) => tab.key === activeKey) || renderTabs[0];

    return (
        <div key="data-matrix-tabs" className="data-matrix-container container">
            <div className="row">
                <div className="tabs-container d-flex flex-column" aria-busy={isLoading}>
                    {isLoading ? (
                        <div className="tabs-loading-overlay d-flex align-items-center justify-content-center">
                            <i className="icon icon-spin icon-circle-notch fas" />
                        </div>
                    ) : null}
                    <div className="tab-headers d-flex flex-wrap gap-3">
                        {renderTabs.map((tab) => {
                            const isActive = tab.key === activeTab?.key;
                            const hasDataFlag = tabDataState[tab.key]?.hasData;
                            const dataHasContent = hasDataFlag === false && allLoaded ? 'false' : 'true';
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className={`tab-header ${tab.className || ''} ${isActive ? 'is-active' : 'is-inactive'} ${!allLoaded ? 'is-loading' : ''}`}
                                    data-has-data={dataHasContent}
                                    onClick={() => setActiveKey(tab.key)}
                                    aria-pressed={isActive}
                                    aria-controls={`data-matrix-panel-${tab.key}`}>
                                    <span className="title">{tab.title}</span>
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
                            {panelsToRender.map((tab) => {
                                const isActive = tab.key === activeTab?.key;
                                const headerVisible = visibleTabs.some((t) => t.key === tab.key);
                                const dataMatrixKey = (tab.matrixProps && tab.matrixProps.key) || tab.key;
                                const displayStyle = isActive && headerVisible ? 'flex' : 'none';
                                return (
                                    <div
                                        key={tab.key}
                                        className={`tab-card ${tab.className || ''} ${isActive ? 'is-active' : 'is-inactive'}`}
                                        style={{ display: displayStyle }}
                                        aria-hidden={!isActive}>
                                        <div
                                            className="body d-flex justify-content-start justify-content-lg-center overflow-auto"
                                            id={`data-matrix-panel-${tab.key}`}>
                                            <DataMatrix
                                                {...(tab.matrixProps || {})}
                                                key={dataMatrixKey}
                                                session={session}
                                                onDataLoaded={handleDataLoaded(tab.key)}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
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
    className: PropTypes.string,
    matrixProps: PropTypes.object.isRequired
});

DataMatrixComparisonTabs.propTypes = {
    session: PropTypes.any,
    tabs: PropTypes.arrayOf(tabShape).isRequired
};
