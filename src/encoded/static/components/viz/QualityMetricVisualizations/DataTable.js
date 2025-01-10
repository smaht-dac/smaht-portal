import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { getBadge, capitalize } from './utils';


export const DataTable = ({
    data,
    qcFields,
    qcFieldFormats,
    customFilter,
    groupBy,
    sortOrder,
    additionalColumns,
    highlightedBam,
    handleShowModal,
}) => {
    // const [showOverlay, setShowOverlay] = useState(false);

    const { qc_info, qc_results } = data;
    let highlightedDatapointInPlot = null;

    useEffect(() => {
        // console.log(qc_info);
        // console.log(qc_results);
        // console.log(filteredData);
    });

    const highlightDatapointInPlot = (e, bam) => {
        if (bam) {
            highlightedDatapointInPlot = bam;
            const query = '[data-point-index="' + bam + '"]';
            const targetPoints = document.querySelectorAll(query);
            targetPoints.forEach((targetPoint) => {
                targetPoint.classList.add('data-point-highlighted');
            });
        } else if (highlightedDatapointInPlot) {
            const query =
                '[data-point-index="' + highlightedDatapointInPlot + '"]';
            const targetPoints = document.querySelectorAll(query);
            targetPoints.forEach((targetPoint) => {
                targetPoint.classList.remove('data-point-highlighted');
            });
        }
    };

    const filteredData = qc_results.filter((d) => {
        // Use custom filter if provided
        if (customFilter) {
            return customFilter(d);
        }
        return d;
    });

    const sortByQcField = (a, b) => {
        const a_value = a['quality_metrics']['qc_values'][qcFields[0]]['value'];
        const b_value = b['quality_metrics']['qc_values'][qcFields[0]]['value'];

        if (sortOrder == 'ascending') {
            if (a_value < b_value) return -1;
            if (a_value > b_value) return 1;
        } else {
            if (a_value < b_value) return 1;
            if (a_value > b_value) return -1;
        }
        return 0;
    };

    if (groupBy) {
        filteredData.sort((a, b) => {
            if (a[groupBy] < b[groupBy]) return -1; // Primary key ascending
            if (a[groupBy] > b[groupBy]) return 1;
            return sortByQcField(a, b);
        });
    } else if (sortOrder) {
        filteredData.sort((a, b) => {
            return sortByQcField(a, b);
        });
    }

    //const tableHeaderValues = ['File', qc_info[QCField]['key'], 'Assay', 'Platform', 'Seq Center'];

    const tableBodyData = filteredData.map((d) => {
        const result = {};
        const file_link = '/' + d['file_accession'];
        result['File'] = (
            <a href={file_link} target="_blank">
                {d['file_accession']}
            </a>
        );

        result['Overall QC'] = (
            <div className="text-center">
                {getBadge(d.quality_metrics?.overall_quality_status)}
            </div>
        );
        result['Review QC'] = (
            <div className="qc-link" onClick={() => handleShowModal(d)}>
                Review QC
            </div>
        );
        qcFields.forEach((qcField, i) => {
            const metric = d.quality_metrics?.qc_values[qcField]['value'];
            const flag = d.quality_metrics?.qc_values[qcField]['flag'];
            const metric_formatted = qcFieldFormats
                ? d3.format(qcFieldFormats[i])(metric)
                : metric;
            // Remove tool name from table headers to save space
            let metric_key = qc_info[qcField]['key'];
            metric_key = metric_key
                .replace(' [Samtools]', '')
                .replace(' [Picard]', '');
            result[metric_key] = (
                <span>
                    {metric_formatted} {getBadge(flag)}
                </span>
            );
        });

        additionalColumns?.forEach((c) => {
            const c_formated = capitalize(c.replace('_', ' '));
            result[c_formated] = d[c];
        });
        result['Seq Center'] = d['submission_center'];
        result['Released'] = d['file_status'] == 'released' ? 'Yes' : 'No';
        result['Assay'] = d['assay'];
        result['Platform'] = d['sequencer'];
        return result;
    });
    const tableHeaderValues =
        tableBodyData.length > 0 ? Object.keys(tableBodyData[0]) : [];
    const bamAccessions = filteredData.map((d) => d['file_accession']);

    
    return (
        <>
            <div className="table-responsive qc-metrics-data-table">
                <table className="table table-hover table-striped table-bordered table-sm qc-metrics-data-table">
                    <thead>
                        <tr>
                            {tableHeaderValues.map((col) => (
                                <th key={col}>{col}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {tableBodyData.map((row, rowIndex) => {
                            const rowClass =
                                bamAccessions[rowIndex] == highlightedBam
                                    ? 'table-active'
                                    : '';
                            return (
                                <tr
                                    key={rowIndex}
                                    className={rowClass}
                                    onMouseEnter={(e) =>
                                        highlightDatapointInPlot(
                                            e,
                                            bamAccessions[rowIndex]
                                        )
                                    }
                                    onMouseLeave={(e) =>
                                        highlightDatapointInPlot(e, null)
                                    }>
                                    {tableHeaderValues.map((col) => (
                                        <td key={col}>{row[col]}</td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </>
    );
};
