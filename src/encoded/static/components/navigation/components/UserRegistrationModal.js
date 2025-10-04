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

    const handleExitLinkClick = React.useCallback((e) => {
        e.preventDefault();
        onRegistrationCancel();
        showLock();
        analytics.event('registration', 'UserRegistrationModal', 'ExitLinkClick');
    }, [onRegistrationCancel, showLock]);

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

    const formHeading = null; // Could customize heading based on whether user is registering via invitation, etc.

    return (
        <Modal show size="modal-dialog modal-lg user-registration-modal" onHide={onRegistrationCancel}>
            <Modal.Header closeButton>
                <Modal.Title className="ps-2 d-flex align-items-center">
                    <img
                        className="me-1"
                        src="/static/img/SMaHT_Vertical-Logo-Solo_FV.png"
                        height="47"
                    />
                    New User - Self Registration
                </Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-4 pb-0">
                <UserRegistrationForm heading={formHeading} schemas={schemas} unverifiedUserEmail={unverifiedUserEmail}
                    onComplete={onRegistrationComplete} onCancel={onRegistrationCancel} onExitLinkClick={handleExitLinkClick} />
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

    const handleClose = () => {
        setShow(false);
        location.reload();
    };

    performLogout();

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
                The SMaHT Data Portal will have limited access from Sept 29 – Oct 10.
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