'use strict';

import React, { useState, useEffect } from 'react';
import { DataCardRow } from '../file-overview/FileViewDataCards';
import { OverlayTrigger, Popover, PopoverBody } from 'react-bootstrap';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from '../../../browse/BrowseView';

/**
 * Bootstrap Popover element for the description field in the sample information
 * data card. Contains a table with definitions for the terms used in the
 * description field.
 * @param {function} handleShowPopover - function to handle popover visibility
 * @param {string} customId - custom id for popover
 * @returns {JSX.Element} Popover component with term definitions
 *
 * Note: Use regular function here, as Bootstrap relies on `this`.
 */
export function renderHardyScaleDescriptionPopover(
    handleShowPopover,
    customId
) {
    return (
        <Popover
            id={customId ?? 'description-definitions-popover-hardy'}
            className="w-auto description-definitions-popover"
            onMouseEnter={() =>
                handleShowPopover ? handleShowPopover(true) : null
            }
            onMouseLeave={() =>
                handleShowPopover ? handleShowPopover(false) : null
            }>
            <PopoverBody className="p-0">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="text-left px-4" colSpan={2}>
                                Hardy Scale - Death Classification
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="w-100">
                            <td
                                className="fw-light text-left px-4 py-3"
                                colSpan={2}>
                                The Hardy scale is a way to provide standardized
                                information about a donor's death processes
                                without providing specific (potentially
                                identifiable) information about the cause or
                                manner of death. <br />
                                <i>The definition of each score is below:</i>
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center index-cell">
                                0
                            </td>
                            <td className="text-left">
                                <b>Ventilator Case.</b> All cases on a
                                ventilator immediately before death.
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center index-cell">
                                1
                            </td>
                            <td className="text-left">
                                <b>Violent and fast death.</b> Deaths due to
                                accident, blunt force trauma or suicide, with
                                death occurring in less than 10 minutes.
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center index-cell">
                                2
                            </td>
                            <td className="text-left">
                                <b>Fast death of natural causes.</b> Sudden
                                unexpected deaths of people who had been
                                reasonably healthy, with death occurring in less
                                than 1 hour (for example a heart attack).
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center index-cell">
                                3
                            </td>
                            <td className="text-left">
                                <b>Intermediate death.</b> Intermediate time
                                frame of death, taking 1 to 24 hours (not
                                classifiable as 2 or 4); this category also
                                includes patients who were ill but death was
                                unexpected.
                            </td>
                        </tr>
                        <tr>
                            <td className="fs-5 align-middle text-center index-cell">
                                4
                            </td>
                            <td className="text-left">
                                <b>Slow death.</b> Slow death after a long
                                illness, with death taking longer than 1 day
                                (commonly cancer or chronic lung disease);
                                deaths that are not unexpected.
                            </td>
                        </tr>
                        <tr colSpan={2}>
                            <td
                                className="text-left w-100 px-4 py-3 footnote-cell"
                                colSpan={2}>
                                For more information, please see Hardy, J. et.
                                al. (1985) J. Neural Transm.{' '}
                                <a
                                    href="https://pubmed.ncbi.nlm.nih.gov/3989524/"
                                    target="_blank"
                                    rel="noreferrer noopener">
                                    PubMed
                                    <i className="icon icon-external-link"></i>
                                </a>
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

/**
 * A card component that displays exposure data for a donor. It shows the
 * category, duration, frequency, and cessation information.
 * @param {object} data the exposure data object containing information on the exposure
 * @returns
 */
const ExposureCard = ({ data, popover }) => {
    const {
        category,
        duration,
        frequency_category,
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
 * Checks if donor has DSA files and returns a link to browse the DSA files if
 * available or "Coming Soon" if not. Shows a loading indicator during check.
 * @param {*} props
 * @returns {JSX.Element} Link to browse DSA files if available
 */
const DonorDSAValue = ({ donorId }) => {
    const [link, setLink] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        if (!link) {
            // peek metadata to see if there are any DSA fields
            const searchQuery = `?data_type=DSA&data_type=Chain+File&data_type=Sequence+Interval&dataset%21=No+value&donors.display_title=${donorId}&sample_summary.studies=Production&${BROWSE_STATUS_FILTERS}&type=File`;
            ajax.load(
                '/peek-metadata/' + searchQuery,
                (resp) => {
                    if (cancelled) return;
                    // Check that some files are present in the metadata
                    if (
                        resp
                            ?.find((f) => f.field === 'type')
                            ?.terms.find((t) => t.key === 'File')?.doc_count > 0
                    ) {
                        setIsLoading(false);
                        setLink('/browse/' + searchQuery);
                    } else {
                        // No DSA files found
                        setIsLoading(false);
                    }
                },
                'GET',
                (err) => {
                    setIsLoading(false);
                    console.error(resp.error);
                }
            );
        }

        return () => {
            cancelled = true;
        };
    }, []);

    if (isLoading) {
        return <i className="icon icon-spin icon-circle-notch fas" />;
    }

    return link ? (
        <span>
            <a href={link} target="_blank">
                Available
            </a>
        </span>
    ) : (
        <span className="text-disabled">Coming soon</span>
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
                                        title={'Bulk WGS Coverage'}
                                        value={'Coming soon'}
                                    />
                                    <DataCardRow
                                        title={'DSA'}
                                        value={
                                            <DonorDSAValue
                                                donorId={context?.external_id}
                                            />
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
