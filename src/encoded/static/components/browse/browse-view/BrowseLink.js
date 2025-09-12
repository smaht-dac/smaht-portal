import React from 'react';
import { BrowseLinkIcon } from './BrowseLinkIcon';
import { BROWSE_LINKS } from '../BrowseView';

export const BrowseLink = (props) => {
    const {
        type,
        disabled,
        session = false,
        isConsortiumMember = false,
    } = props;

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
        if (session && isConsortiumMember) {
            // Only include released files (assume ProtectedDonor items should not be public)
            hrefToUse = BROWSE_LINKS.protected_donor;
        } else {
            hrefToUse = BROWSE_LINKS.donor;
        }
    } else if (type === 'File') {
        hrefToUse = BROWSE_LINKS.file;
    }

    return (
        <a href={hrefToUse} className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
};
