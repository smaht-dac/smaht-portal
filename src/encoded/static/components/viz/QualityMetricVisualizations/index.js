import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BoxPlot } from './BoxPlots';
import { ScatterPlot } from './ScatterPlot';
import ReactTooltip from 'react-tooltip';

export const QualityMetricVisualizations = () => {
    const [QCData, setQCData] = useState(null);

    useEffect(() => {
        ajax.load(
            '/get_qc_overview/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                console.log('resp.data: ', resp.data);
                setQCData(resp.data);
            },
            'POST',
            () => {
                console.log('ERROR loading data');
            }
        );
    }, []);

    if (QCData) {
        const { qc_results } = QCData;

        const assaySet = new Set();
        for (const result of qc_results) {
            assaySet.add(result.assay);
        }
    }

    return QCData ? (
        <>
            <h2 className="text-center">
                Sequencing throughput per BAM file (including unreleased)
            </h2>
            <div className="plot-group">
                <BoxPlot
                    plotId={0}
                    title="Cell line SR"
                    data={QCData}
                    QCField={'samtools_stats:raw_total_sequences'}
                    customFormat={(d) => d.toExponential(1)}
                    customExtent={[0, 9000000000]}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats:raw_total_sequences'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.tissue_or_cell_line === 'cell_line' &&
                            d?.read_length === 'short'
                        );
                    }}
                />
                <BoxPlot
                    plotId={1}
                    title="Cell line LR"
                    data={QCData}
                    QCField={'samtools_stats:raw_total_sequences'}
                    customExtent={[-1000000, 60000000]}
                    customFormat={(d) => d.toExponential(1)}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats:raw_total_sequences'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.tissue_or_cell_line === 'cell_line' &&
                            d?.read_length === 'long'
                        );
                    }}
                />
            </div>
            <hr />
            <h2 className="text-center">
                Sequencing throughput per BAM file (including unreleased)
            </h2>
            <div className="plot-group">
                <BoxPlot
                    plotId={2}
                    title="Tissues SR"
                    data={QCData}
                    QCField={'samtools_stats:raw_total_sequences'}
                    customFormat={(d) => d.toExponential(1)}
                    customExtent={[0, 9000000000]}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats:raw_total_sequences'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.tissue_or_cell_line === 'tissue' &&
                            d?.read_length === 'short'
                        );
                    }}
                />
                <BoxPlot
                    plotId={3}
                    title="Tissues LR"
                    data={QCData}
                    QCField={'samtools_stats:raw_total_sequences'}
                    customExtent={[-1000000, 60000000]}
                    customFormat={(d) => d.toExponential(1)}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats:raw_total_sequences'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.tissue_or_cell_line === 'tissue' &&
                            d?.read_length === 'long'
                        );
                    }}
                />
            </div>
            <hr />
            <h2 className="text-center">
                Mapping rate: Threshold at 99% for SR; 98% for LR
            </h2>
            <div className="plot-group">
                <BoxPlot
                    plotId={4}
                    title="Tissues SR"
                    data={QCData}
                    QCField={
                        'samtools_stats_postprocessed:percentage_reads_mapped'
                    }
                    getQCCategory={(d) => d.tissue_or_cell_line}
                    customExtent={[90, 100]}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats_postprocessed:percentage_reads_mapped'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.read_length === 'short'
                        );
                    }}
                    thresholds_marks={{
                        horizontal: [
                            {
                                value: 99,
                                fill: 'red',
                            },
                        ],
                    }}
                />
                <BoxPlot
                    plotId={5}
                    title="Tissues LR"
                    data={QCData}
                    QCField={
                        'samtools_stats_postprocessed:percentage_reads_mapped'
                    }
                    getQCCategory={(d) => d.tissue_or_cell_line}
                    customExtent={[90, 100]}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats_postprocessed:percentage_reads_mapped'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.read_length === 'long'
                        );
                    }}
                    thresholds_marks={{
                        horizontal: [
                            {
                                value: 98,
                                fill: 'red',
                            },
                        ],
                    }}
                />
            </div>
            <hr />
            <h2 className="text-center">Mapping rate: Long-reads only</h2>
            <div className="plot-group">
                <BoxPlot
                    plotId={6}
                    title="Mapping rate: Long-reads only"
                    data={QCData}
                    QCField={
                        'samtools_stats_postprocessed:percentage_reads_mapped'
                    }
                    // customFormat={(d) => d.toExponential(1)}
                    customExtent={[90, 100.5]}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats_postprocessed:percentage_reads_mapped'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.read_length === 'long'
                        );
                    }}
                    thresholds_marks={{
                        horizontal: [
                            {
                                value: 98,
                                fill: 'red',
                            },
                        ],
                    }}
                />
            </div>
            <div className="plot-group">
                <ScatterPlot
                    plotId={7}
                    title="Low mapping rate also associated with high mismatch rates, especially in ONT"
                    data={QCData}
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
            </div>
            <hr />
            <h2 className="text-center">
                Properly paired reads mapped: Threshold at 96%
            </h2>
            <div className="plot-group">
                <BoxPlot
                    plotId={8}
                    title=""
                    data={QCData}
                    QCField={
                        'samtools_stats:percentage_of_properly_paired_reads'
                    }
                    getQCCategory={(d) => d.tissue_or_cell_line}
                    xAxisLabel={''}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats:percentage_of_properly_paired_reads'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.read_length === 'short'
                        );
                    }}
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
                <BoxPlot
                    plotId={9}
                    title=""
                    data={QCData}
                    QCField={
                        'samtools_stats_postprocessed:percentage_reads_mapped_and_paired'
                    }
                    getQCCategory={(d) => d.tissue_or_cell_line}
                    xAxisLabel={''}
                    customFilter={(d) => {
                        return (
                            d?.quality_metrics[
                                'samtools_stats_postprocessed:percentage_reads_mapped_and_paired'
                            ] &&
                            d?.assay === 'WGS' &&
                            d?.read_length === 'short'
                        );
                    }}
                    customExtent={[94.5, 100.5]}
                />
            </div>
        </>
    ) : (
        <div className="loader-container">
            <span className="spinner">
                <i className="icon icon-spin icon-circle-notch fas" />
            </span>
        </div>
    );
};
