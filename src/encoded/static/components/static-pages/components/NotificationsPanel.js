import React from 'react';
import { Card } from 'react-bootstrap';

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

// const dataReleaseItems = [
//     {
//         header:
//     }
// ]

const DataReleaseItem = () => {
    return (
        <div className="data-release-item-container">
            <div className="content">
                <div className="header">
                    <span>New Release: August 1, 2024</span>
                    <span className="count">15 Files</span>
                </div>
                <div className="body">
                    <h6 className="title">COLO829T</h6>
                    <ul>
                        <li>10 Illumina Bulk WGS BAM files</li>
                    </ul>
                    <h6 className="title">Donor ST003 - Brain</h6>
                    <ul>
                        <li>5 Illumina Bulk WGS BAM files</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

const DataReleaseItem2 = () => {
    return (
        <div className="data-release-item-container">
            <div className="content">
                <div className="header">
                    <span>New Release: July 18, 2024</span>
                    <span className="count">15 Files</span>
                </div>
                <div className="body">
                    <h6 className="title">COLO829T</h6>
                    <ul>
                        <li>10 Illumina Bulk WGS BAM files</li>
                    </ul>
                    <h6 className="title">Donor ST003 - Brain</h6>
                    <ul>
                        <li>5 Illumina Bulk WGS BAM files</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export const NotificationsPanel = () => {
    return (
        <div className="notifications-panel container">
            <div className="data-release-tracker section">
                <h3 className="section-header">Data Release Tracker</h3>
                <div className="section-body">
                    <DataReleaseItem />
                    <DataReleaseItem2 />
                </div>
            </div>
            <div className="announcements section">
                <h3 className="section-header">Announcements</h3>
                <div className="section-body">
                    {announcements.map((announcement, index) => {
                        return (
                            <AnnouncementCard
                                title={announcement.title}
                                body={announcement.body}
                                type={announcement.type}
                            />
                        );
                    })}
                </div>
            </div>
            {/* <div className="about-consortium mb-3 section">
                <h3 className="section-header">About the Consortium</h3>
                <div className="section-body">
                    <div className="about-consortium-links">
                        <div className="link-container">
                            <a
                                href="https://commonfund.nih.gov/smaht"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                NIH SMaHT Homepage
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                        <div className="link-container">
                            <a
                                href="https://www.smaht.org"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                SMaHT OC Homepage
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                        <div className="link-container">
                            <a
                                href="https://www.youtube.com/watch?v=8KX3lkMB5nU"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                SMaHT Overview Video
                                <i className="icon-external-link-alt icon text-xs fas ml-2" />
                            </a>
                        </div>
                    </div>
                </div>
            </div> */}
        </div>
    );
};
