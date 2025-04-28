'use strict';

import React from 'react';
import {
    bytesToLargerUnit,
    capitalize,
    capitalizeSentence,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util/value-transforms';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';

import {
    OverlayTrigger,
    Popover,
    PopoverHeader,
    PopoverBody,
} from 'react-bootstrap';

/**
 * Renders a card titled `header` and rows corresponding with entries in `data`.
 * @param {string} header title for the group of data contained in the card
 * @param {Array} data array of objects containing a field's title and value
 */
const DataCard = ({ header = '', data = [] }) => {
    return (
        <div className="data-card">
            <div className="header">
                <span className="header-text">{header}</span>
            </div>
            <div className="body">
                {data.map(({ title, value = null, titlePopover = null }, i) => {
                    return (
                        <div className="datum" key={i}>
                            <div className="datum-title">
                                <span>{title}</span>
                                {titlePopover && (
                                    <OverlayTrigger
                                        trigger={['hover', 'focus']}
                                        overlay={titlePopover}
                                        placement="left"
                                        flip={true}
                                        popperConfig={{
                                            modifiers: [
                                                {
                                                    name: 'flip',
                                                    options: {
                                                        fallbackPlacements: [
                                                            'right',
                                                            'bottom',
                                                            'top',
                                                        ],
                                                    },
                                                },
                                            ],
                                        }}>
                                        <i className="icon icon-info-circle fas ms-1"></i>
                                    </OverlayTrigger>
                                )}
                            </div>
                            <div
                                className={
                                    'datum-value' +
                                    (value === null ? ' coming-soon' : '')
                                }>
                                {value ?? 'N/A'}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

/**
 * Below are arrays of file property objects with `title` and `getProp`, a
 * function for extracting the property's value (if available) from `context`.
 * Used to populate the data cards in the FileViewDataCards component.
 */
const default_file_properties = [
    {
        title: 'Status',
        getProp: (context = {}) => (
            <>
                <i
                    className="status-indicator-dot me-07"
                    data-status={context?.status}
                />
                {capitalizeSentence(context?.status)}
            </>
        ),
    },
    {
        title: 'Annotated Name',
        getProp: (context = {}) =>
            context?.annotated_filename ?? context?.filename,
    },
    { title: 'Access', getProp: (context = {}) => context?.access_status },
    { title: 'UUID', getProp: (context = {}) => context?.uuid },
    {
        title: 'Data Format',
        getProp: (context = {}) => context?.file_format?.display_title,
    },
    {
        title: 'Size',
        getProp: (context = {}) => {
            const fileSize = context?.file_summary?.file_size;
            if (fileSize) {
                return bytesToLargerUnit(fileSize);
            } else {
                return null;
            }
        },
    },
    {
        title: 'MD5 Checksum',
        getProp: (context = {}) => context?.content_md5sum || context?.md5sum,
    },
    {
        title: 'Public Release Date',
        getProp: (context = {}) => {
            return context?.file_status_tracking?.released ? (
                <LocalizedTime
                    timestamp={context?.file_status_tracking.released}
                    formatType="date-md"
                    dateTimeSeparator=" "
                />
            ) : null;
        },
    },
];
const default_data_information = [
    {
        title: 'Data Category',
        getProp: (context = {}) =>
            context?.data_generation_summary?.data_category?.join(', '),
    },
    {
        title: 'Data Type',
        getProp: (context = {}) =>
            context?.data_generation_summary?.data_type?.join(', '),
    },
    {
        title: 'Sequencing Center',
        getProp: (context = {}) =>
            context?.data_generation_summary?.sequencing_center,
    },
    {
        title: 'Generated By',
        getProp: (context = {}) =>
            context?.data_generation_summary?.submission_centers?.join(', '),
    },
    {
        title: 'Experimental Assay',
        getProp: (context = {}) =>
            context?.data_generation_summary?.assays?.join(', '),
    },
    {
        title: 'Sequencing Platform',
        getProp: (context = {}) =>
            context?.data_generation_summary?.sequencing_platforms?.join(', '),
    },
    {
        title: 'Dataset Target Coverage',
        getProp: (context = {}) => {
            if (
                context?.file_format?.display_title === 'bam' &&
                context?.data_type.some((d) => d === 'Aligned Reads') &&
                context?.data_generation_summary?.assays?.some(
                    (assay) =>
                        assay.includes('WGS') ||
                        assay.includes('Fiber-seq') ||
                        assay.includes('Hi-C')
                )
            ) {
                const cov =
                    context?.data_generation_summary?.target_group_coverage;
                if (cov && cov.length > 0) {
                    return cov[0] + 'X';
                }
            }
            return null;
        },
    },
    {
        title: 'Dataset Target Read Count',
        getProp: (context = {}) => {
            if (
                context?.file_format?.display_title === 'bam' &&
                context?.data_type.some((d) => d === 'Aligned Reads') &&
                context?.data_generation_summary?.assays?.some(
                    (assay) =>
                        assay.includes('RNA-Seq') ||
                        assay.includes('MAS-ISO-Seq')
                )
            ) {
                const count =
                    context?.data_generation_summary?.target_read_count;
                if (count && count.length > 0) {
                    return count[0];
                }
            }
            return null;
        },
    },
];

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
                            <td className="align-top text-left fw-bold">
                                Aliquot
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

const default_sample_information = [
    {
        title: 'Description',
        getProp: (context = {}) =>
            context?.sample_summary?.sample_descriptions?.join(', '),
        titlePopover: renderDescriptionPopover(),
    },
    {
        title: 'Study',
        getProp: (context = {}) => context?.sample_summary?.studies?.join(', '),
    },
    {
        title: 'Donor ID',
        getProp: (context = {}) =>
            context?.sample_summary?.donor_ids?.join(', '),
    },
    {
        title: 'Tissue Type',
        getProp: (context = {}) => context?.sample_summary?.tissues?.join(', '),
    },
    {
        title: 'Tissue Subtype',
        getProp: (context = {}) => {
            // Show if different from tissue type
            const tissue_type = context?.sample_summary?.tissues
                ?.join(', ')
                ?.toLowerCase();
            const tissue_subtype = context?.sample_summary?.tissue_subtypes
                ?.join(', ')
                ?.toLowerCase();

            return tissue_subtype && tissue_subtype !== tissue_type
                ? capitalize(tissue_subtype)
                : null;
        },
    },
    {
        title: 'Tissue Details',
        getProp: (context = {}) => {
            // Show if different from tissue type AND tissue details
            const tissue_type = context?.sample_summary?.tissues
                ?.join(', ')
                ?.toLowerCase();
            const tissue_subtype = context?.sample_summary?.tissue_subtypes
                ?.join(', ')
                .toLowerCase();
            const tissue_details = context?.sample_summary?.tissue_details
                ?.join(', ')
                ?.toLowerCase();

            return tissue_details &&
                tissue_details !== tissue_type &&
                tissue_details !== tissue_subtype
                ? capitalize(tissue_details)
                : null;
        },
    },
    {
        title: 'Analyte',
        getProp: (context = {}) =>
            context?.sample_summary?.analytes?.join(', '),
    },
];

/**
 * Parent component for the data cards containing information on the file.
 * @param {object} context the context of the item being viewed
 */
export const FileViewDataCards = ({ context = {} }) => {
    let file_properties = default_file_properties;
    let data_information = default_data_information;
    let sample_information = default_sample_information;

    return (
        <div className="data-cards-container">
            <DataCard
                header={'File Properties'}
                data={file_properties.map(({ title, getProp }) => {
                    return { title, value: getProp(context) };
                })}
            />
            <DataCard
                header={'Data Information'}
                data={data_information.map(({ title, getProp }) => {
                    return { title, value: getProp(context) };
                })}
            />
            <DataCard
                header={'Sample Information'}
                data={sample_information.map(
                    ({ title, getProp, titlePopover }) => {
                        return {
                            title,
                            value: getProp(context),
                            titlePopover,
                        };
                    }
                )}
            />
        </div>
    );
};
