import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { BoxPlot } from './BoxPlot';
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

const BENCHMARKING = 'Benchmarking';
const PRODUCTION = 'Production';

// Sample Source group
const CELL_LINE = 'cell_line';
const TISSUE = 'tissue';
const BENCHMARKING_TISSUES = 'benchmarking_tissues';
const PRODUCTION_TISSUES = 'production_tissues';

export const BoxPlotWithFacets = ({
    qcData,
    showFacets = true,
    showDataTable = true,
    boxPlotTitle = '',
    settings = null,
}) => {
    const vizInfo = qcData.viz_info;

    const defaultSettings = settings || vizInfo.default_settings.boxplot;

    // Overwrite default setting with props

    const [highlightedBam, sethighlightedBam] = useState(null);
    const [selectedQcMetric, setSelectedQcMetric] = useState(
        defaultSettings.selectedQcMetric
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
    const [selectedStudy, setSelectedStudy] = useState(
        defaultSettings.study || null
    );
    const [customExtent, setCustomExtent] = useState(
        defaultSettings.customExtent || null
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
            // Remove focus from active element. This prevent the browser scolling
            // to the top of the page when closing the modal
            document.activeElement.blur();
            setSelectedFile(d);
            setShowModal(true);
            return;
        }
        setShowModal(false);
    };

    const handleQcMetricChange = (selection) => {
        setSelectedQcMetric(selection.value);
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
            setSelectedQcMetric(defaultSettings.selectedQcMetric);
        } else {
            setSelectedQcMetric(
                vizInfo.facets.qc_metrics[newAssay][0]['derived_from']
            );
        }
        setRerenderNumber(rerenderNumber + 1);
    };

    useEffect(() => {
        updateThresholdMarks();
        setRerenderNumber(rerenderNumber + 1);
    }, [selectedQcMetric, selectedSequencer, selectedAssay]);

    const updateThresholdMarks = () => {
        const thresholdCategory = selectedSequencer + '_' + selectedAssay;
        const thresholdInfo = vizInfo.qc_thresholds[thresholdCategory];
        if (!thresholdInfo || !thresholdInfo[selectedQcMetric]) {
            setThresholdMarks(null);
            return;
        }

        setThresholdMarks({
            horizontal: [
                {
                    value: thresholdInfo[selectedQcMetric],
                    fill: 'red',
                },
            ],
        });
    };

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
        } else if (selectedSampleSource === BENCHMARKING_TISSUES) {
            sampleSourceFilter =
                d?.sample_source_group === TISSUE && d?.study === BENCHMARKING;
        } else if (selectedSampleSource === PRODUCTION_TISSUES) {
            sampleSourceFilter =
                d?.sample_source_group === TISSUE && d?.study === PRODUCTION;
        } else {
            sampleSourceFilter =
                d?.sample_source_subgroup === selectedSampleSource;
        }

        let studyFilter = true;
        if (selectedStudy) {
            studyFilter = d?.study === selectedStudy;
        }

        return (
            d?.quality_metrics?.qc_values[selectedQcMetric] &&
            d?.assay === selectedAssay &&
            seqFilter &&
            sampleSourceFilter &&
            studyFilter
        );
    };

    const getKeyLabelOption = (q) => {
        return (
            <option value={q['key']} key={q['key']}>
                {q['label']}
            </option>
        );
    };

    const getGroupLabel = (group) => {
        let groupLabel = 'NA';
        vizInfo.facets.grouping.forEach((g) => {
            if (g['key'] === group) {
                groupLabel = g['label'];
            }
        });
        return groupLabel;
    };

    const facets = (
        <div className="qc-metrics-facets-container mb-2">
            <div className="row">
                <div className="col-6">
                    <div className="p-3">
                        <div className="fw-bold fs-6">QC metric</div>
                        <Select
                            value={{
                                value: selectedQcMetric,
                                label: qcData.qc_info[selectedQcMetric].key,
                            }}
                            onChange={handleQcMetricChange}
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

    // Check if this metrics has a QC threshold
    const thresholdKey = `${selectedSequencer}_${selectedAssay}`;
    let thresholdWarning = null;
    if (thresholdKey in qcData.viz_info.qc_thresholds) {
        const thresholds = qcData.viz_info.qc_thresholds[thresholdKey];
        if (selectedQcMetric in thresholds) {
            const threshold =
                qcData.viz_info.qc_thresholds[thresholdKey][selectedQcMetric];
            thresholdWarning = (
                <div className="qc-metrics-threshold-warning">
                    Threshold to pass QC: {threshold}
                </div>
            );
        }
    }

    const boxplot = (
        <BoxPlot
            plotId={Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)}
            title={boxPlotTitle}
            data={qcData}
            qcField={selectedQcMetric}
            customFilter={(d) => customFilter(d)}
            customFormat={(d) => formatLargeInteger(d)}
            qcCategory={selectedGrouping}
            customExtent={customExtent}
            xAxisLabel={getGroupLabel(selectedGrouping)}
            updateHighlightedBam={updateHighlightedBam}
            thresholdMarks={thresholdMarks}
            rerenderNumber={rerenderNumber}
            handleShowModal={handleShowModal}
            featuredBam={defaultSettings.featuredBam}
        />
    );

    const datatable = (
        <DataTable
            data={qcData}
            qcFields={[selectedQcMetric]}
            qcFieldFormats={[',']}
            customFilter={(d) => customFilter(d)}
            highlightedBam={highlightedBam}
            handleShowModal={handleShowModal}
        />
    );

    return (
        <>
            {showFacets && facets}

            {showDataTable ? (
                <div className="row">
                    <div className="col-lg-6">
                        <div className="position-relative mt-1">
                            {thresholdWarning}
                            {boxplot}
                        </div>
                    </div>
                    <div className="col-lg-6">{datatable}</div>
                </div>
            ) : (
                <div className="position-relative mt-1">
                    {thresholdWarning}
                    {boxplot}
                </div>
            )}

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
