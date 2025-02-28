'use strict';

import React from 'react';
import * as d3 from 'd3';

export const PlotPopoverContent = ({ tooltipFields, data = null }) => {

    return data ? (
        <div className="d3-popover-content">
            <table className="table table-sm">
                <tbody>
                    {tooltipFields.map((tt, i) => {
                        return (
                            <tr key={i}>
                                <td className="small text-left">{tt.label}</td>
                                <td className="text-wrap text-left">
                                    <div className="restricted-width">
                                        {data[tt.key]}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    ) : null;
};

export const formatLargeInteger = (num) => {
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
};

export const addPaddingToExtend = (
    extend,
    minAdjustment = 0.05,
    maxAdjustment = 0.05
) => {
    const [eMin, eMax] = extend;
    const range = eMax - eMin;
    let adjustedExtendMin = eMin - range * minAdjustment;
    if (eMin > 0) {
        // If the min was already positive, adjust ad most to 0
        adjustedExtendMin = Math.max(0, adjustedExtendMin);
    }
    const adjustedExtendMax = eMax + range * maxAdjustment;
    return [adjustedExtendMin, adjustedExtendMax];
};

export const capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const getBadge = (flag, returnDefaultBadge = false) => {
    if (flag === 'Pass') {
        return <span className="badge text-white bg-success">Pass</span>;
    } else if (flag === 'Warn') {
        return <span className="badge text-white bg-warning">Warn</span>;
    } else if (flag === 'Fail') {
        return <span className="badge text-white bg-danger">Fail</span>;
    } 
    if (returnDefaultBadge) {
        return <span className="badge text-white bg-secondary">NA</span>;
    }
    return '';
};

const isInteger = (num) => {
    return Number.isInteger(num);
};

const isFloat = (num) => {
    return Number(num) === num && num % 1 !== 0;
};

export const removeToolName = (metric) => {
    return metric
        .replace(' [Samtools]', '')
        .replace(' [Picard]', '')
        .replace(' [RNA-SeQC]', '')
        .replace(' [mosdepth]', '')
        .replace(' [VerifyBamID2]', '')
        .replace(' [bamstats]', '');
};

export const formatQcValue = (value) => {
    if (isInteger(value)) {
        return d3.format(',')(value);
    } else if (isFloat(value)) {
        return d3.format(',.4f')(value);
    } else {
        return value;
    }
};

export const customReactSelectStyle = {
    control: (provided, state) => ({
        ...provided,
        minHeight: '30px', // Adjust the height
        height: '30px', // Ensure consistent height
        fontSize: '0.875rem', // Adjust font size
        borderColor: state.isFocused ? 'blue' : '#dee2e6',
        boxShadow: state.isFocused ? '0 0 0 1px blue' : 'none',
    }),
    valueContainer: (provided) => ({
        ...provided,
        height: '30px', // Adjust to match the control height
        padding: '0 6px',
    }),
    input: (provided) => ({
        ...provided,
        margin: '0', // Remove extra margin
        padding: '0',
    }),
    indicatorsContainer: (provided) => ({
        ...provided,
        height: '30px', // Adjust to match the control height
    }),
    menu: (provided) => ({
        ...provided,
        marginTop: '0px', // Optional: adjust spacing between control and dropdown
    }),
    menuList: (provided) => ({
        ...provided,
        padding: '0', // Remove extra padding around the list
    }),
    option: (provided, state) => ({
        ...provided,
        fontSize: '0.875rem', // Adjust font size
        padding: '4px 10px', // Adjust padding to make options smaller
    }),
};

export const getFileModalContent = (file, qcInfo) => {
    if (!file) return null;

    const accession = file.file_accession;
    const fileLink = '/' + accession;
    const title = file.file_display_title;
    const assay = file.assay;
    const status = file.file_status;
    const sampleSource = file.sample_source;
    const sequencer = file.sequencer;
    const submissionCenter = file.submission_center;
    const fileset = file.fileset;
    const filesetLink = '/' + fileset;

    const qcValues = file.quality_metrics.qc_values;
    const overallQualityStatus = file.quality_metrics.overall_quality_status || "NA";
    
    return (
        <div className="qc-modal-content">
            <table className="table table-sm overview table-borderless">
                <tbody>
                    <tr>
                        <td className="restricted-width">File</td>
                        <td>
                            <a href={fileLink} target="_blank">
                                {title}
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Status</td>
                        <td>{status}</td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Fileset</td>
                        <td>
                            <a href={filesetLink} target="_blank">
                                {fileset}
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Submission Center</td>
                        <td>{submissionCenter}</td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Assay</td>
                        <td>{assay}</td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Sequencer</td>
                        <td>{sequencer}</td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Sample souce</td>
                        <td>{sampleSource}</td>
                    </tr>
                    <tr>
                        <td className="restricted-width">Overall QC status</td>
                        <td>{getBadge(overallQualityStatus, true)}</td>
                    </tr>
                    {/* {tooltipFields.map((tt, i) => {
                        return (
                            <tr key={i}>
                                <td className="text-left restricted-width">
                                    {tt.label}
                                </td>
                                <td className="text-wrap text-left">
                                    <div className="">{file[tt.key]}</div>
                                </td>
                            </tr>
                        );
                    })} */}
                </tbody>
            </table>
            <table className="table table-sm overview table-striped table-hover mt-3">
                <thead>
                    <tr>
                        <th className="text-left">Quality Metric</th>
                        <th className="text-left">Value</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.keys(qcValues).map((qcField, i) => {
                        const metric = qcValues[qcField].value;
                        const flag = qcValues[qcField].flag;
                        const metricFormatted = formatQcValue(metric);
                        return (
                            <tr key={i}>
                                <td>{qcInfo[qcField]['key']}</td>
                                <td>
                                    {metricFormatted} {getBadge(flag)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
