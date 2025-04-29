import React, { useState, useEffect } from 'react';

import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { getBadge } from '../../../viz/QualityMetricVisualizations/utils';

import * as d3 from 'd3';

// Formats the response data into a format that can be used in the table
const formatRawData = (data) => {
    let headers = [];
    let verifyBamId = null;

    // Set the default overall_file_quality_status to null
    let overall_file_quality_status = null;

    const tableData = data.reduce((acc, qcItem) => {
        // Get the accession of the qcItem
        const accession = qcItem?.accession;
        const overall_quality_status = qcItem?.overall_quality_status;
        headers = [...headers, { accession, overall_quality_status }];

        // Update the overall_file_quality_status
        if (overall_quality_status === 'Fail') {
            overall_file_quality_status = 'Fail';
        } else if (
            overall_quality_status === 'Warn' &&
            overall_file_quality_status !== 'Fail'
        ) {
            overall_file_quality_status = 'Warn';
        } else if (
            overall_quality_status == 'Pass' &&
            overall_file_quality_status === null // Not "Warn" or "Fail"
        ) {
            overall_file_quality_status = 'Pass';
        }

        // Loop through the qc_values of each item and save them under the item's accession
        qcItem.qc_values.forEach((qcValue) => {
            const {
                key,
                tooltip,
                value,
                flag = null,
                visible = false,
            } = qcValue;

            // Check for the first VerifyBamID qc value
            if (
                verifyBamId === null &&
                qcValue?.derived_from === 'verifybamid:freemix_alpha'
            ) {
                verifyBamId = {
                    tooltip,
                    value,
                    flag,
                };
            }

            // Add information from the visible qc_value
            if (visible) {
                if (!acc[key]) {
                    // Add new key to acc
                    acc[key] = {
                        tooltip,
                        values: {
                            [accession]: {
                                value,
                                flag,
                            },
                        },
                    };
                } else {
                    // Key exists, just add new value to it
                    acc[key].values[accession] = {
                        value,
                        flag,
                    };
                }
            }
        });

        return acc;
    }, {});

    return {
        headers,
        tableData,
        verifyBamId,
        overall_file_quality_status,
    };
};

// Render a QC Overview table with given quality_metrics items [qcItems]
const QCOverviewTable = ({ qcItems, accession, isRNASeq = false }) => {
    const [data, setData] = useState(null);

    useEffect(() => {
        const searchUrl = `/search/?${qcItems
            .map((item) => `uuid=${item.uuid}`)
            .join('&')}`;

        ajax.load(
            searchUrl,
            (resp) => {
                setData(formatRawData(resp['@graph']));
            },
            'GET'
        );
    }, []);

    return data ? (
        <div className="content qc-overview-tab">
            <div className="mt-2">
                <h2 className="header top mb-2">
                    <div className="d-flex justify-content-between align-items-center">
                        <span className="d-flex align-items-center gap-1">
                            QC Overview Status:{' '}
                            {data?.overall_file_quality_status ? (
                                getBadge(
                                    data?.overall_file_quality_status,
                                    false,
                                    true
                                )
                            ) : (
                                <span className="text-muted fw-normal">
                                    N/A
                                </span>
                            )}
                        </span>
                        <a
                            href={`/qc-metrics?tab=metrics-by-file&file=${accession}`}
                            className="btn btn-sm btn-outline-secondary">
                            <i className="icon icon-chart-area fas me-1"></i>
                            Visualize Quality Metrics
                        </a>
                    </div>
                </h2>
            </div>
            <div className="mt-2 mb-4">
                <h2 className="header mb-2">Critical QC</h2>
                <div className="data-group">
                    <div className="datum">
                        <span className="datum-title">
                            <strong>Sample Related Check </strong>
                            <span className="text-gray">[Somalier]</span>
                        </span>
                        <a
                            href={`/qc-metrics?tab=sample-integrity&file=${accession}`}
                            className="btn btn-sm btn-outline-secondary">
                            <i className="icon icon-chart-area fas me-1"></i>
                            View Relatedness Chart
                        </a>
                    </div>
                    <div className="datum">
                        <span className="datum-title">
                            <strong>Human Contamination Check </strong>
                            <span className="text-gray">[VerifyBamID2]</span>
                        </span>
                        {data?.verifyBamId ? (
                            <span className="d-flex align-items-center gap-1 datum-value">
                                {data?.verifyBamId?.value}{' '}
                                {getBadge(data?.verifyBamId?.flag)}
                            </span>
                        ) : (
                            <span className="datum-value text-gray">N/A</span>
                        )}
                    </div>
                    {isRNASeq ? (
                        <div className="datum">
                            <span className="datum-title">
                                <strong>
                                    Tissue Agreement Check [DAC Tissue
                                    Classifier]
                                </strong>
                            </span>
                            <span className="datum-value text-gray">
                                Coming soon
                            </span>
                        </div>
                    ) : null}
                </div>
            </div>

            <h2 className="header mb-2">General QC</h2>
            <table className="table table-bordered table-striped qc-overview-tab-table">
                <thead>
                    <tr>
                        <th className="text-left w-[300px]">Key QC Metric</th>
                        {data.headers.map(
                            ({ accession, overall_quality_status }, i) => {
                                return (
                                    <th
                                        className="text-left fw-semibold"
                                        key={i}>
                                        <div className="d-flex flex-column">
                                            <span className="d-flex align-items-center lh-base">
                                                QC Run #{i + 1} (
                                                <a href={`/${accession}`}>
                                                    {accession}
                                                </a>
                                                )
                                            </span>
                                            <span className="fw-medium d-flex align-items-center gap-1">
                                                Overall QC Status:{' '}
                                                {overall_quality_status ? (
                                                    getBadge(
                                                        overall_quality_status
                                                    )
                                                ) : (
                                                    <span className="text-muted fw-normal">
                                                        N/A
                                                    </span>
                                                )}
                                            </span>
                                        </div>
                                    </th>
                                );
                            }
                        )}
                    </tr>
                </thead>
                <tbody>
                    {Object.keys(data.tableData).length > 0 ? (
                        Object.keys(data.tableData).map((key, i) => {
                            const { tooltip, values: rowValues = {} } =
                                data.tableData[key];

                            return (
                                <tr key={i}>
                                    {/* Title of the Quality Metric row */}
                                    <td className="text-left">
                                        <i
                                            className="icon icon-info-circle fas me-1 text-secondary"
                                            data-tip={tooltip}
                                        />
                                        {key}
                                    </td>

                                    {/* Value for each column (i.e. qcItem labelled by [accession]) */}
                                    {data.headers.map(({ accession }, i) => {
                                        const cellValue =
                                            rowValues[accession] ?? null;

                                        return (
                                            <td className="text-left" key={i}>
                                                {cellValue !== null ? (
                                                    <div className="d-flex">
                                                        <span className="d-flex align-items-center gap-1">
                                                            {d3.format('.3f')(
                                                                cellValue?.value
                                                            )}
                                                            {getBadge(
                                                                cellValue?.flag
                                                            )}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-secondary">
                                                        -
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td
                                className="text-left text-secondary"
                                colSpan={qcItems.length + 1}>
                                No Quality Metrics available.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    ) : (
        <>
            <i className="icon icon-spin icon-spinner fas me-1"></i>
            Loading
        </>
    );
};

// Top level component for QC Overview tab content
export const QcOverviewTabContent = ({ context }) => {
    return (
        <QCOverviewTable
            qcItems={context.quality_metrics}
            accession={context.accession}
            isRNASeq={context?.assays?.some(
                (assay) => assay?.display_title === 'RNA-seq'
            )}
        />
    );
};
