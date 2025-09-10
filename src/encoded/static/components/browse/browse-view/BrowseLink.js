import React, { useState, useEffect } from 'react';
import { BrowseLinkIcon } from './BrowseLinkIcon';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

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
            hrefToUse =
                '/browse/?type=ProtectedDonor&study=Production&tags=has_released_files';
        } else {
            hrefToUse =
                '/browse/?type=Donor&study=Production&tags=has_released_files';
        }
    } else if (type === 'File') {
        hrefToUse = '/browse/?type=File&sample_summary.studies=Production';
    }

    return (
        <a href={hrefToUse} className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
};
