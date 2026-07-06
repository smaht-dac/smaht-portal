import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { RightArrowIcon } from '../util/icon';
import { useUserDownloadAccess } from '../util/hooks';

// Quick links to the data portal
const quickLinks = [
    {
        title: 'Sequencing Data (BAMs & CRAMs)',
        href: '/browse/?dataset%21=No+value&donors.donor_groups=First+25+Donors+%5BP25%5D&file_format.display_title=cram&file_format.display_title=bam&sample_summary.studies=Production&sort=-file_status_tracking.release_dates.initial_release_date&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&type=File',
        badge: 'protected',
    },
    {
        title: 'Transcript Quantification Data (tsv, txt, gff)',
        href: '/browse/?data_category=RNA+Quantification&dataset%21=No+value&donors.donor_groups=First+25+Donors+%5BP25%5D&sample_summary.studies=Production&sort=-file_status_tracking.release_dates.initial_release_date&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&type=File',
        badge: 'protected',
    },
    {
        title: 'Filtered Somatic Variant Callsets',
        href: '/browse/?analysis_details=Filtered&data_category=Somatic+Variant+Calls&dataset%21=No+value&donors.donor_groups=First+25+Donors+%5BP25%5D&release_tracker_description%21=No+value&sample_summary.studies=Production&sort=-file_status_tracking.release_dates.initial_release_date&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&type=File',
        badge: 'open',
    },
    {
        title: 'Germline Variant Callsets',
        href: '/browse/?data_category=Germline+Variant+Calls&dataset%21=No+value&donors.donor_groups=First+25+Donors+%5BP25%5D&release_tracker_description%21=No+value&sample_summary.studies=Production&sort=-file_status_tracking.release_dates.initial_release_date&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&type=File',
        badge: 'protected',
    },
    {
        title: 'DSA (FASTA, BED, Chain)',
        href: '/browse/?data_type=DSA&data_type=Chain+File&data_type=Sequence+Interval&dataset%21=No+value&donors.donor_groups=First+25+Donors+%5BP25%5D&sample_summary.studies=Production&sort=-file_status_tracking.release_dates.initial_release_date&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&type=File',
        badge: 'protected',
    },
];

// Search query for P25 donor data, limited to only the fields needed for display
const buildSearchQuery = (hasProtectedAccess) =>
    [
        `/search/?type=${hasProtectedAccess ? 'ProtectedDonor' : 'Donor'}`,
        'donor_groups=First+25+Donors+%5BP25%5D',
        'limit=all',
        'field=external_id',
        'field=age',
        'field=sex',
        'field=@id',
        ...(hasProtectedAccess
            ? [
                  'field=medical_history.cancer_history',
                  'field=medical_history.tobacco_use',
              ]
            : []),
    ].join('&');

// Age groups for donors
const AGE_GROUP_DEFINITIONS = [
    { title: 'Ages 31-55', min: 31, max: 55 },
    { title: 'Ages 56-65', min: 56, max: 65 },
    { title: 'Ages 66-80', min: 66, max: 80 },
    { title: 'Ages 80+', min: 81 },
];

// Transform donor data from the P25 search endpoint into the format needed for display
const transformDonor = ({
    external_id,
    age,
    sex,
    '@id': id,
    medical_history = [],
}) => {
    const medical_history_obj = medical_history?.[0] ?? {};
    const conditions = [];
    if (medical_history_obj.cancer_history === 'Yes') conditions.push('Cancer');
    if (medical_history_obj.tobacco_use === 'Yes') conditions.push('Tobacco');
    return {
        donorId: external_id,
        age: age >= 89 ? '89+' : String(age),
        sex: sex === 'Female' ? 'F' : 'M',
        href: id,
        conditions,
    };
};

/**
 * Groups donors by age into predefined age groups
 * @param {Array} donors - The list of donors to group
 * @returns {Array} The list of donor groups
 */
const groupDonorsByAge = (donors) => {
    return AGE_GROUP_DEFINITIONS.map(({ title, min, max }) => ({
        title,
        donors: donors
            .filter((d) => {
                const n = d.age === '89+' ? 89 : Number(d.age);
                return n >= min && (max === undefined || n <= max);
            })
            .sort((a, b) => {
                const na = a.age === '89+' ? 89 : Number(a.age);
                const nb = b.age === '89+' ? 89 : Number(b.age);
                return na - nb;
            }),
    }));
};

