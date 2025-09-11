import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { RightArrowIcon } from '../../util/icon';

/**
 * Toggle hook
 */
const useToggle = (initialState = false) => {
    const [isToggled, setIsToggled] = useState(initialState);
    const toggle = () => setIsToggled(!isToggled);
    return [isToggled, toggle];
};

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

const TissueGroup = ({ count, tissue_group, items }) => {
    const [isToggled, toggle] = useToggle();

    return (
        <li>
            <button className="toggle-button tissue" onClick={() => toggle()}>
                <i
                    className={`icon icon-${isToggled ? 'minus' : 'plus'} fas`}
                />
            </button>
            <a>{tissue_group}</a>
            {isToggled ? (
                <ul>
                    {items.map((item, i) => (
                        <li key={i}>
                            {item?.count} {item?.value}
                        </li>
                    ))}
                </ul>
            ) : null}
        </li>
    );
};

const DonorGroup = ({
    count,
    donorGroups: donor_groups,
    donorGroup: donor_group,
    items,
}) => {
    const [isToggled, toggle] = useToggle();

    let donor_title = donor_group;

    if (donor_title?.includes('DAC_DONOR_')) {
        donor_title = donor_title.replace('DAC_DONOR_', '');
    }

    return (
        <div className="release-item">
            <a className="title">
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
                {donor_title}
                {/* - {donor_groups[donor_group].count} Files */}
                <RightArrowIcon />
            </a>
            {isToggled ? (
                <ul className="tissue-list">
                    {Object.keys(donor_groups[donor_group]['items']).map(
                        (tissue_group, i) => {
                            const { count, query } =
                                donor_groups[donor_group]['items'][
                                    tissue_group
                                ];
                            return (
                                <TissueGroup
                                    key={i}
                                    count={count}
                                    tissue_group={tissue_group}
                                    items={
                                        donor_groups[donor_group]['items'][
                                            tissue_group
                                        ].items
                                    }
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
 * @param {*} data - The data object containing release information.
 * @param {*} releaseItemIndex - The index of the release item.
 * @returns {JSX.Element} The rendered DataReleaseItem component.
 */
const DataReleaseItem = ({ data, releaseItemIndex }) => {
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
                    <a className="header-link" href={query}>
                        <span>
                            {releaseItemIndex === 0 ? 'Latest: ' : ''}
                            {month} {year}
                        </span>
                        <span className="count">
                            {count} {count > 1 ? 'Files' : 'File'}
                            <i className="icon icon-arrow-right"></i>
                        </span>
                    </a>
                </div>
                <div className="body">
                    {Object.keys(donor_groups).map((donor_group, i) => {
                        return (
                            <DonorGroup
                                key={i}
                                donorGroups={donor_groups}
                                donorGroup={donor_group}
                                items={donor_groups[donor_group].items}
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
 * @param {} data
 * @returns
 */
const formatReleaseData = (data) => {
    return data.map((month) => {
        // Format each month by grouping items by donor and tissue
        const formattedItems = month?.items?.reduce((acc, item) => {
            const { count, value, items } = item;

            // Pull out Donor and add to [acc]
            const [donor, tissue] = value?.split('-');
            const tissueCode = items?.[0]?.['additional_value'] ?? '';
            const tissueTitle = tissueCode
                ? tissueCode + ' - ' + tissue
                : tissue;

            const tissue_items = item?.items;

            // Create a new entry for the donor if it doesn't exist
            if (!acc?.[donor]) {
                // Place tissue items into new donor group
                const new_donor_items = {
                    [tissueTitle]: { items: tissue_items, count },
                };
                acc[donor] = {
                    items: new_donor_items,
                    count,
                };
            } else {
                // Append new tissue category if it doesn't exist on donor
                if (!acc?.[donor]?.items?.[tissueTitle]) {
                    acc[donor].items[tissueTitle] = {
                        items: tissue_items,
                        count,
                    };

                    // Add count to donor total
                    acc[donor].count += count;
                } else {
                    // Simply add to existing tissue category
                    acc[donor].items[tissueTitle].items.push(...tissue_items);

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

export const NotificationsPanel = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        ajax.load(
            '/recent_files_summary?format=json&nmonths=3',
            (resp) => {
                setData(resp?.items ?? []);
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
                                <div className="text-center text-muted py-3">
                                    No recent data releases found.
                                </div>
                            ) : (
                                data.map((releaseItem, i) => (
                                    <DataReleaseItem
                                        data={releaseItem}
                                        key={i}
                                        releaseItemIndex={i}
                                    />
                                ))
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
