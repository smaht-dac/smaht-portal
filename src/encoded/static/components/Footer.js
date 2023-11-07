'use strict';

import React from 'react';
import PropTypes from 'prop-types';

/**
 * Page footer which is visible on each page.
 * In future could maybe move into app.js since file is so small.
 * But it may get bigger in future also and include things such as privacy policy, about page links, copyright, and so forth.
 * @TODO: When adding more links in future, would be good to completely re-work CSS and just use utility classes
 */
export const Footer = React.memo(function Footer() {
    return (
        <footer id="page-footer">
            <div className="page-footer px-4 text-smaller">
                <div className="row">
                    <div className="col-sm-6">
                        <div className="footer-section copy-notice d-flex align-items-center justify-content-center justify-content-sm-start">
                            <div>
                                SMaHT is funded by the{' '}
                                <a
                                    href="https://commonfund.nih.gov/"
                                    target="_blank"
                                    className="underline"
                                    rel="noopener noreferrer">
                                    NIH Common Fund
                                </a>
                            </div>
                        </div>
                    </div>
                    <div className="col-sm-6">
                        <div className="footer-section copy-notice d-flex align-items-center justify-content-center justify-content-sm-end">
                            <div>
                                <a href="/privacy-policy" className="mr-2">
                                    Privacy Policy
                                </a>{' '}
                                <a href="/legal">Legal</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
});
