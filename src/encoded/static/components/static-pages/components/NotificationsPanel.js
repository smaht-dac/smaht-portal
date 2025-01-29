import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const announcements = [
    {
        type: 'info',
        title: 'New Features',
        body: (
            <span>
                Explore the <a href="/qc-metrics">Interactive QC Assessment</a>{' '}
                page for data on the portal.
            </span>
        ),
    },
    {
        type: 'warning',
        title: 'Attention Users',
        body: 'The V1 Benchmarking data portal will be open to SMaHT consortium members only at this time.',
    },
    {
        type: 'info',
        title: 'Data-related news',
        body: (
            <>
                <ul>
                    <li>
                        The raw sequence files, i.e. unaligned BAM and FASTQ,
                        and the data from the benchmarking tissue samples that
                        were not distributed by TPC will be available upon
                        request at this time (through Globus).
                    </li>
                    <li>
                        The SMaHT Data Portal, V1 Benchmarking release, now
                        makes benchmarking data available for download for
                        authenticated consortium members. Users can continue to
                        obtain the access keys for metadata submission.
                    </li>
                </ul>
            </>
        ),
    },
];

const AnnouncementCard = ({ title = '', body = '', type = 'info' }) => {
    return (
        <div className={`announcement-container ${type}`}>
            <h5 className="header">{title}</h5>
            <div className="body">{body}</div>
        </div>
    );
};

