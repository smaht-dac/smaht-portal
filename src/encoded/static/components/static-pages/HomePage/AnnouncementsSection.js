import React from 'react';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { RightArrowIcon } from '../../util/icon';

// Default announcement data
const announcements = [
    {
        type: 'warning',
        title: 'Data Retraction',
        date: '2025-12-11',
        body: (
            <span>
                Illumina bulk WGS data were retracted for production donor
                samples; SMHT001-3A, SMHT005-3AF, SMHT007-3A, and SMHT022-3A,
                due to data duplication.
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

/**
 * AnnouncementCard component displays an individual announcement.
 * @param {string} type - The type of announcement (e.g., 'info', 'warning').
 * @param {string} title - The title of the announcement.
 * @param {JSX.Element} body - The body content of the announcement.
 * @param {JSX.Element|null} footer - Optional footer content for the announcement.
 * @param {JSX.Element|null} date - Optional date string for the announcement.
 * @returns {JSX.Element} The rendered AnnouncementCard component.
 */
const AnnouncementCard = ({
    type = 'info',
    title = '',
    body = '',
    footer = null,
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

/**
 * AnnouncementsSection component displays the announcements section.
 * @returns { JSX.Element } - The rendered AnnouncementsSection component.
 */
export const AnnouncementsSection = () => {
    return (
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
    );
};
