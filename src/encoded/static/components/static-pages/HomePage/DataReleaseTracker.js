import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { useToggle } from '../../util/hooks';
import { useUserDownloadAccess } from '../../util/hooks';

/**
 * Replaces the `release_tracker_title` parameter in the query with the donor and tissue titles
 * @param {string} query - The query string to be changed
 * @param {string[]} donors - The list of donor titles to replace the release_tracker_title parameter with
 * @param {string[]} tissues - The list of tissue titles to replace the release_tracker_title parameter with
 * @returns {string} The updated query string with the donor and tissue titles
 */
const replaceURLParamsWithDonors = (query, donorList = [], tissueList = []) => {
    // If donorList and tissueList are empty, return the original query
    if (donorList.length === 0 && tissueList.length === 0) {
        return query;
    }

    // Save params from original query
    const [urlPath, urlQuery] = query.split('?');
    const params = new URLSearchParams(urlQuery);

    // Remove release_tracker_title
    params.delete('release_tracker_title');

    // Add donor and tissue titles to params
    donorList.forEach((donor) => {
        params.append('donors.display_title', donor);
    });
    tissueList.forEach((tissue) => {
        params.append('sample_summary.tissues', tissue);
    });

    // Decode values in params (encoded by URLSearchParams)
    const decodedParams = [];
    for (const [key, value] of params.entries()) {
        decodedParams.push(`${key}=${decodeURIComponent(value)}`);
    }

    return `${urlPath}?${decodedParams.join('&')}`;
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
    const { count, items, donor, query, donorGroupIndex, releaseItemIndex } =
        props;
    const [isToggled, toggle] = useToggle(
        donorGroupIndex === 0 && releaseItemIndex === 0
    );

    // Update query with donor and extacted tissues
    const tissueList = Object.keys(items).map((tissue) =>
        tissue.split('-')[1].trim()
    );
    const updatedQuery = replaceURLParamsWithDonors(query, [donor], tissueList);

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
                    {donor}
                    <a className="count" href={updatedQuery}>
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
                                key={tissueGroup}
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
    const {
        count,
        date,
        query,
        items: donorGroups,
        dayGroupIndex,
        releaseItemIndex,
    } = props;
    const [isToggled, toggle] = useToggle(
        dayGroupIndex === 0 && releaseItemIndex === 0
    );

    const dayTitle = new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });

    // Get donor title from first donor group
    const donorList = Object.keys(donorGroups);
    const tissueList = Object.keys(donorGroups).flatMap((donor) => {
        return Object.keys(donorGroups[donor].items).map((tissue) =>
            tissue.split('-')[1].trim()
        );
    });

    // Update query with donor and extacted tissues
    const updatedQuery = replaceURLParamsWithDonors(
        query,
        donorList,
        tissueList
    );

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
                    <a className="count" href={updatedQuery}>
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
                                key={donorGroup}
                                count={count}
                                donor={donorGroup}
                                items={items}
                                query={query}
                                donorGroupIndex={i}
                                releaseItemIndex={releaseItemIndex}
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

    // Get donors and tissues from the day groups
    let donorList = new Set();
    let tissueList = new Set();
    Object.keys(dayGroups).forEach((dayGroup) => {
        const donors = Object.keys(dayGroups[dayGroup].items);

        // Add donors to donorList
        for (const donor of donors) donorList.add(donor);

        // Extact all tissue titles from the `dayGroups`
        const tissues = Object.keys(dayGroups[dayGroup].items).flatMap(
            (donor) => {
                return Object.keys(dayGroups[dayGroup].items[donor].items).map(
                    (tissue) => {
                        return tissue.split('-')[1].trim();
                    }
                );
            }
        );

        // Add tissues to tissueList
        for (const tissue of tissues) tissueList.add(tissue);
    });

    // Update query with donor and extacted tissues
    const updatedQuery = replaceURLParamsWithDonors(
        query,
        Array.from(donorList),
        Array.from(tissueList)
    );

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
                    <a
                        className="header-link"
                        href={count > 0 ? updatedQuery : null}>
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
                                    key={day}
                                    date={day}
                                    items={items}
                                    count={count}
                                    query={query}
                                    dayGroupIndex={i}
                                    releaseItemIndex={releaseItemIndex}
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
const formatReleaseData = (data = []) => {
    if (data.length === 0) return [];
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

// Alert for empty release tracker
const EmptyReleaseTrackerAlert = () => {
    return (
        <div className="announcement-container public-release d-flex flex-column align-items-center border-0">
            <i className="icon icon-folder-open fas"></i>
            <h5 className="header text-center">
                SMaHT Donor Data
                <br />
                Official Release: Coming Soon
            </h5>
            <div className="body">
                The New Data Releases are available to SMaHT Network members at
                this time. Open access benchmarking data are available now.
            </div>
        </div>
    );
};

export const DataReleaseTracker = ({ session }) => {
    const [data, setData] = useState(null);
    const { userDownloadAccess, isAccessResolved } =
        useUserDownloadAccess(session);

    const isNetworkMember = userDownloadAccess?.['open-network'];

    useEffect(() => {
        let isCancelled = false;

        if (isAccessResolved && isNetworkMember) {
            ajax.load(
                '/recent_files_summary?format=json&nmonths=6',
                (resp) => {
                    if (isCancelled) return;
                    setData(formatReleaseData(resp?.items));
                },
                'GET',
                (err) => {
                    if (isCancelled) return;
                    if (err.notification !== 'No results found') {
                        console.log('ERROR NotificationsPanel resp', err);
                    }
                    setData([]);
                }
            );
        } else if (isAccessResolved && !isNetworkMember) {
            // Not a member, we won't fetch data
            setData([]);
        }

        return () => {
            isCancelled = true;
        };
    }, [userDownloadAccess, isAccessResolved, session]);

    return (
        <div className="data-release-tracker section">
            <h3 className="section-header">New Data Releases</h3>
            <div className="section-body-container">
                <div className="section-body">
                    <div className="section-body-items-container">
                        {data === null ? (
                            <i className="icon fas icon-spinner icon-spin"></i>
                        ) : data.length === 0 ? (
                            <EmptyReleaseTrackerAlert />
                        ) : (
                            data.map((releaseItem, i) => {
                                return (
                                    <DataReleaseItem
                                        data={releaseItem}
                                        key={releaseItem?.value ?? i}
                                        releaseItemIndex={i}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
