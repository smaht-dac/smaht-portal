import React, { useState, useEffect } from 'react';

import { getBoxPlot } from './utils';
import makeAnimated from 'react-select/animated';

import {
    formatLargeInteger,
    getFileModalContent,
    customReactSelectStyle,
    customReactSelectStyleMulti,
} from './utils';

import Select from 'react-select';

export const MetricsByFile = ({ qcData, settings }) => {
    const vizInfo = qcData.viz_info;
    const qcInfo = qcData.qc_info;
    const defaultSettings =
        settings || vizInfo.default_settings.metrics_by_file;
    const defaultMetrics = {};
    Object.keys(defaultSettings.default_metrics).forEach((assay) => {
        defaultMetrics[assay] = defaultSettings.default_metrics[assay].map(
            (m) => {
                return {
                    value: m,
                    label: qcInfo[m].key,
                };
            }
        );
    });

    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedQcMetrics, setSelectedQcMetrics] = useState([]);
    const [qcMetricsOptions, setQcMetricsOptions] = useState([]);
    const [currentAssay, setCurrentAssay] = useState(null);

    const animatedComponents = makeAnimated();

    const files = {};
    qcData.qc_results.forEach((file) => {
        files[file.file_accession] = {
            file_accession: file.file_accession,
            file_display_title: file.file_display_title,
            assay: file.assay,
            assay_label: file.assay_label,
            sequencer: file.sequencer,
            sequencer_group: file.sequencer_group,
            sample_source: file.sample_source,
            sample_source_group: file.sample_source_group,
            study: file.study,
        };
    });

    const fileSelectOptions = Object.keys(files)
        .map((accession) => {
            const file = files[accession];
            const displayTitle = file['file_display_title'];
            const label =
                displayTitle.length > 25
                    ? displayTitle
                    : displayTitle +
                      ` (${file.sample_source} - ${file.assay_label} - ${file.sequencer}) - not released`;
            return {
                value: accession,
                label: label,
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

    const getQcMetricsOptions = (fileAccession) => {
        const assay = files[fileAccession].assay;
        return vizInfo.facets.qc_metrics[assay].map((q) => {
            return {
                value: q['derived_from'],
                label: q['key'],
            };
        });
    };

    const handleFileChange = (selection) => {
        setSelectedFile(selection);
        const options = getQcMetricsOptions(selection.value);
        setQcMetricsOptions(options);
        const newAssay = files[selection.value].assay;
        if (currentAssay !== newAssay) {
            setSelectedQcMetrics(defaultMetrics[newAssay]);
        }
        setCurrentAssay(files[selection.value].assay);
    };

    const handleQcMetricChange = (selection) => {
        setSelectedQcMetrics(selection);
    };

    const facets = (
        <div className="qc-metrics-facets-container mb-2">
            <div className="row">
                <div className="col-12">
                    <div className="p-3">
                        <div className="fw-bold fs-6">File</div>
                        <Select
                            value={selectedFile}
                            styles={customReactSelectStyleMulti}
                            onChange={handleFileChange}
                            options={fileSelectOptions}
                        />
                    </div>
                </div>
            </div>
            <div className="row">
                <div className="col-12">
                    <div className="px-3 pb-3">
                        <div className="fw-bold fs-6">QC metric</div>
                        <Select
                            value={selectedQcMetrics}
                            isMulti
                            closeMenuOnSelect={false}
                            components={animatedComponents}
                            placeholder="Select a file to see available QC metrics"
                            styles={customReactSelectStyleMulti}
                            onChange={handleQcMetricChange}
                            options={qcMetricsOptions}
                        />
                    </div>
                </div>
            </div>
        </div>
    );

    return <>{facets}</>;
};
