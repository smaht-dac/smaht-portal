import React, { useState, useEffect, useMemo } from 'react';

import { SampleContaminationDataTable } from './SampleContaminationDataTable';
import { SampleContaminationHeatmap } from './SampleContaminationHeatmap';
import { customReactSelectStyle } from './utils';

import Select from 'react-select';

export const SampleContamination = ({ qcData, preselectedFile }) => {
    const vizInfo = qcData.viz_info;
    const donorsForFacets = vizInfo.facets.sample_identity_donors;
    const somalierResults = qcData.somalier_results;

    const preSelectionInfos = useMemo(() => {
        const result = {
            preselectedDonor: donorsForFacets[0],
            warnings: [],
            successMessages: [],
        };
        const donorAccessions = Object.keys(somalierResults);
        donorAccessions.forEach((donorAccession) => {
            const donorWarnings = somalierResults[donorAccession]['warnings'];
            donorWarnings.forEach((warning) => {
                result.warnings.push(
                    <span>
                        <i className="icon icon-exclamation-triangle fas icon-fw" />{' '}
                        {warning}
                    </span>
                );
            });
        });

        if (!preselectedFile) {
            return result;
        }

        let fileFound = false;
        for (let i = 0; i < donorAccessions.length; i++) {
            const donorAccession = donorAccessions[i];
            const filesIncluded =
                somalierResults[donorAccession]['info']['files_included'];
            const problematicFiles =
                somalierResults[donorAccession]['info']['problematic_files'];
            if (filesIncluded.includes(preselectedFile)) {
                fileFound = true;
                if(!problematicFiles.includes(preselectedFile)){
                    result.successMessages.push(
                        <span>
                            <i className="icon icon-check fas icon-fw" />{' '}
                            File <strong>{preselectedFile}</strong> passed the sample integrity check.
                        </span>
                    );
                }
                const donor = donorsForFacets.find(
                    (d) => d.value === donorAccession
                );
                if (donor) {
                    result.preselectedDonor = donor;
                    break;
                }
            }
        }
        if (!fileFound) {
            result.warnings.push(
                <span>
                    <i className="icon icon-exclamation-triangle fas icon-fw" />{' '}
                    Sample integrity results are not yet available for the selected
                    file.
                </span>
            );
        }
        return result;
    }, [preselectedFile]); // Only recompute when `preselectedFile` changes

    const [selectedDonor, setSelectedDonor] = useState(
        preSelectionInfos.preselectedDonor
    );

    const [rerenderNumber, setRerenderNumber] = useState(0);

    const [warnings, setWarnings] = useState(preSelectionInfos.warnings);
    const [successMessages, setSuccessMessages] = useState(preSelectionInfos.successMessages);

    const handleSelectedDonorChange = (selection) => {
        setSelectedDonor(selection);
    };

    useEffect(() => {
        setRerenderNumber(rerenderNumber + 1);
    }, [selectedDonor]);

    const warningsDisplay =
        warnings.length > 0 ? (
            <div className="alert alert-danger qc-metrics-alert-danger">
                {warnings.map((w, index) => (
                    <div key={index}>{w}</div>
                ))}
            </div>
        ) : (
            ''
        );

    const successMessagesDisplay =
        successMessages.length > 0 ? (
            <div className="alert alert-success qc-metrics-alert-success">
                {successMessages.map((w, index) => (
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
            {warningsDisplay}
            {successMessagesDisplay}
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
