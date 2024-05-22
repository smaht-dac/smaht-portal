import React from 'react';
import { EmbeddedItemSearchTable } from '../EmbeddedItemSearchTable';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { valueTransforms } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const FileOverviewTable = (props) => {
    console.log('file overview table PROPS:', props);

    const {
        schemas,
        session,
        associatedFilesSearchHref = '',
        embeddedTableHeader = '',
    } = props;

    // Some fields overriden in BenchmarkingTable component
    const originalColExtMap =
        EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

    const FileOverviewcolExtMap = {
        // File Name
        annotated_filename: {
            widthMap: { lg: 500, md: 400, sm: 300 },
            colTitle: 'File Name',
            render: function (result) {
                const {
                    '@id': atId,
                    display_title,
                    annotated_filename,
                } = result || {};

                return (
                    <span className="value">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener">
                            {annotated_filename || display_title}
                        </a>
                    </span>
                );
            },
            noSort: true,
        },

        // Pipeline
        'software.display_title': {
            widthMap: { lg: 200, md: 150, sm: 130 },
            colTitle: 'Pipeline',
            render: function (result) {
                const value = result?.software;
                return value ? (
                    <span className="value">
                        {result.software.map((s) => s.display_title).join(', ')}
                    </span>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
        // Version
        'software.version': {
            widthMap: { lg: 130, md: 120, sm: 130 },
            colTitle: 'Version',
            render: function (result) {
                return result?.software?.length > 0 ? (
                    <span className="value">
                        {result.software.map((s) => s.version).join(', ')}
                    </span>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
        // Status
        status: {
            widthMap: { lg: 120, md: 120, sm: 100 },
            colTitle: 'Status',
            render: function (result, parentProps) {
                const value = result?.status;
                if (!value) return null;
                return (
                    <span className="value">
                        {value.charAt(0).toUpperCase() + value.slice(1)}
                    </span>
                );
            },
            noSort: true,
        },
        // Release Date
        release_date: {
            widthMap: { lg: 180, md: 160, sm: 140 },
            colTitle: 'Release Date',
            render: function (result) {
                const value = result?.file_status_tracking?.released;
                return value ? (
                    <span className="value">
                        <LocalizedTime
                            timestamp={value}
                            formatType="date-file"
                        />
                    </span>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
        // File Size
        file_size: {
            widthMap: { lg: 140, md: 100, sm: 100 },
            colTitle: 'Size',
            render: function (result, parentProps) {
                const value = result?.file_size;
                if (!value) return null;
                return (
                    <span className="value">
                        {valueTransforms.bytesToLargerUnit(value)}
                    </span>
                );
            },
            noSort: true,
        },
        // Download Button
        href: {
            widthMap: { lg: 100, md: 100, sm: 100 },
            colTitle: <span>Download</span>,
            render: function (result, parentProps) {
                const value = result?.href;
                return value ? (
                    <a
                        href={value}
                        className="download-button"
                        target="_blank"
                        rel="noreferrer noopener"
                        download>
                        <i className="icon icon-download fas"></i>
                    </a>
                ) : (
                    <small className="value">-</small>
                );
            },
            noSort: true,
        },
    };

    return (
        <EmbeddedItemSearchTable
            key={session}
            embeddedTableHeader={
                <h1 className="header">{embeddedTableHeader}</h1>
            }
            rowHeight={31}
            // maxHeight={200}
            {...{
                searchHref: associatedFilesSearchHref,
                schemas,
                session,
            }}
            facets={null}
            columnExtensionMap={FileOverviewcolExtMap}
            hideColumns={[
                'display_title',
                '@type',
                'access_status',
                'data_type',
                'file_sets.sequencing.sequencer.display_title',
                'file_format.display_title',
                'submission_centers.display_title',
                'file_sets.libraries.assay.display_title',
                'sequencing_center.display_title',
            ]}
            columns={{
                annotated_filename: {},
                'software.display_title': {},
                'software.version': {},
                status: {},
                release_date: {},
                file_size: {},
                href: {},
            }}
        />
    );
};

const BenchmarkingTable = (props) => {
    /**
     * A column extension map speifically for benchmarking tables.
     * Some of these things may be worth moving to the global colextmap eventually.
     */
};
