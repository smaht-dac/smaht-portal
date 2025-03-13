import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BoxPlotWithFacets } from './BoxPlotWithFacets';
import { ScatterlotWithFacets } from './ScatterPlotWithFacets';
import { SampleContamination } from './SampleContamination';
import { KeyMetrics } from './KeyMetrics';
import { MetricsByFile } from './MetricsByFile';

import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';

export const QualityMetricVisualizations = () => {
    const [qcData, setQcData] = useState(null);
    const [tab, setTab] = useState('sample-contamination');
    const [selectedFile, setSelectedFile] = useState(null);

    
    
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
                const file = urlParams.get("file");
                if(file){
                    setSelectedFile(file);
                    setTab('metrics-by-file');
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
                <Tab eventKey="sample-contamination" title="Sample Integrity">
                    <SampleContamination qcData={qcData} />
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
                    <ScatterlotWithFacets qcData={qcData} />
                </Tab>
                <Tab eventKey="metrics-by-file" title="Metrics by file">
                    <MetricsByFile qcData={qcData} preselectedFile={selectedFile}/>
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
