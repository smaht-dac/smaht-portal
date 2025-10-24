import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { RightArrowIcon } from '../../util/icon';

const announcements = [
    {
        type: 'info',
        title: 'Attention: BAM change',
        date: '2025-07-23',
        body: (
            <span>
                As of July 8, 2025, DAC will release BAM files without the BI
                and BD tags, which were originally added after base quality
                recalibration (BQSR).
            </span>
        ),
    },
    {
        type: 'warning',
        title: 'Data Retraction',
        date: '2025-03-10',
        body: (
            <span>
                One WGS ONT PromethION 24 BAM from COLO829-BLT50,{' '}
                <a href="/output-files/beca52fb-ad5b-4eaa-832a-2929c7bf7577/">
                    SMAFIPHR8QOG
                </a>
                , has been retracted due to sample swap.
            </span>
        ),
        footer: (
            <span>
                <a href="/retracted-files">
                    See Full List
                    <RightArrowIcon />
                </a>
            </span>
        ),
    },
    {
        type: 'info',
        title: 'New Features',
        date: '2025-01-25',
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

const AnnouncementCard = ({
    title = '',
    body = '',
    footer = null,
    type = 'info',
    date = null,
}) => {
    return (
        <div className={`announcement-container ${type}`}>
            <h5 className="header">
                {title}
                {date ? (
                    <LocalizedTime
                        timestamp={new Date(date)}
                        formatType="date-sm-compact"
                    />
                ) : null}
            </h5>
            <div className="body">{body}</div>
            {footer ? <div className="footer">{footer}</div> : null}
        </div>
    );
};

// Warning to include in the data release item for September 2025
const ReleaseItemWarning = () => {
    return (
        <div className="announcement-container cram-conversion">
            <div className="header">
                <i className="icon fas icon-database"></i>
                <span>CRAM CONVERSION</span>
            </div>
            <div className="body">
                As of September 15, 2025, all released BAMs have been converted
                to CRAMs for optimal file storage at the DAC. The data release
                tracker will start to announce new CRAMs as they are released.
            </div>
        </div>
    );
};

const DataReleaseItem = ({ data, callout = null }) => {
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
                    <a className="header-link" href={count > 0 ? query : null}>
                        <span>
                            {month} {year}
                        </span>
                        {count > 0 ? (
                            <span className="count">
                                {count} {count > 1 ? 'Files' : 'File'}
                                <i className="icon icon-arrow-right"></i>
                            </span>
                        ) : null}
                    </a>
                </div>
                <div className="body">
                    {callout ? <div className="callout">{callout}</div> : null}
                    {sample_groups.map((sample_group, i) => {
                        let sample_group_title = sample_group.value;

                        if (sample_group_title?.includes('DAC_DONOR_')) {
                            sample_group_title = sample_group_title.replace(
                                'DAC_DONOR_',
                                ''
                            );
                        }

                        const sample_group_type =
                            sample_group?.items?.[0]?.['additional_value'];

                        if (sample_group_type) {
                            sample_group_title += ` - ${sample_group_type}`;
                        }

                        return (
                            <div className="release-item" key={i}>
                                <a className="title" href={sample_group.query}>
                                    {sample_group_title}
                                    <RightArrowIcon />
                                </a>
                                <ul>
                                    {sample_group.items.map((item, i) => {
                                        const { value, count, query } = item;
                                        return (
                                            <li key={i}>
                                                <a href={query}>
                                                    {count} {value}
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
    const [data, setData] = useState(null);

    // useEffect(() => {
    //     ajax.load(
    //         '/recent_files_summary?format=json&nmonths=3',
    //         (resp) => {
    //             setData(resp?.items ?? []);
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
                            <ReleaseItemWarning />
                            {/* {data === null ? (
                                <i className="icon fas icon-spinner icon-spin"></i>
                            ) : data.length === 0 ? (
                                <DataReleaseItem
                                    data={{
                                        name: 'file_status_tracking.release_dates.initial_release',
                                        value: '2025-09',
                                        count: 0,
                                        items: [],
                                        query: '',
                                    }}
                                    callout={<ReleaseItemWarning />}
                                />
                            ) : (
                                data.map((releaseItem, i) => {
                                    return releaseItem?.value === '2025-09' ? (
                                        <DataReleaseItem
                                            data={releaseItem}
                                            key={i}
                                            callout={<ReleaseItemWarning />}
                                        />
                                    ) : (
                                        <DataReleaseItem
                                            data={releaseItem}
                                            key={i}
                                        />
                                    );
                                })
                            )} */}
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
                                    footer={announcement.footer}
                                    type={announcement.type}
                                    date={announcement.date}
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