const DataReleaseItem = ({ data, releaseItemIndex }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const { count, items: sample_groups, query, value } = data;

    // Replace hyphens with slashes and add day field for Safari compatibility
    const date_formatted = value.replace(/-/g, '/') + '/01';
    const date = new Date(date_formatted);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.toLocaleString('default', { year: 'numeric' });

    return (
        <div
            className={`data-release-item-container ${
                isExpanded ? 'expanded' : 'collapsed'
            }`}>
            <div className="content">
                <div className="header">
                    <button
                        className="toggle-button"
                        onClick={() => {
                            setIsExpanded(!isExpanded);
                        }}>
                        <i
                            className={`icon icon-${
                                isExpanded ? 'minus' : 'plus'
                            }`}></i>
                    </button>
                    <a className="header-link" href={query}>
                        {releaseItemIndex === 0 ? (
                            <span>LATEST</span>
                        ) : (
                            <span>
                                {month} {year}
                            </span>
                        )}
                        <span className="count">
                            {count} {count > 1 ? 'Files' : 'File'}
                            <i className="icon icon-arrow-right"></i>
                        </span>
                    </a>
                </div>
                <div className="body">
                    {sample_groups.map((sample_group, i) => {
                        let sample_group_title = sample_group.value;

                        if (sample_group?.additional_value) {
                            sample_group_title += ` - ${
                                sample_group.additional_value?.split(':')[0]
                            }`;
                        }

                        return (
                            <div className="release-item" key={i}>
                                <a className="title" href={sample_group.query}>
                                    {sample_group_title}
                                    <svg
                                        width="22"
                                        height="16"
                                        viewBox="0 0 22 16"
                                        xmlns="http://www.w3.org/2000/svg">
                                        <path d="M1 7C0.447715 7 0 7.44772 0 8C0 8.55228 0.447715 9 1 9V7ZM21.7071 8.70711C22.0976 8.31658 22.0976 7.68342 21.7071 7.29289L15.3431 0.928932C14.9526 0.538408 14.3195 0.538408 13.9289 0.928932C13.5384 1.31946 13.5384 1.95262 13.9289 2.34315L19.5858 8L13.9289 13.6569C13.5384 14.0474 13.5384 14.6805 13.9289 15.0711C14.3195 15.4616 14.9526 15.4616 15.3431 15.0711L21.7071 8.70711ZM1 9H21V7H1V9Z" />
                                    </svg>
                                </a>
                                <ul>
                                    {sample_group.items.map((item, i) => {
                                        return (
                                            <li key={i}>
                                                <a href={item.query}>
                                                    {item.count} {item.value}
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const NotificationsPanel = () => {
    const [data, setData] = useState(
        {
            count: 175,
            items: [
                {
                    name: 'date_created',
                    value: '2024-07',
                    count: 1,
                    items: [
                        {
                            name: 'donors.display_title',
                            value: 'DAC_DONOR_COLO829',
                            count: 1,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-07-01&date_created.to=2024-07-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-07-01&date_created.to=2024-07-31&donors.display_title=DAC_DONOR_COLO829',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-07-01&date_created.to=2024-07-31',
                },
                {
                    name: 'date_created',
                    value: '2024-06',
                    count: 32,
                    items: [
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST003-1Q',
                            count: 8,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 7,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                            ],
                            additional_value: 'Brain: Frontal lobe, cortex',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST004-1Q',
                            count: 8,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 7,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                            ],
                            additional_value: 'Brain: Frontal lobe, cortex',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST002-1G',
                            count: 5,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                            ],
                            additional_value:
                                'Colon: Halfway between hepatic flexure and cecum. Anterior anti-mesenteric side',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST001-1D',
                            count: 4,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                            ],
                            additional_value:
                                'Lung: Inferior segment of left upper lobe',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST002-1D',
                            count: 4,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                            ],
                            additional_value:
                                'Lung: Inferior segment of left upper lobe',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST001-1A',
                            count: 2,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                            ],
                            additional_value:
                                'Liver: Central right lobe, 1 cm below capsule.',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'COLO829BLT50',
                            count: 1,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30',
                },
                {
                    name: 'date_created',
                    value: '2024-05',
                    count: 60,
                    items: [
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST001-1A',
                            count: 15,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS PacBio Revio bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 3,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            additional_value:
                                'Liver: Central right lobe, 1 cm below capsule.',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST001-1D',
                            count: 15,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS PacBio Revio bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 3,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            additional_value:
                                'Lung: Inferior segment of left upper lobe',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST002-1D',
                            count: 15,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS PacBio Revio bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 3,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            additional_value:
                                'Lung: Inferior segment of left upper lobe',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST002-1G',
                            count: 10,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 3,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 3,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            additional_value:
                                'Colon: Halfway between hepatic flexure and cecum. Anterior anti-mesenteric side',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'COLO829BLT50',
                            count: 3,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 2,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'ST004-1Q',
                            count: 2,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 2,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                            ],
                            additional_value: 'Brain: Frontal lobe, cortex',
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31',
                },
                {
                    name: 'date_created',
                    value: '2024-04',
                    count: 67,
                    items: [
                        {
                            name: 'donors.display_title',
                            value: 'DAC_DONOR_COLO829',
                            count: 27,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 27,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'COLO829BLT50',
                            count: 23,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS PacBio Revio bam',
                                    count: 8,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 7,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'HAPMAP6',
                            count: 17,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 5,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X Plus bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS PacBio Revio bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS+PacBio+Revio+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30',
                },
                {
                    name: 'date_created',
                    value: '2024-03',
                    count: 10,
                    items: [
                        {
                            name: 'donors.display_title',
                            value: 'DAC_DONOR_COLO829',
                            count: 9,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'Ultra-Long WGS ONT PromethION 24 bam',
                                    count: 4,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Ultra-Long+WGS+ONT+PromethION+24+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 2,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS ONT PromethION 24 bam',
                                    count: 2,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+ONT+PromethION+24+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'WGS Illumina NovaSeq X bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+Illumina+NovaSeq+X+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'HAPMAP6',
                            count: 1,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31',
                },
                {
                    name: 'date_created',
                    value: '2024-01',
                    count: 5,
                    items: [
                        {
                            name: 'donors.display_title',
                            value: 'DAC_DONOR_COLO829',
                            count: 4,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 3,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-01-01&date_created.to=2024-01-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                                {
                                    name: 'release_tracker_description',
                                    value: 'Hi-C Illumina NovaSeq 6000 bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-01-01&date_created.to=2024-01-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Hi-C+Illumina+NovaSeq+6000+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-01-01&date_created.to=2024-01-31&donors.display_title=DAC_DONOR_COLO829',
                        },
                        {
                            name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                            value: 'COLO829BLT50',
                            count: 1,
                            items: [
                                {
                                    name: 'release_tracker_description',
                                    value: 'Fiber-seq PacBio Revio bam',
                                    count: 1,
                                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-01-01&date_created.to=2024-01-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                                },
                            ],
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-01-01&date_created.to=2024-01-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-01-01&date_created.to=2024-01-31',
                },
            ],
            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2023-07-01&date_created.to=2025-01-31',
        }.items
    );

    // useEffect(() => {
    //     ajax.load(
    //         '/recent_files_summary?format=json&date_property_name=date_created&nmonths=18',
    //         (resp) => {
    //             setData(resp?.items ?? null);
    //         },
    //         'GET',
    //         (err) => {
    //             if (err.notification !== 'No results found') {
    //                 console.log('ERROR NotificationsPanel resp', err);
    //             }
    //         }
    //     );
    // }, []);

    return (
        <div className="notifications-panel container">
            <div className="data-release-tracker section">
                <h3 className="section-header">Data Release Tracker</h3>
                <div className="section-body-container">
                    <div className="section-body">
                        <div className="section-body-items-container">
                            {data ? (
                                data.map((releaseItem, i) => {
                                    return (
                                        <DataReleaseItem
                                            data={releaseItem}
                                            key={i}
                                            releaseItemIndex={i}
                                        />
                                    );
                                })
                            ) : (
                                <i className="icon fas icon-spinner icon-spin"></i>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <div className="announcements section">
                <h3 className="section-header">Announcements</h3>
                <div className="section-body-container">
                    <div className="section-body">
                        {announcements.map((announcement, i) => {
                            return (
                                <AnnouncementCard
                                    key={i}
                                    title={announcement.title}
                                    body={announcement.body}
                                    type={announcement.type}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="about-consortium section">
                <h3 className="section-header">Data Overview</h3>
                <div className="section-body">
                    <div className="about-consortium-links">
                        <div className="link-container smaht-data">
                            <a
                                href="/about/consortium/data"
                                role="button"
                                className="btn">
                                <img src="/static/img/homepage-smaht-data-screenshot.png"></img>
                                <span>Sequencing Methods in SMaHT</span>
                            </a>
                        </div>
                        <div className="link-container nih">
                            <a
                                href="https://commonfund.nih.gov/smaht"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="btn">
                                <img src="/static/img/NIH-Symbol.png"></img>
                                <span>& SMaHT</span>
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                            <a
                                href="https://smaht.org/"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="btn">
                                <span>SMaHT OC</span>
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
