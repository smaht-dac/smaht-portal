'use strict';

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';

import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

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
                Alerts.queue({
                    title: 'Confirm your subscription',
                    message: `AWS has emailed a confirmation link to ${user.email}. You must follow it to start receiving data-release emails.`,
                    style: 'success',
                });
            },
            'POST',
            () => {
                setSubmitting(false);
                Alerts.queue({
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
                Alerts.queue({
                    title: 'Unsubscribed',
                    message:
                        'You will no longer receive data-release emails. You can subscribe again at any time.',
                    style: 'success',
                });
            },
            'POST',
            () => {
                setSubmitting(false);
                Alerts.queue({
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
        <div className="card mt-36 data-release-notification-enrollment">
            <div className="card-header">
                <h3 className="">
                    <i className="icon icon-fw icon-envelope fas me-12" />
                    New Data Release - Email Sign Up
                </h3>
            </div>
            <div className="card-body">
                <div className={rowCls} role={subscribed ? 'alert' : undefined}>
                    <p className="mb-0">
                        {subscribed ? (
                            <>
                                You are currently subscribed to{' '}
                                <strong>monthly</strong> emails about new data
                                released on the SMaHT Data Portal.
                            </>
                        ) : (
                            <>
                                I would like to receive <strong>monthly</strong>{' '}
                                emails to notify me about new data released on
                                the SMaHT Data Portal.
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
    );
}

DataReleaseNotificationEnrollment.propTypes = {
    user: PropTypes.shape({
        email: PropTypes.string.isRequired,
        data_release_notification_enrolled: PropTypes.bool,
    }).isRequired,
    onChange: PropTypes.func.isRequired,
};
