import React, { useState, useEffect, useRef } from 'react';

import { getBadge, capitalize, removeToolName } from './utils';
import ReactTooltip from 'react-tooltip';

export const SampleContaminationDataTable = ({ data }) => {

    // We need a deep copy here, otherwise the sorting messes up the heatmap
    const filteredData = JSON.parse(JSON.stringify(data['results']));
    filteredData.sort((a, b) => a.relatedness - b.relatedness);
    ReactTooltip.rebuild();

    const tableBodyData = filteredData.map((d) => {
        const result = {};
        const sample_a_link = '/' + d['sample_a'];
        result['Sample A'] = (
            <a href={sample_a_link} target="_blank">
                {d['sample_a']}
            </a>
        );
        const sample_b_link = '/' + d['sample_b'];
        result['Sample B'] = (
            <a href={sample_b_link} target="_blank">
                {d['sample_b']}
            </a>
        );

        result['Relatedness'] = d['relatedness'];
        result['IBS0'] = d['ibs0'];
        result['IBS2'] = d['ibs2'];
        return result;
    });
    const tableHeaderValues =
        tableBodyData.length > 0 ? Object.keys(tableBodyData[0]) : [];

    const tableHeader = [
        <th key="sample_a">Sample A</th>,
        <th key="sample_b">Sample B</th>,
        <th key="relatedness">Relatedness</th>,
        <th key="ibs0">
            IBS0{' '}
            <i
                className="icon icon-fw fas icon-info-circle ml-1 text-muted"
                data-tip="The number of sites where one sample is hom-ref and another is hom-alt"></i>
        </th>,
        <th key="ibs2">
            IBS2{' '}
            <i
                className="icon icon-fw fas icon-info-circle ml-1 text-muted"
                data-tip="The number of sites where the samples have the same genotype"></i>
        </th>,
    ];

    if (filteredData.length === 0) {
        return (
            <div className="p-5 text-center">
                <i className="icon fas icon-exclamation-triangle icon-fw text-warning" />{' '}
                No data available for this donor
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
                            return (
                                <tr key={rowIndex}>
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
