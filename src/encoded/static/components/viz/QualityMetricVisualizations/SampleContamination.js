import React, { useState, useEffect } from 'react';

import { SampleContaminationDataTable } from './SampleContaminationDataTable';
import { SampleContaminationHeatmap } from './SampleContaminationHeatmap';
import {
    formatLargeInteger,
    getFileModalContent,
    customReactSelectStyle,
} from './utils';
import { Modal } from 'react-bootstrap';
import Select from 'react-select';

export const SampleContamination = ({ qcData }) => {
    const vizInfo = qcData.viz_info;
    const donorsForFacets = vizInfo.facets.sample_identity_donors;
    const somalierResults = qcData.somalier_results;

    //const defaultSettings = settings || vizInfo.default_settings.boxplot;

    const [highlightedBam, sethighlightedBam] = useState(null);
    const [selectedDonor, setSelectedDonor] = useState(donorsForFacets[0]);

    const [rerenderNumber, setRerenderNumber] = useState(0);

    const handleSelectedDonorChange = (selection) => {
        setSelectedDonor(selection);
    };

    useEffect(() => {
        //loadContaminationData(selectedDonor.value);
        setRerenderNumber(rerenderNumber + 1);
    }, [selectedDonor]);

    const updateHighlightedBam = (bam) => {
        sethighlightedBam(bam);
    };

    // Gather Warnings
    let warnings = [];
    Object.keys(somalierResults).forEach((donorAccession) => {
        const donorWarnings = somalierResults[donorAccession]['warnings'];

        donorWarnings.forEach((warning) => {
            warnings.push(
                <span>
                    <i className="icon icon-exclamation-triangle fas icon-fw" />{' '}
                    {warning}
                </span>
            );
        });
    });

    warnings =
        warnings.length > 0 ? (
            <div className="alert alert-danger">
                {warnings.map((w, index) => (
                    <div key={index}>{w}</div>
                ))}
            </div>
        ) : (
            ''
        );

    const facets = (
        <div className="qc-metrics-facets-container mb-2">
            <div className="d-flex flex-row">
                <div className="p-3">
                    <div className="fw-bold">Selected donor</div>
                </div>
                <div className="p-3 flex-grow-1">
                    <Select
                        value={selectedDonor}
                        onChange={handleSelectedDonorChange}
                        styles={customReactSelectStyle}
                        options={donorsForFacets}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <>
            {warnings}
            {facets}
            <div className="row">
                <div className="col-12">
                    <h4>Pairwise sample relatedness</h4>
                    <p>
                        The pairwise relatedness was calculated using somalier.
                        Samples of the same donor are expected to have a high
                        degree of relatedness.{' '}
                    </p>
                    <SampleContaminationHeatmap
                        plotId={1}
                        rerenderNumber={rerenderNumber}
                        data={
                            somalierResults[selectedDonor['value']]['results']
                        }></SampleContaminationHeatmap>
                </div>
                <div className="col-12">
                    <div className="pt-5 h4">Somalier results</div>
                    <div>
                        <SampleContaminationDataTable
                            data={
                                somalierResults[selectedDonor['value']]
                            }></SampleContaminationDataTable>
                    </div>
                </div>
            </div>
        </>
    );
};
