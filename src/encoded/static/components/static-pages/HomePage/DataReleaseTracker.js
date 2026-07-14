import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { useToggle } from '../../util/hooks';
import { useUserDownloadAccess } from '../../util/hooks';

/**
 * WeekGroup renders a single link row for a Sun to Sat week.
 * @param {Date} weekStart - Sunday of the week
 * @param {Date} weekEnd - Saturday of the week
 * @param {number} count - Total file count for the week
 * @returns {JSX.Element}
 */
const WeekGroup = ({ weekStart, weekEnd, count, parentMonthKey = null }) => {
    const formatWeekDate = (date) =>
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const weekLabel = `${formatWeekDate(weekStart)} - ${formatWeekDate(
        weekEnd
    )}`;

    const pad = (n) => String(n).padStart(2, '0');
    const toDateKey = (d) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const weekHref =
        count > 0
            ? `/recent-releases?view=weekly&date=${toDateKey(weekStart)}${parentMonthKey ? `&month=${parentMonthKey}` : ''}`
            : null;

    return (
        <a className="week-link" href={weekHref}>
            <span className="range">{weekLabel}</span>
            <div className="count">
                <span>{count.toLocaleString('en-US')}</span>
            </div>
        </a>
    );
};

/**
 * DataReleaseItem displays information about a specific data release.
 * @param {object} data - The data object containing release information
 * @param {number} releaseItemIndex - The index of the release item
 * @param {JSX.Element|null} callout - Optional callout component to display above the week groups
 * @returns {JSX.Element}
 */
const DataReleaseItem = ({ data, releaseItemIndex, callout = null }) => {
    const [isToggled, toggle] = useToggle(releaseItemIndex === 0);
    const { count, items: weekGroups, value } = data;

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
                    <a
                        className="header-link"
                        href={
                            count > 0
                                ? `/recent-releases?view=monthly&date=${value}`
                                : null
                        }>
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
                    {callout ? <div className="callout">{callout}</div> : null}
                    {Object.keys(weekGroups)
                        .sort((a, b) => b.localeCompare(a))
                        .map((weekKey) => {
                            const {
                                weekStart,
                                weekEnd,
                                count: weekCount,
                            } = weekGroups[weekKey];
                            return (
                                <WeekGroup
                                    key={weekKey}
                                    weekStart={weekStart}
                                    weekEnd={weekEnd}
                                    count={weekCount}
                                    parentMonthKey={value}
                                />
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

/**
 * `getWeekRange` produces the Sunday to Saturday week range for a given date
 * string (YYYY-MM-DD), matching the convention used in RecentReleasesTimelineMatrix.
 * @param {string} dateStr - Date string in the format YYYY-MM-DD
 * @returns {object}
 */
const getWeekRange = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // back to Sunday

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // forward to Saturday

    return { weekStart, weekEnd };
};

/**
 * `formatReleaseData` processes the API response into month and week buckets.
 * Each week stores only the total count.
 * @param {Array} data - Raw items from /recent_release_days
 * @returns {Array}
 */
const formatReleaseData = (data = []) => {
    if (data.length === 0) return [];
    return data.map((month) => {
        const { count, value } = month;

        // Collapse API day items into { "YYYY-MM-DD": { count } }
        const dayItems = month?.items?.reduce((acc, item) => {
            const { count: dayCount, value: dayValue } = item;
            if (acc?.[dayValue]) {
                acc[dayValue].count += dayCount;
            } else {
                acc[dayValue] = { count: dayCount };
            }
            return acc;
        }, {});

        const pad = (n) => String(n).padStart(2, '0');

        // Group days into Sun–Sat weeks. Week key is the Sunday date (YYYY-MM-DD)
        const weekItems = Object.entries(dayItems).reduce(
            (weekAcc, [dateKey, dayData]) => {
                const { weekStart, weekEnd } = getWeekRange(dateKey);
                const weekKey = `${weekStart.getFullYear()}-${pad(
                    weekStart.getMonth() + 1
                )}-${pad(weekStart.getDate())}`;

                if (weekAcc[weekKey]) {
                    weekAcc[weekKey].count += dayData.count;
                } else {
                    weekAcc[weekKey] = {
                        weekStart,
                        weekEnd,
                        count: dayData.count,
                    };
                }
                return weekAcc;
            },
            {}
        );

        return { count, value, items: weekItems };
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
                '/recent_release_days?format=json&nmonths=2',
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
