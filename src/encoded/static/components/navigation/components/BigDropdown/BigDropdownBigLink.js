'use strict';

import React, { useState, useEffect } from 'react';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const BigDropdownBigLink = (props) => {
    const {
        children,
        titleIcon = null,
        className = null,
        isActive = false,
        disabled,
        protectedHref,
        href,
        checkUserPermissions,
        ...passProps // Contains: `href`, `rel`, `onClick`, etc.
    } = props;
    const [isConsortiumMember, setIsConsortiumMember] = useState(false);

    // Note: should abstract and place in a custom hook
    useEffect(() => {
        if (props?.checkUserPermissions) {
            // Request session information
            ajax.load(
                `/session-properties`,
                (resp) => {
                    console.log('checking for permission', resp);
                    // Check if user is a member of SMaHT consortium
                    const isConsortiumMember =
                        resp?.details?.consortia?.includes(
                            '358aed10-9b9d-4e26-ab84-4bd162da182b'
                        );
                    setIsConsortiumMember(isConsortiumMember);
                },
                'GET',
                (err) => {
                    if (err.notification !== 'No results found') {
                        console.log(
                            'ERROR determining user consortium membership',
                            err
                        );
                    }
                    setIsConsortiumMember(false);
                }
            );
        }
    }, []);

    // Determine proper href to send users to
    const hrefToUse = disabled
        ? 'javascript:void(0)'
        : isConsortiumMember
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
