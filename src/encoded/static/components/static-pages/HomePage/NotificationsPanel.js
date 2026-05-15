import React from 'react';
import { DataReleaseTracker } from './DataReleaseTracker';
import { AnnouncementsSection } from './AnnouncementsSection';

const FILTERD_SOMATIC_VARIANTS_URL =
    '/browse/?analysis_details=Filtered&data_category=Somatic Variant Calls&donors.donor_groups=First 25 Donors [P25]&type=File';

/**
 * NotificationsPanel component displays a panel containing the data release
 * tracker, the announcements section, and other relevant links/information.
 * @returns {JSX.Element} The rendered NotificationsPanel component.
 */
export const NotificationsPanel = (props) => {
    const { session } = props;
    return (
        <div className="notifications-panel container">
            <div className="section data-freeze">
                <h3 className="section-header">
                    P25 Data Freeze
                    <i
                        className="icon icon-fw icon-info-circle fas ms-1"
                        data-tip="P25 represents the first 25 donors in the P25 cohort. The P25 cohort is a subset of the P25 cohort, which is a subset of the first 25 donors in the cohort."></i>
                </h3>
                <a className="p25-link" href={FILTERD_SOMATIC_VARIANTS_URL}>
                    <span>
                        <i className="icon icon-fw icon-filter fas me-1"></i>
                        Filtered Somatic Variants
                    </span>
                </a>
            </div>
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
