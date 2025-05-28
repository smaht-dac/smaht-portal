'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';

import {
    JWT,
    isServerSide,
    object,
    console,
    memoizedUrlParse,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import {
    LoginController,
    LogoutController,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/navigation/components/LoginController';

import { LoginNavItem } from './LoginNavItem';
import {
    BigDropdownNavItem,
    BigDropdownIntroductionWrapper,
} from './BigDropdown';

/** Specific to CGAP */
export const auth0Options = {
    auth: {
        sso: false,
        redirect: false,
        responseType: 'token',
        params: {
            scope: 'openid email',
            prompt: 'select_account',
        },
    },
    socialButtonStyle: 'big',
    // Use SMaHT Logo
    theme: {
        logo: '/static/img/SMaHT_Vertical-Logo-Solo_FV.png',
        icon: '/static/img/SMaHT_Vertical-Logo-Solo_FV.png',
        primaryColor: '#1b75b9',
    },
    allowedConnections: ['partners', 'hms-it', 'bch', 'google-oauth2'],
    defaultEnterpriseConnection: 'partners',
    languageDictionary: {
        title: 'Log In',
        emailInputPlaceholder: 'Partners, Harvard/BCH Email',
        databaseEnterpriseAlternativeLoginInstructions: 'or login via Email',
    },
};

/**
 * @typedef {Object} Action
 * @property {string|function} url - URL of action. If function, takes in currentHref as parameter.
 * @property {string} title Title of action.
 * @property {boolean|function} active - Whether action is currently active.
 */

/**
 * React-Bootstrap Dropdown with User Action menu items.
 *
 * @todo Refactor this into a BigDropdown menu.
 */
export const AccountNav = React.memo(function AccountNav(props) {
    const { session, updateAppSessionState, schemas, ...passProps } = props;
    const { windowWidth, href } = passProps;

    if (!session) {
        const auth0PopupText =
            '<p><span class="text-danger fw-bold">NOTE</span> - If you are logging-in for the first time, please <a href="https://data.smaht.org/docs/access/creating-an-account" target="_blank">READ THIS DOCUMENT PAGE</a> about creating your account!<p>';
        // Render login button
        return (
            <div className="navbar-nav navbar-acct">
                <HelpdeskButton />
                <LoginController
                    {...{
                        updateAppSessionState,
                        auth0Options,
                        auth0PopupText,
                    }}>
                    <LoginNavItem
                        {...{ schemas, session, href, windowWidth }}
                        key="login-register"
                        className="user-account-item"
                    />
                </LoginController>
            </div>
        );
    }

    const { details: userDetails = {}, user_actions: userActions = [] } =
        JWT.getUserInfo() || {};
    const { first_name = '', last_name = '', email } = userDetails;

    const acctIcon = (typeof email === 'string' &&
        email.indexOf('@') > -1 &&
        object.itemUtil.User.gravatar(
            email,
            30,
            { className: 'account-icon-image' },
            'mm'
        )) || <i className="account-icon icon icon-user fas" />;

    const cls =
        'user-account-item is-logged-in is-dropdown' +
        (acctIcon && acctIcon.type === 'img' ? ' has-image' : '');

    // Use initials when provided
    let accountTitle =
        first_name && last_name
            ? (first_name + ' ' + last_name)
                  .split(' ')
                  .map((s) => s[0].toUpperCase())
                  .join('')
            : 'Account';

    const navItemTitle = (
        <React.Fragment>
            {acctIcon}
            <span className="user-first-name">{accountTitle}</span>
        </React.Fragment>
    );

    // `navItemProps` contains: href, windowHeight, windowWidth, isFullscreen, testWarning, mounted, overlaysContainer
    return (
        <div className="navbar-nav navbar-acct">
            <HelpdeskButton />
            <BigDropdownNavItem
                {...passProps}
                {...{ windowWidth, href }}
                id="account-menu-item"
                navItemContent={navItemTitle}
                className={cls}>
                <UserActionsMenu
                    {...{ userActions, href, userDetails, windowWidth }}
                />
            </BigDropdownNavItem>
        </div>
    );
});
AccountNav.propTypes = {
    session: PropTypes.bool.isRequired /** Passed in by App */,
    href: PropTypes.string.isRequired /** Passed in by Redux store */,
    updateAppSessionState: PropTypes.func.isRequired /** Passed in by App */,
    mounted: PropTypes.bool /** Passed in by Navigation */,
};

function UserActionsMenu(props) {
    const { userActions, href, userDetails, windowWidth, windowHeight } = props;
    const { first_name: firstName = 'Account', last_name: lastName = null } =
        userDetails;
    const introTitle = firstName + (lastName ? ' ' + lastName : '');

    const viewProfileAction = _.findWhere(userActions, { id: 'profile' });
    const viewProfileURL =
        (viewProfileAction && viewProfileAction.href) || '/me';

    const renderedActions = userActions.map(function (action, idx) {
        const { id: actionID, title: actionTitle } = action;
        const targetHref = getActionURL(action, href);
        const isActive = isActionActive(action, href);
        let prepend = null;
        if (actionID === 'impersonate') {
            prepend = <i className="icon icon-fw icon-user-secret fas me-07" />;
        }
        if (actionID === 'profile') {
            prepend = <i className="icon icon-fw icon-user fas me-07" />;
        }
        // if (actionID === 'submissions') {
        //     prepend = <i className="icon icon-fw icon-file-import fas me-07" />;
        // }
        return (
            <div
                className={
                    'level-1-title-container' + (isActive ? ' active' : '')
                }
                key={actionID}>
                <a
                    className="level-1-title text-medium d-block"
                    href={getActionURL(action, href)}
                    id={'menutree-linkto-' + targetHref.replace(/\//g, '_')}>
                    {prepend}
                    <span>{actionTitle}</span>
                </a>
            </div>
        );
    });

    const introBlock = (
        <BigDropdownIntroductionWrapper
            titleIcon="user fas"
            className="mb-0 border-0"
            {...{ windowWidth, windowHeight }}>
            <h4 className="mb-0 mt-0 text-truncate">
                <a href={viewProfileURL}>{introTitle}</a>
            </h4>
            <div className="description">Manage your account</div>
        </BigDropdownIntroductionWrapper>
    );

    return (
        <React.Fragment>
            <div className="tree-menu-container row justify-content-between">
                <div className="col-12 col-lg-6 align-self-center">
                    {introBlock}
                </div>
                <div className="help-menu-tree level-1-no-child-links level-1 col-12 col-lg-4 mt-2">
                    {renderedActions}
                    <LogoutController>
                        <LogoutLink />
                    </LogoutController>
                </div>
            </div>
        </React.Fragment>
    );
}

function LogoutLink({ performLogout, isLoading = false }) {
    return (
        <div className="level-1-title-container">
            <a
                className="level-1-title text-medium d-block"
                onClick={performLogout}
                id="logoutbtn"
                href="#">
                <i
                    className={
                        'icon icon-fw fas me-07 icon-' +
                        (isLoading ? 'spin icon-circle-notch' : 'sign-out-alt')
                    }
                />
                <span>Log Out</span>
            </a>
        </div>
    );
}

// Various utility functions

/**
 * Tests if an action is currently active, according to its URL or 'active' key.
 *
 * @param {Action} action - Action to test.
 * @param {string} currentHref - Current URI, if available.
 * @returns {boolean} Whether this action is to be displayed as active or not.
 */
export function isActionActive(action, currentHref) {
    const hrefParts = memoizedUrlParse(currentHref);
    const hrefPath = (hrefParts.pathname || '/') + (hrefParts.search || '');
    return (
        (typeof action.active === 'function' && action.active(hrefPath)) ||
        getActionURL(action, currentHref) === hrefPath
    );
}

/**
 * Gets URL for an action. Handles cases where `action.url` is a function rather than a string and executes it.
 *
 * @param {Action} action - Action to test.
 * @param {string} currentHref - Current URI, if available.
 * @returns {string} URL of action, or `#` if none available.
 */
export function getActionURL(action, currentHref) {
    if (typeof action.url === 'string') return action.url;
    if (typeof action.href === 'string') return action.href;

    const hrefParts = memoizedUrlParse(currentHref);
    if (typeof action.url === 'function') return action.url(hrefParts);
    if (typeof action.href === 'function') return action.href(hrefParts);
    return '#';
}

const HelpdeskButton = React.memo(function HelpdeskButton(props) {
    // @TODO: Consider adding cool features like browser recognition, etc. from CGAP (if so, move whole thing to SPC probably)
    const mailto =
        'mailto:smhelp@hms-dbmi.atlassian.net?subject=Helpdesk%20Inquiry%20from%20data.smaht.org&body=Name%3A%0D%0AContact%20Information%20(so%20we%20can%20get%20back%20to%20you!)%3A%0D%0A%0D%0AQuestions%2FComments%3A%0D%0A%0D%0A';

    return (
        <a role="button" href={mailto} className="helpdesk nav-link">
            <i className="icon icon-envelope fas" />
            Helpdesk
        </a>
    );
});
