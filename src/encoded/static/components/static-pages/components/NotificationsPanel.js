import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { RightArrowIcon } from '../../util/icon';
import { useToggle } from '../../util/hooks';

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
 * TissueGroup component displays a tissue group with a toggle to show/hide its items.
 * @param {string} tissue_group - The name of the tissue group.
 * @param {Array} items - The list of items (file groups) within the tissue group.
 * @returns {JSX.Element} The rendered TissueGroup component.
 */
const TissueGroup = ({ count, tissue, value }) => {
    const [isToggled, toggle] = useToggle();

    return (
        <li className="tissue-group-header" aria-expanded={isToggled}>
            <button className="toggle-button tissue" onClick={() => toggle()}>
                <i
                    className={`icon icon-${isToggled ? 'minus' : 'plus'} fas`}
                />
                <span>{tissue}</span>
            </button>
            {isToggled ? (
                <ul className="file-group-list">
                    <li>
                        <span>
                            {count} {value}
                        </span>
                    </li>
                </ul>
            ) : null}
        </li>
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
    const { count, items, donor, query, donorGroupIndex } = props;
    const [isToggled, toggle] = useToggle(donorGroupIndex === 0);

    let donorTitle = donor;

    return (
        <div className="release-item" aria-expanded={isToggled}>
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
                <div
                    className="title"
                    onClick={(e) => {
                        // Prevent toggle when clicking on the link
                        if (e.target.tagName === 'A' && e.target.href) {
                            return;
                        }
                        toggle();
                    }}>
                    {donorTitle}
                    <a className="count" href={query}>
                        {count ?? 0} {count > 1 ? 'Files' : 'File'}
                        <i className="icon icon-arrow-right"></i>
                    </a>
                </div>
            </div>
            {isToggled ? (
                <ul className="tissue-list">
                    {Object.keys(items).map((tissueGroup, i) => {
                        const { count, query, value } = items[tissueGroup];
                        return (
                            <TissueGroup
                                key={i}
                                count={count}
                                tissue={tissueGroup}
                                query={query}
                                value={value}
                            />
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
};

const DayGroup = (props) => {
    const { count, date, query, items: donorGroups, dayGroupIndex } = props;
    const [isToggled, toggle] = useToggle(dayGroupIndex === 0);

    const dayTitle = new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    return (
        <div className="release-item day-group" aria-expanded={isToggled}>
            <div className={`day-group-header ${isToggled ? 'expanded' : ''}`}>
                <button
                    className="toggle-button day"
                    onClick={() => {
                        toggle();
                    }}>
                    <i
                        className={`icon icon-${
                            isToggled ? 'minus' : 'plus'
                        }`}></i>
                </button>
                <div
                    className="title"
                    onClick={(e) => {
                        // Prevent toggle when clicking on the link
                        if (e.target.tagName === 'A' && e.target.href) {
                            return;
                        }
                        toggle();
                    }}>
                    <span>{dayTitle}</span>
                    <a className="count" href={query}>
                        {count ?? 0} {count > 1 ? 'Files' : 'File'}
                        <i className="icon icon-arrow-right"></i>
                    </a>
                </div>
            </div>
            {isToggled ? (
                <ul className="donor-list">
                    {Object.keys(donorGroups).map((donorGroup, i) => {
                        const { count, items, query } = donorGroups[donorGroup];
                        return (
                            <DonorGroup
                                key={i}
                                count={count}
                                donor={donorGroup}
                                items={items}
                                query={query}
                                donorGroupIndex={i}
                            />
                        );
                    })}
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
    const { count, items: dayGroups, query, value } = data;

    // Replace hyphens with slashes and add day field for Safari compatibility
    const date_formatted = value.replace(/-/g, '/') + '/01';
    const date = new Date(date_formatted);
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.toLocaleString('default', { year: 'numeric' });

    return (
        <div
            className={`data-release-item-container ${
                isToggled ? 'expanded' : 'collapsed'
            }`}
            aria-expanded={isToggled}>
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
                            {releaseItemIndex === 0 && 'Latest: '} {month}{' '}
                            {year}
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
                    {/* Map day items to drop-downs */}
                    {callout ? <div className="callout">{callout}</div> : null}
                    {Object.keys(dayGroups)
                        .sort((a, b) => b.localeCompare(a))
                        .map((day, i) => {
                            const { items, count, query } = dayGroups[day];
                            return (
                                <DayGroup
                                    date={day}
                                    items={items}
                                    count={count}
                                    query={query}
                                    key={i}
                                    dayGroupIndex={i}
                                />
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

// Return a formatted object for release data related to a single donor
const formatDonorReleaseData = (data) => {
    const { count, items, value, query } = data;

    // Pull out Donor and add to [acc]
    const [donor, tissueCode] = value?.split('-');

    const formattedDonorItems = items.reduce((acc, item) => {
        const { count, value, query, additional_value } = item;
        const formattedTissue = { count, value, query };
        const tissueTitle = tissueCode + ' - ' + item.additional_value;

        if (acc?.[tissueTitle]) {
            // add to existing group
            acc[tissueTitle] = {
                ...acc[tissueTitle],
                items: Object.assign(
                    acc[tissueTitle]?.items || {},
                    formattedTissue?.items || {}
                ),
                count: acc[tissueTitle].count + formattedTissue.count,
            };
        } else {
            acc[tissueTitle] = formattedTissue;
        }
        return acc;
    }, {});

    return {
        count,
        donor: donor,
        query,
        items: formattedDonorItems,
    };
};

// Return a formatted object for release data related to a single day
const formatDayReleaseData = (data) => {
    const { count, items, value, query } = data;

    const formattedDayItems = data.items.reduce((acc, item) => {
        // Each item is a donor release, should be donor as key
        const [donor, tissueCode] = item?.value?.split('-');

        const formattedDonor = formatDonorReleaseData(item);

        if (acc?.[donor]) {
            // add to existing group
            acc[donor] = {
                ...acc[donor],
                items: Object.assign(acc[donor].items, formattedDonor.items),
                count: acc[donor].count + formattedDonor.count,
            };
        } else {
            acc[donor] = formattedDonor;
        }

        return acc;
    }, {});

    return {
        query: query,
        items: formattedDayItems,
        count: count,
    };
};

/**
 * `formatReleaseData` formats the release tracker data into a structure
 * that more closely matches the UI by grouping the data by donor and tissue
 * @param {Array} data - The raw release tracker data from the API.
 * @returns {Array} The formatted release tracker data.
 */
const formatReleaseData = (data) => {
    return data.map((month) => {
        const { count, value, items, query } = month;
        // Format items in the month by grouping and sorting them by day
        const formattedMonthItems = month?.items?.reduce((acc, item) => {
            const {
                count: dayCount,
                value: dayValue,
                items: dayItems,
                query: dayQuery,
            } = item;

            const date = dayValue;

            const formattedDay = formatDayReleaseData(item);

            // Use date to group items in object
            if (acc?.[date]) {
                // add to existing group
                acc[date] = {
                    ...acc[date],
                    items: Object.assign(acc[date].items, formattedDay.items),
                    count: acc[date].count + dayCount,
                };
            } else {
                acc[date] = formattedDay;
                // acc[date]['count'] = dayCount;
            }

            return acc;
        }, {});

        return {
            count,
            value,
            items: formattedMonthItems,
            query,
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
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setIsLoading(true);
        ajax.load(
            '/recent_files_summary?format=json&nmonths=3',
            (resp) => {
                console.log('resp', resp);
                setData(resp?.items ? formatReleaseData(resp?.items) : []);
                setIsLoading(false);
            },
            'GET',
            (err) => {
                if (err.notification !== 'No results found') {
                    console.log('ERROR NotificationsPanel resp', err);
                }
                setData([]);
                setIsLoading(false);
            }
        );
    }, []);

    return (
        <div className="notifications-panel container">
            <div className="data-release-tracker section">
                <h3 className="section-header">New Data Releases</h3>
                <div className="section-body-container">
                    <div className="section-body">
                        <div className="section-body-items-container">
                            {isLoading ? (
                                <i className="icon fas icon-spinner icon-spin"></i>
                            ) : data === null || data.length === 0 ? (
                                <div className="announcement-container public-release d-flex flex-column align-items-center border-0">
                                    <i className="icon icon-folder-open fas"></i>
                                    <h5 className="header">
                                        PUBLIC RELEASE: COMING SOON!
                                    </h5>
                                    <div className="body">
                                        Production data are only available to
                                        SMaHT consortium members at this time.
                                        Check back for the public release of
                                        SMaHT data.
                                    </div>
                                </div>
                            ) : (
                                data.map((releaseItem, i) => {
                                    return (
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
