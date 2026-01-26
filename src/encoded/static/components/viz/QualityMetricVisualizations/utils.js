'use strict';

import React from 'react';
import * as d3 from 'd3';
import { BoxPlotWithFacets } from './BoxPlotWithFacets';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const isReleased = (status) => {
    const releasedStatuses = ['released', 'open', 'open-early', 'open-network', 'protected', 'protected-early', 'protected-network'];
    return releasedStatuses.includes(status.toLowerCase());
}

export const getBoxPlot = (
    qcData,
    title,
    metric,
    assay,
    sampleSource,
    sequencer,
    study,
    customExtent = null,
    featuredBam = null
) => {
    const titleDiv = title ? (
        <div className="qc-boxplot-title p-2">{title}</div>
    ) : null;

    // Makes sure the component is re-rendered when the settings change
    const key = `${metric}-${assay}-${sampleSource}-${sequencer}-${study}-${featuredBam}`;
    return (
        <>
            {titleDiv}
            <div className="py-2 px-4 position-relative">
                <BoxPlotWithFacets
                    key={key}
                    qcData={qcData}
                    showFacets={false}
                    showDataTable={false}
                    boxPlotTitle={''}
                    settings={{
                        selectedQcMetric: metric,
                        assay: assay,
                        grouping: 'submission_center',
                        sampleSource: sampleSource,
                        sequencer: sequencer,
                        study: study,
                        customExtent: customExtent,
                        featuredBam: featuredBam,
                    }}
                />
            </div>
        </>
    );
};

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
    const adjustedExtendMax = eMax + range * maxAdjustment;
    return [adjustedExtendMin, adjustedExtendMax];
};

export const getBadge = (
    flag,
    returnDefaultBadge = false,
    withIcon = false
) => {
    if (flag === 'Pass' || flag === 'Yes') {
        return (
            <span className="badge text-white bg-success">
                {withIcon && <i className="icon icon-check fas"></i>}
                {flag}
            </span>
        );
    } else if (flag === 'Warn') {
        // For public display, change 'Warn' to 'Flagged'
        return (
            <span className="badge text-white bg-warning">
                {withIcon && <i className="icon icon-flag fas"></i>}
                Flagged
            </span>
        );
    } else if (flag === 'Fail' || flag === 'No') {
        return (
            <span className="badge text-white bg-danger">
                {withIcon && <i className="icon icon-exclamation fas"></i>}
                {flag}
            </span>
        );
    }
    if (returnDefaultBadge) {
        return (
            <>
                <span className="badge text-white bg-secondary">NA</span>
            </>
        );
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

export const customReactSelectStyleMulti = {
    control: (provided, state) => ({
        ...provided,
        fontSize: '0.875rem', // Adjust font size
        borderColor: state.isFocused ? 'blue' : '#dee2e6',
        boxShadow: state.isFocused ? '0 0 0 1px blue' : 'none',
    }),
    valueContainer: (provided) => ({
        ...provided,
        padding: '0 6px',
    }),
    input: (provided) => ({
        ...provided,
        margin: '0', // Remove extra margin
        padding: '0',
    }),
    indicatorsContainer: (provided) => ({
        ...provided,
    }),
    menu: (provided) => ({
        ...provided,
        marginTop: '0px', // Optional: adjust spacing between control and dropdown
    }),
    menuList: (provided) => ({
        ...provided,
        padding: '0', // Remove extra padding around the list
    }),
    multiValueLabel: (provided) => ({
        ...provided,
        padding: '0px 0px',
    }),
    multiValue: (provided) => ({
        ...provided,
        padding: '0px 0px',
        backgroundColor: '#f2f2f2',
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
    const overallQualityStatus =
        file.quality_metrics.overall_quality_status || 'NA';

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
                        const { flag = 'NA', value } = qcValues[qcField];
                        const metricFormatted = formatQcValue(value);
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

// Retry wrapper function for ajax requests
export const ajaxWithRetry = (url, successCallback, method = 'GET', errorCallback = null, options = {}) => {
    const { maxRetries = 3, retryDelay = 1000, retryDelayMultiplier = 2 } = options;
    let attempt = 0;
    
    const makeRequest = () => {
        ajax.load(
            url,
            successCallback,
            method,
            (error) => {
                attempt++;
                if (attempt < maxRetries) {
                    console.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay * Math.pow(retryDelayMultiplier, attempt - 1)}ms...`);
                    setTimeout(() => {
                        makeRequest();
                    }, retryDelay * Math.pow(retryDelayMultiplier, attempt - 1));
                } else {
                    console.error(`Request failed after ${maxRetries} attempts`);
                    if (errorCallback) {
                        errorCallback(error);
                    }
                }
            }
        );
    };
    
    makeRequest();
};
