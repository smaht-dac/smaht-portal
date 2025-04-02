import React, { useState, useEffect } from 'react';

import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { getBadge } from '../../../viz/QualityMetricVisualizations/utils';

import * as d3 from 'd3';

// Formats the response data into a format that can be used in the table
const formatRawData = (data) => {
    let headers = [];
    const tableData = data.reduce((acc, qcItem) => {
        // Get the accession of the qcItem
        const accession = qcItem.accession;
        const overall_quality_status = qcItem.overall_quality_status;

        headers = [...headers, { accession, overall_quality_status }];

        // Loop through the qc_values of each item and save them under the item's accession
        qcItem.qc_values.forEach((qcValue) => {
            const {
                key,
                tooltip,
                value,
                flag = null,
                visible = false,
            } = qcValue;

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
    };
};

// Render a QC Overview table with given quality_metrics items [qcItems]
const QCOverviewTable = ({ qcItems }) => {
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
        <div className="content qc-overview-tab-table">
            <div className="mt-2 mb-4">
                <h2 className="header mb-2">Critical QC</h2>
                <div className="data-group">
                    <div className="datum">
                        <span className="datum-title">
                            <strong>
                                Somalier sample duplicate check result (and the
                                QC status)
                            </strong>
                        </span>
                        <span className="datum-value text-gray">N/A</span>
                    </div>
                    <div className="datum">
                        <span className="datum-title">
                            <strong>
                                VerifyBamID2 human contamination check result
                                (and the QC status)
                            </strong>
                        </span>
                        <span className="datum-value text-gray">N/A</span>
                    </div>
                    <div className="datum">
                        <span className="datum-title">
                            <strong>Tissue prediction check</strong>
                        </span>
                        <span className="datum-value text-gray">N/A</span>
                    </div>
                </div>
            </div>

            <h2 className="header mb-2">General QC</h2>
            <table className="table table-bordered table-striped">
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
                                                BAM #{i + 1} (
                                                <a href={`/${accession}`}>
                                                    {accession}
                                                </a>
                                                )
                                            </span>
                                            <span className="lh-1">
                                                Overall Quality Status:{' '}
                                                {getBadge(
                                                    overall_quality_status
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
                                                        <span className="me-1 d-flex align-items-center lh-1">
                                                            {d3.format('.3f')(
                                                                cellValue?.value
                                                            )}{' '}
                                                        </span>
                                                        <span className="lh-1">
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
                                No Quality Metrics Values visible.
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
    console.log('context: ', context);
    return <QCOverviewTable qcItems={context.quality_metrics} />;
};
