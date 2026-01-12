import React from 'react';
import { BrowseLinkIcon } from './BrowseLinkIcon';
import { BROWSE_LINKS, BROWSE_STATUS_FILTERS } from '../BrowseView';

export const BrowseLink = (props) => {
    const { type, disabled, session = false, userDownloadAccess = {} } = props;

    let studyField = 'sample_summary.studies';
    let additionalFilters = null;
    if (type === 'Donor' || type === 'ProtectedDonor') {
        studyField = 'study';
        additionalFilters = '&tags=has_released_files';
    }

    // Return a disabled version
    if (disabled) {
        return (
            <div className="browse-link">
                <BrowseLinkIcon {...{ type }} />
                <div className="d-flex flex-column">
                    {type}
                    <span className="text-muted fst-italic text-xs">
                        Coming Soon
                    </span>
                </div>
            </div>
        );
    }

    let hrefToUse = '';

    // Set href based on the type of file
    if (type === 'Donor') {
        // Protected link for consortium members
        if (userDownloadAccess?.['protected']) {
            // Only include released files (assume ProtectedDonor items should not be public)
            hrefToUse = BROWSE_LINKS.protected_donor;
        } else {
            hrefToUse = BROWSE_LINKS.donor;
        }
    } else if (type === 'File') {
        hrefToUse = BROWSE_LINKS.file;
    }

    return (
        <a
            href={
                hrefToUse ||
                `/browse/?type=${type}&${studyField}=Production&${BROWSE_STATUS_FILTERS}${
                    additionalFilters || ''
                }`
            }
            className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
};
