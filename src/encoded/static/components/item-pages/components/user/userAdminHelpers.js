'use strict';

/**
 * Pure, framework-free helpers backing the admin-only User control panel
 * (see `UserAdminControls.js`). Keeping these free of React / SPC / react-select
 * imports is what makes them unit-testable under the repo's default (node)
 * Jest environment — no jsdom required.
 *
 * @module item-pages/components/user/userAdminHelpers
 */

/**
 * Fallback enums, used only if the merged User schema fails to expose them.
 * The served `/profiles/user.json` resolves the schema `$merge` refs at load
 * time (snovault `schema_utils.fill_in_schema_merge_refs`), so at runtime
 * `schemas.User.properties.status.enum` is populated; these mirror the
 * authoritative values (`status`: snovault base `user.json`; `groups`: the
 * SMaHT override in `src/encoded/schemas/user.json`).
 */
export const USER_STATUS_ENUM_FALLBACK = [
    'current',
    'deleted',
    'inactive',
    'revoked',
];

export const USER_GROUPS_ENUM_FALLBACK = [
    'admin',
    'read-only-admin',
    'dbgap',
    'public-dbgap',
];

/** The three admin-editable, `restricted_fields`-gated User properties. */
export const ADMIN_EDITABLE_FIELDS = ['status', 'groups', 'submits_for'];

/**
 * Read the `status` enum out of the merged schemas prop, falling back to the
 * hard-coded list if absent.
 * @param {Object} schemas - App schemas object (keyed by type name).
 * @returns {string[]}
 */
export function getStatusEnum(schemas) {
    const enumVals =
        schemas &&
        schemas.User &&
        schemas.User.properties &&
        schemas.User.properties.status &&
        schemas.User.properties.status.enum;
    return Array.isArray(enumVals) && enumVals.length
        ? enumVals
        : USER_STATUS_ENUM_FALLBACK;
}

/**
 * Read the `groups` item enum out of the merged schemas prop, falling back to
 * the hard-coded list if absent.
 * @param {Object} schemas - App schemas object (keyed by type name).
 * @returns {string[]}
 */
export function getGroupsEnum(schemas) {
    const enumVals =
        schemas &&
        schemas.User &&
        schemas.User.properties &&
        schemas.User.properties.groups &&
        schemas.User.properties.groups.items &&
        schemas.User.properties.groups.items.enum;
    return Array.isArray(enumVals) && enumVals.length
        ? enumVals
        : USER_GROUPS_ENUM_FALLBACK;
}

/**
 * Normalize an object-frame User response (or embedded context) into the clean
 * scalar / `@id`-array shapes used both as the diff baseline and as PATCH
 * payload values. `submits_for` may arrive as an array of `@id` strings
 * (object frame) or of embedded objects (embedded frame); both are coerced to
 * a plain `@id` array.
 * @param {Object} source - object-frame or embedded User item.
 * @returns {{status: string, groups: string[], submits_for: string[]}}
 */
export function extractUserBaseline(source) {
    const src = source || {};
    return {
        status: typeof src.status === 'string' ? src.status : '',
        groups: Array.isArray(src.groups) ? src.groups.slice() : [],
        submits_for: normalizeLinkArray(src.submits_for),
    };
}

/**
 * Coerce a linkTo array (of `@id` strings and/or embedded objects) to a plain
 * array of `@id` strings, dropping anything without a resolvable `@id`.
 * @param {Array} arr
 * @returns {string[]}
 */
export function normalizeLinkArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object') {
                return entry['@id'] || entry.atId || null;
            }
            return null;
        })
        .filter((v) => typeof v === 'string' && v.length > 0);
}

/** Set-equality for string arrays (order-insensitive). */
export function sameStringSet(a, b) {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    if (arrA.length !== arrB.length) return false;
    const setB = new Set(arrB);
    return arrA.every((v) => setB.has(v));
}

/** Whether a single field's draft value differs from the baseline. */
export function isFieldChanged(field, original, draft) {
    const orig = (original || {})[field];
    const next = (draft || {})[field];
    if (field === 'status') {
        return (orig || '') !== (next || '');
    }
    // groups / submits_for are arrays compared as sets (PATCH replaces wholesale)
    return !sameStringSet(orig, next);
}

/**
 * Field names whose draft value differs from the baseline.
 * @returns {string[]}
 */
