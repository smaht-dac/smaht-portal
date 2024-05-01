'use strict';
import React from 'react';

export const formatDate = (date_str) => {
    if (!date_str) {
        return '';
    }
    const date_options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    };
    const date = new Date(date_str);

    return date.toLocaleDateString('en-US', date_options);
}

export const getLink = (identifier, title) => {
    const href = '/' + identifier;
    return (
        <a href={href} target="_blank">
            {title}
        </a>
    );
}

export const createBadge = (type, description) => {
    const cn = 'badge text-white badge-' + type;
    return <span className={cn}>{description}</span>;
}

export const createWarningIcon = () => {
    return (
        <span className="p-1 text-large text-warning">
            <i className="icon fas icon-exclamation-triangle icon-fw"></i>
        </span>
    );
}

export const fallbackCallback = (errResp, xhr) => {
    // Error callback
    console.error(errResp);
};
