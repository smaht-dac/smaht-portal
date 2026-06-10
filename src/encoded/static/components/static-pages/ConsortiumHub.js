import React, { useState } from 'react';
import { RightArrowIcon } from '../util/icon';

const DonorThumbnail = ({ donorId = null, age = null, sex = 'M' }) => {
    const thumbnailSrc =
        sex === 'F'
            ? '/static/img/anatomy-icons/donor-thumbnail-f.png'
            : '/static/img/anatomy-icons/donor-thumbnail-m.png';
    return (
        <div
            className={`donor-thumbnail-container ${
                sex === 'F' ? 'female' : 'male'
            }`}>
            <div className="donor-id fw-medium">{donorId}</div>
            <div className="donor-thumbnail-image">
                <img src={thumbnailSrc} alt="donor thumbnail" />
                <div className="details">
                    <span className="age fw-medium">{age}</span>
                    <span className="sex fw-medium">{sex}</span>
                </div>
            </div>
        </div>
    );
};

const DonorGroupContainer = ({ title, donors }) => (
    <div className="donor-group-container">
        <div className="donor-group-header fw-semibold">{title}</div>
        <div className="donor-group-grid">
            {donors.map((donor) => (
                <DonorThumbnail key={donor.donorId} {...donor} />
            ))}
        </div>
    </div>
);

const CohortDetailsDropdown = ({ title, children, expanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(expanded);
    return (
        <div className="dropdown">
            <div className="header">
                <div
                    className="toggle d-flex align-items-center"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setIsExpanded(!isExpanded)}>
                    <i
                        className={`icon ${
                            isExpanded ? 'icon-minus' : 'icon-plus'
                        } fas me-1`}
                    />
                    <span className="parent-link">{title}</span>
                </div>
            </div>
            {isExpanded && <hr className="my-auto" />}
            <div className={`body ${isExpanded ? 'open' : 'closed'}`}>
                {children}
            </div>
        </div>
    );
};

const donorGroups = [
    {
        title: 'Ages 31-55',
        donors: [
            {
                donorId: 'SMHT001',
                age: '42',
                sex: 'M',
                conditions: ['Cancer', 'Tobacco'],
            },
            { donorId: 'SMHT008', age: '47', sex: 'F', conditions: ['Cancer'] },
            {
                donorId: 'SMHT004',
                age: '51',
                sex: 'M',
                conditions: ['Tobacco'],
            },
            {
                donorId: 'SMHT043',
                age: '52',
                sex: 'M',
                conditions: ['Tobacco'],
            },
        ],
    },
    {
        title: 'Ages 56-65',
        donors: [
            {
                donorId: 'SMHT023',
                age: '57',
                sex: 'M',
                conditions: ['Tobacco'],
            },
            { donorId: 'SMHT005', age: '59', sex: 'M', conditions: [] },
            { donorId: 'SMHT006', age: '60', sex: 'M', conditions: [] },
            {
                donorId: 'SMHT035',
                age: '60',
                sex: 'F',
                conditions: ['Tobacco'],
            },
            { donorId: 'SMHT022', age: '63', sex: 'M', conditions: [] },
            {
                donorId: 'SMHT015',
                age: '65',
                sex: 'F',
                conditions: ['Tobacco'],
            },
            { donorId: 'SMHT024', age: '65', sex: 'M', conditions: [] },
            { donorId: 'SMHT031', age: '65', sex: 'M', conditions: [] },
        ],
    },
    {
        title: 'Ages 66-80',
        donors: [
            {
                donorId: 'SMHT012',
                age: '66',
                sex: 'M',
                conditions: ['Cancer', 'Tobacco'],
            },
            { donorId: 'SMHT007', age: '67', sex: 'M', conditions: [] },
            { donorId: 'SMHT027', age: '67', sex: 'F', conditions: [] },
            {
                donorId: 'SMHT029',
                age: '72',
                sex: 'M',
                conditions: ['Tobacco'],
            },
            { donorId: 'SMHT039', age: '74', sex: 'M', conditions: [] },
            { donorId: 'SMHT042', age: '79', sex: 'M', conditions: [] },
        ],
    },
    {
        title: 'Ages 80+',
        donors: [
            { donorId: 'SMHT020', age: '81', sex: 'M', conditions: [] },
            { donorId: 'SMHT017', age: '86', sex: 'F', conditions: [] },
            { donorId: 'SMHT009', age: '87', sex: 'F', conditions: [] },
            {
                donorId: 'SMHT028',
                age: '87',
                sex: 'M',
                conditions: ['Cancer', 'Tobacco'],
            },
            {
                donorId: 'SMHT018',
                age: '89+',
                sex: 'F',
                conditions: ['Tobacco'],
            },
            {
                donorId: 'SMHT016',
                age: '89+',
                sex: 'F',
                conditions: ['Cancer', 'Tobacco'],
            },
            {
                donorId: 'SMHT040',
                age: '89+',
                sex: 'F',
                conditions: ['Cancer', 'Tobacco'],
            },
        ],
    },
];

const donorList = donorGroups
    .flatMap((group) => group.donors)
    .sort((a, b) => a.donorId.localeCompare(b.donorId));

const quickLinks = [
    { title: 'Sequencing Data (BAMs & CRAMs)', href: '' },
    { title: 'Transcript Quantification Data (tsv & txt)', href: '' },
    { title: 'Filtered Variant Callsets (VCFs)', href: '' },
    { title: 'DSA (FASTA, BED, Chain)', href: '' },
];

export const ConsortiumHub = () => {
    return (
        <div className="consortium-hub-container">
            <p>
                Welcome to the consortium hub for the P25 Data Freeze. Below are
                the resources that you will need to gather all the relevant data
                to facilitate analysis.
            </p>
            <div className="consortium-hub-content">
                <div className="cohort-thumbnails-container">
                    <div className="nav-group">
                        <h6>P25 Donor Cohort</h6>
                        <div className="donor-groups">
                            {donorGroups.map((group) => (
                                <DonorGroupContainer
                                    key={group.title}
                                    title={group.title}
                                    donors={group.donors}
                                />
                            ))}
                        </div>
                    </div>
                </div>
                <div className="quick-links-container">
                    <div className="nav-group">
                        <h6>Quick Links to the P25 Dataset</h6>
                        {quickLinks.map((link) => (
                            <div key={link.title} className="dropdown">
                                <div className="header">
                                    <div className="toggle d-flex align-items-center">
                                        <a className="parent-link">
                                            {link.title}
                                        </a>
                                    </div>
                                    <a className="header-link" href={link.href}>
                                        <RightArrowIcon />
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="nav-group">
                        <h6>Cohort Details</h6>
                        <CohortDetailsDropdown title="Cancer & Tobacco Status - List View">
                            <ol className="cohort-details-list">
                                {donorList.map((donor) => (
                                    <li key={donor.donorId}>
                                        <div className="donor-id">
                                            <a href="">{donor.donorId}:</a>{' '}
                                            <span className="age-sex">
                                                <span className="age">
                                                    {donor.age}
                                                </span>
                                                <span className="sex">
                                                    {donor.sex}
                                                </span>
                                            </span>
                                        </div>
                                        {' - '}
                                        <span
                                            className={
                                                donor.conditions.length
                                                    ? ''
                                                    : 'no-conditions'
                                            }>
                                            {donor.conditions.length
                                                ? donor.conditions.join(', ')
                                                : 'None'}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        </CohortDetailsDropdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
