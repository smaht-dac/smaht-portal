'use strict';

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const DATA_RELEASE_NOTIFICATION_ENROLLED =
    'data_release_notification_enrolled';

let notificationAvailabilityPromise = null;

function getNotificationAvailability() {
    if (!notificationAvailabilityPromise) {
        notificationAvailabilityPromise = ajax
            .promise('/health/data-release-notifications')
            .catch((error) => {
                notificationAvailabilityPromise = null;
                throw error;
            });
    }
    return notificationAvailabilityPromise;
}

/**
 * Lets a signed-in user subscribe/unsubscribe their own email from the
 * monthly data-release announcement list. Renders nothing until topic
 * availability (`/health/data-release-notifications`) resolves truthy.
 */
export function DataReleaseNotificationEnrollment({ user, onChange }) {
    const [available, setAvailable] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [banner, setBanner] = useState(null);

    useEffect(() => {
        let cancelled = false;
        getNotificationAvailability().then(
            (response) => {
                if (!cancelled) {
                    setAvailable(
                        Boolean(response.data_release_notifications_available)
                    );
                }
            },
            () => {
                if (!cancelled) {
                    setAvailable(false);
                }
            }
        );
        return () => {
            cancelled = true;
        };
    }, []);

    const subscribe = useCallback(() => {
        setSubmitting(true);
        ajax.load(
            '/register_notification',
            () => {
                onChange(true);
                setSubmitting(false);
                setBanner({
                    title: 'Confirm your subscription',
                    message: (
                        <>
                            <b>
                                Important - To complete your subscription to
                                sign up for new data release notice
                            </b>
                            <br />
                            AWS has emailed a confirmation link to {user.email}
                            . Please follow the instructions from AWS to receive
                            emails when new data are released from the SMaHT
                            Data Portal.
                        </>
                    ),
                    style: 'success',
                });
            },
            'POST',
            () => {
                setSubmitting(false);
                setBanner({
                    title: 'Subscription failed',
                    message:
                        'We could not subscribe you to data-release emails. Please try again.',
                    style: 'danger',
                });
            },
            '{}'
        );
    }, [user.email, onChange]);

    const unsubscribe = useCallback(() => {
        setSubmitting(true);
        ajax.load(
            '/deregister_notification',
            () => {
                onChange(false);
                setSubmitting(false);
                setBanner({
                    title: 'Unsubscribed',
                    message:
                        'You will no longer receive data-release emails. You can subscribe again at any time.',
                    style: 'success',
                });
            },
            'POST',
            () => {
                setSubmitting(false);
                setBanner({
                    title: 'Unsubscribe failed',
                    message:
                        'Your subscription was not changed. Please try again.',
                    style: 'danger',
                });
            },
            '{}'
        );
    }, [onChange]);

    if (!available) {
        return null;
    }

    const subscribed = Boolean(user[DATA_RELEASE_NOTIFICATION_ENROLLED]);
    const rowCls =
        'd-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3' +
        (subscribed ? ' alert alert-success mb-0' : '');
    let buttonLabel = subscribed ? 'Unsubscribe' : 'Subscribe';
    if (submitting) {
        buttonLabel = subscribed ? 'Unsubscribing…' : 'Subscribing…';
    }

    return (
        <div className="mt-12 data-release-notification-enrollment">
            {banner ? (
                <div
                    className={`alert alert-${banner.style} alert-dismissible mb-12`}
                    role="alert">
                    <button
                        type="button"
                        className="btn-close"
                        aria-label="Close"
                        onClick={() => setBanner(null)}
                    />
                    <h4 className="alert-heading mt-0 mb-05">
                        {banner.title}
                    </h4>
                    <div className="mb-0">{banner.message}</div>
                </div>
            ) : null}
            <div className="card">
                <div className="card-header">
                    <h3 className="">
                        <i className="icon icon-fw icon-envelope fas me-12" />
                        New Data Release - Email Sign Up
                    </h3>
                </div>
                <div className="card-body">
                    <div
                        className={rowCls}
                        role={subscribed ? 'alert' : undefined}>
                        <p className="mb-0">
                            {subscribed ? (
                                <>
                                    You have subscribed to receive{' '}
                                    <b>monthly</b> emails when new data are
                                    released on the SMaHT Data Portal. If you
                                    have trouble signing up for subscription,
                                    contact the SMaHT Data Analysis Center
                                    through HelpDesk.
                                </>
                            ) : (
                                <>
                                    I would like to receive{' '}
                                    <strong>monthly</strong> emails to notify
                                    me about new data released on the SMaHT
                                    Data Portal.
                                </>
                            )}
                        </p>
                        <button
                            type="button"
                            className={`subscribe-button ${
                                subscribed
                                    ? 'subscribed btn btn-outline-secondary'
                                    : 'btn btn-primary flex-shrink-0'
                            }`}
                            disabled={submitting}
                            onClick={subscribed ? unsubscribe : subscribe}>
                            {buttonLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

DataReleaseNotificationEnrollment.propTypes = {
    user: PropTypes.shape({
        email: PropTypes.string.isRequired,
        data_release_notification_enrolled: PropTypes.bool,
    }).isRequired,
    onChange: PropTypes.func.isRequired,
};
