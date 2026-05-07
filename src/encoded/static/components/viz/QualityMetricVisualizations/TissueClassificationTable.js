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

    // Special cases for mapping submitted tissue labels to predicted tissue labels
    const submittedToPredictedTissueMap = {
        'Aorta': 'Blood Vessel', // Aorta is a blood vessel in GTEX
        'Non-exposed Skin': 'Skin',
        'Sun-exposed Skin': 'Skin',
        'Ascending Colon': 'Colon',
        'Descending Colon': 'Colon',
    };

    let filteredData = data.qc_results.filter(
        (r) =>
            r.assay == 'RNA-seq' &&
            r.study == study &&
            r.sample_source_group == sampleSourceGroup
    );

    filteredData = JSON.parse(JSON.stringify(filteredData));

    const keyPredictedTissue = (i) => `tissue_classifier:predicted_tissue_${i}`;
    const keyProbabilityPredictedTissue = (i) =>
        `tissue_classifier:probability_predicted_tissue_${i}`;

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
        const submittedTissueMapped = submittedToPredictedTissueMap[submittedTissue] || submittedTissue;
        const qc_values = d['quality_metrics']['qc_values'];
        const predictedTissues = [];
        const predictedTissuesProbabilities = [];
        const predictedTissueDisplay = [];
        for (let i = 1; i <= 3; i++) {
            const predictedTissue = qc_values[keyPredictedTissue(i)]['value'];
            const predictedTissueProbability =
                qc_values[keyProbabilityPredictedTissue(i)]['value'];
            predictedTissues.push(predictedTissue);
            predictedTissuesProbabilities.push(predictedTissueProbability);
            let printBold = predictedTissue === submittedTissueMapped;
            
            predictedTissueDisplay.push(
                <span className={printBold ? 'fw-bold' : ''}>
                    {predictedTissue} (
                    {formatPercent(predictedTissueProbability)})
                </span>
            );
        }

        if (isCellLine) {
            // We expect that Blood or Skin is in the predicted tissues
            const cellLineBlood = ['HAPMAP6', 'COLO829BLT50'];
            const cellLineSkin = ['LBLA2'];
            if (cellLineBlood.includes(submittedTissue)) {
                result['hasMatch'] = predictedTissues.includes('Blood');
            } else if (cellLineSkin.includes(submittedTissue)) {
                result['hasMatch'] = predictedTissues.includes('Skin');
            } else {
                result['hasMatch'] = null;
            }
        } else {
            result['hasMatch'] = predictedTissues.includes(submittedTissueMapped);
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
                {predictedTissueDisplay[0]}, {predictedTissueDisplay[1]},{' '}
                {predictedTissueDisplay[2]}
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
