import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { RightArrowIcon } from '../../util/icon';

// Toggle hook for expanding/collapsing sections
// Note: should move this into a shared hooks location eventaully
const useToggle = (initialState = false) => {
    const [isToggled, setIsToggled] = useState(initialState);
    const toggle = () => setIsToggled(!isToggled);
    return [isToggled, toggle];
};

// Default announcement data
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
 * TissueGroup component displays a tissue group with a toggle to show/hide its items.
 * @param {string} tissue_group - The name of the tissue group.
 * @param {Array} items - The list of items (file groups) within the tissue group.
 * @returns {JSX.Element} The rendered TissueGroup component.
 */
const TissueGroup = ({ tissue_group, items }) => {
    const [isToggled, toggle] = useToggle();

    return (
        <li>
            <button className="toggle-button tissue" onClick={() => toggle()}>
                <i
                    className={`icon icon-${isToggled ? 'minus' : 'plus'} fas`}
                />
            </button>
            <span>{tissue_group}</span>
            {isToggled ? (
                <ul className="file-group-list">
                    {items.map((item, i) => {
                        return (
                            <li key={i}>
                                <span>
                                    {item?.count} {item?.value}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </li>
    );
};

// Warning to include in the data release item for September 2025
const ReleaseItemWarning = () => {
    return (
        <div className="announcement-container warning">
            <div className="header">
                <i className="icon fas icon-database"></i>
                <span>CRAM CONVERSION</span>
            </div>
            <span>
                As of September 15, 2025, all released BAMs have been converted
                to CRAMs for optimal file storage at the DAC. The data release
                tracker will start to announce new CRAMs as they are released.
            </span>
        </div>
    );
};

/**
 * DonorGroup component displays a donor group with a toggle to show/hide its tissue groups.
 * @param {number} count - The total count of files in the donor group.
 * @param {Object} donorGroups - The object containing all donor groups.
 * @param {string} donorGroup - The name of the donor group.
 * @param {string} query - The query URL for the donor group.
 * @returns {JSX.Element} The rendered DonorGroup component.
 */
const DonorGroup = (props) => {
    const {
        count,
        donorGroups: donor_groups,
        donorGroup: donor_group,
        query,
    } = props;
    const [isToggled, toggle] = useToggle();

    let donorTitle = donor_group;

    if (donorTitle?.includes('DAC_DONOR_')) {
        donorTitle = donorTitle.replace('DAC_DONOR_', '');
    }

    return (
        <div className="release-item">
            <div
                className={`donor-group-header ${isToggled ? 'expanded' : ''}`}>
                <button
                    className="toggle-button donor"
                    onClick={() => {
                        toggle();
                    }}>
                    <i
                        className={`icon icon-${
                            isToggled ? 'minus' : 'plus'
                        }`}></i>
                </button>
                <a className="title" href={query}>
                    {donorTitle}
                    <span className="count">
                        {count ?? 0} {count > 1 ? 'Files' : 'File'}
                        <i className="icon icon-arrow-right"></i>
                    </span>
                </a>
            </div>
            {isToggled ? (
                <ul className="tissue-list">
                    {Object.keys(donor_groups[donor_group]['items']).map(
                        (tissue_group, i) => {
                            const { count, items } =
                                donor_groups[donor_group]['items'][
                                    tissue_group
                                ];
                            return (
                                <TissueGroup
                                    key={i}
                                    count={count}
                                    tissue_group={tissue_group}
                                    items={items}
                                />
                            );
                        }
                    )}
                </ul>
            ) : null}
        </div>
    );
};

/**
 * DataReleaseItem component displays information about a specific data release.
 * @param {object} data - The data object containing release information.
 * @param {number} releaseItemIndex - The index of the release item.
 * @param {JSX.Element|null} callout - Optional callout component to display above the donor groups.
 * @returns {JSX.Element} The rendered DataReleaseItem component.
 */
const DataReleaseItem = ({ data, releaseItemIndex, callout = null }) => {
    const [isToggled, toggle] = useToggle(releaseItemIndex === 0);
    const { count, items: donor_groups, query, value } = data;

    // Replace hyphens with slashes and add day field for Safari compatibility
    const date_formatted = value.replace(/-/g, '/') + '/01';
    const date = new Date(date_formatted);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.toLocaleString('default', { year: 'numeric' });

    return (
        <div
            className={`data-release-item-container ${
                isToggled ? 'expanded' : 'collapsed'
            }`}>
            <div className="content">
                <div className="header">
                    <button
                        className="toggle-button"
                        onClick={() => {
                            toggle();
                        }}>
                        <i
                            className={`icon icon-${
                                isToggled ? 'minus' : 'plus'
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
                    {/* Map donor groups to drop-downs */}
                    {callout ? <div className="callout">{callout}</div> : null}
                    {Object.keys(donor_groups).map((donor_group, i) => {
                        return (
                            <DonorGroup
                                count={donor_groups[donor_group].count}
                                key={i}
                                donorGroups={donor_groups}
                                donorGroup={donor_group}
                                query={donor_groups[donor_group].query}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

/**
 * `formatReleaseData` formats the release tracker data into a structure
 * that more closely matches the UI by grouping the data by donor and tissue
 * @param {Array} data - The raw release tracker data from the API.
 * @returns {Array} The formatted release tracker data.
 */
const formatReleaseData = (data) => {
    return data.map((month) => {
        // Format each month by grouping items by donor and tissue
        const formattedItems = month?.items?.reduce((acc, item) => {
            const { count, value, items, query } = item;

            // Pull out Donor and add to [acc]
            const [donor, tissueCode] = value?.split('-');
            const tissueType = items?.[0]?.['additional_value'] ?? '';
            const tissueTitle = tissueType
                ? tissueType + ' - ' + tissueCode
                : tissueCode;

            // Update the query to filter on donor instead of release title
            const donorFilters = `donors.display_title=${donor}`;
            const donorQuery = query?.replace(
                `release_tracker_title=${value}`,
                donorFilters
            );

            // Do the same for tissue query
            const tissueFilters = `${donorFilters}&sample_summary.tissues=${tissueType}`;
            const tissueQuery = query?.replace(
                `release_tracker_title=${value}`,
                tissueFilters
            );

            // Update tissue item queries to include tissue query + specific tissue filter
            const tissueItems = item?.items.map((tissueItem) => ({
                ...tissueItem,
                query: `${tissueQuery}&${
                    tissueItem.name
                }=${tissueItem.value.replaceAll(' ', '+')}`,
            }));

            // Create a new entry for the donor if it doesn't exist
            if (!acc?.[donor]) {
                // Place tissue items into new donor group
                const newDonorItems = {
                    [tissueTitle]: {
                        items: tissueItems,
                        count,
                        query: tissueQuery,
                        donor,
                    },
                };
                acc[donor] = {
                    items: newDonorItems,
                    count,
                    query: donorQuery,
                };
            } else {
                // Append new tissue category if it doesn't exist on donor
                if (!acc?.[donor]?.items?.[tissueTitle]) {
                    acc[donor].items[tissueTitle] = {
                        items: tissueItems,
                        count,
                        query: tissueQuery,
                    };

                    // Add count to donor total
                    acc[donor].count += count;
                } else {
                    // Simply add to existing tissue category
                    acc[donor].items[tissueTitle].items.push(...tissueItems);

                    // Add count to tissue total
                    acc[donor].items[tissueTitle].count += count;

                    // Add count to donor total
                    acc[donor].count += count;
                }
            }

            return acc;
        }, {});

        return {
            ...month,
            items: formattedItems,
        };
    });
};

/**
 * NotificationsPanel component displays a panel containg the data release
 * tracker, the announcements section, and other relevant links/information.
 * @returns {JSX.Element} The rendered NotificationsPanel component.
 */
export const NotificationsPanel = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        ajax.load(
            '/recent_files_summary?format=json&nmonths=3',
            (resp) => {
                setData(resp?.items ? formatReleaseData(resp?.items) : []);
            },
            'GET',
            (err) => {
                if (err.notification !== 'No results found') {
                    console.log('ERROR NotificationsPanel resp', err);
                }
            }
        );
    }, []);

    return (
        <div className="notifications-panel container">
            <div className="data-release-tracker section">
                <h3 className="section-header">Data Release Tracker</h3>
                <div className="section-body-container">
                    <div className="section-body">
                        <div className="section-body-items-container">
                            {data === null ? (
                                <i className="icon fas icon-spinner icon-spin"></i>
                            ) : data.length === 0 ? (
                                <DataReleaseItem
                                    data={{
                                        name: 'file_status_tracking.released',
                                        value: '2025-09',
                                        count: 0,
                                        items: [],
                                        query: '',
                                    }}
                                    callout={<ReleaseItemWarning />}
                                    releaseItemIndex={0}
                                />
                            ) : (
                                data.map((releaseItem, i) => {
                                    return releaseItem?.value === '2025-09' ? (
                                        <DataReleaseItem
                                            data={releaseItem}
                                            key={i}
                                            callout={<ReleaseItemWarning />}
                                            releaseItemIndex={i}
                                        />
                                    ) : (
                                        <DataReleaseItem
                                            data={releaseItem}
                                            key={i}
                                            releaseItemIndex={i}
                                        />
                                    );
                                })
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
