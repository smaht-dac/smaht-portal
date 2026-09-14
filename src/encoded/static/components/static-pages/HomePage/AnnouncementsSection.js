import React from 'react';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { RightArrowIcon } from '../../util/icon';

// Default announcement data
const announcements = [
    {
        type: 'warning',
        title: 'New Access Regulation',
        date: '2026-03-30',
        body: (
            <span>
                Due to new data access regulations, all SMaHT Data Portal users{' '}
                <b>MUST</b> use an institutional email address to login to the
                Data Portal. <br />
                <br />
                Gmail, yahoo, hotmail, and other free email accounts will be
                prohibited from accessing the Data Portal effective 4/1/26.
            </span>
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
                        timestamp={date}
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
