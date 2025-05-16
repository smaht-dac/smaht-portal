import React, { useState, useEffect } from 'react';

import { getBoxPlot } from './utils';

import { TissueClassificationTable } from './TissueClassificationTable';

const wgs = 'WGS';
const rnaSeq = 'RNA-seq';

const benchmarkingCellLines = 'benchmarking_cell_lines';
const benchmarkingTissues = 'benchmarking_tissues';
const productionTissues = 'production_tissues';

export const KeyMetrics = ({ qcData }) => {
    const [selectedSampleSource, setSelectedSampleSource] = useState(
        benchmarkingCellLines
    );
    const [selectedAssay, setSelectedAssay] = useState(wgs);

    const handleSelectedAssayChange = (event) => {
        setSelectedAssay(event.target.value);
    };

    const handleSelectedSampleSourceChange = (event) => {
        setSelectedSampleSource(event.target.value);
    };

    const getWgsMetricsPlots = (sampleSource, assay, study) => {
        return (
            <>
                <div className="row mt-2">
                    <div className="col-12">
                        <div className="p-2 qc-key-metrics-header blue">
                            Total Sequences
                        </div>
                    </div>
                </div>
                <div className="row g-0">
                    <div className="col-lg-6 border-end">
                        {getBoxPlot(
                            qcData,
                            `Long read - PacBio / ONT`,
                            'samtools_stats:raw_total_sequences',
                            assay,
                            sampleSource,
                            'all_long_read',
                            study
                        )}
                    </div>
                    <div className="col-lg-6">
                        {getBoxPlot(
                            qcData,
                            `Short read - Illumina`,
                            'samtools_stats:raw_total_sequences',
                            assay,
                            sampleSource,
                            'all_illumina',
                            study
                        )}
                    </div>
                </div>

                <div className="row mt-4">
                    <div className="col-12">
                        <div className="p-2 qc-key-metrics-header purple">
                            Percentage of Reads Mapped
                        </div>
                    </div>
                </div>
                <div className="row g-0">
                    <div className="col-lg-6 border-end">
                        {getBoxPlot(
                            qcData,
                            `Long read - PacBio / ONT`,
                            'samtools_stats_postprocessed:percentage_reads_mapped',
                            assay,
                            sampleSource,
                            'all_long_read',
                            study,
                            [91, 101]
                        )}
                    </div>
                    <div className="col-lg-6">
                        {getBoxPlot(
                            qcData,
                            `Short read - Illumina`,
                            'samtools_stats_postprocessed:percentage_reads_mapped',
                            assay,
                            sampleSource,
                            'all_illumina',
                            study,
                            [91, 101]
                        )}
                    </div>
                </div>

                <div className="row mt-4">
                    <div className="col-12">
                        <div className="p-2 qc-key-metrics-header orange">
                            Human contamination
                        </div>
                    </div>
                </div>
                <div className="row g-0">
                    <div className="col-lg-6 border-end">
                        {getBoxPlot(
                            qcData,
                            `Long read - PacBio / ONT`,
                            'verifybamid:freemix_alpha',
                            assay,
                            sampleSource,
                            'all_long_read',
                            study,
                            [-0.01, 0.21]
                        )}
                    </div>
                    <div className="col-lg-6">
                        {getBoxPlot(
                            qcData,
                            `Short read - Illumina`,
                            'verifybamid:freemix_alpha',
                            assay,
                            sampleSource,
                            'all_illumina',
                            study,
                            [-0.01, 0.21]
                        )}
                    </div>
                </div>

                <div className="row mt-4 g-0">
                    <div className="col-lg-6 border-end">
                        <div className="p-2 qc-key-metrics-header darkblue">
                            Percentage of Reads Duplicated
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'samtools_stats_postprocessed:percentage_reads_duplicated',
                                assay,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                    <div className="col-lg-6">
                        <div className="p-2 qc-key-metrics-header yellow">
                            Mean Insert Size
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'picard_collect_insert_size_metrics:mean_insert_size',
                                assay,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                </div>

                <div className="row mt-4 g-0">
                    <div className="col-lg-6">
                        <div className="p-2 qc-key-metrics-header brown">
                            Mean Read Length
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Long read - PacBio / ONT`,
                                'picard_collect_alignment_summary_metrics:mean_read_length',
                                assay,
                                sampleSource,
                                'all_long_read',
                                study
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    };

    const getRnaSeqMetricsPlots = (sampleSource, sampleSourceLabel, study) => {
        return (
            <>
                <div className="row mt-4 g-0">
                    <div className="col-lg-6 border-end">
                        <div className="p-2 qc-key-metrics-header blue">
                            Total Reads
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'rnaseqc:total_reads',
                                rnaSeq,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                    <div className="col-lg-6">
                        <div className="p-2 qc-key-metrics-header purple">
                            Mapping Rate
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'rnaseqc:mapping_rate',
                                rnaSeq,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                </div>

                <div className="row mt-4 g-0">
                    <div className="col-lg-6 border-end">
                        <div className="p-2 qc-key-metrics-header orange">
                            Duplication Rate
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'rnaseqc:duplicate_rate_of_mapped',
                                rnaSeq,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                    <div className="col-lg-6">
                        <div className="p-2 qc-key-metrics-header yellow">
                            Mean 3p Bias
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'rnaseqc:mean_3p_bias',
                                rnaSeq,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                </div>

                <div className="row mt-4 g-0">
                    <div className="col-lg-6 border-end">
                        <div className="p-2 qc-key-metrics-header darkblue">
                            Exon-Intron ratio
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'rnaseqc:exonic_intron_ratio',
                                rnaSeq,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                    <div className="col-lg-6">
                        <div className="p-2 qc-key-metrics-header brown">
                            rRNA rate
                        </div>
                        <div>
                            {getBoxPlot(
                                qcData,
                                `Short read - Illumina`,
                                'rnaseqc:rrna_rate',
                                rnaSeq,
                                sampleSource,
                                'all_illumina',
                                study
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    };

    const cellLineWgsViz =
        selectedSampleSource === benchmarkingCellLines &&
        selectedAssay === wgs ? (
            <>{getWgsMetricsPlots('cell_line', wgs, 'Benchmarking')}</>
        ) : (
            ''
        );

    const benchmarkingTissueWgsViz =
        selectedSampleSource === benchmarkingTissues &&
        selectedAssay === wgs ? (
            <>{getWgsMetricsPlots('tissue', wgs, 'Benchmarking')}</>
        ) : (
            ''
        );

    const productionTissueWgsViz =
        selectedSampleSource === productionTissues && selectedAssay === wgs ? (
            <>{getWgsMetricsPlots('tissue', wgs, 'Production')}</>
        ) : (
            ''
        );

    const cellLineRnaSeqViz =
        selectedSampleSource === benchmarkingCellLines &&
        selectedAssay === rnaSeq ? (
            <>
                <div className="p-2 qc-key-metrics-header darkblue my-1">
                    Tissue Integrity
                </div>
                <TissueClassificationTable
                    data={qcData}
                    study="Benchmarking"
                    sampleSourceGroup="cell_line"></TissueClassificationTable>
                {getRnaSeqMetricsPlots(
                    'cell_line',
                    'Benchmarking Cell Lines',
                    'Benchmarking'
                )}
            </>
        ) : (
            ''
        );

    const benchmarkingTissueRnaSeqViz =
        selectedSampleSource === benchmarkingTissues &&
        selectedAssay === rnaSeq ? (
            <>
                <div className="p-2 qc-key-metrics-header darkblue my-1">
                    Tissue Integrity
                </div>
                <TissueClassificationTable
                    data={qcData}
                    study="Benchmarking"
                    sampleSourceGroup="tissue"></TissueClassificationTable>
                {getRnaSeqMetricsPlots(
                    'tissue',
                    'Tissue Homogenates',
                    'Benchmarking'
                )}
            </>
        ) : (
            ''
        );

    const productionTissueRnaSeqViz =
        selectedSampleSource === productionTissues &&
        selectedAssay === rnaSeq ? (
            <>
                <div className="p-2 qc-key-metrics-header darkblue my-1">
                    Tissue Integrity
                </div>
                <TissueClassificationTable
                    data={qcData}
                    study="Production"
                    sampleSourceGroup="tissue"></TissueClassificationTable>
                {getRnaSeqMetricsPlots(
                    'tissue',
                    'Production Tissues',
                    'Production'
                )}
            </>
        ) : (
            ''
        );

    return (
        <>
            <div className="qc-metrics-facets-container qc-metrics-sticky-facet p-3">
                <div className="row">
                    <div className="col-lg-6">
                        <div className="fw-bold fs-6">Assay</div>
                        <select
                            className="form-select form-select-sm"
                            value={selectedAssay}
                            onChange={handleSelectedAssayChange}>
                            <option value={wgs} key={wgs}>
                                {wgs}
                            </option>
                            <option value={rnaSeq} key={rnaSeq}>
                                {rnaSeq}
                            </option>
                        </select>
                    </div>
                    <div className="col-lg-6">
                        <div className="fw-bold fs-6">Sample Source</div>
                        <select
                            className="form-select form-select-sm"
                            value={selectedSampleSource}
                            onChange={handleSelectedSampleSourceChange}>
                            <option
                                value={benchmarkingCellLines}
                                key={benchmarkingCellLines}>
                                Benchmarking Cell Lines
                            </option>
                            <option
                                value={benchmarkingTissues}
                                key={benchmarkingTissues}>
                                Benchmarking Tissues
                            </option>
                            <option
                                value={productionTissues}
                                key={productionTissues}>
                                Production Tissues
                            </option>
                        </select>
                    </div>
                </div>
            </div>
            <div className="py-3">
                {cellLineWgsViz}
                {benchmarkingTissueWgsViz}
                {productionTissueWgsViz}
                {cellLineRnaSeqViz}
                {benchmarkingTissueRnaSeqViz}
                {productionTissueRnaSeqViz}
            </div>
        </>
    );
};
