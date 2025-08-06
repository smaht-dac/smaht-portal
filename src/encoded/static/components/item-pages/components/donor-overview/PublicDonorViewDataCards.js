'use strict';

import React from 'react';
import { DataCardRow } from '../file-overview/FileViewDataCards';
import { OverlayTrigger, Popover, PopoverBody } from 'react-bootstrap';
/**
 * Bootstrap Popover element for the description field in the sample information
 * data card. Contains a table with definitions for the terms used in the
 * description field.
 * @returns {JSX.Element} Popover component with term definitions
 *
 * Note: Use regular function here, as Bootstrap relies on `this`.
 */
export function renderHardyScaleDescriptionPopover(customId) {
    return (
        <Popover
            id={customId ?? 'description-definitions-popover-hardy'}
            className="w-auto description-definitions-popover">
            <PopoverBody className="p-0">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="text-left" colSpan={2}>
                                Hardy Scale - Death Classification
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="fs-5 align-middle text-center px-5">
                                0
                            </td>
                            <td className="text-left">
                                <b>Ventilator Case.</b> All cases on a
                                ventilator immediately before death.
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center px-5">
                                1
                            </td>
                            <td className="text-left">
                                <b>Violent and fast death.</b> Deaths due to
                                accident, blunt force trauma or suicide,
                                terminal phase estimated at &lt; 10 min.
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center px-5">
                                2
                            </td>
                            <td className="text-left">
                                <b>Fast death of natural causes.</b> Sudden
                                unexpected deaths of people who had been
                                reasonably healthy, after a terminal phase
                                estimated at &lt; 1 hr (with sudden death from a
                                myocardial infarction as a model cause of death
                                for this category).
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center px-5">
                                3
                            </td>
                            <td className="text-left">
                                <b>Intermediate death.</b> Death after a
                                terminal phase of 1 to 24 hrs (not classifiable
                                as 2 or 4); patients who were ill but death was
                                unexpected.
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center px-5">
                                4
                            </td>
                            <td className="text-left">
                                <b>Slow death.</b> Death after a long illness,
                                with a terminal phase longer than 1 day
                                (commonly cancer or chronic pulmonary disease);
                                deaths that are not unexpected
                            </td>
                        </tr>
                    </tbody>
                </table>
            </PopoverBody>
        </Popover>
    );
}

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
        titlePopover: renderHardyScaleDescriptionPopover(),
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
