'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import Modal from 'react-bootstrap/esm/Modal';

import { analytics } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import UserRegistrationForm from './../../forms/UserRegistrationForm';

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
        <Modal show size="modal-dialog modal-lg" onHide={onRegistrationCancel}>
            <Modal.Header closeButton>
                <Modal.Title className="ps-2 d-flex align-items-center" style={{ fontSize: '1.5rem', fontWeight: '600', color: '#343741' }}>
                    <img
                        className="me-1"
                        src="/static/img/SMaHT_Vertical-Logo-Solo_FV.png"
                        height="47"
                    />
                    New User - Self Registration
                </Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-4">
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
