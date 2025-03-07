import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import { ScatterPlot } from './ScatterPlot';
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
        const qc_result =
            somalierResults[donorAccession]['info']['overall_quality_status'];
        if (qc_result.toLowerCase() === 'fail') {
            let donor = donorsForFacets.find((d) => d.value === donorAccession);

            warnings.push(
                <span>
                    <i className="icon icon-exclamation-triangle fas icon-fw" />{' '}
                    The sample identity check failed for donor{' '}
                    <strong>{donor.label}</strong>.
                </span>
            );
        }
    });

    warnings =
        warnings.length > 0 ? (
            <div className="alert alert-warning">
                {warnings.map((w, index) => (
                    <div key={index}>{w}</div>
                ))}
            </div>
        ) : (
            ''
        );

    const facets = (
        <div className="qc-metrics-facets-container mb-2">
            <div className="row">
                <div className="col-2">
                    <div className="p-3">
                        <div className="fw-bold">Selected donor</div>
                    </div>
                </div>
                <div className="col-5">
                    <div className="p-3">
                        <Select
                            value={selectedDonor}
                            onChange={handleSelectedDonorChange}
                            styles={customReactSelectStyle}
                            options={donorsForFacets}
                        />
                    </div>
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
                        Samples of the same donor are expected to have a
                        high degree of relatedness.{' '}
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
