import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BoxPlotWithFacets } from './BoxPlotWithFacets';
import { ScatterlotWithFacets } from './ScatterPlotWithFacets';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';

const defaultSelectedQcMetric =
    'samtools_stats:percentage_of_properly_paired_reads';
const defaultAssay = 'WGS';
const defaultGrouping = 'submission_center';
const defaultSampleSource = 'all_tissues';
const defaultSequencer = 'Illumina NovaSeq X / Illumina NovaSeq X Plus';

export const QualityMetricVisualizations = () => {
    const [qcData, setQcData] = useState(null);
    const [tab, setTab] = useState('key-metrics');

    useEffect(() => {
        ajax.load(
            '/get_qc_overview/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                setQcData(resp.data);
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
                <Tab eventKey="key-metrics" title="Key Metrics">
                    <div className="row">
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                                Estimated Average Coverage (short read)
                            </h4>
                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - Illumina sequencing"
                                settings={{
                                    selectedQcMetric: 'mosdepth:total',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_illumina',
                                }}
                            />
                        </div>
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                                Estimated Average Coverage (long read)
                            </h4>

                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - PacBio / ONT sequencing"
                                settings={{
                                    selectedQcMetric: 'mosdepth:total',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_long_read',
                                }}
                            />
                        </div>
                    </div>

                    <div className="row mt-2">
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                                Percentage of Reads Mapped
                            </h4>
                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - Illumina sequencing"
                                settings={{
                                    selectedQcMetric:
                                        'samtools_stats_postprocessed:percentage_reads_mapped',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_illumina',
                                }}
                            />
                        </div>
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                                Percentage of Properly Paired Reads
                            </h4>

                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - Illumina sequencing"
                                settings={{
                                    selectedQcMetric:
                                        'samtools_stats:percentage_of_properly_paired_reads',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_illumina',
                                }}
                            />
                        </div>
                    </div>

                    <div className="row mt-2">
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                                Percentage of Reads Duplicated
                            </h4>
                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - Illumina sequencing"
                                settings={{
                                    selectedQcMetric:
                                        'samtools_stats_postprocessed:percentage_reads_duplicated',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_illumina',
                                }}
                            />
                        </div>
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                                Aligned Bases Mismatch Rate
                            </h4>

                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - Illumina sequencing"
                                settings={{
                                    selectedQcMetric:
                                        'picard_collect_alignment_summary_metrics:pf_mismatch_rate',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_illumina',
                                }}
                            />
                        </div>
                    </div>

                    <div className="row mt-2">
                        <div className="col-lg-6">
                            <h4 className="mt-2 mb-2 text-center">
                            Mean Insert Size
                            </h4>
                            <BoxPlotWithFacets
                                qcData={qcData}
                                showFacets={false}
                                showDataTable={false}
                                boxPlotTitle="Tissue data sets - WGS - Illumina sequencing"
                                settings={{
                                    selectedQcMetric:
                                        'picard_collect_insert_size_metrics:mean_insert_size',
                                    assay: 'WGS',
                                    grouping: 'submission_center',
                                    sampleSource: 'tissue',
                                    sequencer: 'all_illumina',
                                }}
                            />
                        </div>
                        
                    </div>
                </Tab>
                <Tab eventKey="all-metrics" title="Metrics - All">
                    <BoxPlotWithFacets qcData={qcData} />
                </Tab>
                <Tab
                    eventKey="metrics-v-metric"
                    title="Metric vs. Metric - All">
                    <ScatterlotWithFacets qcData={qcData} />
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