// Function for loading donor data from the P25 search endpoint
const useP25Donors = ({ hasProtectedAccess = false, ready = false }) => {
    const [donors, setDonors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!ready) return;
        let cancelled = false;
        setDonors([]);
        setLoading(true);
        setError(false);
        ajax.load(
            buildSearchQuery(hasProtectedAccess),
            (resp) => {
                if (cancelled) return;
                setDonors((resp['@graph'] || []).map(transformDonor));
                setLoading(false);
            },
            'GET',
            () => {
                if (cancelled) return;
                setError(true);
                setLoading(false);
            }
        );
        return () => {
            cancelled = true;
        };
    }, [hasProtectedAccess, ready]);

    return { donors, loading, error };
};

/**
 * DonorThumbnail component renders a donor thumbnail with age and sex
 * information that can be clicked to navigate to the donor's profile
 * @param {string} donorId - The donor ID
 * @param {number} age - The donor age
 * @param {string} sex - The donor sex
 * @param {string} donorHref - The href for the donor
 * @returns {JSX.Element} The rendered DonorThumbnail component
 */
const DonorThumbnail = ({
    donorId = null,
    age = null,
    sex = 'M',
    donorHref = '',
}) => {
    const [imgLoaded, setImgLoaded] = useState(false);
    const thumbnailSrc =
        sex === 'F'
            ? '/static/img/anatomy-icons/donor-thumbnail-f.png'
            : '/static/img/anatomy-icons/donor-thumbnail-m.png';
    const sexLabel = sex === 'F' ? 'Female' : 'Male';
    return (
        <a
            className={`donor-thumbnail-container ${
                sex === 'F' ? 'female' : 'male'
            }`}
            href={donorHref}
            aria-label={`Donor ${donorId}, age ${age}, ${sexLabel}`}>
            <div className="donor-id fw-medium" aria-hidden="true">
                {donorId}
            </div>
            <div className="donor-thumbnail-image">
                <img
                    src={thumbnailSrc}
                    alt=""
                    className={imgLoaded ? 'loaded' : ''}
                    onLoad={() => setImgLoaded(true)}
                />
                <div className="details" aria-hidden="true">
                    <span className="age fw-medium">{age}</span>
                    <span className="sex fw-medium">{sex}</span>
                </div>
            </div>
        </a>
    );
};

/**
 * DonorGroupContainer component renders a container for a group of donor thumbnails
 * @param {string} title - The title of the donor group
 * @param {Array} donors - The list of donors in the group
 * @returns {JSX.Element} The rendered DonorGroupContainer component
 */
const DonorGroupContainer = ({ title, donors }) => (
    <div className="donor-group-container">
        <div className="donor-group-header fw-semibold">{title}</div>
        <div className="donor-group-body">
            {donors.map((donor) => (
                <DonorThumbnail
                    key={donor.donorId}
                    {...donor}
                    donorHref={donor.href}
                />
            ))}
        </div>
    </div>
);

// Donor counts for each group, used to determine skeleton
const SKELETON_COUNTS = [4, 8, 6, 7];

// Donor thumbnail skeleton
const DonorThumbnailSkeleton = () => (
    <div
        className="donor-thumbnail-container donor-thumbnail-container-skeleton"
        aria-hidden="true">
        <div className="donor-thumbnail-skeleton-id" />
        <div className="donor-thumbnail-skeleton-image" />
    </div>
);

// Donor groups skeleton shown while loading donor data
const DonorGroupsSkeleton = () => (
    <div
        className="donor-groups"
        aria-busy="true"
        aria-label="Loading donor cohort">
        {SKELETON_COUNTS.map((count, i) => (
            <div key={i} className="donor-group-container">
                <div className="donor-group-header donor-group-header-skeleton" />
                <div className="donor-group-body">
                    {Array.from({ length: count }, (_, j) => (
                        <DonorThumbnailSkeleton key={j} />
                    ))}
                </div>
            </div>
        ))}
    </div>
);

/**
 * CohortDetailsDropdown component renders a dropdown container for cohort
 * details, such as age and sex distribution, and a list of donors in the
 * cohort, and links to the donor profiles
 * @param {string} title - The title of the dropdown
 * @param {React.ReactNode} children - The child nodes to display in the dropdown
 * @param {boolean} expanded - Whether the dropdown is initially expanded
 * @returns {JSX.Element} The rendered CohortDetailsDropdown component
 */
