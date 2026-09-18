'use strict';

import React from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { fallbackCallback, formatDate, getLink } from './utils';

// Mirrors SUBJECT_MAX_LENGTH in encoded/notification_status.py, the
// authoritative guard: SNS caps the Publish Subject at 100 printable ASCII
// characters on one line.
const SUBJECT_MAX_LENGTH = 100;

// The EmailNotification item is written before the send response returns, but
// Previous Messages is read from OpenSearch, which indexes it a few seconds
// later. Retry on a widening delay instead of betting the refresh on a single
// guess at how long indexing takes.
const HISTORY_REFRESH_DELAYS_MS = [3000, 3000, 5000, 8000];

function subjectCounterClass(length) {
    if (length >= SUBJECT_MAX_LENGTH) {
        return 'text-danger';
    }
    if (length > SUBJECT_MAX_LENGTH * 0.9) {
        return 'text-warning';
    }
    return 'text-secondary';
}

// Three outcomes, not two: a send to all subscribers can publish the mail and
// then fail to record it -- not a clean success, and not a failure to respond
// to by sending again.
function sendResultClass(result) {
    if (result.warning) {
        return 'alert-warning';
    }
    return result.success ? 'alert-info' : 'alert-danger';
}

// Appended by SNS to every `Protocol="email"` delivery. Reproduced so the
// preview shows what subscribers receive; correct it here if AWS changes it.
export const AWS_SNS_FOOTER = [
    '--',
    'If you wish to stop receiving notifications from this topic, please click or visit the link below to unsubscribe:',
    'https://sns.<region>.amazonaws.com/unsubscribe.html?SubscriptionArn=<subscription-arn>&Endpoint=<your-email>',
    '',
    'Please do not reply directly to this email. If you have any questions or comments regarding this email, please contact us at https://aws.amazon.com/support',
].join('\n');

/**
 * Renders a notification as SNS delivers it: plain text, no styling. The body
 * sits in a <pre> so newlines and runs of spaces survive even without the
 * stylesheet; a <div> would reflow and make the preview lie.
 */
function PlainTextEmailPreview({ subject, body, className = '' }) {
    return (
        <div className={('ns-email-preview ' + className).trim()}>
            <div className="ns-email-headers">
                <div className="ns-email-header-row">
                    <span className="ns-email-header-name">From</span>
                    <span className="ns-email-header-value">
                        SMaHT New Data Releases &lt;no-reply@sns.amazonaws.com&gt;
                    </span>
                </div>
                {typeof subject === 'string' ? (
                    <div className="ns-email-header-row">
                        <span className="ns-email-header-name">Subject</span>
                        <span className="ns-email-header-value">
                            {subject || (
                                <em className="text-secondary">(no subject)</em>
                            )}
                        </span>
                    </div>
                ) : null}
            </div>

            {body ? (
                <pre className="ns-email-body">{body}</pre>
            ) : (
                <div className="ns-email-body ns-email-placeholder">
                    Your email content will appear here.
                </div>
            )}

            <div className="ns-email-footer">
                <div className="ns-email-footer-label">
                    Appended automatically by AWS SNS — not editable
                </div>
                <pre className="ns-email-footer-text">{AWS_SNS_FOOTER}</pre>
            </div>
        </div>
    );
}

function EmailPreviewModal({ notification, onClose }) {
    return (
        <Modal show size="lg" scrollable onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title as="h5">{notification.subject}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="p-0">
                <PlainTextEmailPreview
                    className="border-0 rounded-0 mw-100"
                    body={notification.body ?? ''}
                />
            </Modal.Body>
            <Modal.Footer>
                <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={onClose}>
                    Close
                </button>
            </Modal.Footer>
        </Modal>
    );
}

