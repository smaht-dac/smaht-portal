import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { getBadge } from './utils';

export const TissueClassificationTable = ({
    data,
    study,
    sampleSourceGroup,
}) => {
    // We need a deep copy here, otherwise the sorting messes up the heatmap
    //const filteredData = JSON.parse(JSON.stringify(data['results']));
    const formatPercent = d3.format('.0%');

    let filteredData = data.qc_results.filter(
        (r) =>
            r.assay == 'RNA-seq' &&
            r.study == study &&
            r.sample_source_group == sampleSourceGroup
    );

    filteredData = JSON.parse(JSON.stringify(filteredData));

    const key_pt1 = 'tissue_classifier:predicted_tissue_1';
    const key_pt2 = 'tissue_classifier:predicted_tissue_2';
    const key_pt3 = 'tissue_classifier:predicted_tissue_3';
    const key_prob_pt1 = 'tissue_classifier:probability_predicted_tissue_1';
    const key_prob_pt2 = 'tissue_classifier:probability_predicted_tissue_2';
    const key_prob_pt3 = 'tissue_classifier:probability_predicted_tissue_3';

    const isCellLine = sampleSourceGroup === 'cell_line';

    const tableBodyData = filteredData.map((d) => {
        const result = {};

        const file_link = '/' + d.file_accession;
        result['File'] = (
            <>
                <a href={file_link} target="_blank">
                    {d.file_accession}
                </a>
            </>
        );

        result['Submission Center'] = d.submission_center;

        const submittedTissue = d.sample_source_display;
        const qc_values = d['quality_metrics']['qc_values'];
        const pt1 = qc_values[key_pt1]['value'];
        const pt1_prob = qc_values[key_prob_pt1]['value'];
        const pt1_display = (
            <span className={pt1 === submittedTissue ? 'fw-bold' : ''}>
                {pt1} ({formatPercent(pt1_prob)})
            </span>
        );

        const pt2 = qc_values[key_pt2]['value'];
        const pt2_prob = qc_values[key_prob_pt2]['value'];
        const pt2_display = (
            <span className={pt2 === submittedTissue ? 'fw-bold' : ''}>
                {pt2} ({formatPercent(pt2_prob)})
            </span>
        );

        const pt3 = qc_values[key_pt3]['value'];
        const pt3_prob = qc_values[key_prob_pt3]['value'];
        const pt3_display = (
            <span className={pt3 === submittedTissue ? 'fw-bold' : ''}>
                {pt3} ({formatPercent(pt3_prob)})
            </span>
        );

        if (isCellLine) {
            // We expect that Blood or Skin is in the predicted tissues
            const cellLineBlood = ['HAPMAP6', 'COLO829BLT50'];
            const cellLineSkin = ['LBLA2'];
            if (cellLineBlood.includes(submittedTissue)) {
                result['hasMatch'] =
                    pt1 === 'Blood' || pt2 === 'Blood' || pt3 === 'Blood';
            } else if (cellLineSkin.includes(submittedTissue)) {
                result['hasMatch'] =
                    pt1 === 'Skin' || pt2 === 'Skin' || pt3 === 'Skin';
            } else {
                result['hasMatch'] = null;
            }
        } else {
            result['hasMatch'] =
                pt1 === submittedTissue ||
                pt2 === submittedTissue ||
                pt3 === submittedTissue;
        }

        const yesBadge = <div className="text-center">{getBadge('Yes')}</div>;
        const noBadge = <div className="text-center">{getBadge('No')}</div>;
        result['hasMatchBadge'] = result['hasMatch'] ? yesBadge : noBadge;
        if (result['hasMatch'] === null) {
            result['hasMatchBadge'] = '';
        }

        result['Submitted tissue'] = isCellLine
            ? submittedTissue
            : submittedTissue + ' (' + d.sample_source + ')';

        result['Predicted tissue'] = (
            <>
                {pt1_display}, {pt2_display}, {pt3_display}
            </>
        );

        return result;
    });

    // Sort rows by whether the predicted tissues match the submitted tissue
    tableBodyData.sort((a, b) => a.hasMatch - b.hasMatch);

    const tableHeaderValues =
        tableBodyData.length > 0
            ? Object.keys(tableBodyData[0]).filter((t) => t !== 'hasMatch')
            : [];

    const tableHeader = [
        <th key="File">File</th>,
        <th key="Submission Center">Submission Center</th>,
        <th key="Match" className="text-center">
            Match
        </th>,
        <th key="Submitted tissue">
            {isCellLine
                ? 'Submitted sample label'
                : 'Submitted tissue label (Sample)'}
        </th>,
        <th key="Predicted tissue">
            Predicted tissue labels from data (with probabilities)
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
