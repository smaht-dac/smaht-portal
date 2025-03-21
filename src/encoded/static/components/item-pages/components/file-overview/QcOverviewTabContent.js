import React, { useState, useEffect } from 'react';

import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { getBadge } from '../../../viz/QualityMetricVisualizations/utils';

// Formats the response data into a format that can be used in the table
const formatRawData = (data) => {
    const tableData = data.reduce((acc, qcItem) => {
        // Get the accession of the qcItem
        const accession = qcItem.accession;

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
        headers: data.map((qcItem) => qcItem.accession),
        tableData,
    };
};

// Render a QC Overview table with given quality_metrics items [qcItems]
const QCOverviewTable = ({ qcItems }) => {
    const [data, setData] = useState(null);

    useEffect(() => {
        ajax.load(
            `/search/?${qcItems.map((item) => `uuid=${item.uuid}`).join('&')}`,
            (resp) => {
                setData(formatRawData(resp['@graph']));
            },
            'GET'
        );
    }, []);

    return data ? (
        <div className="qc-overview-tab-table">
            <table className="table table-bordered table-striped">
                <thead>
                    <tr>
                        <th className="text-left">Quality Metric</th>
                        {data.headers.map((accession, i) => {
                            return (
                                <th className="text-left" key={i}>
                                    Run {i + 1} (
                                    <a href={`/${accession}`}>{accession}</a>)
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {Object.keys(data.tableData).map((key, i) => {
                        const { tooltip, values: rowValues = {} } =
                            data.tableData[key];

                        return (
                            <tr key={i}>
                                {/* Title of the Quality Metric row */}
                                <td className="text-left">
                                    {key}
                                    <i
                                        className="icon icon-info-circle fas"
                                        data-tip={tooltip}
                                    />
                                </td>

                                {/* Value for each column (i.e. qcItem labelled by [accession]) */}
                                {data.headers.map((accession, i) => {
                                    const cellValue =
                                        rowValues[accession] ?? null;

                                    return (
                                        <td key={i}>
                                            {cellValue !== null ? (
                                                <>
                                                    {cellValue?.value}{' '}
                                                    {getBadge(cellValue?.flag)}
                                                </>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
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
    return <QCOverviewTable qcItems={context.quality_metrics} />;
};
