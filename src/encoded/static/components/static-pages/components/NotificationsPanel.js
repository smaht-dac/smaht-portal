import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { release } from 'process';

const announcements = [
    {
        type: 'info',
        title: 'Note',
        body: 'The raw sequence files, i.e. unaligned BAM and FASTQ, and the data from the benchmarking tissue samples that were not distributed by TPC will be available upon request at this time (through Globus).',
    },
    {
        type: 'feature',
        title: 'New Features',
        body: 'The SMaHT Data Portal, V1 Benchmarking release, now makes benchmarking data available for download for authenticated consortium members. Users can continue to obtain the access keys for metadata submission.',
    },
    {
        type: 'warning',
        title: 'Attention Users',
        body: 'The V1 Benchmarking data portal will be open to SMaHT consortium members only at this time.',
    },
];

const AnnouncementCard = ({ title = '', body = '', type = 'info' }) => {
    return (
        <div className={`announcement-container ${type}`}>
            <h5 className="header">{title}</h5>
            <p className="body">{body}</p>
        </div>
    );
};

const DataReleaseItem = ({ data, releaseItemIndex }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const { count, items: sample_groups, query, value } = data;

    // Replace hyphens with slashes for Safari compatibility
    const date = new Date(value.replace(/-/g, '/'));
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
                        <i className="icon icon-circle"></i>
                    </button>
                    <a className="header-link" href={query}>
                        <span>
                            {releaseItemIndex === 0 ? 'New Release: ' : ''}
                            {month} {year}
                        </span>
                        <span className="count">
                            {count} {count > 1 ? 'Files' : 'File'}
                        </span>
                    </a>
                </div>
                <div className="body">
                    {sample_groups.map((sample_group, i) => {
                        return (
                            <div className="release-item" key={i}>
                                <a className="title" href={sample_group.query}>
                                    {sample_group.value}
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
    const [data, setData] = useState(exampleData?.items ?? null);
    console.log('data', data);

    // useEffect(() => {
    //     ajax.load(
    //         '/recent_files_summary?format=json&nmonths=8',
    //         (resp) => {
    //             console.log('resp', resp);
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
                <div className="section-body">
                    {data.map((releaseItem, i) => {
                        return (
                            <DataReleaseItem
                                data={releaseItem}
                                key={i}
                                releaseItemIndex={i}
                            />
                        );
                    })}
                </div>
            </div>
            <div className="announcements section">
                <h3 className="section-header">Announcements</h3>
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
            <div className="about-consortium section">
                <h3 className="section-header">About the Consortium</h3>
                <div className="section-body">
                    <div className="about-consortium-links">
                        <div className="link-container">
                            <a
                                href="/about/consortium/data"
                                role="button"
                                className="py-2 btn">
                                <span>SMaHT Data Overview</span>
                                <i className="icon-external-link-alt icon text-xs fas ml-2" />
                            </a>
                        </div>
                        <div className="link-container">
                            <a
                                href="https://www.smaht.org"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                <span>SMaHT OC Homepage</span>
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                        <div className="link-container">
                            <a
                                href="https://commonfund.nih.gov/smaht"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                <span>NIH SMaHT Homepage</span>
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const exampleData = {
    count: 166,
    items: [
        {
            name: 'file_status_tracking.released',
            value: '2024-07',
            count: 39,
            items: [
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST001-1A',
                    count: 9,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST002-1D',
                    count: 9,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST001-1D',
                    count: 8,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST002-1G',
                    count: 7,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST004-1Q',
                    count: 6,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 2,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q',
                },
            ],
            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-07-01&file_status_tracking.released.to=2024-07-31',
        },
        {
            name: 'file_status_tracking.released',
            value: '2024-06',
            count: 48,
            items: [
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST001-1D',
                    count: 11,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST002-1D',
                    count: 10,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST001-1A',
                    count: 8,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'Fiber-seq PacBio Revio bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST002-1G',
                    count: 7,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST003-1Q',
                    count: 4,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'Fiber-seq PacBio Revio bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'ST004-1Q',
                    count: 4,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'Fiber-seq PacBio Revio bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'HAPMAP6',
                    count: 3,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 3,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'COLO829BLT50',
                    count: 1,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                },
            ],
            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-06-01&file_status_tracking.released.to=2024-06-30',
        },
        {
            name: 'file_status_tracking.released',
            value: '2024-05',
            count: 74,
            items: [
                {
                    name: 'donors.display_title',
                    value: 'DAC_DONOR_COLO829',
                    count: 28,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 28,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&donors.display_title=DAC_DONOR_COLO829',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'COLO829BLT50',
                    count: 26,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 9,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 8,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 5,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                },
                {
                    name: 'file_sets.libraries.analytes.samples.sample_sources.code',
                    value: 'HAPMAP6',
                    count: 20,
                    items: [
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X bam',
                            count: 8,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free Illumina NovaSeq X Plus bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS%2C+PCR-free+Illumina+NovaSeq+X+Plus+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free ONT PromethION 24 bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS%2C+PCR-free+ONT+PromethION+24+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'WGS, PCR-free PacBio Revio bam',
                            count: 4,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS%2C+PCR-free+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6',
                },
            ],
            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-05-01&file_status_tracking.released.to=2024-05-31',
        },
        {
            name: 'file_status_tracking.released',
            value: '2024-04',
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
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                        },
                        {
                            name: 'release_tracker_description',
                            value: 'Hi-C Illumina NovaSeq 6000 bam',
                            count: 1,
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Hi-C+Illumina+NovaSeq+6000+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829',
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
                            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=Fiber-seq+PacBio+Revio+bam',
                        },
                    ],
                    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-04-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50',
                },
            ],
            query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-04-30',
        },
    ],
    query: '/search/?type=OutputFile&status=released&data_category%21=Quality+Control&file_status_tracking.released.from=2024-04-01&file_status_tracking.released.to=2024-12-31',
};
