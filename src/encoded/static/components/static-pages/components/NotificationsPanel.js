import React from 'react';
import { Card } from 'react-bootstrap';

export const NotificationsPanel = ({ alerts }) => {
    return (
        <div className="notifications-panel container">
            <div className="data-release-tracker section">
                <h3 className="section-header">Data Release Tracker</h3>
                <div className="section-body"></div>
            </div>
            <div className="announcements section">
                <h3 className="section-header">Announcements</h3>
                <div className="section-body">
                    {alerts.map((alert, index) => {
                        return (
                            <div className="announcement-container">
                                {alert.message}
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="about-consortium mb-3 section">
                <h3 className="section-header">About the Consortium</h3>
                <div className="section-body">
                    <div className="about-consortium-links">
                        <div className="link-container">
                            <a
                                href="https://commonfund.nih.gov/smaht"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                NIH SMaHT Homepage
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                        <div className="link-container">
                            <a
                                href="https://www.smaht.org"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                SMaHT OC Homepage
                                <i className="icon-external-link-alt icon icon-xs fas ml-2" />
                            </a>
                        </div>
                        <div className="link-container">
                            <a
                                href="https://www.youtube.com/watch?v=8KX3lkMB5nU"
                                target="_blank"
                                rel="noreferrer noopener"
                                role="button"
                                className="py-2 btn">
                                SMaHT Overview Video
                                <i className="icon-external-link-alt icon text-xs fas ml-2" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
