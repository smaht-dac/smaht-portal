import React from 'react';
import { BrowseLinkIcon } from './BrowseLinkIcon';

export const BrowseLink = (props) => {
    const { type, disabled } = props;
    console.log('BrowseLink', type, disabled);

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
            href={`/browse/?type=${type}&sample_summary.studies=Production&status=released`}
            className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
};
