'use strict';

import React from 'react';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export function BigDropdownBigLink(props) {
    const {
        children,
        titleIcon = null,
        className = null,
        isActive = false,
        disabled,
        href,
        ...passProps // Contains: `href`, `rel`, `onClick`, etc.
    } = props;

    if (!children) return null;

    const textCol = <div className="col">{children}</div>;

    let iconCol = null;

    if (typeof titleIcon === 'string') {
        iconCol = (
            <div className="col-auto icon-beside-column text-end">
                <i className={'icon icon-fw icon-2x icon-' + titleIcon} />
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
            href={disabled ? href : '#'}
            data-disabled={disabled ? 'true' : ''}
            aria-disabled={disabled ? 'true' : 'false'}
            {...passProps}
            className={
                'big-link' +
                (className ? ' ' + className : '') +
                (isActive ? ' active' : '')
            }>
            <div className="row align-items-center">
                {iconCol}
                {textCol}
            </div>
        </a>
    );
}