// The first of the month `monthOffset` months from now, as YYYY-MM-DD. Built
// from the local calendar components rather than by mutating a Date: `setMonth`
// clamps badly on month ends (Mar 31 minus a month is Mar 3), and toISOString()
// would shift the day across the UTC boundary for anyone west of Greenwich.
function monthStart(monthOffset) {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ReleasedFilesModal({ onClose, onLoad }) {
    // Defaults to the whole of the previous calendar month.
    const [dateFrom, setDateFrom] = React.useState(() => monthStart(-1));
    const [dateTo, setDateTo] = React.useState(() => monthStart(0));
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState(null);
    // Plain string compare: YYYY-MM-DD is fixed-width and sorts lexically.
    const invalidRange = !!dateFrom && !!dateTo && dateFrom > dateTo;
    const handleLoad = () => {
        if (!dateFrom || !dateTo || invalidRange) return;
        setLoading(true);
        setResult(null);
        setError(null);
        ajax.load(
            '/get_released_files_summary/',
            (resp) => {
                setLoading(false);
                if (resp.error) {
                    console.error(resp.error);
                    setError(resp.error);
                    return;
                }
                setResult(resp.text ?? '');
            },
            'POST',
            (errResp, xhr) => {
                setLoading(false);
                setError(
                    'Could not load the release summary. Please try again.'
                );
                fallbackCallback(errResp, xhr);
            },
            JSON.stringify({ date_from: dateFrom, date_to: dateTo })
        );
    };

    const handleUse = () => {
        onLoad(result);
        onClose();
    };

    return (
        <Modal show size="lg" scrollable onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title as="h5">Load Release Summary</Modal.Title>
            </Modal.Header>
            <Modal.Body className="d-flex flex-column gap-3">
                <div>
                    <div className="d-flex flex-wrap align-items-center gap-2">
                        <span className="text-nowrap">
                            Summarize files released
                        </span>
                        <label
                            className="form-label mb-0 text-nowrap"
                            htmlFor="rf-date-from">
                            from
                        </label>
                        <input
                            id="rf-date-from"
                            type="date"
                            className="form-control form-control-sm w-auto"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            required
                        />
                        <label
                            className="form-label mb-0 text-nowrap"
                            htmlFor="rf-date-to">
                            to
                        </label>
                        <input
                            id="rf-date-to"
                            type="date"
                            className="form-control form-control-sm w-auto"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="btn btn-sm btn-primary text-nowrap"
                            onClick={handleLoad}
                            disabled={
                                !dateFrom || !dateTo || invalidRange || loading
                            }>
                            {loading ? (
                                <>
                                    <i className="icon icon-fw fas icon-spinner icon-spin me-1" />
                                    Loading…
                                </>
                            ) : (
                                'Load'
                            )}
                        </button>
                    </div>
                    <small className="text-secondary d-block mt-1">
                        Both ends are inclusive and in UTC: files released from
                        00:00 on the “from” date through 23:59 on the “to”
                        date.
                    </small>
                    {invalidRange ? (
                        <small className="text-danger d-block mt-1">
                            The “from” date must not be after the “to” date.
                        </small>
                    ) : null}
                </div>

                {error ? (
                    <div className="alert alert-danger py-1 px-2 mb-0 small">
                        {error}
                    </div>
                ) : null}

                {result !== null && (
                    <div>
                        <small className="text-secondary d-block mb-1">
                            Result
                        </small>
                        <pre
                            className="border rounded p-2 bg-light small"
                            style={{
                                maxHeight: '300px',
                                overflowY: 'auto',
                            }}>
                            {result}
                        </pre>
                    </div>
                )}
            </Modal.Body>
            <Modal.Footer>
                <button
                    type="button"
                    className="btn btn-sm btn-light"
                    onClick={onClose}>
                    Cancel
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={handleUse}
                    disabled={result === null}>
                    Copy to editor
                </button>
            </Modal.Footer>
        </Modal>
    );
}

// The only copy that differs between the two confirmation dialogs, as data
// rather than as branches inside the component: everything around it is
// identical, and the one thing to check here is which row is the live send.
const CONFIRM_COPY = {
    test: {
        title: 'Send test email',
        confirmLabel: 'Send test email',
        confirmClass: 'btn-primary',
        empty:
            'The dry-run topic has no confirmed subscribers, so this test email' +
            ' would reach nobody. Subscribe an address to the topic and confirm' +
            ' it from that inbox first.',
    },
    all: {
        title: 'Send email to all subscribers',
        confirmLabel: 'Send to all subscribers',
        confirmClass: 'btn-danger',
        empty:
            'This topic has no confirmed subscribers, so this email would reach' +
            ' nobody.',
    },
};

/**
 * Confirms a send by reporting who it reaches, before anything is published.
 *
 * Fetches when it opens rather than behind a Load button: a confirmation the
 * operator has to fetch for themselves is not a confirmation.
 *
 * `test` names the dry-run topic's addresses; `all` reports a count only. The
 * server decides which, so nothing sent from here can ask for the real
 * topic's addresses.
 */
function SendConfirmModal({ target, subject, onConfirm, onClose }) {
    const [loading, setLoading] = React.useState(true);
    const [recipients, setRecipients] = React.useState(null);
    const [error, setError] = React.useState(null);

    const loadRecipients = React.useCallback(() => {
        setLoading(true);
        setError(null);
        ajax.load(
            '/get_email_recipients/',
            (resp) => {
                setLoading(false);
                if (resp.error) {
                    console.error(resp.error);
                    setError(resp.error);
                    return;
                }
                // Counts are the contract both targets share and the only
                // thing the disabled rule reads. Addresses are `null` when
                // withheld -- distinct from `[]`, meaning there are none.
                setRecipients({
                    confirmedCount: resp.confirmed_count ?? 0,
                    pendingCount: resp.pending_count ?? 0,
                    confirmed: resp.confirmed ?? null,
                    pending: resp.pending ?? null,
                });
            },
            'POST',
            (errResp, xhr) => {
                setLoading(false);
                setError('Could not load recipients. Please try again.');
                fallbackCallback(errResp, xhr);
            },
            JSON.stringify({ target })
        );
    }, [target]);

    // Passed directly: `loadRecipients` returns nothing, so React gets no
    // cleanup function. It doubles as the Retry handler below.
    React.useEffect(loadRecipients, [loadRecipients]);

    const copy = CONFIRM_COPY[target];
    const confirmedCount = recipients ? recipients.confirmedCount : 0;
    const pendingCount = recipients ? recipients.pendingCount : 0;
    const loaded = !!recipients && !error;

    return (
        <Modal show size="lg" scrollable onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title as="h5">{copy.title}</Modal.Title>
            </Modal.Header>
            <Modal.Body className="d-flex flex-column gap-3">
                <div className="small">
                    <span className="text-secondary me-2">Subject</span>
                    {subject}
                </div>

                {loading ? (
                    <div className="text-secondary small">
                        <i className="icon icon-fw fas icon-spinner icon-spin me-1" />
                        Loading recipients…
                    </div>
                ) : null}

                {error ? (
                    <div className="alert alert-danger py-1 px-2 mb-0 small">
                        {error}{' '}
                        <button
                            type="button"
                            className="btn btn-link btn-sm p-0 align-baseline"
                            onClick={loadRecipients}>
                            Retry
                        </button>
                    </div>
                ) : null}

                {loaded && confirmedCount === 0 ? (
                    <div className="alert alert-warning py-2 mb-0">
                        {copy.empty}
                    </div>
                ) : null}

                {loaded && confirmedCount > 0 && recipients.confirmed ? (
                    <div>
                        <small className="text-secondary d-block mb-1">
                            Will be sent to {confirmedCount}{' '}
                            {confirmedCount === 1 ? 'address' : 'addresses'}
                        </small>
                        <ul className="list-unstyled ns-recipient-list">
                            {recipients.confirmed.map((email) => (
                                <li key={email}>{email}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}

                {loaded && confirmedCount > 0 && !recipients.confirmed ? (
                    <div>
                        Please confirm that you would like to send this
                        notification to {confirmedCount}{' '}
                        {confirmedCount === 1 ? 'subscriber' : 'subscribers'}.
                    </div>
                ) : null}

                {loaded && pendingCount > 0 ? (
                    <div>
                        <small className="text-secondary d-block mb-1">
                            Invited but not yet confirmed — will not receive
                            this email
                        </small>
                        {recipients.pending ? (
                            <ul className="list-unstyled ns-recipient-list ns-recipient-list-pending">
                                {recipients.pending.map((email) => (
                                    <li key={email}>{email}</li>
                                ))}
                            </ul>
                        ) : (
                            <small className="text-secondary">
                                {pendingCount}{' '}
                                {pendingCount === 1 ? 'address' : 'addresses'}
                            </small>
                        )}
                    </div>
                ) : null}
            </Modal.Body>
            <Modal.Footer>
                <button
                    type="button"
                    className="btn btn-sm btn-light"
                    onClick={onClose}
                    autoFocus>
                    Cancel
                </button>
                <button
                    type="button"
                    className={`btn btn-sm ${copy.confirmClass}`}
                    onClick={onConfirm}
                    disabled={!loaded || confirmedCount === 0}>
                    {copy.confirmLabel}
                </button>
            </Modal.Footer>
        </Modal>
    );
}

class NotificationStatusComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            initialLoading: true,
            loadError: null,
            subject: '',
            subjectSanitized: false,
            bodyText: '',
            notificationType: 'data_release',
            sendingMode: null,
            sendResult: null,
            refreshing: false,
            emailNotifications: [],
            // False until the endpoint says otherwise, so the button is never
            // live before the answer arrives or after a failed load.
            canNotifyAll: false,
            previewNotification: null,
            showReleasedFilesModal: false,
            // null when closed, otherwise the target being confirmed.
            sendConfirmTarget: null,
        };
    }

    componentDidMount() {
        this.getData();
    }

    componentWillUnmount() {
        // Or a pending retry calls setState on an unmounted page.
        clearTimeout(this.historyRefreshTimer);
    }

    getData = (onLoaded) => {
        this.setState({ refreshing: true });
        ajax.load(
            '/get_notification_status/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    // Cleared on every path, or the page spins forever --
                    // which is the branch a non-admin lands on.
                    this.setState({
                        initialLoading: false,
                        refreshing: false,
                        loadError: resp.error,
                    });
                    return;
                }
                this.setState({
                    initialLoading: false,
                    refreshing: false,
                    loadError: null,
                    emailNotifications: resp.email_notifications ?? [],
                    canNotifyAll: resp.can_notify_all === true,
                });
                if (typeof onLoaded === 'function') {
                    onLoaded(resp.email_notifications ?? []);
                }
            },
            'POST',
            (errResp, xhr) => {
                this.setState({
                    initialLoading: false,
                    refreshing: false,
                    loadError:
                        'Could not load notification status. Please try again.',
                });
                fallbackCallback(errResp, xhr);
            },
            JSON.stringify({})
        );
    };

    handleBodyChange = (e) => {
        this.setState({ bodyText: e.target.value });
    };

    // Strip what SNS cannot put in a Subject rather than failing at send time.
    // The realistic case is pasting a curly quote or em dash from a document.
    handleSubjectChange = (e) => {
        const raw = e.target.value;
        const subject = raw
            .replace(/[^\x20-\x7E]/g, '')
            .replace(/^ +/, '')
            .slice(0, SUBJECT_MAX_LENGTH);
        this.setState({ subject, subjectSanitized: subject !== raw });
    };

    openPreview = (notification) => {
        this.setState({ previewNotification: notification });
    };

    closePreview = () => {
        this.setState({ previewNotification: null });
    };

    sendEmail = (target) => {
        const { subject, bodyText, notificationType } = this.state;
        this.setState({ sendingMode: target, sendResult: null });
        ajax.load(
            '/send_notification_email/',
            (resp) => {
                if (resp.error) {
                    this.setState({
                        sendingMode: null,
                        sendResult: { error: resp.error },
                    });
                    return;
                }
                // Branch on target FIRST, then on `recorded`: the same
                // {sent: true, recorded: false} is success for 'test', which
                // never records, and partial failure for 'all', which should.
                if (target !== 'all') {
                    // Keeps the draft: a test send exists to be read,
                    // corrected and sent again.
                    this.setState({
                        sendingMode: null,
                        sendResult: {
                            success: true,
                            message:
                                'Test email sent.',
                        },
                    });
                    return;
                }
                if (!resp.recorded) {
                    // The mail went out; only the history write failed. Must
                    // not read as a failure -- re-sending would mail everyone
                    // twice. Keep the draft, and skip the history refresh.
                    this.setState({
                        sendingMode: null,
                        sendResult: {
                            warning: true,
                            message:
                                'The email was sent to all subscribers, but recording it failed. It will not appear in Previous Messages.',
                        },
                    });
                    return;
                }
                this.setState({
                    sendingMode: null,
                    sendResult: {
                        success: true,
                        message: 'Email sent to all subscribers.',
                    },
                    subject: '',
                    bodyText: '',
                });
                this.refreshHistoryUntilPresent(resp.uuid);
            },
            'POST',
            (errResp, xhr) => {
                this.setState({
                    sendingMode: null,
                    sendResult: {
                        error: 'Request failed. Please try again.',
                    },
                });
                fallbackCallback(errResp, xhr);
            },
            JSON.stringify({
                subject,
                body: bodyText,
                notification_type: notificationType,
                target,
            })
        );
    };

    // Stops as soon as the new message appears rather than after a fixed wait:
    // the delay needed is however long OpenSearch takes to index the item just
    // written, which is not a constant.
    refreshHistoryUntilPresent = (uuid, attempt = 0) => {
        if (attempt >= HISTORY_REFRESH_DELAYS_MS.length) {
            return;
        }
        this.historyRefreshTimer = setTimeout(() => {
            this.getData((notifications) => {
                // Without a uuid to look for -- a response that did not carry
                // one -- the single refresh above is all we do.
                if (!uuid || notifications.some((n) => n.uuid === uuid)) {
                    return;
                }
                this.refreshHistoryUntilPresent(uuid, attempt + 1);
            });
        }, HISTORY_REFRESH_DELAYS_MS[attempt]);
    };

    openReleasedFilesModal = () => {
        this.setState({ showReleasedFilesModal: true });
    };

    closeReleasedFilesModal = () => {
        this.setState({ showReleasedFilesModal: false });
    };

    openTestConfirm = () => {
        this.setState({ sendConfirmTarget: 'test' });
    };

    openAllConfirm = () => {
        this.setState({ sendConfirmTarget: 'all' });
    };

    closeSendConfirm = () => {
        this.setState({ sendConfirmTarget: null });
    };

    // Close, then send: `sendEmail` already owns the result story (the button
    // spinner and the alert beneath it), so the dialog just hands off.
    confirmSend = () => {
        const { sendConfirmTarget } = this.state;
        this.setState({ sendConfirmTarget: null });
        this.sendEmail(sendConfirmTarget);
    };

    appendToBody = (text) => {
        this.setState((prev) => {
            return {
                bodyText: prev.bodyText
                    ? prev.bodyText + '\n\n' + text
                    : text,
            };
        });
    };

    render() {
        const {
            initialLoading,
            loadError,
            subject,
            subjectSanitized,
            bodyText,
            notificationType,
            sendingMode,
            sendResult,
            refreshing,
            emailNotifications,
            canNotifyAll,
            previewNotification,
            showReleasedFilesModal,
            sendConfirmTarget,
        } = this.state;

        if (initialLoading) {
            return (
                <div className="p-5 text-center">
                    <i className="icon icon-fw fas icon-spinner icon-spin me-1"></i>
                    Loading
                </div>
            );
        }

        if (loadError) {
            return (
                <div className="alert alert-danger" role="alert">
                    {loadError}
                </div>
            );
        }

        return (
            <div className="d-flex flex-column gap-4">
                {/* Compose section */}
                <div>
                    <div className="d-flex align-items-center border-bottom pb-2 mb-2">
                        <h5 className="mb-0">Compose Email</h5>
                    </div>

                    <div className="d-flex flex-row gap-2 ns-editor-pane">
                        {/* Left pane — plain-text editor */}
                        <div className="d-flex flex-column col-6 p-0">
                            <div className="d-flex align-items-center justify-content-between mb-1">
                                <small className="text-secondary">Subject</small>
                                <small
                                    className={subjectCounterClass(
                                        subject.length
                                    )}>
                                    {subject.length}/{SUBJECT_MAX_LENGTH}
                                </small>
                            </div>
                            <input
                                id="ns-subject"
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Email subject…"
                                maxLength={SUBJECT_MAX_LENGTH}
                                value={subject}
                                onChange={this.handleSubjectChange}
                            />
                            <small className="text-secondary mb-2 ns-subject-hint">
                                {subjectSanitized
                                    ? 'Removed characters SNS cannot send in a subject.'
                                    : '\u00a0'}
                            </small>
                            <div className="d-flex align-items-center justify-content-between mb-1">
                                <small className="text-secondary">
                                    Email body (plain text)
                                </small>
                                <button
                                    type="button"
                                    className="btn btn-xs btn-primary"
                                    onClick={this.openReleasedFilesModal}>
                                    Load release summary
                                </button>
                            </div>
                            <textarea
                                className="form-control flex-grow-1 ns-textarea"
                                placeholder="Write your email content as plain text…"
                                value={bodyText}
                                onChange={this.handleBodyChange}
                            />
                            <small className="text-secondary mt-2 mb-1">
                                Notification type (only used internally)
                            </small>
                            <select
                                id="ns-notification-type"
                                className="form-select form-select-sm"
                                value={notificationType}
                                onChange={(e) =>
                                    this.setState({
                                        notificationType: e.target.value,
                                    })
                                }>
                                <option value="data_release">
                                    Data release
                                </option>
                                <option value="maintenance">Maintenance</option>
                                <option value="general_update">
                                    General update
                                </option>
                            </select>
                            <div className="d-flex gap-2 mt-2 w-100">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary flex-fill"
                                    onClick={this.openTestConfirm}
                                    disabled={
                                        !subject ||
                                        !bodyText ||
                                        sendingMode !== null
                                    }>
                                    {sendingMode === 'test' ? (
                                        <>
                                            <i className="icon icon-fw fas icon-spinner icon-spin me-1" />
                                            Sending…
                                        </>
                                    ) : (
                                        'Send test email'
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-primary flex-fill"
                                    onClick={this.openAllConfirm}
                                    disabled={
                                        !subject ||
                                        !bodyText ||
                                        sendingMode !== null ||
                                        !canNotifyAll
                                    }>
                                    {sendingMode === 'all' ? (
                                        <>
                                            <i className="icon icon-fw fas icon-spinner icon-spin me-1" />
                                            Sending…
                                        </>
                                    ) : (
                                        'Send email to all subscribers'
                                    )}
                                </button>
                            </div>
                            {!canNotifyAll ? (
                                <div className="text-secondary small mt-2">
                                    Your account can send test emails only.
                                    Contact the project manager to send an
                                    announcement to all subscribers.
                                </div>
                            ) : null}
                            {sendResult ? (
                                <div
                                    className={`alert ${sendResultClass(
                                        sendResult
                                    )} py-1 px-2 mt-2 mb-0 small`}>
                                    {sendResult.message ?? sendResult.error}
                                </div>
                            ) : null}
                        </div>

                        {/* Right pane — email preview */}
                        <div className="d-flex flex-column col-6 p-0 overflow-auto">
                            <small className="text-secondary fw-bold mb-1">
                                Preview
                            </small>
                            <PlainTextEmailPreview
                                subject={subject}
                                body={bodyText}
                            />
                        </div>
                    </div>
                </div>

                {/* Previous Messages section */}
                <div>
                    <div className="d-flex align-items-center border-bottom pb-2 mb-2">
                        <h5 className="mb-0">Previous Messages</h5>
                        <span className="pt-2">
                            <i
                                className={`icon icon-fw fas icon-sync ms-2${
                                    refreshing ? ' icon-spin' : ' clickable'
                                }`}
                                onClick={refreshing ? undefined : this.getData}
                                data-tip="Refresh"
                            />
                        </span>
                    </div>
                    {emailNotifications.length === 0 ? (
                        <div className="text-secondary fst-italic">
                            No emails have been sent yet to subscribed users.
                        </div>
                    ) : (
                        <table className="table table-hover table-striped table-bordered table-sm">
                            <thead>
                                <tr>
                                    <th className="text-start">Subject</th>
                                    <th className="text-start">Type</th>
                                    <th className="text-start">Sent By</th>
                                    <th className="text-start">Date Sent</th>
                                    <th className="text-start"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {emailNotifications.map((n) => (
                                    <tr key={n.uuid}>
                                        <td className="text-start">
                                            {getLink(n.uuid, n.subject)}
                                        </td>
                                        <td>{n.notification_type ?? '—'}</td>
                                        <td>
                                            {n.sent_by
                                                ? getLink(
                                                    n.sent_by.uuid,
                                                    n.sent_by.display_title
                                                )
                                                : '—'}
                                        </td>
                                        <td>
                                            {n.date_sent
                                                ? formatDate(n.date_sent)
                                                : '—'}
                                        </td>
                                        <td>
                                            <a
                                                className="ss-link"
                                                onClick={() =>
                                                    this.openPreview(n)
                                                }>
                                                Show email
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {previewNotification && (
                    <EmailPreviewModal
                        notification={previewNotification}
                        onClose={this.closePreview}
                    />
                )}

                {showReleasedFilesModal && (
                    <ReleasedFilesModal
                        onClose={this.closeReleasedFilesModal}
                        onLoad={this.appendToBody}
                    />
                )}

                {sendConfirmTarget && (
                    <SendConfirmModal
                        target={sendConfirmTarget}
                        subject={subject}
                        onConfirm={this.confirmSend}
                        onClose={this.closeSendConfirm}
                    />
                )}
            </div>
        );
    }
}

export const NotificationStatus = React.memo(function NotificationStatus(
    props
) {
    return <NotificationStatusComponent {...props} />;
});
