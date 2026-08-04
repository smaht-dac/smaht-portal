'use strict';

/**
 * Admin-only control panel for the User profile page.
 *
 * @module item-pages/components/user/UserAdminControls
 */

import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Modal from 'react-bootstrap/esm/Modal';
import Select from 'react-select';

import {
    ajax,
    navigate,
    JWT,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Alerts } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts';

import {
    getStatusEnum,
    getGroupsEnum,
    extractUserBaseline,
    draftFromBaseline,
    buildUserPatchPayload,
    diffUserFields,
    getChangedFields,
    computeSubmitsForOptions,
    computeChangeWarnings,
    formatPatchError,
} from './userAdminHelpers';

/**
 * react-select styling, kept local to avoid importing from the viz tree (which
 * pulls d3 into this chunk). Mirrors `customReactSelectStyleMulti` used
 * elsewhere in the repo for visual consistency.
 */
const reactSelectStyles = {
    control: (provided, state) => {
        return {
            ...provided,
            fontSize: '0.875rem',
            borderColor: state.isFocused ? 'blue' : '#dee2e6',
            boxShadow: state.isFocused ? '0 0 0 1px blue' : 'none',
        };
    },
    valueContainer: (provided) => {
        return { ...provided, padding: '0 6px' };
    },
    input: (provided) => {
        return { ...provided, margin: '0', padding: '0' };
    },
    menu: (provided) => {
        return { ...provided, marginTop: '0px' };
    },
    option: (provided) => {
        return { ...provided, fontSize: '0.875rem', padding: '4px 10px' };
    },
    multiValue: (provided) => {
        return { ...provided, backgroundColor: '#f2f2f2' };
    },
};

const LOAD = { loading: 1, loaded: 2, failed: 3 };
const noSubmissionCenters = () => 'No submission centers found';
const submissionCentersFailed = () => 'Failed to load submission centers';

/**
 * Derive the initial state synchronously from the embedded context so the
 * controls render populated before the object-frame fetch returns.
 */
function getInitialState(user) {
    const baseline = extractUserBaseline(user);
    // Seed submits_for chip labels from the embedded context so chips show
    // display titles immediately; the SubmissionCenter search fetch augments
    // this with the full option list on mount.
    const initialLabelMap = {};
    const embeddedSubmits =
        user && Array.isArray(user.submits_for) ? user.submits_for : [];
    embeddedSubmits.forEach((sc) => {
        if (sc && typeof sc === 'object' && sc['@id']) {
            initialLabelMap[sc['@id']] =
                sc.display_title || sc.identifier || sc['@id'];
        }
    });
    return {
        baselineStatus: LOAD.loading,
        original: baseline,
        draft: draftFromBaseline(baseline),
        scOptions: [],
        scLabelMap: initialLabelMap,
        scStatus: LOAD.loading,
        showConfirm: false,
        saving: false,
    };
}

/**
 * Admin-only right-side control panel on the User profile page. Renders three
 * searchable controls (status enum, groups multi-select, submits_for
 * SubmissionCenter multi-select), accumulates pending changes, confirms them in
 * a modal, and applies them as a single atomic PATCH through the standard
 * `ajax.load(... 'PATCH' ...)` convention.
 *
 * Visibility is gated cosmetically by the caller (`UserView`, on the client
 * admin group check). Real authorization is the backend `restricted_fields`
 * validator on all three fields — a non-admin who forges this panel still
 * cannot PATCH them.
 *
 * @memberof module:item-pages/components/user/UserAdminControls
 */
