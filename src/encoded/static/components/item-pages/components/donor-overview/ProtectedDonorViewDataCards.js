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

/**
 * Popover for Alcohol Exposure Frequency Description.
 */
export function renderAlcoholFrequencyDescriptionPopover(customId) {
    return (
        <Popover
            id={customId ?? 'description-definitions-popover-alcohol'}
            className="w-auto description-definitions-popover">
            <PopoverBody className="p-0">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="text-left" colSpan={2}>
                                Frequency: The extent of the donor's regular
                                exposure to alcohol
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Social
                            </td>
                            <td className="text-left">A few drinks per year</td>
                        </tr>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Light
                            </td>
                            <td className="text-left">
                                Less than 1 drink per day (0-6 per week)
                            </td>
                        </tr>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Moderate
                            </td>
                            <td className="text-left">
                                Up to 2 drinks per day (7-14 per week)
                            </td>
                        </tr>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Heavy
                            </td>
                            <td className="text-left">
                                3 or more drinks per day (15 or more per week)
                            </td>
                        </tr>
                    </tbody>
                </table>
            </PopoverBody>
        </Popover>
    );
}

/**
 * Popover for Tobacco Exposure Frequency Description.
 */
export function renderTobaccoFrequencyDescriptionPopover(customId) {
    return (
        <Popover
            id={customId ?? 'description-definitions-popover-tobacco'}
            className="w-auto description-definitions-popover">
            <PopoverBody className="p-0">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="text-left" colSpan={2}>
                                Frequency: The extent of the donor's regular
                                exposure to tobacco
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Social
                            </td>
                            <td className="text-left">
                                0-10 cigarettes in past 5 years, 6 or fewer
                                cigars/pipes per year
                            </td>
                        </tr>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Light
                            </td>
                            <td className="text-left">
                                0-5 cigarettes per day (up to ¼ ppd), 12 or
                                fewer cigars/pipes per year
                            </td>
                        </tr>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Moderate
                            </td>
                            <td className="text-left">
                                6-9 cigarettes per day (¼ to ¾ ppd), 3-5
                                cigars/pipes per week
                            </td>
                        </tr>
                        <tr>
                            <td className="align-middle text-left py-2 px-4 fw-semibold">
                                Heavy
                            </td>
                            <td className="text-left">
                                20 or more cigarettes per day (1 or more ppd),
                                more than 5 cigars/pipes per week
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

const default_data_summary = [
    {
        title: 'Donor ID',
        getProp: (context = {}) => context?.external_id,
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

/**
 * A card component that displays exposure data for a donor. It shows the
 * category, duration, frequency, quantity, and cessation information.
 * @param {object} data the exposure data object containing information on the exposure
 * @returns
 */
const ExposureCard = ({ data, popover }) => {
    const {
        category,
        duration,
        frequency_category,
        quantity,
        quantity_unit,
        cessation,
        cessation_duration,
    } = data || {};

    // Determine the cessation value based on availability
    let cessation_value = '--';
    switch (cessation) {
        case 'Yes':
            cessation_value = cessation_duration
                ? cessation_duration + ' yrs'
                : 'Yes';
            break;
        case 'No':
            cessation_value = 'No';
            break;
        case 'Unknown':
            cessation_value = 'N/A';
            break;
        default:
            break;
    }

    return (
        <div className="exposure-card">
            <div className="exposure-card-header">
                <span className="title">{category}</span>
                <div
                    className="datum"
                    data-tip={
                        'Number of years the donor was exposed to the substance'
                    }>
                    <span className="datum-title">
                        Duration <i className="icon icon-info-circle fas"></i>
                    </span>
                    <span className="datum-value">
                        {duration ? duration + ' yrs' : '--'}
                    </span>
                </div>
            </div>
            <div className="exposure-card-body">
                <OverlayTrigger
                    trigger={['hover', 'focus']}
                    overlay={popover}
                    placement="top"
                    flip={true}
                    popperConfig={{
                        modifiers: [
                            {
                                name: 'flip',
                                options: {
                                    fallbackPlacements: [
                                        'left',
                                        'right',
                                        'bottom',
                                    ],
                                },
                            },
                        ],
                    }}>
                    <div className="datum">
                        <span className="datum-title">
                            Frequency{' '}
                            <i className="icon icon-info-circle fas"></i>
                        </span>
                        <span className="datum-value">
                            {frequency_category ?? '--'}
                        </span>
                    </div>
                </OverlayTrigger>
                <div
                    className="datum"
                    data-tip={
                        'How much of the substance the donor was regularly exposed to'
                    }>
                    <span className="datum-title">
                        Quantity <i className="icon icon-info-circle fas"></i>
                    </span>
                    <span className="datum-value">
                        {quantity && quantity_unit
                            ? quantity + ' ' + quantity_unit
                            : '--'}
                    </span>
                </div>
                <div
                    className="datum"
                    data-tip={
                        'Whether exposure ceased prior to death and number of years since exposure ceased'
                    }>
                    <span className="datum-title">
                        Cessation <i className="icon icon-info-circle fas"></i>
                    </span>
                    <span
                        className={`datum-value ${
                            cessation_value === 'Uknown' ? 'text-secondary' : ''
                        }`}>
                        {cessation_value}
                    </span>
                </div>
            </div>
        </div>
    );
};

/**
 * Parent component for the data cards containing information on the file.
 * @param {object} context the context of the item being viewed
 */
export const ProtectedDonorViewDataCards = ({
    context = {},
    statisticValues = {},
    isLoading = false,
}) => {
    let donor_information = default_donor_information;

    // Isolate medical history properties
    const medical_history = context?.medical_history?.[0] || {};

    // Check if there is family cancer history
    const familyCancerHistory = Object.keys(medical_history)?.filter((key) => {
        return key?.includes('family') && key?.includes('cancer');
    });
    const hasFamilyCancerHistory = familyCancerHistory.some(
        (key) => medical_history[key] === 'Yes'
    );

    // Isolate Tobacco and Alcohol exposures
    const tobaccoExposure = medical_history?.exposures?.find(
        (exposure) => exposure.category === 'Tobacco'
    );
    const alcoholExposure = medical_history?.exposures?.find(
        (exposure) => exposure.category === 'Alcohol'
    );

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
                                        value={'Coming soon'}
                                    />
                                    <DataCardRow
                                        title={'Bulk WGS Coverage'}
                                        value={'Coming soon'}
                                    />
                                    <DataCardRow
                                        title={'DSA'}
                                        value={'Coming soon'}
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
                        <div className="data-card-section">
                            <span className="section-title">
                                Cancer History
                                <i
                                    className="icon icon-info-circle fas ms-1"
                                    data-tip={
                                        'Presence of cancer in donor medical history. Note: Cancer was not the cause of death for the donor.'
                                    }
                                />
                            </span>
                            <div className="section-body">
                                <span>
                                    {medical_history?.cancer_type?.[0] ??
                                        medical_history?.cancer_history ?? (
                                            <span className="text-secondary">
                                                N/A
                                            </span>
                                        )}
                                </span>
                            </div>
                        </div>
                        {/* Family Medical History Items */}
                        <div className="data-card-section">
                            <span className="section-title">
                                Family Cancer History
                                <i
                                    className="icon icon-info-circle fas ms-1"
                                    data-tip={
                                        "Presence of ovarian, pancreatic, or prostate cancer in donor's family's medical history. Full family history can be downloaded in the Donor Manifest."
                                    }
                                />
                            </span>
                            <div className="section-body">
                                <span className="">
                                    {familyCancerHistory ? (
                                        hasFamilyCancerHistory ? (
                                            'Yes'
                                        ) : (
                                            'No'
                                        )
                                    ) : (
                                        <span className="text-secondary">
                                            N/A
                                        </span>
                                    )}
                                </span>
                            </div>
                        </div>
                        <div className="data-card-section">
                            <span className="section-title">
                                Other Diagnosis
                            </span>
                            <div className="section-body">
                                <span className="">
                                    Protected -{' '}
                                    <i className="fw-light">see manifest</i>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Exposures Card */}
                <div className="data-card exposure">
                    <div className="header">
                        <div className="header-text">Exposures</div>
                    </div>
                    <div className="body d-flex flex-column gap-4">
                        <ExposureCard
                            data={tobaccoExposure ?? { category: 'Tobacco' }}
                            popover={renderTobaccoFrequencyDescriptionPopover()}
                        />
                        <ExposureCard
                            data={alcoholExposure ?? { category: 'Alcohol' }}
                            popover={renderAlcoholFrequencyDescriptionPopover()}
                        />
                        <div className="data-card-section">
                            <span className="section-title">
                                Other Exposures
                            </span>
                            <div className="section-body">
                                <span className="">
                                    Protected -{' '}
                                    <i className="fw-light">see manifest</i>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
