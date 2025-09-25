'use strict';

import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import Modal from 'react-bootstrap/esm/Modal';

import { analytics } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import UserRegistrationForm from './../../forms/UserRegistrationForm';

// TO REMOVE AFTER PORTAL REOPENS --
import {
    performLogout,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/navigation/components/LoginController';
// TO REMOVE AFTER PORTAL REOPENS --


export const UserRegistrationModal = React.memo(function UserRegistrationModal(
    props
) {
    const {
        schemas,
        onRegistrationCancel,
        showLock,
        unverifiedUserEmail,
        onRegistrationComplete,
    } = props;

    function onExitLinkClick(e) {
        e.preventDefault();
        onRegistrationCancel();
        showLock();
    }

    if (!unverifiedUserEmail) {
        // Error (maybe if user manually cleared cookies or localStorage... idk)
        return (
            <Modal show onHide={onRegistrationCancel}>
                <Modal.Header closeButton>
                    <Modal.Title>Missing Email</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        An error has occurred. Please try to login/register
                        again.
                    </p>
                </Modal.Body>
            </Modal>
        );
    }

    const isEmailAGmail = unverifiedUserEmail.slice(-10) === '@gmail.com';
    function onGoogleLinkClick(e) {
        e.preventDefault();
        analytics.event('Authentication', 'CreateGoogleAccountLinkClick', {
            event_label: 'None',
        });
        window.open(e.target.href);
    }
    const mailtoLink =
        "mailto:smhelp@hms-dbmi.atlassian.net?subject=Account%20Registration%20Request&body=Name%3A%20%3CPlease%20enter%20your%20full%20name%20here%3E%0D%0AEmail%3A%20%3CPlease%20enter%20the%20email%20address%20you'd%20like%20us%20to%20respond%20to%20here%3E%0D%0A%0D%0AOrganization%2FInstitution%3A%20%3CPlease%20enter%20your%20affiliated%20organization%20here%3E%0D%0A%0D%0AComment%3A%20%3CPlease%20enter%20any%20additional%20information%20that%20would%20be%20useful%20to%20us%20in%20verifying%20your%20access%3E";
    const formHeading = (
        <div className="mb-3">
            <h4 className="text-400 mb-2 mt-05">
                An account associated with the email{' '}
                <span className="text-600">{unverifiedUserEmail}</span> does not
                exist in the system.
            </h4>
            <ul className="mt-1">
                <li>
                    Please note that the SMaHT Data Portal is currently under
                    development and is available to consortium members only.
                </li>
                <li>
                    If you are submitting data to SMaHT Data Analysis Center and
                    need to have access now, please click the button below to
                    contact the SMaHT Data Analysis Center DAC team.
                </li>
                <li>
                    More information about account creation can be found{' '}
                    <a
                        href="/docs/access/creating-an-account"
                        target="_blank"
                        rel="noreferrer noopener">
                        here
                    </a>
                    .
                </li>
            </ul>

            <a className="btn w-100 btn-primary mt-2" href={mailtoLink}>
                <i className="icon fas icon-envelope me-05" />
                Request Access
            </a>
            {/*
            <h4 className="text-400 mb-2 mt-05">
                You have never logged in as{' '}
                <span className="text-600">{unverifiedUserEmail}</span> before.
            </h4>
            <ul>
                <li>
                    Please <span className="text-500">register below</span> or{' '}
                    <a href="#" className="text-500" onClick={onExitLinkClick}>
                        use a different email address
                    </a>{' '}
                    if you have an existing account.
                </li>
                <li>
                    For information on the CGAP login process, see our
                    documentation{' '}
                    <a
                        href="/help/logging-in"
                        target="_blank"
                        rel="noreferrer noopener">
                        here.
                    </a>
                </li>
                <li>
                    This registration form will only work on the{' '}
                    <a
                        href="https://cgap-training.hms.harvard.edu"
                        target="_blank"
                        rel="noreferrer noopener">
                        cgap-training
                    </a>{' '}
                    environment. If you are not on this environment, please
                    reach out to the CGAP team for help with account creation.
                </li>
                {isEmailAGmail ? (
                    <li>
                        If you prefer, you can use your institutional email
                        address as your account ID by creating a new google
                        account at{' '}
                        <a
                            href="https://accounts.google.com/signup/v2"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={onGoogleLinkClick}>
                            https://accounts.google.com/signup/v2
                        </a>{' '}
                        and selecting &quot;Use my current email address
                        instead&quot;.
                    </li>
                ) : null}
            </ul>*/}
        </div>
    );

    return (
        <Modal show size="lg" onHide={onRegistrationCancel}>
            <Modal.Header closeButton>
                <Modal.Title>Account Unauthorized</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {/* <UserRegistrationForm
                    heading={formHeading}
                    schemas={schemas}
                    unverifiedUserEmail={unverifiedUserEmail}
                    onComplete={onRegistrationComplete}
                    onCancel={onRegistrationCancel}
                /> */}
                <div
                    className="user-registration-form-container"
                    style={{ position: 'relative' }}>
                    {formHeading}
                </div>
            </Modal.Body>
        </Modal>
    );
});
UserRegistrationModal.propTypes = {
    schemas: PropTypes.object,
    isLoading: PropTypes.bool,
    unverifiedUserEmail: PropTypes.string,
    showLock: PropTypes.func,
    onRegistrationCancel: PropTypes.func,
    onRegistrationComplete: PropTypes.func,
};

// TO REMOVE AFTER PORTAL REOPENS --
export const PortalShutdownWarningModal = React.memo(function (props) {
    const [show, setShow] = useState(true);
    const handleClose = () => setShow(false);

    // Remove jwttoken cookie when component mounts
    useEffect(() => {
        performLogout();
    }, []);

    // since this component is to be removed after portal reopens, the css styles are kept inline for easier removal
    const formHeadingDuringShutdown = (
        <div style={{ textAlign: "center", padding: "10px" }}>
            <div
                style={{
                    width: "88px",
                    height: "88px",
                    margin: "0 auto 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#d26066",
                    fontSize: "4.5rem",
                    opacity: "0.6",
                }}
            >
                <i className="icon icon-file-shield fas" />
            </div>

            <h3
                style={{
                    fontSize: "28px",
                    fontWeight: "500",
                    margin: "0 0 12px",
                    color: "#7a1e1f",
                }}
            >
                Limited Access
            </h3>

            <h4 style={{ fontSize: "16px", fontWeight: "400", marginBottom: "12px" }}>
                The SMaHT Data Portal will have limited access to users
                from Sept 29 – Oct 10.
            </h4>

            <h4 style={{ fontSize: "16px", fontWeight: "400", marginBottom: "0" }}>
                Please return again after October 10th, 2025.
            </h4>
        </div>
    );

    return (
        <Modal
            show={show}
            onHide={handleClose}
            size="md"
            centered
            backdrop={true}
            keyboard={true}
            contentClassName="border-0"
            dialogClassName="p-2"
        >
            <Modal.Body
                style={{
                    borderRadius: "18px",
                    padding: "28px",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                }}
            >
                {formHeadingDuringShutdown}
            </Modal.Body>
        </Modal>
    );
});
// TO REMOVE AFTER PORTAL REOPENS --