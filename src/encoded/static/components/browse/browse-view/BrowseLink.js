import React from 'react';
import { BrowseLinkIcon } from './BrowseLinkIcon';

export const BrowseLink = (props) => {
    const { type, disabled } = props;

    let studyField = 'sample_summary.studies';
    let additionalFilters = null;
    if (type === 'Donor' || type === 'ProtectedDonor') {
        studyField = 'study';
        additionalFilters = '&tags=has_released_files';
    }

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

    return (
        <a
            href={`/browse/?type=${type}&${studyField}=Production&status=released${additionalFilters || ''}`}
            className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
};
