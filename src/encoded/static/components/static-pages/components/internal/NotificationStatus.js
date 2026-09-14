'use strict';

import React from 'react';
import Markdown from 'markdown-to-jsx';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { fallbackCallback, formatDate, getLink } from './utils';

function EmailTemplate({ children, className = '' }) {
    return (
        <div className={('ns-email-preview ' + className).trim()}>
            <div className="ns-email-header">
                <img
                    className="smaht-logo"
                    src="/static/img/SMaHT_Vertical-Logo-Solo_FV.png"
                    height="50"
                />{' '}
                SMaHT Data Portal Notification
            </div>
            <div className="ns-email-body">{children}</div>
            <div className="ns-email-footer">
                You received this email because you are subscribed to SMaHT Data
                Portal notifications. You can unsubscribe at any time by going
                to your account settings on the SMaHT Data Portal.
            </div>
        </div>
    );
}

function EmailPreviewModal({ notification, onClose }) {
    return (
        <React.Fragment>
            <div className="modal fade show d-block" role="dialog">
                <div
                    className="modal-dialog modal-lg modal-dialog-scrollable"
                    role="document">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">
                                {notification.subject}
                            </h5>
                            <button
                                type="button"
                                className="btn-close"
                                onClick={onClose}
                                aria-label="Close"
                            />
                        </div>
                        <div className="modal-body p-0">
                            <EmailTemplate className="border-0 rounded-0 mw-100">
                                <Markdown>{notification.body ?? ''}</Markdown>
                            </EmailTemplate>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={onClose}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" onClick={onClose} />
        </React.Fragment>
    );
}

function ReleasedFilesModal({ onClose, onLoad }) {
    const [date, setDate] = React.useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 10);
    });
    const [loading, setLoading] = React.useState(false);
    const [result, setResult] = React.useState(null);
    const handleLoad = () => {
        if (!date) return;
        setLoading(true);
        setResult(null);
        ajax.load(
            '/get_released_files_markdown/',
            (resp) => {
                setLoading(false);
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                setResult(resp.markdown ?? '');
            },
            'POST',
            fallbackCallback,
            JSON.stringify({ date_from: date })
        );
    };

    const handleUse = () => {
        onLoad(result);
        onClose();
    };

    return (
        <React.Fragment>
            <div className="modal fade show d-block" role="dialog">
                <div
                    className="modal-dialog modal-lg modal-dialog-scrollable"
                    role="document">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Load Released Files</h5>
                            <button
                                type="button"
                                className="btn-close"
                                onClick={onClose}
                                aria-label="Close"
                            />
                        </div>
                        <div className="modal-body d-flex flex-column gap-3">
                            <div className="d-flex align-items-center gap-2">
                                <label
                                    className="form-label mb-0 text-nowrap"
                                    htmlFor="rf-date-from">
                                    Load files from
                                </label>
                                <input
                                    id="rf-date-from"
                                    type="date"
                                    className="form-control form-control-sm"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    className="btn btn-sm btn-primary text-nowrap"
                                    onClick={handleLoad}
                                    disabled={!date || loading}>
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
                        </div>
                        <div className="modal-footer">
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
                        </div>
                    </div>
                </div>
            </div>
            <div className="modal-backdrop fade show" onClick={onClose} />
        </React.Fragment>
    );
}

class NotificationStatusComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.state = {
            initialLoading: true,
            subject: '',
            markdownText: '',
            notificationType: 'data_release',
            sendingMode: null,
            sendResult: null,
            refreshing: false,
            emailNotifications: [],
            previewNotification: null,
            showReleasedFilesModal: false,
        };
    }

    componentDidMount() {
        this.getData();
    }

    getData = () => {
        this.setState({ refreshing: true });
        ajax.load(
            '/get_notification_status/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    this.setState({ refreshing: false });
                    return;
                }
                this.setState({
                    initialLoading: false,
                    refreshing: false,
                    emailNotifications: resp.email_notifications ?? [],
                });
            },
            'POST',
            fallbackCallback,
            JSON.stringify({})
        );
    };

    handleMarkdownChange = (e) => {
        this.setState({ markdownText: e.target.value });
    };

    openPreview = (notification) => {
        this.setState({ previewNotification: notification });
    };

    closePreview = () => {
        this.setState({ previewNotification: null });
    };

    sendEmail = (sendToAll) => {
        const { subject, markdownText, notificationType } = this.state;
        this.setState({
            sendingMode: sendToAll ? 'all' : 'self',
            sendResult: null,
        });
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
                if (sendToAll) {
                    this.setState({
                        sendingMode: null,
                        sendResult: { success: true },
                        subject: '',
                        markdownText: '',
                    });
                    setTimeout(this.getData, 3000);
                } else {
                    this.setState({
                        sendingMode: null,
                        sendResult: { success: true },
                    });
                }
            },
            'POST',
            fallbackCallback,
            JSON.stringify({
                subject,
                body: markdownText,
                notification_type: notificationType,
                send_to_all: sendToAll,
            })
        );
    };

    openReleasedFilesModal = () => {
        this.setState({ showReleasedFilesModal: true });
    };

    closeReleasedFilesModal = () => {
        this.setState({ showReleasedFilesModal: false });
    };

    render() {
        if (this.state.initialLoading) {
            return (
                <div className="p-5 text-center">
                    <i className="icon icon-fw fas icon-spinner icon-spin me-1"></i>
                    Loading
                </div>
            );
        }

        const {
            subject,
            markdownText,
            notificationType,
            sendingMode,
            sendResult,
            refreshing,
            emailNotifications,
            previewNotification,
            showReleasedFilesModal,
        } = this.state;

        return (
            <div className="d-flex flex-column gap-4">
                {/* Compose section */}
                <div>
                    <div className="d-flex align-items-center border-bottom pb-2 mb-2">
                        <h5 className="mb-0">Compose Email</h5>
                    </div>

                    <div className="d-flex flex-row gap-2 ns-editor-pane">
                        {/* Left pane — markdown editor */}
                        <div className="d-flex flex-column col-6 p-0">
                            <small className="text-secondary mb-1">
                                Subject
                            </small>
                            <input
                                id="ns-subject"
                                type="text"
                                className="form-control form-control-sm mb-2"
                                placeholder="Email subject…"
                                value={subject}
                                onChange={(e) =>
                                    this.setState({ subject: e.target.value })
                                }
                            />
                            <div className="d-flex align-items-center justify-content-between mb-1">
                                <small className="text-secondary">
                                    Email body (Markdown)
                                </small>
                                <button
                                    type="button"
                                    className="btn btn-xs btn-primary"
                                    onClick={this.openReleasedFilesModal}>
                                    Load released files
                                </button>
                            </div>
                            <textarea
                                className="form-control flex-grow-1 ns-textarea"
                                placeholder="Write your email content in Markdown…"
                                value={markdownText}
                                onChange={this.handleMarkdownChange}
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
                                    onClick={() => this.sendEmail(false)}
                                    disabled={
                                        !subject ||
                                        !markdownText ||
                                        sendingMode !== null
                                    }>
                                    {sendingMode === 'self' ? (
                                        <>
                                            <i className="icon icon-fw fas icon-spinner icon-spin me-1" />
                                            Sending…
                                        </>
                                    ) : (
                                        'Send email to myself only'
                                    )}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-primary flex-fill"
                                    onClick={() => this.sendEmail(true)}
                                    disabled={
                                        !subject ||
                                        !markdownText ||
                                        sendingMode !== null
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
                            {sendResult &&
                                (sendResult.success ? (
                                    <div className="alert alert-success py-1 px-2 mt-2 mb-0 small">
                                        Email sent successfully.
                                    </div>
                                ) : (
                                    <div className="alert alert-danger py-1 px-2 mt-2 mb-0 small">
                                        {sendResult.error}
                                    </div>
                                ))}
                        </div>

                        {/* Right pane — email preview */}
                        <div className="d-flex flex-column col-6 p-0 overflow-auto">
                            <small className="text-secondary mb-1">
                                Preview
                            </small>
                            <EmailTemplate>
                                {markdownText ? (
                                    <Markdown>{markdownText}</Markdown>
                                ) : (
                                    <span className="text-secondary fst-italic">
                                        Your email content will appear here.
                                    </span>
                                )}
                            </EmailTemplate>
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
                        onLoad={(markdown) =>
                            this.setState((prev) => ({
                                markdownText: prev.markdownText
                                    ? prev.markdownText + '\n\n' + markdown
                                    : markdown,
                            }))
                        }
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
