'use strict';

import React from 'react';
import { DataCardRow } from '../file-overview/FileViewDataCards';
import {
    OverlayTrigger,
    Popover,
    PopoverHeader,
    PopoverBody,
} from 'react-bootstrap';
/**
 * Bootstrap Popover element for the description field in the sample information
 * data card. Contains a table with definitions for the terms used in the
 * description field.
 * @returns {JSX.Element} Popover component with term definitions
 *
 * Note: Use regular function here, as Bootstrap relies on `this`.
 */
function renderDescriptionPopover() {
    return (
        <Popover id="description-definitions-popover" className="w-auto">
            <PopoverBody className="p-0">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="text-left">Term</th>
                            <th className="text-left">Definition</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="align-top text-left fw-bold text-nowrap">
                                Tissue Aliquot
                            </td>
                            <td className="text-left">
                                A sample of a sectioned solid tissue with a
                                pre-defined size, that is used for the
                                downstream sampling technique such as coring.
                            </td>
                        </tr>
                        <tr>
                            <td className="align-top text-left fw-bold">
                                Specimen
                            </td>
                            <td className="text-left">
                                A sample of a solid tissue without a pre-defined
                                size, that is neither a core nor homogenate.
                            </td>
                        </tr>
                        <tr>
                            <td className="align-top text-left fw-bold">
                                Core
                            </td>
                            <td className="text-left">
                                A core sample taken from the sectioned solid
                                tissue aliquot. Contains spatial information
                                within the tissue sample.
                            </td>
                        </tr>
                        <tr>
                            <td className="align-top text-left fw-bold">
                                Homogenate
                            </td>
                            <td className="text-left">
                                A sample of mechanically homogenized tissue that
                                can be divided into vials for distribution.
                                Applicable only to Benchmarking tissues.
                            </td>
                        </tr>
                        <tr>
                            <td className="align-top text-left fw-bold">
                                Liquid
                            </td>
                            <td className="text-left">
                                A sample of a liquid tissue (e.g. blood or
                                buccal swab).
                            </td>
                        </tr>
                        <tr>
                            <td className="align-top text-left fw-bold border-0">
                                Cells
                            </td>
                            <td className="text-left border-0">
                                A sample of cells derived from tissue (i.e.
                                Fibroblasts from skin).
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
        titlePopover: renderDescriptionPopover(),
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
 * @param {object} schemas the schemas for the exposure history
 * @returns
 */
const ExposureCard = ({ data, schemas }) => {
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
                    data-tip={schemas?.duration?.description}>
                    <span className="datum-title">
                        Duration <i className="icon icon-info-circle fas"></i>
                    </span>
                    <span className="datum-value">
                        {duration ? duration + ' yrs' : '--'}
                    </span>
                </div>
            </div>
            <div className="exposure-card-body">
                <div
                    className="datum"
                    data-tip={schemas?.frequency_category?.description}>
                    <span className="datum-title">
                        Frequency <i className="icon icon-info-circle fas"></i>
                    </span>
                    <span className="datum-value">
                        {frequency_category ?? '--'}
                    </span>
                </div>
                <div
                    className="datum"
                    data-tip={schemas?.quantity?.description}>
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
                    data-tip={schemas?.cessation?.description}>
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
    exposureHistorySchemaProperties = {},
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
                            schemas={exposureHistorySchemaProperties}
                        />
                        <ExposureCard
                            data={alcoholExposure ?? { category: 'Alcohol' }}
                            schemas={exposureHistorySchemaProperties}
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
