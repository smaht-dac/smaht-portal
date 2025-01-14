import React, { useState, useEffect } from 'react';

import { ScatterPlot } from './ScatterPlot';
import { DataTable } from './DataTable';
import {
    formatLargeInteger,
    getFileModalContent,
    customReactSelectStyle,
} from './utils';
import { Modal } from 'react-bootstrap';
import Select from 'react-select';

// Sequencer groups
const ALL_ILLUMINA = 'all_illumina';
const ALL_LONG_READ = 'all_long_read';

// Sample Source group
const CELL_LINE = 'cell_line';
const TISSUE = 'tissue';

export const ScatterlotWithFacets = ({
    qcData,
    showFacets = true,
    settings = null,
}) => {
    const vizInfo = qcData.viz_info;

    // Default settings
    // {
    //     "selectedQcMetric": "samtools_stats:percentage_of_properly_paired_reads",
    //     "assay": "WGS",
    //     "grouping": "submission_center",
    //     "sampleSource": "tissue",
    //     "sequencer": "all_illumina"
    // }
    const defaultSettings = settings || vizInfo.default_settings.scatterplot;

    // Overwrite default setting with props

    const [highlightedBam, sethighlightedBam] = useState(null);
    const [selectedQcMetricX, setSelectedQcMetricX] = useState(
        defaultSettings.selectedQcMetricX
    );
    const [selectedQcMetricY, setSelectedQcMetricY] = useState(
        defaultSettings.selectedQcMetricY
    );
    const [selectedGrouping, setSelectedGrouping] = useState(
        defaultSettings.grouping
    );
    const [selectedAssay, setSelectedAssay] = useState(defaultSettings.assay);
    const [selectedSampleSource, setSelectedSampleSource] = useState(
        defaultSettings.sampleSource
    );
    const [selectedSequencer, setSelectedSequencer] = useState(
        defaultSettings.sequencer
    );
    const [rerenderNumber, setRerenderNumber] = useState(0);

    const [thresholdMarks, setThresholdMarks] = useState(null);

    const [showModal, setShowModal] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);

    const handleCloseModal = () => {
        setSelectedFile(null);
        setShowModal(false);
    };
    const handleShowModal = (d) => {
        if (d) {
            setSelectedFile(d);
            setShowModal(true);
            return;
        }
        setShowModal(false);
    };

    const handleQcMetricChangeX = (selection) => {
        setSelectedQcMetricX(selection.value);
        setRerenderNumber(rerenderNumber + 1);
    };

    const handleQcMetricChangeY = (selection) => {
        setSelectedQcMetricY(selection.value);
        setRerenderNumber(rerenderNumber + 1);
    };

    const handleGroupingChange = (event) => {
        setSelectedGrouping(event.target.value);
        setRerenderNumber(rerenderNumber + 1);
    };

    const handleSampleSourceChange = (event) => {
        setSelectedSampleSource(event.target.value);
        setRerenderNumber(rerenderNumber + 1);
    };

    const handleSequencerChange = (event) => {
        setSelectedSequencer(event.target.value);
        setRerenderNumber(rerenderNumber + 1);
    };

    const handleAssayChange = (event) => {
        const newAssay = event.target.value;
        setSelectedAssay(newAssay);
        if (newAssay === defaultSettings.assay) {
            setSelectedQcMetricX(defaultSettings.selectedQcMetricX);
            setSelectedQcMetricY(defaultSettings.selectedQcMetricY);
        } else {
            setSelectedQcMetricX(
                vizInfo.facets.qc_metrics[newAssay][0]['derived_from']
            );
            setSelectedQcMetricY(
                vizInfo.facets.qc_metrics[newAssay][1]['derived_from']
            );
        }
        setRerenderNumber(rerenderNumber + 1);
    };

    // useEffect(() => {
    //     updateThresholdMarks();
    //     setRerenderNumber(rerenderNumber + 1);
    //   }, [selectedQcMetricX, selectedQcMetricY, selectedSequencer, selectedAssay]);

    // const updateThresholdMarks = () => {
    //     const thresholdCategory = selectedSequencer + '_' + selectedAssay;
    //     const thresholdInfo = vizInfo.qc_thresholds[thresholdCategory];
    //     if(!thresholdInfo || ! thresholdInfo[selectedQcMetricX]){
    //         setThresholdMarks(null);
    //         return;
    //     }

    //     setThresholdMarks({
    //         horizontal: [
    //             {
    //                 value: thresholdInfo[selectedQcMetricX],
    //                 fill: 'red',
    //             },
    //         ],

    //     });

    // };

    const updateHighlightedBam = (bam) => {
        sethighlightedBam(bam);
    };

    const customFilter = (d) => {
        let seqFilter = true;

        if (
            selectedSequencer === ALL_ILLUMINA ||
            selectedSequencer === ALL_LONG_READ
        ) {
            seqFilter = d?.sequencer_group === selectedSequencer;
        } else {
            seqFilter = d?.sequencer === selectedSequencer;
        }

        let sampleSourceFilter = true;
        if (
            selectedSampleSource === CELL_LINE ||
            selectedSampleSource === TISSUE
        ) {
            sampleSourceFilter =
                d?.sample_source_group === selectedSampleSource;
        } else {
            sampleSourceFilter = d?.sample_source === selectedSampleSource;
        }

        return (
            d?.quality_metrics?.qc_values[selectedQcMetricX] &&
            d?.quality_metrics?.qc_values[selectedQcMetricY] &&
            d?.assay === selectedAssay &&
            seqFilter &&
            sampleSourceFilter
        );
    };

    const getKeyLabelOption = (q) => {
        return <option value={q['key']}>{q['label']}</option>;
    };
    //console.log(selectedAssay, vizInfo.facets.qc_metrics[selectedAssay]);
    const facets = (
        <div className="bg-light mb-2">
            <div className="row">
                <div className="col-6">
                    <div className="p-3">
                        <div className="fw-bold fs-6">QC metric (x-axis)</div>
                        <Select
                            // className="form-select form-select-sm"
                            value={{
                                value: selectedQcMetricX,
                                label: qcData.qc_info[selectedQcMetricX].key,
                            }}
                            onChange={handleQcMetricChangeX}
                            styles={customReactSelectStyle}
                            options={vizInfo.facets.qc_metrics[
                                selectedAssay
                            ].map((q) => {
                                return {
                                    value: q['derived_from'],
                                    label: q['key'],
                                };
                            })}
                        />
                        {/* <select
                            className="form-select form-select-sm"
                            value={selectedQcMetricX}
                            onChange={handleQcMetricChangeX}>
                            {vizInfo.facets.qc_metrics[selectedAssay].map(
                                (q) => {
                                    return (
                                        <option value={q['derived_from']}>
                                            {q['key']}
                                        </option>
                                    );
                                }
                            )}
                        </select> */}
                        <div className="mt-1 fw-bold fs-6">
                            QC metric (y-axis)
                        </div>
                        <Select
                            // className="form-select form-select-sm"
                            value={{
                                value: selectedQcMetricY,
                                label: qcData.qc_info[selectedQcMetricY].key,
                            }}
                            onChange={handleQcMetricChangeY}
                            styles={customReactSelectStyle}
                            options={vizInfo.facets.qc_metrics[
                                selectedAssay
                            ].map((q) => {
                                return {
                                    value: q['derived_from'],
                                    label: q['key'],
                                };
                            })}
                        />
                        {/* <select
                            className="form-select form-select-sm"
                            value={selectedQcMetricY}
                            onChange={handleQcMetricChangeY}>
                            {vizInfo.facets.qc_metrics[selectedAssay].map(
                                (q) => {
                                    return (
                                        <option value={q['derived_from']}>
                                            {q['key']}
                                        </option>
                                    );
                                }
                            )}
                        </select> */}
                        {/* <div className="mt-1 fw-bold fs-6">Grouping</div>
                        <select
                            className="form-select form-select-sm"
                            value={selectedGrouping}
                            onChange={handleGroupingChange}>
                            {vizInfo.facets.grouping.map((q) => {
                                return getKeyLabelOption(q);
                            })}
                        </select> */}
                    </div>
                </div>
                <div className="col-6">
                    <div className="p-3">
                        <div className="fw-bold fs-6">Assay</div>
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
    );

    return (
        <>
            {showFacets && facets}
            <div className="row">
                <div className="col-lg-6">
                    <ScatterPlot
                        plotId={Math.floor(
                            Math.random() * Number.MAX_SAFE_INTEGER
                        )}
                        title=""
                        data={qcData}
                        yAxisField={selectedQcMetricY}
                        xAxisField={selectedQcMetricX}
                        customFilter={(d) => customFilter(d)}
                        customFormat={(d) => formatLargeInteger(d)}
                        qcCategory={selectedGrouping}
                        updateHighlightedBam={updateHighlightedBam}
                        //thresholdMarks={thresholdMarks}
                        rerenderNumber={rerenderNumber}
                        handleShowModal={handleShowModal}
                    />
                </div>
                <div className="col-lg-6">
                    <DataTable
                        data={qcData}
                        qcFields={[selectedQcMetricX, selectedQcMetricY]}
                        qcFieldFormats={[',', ',']}
                        groupBy={selectedGrouping}
                        sortOrder={'ascending'}
                        customFilter={(d) => customFilter(d)}
                        highlightedBam={highlightedBam}
                        handleShowModal={handleShowModal}
                    />
                </div>
            </div>
            <Modal size="lg" show={showModal} onHide={handleCloseModal}>
                <Modal.Header closeButton>
                    <Modal.Title>Review File QC</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {getFileModalContent(selectedFile, qcData.qc_info)}
                </Modal.Body>
            </Modal>
        </>
    );
};
