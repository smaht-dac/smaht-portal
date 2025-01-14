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
                console.log('resp.data: ', resp.data);
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

            {/* <h4>
                Sequencing throughput per BAM file (Cell line - Illumina - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files from the{' '}
                <strong>cell line</strong> data sets.
            </p>
            <div className="row">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={0}
                        title="Cell line data sets"
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        //customFormat={(d) => d.toExponential(1)}
                        customFormat={(d) => formatLargeInteger(d)}
                        customExtent={[0, 9000000000]}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'cell_line',
                                'short'
                            )
                        }
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        qcFieldFormat={','}
                        groupBy={'submission_center'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'cell_line',
                                'short'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>
            <h4 className="mt-4">
                Sequencing throughput per BAM file (Cell line - PacBio/ONT -
                WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files from the{' '}
                <strong>cell line</strong> data sets.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={1}
                        title="Cell line data sets"
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        customExtent={[-1000000, 60000000]}
                        //customFormat={(d) => d.toExponential(1)}
                        customFormat={(d) => formatLargeInteger(d)}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'cell_line',
                                'long'
                            )
                        }
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        qcFieldFormat={','}
                        groupBy={'submission_center'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'cell_line',
                                'long'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>

            <h4 className="mt-4">
                Sequencing throughput per BAM file (Tissues - Illumina - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files from the{' '}
                <strong>tissue</strong> data sets.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={2}
                        title="Tissues SR"
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        //customFormat={(d) => d.toExponential(1)}
                        customFormat={(d) => formatLargeInteger(d)}
                        customExtent={[0, 9000000000]}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'tissue',
                                'short'
                            )
                        }
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        qcFieldFormat={','}
                        groupBy={'submission_center'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'tissue',
                                'short'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>

            <h4 className="mt-4">
                Sequencing throughput per BAM file (Tissues - PacBio/ONT - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files from the{' '}
                <strong>tissue</strong> data sets.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={3}
                        title="Tissues LR"
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        customExtent={[-1000000, 60000000]}
                        //customFormat={(d) => d.toExponential(1)}
                        customFormat={(d) => formatLargeInteger(d)}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'tissue',
                                'long'
                            )
                        }
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={'samtools_stats:raw_total_sequences'}
                        qcFieldFormat={','}
                        groupBy={'submission_center'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:raw_total_sequences',
                                'WGS',
                                'tissue',
                                'long'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>

            <h4 className="mt-4">
                Mapping rate per BAM file and data type (Illumina - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files. The DAC
                internal threshold is currently set to 99%.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={4}
                        title="Mapping rates for short-read data"
                        xAxisLabel="Data type"
                        data={qcData}
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped'
                        }
                        qcCategory={"tissue_or_cell_line"}
                        customExtent={[90, 100.5]}
                        customFormat={(d) => d.toString() + '%'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped',
                                'WGS',
                                null,
                                'short'
                            )
                        }
                        thresholds_marks={{
                            horizontal: [
                                {
                                    value: 99,
                                    fill: 'red',
                                },
                            ],
                        }}
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped'
                        }
                        qcFieldFormat={','}
                        groupBy={'tissue_or_cell_line'}
                        sortOrder={'descending'}
                        additionalColumns={['sample_source']}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped',
                                'WGS',
                                null,
                                'short'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>

            <h4 className="mt-4">
                Mapping rate per BAM file and data type (PacBio/ONT - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files. The DAC
                internal threshold is currently set to 98%.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={5}
                        title="Mapping rates for long-read data"
                        data={qcData}
                        xAxisLabel="Data type"
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped'
                        }
                        qcCategory={"tissue_or_cell_line"}
                        customExtent={[90, 100.5]}
                        customFormat={(d) => d.toString() + '%'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped',
                                'WGS',
                                null,
                                'long'
                            )
                        }
                        thresholds_marks={{
                            horizontal: [
                                {
                                    value: 98,
                                    fill: 'red',
                                },
                            ],
                        }}
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped'
                        }
                        qcFieldFormat={','}
                        groupBy={'tissue_or_cell_line'}
                        sortOrder={'descending'}
                        additionalColumns={['sample_source']}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped',
                                'WGS',
                                null,
                                'long'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>

            <h4 className="mt-4">
                Mapping rate per BAM file and submission center (PacBio/ONT -
                WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files. The DAC
                internal threshold is currently set to 98%.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={6}
                        title="Mapping rates for long-read data"
                        data={qcData}
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped'
                        }
                        customFormat={(d) => d.toString() + '%'}
                        customExtent={[90, 100.5]}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped',
                                'WGS',
                                null,
                                'long'
                            )
                        }
                        thresholds_marks={{
                            horizontal: [
                                {
                                    value: 98,
                                    fill: 'red',
                                },
                            ],
                        }}
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped'
                        }
                        qcFieldFormat={','}
                        groupBy={'submission_center'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped',
                                'WGS',
                                null,
                                'long'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>


            <h4 className="mt-4">
            Properly paired reads mapped (Illumina - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files. The DAC
                internal threshold is currently set to 96%.
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                <BoxPlot
                    plotId={8}
                    title=""
                    data={qcData}
                    qcField={
                        'samtools_stats:percentage_of_properly_paired_reads'
                    }
                    qcCategory={"tissue_or_cell_line"}
                    xAxisLabel={''}
                    customFilter={(d) =>
                        customFilter(
                            d,
                            'samtools_stats:percentage_of_properly_paired_reads',
                            'WGS',
                            null,
                            'short'
                        )
                    }
                    thresholds_marks={{
                        horizontal: [
                            {
                                value: 96,
                                fill: 'red',
                            },
                        ],
                    }}
                    customExtent={[90, 100.5]}
                />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={
                            'samtools_stats:percentage_of_properly_paired_reads'
                        }
                        qcFieldFormat={','}
                        groupBy={'tissue_or_cell_line'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats:percentage_of_properly_paired_reads',
                                'WGS',
                                null,
                                'short'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div>


            <h4 className="mt-4">
            Percentage of Reads Mapped and Paired (Illumina - WGS)
            </h4>
            <p className="mb-3">
                This overview includes released and unreleased files. 
            </p>
            <div className="row mt-3">
                <div className="col-lg-6">
                <BoxPlot
                    plotId={9}
                    title=""
                    data={qcData}
                    qcField={
                        'samtools_stats_postprocessed:percentage_reads_mapped_and_paired'
                    }
                    qcCategory={"tissue_or_cell_line"}
                    xAxisLabel={''}
                    customFilter={(d) =>
                        customFilter(
                            d,
                            'samtools_stats_postprocessed:percentage_reads_mapped_and_paired',
                            'WGS',
                            null,
                            'short'
                        )
                    }
                    customExtent={[90, 100.5]}
                />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={
                            'samtools_stats_postprocessed:percentage_reads_mapped_and_paired'
                        }
                        qcFieldFormat={','}
                        groupBy={'tissue_or_cell_line'}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            customFilter(
                                d,
                                'samtools_stats_postprocessed:percentage_reads_mapped_and_paired',
                                'WGS',
                                null,
                                'short'
                            )
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div> */}

            {/* <div className="plot-group mt-5">
                <ScatterPlot
                    plotId={7}
                    title="Low mapping rate also associated with high mismatch rates, especially in ONT"
                    data={qcData}
                    yAxisField={
                        'samtools_stats_postprocessed:percentage_reads_mapped'
                    }
                    xAxisField={
                        'picard_collect_alignment_summary_metrics:pf_mismatch_rate'
                    }
                    customFilter={(d) => {
                        return (
                            d?.read_length === 'long' &&
                            d?.quality_metrics[
                                'samtools_stats_postprocessed:percentage_reads_mapped'
                            ] &&
                            d?.quality_metrics[
                                'picard_collect_alignment_summary_metrics:pf_mismatch_rate'
                            ]
                        );
                    }}
                    // xAxisLabel="Aligned Bases Mismatch Rate"
                    thresholds_marks={{
                        horizontal: [
                            {
                                value: 98,
                                fill: 'lightgray',
                            },
                        ],
                        vertical: [
                            {
                                value: 0.01,
                                fill: 'lightgray',
                            },
                        ],
                    }}
                    customExtentX={[-0.005, 0.0275]}
                    customExtentY={[90, 100.5]}
                />
            </div> */}

            {/* <h4 className="mt-5">Interactive visualization</h4>
            <div className="bg-light">
                <div className="row">
                    <div className="col-6">
                        <div className="p-3">
                            <div className="bg-secondary text-light text-center text-uppercase fs-6 px-1">
                                <small>Metric & Grouping</small>
                            </div>
                            <div className="mt-1 fw-bold fs-6">QC metric</div>
                            <select
                                className="form-select form-select-sm"
                                value={selectedQcMetric}
                                onChange={handleQcMetricChange}>
                                {vizInfo.facets.qc_metrics[selectedAssay].map(
                                    (q) => {
                                        return (
                                            <option value={q['derived_from']}>
                                                {q['key']}
                                            </option>
                                        );
                                    }
                                )}
                            </select>
                            <div className="mt-1 fw-bold fs-6">Grouping</div>
                            <select
                                className="form-select form-select-sm"
                                value={selectedGrouping}
                                onChange={handleGroupingChange}>
                                {vizInfo.facets.grouping.map((q) => {
                                    return getKeyLabelOption(q);
                                })}
                            </select>
                        </div>
                    </div>
                    <div className="col-6">
                        <div className="p-3">
                            <div className="bg-secondary text-light text-center text-uppercase fs-6 px-1">
                                <small>Filtering</small>
                            </div>
                            <div className="mt-1 fw-bold fs-6">Assay</div>
                            <select
                                className="form-select form-select-sm"
                                value={selectedAssay}
                                onChange={handleAssayChange}>
                                {vizInfo.facets.assay.map((q) => {
                                    return getKeyLabelOption(q);
                                })}
                            </select>
                            <div className="mt-1 fw-bold fs-6">
                                Cell line / Cell culture mixture / Tissue
                            </div>
                            <select
                                className="form-select form-select-sm"
                                value={selectedSampleSource}
                                onChange={handleSampleSourceChange}>
                                {vizInfo.facets.sample_source.map((q) => {
                                    return getKeyLabelOption(q);
                                })}
                            </select>
                            <div className="mt-1 fw-bold fs-6">Sequencer</div>
                            <select
                                className="form-select form-select-sm"
                                value={selectedSequencer}
                                onChange={handleSequencerChange}>
                                {vizInfo.facets.sequencer.map((q) => {
                                    return getKeyLabelOption(q);
                                })}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="row mt-2">
                <div className="col-lg-6">
                    <BoxPlot
                        plotId={100}
                        title=""
                        data={qcData}
                        qcField={selectedQcMetric}
                        customFilter={(d) =>
                            d?.quality_metrics[selectedQcMetric]
                        }
                        qcCategory={selectedGrouping}
                        updateHighlightedBam={updateHighlightedBam}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcField={selectedQcMetric}
                        qcFieldFormat={','}
                        groupBy={selectedGrouping}
                        sortOrder={'descending'}
                        customFilter={(d) =>
                            d?.quality_metrics[selectedQcMetric]
                        }
                        highlightedBam={highlightedBam}
                    />
                </div>
            </div> */}
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
