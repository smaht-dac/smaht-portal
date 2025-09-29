'use strict';

import React, { useCallback } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { layout } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    PortalShutdownWarningModal,
    UserRegistrationModal,
} from './UserRegistrationModal';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import { Popover, PopoverBody } from 'react-bootstrap';

export const LoginNavItem = React.memo(function LoginNavItem(props) {
    const {
        id = 'loginbtn',
        unverifiedUserEmail,
        showLock,
        isLoading,
        isAuth0LibraryLoaded = true,
        className = '',
        disabled = false,
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
                className={
                    'nav-link user-account-item disabled' +
                    (className ? ' ' + className : '')
                }
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
            <LoginButtonWrapper>
                <a
                    role="button"
                    href="#"
                    className={
                        'nav-link user-account-item' +
                        (unverifiedUserEmail ? ' active' : '') +
                        (className ? ' ' + className : '')
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
            </LoginButtonWrapper>
            {/* {unverifiedUserEmail ? <UserRegistrationModal {...props} /> : null} */}{' '}
            {/* // COMMENT OUT AFTER PORTAL REOPENS -- */}
            {unverifiedUserEmail ? (
                <PortalShutdownWarningModal {...props} />
            ) : null}{' '}
            {/* // TO REMOVE AFTER PORTAL REOPENS -- */}
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

export const PortalShutdownPopover = React.forwardRef(
    ({ customId, className, ...props }, ref) => (
        <Popover
            id={customId ?? 'portal-shutdown-info-popover'}
            className="w-auto warning-popover"
            ref={ref}
            {...props}>
            <PopoverBody className="p-0">
                <table className="table">
                    <thead>
                        <tr>
                            <th className="text-left">
                                Limited Access to Portal
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="text-left">
                                The data portal will have limited access from
                                Sept 29 - Oct 10. Please visit again after
                                October 10th, 2025.
                            </td>
                        </tr>
                    </tbody>
                </table>
            </PopoverBody>
        </Popover>
    )
);

export const LoginButtonWrapper = function ({
    children,
    popoverId,
    showPopover = true,
}) {
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    if (!showPopover || !mounted) {
        return children;
    }

    return (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            overlay={(props) => (
                <PortalShutdownPopover customId={popoverId} {...props} />
            )}
            placement="top"
            flip
            popperConfig={{
                modifiers: [
                    {
                        name: 'flip',
                        options: {
                            fallbackPlacements: ['bottom', 'top', 'left'],
                        },
                    },
                ],
            }}>
            {children}
        </OverlayTrigger>
    );
};

export const NotLoggedInAlert = {
    title: 'Not Logged In',
    message: (
        <span>
            You are currently browsing as guest, please{' '}
            {
                <LoginButtonWrapper customId="alert-login-popover">
                    <a
                        onClick={onAlertLoginClick}
                        href="#loginbtn"
                        className="link-underline-hover">
                        login
                    </a>
                </LoginButtonWrapper>
            }{' '}
            if you have an account.
        </span>
    ),
    style: 'warning',
    navigateDisappearThreshold: 2,
};
