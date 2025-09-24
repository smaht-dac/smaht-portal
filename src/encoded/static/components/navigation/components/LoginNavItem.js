'use strict';

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { layout } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { UserRegistrationModal } from './UserRegistrationModal';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';

export const LoginNavItem = React.memo(function LoginNavItem(props) {
    const {
        id = 'loginbtn',
        unverifiedUserEmail,
        showLock,
        isLoading,
        isAuth0LibraryLoaded = true,
        disabled = false,
        popover = null
    } = props;
    const onClick = useCallback(
        function (e) {
            // Prevent setting URL to '#' as might cause navigation away from tab.
            // `useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`
            // See https://reactjs.org/docs/hooks-reference.html#usecallback
            e.preventDefault();
            showLock();
            return false;
        },
        [showLock]
    );

    if (disabled) {
        return (
            <a
                role="button"
                href="#"
                className="nav-link user-account-item disabled"
                id={id}
                onClick={(e) => {
                    e.preventDefault();
                    return false;
                }}>
                <i className="account-icon icon icon-user fas d-inline d-lg-none" />
                <span>Login</span>
            </a>
        );
    }

    return (
        <React.Fragment>
            <OverlayTrigger
                trigger={['hover', 'focus']}
                overlay={popover}
                placement="top"
                flip={true}
                popperConfig={{
                    modifiers: [
                        {
                            name: 'flip',
                            options: {
                                fallbackPlacements: [
                                    'bottom',
                                    'top',
                                    'left',
                                ],
                            },
                        },
                    ],
                }}>
                <a
                    role="button"
                    href="#"
                    className={
                        'nav-link user-account-item' +
                        (unverifiedUserEmail ? ' active' : '')
                    }
                    id={id}
                    onClick={onClick}
                    disabled={!isAuth0LibraryLoaded}>
                    {isLoading ? (
                        <span className="pull-right">
                            <i className="account-icon icon icon-spin icon-circle-notch fas align-middle" />
                        </span>
                    ) : (
                        <React.Fragment>
                            <i className="account-icon icon icon-user fas d-inline d-lg-none" />
                            <span>Login</span>
                        </React.Fragment>
                    )}
                </a>
            </OverlayTrigger>
            {unverifiedUserEmail ? <UserRegistrationModal {...props} /> : null}
        </React.Fragment>
    );
});
LoginNavItem.propTypes = {
    session: PropTypes.bool.isRequired,
    href: PropTypes.string.isRequired,
    id: PropTypes.string,
    windowWidth: PropTypes.number,
    ...UserRegistrationModal.propTypes,
};

/**
 * Somewhat 'wrap-around' but arguably likely cleanest way to open Auth0 login dialog modal
 * from Alert and not require to move up and pass down login-related stuff like `showLock()`.
 */
export const onAlertLoginClick = function (e) {
    e.preventDefault();
    const btnElem = document.getElementById('loginbtn');
    if (btnElem && typeof btnElem.click === 'function') {
        // See https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/click
        btnElem.click();
    }
    return false;
};

export const NotLoggedInAlert = {
    title: 'Not Logged In',
    message: (
        <span>
            You are currently browsing as guest, please{' '}
            <a onClick={onAlertLoginClick} href="#loginbtn" className="link-underline-hover">
                login
            </a>{' '}
            if you have an account.
        </span>
    ),
    style: 'warning',
    navigateDisappearThreshold: 2,
};