const CohortDetailsDropdown = ({ title, children, expanded = false }) => {
    const [isExpanded, setIsExpanded] = useState(expanded);
    // ID derived from the title so the toggle can reference the body region via aria controls
    const bodyId = `dropdown-body-${title.replace(/\s+/g, '-').toLowerCase()}`;

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
        }
    };

    return (
        <div className="dropdown">
            <div className="header">
                <div
                    className="toggle d-flex align-items-center"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    aria-controls={bodyId}
                    onClick={() => setIsExpanded((prev) => !prev)}
                    onKeyDown={handleKeyDown}>
                    <i
                        className={`icon ${
                            isExpanded ? 'icon-minus' : 'icon-plus'
                        } fas me-1`}
                        aria-hidden="true"
                    />
                    <span className="parent-link">{title}</span>
                </div>
            </div>
            {isExpanded && <hr className="my-auto" />}
            <div
                id={bodyId}
                className={`body ${isExpanded ? 'open' : 'closed'}`}>
                {children}
            </div>
        </div>
    );
};

/**
 * Main component for the Consortium Hub page
 * @returns {JSX.Element} The rendered ConsortiumHub component
 */
export const ConsortiumHub = ({ session }) => {
    // Load user access to determine ProtectedDonor access
    const { userDownloadAccess, isAccessResolved } =
        useUserDownloadAccess(session);
    const hasProtectedAccess = !!userDownloadAccess['protected-network'];
    const { donors, loading, error } = useP25Donors({
        hasProtectedAccess,
        ready: isAccessResolved,
    });
    const donorGroups = groupDonorsByAge(donors);
    const donorList = [...donors].sort((a, b) =>
        a.donorId.localeCompare(b.donorId)
    );

    return (
        <div className="consortium-hub-container">
            <h3>P25 Data Freeze</h3>
            <p>
                Welcome to the consortium hub for the P25 Data Freeze. Below are
                the resources that you will need to gather all the relevant data
                to facilitate analysis.
            </p>
            <div className="consortium-hub-content">
                <div className="cohort-thumbnails-container">
                    <div className="nav-group">
                        <h6>P25 Donor Cohort</h6>
                        {loading && <DonorGroupsSkeleton />}
                        {error && (
                            <span className="">Failed to load donor data.</span>
                        )}
                        {!loading && !error && (
                            <div className="donor-groups">
                                {donorGroups.map((group) => (
                                    <DonorGroupContainer
                                        key={group.title}
                                        title={group.title}
                                        donors={group.donors}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="quick-links-container">
                    <div className="nav-group">
                        <h6>Quick Links to the P25 Dataset</h6>
                        {quickLinks.map((link) => (
                            <div className="dropdown">
                                <a
                                    className="header"
                                    key={link.title}
                                    href={link.href}>
                                    <div className="toggle d-flex align-items-center">
                                        <span className="parent-link">
                                            {link.title}
                                            {link.badge && (
                                                <span
                                                    className={`quick-link-badge quick-link-badge-${link.badge}`}>
                                                    {link.badge === 'open' ? (
                                                        'Open'
                                                    ) : (
                                                        <i className="icon icon-lock"></i>
                                                    )}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                    <span
                                        className="header-link"
                                        aria-hidden="true"
                                        tabIndex={-1}>
                                        <RightArrowIcon />
                                    </span>
                                </a>
                            </div>
                        ))}
                    </div>
                    <div className="nav-group">
                        <h6>Cohort Details</h6>
                        <CohortDetailsDropdown title="Cancer & Tobacco Status - List View">
                            {loading && (
                                <i className="icon icon-circle-notch icon-spin fas" />
                            )}
                            {error && (
                                <span className="">
                                    Failed to load donor data.
                                </span>
                            )}
                            {isAccessResolved && !hasProtectedAccess ? (
                                <p>
                                    You need dbGaP access to protected donor
                                    metadata to view.
                                </p>
                            ) : (
                                <ol className="cohort-details-list">
                                    {donorList.map((donor) => (
                                        <li key={donor.donorId}>
                                            <div className="donor-id">
                                                <a href={donor.href}>
                                                    {donor.donorId}:
                                                </a>{' '}
                                                <span className="age-sex">
                                                    <span className="age">
                                                        <span className="visually-hidden">
                                                            Age{' '}
                                                        </span>
                                                        {donor.age}
                                                    </span>
                                                    <span className="sex">
                                                        <span className="visually-hidden">
                                                            {donor.sex === 'F'
                                                                ? 'Female'
                                                                : 'Male'}
                                                        </span>
                                                        <span aria-hidden="true">
                                                            {donor.sex}
                                                        </span>
                                                    </span>
                                                </span>
                                            </div>
                                            <span aria-hidden="true">
                                                {' - '}
                                            </span>
                                            <span
                                                className={
                                                    donor.conditions.length
                                                        ? ''
                                                        : 'no-conditions'
                                                }>
                                                {donor.conditions.length
                                                    ? donor.conditions.join(
                                                          ', '
                                                      )
                                                    : 'None'}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </CohortDetailsDropdown>
                    </div>
                </div>
            </div>
        </div>
    );
};
