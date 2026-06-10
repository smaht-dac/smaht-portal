import React, { useState, useEffect } from 'react';
import { DataReleaseTracker } from './DataReleaseTracker';
import { AnnouncementsSection } from './AnnouncementsSection';
import { Popover, OverlayTrigger } from 'react-bootstrap';
import { useUserDownloadAccess } from '../../util/hooks';

const FILTERD_SOMATIC_VARIANTS_URL =
    '/browse/?analysis_details=Filtered&analysis_details=Phased&data_category=Somatic+Variant+Calls&data_category=Germline+Variant+Calls&dataset%21=No+value&donors.donor_groups=First+25+Donors+%5BP25%5D&sample_summary.studies=Production&sort=-file_status_tracking.release_dates.initial_release_date&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&type=File';

/**
 * NotificationsPanel component displays a panel containing the data release
 * tracker, the announcements section, and other relevant links/information.
 * @returns {JSX.Element} The rendered NotificationsPanel component.
 */
export const NotificationsPanel = (props) => {
    const { userDownloadAccess, isAccessResolved } = useUserDownloadAccess(
        props.session
    );

    const { session } = props;
    const popover = (
        <Popover className="download-popover">
            <Popover.Header as="h3">P25 Data Freeze</Popover.Header>
            <Popover.Body>
                Filtered Somatic and germline variant call sets from the first
                25 donors analyzed for the P25 paper.
            </Popover.Body>
        </Popover>
    );
    return (
        <div className="notifications-panel container">
            {isAccessResolved && userDownloadAccess?.['open-network'] && (
                <div className="section data-freeze">
                    <h3 className="section-header">
                        <OverlayTrigger
                            trigger={['hover', 'focus']}
                            placement="left"
                            overlay={popover}>
                            <span>
                                P25 Data Freeze
                                <i className="icon icon-fw icon-info-circle fas ms-1"></i>
                            </span>
                        </OverlayTrigger>
                    </h3>
                    <a className="consortium-hub-link" href={'/consortium-hub'}>
                        <span>
                            <i className="icon icon-fw icon-users fas me-1"></i>
                            SMaHT Consortium Hub
                        </span>
                    </a>
                </div>
            )}
            <DataReleaseTracker session={session} />
            <AnnouncementsSection />
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
