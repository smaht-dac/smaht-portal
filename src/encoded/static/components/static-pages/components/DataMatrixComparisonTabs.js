'use strict';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import DataMatrix from '../../viz/Matrix/DataMatrix';

export function DataMatrixComparisonTabs({ session, tabs }) {
    const tabConfigs = useMemo(() => tabs || [], [tabs]);

    const [tabDataState, setTabDataState] = useState(() => (
        tabConfigs.reduce((acc, tab) => {
            acc[tab.key] = { hasData: null, totalFiles: null };
            return acc;
        }, {})
    ));

    const [activeKey, setActiveKey] = useState(() => {
        const hasProduction = tabConfigs.find((tab) => tab.key === 'production');
        return hasProduction ? 'production' : (tabConfigs[0] && tabConfigs[0].key) || null;
    });

    useEffect(() => {
        setTabDataState(
            tabConfigs.reduce((acc, tab) => {
                acc[tab.key] = { hasData: null, totalFiles: null };
                return acc;
            }, {})
        );

        if (!tabConfigs.length) return;
        if (activeKey && tabConfigs.some((tab) => tab.key === activeKey)) return;
        const preferred = tabConfigs.find((tab) => tab.key === 'production') || tabConfigs[0];
        setActiveKey(preferred ? preferred.key : null);
        // activeKey intentionally omitted from deps to avoid clobbering user selection on data reload.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tabConfigs]);

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
    }, [activeKey, tabConfigs, tabDataState]);

    const handleDataLoaded = useCallback((tabKey) => (payload = {}) => {
        const totalFiles = typeof payload.totalFiles === 'number' ? payload.totalFiles : 0;
        const hasData = typeof payload.hasData === 'boolean' ? payload.hasData : totalFiles > 0;
        setTabDataState((prev) => ({
            ...prev,
            [tabKey]: { hasData, totalFiles }
        }));
    }, []);

    if (!tabConfigs.length) return null;

    const visibleTabs = tabConfigs.filter((tab) => tabDataState[tab.key]?.hasData !== false);
    const activeTab = visibleTabs.find((tab) => tab.key === activeKey) || visibleTabs[0];

    return (
        <div key="data-matrix-tabs" className="data-matrix-container container">
            <div className="row">
                <div className="tabs-container d-flex flex-column">
                    <div className="tab-headers d-flex flex-wrap gap-3">
                        {visibleTabs.map((tab) => {
                            const isActive = tab.key === activeTab?.key;
                            const dataHasContent = tabDataState[tab.key]?.hasData === false ? 'false' : 'true';
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    className={`tab-header ${tab.className || ''} ${isActive ? 'is-active' : 'is-inactive'}`}
                                    data-has-data={dataHasContent}
                                    onClick={() => setActiveKey(tab.key)}
                                    aria-pressed={isActive}
                                    aria-controls={`data-matrix-panel-${tab.key}`}>
                                    <span className="title">{tab.title}</span>
                                </button>
                            );
                        })}
                    </div>
                    {visibleTabs.length === 0 ? (
                        <div className="tab-card w-100">
                            <div className="body d-flex align-items-center justify-content-center">
                                <span className="text-secondary">
                                    No data is currently available for these tabs.
                                </span>
                            </div>
                        </div>
                    ) : activeTab ? (
                        <div className={`tab-card ${activeTab.className || ''} is-active`}>
                            <div
                                className="body d-flex justify-content-start justify-content-lg-center overflow-auto"
                                id={`data-matrix-panel-${activeTab.key}`}>
                                <DataMatrix
                                    {...(activeTab.matrixProps || {})}
                                    key={(activeTab.matrixProps && activeTab.matrixProps.key) || activeTab.key}
                                    session={session}
                                    onDataLoaded={handleDataLoaded(activeTab.key)}
                                />
                            </div>
                        </div>
                    ) : null}
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
