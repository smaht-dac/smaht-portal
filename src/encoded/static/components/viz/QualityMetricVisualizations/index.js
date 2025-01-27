import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BoxPlotWithFacets } from './BoxPlotWithFacets';
import { ScatterlotWithFacets } from './ScatterPlotWithFacets';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import Nav from 'react-bootstrap/Nav';

const defaultSelectedQcMetric =
    'samtools_stats:percentage_of_properly_paired_reads';
const wgs = 'WGS';
const rnaSeq = 'RNA-seq';
const defaultGrouping = 'submission_center';
const defaultSampleSource = 'all_tissues';
const defaultSequencer = 'Illumina NovaSeq X / Illumina NovaSeq X Plus';

const benchmarkingCellLines = 'benchmarking_cell_lines';
const benchmarkingTissues = 'benchmarking_tissues';
const productionTissues = 'production_tissues';

export const QualityMetricVisualizations = () => {
    const [qcData, setQcData] = useState(null);
    const [tab, setTab] = useState('key-metrics');
    const [selectedSampleSource, setSelectedSampleSource] = useState(
        benchmarkingCellLines
    );
    const [selectedAssay, setSelectedAssay] = useState(wgs);

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

    const getBoxPlot = (
        header,
        title,
        metric,
        assay,
        sampleSource,
        sequencer
    ) => {
        return (
            <div className="col-lg-6 mt-2">
                <h4 className="mt-2 mb-2 text-center">{header}</h4>
                <BoxPlotWithFacets
                    qcData={qcData}
                    showFacets={false}
                    showDataTable={false}
                    boxPlotTitle={title}
                    settings={{
                        selectedQcMetric: metric,
                        assay: assay,
                        grouping: 'submission_center',
                        sampleSource: sampleSource,
                        sequencer: sequencer,
                    }}
                />
            </div>
        );
    };

    const getCommonMetricsPlots = (sampleSource, sampleSourceLabel, assay) => {
        return (
            <>
                {getBoxPlot(
                    'Total Sequences (short read)',
                    `${sampleSourceLabel} - ${assay} - Illumina sequencing`,
                    'samtools_stats:raw_total_sequences',
                    assay,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Total Sequences (long read)',
                    `${sampleSourceLabel} - ${assay} - PacBio / ONT sequencing`,
                    'samtools_stats:raw_total_sequences',
                    assay,
                    sampleSource,
                    'all_long_read'
                )}
                {getBoxPlot(
                    'Percentage of Reads Mapped (short read)',
                    `${sampleSourceLabel} - ${assay} - Illumina sequencing`,
                    'samtools_stats_postprocessed:percentage_reads_mapped',
                    assay,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Percentage of Reads Mapped (long read)',
                    `${sampleSourceLabel} - ${assay} - PacBio / ONT sequencing`,
                    'samtools_stats_postprocessed:percentage_reads_mapped',
                    assay,
                    sampleSource,
                    'all_long_read'
                )}
                {getBoxPlot(
                    'Human contamination (short read)',
                    `${sampleSourceLabel} - ${assay} - Illumina sequencing`,
                    'verifybamid:freemix_alpha',
                    assay,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Human contamination (long read)',
                    `${sampleSourceLabel} - ${assay} - PacBio sequencing`,
                    'verifybamid:freemix_alpha',
                    assay,
                    sampleSource,
                    'all_long_read'
                )}
                {getBoxPlot(
                    'Percentage of Reads Duplicated (short read)',
                    `${sampleSourceLabel} - ${assay} - Illumina sequencing`,
                    'samtools_stats_postprocessed:percentage_reads_duplicated',
                    assay,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Mean Insert Size (short read)',
                    `${sampleSourceLabel} - ${assay} - Illumina sequencing`,
                    'picard_collect_insert_size_metrics:mean_insert_size',
                    assay,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Mean Read Length (long read)',
                    `${sampleSourceLabel} - ${assay} - PacBio / ONT sequencing`,
                    'picard_collect_alignment_summary_metrics:mean_read_length',
                    assay,
                    sampleSource,
                    'all_long_read'
                )}
            </>
        );
    };

    const getRnaSeqMetricsPlots = (sampleSource, sampleSourceLabel) => {
        return (
            <>
                {getBoxPlot(
                    'Total Reads',
                    `${sampleSourceLabel} - ${rnaSeq} - Illumina sequencing`,
                    'rnaseqc:total_reads',
                    rnaSeq,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Mapping Rate',
                    `${sampleSourceLabel} - ${rnaSeq} - Illumina sequencing`,
                    'rnaseqc:mapping_rate',
                    rnaSeq,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Duplication Rate',
                    `${sampleSourceLabel} - ${rnaSeq} - Illumina sequencing`,
                    'rnaseqc:duplicate_rate_of_mapped',
                    rnaSeq,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Mean 3p Bias',
                    `${sampleSourceLabel} - ${rnaSeq} - Illumina sequencing`,
                    'rnaseqc:mean_3p_bias',
                    rnaSeq,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'Exon-Intron ratio',
                    `${sampleSourceLabel} - ${rnaSeq} - Illumina sequencing`,
                    'rnaseqc:exonic_intron_ratio',
                    rnaSeq,
                    sampleSource,
                    'all_illumina'
                )}
                {getBoxPlot(
                    'rRNA rate',
                    `${sampleSourceLabel} - ${rnaSeq} - Illumina sequencing`,
                    'rnaseqc:rrna_rate',
                    rnaSeq,
                    sampleSource,
                    'all_illumina'
                )}
            </>
        );
    };

    const cellLineWgsViz =
        selectedSampleSource === benchmarkingCellLines &&
        selectedAssay === wgs ? (
            <div className="row">
                {getCommonMetricsPlots(
                    'cell_line',
                    'Benchmarking Cell Lines',
                    wgs
                )}
            </div>
        ) : (
            ''
        );

    const benchmarkingTissueWgsViz =
        selectedSampleSource === benchmarkingTissues &&
        selectedAssay === wgs ? (
            <div className="row">
                {getCommonMetricsPlots('tissue', 'Tissue Homogenates', wgs)}
            </div>
        ) : (
            ''
        );

    const cellLineRnaSeqViz =
        selectedSampleSource === benchmarkingCellLines &&
        selectedAssay === rnaSeq ? (
            <div className="row">
                {getRnaSeqMetricsPlots('cell_line', 'Benchmarking Cell Lines')}
            </div>
        ) : (
            ''
        );

    const benchmarkingTissueRnaSeqViz =
        selectedSampleSource === benchmarkingTissues &&
        selectedAssay === rnaSeq ? (
            <div className="row">
                {getRnaSeqMetricsPlots('tissue', 'Benchmarking Cell Lines')}
            </div>
        ) : (
            ''
        );

    return qcData ? (
        <>
            <Tabs
                id="qc-metrics-tabs"
                activeKey={tab}
                onSelect={(t) => setTab(t)}
                className="mb-3">
                <Tab eventKey="key-metrics" title="Key Metrics">
                    <div className="qc-metrics-facets-container p-3">
                        <div className="row">
                            <div className="col-lg-3">
                                <div className="fw-bold pt-1 text-secondary">
                                    Selected Assay:
                                </div>
                            </div>
                            <div className="col-lg-9">
                                <Nav
                                    variant="pills"
                                    fill
                                    justify
                                    defaultActiveKey={wgs}>
                                    <Nav.Item>
                                        <Nav.Link
                                            onClick={() => {
                                                document.activeElement.blur();
                                                setSelectedAssay(wgs);
                                            }}
                                            eventKey={wgs}>
                                            WGS
                                        </Nav.Link>
                                    </Nav.Item>
                                    <Nav.Item>
                                        <Nav.Link
                                            onClick={() => {
                                                document.activeElement.blur();
                                                setSelectedAssay(rnaSeq);
                                            }}
                                            eventKey={rnaSeq}>
                                            RNA-Seq
                                        </Nav.Link>
                                    </Nav.Item>
                                </Nav>
                            </div>
                        </div>

                        <div className="row mt-2">
                            <div className="col-lg-3">
                                <div className="fw-bold pt-1 text-secondary">
                                    Selected Sample Source:
                                </div>
                            </div>
                            <div className="col-lg-9">
                                <Nav
                                    variant="pills"
                                    fill
                                    justify
                                    defaultActiveKey={benchmarkingCellLines}>
                                    <Nav.Item>
                                        <Nav.Link
                                            onClick={() => {
                                                document.activeElement.blur();
                                                setSelectedSampleSource(
                                                    benchmarkingCellLines
                                                );
                                            }}
                                            eventKey={benchmarkingCellLines}>
                                            Benchmarking Cell Lines
                                        </Nav.Link>
                                    </Nav.Item>
                                    <Nav.Item>
                                        <Nav.Link
                                            onClick={() => {
                                                document.activeElement.blur();
                                                setSelectedSampleSource(
                                                    benchmarkingTissues
                                                );
                                            }}
                                            eventKey={benchmarkingTissues}>
                                            Benchmarking Tissues
                                        </Nav.Link>
                                    </Nav.Item>
                                    <Nav.Item>
                                        <Nav.Link
                                            eventKey={productionTissues}
                                            disabled>
                                            <div className="qc-metrics-not-allowed">
                                                Production Tissues (coming soon)
                                            </div>
                                        </Nav.Link>
                                    </Nav.Item>
                                </Nav>
                            </div>
                        </div>
                    </div>

                    <div className="py-3">
                        {cellLineWgsViz}
                        {benchmarkingTissueWgsViz}
                        {cellLineRnaSeqViz}
                        {benchmarkingTissueRnaSeqViz}
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
