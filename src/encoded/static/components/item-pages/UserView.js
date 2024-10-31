/** @preventMunge */
/* ^ see http://stackoverflow.com/questions/30110437/leading-underscore-transpiled-wrong-with-es6-classes */

'use strict';

import React, { useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import Modal from 'react-bootstrap/esm/Modal';

import {
    console,
    object,
    JWT,
    ajax,
    navigate,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';
import {
    EditableField,
    FieldSet,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/EditableField';

import { store } from './../../store';
import {
    OnlyTitle,
    PageTitleContainer,
    pageTitleViews,
} from './../PageTitleSection';
import { Term } from './../util/Schemas';

// eslint-disable-next-line no-unused-vars
import { Item } from './../util/typedefs';

/**
 * Contains the User profile page view as well as Impersonate User form.
 * Only the User view is exported.
 *
 * @module item-pages/user
 */

/**
 * Component which fetches, saves, and show access keys that user may use to submit
 * experiments and other data.
 *
 * @memberof module:item-pages/user
 * @namespace
 * @type {Component}
 * @private
 */
class SyncedAccessKeyTable extends React.PureComponent {
    static propTypes = {
        access_keys: PropTypes.array,
        user: PropTypes.shape({
            '@id': PropTypes.string.isRequired,
            uuid: PropTypes.string.isRequired,
            email: PropTypes.string,
            first_name: PropTypes.string,
            last_name: PropTypes.string,
            groups: PropTypes.array,
            status: PropTypes.string,
            timezone: PropTypes.string,
            project_roles: PropTypes.shape({
                role: PropTypes.string,
                project: PropTypes.object,
            }),
        }),
    };

    static loadStatusMap = {
        loading: 1,
        loaded: 2,
        failed: 3,
    };

    constructor(props) {
        super(props);
        _.bindAll(
            this,
            'syncAccessKeysFromSearch',
            'handleCreate',
            'handleResetSecret',
            'showNewSecret',
            'handleDelete',
            'hideModal'
        );

        this.state = {
            access_keys: null,
            loadingStatus: SyncedAccessKeyTable.loadStatusMap.loading,
            modal: null,
        };
    }

    componentDidMount() {
        this.syncAccessKeysFromSearch();
    }

    syncAccessKeysFromSearch() {
        const { user } = this.props;
        const { loadingStatus } = this.state;
        if (!user || !user.uuid || !object.isUUID(user.uuid)) {
            throw new Error('No user, or invalid user.uuid supplied.');
        }

        const requestSucceeded = (resp) => {
            // Use for both load success+fail ajax callback in case of 404 (no results)
            if (!resp || !Array.isArray(resp['@graph'])) {
                this.setState({
                    loadingStatus: SyncedAccessKeyTable.loadStatusMap.failed,
                    access_keys: null,
                });
            }
            this.setState({
                loadingStatus: SyncedAccessKeyTable.loadStatusMap.loaded,
                access_keys: resp['@graph'],
            });
        };

        const loadFxn = () => {
            const hrefToRequest =
                '/search/?type=AccessKey&limit=500&user.uuid=' + user.uuid;
            ajax.load(hrefToRequest, requestSucceeded, 'GET', requestSucceeded);
        };

        if (loadingStatus !== SyncedAccessKeyTable.loadStatusMap.loading) {
            this.setState(
                { loadingStatus: SyncedAccessKeyTable.loadStatusMap.loading },
                loadFxn
            );
        } else {
            loadFxn();
        }
    }

    /**
     * Add new access key for user via AJAX.
     *
     * @param {MouseEvent} e - Click event.
     */
    handleCreate(e) {
        ajax.load(
            '/access-keys/',
            (resp) => {
                const [newKey] = resp['@graph'];
                this.setState(
                    function ({ access_keys: prevKeys }) {
                        const nextKeys = prevKeys.slice(0);
                        nextKeys.unshift(newKey); // Add to start of list.
                        return { access_keys: nextKeys };
                    },
                    () => {
                        this.showNewSecret(resp);
                    }
                );
            },
            'POST',
            (err) => {
                Alerts.queue({
                    title: 'Adding access key failed',
                    message:
                        'Check your internet connection or if you have been logged out due to expired session.',
                    style: 'danger',
                });
            },
            '{}'
        );
    }

    showNewSecret(response, reset = false) {
        const { secret_access_key, access_key_id } = response;
        this.setState({
            modal: (
                <Modal show onHide={this.hideModal}>
                    <Modal.Header closeButton>
                        <Modal.Title>
                            Your secret key has been{' '}
                            {reset ? 'reset' : 'created'}
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p className="text-center text-500">
                            Please make a note of the new secret access key.
                            <br />
                            This is the last time you will be able to view it.
                        </p>

                        <div className="row mt-15">
                            <div className="col-5 text-500 text-end no-user-select">
                                Access Key ID
                            </div>
                            <div className="col-7">
                                <object.CopyWrapper value={access_key_id} data-tip={'Click to copy'} className="d-inline-block"
                                    wrapperElement="div" iconProps={{}} analyticsOnCopy={false}><code>{access_key_id}</code>
                                </object.CopyWrapper>
                            </div>
                        </div>
                        <div className="row mt-05">
                            <div className="col-5 text-500 text-end no-user-select">
                                Secret Access Key
                            </div>
                            <div className="col-7">
                                <object.CopyWrapper value={secret_access_key} data-tip={'Click to copy'} className="d-inline-block"
                                    wrapperElement="div" iconProps={{}} analyticsOnCopy={false}><code>{secret_access_key}</code>
                                </object.CopyWrapper>
                            </div>
                        </div>
                    </Modal.Body>
                </Modal>
            ),
        });
    }

    /**** Methods which are CALLED BY ITEMSTORE VIA DISPATCH(); TODO: Refactor, more Reactful ****/

    handleResetSecret(id) {
        ajax.load(
            id + 'reset-secret',
            (resp) => {
                this.showNewSecret(resp, true);
            },
            'POST',
            (err) => {
                Alerts.queue({
                    title: 'Resetting access key failed',
                    message:
                        'Check your internet connection or if you have been logged out due to expired session.',
                    style: 'danger',
                });
            }
        );
    }

    handleDelete(accessKeyToDelete) {
        const dispatch_body = { status: 'deleted' };
        const { accession, uuid, '@id': accessKeyID } = accessKeyToDelete;
        if (accession) {
            dispatch_body.accession = accession;
        }
        if (uuid) {
            dispatch_body.uuid = uuid;
        }
        ajax.load(
            accessKeyID + '?render=false',
            (resp) => {
                this.setState(({ access_keys: prevKeys }) => {
                    const foundItemIdx = _.findIndex(
                        prevKeys,
                        function ({ '@id': existingKeyID }) {
                            return existingKeyID === accessKeyID;
                        }
                    );
                    if (
                        typeof foundItemIdx !== 'number' ||
                        foundItemIdx === -1
                    ) {
                        throw new Error(
                            "Couldn't find deleted key - " + accessKeyID
                        );
                    }
                    const foundItem = prevKeys[foundItemIdx];
                    const nextKeys = prevKeys.slice(0);
                    nextKeys.splice(foundItemIdx, 1);
                    return {
                        access_keys: nextKeys,
                        modal: (
                            <Modal show onHide={this.hideModal}>
                                <Modal.Header closeButton>
                                    <Modal.Title className="text-400">
                                        Access key{' '}
                                        <span className="font-monospace">
                                            {foundItem.access_key_id}
                                        </span>{' '}
                                        has been deleted.
                                    </Modal.Title>
                                </Modal.Header>
                            </Modal>
                        ),
                    };
                });
            },
            'PATCH',
            function () {
                Alerts.queue({
                    title: 'Deleting access key failed',
                    message:
                        'Check your internet connection or if you have been logged out due to expired session.',
                    style: 'danger',
                });
            },
            JSON.stringify(dispatch_body)
        );
    }

    hideModal() {
        this.setState({ modal: null });
    }

    render() {
        const { access_keys, loadingStatus, modal } = this.state;

        if (!Array.isArray(access_keys)) {
            if (loadingStatus === SyncedAccessKeyTable.loadStatusMap.loading) {
                return (
                    <AccessKeyTableContainer>
                        <div className="text-center pt-3 pb-3">
                            <i className="icon icon-2x icon-fw icon-circle-notch fas icon-spin text-secondary" />
                        </div>
                    </AccessKeyTableContainer>
                );
            } else if (
                loadingStatus === SyncedAccessKeyTable.loadStatusMap.failed
            ) {
                return (
                    <AccessKeyTableContainer>
                        <div className="text-center pt-3 pb-3">
                            <i className="icon icon-2x icon-fw icon-times fas text-danger" />
                            <h4 className="text-400">
                                Failed to load Access Keys
                            </h4>
                        </div>
                    </AccessKeyTableContainer>
                );
            } else if (
                loadingStatus === SyncedAccessKeyTable.loadStatusMap.loaded
            ) {
                return (
                    <AccessKeyTableContainer>
                        <div className="text-center pt-3 pb-3">
                            <i className="icon icon-2x icon-fw icon-times fas text-danger" />
                            <h4 className="text-400">Unknown Error</h4>
                        </div>
                    </AccessKeyTableContainer>
                );
            }
        }

        return (
            <AccessKeyTableContainer bodyClassName="card-body px-0 pt-0">
                <AccessKeyTable
                    accessKeys={access_keys}
                    onResetSecret={this.handleResetSecret}
                    onDelete={this.handleDelete}
                />
                <div className="px-3 pt-16">
                    <button
                        type="button"
                        id="add-access-key"
                        className="btn btn-primary"
                        onClick={this.handleCreate}>
                        Generate Access Key
                    </button>
                </div>
                {modal}
            </AccessKeyTableContainer>
        );
    }
}

function AccessKeyTableContainer({ children, bodyClassName = 'card-body' }) {
    return (
        <div className="access-keys-container card mt-36">
            <div className="card-header">
                <h3 className="">
                    <i className="icon icon-fw icon-key fas me-12" />
                    Access Keys
                </h3>
            </div>
            <div className={bodyClassName}>{children}</div>
        </div>
    );
}

const AccessKeyTable = React.memo(function AccessKeyTable({
    accessKeys,
    onDelete,
    onResetSecret,
}) {
    if (typeof accessKeys === 'undefined' || !accessKeys.length) {
        return (
            <h5 className="no-access-keys text-400 px-3 my-0 pt-16 text-secondary text-center">
                No access keys set
            </h5>
        );
    }

    return (
        <div className="table-responsive-md">
            <table className="table access-keys-table bg-white">
                <thead>
                    <tr>
                        <th>Access Key ID</th>
                        <th>Created</th>
                        <th>Expires</th>
                        <th>Description</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {accessKeys.map(function (accessKey, idx) {
                        return (
                            <AccessKeyTableRow
                                {...{ onDelete, onResetSecret, accessKey, idx }}
                                key={idx}
                            />
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
});

const AccessKeyTableRow = React.memo(function AccessKeyTableRow({
    accessKey,
    idx,
    onResetSecret,
    onDelete,
}) {
    const {
        '@id': atId,
        access_key_id: id,
        date_created,
        expiration_date,
        description,
        uuid,
    } = accessKey;

    function resetKey(e) {
        onResetSecret(atId);
    }
    function deleteKey(e) {
        onDelete({ '@id': atId, uuid });
    }

    return (
        <tr key={id || idx}>
            <td className="access-key-id">{id}</td>
            <td>
                {date_created ? (
                    <LocalizedTime
                        timestamp={date_created}
                        formatType="date-time-md"
                        dateTimeSeparator=" - "
                    />
                ) : (
                    'N/A'
                )}
            </td>
            <td>
                {expiration_date ? (
                    <LocalizedTime
                        timestamp={expiration_date}
                        formatType="date-time-md"
                        dateTimeSeparator=" - "
                    />
                ) : (
                    'N/A'
                )}
            </td>
            <td>{description}</td>
            <td className="access-key-buttons">
                <button
                    type="button"
                    className="btn btn-xs btn-success reset"
                    onClick={resetKey}>
                    Reset
                </button>
                <button
                    type="button"
                    className="btn btn-xs btn-danger delete"
                    onClick={deleteKey}>
                    Delete
                </button>
            </td>
        </tr>
    );
});

/**
 * Draws a User Profile page.
 *
 * @public
 * @type {Component}
 * @prop {Object} context - Context value for user, e.g. from Redux store. AKA user object.
 * @prop {Object} schemas - Object of schemas, e.g. passed from app state.
 * @memberof module:item-pages/user
 */

export default class UserView extends React.Component {
    static onEditableFieldSave(nextContext) {
        store.dispatch({ type: 'CONTEXT', payload: nextContext });
    }

    static propTypes = {
        context: PropTypes.shape({
            '@id': PropTypes.string.isRequired,
            email: PropTypes.string,
            first_name: PropTypes.string,
            last_name: PropTypes.string,
            title: PropTypes.string,
            groups: PropTypes.array,
            lab: PropTypes.object,
            status: PropTypes.string,
            timezone: PropTypes.string,
            role: PropTypes.string,
        }),
        href: PropTypes.string.isRequired,
        schemas: PropTypes.shape({
            User: PropTypes.shape({
                required: PropTypes.array,
                properties: PropTypes.shape({
                    first_name: PropTypes.object,
                    last_name: PropTypes.object,
                    email: PropTypes.object,
                    phone1: PropTypes.object,
                    fax: PropTypes.object,
                    skype: PropTypes.object,
                    // etc.
                }),
            }),
        }),
    };

    mayEdit() {
        const { context } = this.props;
        return _.any((context && context.actions) || [], function (action) {
            return action.name && action.name === 'edit';
        });
    }

    render() {
        const {
            context: user,
            schemas,
            href,
            windowWidth,
            alerts = [],
        } = this.props;
        const { email, project } = user;
        const mayEdit = this.mayEdit();
        // Todo: remove
        const ifCurrentlyEditingClass =
            this.state && this.state.currentlyEditing
                ? ' editing editable-fields-container'
                : '';

        const wrapperCls = alerts.length ? 'pb-5' : 'py-5';

        return (
            <div
                className={
                    'user-profile-page container-wide bg-light border-top ' +
                    wrapperCls
                }>
                <div className="container" id="content">
                    <div
                        className={
                            'page-container data-display' +
                            ifCurrentlyEditingClass
                        }>
                        <div className="row">
                            <Alerts
                                alerts={alerts}
                                className="container mt-3"
                            />
                        </div>
                        <div className="row">
                            <div className="col-12 col-lg-6 col-xl-7 mb-2 mb-lg-0">
                                <div className="user-info card h-100">
                                    <div className="card-header">
                                        <div className="row title-row align-items-center py-2">
                                            <div className="col-md-3 gravatar-container">
                                                {object.itemUtil.User.gravatar(
                                                    email,
                                                    70
                                                )}
                                                <a
                                                    className="edit-button-remote text-center"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    href="https://gravatar.com">
                                                    <i className="icon icon-pencil-alt fas" />
                                                </a>
                                            </div>
                                            <div className="col-md-9 user-title-col">
                                                <h1 className="user-title">
                                                    <FieldSet
                                                        context={user}
                                                        parent={this}
                                                        style="inline"
                                                        inputSize="lg"
                                                        absoluteBox
                                                        objectType="User"
                                                        onSave={
                                                            UserView.onEditableFieldSave
                                                        }
                                                        schemas={schemas}
                                                        disabled={!mayEdit}
                                                        href={href}
                                                        windowWidth={
                                                            windowWidth
                                                        }>
                                                        <EditableField
                                                            labelID="first_name"
                                                            fallbackText="No first name set"
                                                            placeholder="First name"
                                                        />{' '}
                                                        <EditableField
                                                            labelID="last_name"
                                                            fallbackText="No last name set"
                                                            placeholder="Last name"
                                                        />
                                                    </FieldSet>
                                                </h1>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="card-body">
                                        <ProfileContactFields
                                            user={user}
                                            parent={this}
                                            mayEdit={mayEdit}
                                            href={href}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="col-12 col-lg-6 col-xl-5">
                                <ProfileWorkFields user={user} />
                            </div>
                        </div>

                        <SyncedAccessKeyTable {...{ user }} />
                    </div>
                </div>
            </div>
        );
    }
}

/**
 * Renders out the contact fields for user, which are editable.
 * Shows Gravatar and User's first and last name at top.
 *
 * @private
 * @type {Component}
 */
function ProfileContactFields(props) {
    const { user, windowWidth, parent, mayEdit, href, schemas } = props;
    const { email, time_zone } = user || {};
    return (
        <FieldSet
            context={user}
            onSave={UserView.onEditableFieldSave}
            parent={parent}
            className="profile-contact-fields"
            disabled={!mayEdit}
            objectType="User"
            windowWidth={windowWidth}
            schemas={schemas}
            href={href}>
            <EditableField
                label="Email"
                labelID="email"
                placeholder="name@example.com"
                fallbackText="No email address"
                fieldType="email"
                disabled={true}>
                <ProfileContactFieldsIcon icon="envelope far" />
                <span className="text-secondary">{email}</span>
            </EditableField>
            <EditableField
                label="Timezone"
                labelID="time_zone"
                fallbackText="No timezone available"
                fieldType="text"
                disabled={true}>
                <ProfileContactFieldsIcon icon="clock far" />
                {time_zone}
            </EditableField>
        </FieldSet>
    );
}

function ProfileContactFieldsIcon({ icon }) {
    return (
        <i className={'visible-lg-inline icon icon-fw me-07 icon-' + icon} />
    );
}

const ProfileWorkFields = React.memo(function ProfileWorkFields({ user }) {
    const { consortia = [], submission_centers: submissionCenters = [] } = user;

    return (
        <div className="card organizations h-100">
            <div className="card-header">
                <h3 className="block-title">
                    <i className="icon icon-users fas icon-fw me-12" />
                    Organizations
                </h3>
            </div>
            <div className="card-body">
                <ul className="list-group list-group-flush list-unstyled border-bottom-0">
                    <div className="list-group-item pt-0">
                        <div className="row consortia">
                            <div className="col-md-3 text-start text-md-end">
                                <label htmlFor="consortia" className="text-500">
                                    Consortia
                                </label>
                            </div>
                            <div id="consortia" className="col-md-9">
                                {consortia.map((consortium) => (
                                    <li
                                        key={consortium?.atId}
                                        id={consortium?.atId}
                                        className="value text-500">
                                        {object.itemUtil.generateLink(
                                            consortium
                                        )}
                                    </li>
                                ))}
                            </div>
                        </div>
                    </div>
                </ul>
                <ul className="list-group list-group-flush list-unstyled border-top-0 mt-0">
                    <div className="list-group-item">
                        <div className="row submission-centers">
                            <div className="col-md-3 text-start text-md-end">
                                <label
                                    htmlFor="submission_centers"
                                    className="text-500">
                                    Submission Center(s)
                                </label>
                            </div>
                            <div id="submission_centers" className="col-md-9">
                                {submissionCenters.map((submissionCenter) => (
                                    <li
                                        key={submissionCenter?.atId}
                                        id={submissionCenter?.atId}
                                        className="value text-500">
                                        {object.itemUtil.generateLink(
                                            submissionCenter
                                        )}
                                    </li>
                                ))}
                            </div>
                        </div>
                    </div>
                </ul>
            </div>
        </div>
    );
});

export function ImpersonateUserForm({ updateAppSessionState }) {
    const inputFieldRef = useRef(null);
    /**
     * Handler for Impersonate User submit button/action.
     * Performs AJAX request to '/impersonate-user' endpoint then saves returned JWT
     * as own and in order to pretend to be impersonated user.
     *
     * @param {Object} data - User ID or email address.
     */
    const onSubmit = useCallback(
        function (e) {
            // `useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`
            // See https://reactjs.org/docs/hooks-reference.html#usecallback
            e.preventDefault();
            const { value: userid = '' } = inputFieldRef.current;
            if (userid.length === 0) {
                console.warn('No userid supplied', e);
                return;
            }
            const url = '/impersonate-user';
            const postData = { userid: userid };
            const callbackFxn = (resp) => {
                JWT.saveUserInfoLocalStorage(resp);
                updateAppSessionState();
                let navTarget = '/';
                const profileAction =
                    resp.user_actions &&
                    _.find(resp.user_actions, { id: 'profile' });
                if (profileAction && profileAction.href) {
                    navTarget = profileAction.href;
                }
                navigate(navTarget, { inPlace: true });
                alert('Success! ' + userid + ' is being impersonated.');
            };
            const fallbackFxn = function () {
                alert(
                    'Impersonation unsuccessful.\nPlease check to make sure the provided email is correct.'
                );
            };

            ajax.load(
                url,
                callbackFxn,
                'POST',
                fallbackFxn,
                JSON.stringify(postData)
            );
        },
        [updateAppSessionState]
    );

    return (
        <div className="mt-3 container" id="content">
            <h2 className="text-400 mt-5">Impersonate a User</h2>
            <div className="row">
                <div className="col-12 col-lg-6">
                    <form onSubmit={onSubmit}>
                        <input
                            type="text"
                            className="mt-08 form-control"
                            placeholder="Enter an email to impersonate..."
                            name="impersonate-user-email"
                            ref={inputFieldRef}
                        />
                        <a
                            href="/search/?type=User"
                            target="_blank"
                            className="btn btn-secondary btn-md mt-2 me-2">
                            <i className="icon icon-fw icon-users fas me-08" />
                            View Users
                        </a>
                        <button
                            type="submit"
                            className="btn btn-primary btn-md mt-2">
                            <i className="icon icon-fw icon-user-ninja fas me-08" />
                            Impersonate
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

/*** Page Title ***/

const UserViewPageTitle = React.memo(function UserViewPageTitle({
    context,
    schemas,
    currentAction,
    // Note: not passing alerts here; see UserView, these are now rendered there
}) {
    const myDetails = JWT.getUserDetails();
    const myEmail = myDetails && myDetails.email;
    let titleStr;
    if (myEmail && context && context.email && myEmail === context.email) {
        titleStr = 'My Profile';
    } else {
        titleStr = object.itemUtil.getTitleStringFromContext(context);
    }

    return (
        <PageTitleContainer alerts={[]} className="container-fluid pb-55">
            <div className="container">
                <OnlyTitle>{titleStr}</OnlyTitle>
            </div>
        </PageTitleContainer>
    );
});

pageTitleViews.register(UserViewPageTitle, 'User');
