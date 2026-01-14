'use strict';

import React from 'react';
import { DataCardRow } from '../file-overview/FileViewDataCards';
import {
    OverlayTrigger,
    Popover,
    PopoverBody,
    PopoverHeader,
} from 'react-bootstrap';
import { renderHardyScaleDescriptionPopover } from '../donor-overview/ProtectedDonorViewDataCards';

const default_donor_information = [
    {
        title: 'Donor ID',
        getProp: (context = {}) => context?.external_id,
    },
    {
        title: 'Age',
        getProp: (context = {}) => context?.age,
    },
    {
        title: 'Sex',
        getProp: (context = {}) => context?.sex,
    },
    {
        title: 'Hardy Scale',
        getProp: (context = {}) => context?.hardy_scale,
        titlePopover: (handleShowPopover) =>
            renderHardyScaleDescriptionPopover(handleShowPopover),
    },
];
const DonorStatistics = ({ data, isLoading }) => {
    return (
        <div className="data-summary d-flex flex-column gap-3">
            <div className="d-flex gap-3">
                <div className="donor-statistic tissues d-flex flex-column p-2 gap-2">
                    <div className="donor-statistic-label text-center">
                        <i className="icon icon-lungs fas"></i>Tissues
                    </div>
                    <div className="donor-statistic-value text-center">
                        {!isLoading ? (
                            <span>{data.tissues}</span>
                        ) : (
                            <i className="icon icon-circle-notch icon-spin fas" />
                        )}
                    </div>
                </div>
                <div className="donor-statistic assays d-flex flex-column p-2 gap-2">
                    <div className="donor-statistic-label text-center">
                        <i className="icon icon-dna fas"></i>Assays
                    </div>
                    <div className="donor-statistic-value text-center">
                        {!isLoading ? (
                            <span>{data.assays}</span>
                        ) : (
                            <i className="icon icon-circle-notch icon-spin fas" />
                        )}
                    </div>
                </div>
                <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                    <div className="donor-statistic-label text-center">
                        <i className="icon icon-file fas"></i>Files
                    </div>
                    <div className="donor-statistic-value text-center">
                        {!isLoading ? (
                            <span>{data?.files}</span>
                        ) : (
                            <i className="icon icon-circle-notch icon-spin fas" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProtectedDataPlaceholder = () => {
    return (
        <div className="protected-data callout-card">
            <i className="icon icon-user-lock fas"></i>
            <h4>Protected Data</h4>
            <span>
                To view this data, you must have access to SMaHT protected
                access data on dbGaP.
            </span>
        </div>
    );
};

/**
 * Parent component for the data cards containing information on the file.
 * @param {object} context the context of the item being viewed
 */
export const PublicDonorViewDataCards = ({
    context = {},
    statisticValues = {},
    isLoading = false,
}) => {
    let donor_information = default_donor_information;

    return (
        <div className="data-cards-container d-flex flex-column">
            <div className="cards-left d-flex gap-4 flex-wrap">
                {/* Data Summary Card */}
                <div className="data-card">
                    <div className="header">
                        <span className="header-text">Data Summary</span>
                    </div>
                    <div className="body">
                        <div className="data-card-section">
                            <span className="section-title">
                                Donor Overview
                            </span>
                            <div className="section-body split d-flex mb-2">
                                <div className="d-flex flex-column">
                                    {donor_information.map(
                                        ({ title, getProp, titlePopover }) => {
                                            return (
                                                <DataCardRow
                                                    key={title}
                                                    title={title}
                                                    value={getProp(context)}
                                                    titlePopover={titlePopover}
                                                />
                                            );
                                        }
                                    )}
                                </div>
                                <div className="d-flex flex-column">
                                    <DataCardRow
                                        title={'Tier'}
                                        value={'Protected'}
                                    />
                                    <DataCardRow
                                        title={'Bulk WGS Coverage'}
                                        value={'Protected'}
                                    />
                                    <DataCardRow
                                        title={'DSA'}
                                        value={'Protected'}
                                        titlePopover={
                                            <Popover
                                                id="dsa-popover"
                                                className="description-definitions-popover">
                                                <PopoverHeader>
                                                    DSA
                                                </PopoverHeader>
                                                <PopoverBody className="p-3">
                                                    DSA, Donor-Specific genome
                                                    Assembly, refers to the
                                                    reconstruction of the
                                                    complete DNA sequence of a
                                                    single donor's genome,
                                                    allowing for more accurate
                                                    detection of mutations
                                                    (i.e., variants in the DNA
                                                    sequence) in that individual
                                                    by using DSA as a reference.
                                                </PopoverBody>
                                            </Popover>
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                        <DonorStatistics
                            data={statisticValues}
                            isLoading={isLoading}
                        />
                    </div>
                </div>

                {/* Prior Diagnosis Card */}
                <div className="data-card prior-diagnosis">
                    <div className="header">
                        <div className="header-text">Prior Diagnosis</div>
                    </div>
                    <div className="body d-flex flex-column gap-4">
                        <ProtectedDataPlaceholder />
                    </div>
                </div>

                {/* Exposures Card */}
                <div className="data-card exposure">
                    <div className="header">
                        <div className="header-text">
                            Environmental / Lifestyle Exposure
                        </div>
                    </div>
                    <div className="body d-flex flex-column gap-4">
                        <ProtectedDataPlaceholder />
                    </div>
                </div>
            </div>
        </div>
    );
};
