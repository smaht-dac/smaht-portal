'use strict';

import React from 'react';
import { onAlertLoginClick } from '../navigation/components/LoginNavItem';

/**
 * Render a simple static error page with a link to return to the homepage.
 */
export default class ErrorPage extends React.PureComponent {
    render() {
        const { currRoute, status } = this.props;

        let errorMessage;

        if (status === 'invalid_login') {
            errorMessage = (
                <div>
                    <h3>
                        The account you provided is not valid.{' '}
                        <a href="/" className="link-underline-hover">
                            Return
                        </a>{' '}
                        to the homepage.
                    </h3>
                    <h5>
                        Please note: our authentication system will
                        automatically attempt to log you in through your
                        selected provider if you are already logged in there. If
                        you have an account with SMaHT, please make sure that
                        you are logged in to the provider (e.g. google) with the
                        matching email address.
                    </h5>
                    <h5>Access is restricted to SMaHT consortium members.</h5>
                    <h5>
                        <a
                            href="mailto:smhelp@hms-dbmi.atlassian.net"
                            className="link-underline-hover">
                            Request an account.
                        </a>
                    </h5>
                </div>
            );
        } else if (status === 'not_found') {
            return <HTTPNotFoundView />;
        } else if (status === 'forbidden') {
            return <HTTPForbiddenView />;
        } else {
            errorMessage = (
                <h3>
                    {
                        "The page you've requested does not exist or you have found an error."
                    }{' '}
                    <a href="/" className="link-underline-hover">
                        Return
                    </a>{' '}
                    to the homepage.
                </h3>
            );
        }
        return (
            <div className="error-page text-center container" id="content">
                {errorMessage}
            </div>
        );
    }
}

export const ErrorContainer = React.memo(function ({
    children,
    id = 'content',
}) {
    return (
        <div className="error-page container" id={id}>
            <div className="error-msg-container mt-3 mb-3 row">
                <i className="icon icon-exclamation-circle fas col-auto text-larger" />
                <div className="title-wrapper col">{children}</div>
            </div>
        </div>
    );
});

const HTTPNotFoundView = React.memo(function (props) {
    return (
        <ErrorContainer>
            <h4 className="text-400 mb-0 mt-0">
                {"The page you've requested does not exist."}
            </h4>
            <p className="mb-0 mt-0">
                <a href="/" className="link-underline-hover">
                    Return
                </a>{' '}
                to the homepage.
            </p>
        </ErrorContainer>
    );
});

const HTTPForbiddenView = React.memo(function HTTPForbiddenView(props) {
    return (
        <ErrorContainer>
            <h4 className="text-400 mb-0 mt-0">
                Access was denied to this resource.
            </h4>
            <p className="mb-0 mt-0">
                If you have an account, please try <a onClick={onAlertLoginClick} href="#loginbtn" className="link-underline-hover">logging in</a> or return to the{' '}
                <a href="/" className="link-underline-hover">
                    homepage
                </a>
                .
                <br />
                For instructions on how to set up an account, please visit the
                help page for{' '}
                <a
                    href="/docs/access/creating-an-account"
                    className="link-underline-hover">
                    Creating an Account
                </a>
                .
            </p>
        </ErrorContainer>
    );
});
