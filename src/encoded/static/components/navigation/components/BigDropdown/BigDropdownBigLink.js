'use strict';

import React, { useState, useEffect } from 'react';

import { useUserDownloadAccess } from '../../../util/hooks';

export const BigDropdownBigLink = (props) => {
    const {
        children,
        titleIcon = null,
        className = null,
        isActive = false,
        disabled,
        protectedHref,
        href,
        ...passProps // Contains: `href`, `rel`, `onClick`, etc.
    } = props;

    // Allow users with public-restricted or restricted access to see protected links
    const userDownloadAccess = useUserDownloadAccess(props.session);
    const hasRestrictedAccess =
        userDownloadAccess?.['restricted'] ||
        userDownloadAccess?.['public-restricted'] ||
        false;

    // Determine proper href to send users to
    const hrefToUse = disabled
        ? 'javascript:void(0)'
        : hasRestrictedAccess
        ? protectedHref || href
        : href;

    if (!children) return null;

    const textCol = <div className="col">{children}</div>;

    let iconCol = null;

    if (typeof titleIcon === 'string') {
        iconCol = (
            <div className="col-auto icon-beside-column text-end">
                <div>
                    <i className={'icon icon-fw icon-2x icon-' + titleIcon} />
                </div>
            </div>
        );
    } else if (React.isValidElement(titleIcon)) {
        iconCol = (
            <div className="col-auto icon-beside-column text-end">
                {titleIcon}
            </div>
        );
    }

    return (
        <a
            href={hrefToUse}
            data-disabled={disabled ? 'true' : ''}
            aria-disabled={disabled ? 'true' : 'false'}
            {...passProps}
            className={
                'big-link' +
                (className ? ' ' + className : '') +
                (isActive ? ' active' : '')
            }>
            <div className="row align-items-center justify-content-center h-100">
                {iconCol}
                {textCol}
            </div>
        </a>
    );
};
