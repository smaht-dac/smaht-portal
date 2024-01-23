'use strict';

import React from 'react';

import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';

const originalColExtMap =
    EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

/**
 * A column extension map speifically for benchmarking tables.
 */
export const benchmarkingColExtMap = {
    ...originalColExtMap, // Pull in defaults for all tables
    // Then overwrite or add onto the ones that already are there:
    'file_format.display_title': {
        widthMap: { lg: 200, md: 200, sm: 180 },
        // render: function (result, parentProps) {
        //     const { context, rowNumber, detailOpen, toggleDetailOpen } =
        //         parentProps;
        //     return <span className="value text-right">Hello!</span>;
        //     // <VariantSampleDisplayTitleColumnWrapper {...{ result, context, rowNumber, detailOpen, toggleDetailOpen }}>
        //     //     <VariantSampleDisplayTitleColumn />
        //     // </VariantSampleDisplayTitleColumnWrapper>
        // },
    },
    data_type: {},
    'submission_centers.display_title': {},
    file_size: {},
    date_created: {},
};
