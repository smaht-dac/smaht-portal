'use strict';

import React from 'react';

import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';

import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';

const originalColExtMap =
    EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

/**
 * A column extension map speifically for benchmarking tables.
 * Some of these things may be worth moving to the global colextmap eventually.
 */
export const benchmarkingColExtMap = {
    ...originalColExtMap, // Pull in defaults for all tables
    // Then overwrite or add onto the ones that already are there:
    // File Format
    'file_format.display_title': {
        colTitle: 'Format',
        widthMap: { lg: 100, md: 90, sm: 80 },
        render: function (result, parentProps) {
            const value = result?.file_format?.display_title;
            if (!value) return null;
            return (
                <LeftAlignedRow cls="text-uppercase">{value}</LeftAlignedRow>
            );
        },
    },
    // Data Category
    data_type: {
        colTitle: 'Data Category',
        render: function (result, parentProps) {
            const value = result?.data_type;
            if (!value) return null;
            return <LeftAlignedRow>{value}</LeftAlignedRow>;
        },
    },
    // Center
    'submission_centers.display_title': {
        colTitle: 'Center',
        render: function (result, parentProps) {
            const { submission_centers: gccs = [] } = result || {};
            if (gccs.length === 0) return null;
            return (
                <LeftAlignedRow>
                    {gccs.map((gcc) => gcc.display_title).join(', ')}
                </LeftAlignedRow>
            );
        },
    },
    // File Size
    file_size: {
        // TODO
    },
    // Submission Date
    date_created: {
        widthMap: { lg: 180, md: 160, sm: 140 },
        render: function (result, parentProps) {
            const value = result?.date_created;
            if (!value) return null;
            return (
                <RightAlignedRow>
                    <LocalizedTime timestamp={value} formatType="date-file" />
                </RightAlignedRow>
            );
        },
    },
    // TODO: (Need schema updates for the following...)
    // Access
    // Assay
    // Platform
    // Method
};

function LeftAlignedRow({ children, cls }) {
    return <span className={`value text-left ${cls || ''}`}>{children}</span>;
}

function RightAlignedRow({ children, cls }) {
    return (
        <span className={`value text-right pr-4 ${cls || ''}`}>{children}</span>
    );
}