function UserAdminControls({
    user,
    schemas = null,
    mayEdit = false,
    onUpdated = null,
}) {
    const [state, setState] = useState(() => getInitialState(user));
    const {
        original,
        draft,
        scOptions,
        scLabelMap,
        scStatus,
        baselineStatus,
        showConfirm,
        saving,
    } = state;

    const userId = user && user['@id'];

    /**
     * Fetch the object frame for clean scalar / `@id`-array baseline values to
     * diff and PATCH against (the embedded context nests linkTos as objects).
     */
    const loadBaseline = useCallback(() => {
        if (!userId) {
            setState((prev) => {return { ...prev, baselineStatus: LOAD.failed };});
            return;
        }
        ajax.load(
            userId + '?frame=object',
            (resp) => {
                const nextOriginal = extractUserBaseline(resp);
                setState((prev) => {
                    // Don't clobber selections the admin already made before
                    // this fetch returned: reset the draft only when nothing
                    // is pending.
                    const pending =
                        getChangedFields(prev.original, prev.draft).length > 0;
                    return {
                        ...prev,
                        baselineStatus: LOAD.loaded,
                        original: nextOriginal,
                        draft: pending
                            ? prev.draft
                            : draftFromBaseline(nextOriginal),
                    };
                });
            },
            'GET',
            () => {
                // Keep the embedded-derived baseline already in state; just
                // note the object-frame refresh failed (surfaced in render).
                setState((prev) => {return {
                    ...prev,
                    baselineStatus: LOAD.failed,
                };});
            }
        );
    }, [userId]);

    /** Load the bounded set of SubmissionCenters for the submits_for options. */
    const loadSubmissionCenters = useCallback(() => {
        // `field=` restricts the returned _source; snovault always force-adds
        // `embedded.@id` and `embedded.@type` to the requested fields
        // (snovault/search/search.py `list_source_fields`), so each result
        // still carries the `@id` that computeSubmitsForOptions needs.
        setState((prev) => {
            if (prev.scStatus === LOAD.loading) return prev;
            return { ...prev, scStatus: LOAD.loading };
        });
        ajax.load(
            '/search/?type=SubmissionCenter&limit=all&field=display_title&field=identifier',
            (resp) => {
                const { options, labelMap } = computeSubmitsForOptions(
                    (resp && resp['@graph']) || []
                );
                setState((prev) => {return {
                    ...prev,
                    scOptions: options,
                    // Retain embedded labels for centers absent from search;
                    // prefer fresh labels for centers that were returned.
                    scLabelMap: { ...prev.scLabelMap, ...labelMap },
                    scStatus: LOAD.loaded,
                };});
            },
            'GET',
            () => {
                setState((prev) => {return { ...prev, scStatus: LOAD.failed };});
            }
        );
    }, []);

    useEffect(() => {
        loadBaseline();
        loadSubmissionCenters();
    }, [loadBaseline, loadSubmissionCenters]);

    const handleStatusChange = useCallback((option) => {
        const status = option ? option.value : '';
        setState((prev) => {return {
            ...prev,
            draft: { ...prev.draft, status },
        };});
    }, []);

    const handleGroupsChange = useCallback((selected) => {
        const groups = (selected || []).map((o) => o.value);
        setState((prev) => {return {
            ...prev,
            draft: { ...prev.draft, groups },
        };});
    }, []);

    const handleSubmitsForChange = useCallback((selected) => {
        const submits_for = (selected || []).map((o) => o.value);
        setState((prev) => {return {
            ...prev,
            draft: { ...prev.draft, submits_for },
        };});
    }, []);

    const openConfirm = useCallback(() => {
        setState((prev) => {return { ...prev, showConfirm: true };});
    }, []);

    const closeConfirm = useCallback(() => {
        setState((prev) =>
            prev.saving ? prev : { ...prev, showConfirm: false }
        );
    }, []);

    const onPatchError = useCallback((errorResp) => {
        // Keep pending draft intact so the admin can fix and retry.
        setState((prev) => {return {
            ...prev,
            saving: false,
            showConfirm: false,
        };});
        Alerts.queue({
            title: 'Update failed',
            message: formatPatchError(errorResp),
            style: 'danger',
        });
    }, []);

    const onPatchSuccess = useCallback(
        (resp) => {
            if (!resp || resp.status !== 'success') {
                onPatchError(resp);
                return;
            }
            // Do NOT dispatch the PATCH @graph[0] (object frame, no embeds).
            // Re-GET the embedded frame to reconcile the on-page display, then
            // reset the baseline so a subsequent save diffs against fresh values.
            ajax.load(
                userId,
                (embeddedResp) => {
                    if (typeof onUpdated === 'function') {
                        onUpdated(embeddedResp);
                    }
                    const nextOriginal = extractUserBaseline(embeddedResp);
                    setState((prev) => {return {
                        ...prev,
                        original: nextOriginal,
                        draft: draftFromBaseline(nextOriginal),
                        saving: false,
                        showConfirm: false,
                    };});
                    Alerts.queue({
                        title: 'User updated',
                        message: 'The user account was updated successfully.',
                        style: 'success',
                    });
                },
                'GET',
                () => {
                    // PATCH succeeded but the reconciling re-GET failed. Keep the
                    // panel usable; surface a soft warning and reset the baseline
                    // from the draft we just persisted.
                    setState((prev) => {return {
                        ...prev,
                        original: {
                            status: prev.draft.status,
                            groups: prev.draft.groups.slice(),
                            submits_for: prev.draft.submits_for.slice(),
                        },
                        saving: false,
                        showConfirm: false,
                    };});
                    Alerts.queue({
                        title: 'User updated',
                        message:
                            'Changes were saved, but the page could not be refreshed automatically. Reload to see the latest values.',
                        style: 'warning',
                    });
                }
            );
        },
        [onPatchError, onUpdated, userId]
    );

    const handleSave = useCallback(() => {
        const payload = buildUserPatchPayload(original, draft);
        if (Object.keys(payload).length === 0) return;

        setState((prev) => {return { ...prev, saving: true };});
        ajax.load(
            userId,
            onPatchSuccess,
            'PATCH',
            onPatchError,
            JSON.stringify(payload)
        );
    }, [draft, onPatchError, onPatchSuccess, original, userId]);

    const statusEnum = getStatusEnum(schemas);
    const groupsEnum = getGroupsEnum(schemas);

    const toOption = (v) => {
        return { value: v, label: v };
    };
    const statusOptions = statusEnum.map(toOption);
    const groupOptions = groupsEnum.map(toOption);

    const selectedStatus =
        statusOptions.find((o) => o.value === draft.status) || null;
    const selectedGroups = (draft.groups || []).map(toOption);
    const selectedSubmitsFor = (draft.submits_for || []).map((v) => {
        return { value: v, label: scLabelMap[v] || v };
    });

    const changedFields = getChangedFields(original, draft);
    const hasChanges = changedFields.length > 0;

    // Defer modal-only work and JWT access during ordinary panel renders.
    let diffRows;
    let warnings;
    if (showConfirm) {
        const myDetails = JWT.getUserDetails() || {};
        const isSelf =
            !!myDetails.email &&
            !!user.email &&
            myDetails.email === user.email;
        diffRows = diffUserFields(original, draft, scLabelMap);
        warnings = computeChangeWarnings(original, draft, isSelf);
    }

    return (
        <div
            className="user-admin-controls card h-100"
            data-testid="user-admin-controls">
            <div className="card-header">
                <h3 className="block-title">
                    <i className="icon icon-user-shield fas icon-fw me-12" />
                    Admin Controls
                </h3>
            </div>
            <div className="card-body">
                {mayEdit ? (
                    <div className="mb-3">
                        <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm w-100"
                            onClick={() =>
                                navigate(user['@id'] + '?currentAction=edit')
                            }>
                            <i className="icon icon-pencil-alt fas me-06" />
                            Open full edit page
                        </button>
                    </div>
                ) : null}

                <div className="form-group mb-3">
                    <label
                        htmlFor="user-admin-status"
                        className="text-500 mb-1">
                        Status
                    </label>
                    <Select
                        inputId="user-admin-status"
                        aria-label="User status"
                        styles={reactSelectStyles}
                        options={statusOptions}
                        value={selectedStatus}
                        onChange={handleStatusChange}
                        isDisabled={saving}
                    />
                </div>

                <div className="form-group mb-3">
                    <label
                        htmlFor="user-admin-groups"
                        className="text-500 mb-1">
                        Groups
                    </label>
                    <Select
                        inputId="user-admin-groups"
                        aria-label="User groups"
                        isMulti
                        closeMenuOnSelect={false}
                        styles={reactSelectStyles}
                        options={groupOptions}
                        value={selectedGroups}
                        onChange={handleGroupsChange}
                        placeholder="No groups"
                        isDisabled={saving}
                    />
                </div>

                <div className="form-group mb-3">
                    <label
                        htmlFor="user-admin-submits-for"
                        className="text-500 mb-1">
                        Submits for
                    </label>
                    <Select
                        inputId="user-admin-submits-for"
                        aria-label="Submits for submission centers"
                        isMulti
                        closeMenuOnSelect={false}
                        styles={reactSelectStyles}
                        options={scOptions}
                        value={selectedSubmitsFor}
                        onChange={handleSubmitsForChange}
                        isLoading={scStatus === LOAD.loading}
                        placeholder={
                            scStatus === LOAD.failed
                                ? 'Failed to load submission centers'
                                : 'Select submission center(s)'
                        }
                        noOptionsMessage={
                            scStatus === LOAD.failed
                                ? submissionCentersFailed
                                : noSubmissionCenters
                        }
                        isDisabled={saving}
                    />
                    {scStatus === LOAD.failed ? (
                        <div className="text-danger small mt-1">
                            Could not load submission centers.{' '}
                            <button
                                type="button"
                                className="btn btn-link btn-sm p-0 align-baseline"
                                onClick={loadSubmissionCenters}>
                                Retry
                            </button>
                        </div>
                    ) : null}
                </div>

                {baselineStatus === LOAD.failed ? (
                    <div className="text-warning small mb-2">
                        <i className="icon icon-exclamation-triangle fas me-06" />
                        Could not refresh the latest values; editing against
                        the values shown on the page.
                    </div>
                ) : null}

                <div className="mt-3">
                    <button
                        type="button"
                        className="btn btn-primary w-100"
                        disabled={!hasChanges || saving}
                        onClick={openConfirm}>
                        Save changes
                    </button>
                </div>
            </div>

            {showConfirm ? (
                <Modal show onHide={closeConfirm}>
                    <Modal.Header closeButton>
                        <Modal.Title className="text-400">
                            Confirm user changes
                        </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p className="text-500">
                            The following changes will be applied to{' '}
                            <span className="text-600">{user.email}</span>:
                        </p>
                        <ul className="list-unstyled">
                            {diffRows.map((row) => (
                                <li key={row.field} className="mb-1">
                                    <span className="text-500">
                                        {row.field}
                                    </span>
                                    : <code>{row.from}</code>
                                    {' → '}
                                    <code>{row.to}</code>
                                </li>
                            ))}
                        </ul>
                        {warnings.length ? (
                            <div className="alert alert-warning py-2 mb-0">
                                <ul className="mb-0 ps-3">
                                    {warnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}
                    </Modal.Body>
                    <Modal.Footer>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={closeConfirm}
                            disabled={saving}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleSave}
                            disabled={saving}>
                            {saving ? 'Saving…' : 'Confirm'}
                        </button>
                    </Modal.Footer>
                </Modal>
            ) : null}
        </div>
    );
}

UserAdminControls.propTypes = {
    user: PropTypes.object.isRequired,
    schemas: PropTypes.object,
    mayEdit: PropTypes.bool,
    /** Called with the freshly re-fetched embedded user on save success. */
    onUpdated: PropTypes.func,
};

export default UserAdminControls;
