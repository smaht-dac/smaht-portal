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
                href: '/protected-donors/0c83b75c-aece-4d1f-bddd-9c5fc62cd475/',
            },
            {
                donorId: 'SMHT008',
                age: '47',
                sex: 'F',
                conditions: ['Cancer'],
                href: '/protected-donors/9982fac2-229a-4b0f-9d96-3dee65bd6aec/',
            },
            {
                donorId: 'SMHT004',
                age: '51',
                sex: 'M',
                conditions: ['Tobacco'],
                href: '/protected-donors/b7fe7d42-5058-41be-b0c2-40300cd8c541/',
            },
            {
                donorId: 'SMHT043',
                age: '52',
                sex: 'M',
                conditions: ['Tobacco'],
                href: '/protected-donors/ed31dae3-6c25-4a04-9a56-010366b8aa93/',
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
                href: '/protected-donors/ffc2942e-cb80-42e3-b528-97e5ba9c1068/',
            },
            {
                donorId: 'SMHT005',
                age: '59',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/abb8dc5e-738c-463e-a814-0c967d3a8ef5/',
            },
            {
                donorId: 'SMHT006',
                age: '60',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/f5295467-653b-4d7d-9fa3-72f7090b9251/',
            },
            {
                donorId: 'SMHT035',
                age: '60',
                sex: 'F',
                conditions: ['Tobacco'],
                href: '/protected-donors/a48bab79-1a29-474a-84a9-e1581efde67f/',
            },
            {
                donorId: 'SMHT022',
                age: '63',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/02de2368-8d8c-49f8-aa72-0401dbfd0e7c/',
            },
            {
                donorId: 'SMHT015',
                age: '65',
                sex: 'F',
                conditions: ['Tobacco'],
                href: '/protected-donors/0881921b-c804-4aae-9ecb-a17bc3bc646e/',
            },
            {
                donorId: 'SMHT024',
                age: '65',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/3f53ab1c-bf6f-4f28-a1e5-9688072db668/',
            },
            {
                donorId: 'SMHT031',
                age: '65',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/10397f66-3a86-496c-8a23-3f51f1f158de/',
            },
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
                href: '/protected-donors/5362df2a-075e-4af8-ad4b-9fb8944facae/',
            },
            {
                donorId: 'SMHT007',
                age: '67',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/6ae6ec37-1b05-4874-bda3-45c11bcb3efc/',
            },
            {
                donorId: 'SMHT027',
                age: '67',
                sex: 'F',
                conditions: [],
                href: '/protected-donors/8551d4b7-2571-41ef-acb8-bbc9892343e0/',
            },
            {
                donorId: 'SMHT029',
                age: '72',
                sex: 'M',
                conditions: ['Tobacco'],
                href: '/protected-donors/d02ee5e4-291e-4a4b-9379-79f87f5dd217/',
            },
            {
                donorId: 'SMHT039',
                age: '74',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/80507a57-e52f-4961-9304-6db163ecab0a/',
            },
            {
                donorId: 'SMHT042',
                age: '79',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/35e7ab13-11af-411f-93dc-5e2229bc540d/',
            },
        ],
    },
    {
        title: 'Ages 80+',
        donors: [
            {
                donorId: 'SMHT020',
                age: '81',
                sex: 'M',
                conditions: [],
                href: '/protected-donors/e7f50ad0-2e84-4a55-b674-1c4a14bf39ff/',
            },
            {
                donorId: 'SMHT017',
                age: '86',
                sex: 'F',
                conditions: [],
                href: '/protected-donors/a39ed366-096b-418e-a855-7ffd369e7334/',
            },
            {
                donorId: 'SMHT009',
                age: '87',
                sex: 'F',
                conditions: [],
                href: '/protected-donors/6b1e4ec3-df75-4460-9e40-0c84b62f82bb/',
            },
            {
                donorId: 'SMHT028',
                age: '87',
                sex: 'M',
                conditions: ['Cancer', 'Tobacco'],
                href: '/protected-donors/21892d81-d77d-414e-b851-061753e0742c/',
            },
            {
                donorId: 'SMHT018',
                age: '89+',
                sex: 'F',
                conditions: ['Tobacco'],
                href: '/protected-donors/98ebfe66-fa33-448e-ac00-b5d001ecbabc/',
            },
            {
                donorId: 'SMHT016',
                age: '89+',
                sex: 'F',
                conditions: ['Cancer', 'Tobacco'],
                href: '/protected-donors/25bd749a-8ebb-47c6-a63d-d9863514e715/',
            },
            {
                donorId: 'SMHT040',
                age: '89+',
                sex: 'F',
                conditions: ['Cancer', 'Tobacco'],
                href: '/protected-donors/5cece9ea-55c4-4d93-82ab-c22a9c8f68fb/',
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
                                            <a href={donor.href}>{donor.donorId}:</a>{' '}
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