export function getChangedFields(original, draft) {
    return ADMIN_EDITABLE_FIELDS.filter((field) =>
        isFieldChanged(field, original, draft)
    );
}

/**
 * Build the atomic PATCH payload: only changed fields, each carrying its full
 * desired value. Arrays are sent in full (PATCH replaces arrays wholesale); an
 * emptied array is sent as `[]`, which snovault applies as a clear
 * (`validate_item_content_patch` does `data.update(request.json)` — an explicit
 * `[]` replaces the stored value; verified against the resolved snovault
 * source at `snovault/validators.py` `validate_item_content_patch`).
 * @returns {Object} payload with 0..3 keys; `{}` when nothing changed.
 */
export function buildUserPatchPayload(original, draft) {
    const payload = {};
    getChangedFields(original, draft).forEach((field) => {
        if (field === 'status') {
            payload[field] = draft.status;
        } else {
            payload[field] = Array.isArray(draft[field])
                ? draft[field].slice()
                : [];
        }
    });
    return payload;
}

/**
 * Human-readable diff rows for the confirmation modal. `@id`s in `submits_for`
 * are mapped to display labels via `labelMap` when available.
 * @param {Object} original
 * @param {Object} draft
 * @param {Object} [labelMap] - map of `@id` -> display label for submits_for.
 * @returns {Array<{field: string, from: string, to: string}>}
 */
export function diffUserFields(original, draft, labelMap = {}) {
    return getChangedFields(original, draft).map((field) => {
        if (field === 'status') {
            return {
                field,
                from: original.status || '(none)',
                to: draft.status || '(none)',
            };
        }
        const toLabel = (id) => labelMap[id] || id;
        const fromArr = (original[field] || []).map(toLabel);
        const toArr = (draft[field] || []).map(toLabel);
        return {
            field,
            from: fromArr.length ? fromArr.join(', ') : '(none)',
            to: toArr.length ? toArr.join(', ') : '(none)',
        };
    });
}

/**
 * Map a portal `/search/` result set of SubmissionCenters into react-select
 * options and a companion `@id` -> label map.
 * @param {Array} items - `@graph` array of SubmissionCenter items.
 * @returns {{options: Array<{value: string, label: string}>, labelMap: Object}}
 */
export function computeSubmitsForOptions(items) {
    const options = [];
    const labelMap = {};
    (Array.isArray(items) ? items : []).forEach((item) => {
        const value = item && (item['@id'] || item.atId);
        if (!value) return;
        const label = item.display_title || item.identifier || value;
        options.push({ value, label });
        labelMap[value] = label;
    });
    options.sort((a, b) => a.label.localeCompare(b.label));
    return { options, labelMap };
}

/**
 * Extract a concise, user-facing error message from a snovault error response.
 * @param {Object} errorResp - parsed error body from `ajax.load` error cb.
 * @returns {string}
 */
export function formatPatchError(errorResp) {
    if (!errorResp) return 'An unknown error occurred.';
    if (Array.isArray(errorResp.errors) && errorResp.errors.length) {
        return errorResp.errors
            .map((e) => e.description || e.name || String(e))
            .join('; ');
    }
    return (
        errorResp.detail ||
        errorResp.description ||
        'An unknown error occurred.'
    );
}

/**
 * Warnings to surface in the confirmation modal for high-impact changes.
 * @param {Object} original
 * @param {Object} draft
 * @param {boolean} isSelf - whether the target user is the acting admin.
 * @returns {string[]}
 */
export function computeChangeWarnings(original, draft, isSelf) {
    const warnings = [];
    if (
        isFieldChanged('status', original, draft) &&
        (draft.status === 'deleted' || draft.status === 'revoked')
    ) {
        warnings.push(
            'Setting status to "' +
                draft.status +
                '" removes the user\'s access to their profile and data.'
        );
    }
    const origGroups = new Set(original.groups || []);
    const nextGroups = new Set(draft.groups || []);
    if (!origGroups.has('admin') && nextGroups.has('admin')) {
        warnings.push(
            'Adding the "admin" group grants full administrative privileges.'
        );
    }
    if (
        !origGroups.has('read-only-admin') &&
        nextGroups.has('read-only-admin')
    ) {
        warnings.push(
            'Adding the "read-only-admin" group grants elevated read access.'
        );
    }
    if (isSelf && getChangedFields(original, draft).length > 0) {
        warnings.push('You are modifying your own account.');
    }
    return warnings;
}
