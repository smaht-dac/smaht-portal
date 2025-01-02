import React from 'react';
import { BrowseLinkIcon } from './BrowseLinkIcon';

export const BrowseLink = React.memo(function BrowseLink(props) {
    const { type, disabled } = props;

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
        <a href={`/browse/?type=${type}`} className="browse-link">
            <BrowseLinkIcon {...{ type }} />
            {type}
        </a>
    );
});
