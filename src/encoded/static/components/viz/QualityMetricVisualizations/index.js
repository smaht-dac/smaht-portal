import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BoxPlotWithFacets } from './BoxPlotWithFacets';
import { ScatterPlotWithFacets } from './ScatterPlotWithFacets';
import { SampleContamination } from './SampleContamination';
import { KeyMetrics } from './KeyMetrics';
import { MetricsByFile } from './MetricsByFile';

import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';

export const QualityMetricVisualizations = () => {
    const [qcData, setQcData] = useState(null);
    const [tab, setTab] = useState('sample-integrity');
    const [preselectedTab, setPreselectedTab] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);

    const validTabs = [
        'sample-integrity',
        'key-metrics',
        'all-metrics',
        'metrics-v-metric',
        'metrics-by-file',
    ];

    useEffect(() => {
        ajax.load(
            '/get_qc_overview/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error_msg);
                    return;
                }
                setQcData(resp.data);

                // If the file parameter is provided, we want to show the "Metrics by file" tab by default
                const urlParams = new URLSearchParams(window.location.search);
                const file = urlParams.get('file');
                const tab = urlParams.get('tab');
                if (validTabs.includes(tab) && file) {
                    setSelectedFile(file);
                    setPreselectedTab(tab);
                    setTab(tab);
                }
            },
            'POST',
            () => {
                console.log('ERROR loading data');
            }
        );
    }, []);

    return qcData ? (
        <>
            <Tabs
                id="qc-metrics-tabs"
                activeKey={tab}
                onSelect={(t) => setTab(t)}
                className="mb-3">
                <Tab eventKey="sample-integrity" title="Sample Integrity">
                    <SampleContamination
                        qcData={qcData}
                        preselectedFile={selectedFile}
                    />
                </Tab>
                <Tab eventKey="key-metrics" title="Key Metrics">
                    <KeyMetrics qcData={qcData} />
                </Tab>
                <Tab eventKey="all-metrics" title="Metrics - All">
                    <BoxPlotWithFacets qcData={qcData} />
                </Tab>
                <Tab
                    eventKey="metrics-v-metric"
                    title="Metric vs. Metric - All">
                    <ScatterPlotWithFacets qcData={qcData} />
                </Tab>
                <Tab eventKey="metrics-by-file" title="Metrics by file">
                    <MetricsByFile
                        // We need to force a rerender when initial tab is not "metrics-by-file",
                        // otherwise the metrics are not correctly displayed (root cause is currently unclear)
                        key={
                            preselectedTab !== 'metrics-by-file' &&
                            tab === 'metrics-by-file'
                                ? Date.now()
                                : 'metrics-by-file'
                        }
                        qcData={qcData}
                        preselectedFile={selectedFile}
                    />
                </Tab>
            </Tabs>
        </>
    ) : (
        <div className="loader-container text-center m-5">
            <span className="spinner">
                <i className="icon icon-spin icon-circle-notch fas" />{' '}
                Loading...
            </span>
        </div>
    );
};
