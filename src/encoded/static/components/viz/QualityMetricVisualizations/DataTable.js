import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { getBadge, capitalize, removeToolName } from './utils';
import { head } from 'underscore';

export const DataTable = ({
    data,
    qcFields,
    qcFieldFormats,
    customFilter,
    additionalColumns,
    highlightedBam,
    handleShowModal,
}) => {
    const prevQcFields = useRef();
    const { qc_info, qc_results } = data;

    // Initialize sorting to the first QC field in the list
    const firstQcField = removeToolName(qc_info[qcFields[0]]['key']);
    const [sortInfo, setSortInfo] = useState({
        col: firstQcField,
        order: 'ascending',
    });

    useEffect(() => {
        if (prevQcFields.current !== undefined) {
            if (
                JSON.stringify(prevQcFields.current) !==
                JSON.stringify(qcFields)
            ) {
                setSortInfo({
                    col: firstQcField,
                    order: 'ascending',
                });
            }
        }
        prevQcFields.current = qcFields;
    }, [qcFields]);

    const highlightDatapointInPlot = (e, bam) => {
        // Remove highlight from previous data points
        const targetPoints = document.querySelectorAll('[data-point-index]');
        targetPoints.forEach((targetPoint) => {
            targetPoint.classList.remove('data-point-highlighted');
        });

        if (bam) {
            const query = '[data-point-index="' + bam + '"]';
            const targetPoints = document.querySelectorAll(query);
            targetPoints.forEach((targetPoint) => {
                targetPoint.classList.add('data-point-highlighted');
            });
        }
    };

    const handleSort = (col) => {
        if (sortInfo.col == col) {
            setSortInfo({
                col: col,
                order:
                    sortInfo.order == 'ascending' ? 'descending' : 'ascending',
            });
        } else {
            setSortInfo({
                col: col,
                order: 'ascending',
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

    const sortFormattedData = (a, b) => {
        // Primary sorting by col
        if (sortInfo.order == 'ascending') {
            if (a[sortInfo.col] < b[sortInfo.col]) return -1;
            if (a[sortInfo.col] > b[sortInfo.col]) return 1;
        } else {
            if (a[sortInfo.col] < b[sortInfo.col]) return 1;
            if (a[sortInfo.col] > b[sortInfo.col]) return -1;
        }
        // At this point a[sortInfo.col] == b[sortInfo.col]
        // Secondary sorting by first QC value
        if (a[firstQcField] < b[firstQcField]) return -1;
        if (a[firstQcField] > b[firstQcField]) return 1;
        return 0;
    };

    // Extract the relevant information from filteredData. We need this in order to do sorting
    const filteredDataFormatted = filteredData.map((d) => {
        const result = {};
        result['File'] = d['file_accession'];
        result['Released'] = d['file_status'] == 'released' ? 'Yes' : 'No';
        result['Overall QC status'] = d.quality_metrics?.overall_quality_status;
        qcFields.forEach((qcField, i) => {
            const metric = d.quality_metrics?.qc_values[qcField]['value'];
            const flag = d.quality_metrics?.qc_values[qcField]['flag'];
            const metric_key = removeToolName(qc_info[qcField]['key']);
            result[metric_key] = metric;
            result[metric_key + '_flag'] = flag;
        });
        additionalColumns?.forEach((c) => {
            result[c] = d[c];
        });
        result['Seq Center'] = d['submission_center'];
        result['Assay'] = d['assay'];
        result['Platform'] = d['sequencer'];
        result['original'] = d; // We need all the original data for the modal
        return result;
    });

    filteredDataFormatted.sort((a, b) => {
        return sortFormattedData(a, b);
    });

    const tableBodyData = filteredDataFormatted.map((d) => {
        const result = {};
        const file_link = '/' + d['File'];
        result['File'] = (
            <a href={file_link} target="_blank">
                {d['File']}
            </a>
        );
        result['Released'] = <div className="text-center">{d['Released']}</div>;
        qcFields.forEach((qcField, i) => {
            const metric_key = removeToolName(qc_info[qcField]['key']);
            const metric = d[metric_key];
            const flag = d[metric_key + '_flag'];
            const metric_formatted = qcFieldFormats
                ? d3.format(qcFieldFormats[i])(metric)
                : metric;

            result[metric_key] = (
                <span>
                    {metric_formatted} {getBadge(flag)}
                </span>
            );
        });
        result['QC details'] = (
            <div
                className="qc-link"
                onClick={() => handleShowModal(d.original)}>
                QC details
            </div>
        );
        result['Overall QC status'] = (
            <div className="text-center">{getBadge(d['Overall QC status'], true)}</div>
        );

        additionalColumns?.forEach((c) => {
            const c_formated = capitalize(c.replace('_', ' '));
            result[c_formated] = d[c];
        });
        result['Seq Center'] = d['Seq Center'];
        result['Assay'] = d['Assay'];
        result['Platform'] = d['Platform'];
        return result;
    });
    const tableHeaderValues =
        tableBodyData.length > 0 ? Object.keys(tableBodyData[0]) : [];
    const tableHeader = tableHeaderValues.map((col) => {
        const colsforSorting = Object.keys(filteredDataFormatted[0]);
        let sortIcon = '';
        if (colsforSorting.includes(col)) {
            const sortIconClass =
                sortInfo.col == col
                    ? 'sort-icon icon icon-fw icon-sort fas active'
                    : 'sort-icon icon icon-fw icon-sort fas';
            sortIcon = (
                <i
                    className={sortIconClass}
                    onClick={() => handleSort(col)}></i>
            );
        }

        const headerClass = col.length > 20 ? 'width-100' : '';

        return (
            <th key={col}>
                <div className="d-flex flex-row">
                    <div className={headerClass}>{col}</div>
                    <div className="align-self-center">{sortIcon}</div>
                </div>
                {/* <div className='width-40'>{col}</div> {sortIcon} */}
            </th>
        );
    });
    const bamAccessions = filteredDataFormatted.map((d) => d['File']);

    if (filteredDataFormatted.length === 0) {
        return (
            <div className="p-5 text-center">
                <i className="icon fas icon-exclamation-triangle icon-fw text-warning" />{' '}
                No data available for the selected filters.
            </div>
        );
    }

    return (
        <>
            <div className="table-responsive qc-metrics-data-table">
                <table className="table table-hover table-striped table-bordered table-sm qc-metrics-data-table">
                    <thead>
                        <tr>{tableHeader}</tr>
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
