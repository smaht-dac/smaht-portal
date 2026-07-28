import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// -------------------------------------------------------------------------
// Pure helper tests — no mocks, no DOM. These carry the real behavioral
// coverage (payload building, diffing, array-clear semantics) because the
// interactive react-select behavior is not runnable under the default (node)
// Jest environment.
// -------------------------------------------------------------------------
const {
    getStatusEnum,
    getGroupsEnum,
    extractUserBaseline,
    draftFromBaseline,
    normalizeLinkArray,
    sameStringSet,
    isFieldChanged,
    getChangedFields,
    buildUserPatchPayload,
    diffUserFields,
    computeSubmitsForOptions,
    computeChangeWarnings,
    formatPatchError,
    USER_STATUS_ENUM_FALLBACK,
    USER_GROUPS_ENUM_FALLBACK,
} = require('../item-pages/components/user/userAdminHelpers');

describe('userAdminHelpers - schema enum extraction', () => {
    it('reads status/groups enums from the merged schema', () => {
        const schemas = {
            User: {
                properties: {
                    status: { enum: ['current', 'deleted'] },
                    groups: { items: { enum: ['admin', 'dbgap'] } },
                },
            },
        };
        expect(getStatusEnum(schemas)).toEqual(['current', 'deleted']);
        expect(getGroupsEnum(schemas)).toEqual(['admin', 'dbgap']);
    });

    it('falls back to hard-coded enums when schema is missing them', () => {
        expect(getStatusEnum(null)).toEqual(USER_STATUS_ENUM_FALLBACK);
        expect(getGroupsEnum({})).toEqual(USER_GROUPS_ENUM_FALLBACK);
        expect(USER_STATUS_ENUM_FALLBACK).toEqual([
            'current',
            'deleted',
            'inactive',
            'revoked',
        ]);
        expect(USER_GROUPS_ENUM_FALLBACK).toEqual([
            'admin',
            'read-only-admin',
            'dbgap',
            'public-dbgap',
        ]);
    });
});

describe('userAdminHelpers - baseline normalization', () => {
    it('normalizes a linkTo array from strings and embedded objects', () => {
        expect(
            normalizeLinkArray(['/a/', { '@id': '/b/' }, { atId: '/c/' }, {}])
        ).toEqual(['/a/', '/b/', '/c/']);
        expect(normalizeLinkArray(undefined)).toEqual([]);
    });

    it('extracts a clean scalar/@id-array baseline from an embedded user', () => {
        const embedded = {
            status: 'current',
            groups: ['dbgap'],
            submits_for: [{ '@id': '/submission-centers/x/' }],
        };
        expect(extractUserBaseline(embedded)).toEqual({
            status: 'current',
            groups: ['dbgap'],
            submits_for: ['/submission-centers/x/'],
        });
    });

    it('handles a user with no admin-editable fields set', () => {
        expect(extractUserBaseline({})).toEqual({
            status: '',
            groups: [],
            submits_for: [],
        });
    });
});

describe('userAdminHelpers - draftFromBaseline', () => {
    it('copies scalar and array values from the baseline', () => {
        const baseline = {
            status: 'current',
            groups: ['dbgap'],
            submits_for: ['/a/'],
        };
        expect(draftFromBaseline(baseline)).toEqual(baseline);
    });

    it('clones arrays so draft never shares references with the baseline', () => {
        const baseline = {
            status: 'current',
            groups: ['dbgap'],
            submits_for: ['/a/'],
        };
        const draft = draftFromBaseline(baseline);
        expect(draft.groups).not.toBe(baseline.groups);
        expect(draft.submits_for).not.toBe(baseline.submits_for);
    });

    it('tolerates missing/undefined array fields', () => {
        expect(draftFromBaseline({ status: 'current' })).toEqual({
            status: 'current',
            groups: [],
            submits_for: [],
        });
        expect(draftFromBaseline(undefined)).toEqual({
            groups: [],
            submits_for: [],
        });
    });
});

describe('userAdminHelpers - change detection', () => {
    const original = {
        status: 'current',
        groups: ['dbgap'],
        submits_for: ['/a/', '/b/'],
    };

    it('sameStringSet is order-insensitive', () => {
        expect(sameStringSet(['/a/', '/b/'], ['/b/', '/a/'])).toBe(true);
        expect(sameStringSet(['/a/'], ['/a/', '/b/'])).toBe(false);
    });

    it('detects a changed status', () => {
        expect(
            isFieldChanged('status', original, {
                ...original,
                status: 'deleted',
            })
        ).toBe(true);
    });

    it('treats reordered arrays as unchanged', () => {
        expect(
            isFieldChanged('submits_for', original, {
                ...original,
                submits_for: ['/b/', '/a/'],
            })
        ).toBe(false);
    });

    it('getChangedFields returns only the differing fields', () => {
        const draft = {
            status: 'deleted',
            groups: ['dbgap', 'admin'],
            submits_for: ['/a/', '/b/'],
        };
        expect(getChangedFields(original, draft).sort()).toEqual([
            'groups',
            'status',
        ]);
    });
});

describe('userAdminHelpers - buildUserPatchPayload', () => {
    const original = {
        status: 'current',
        groups: ['dbgap'],
        submits_for: ['/a/'],
    };

    it('includes only changed keys', () => {
        expect(
            buildUserPatchPayload(original, { ...original, status: 'deleted' })
        ).toEqual({ status: 'deleted' });
    });

    it('returns {} when nothing changed (toggle back to original)', () => {
        expect(
            buildUserPatchPayload(original, {
                status: 'current',
                groups: ['dbgap'],
                submits_for: ['/a/'],
            })
        ).toEqual({});
    });

    it('sends the full replacement array when adding a submits_for center', () => {
        expect(
            buildUserPatchPayload(original, {
                ...original,
                submits_for: ['/a/', '/b/'],
            })
        ).toEqual({ submits_for: ['/a/', '/b/'] });
    });

    it('emits an empty array to clear a field (safe clear via wholesale replace)', () => {
        expect(
            buildUserPatchPayload(original, { ...original, submits_for: [] })
        ).toEqual({ submits_for: [] });
        expect(
            buildUserPatchPayload(original, { ...original, groups: [] })
        ).toEqual({ groups: [] });
    });

    it('accumulates multiple simultaneous changes into one payload', () => {
        expect(
            buildUserPatchPayload(original, {
                status: 'inactive',
                groups: ['dbgap', 'admin'],
                submits_for: [],
            })
        ).toEqual({
            status: 'inactive',
            groups: ['dbgap', 'admin'],
            submits_for: [],
        });
    });
});

describe('userAdminHelpers - diffUserFields', () => {
    it('produces from→to rows and maps submits_for @ids to labels', () => {
        const original = {
            status: 'current',
            groups: [],
            submits_for: ['/a/'],
        };
        const draft = {
            status: 'deleted',
            groups: ['admin'],
            submits_for: ['/a/', '/b/'],
        };
        const labelMap = { '/a/': 'Center A', '/b/': 'Center B' };
        const rows = diffUserFields(original, draft, labelMap);
        const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
        expect(byField.status).toEqual({
            field: 'status',
            from: 'current',
            to: 'deleted',
        });
        expect(byField.groups).toEqual({
            field: 'groups',
            from: '(none)',
            to: 'admin',
        });
        expect(byField.submits_for).toEqual({
            field: 'submits_for',
            from: 'Center A',
            to: 'Center A, Center B',
        });
    });
});

describe('userAdminHelpers - computeSubmitsForOptions', () => {
    it('maps @graph to options + labelMap and sorts by label', () => {
        const { options, labelMap } = computeSubmitsForOptions([
            { '@id': '/b/', display_title: 'Beta' },
            { '@id': '/a/', display_title: 'Alpha' },
            { display_title: 'no-id-dropped' },
        ]);
        expect(options).toEqual([
            { value: '/a/', label: 'Alpha' },
            { value: '/b/', label: 'Beta' },
        ]);
        expect(labelMap).toEqual({ '/a/': 'Alpha', '/b/': 'Beta' });
    });
});

describe('userAdminHelpers - computeChangeWarnings', () => {
    const original = { status: 'current', groups: [], submits_for: [] };

    it('warns on delete/revoke status', () => {
        const w = computeChangeWarnings(
            original,
            { ...original, status: 'deleted' },
            false
        );
        expect(w.join(' ')).toContain('removes the user');
    });

    it('warns on granting admin', () => {
        const w = computeChangeWarnings(
            original,
            { ...original, groups: ['admin'] },
            false
        );
        expect(w.join(' ')).toContain('administrative privileges');
    });

    it('warns when editing own account', () => {
        const w = computeChangeWarnings(
            original,
            { ...original, status: 'inactive' },
            true
        );
        expect(w.join(' ')).toContain('your own account');
    });

    it('emits no warnings for a benign change to another user', () => {
        expect(
            computeChangeWarnings(
                original,
                { ...original, groups: ['dbgap'] },
                false
            )
        ).toEqual([]);
    });
});

describe('userAdminHelpers - formatPatchError', () => {
    it('joins snovault validation errors', () => {
        expect(
            formatPatchError({
                errors: [{ description: 'bad status' }, { name: 'oops' }],
            })
        ).toBe('bad status; oops');
    });
    it('falls back to detail', () => {
        expect(formatPatchError({ detail: 'nope' })).toBe('nope');
    });
    it('handles empty input', () => {
        expect(formatPatchError(null)).toContain('unknown');
    });
});

// -------------------------------------------------------------------------
// Render test — mock react-select (v5 pulls in emotion/DOM) and SPC so the
// component imports under the node test environment. componentDidMount does
// NOT run under renderToStaticMarkup, so the panel renders from the
// embedded-context baseline set in the constructor.
// -------------------------------------------------------------------------
jest.mock('react-select', () => (props) => {
    const React = require('react');
    // Render selected values so assertions can see them.
    const value = props.value;
    const asText = Array.isArray(value)
        ? value.map((v) => v.label).join(',')
        : value
        ? value.label
        : '';
    return React.createElement(
        'div',
        { 'data-testid': 'select', 'data-input-id': props.inputId },
        asText
    );
});

jest.mock('@hms-dbmi-bgm/shared-portal-components/es/components/util', () => ({
    ajax: { load: jest.fn() },
    navigate: jest.fn(),
    JWT: { getUserDetails: () => ({ email: 'admin@example.com' }) },
}));

jest.mock(
    '@hms-dbmi-bgm/shared-portal-components/es/components/ui/Alerts',
    () => ({
        Alerts: { queue: jest.fn() },
    })
);

// react-bootstrap ships untranspiled ESM under node_modules (ignored by the
// Babel transform); stub the Modal to a passthrough so the component imports.
jest.mock('react-bootstrap/esm/Modal', () => {
    const React = require('react');
    const Modal = ({ children }) => React.createElement('div', null, children);
    Modal.Header = ({ children }) => React.createElement('div', null, children);
    Modal.Title = ({ children }) => React.createElement('div', null, children);
    Modal.Body = ({ children }) => React.createElement('div', null, children);
    Modal.Footer = ({ children }) => React.createElement('div', null, children);
    return { __esModule: true, default: Modal };
});

describe('UserAdminControls - render', () => {
    const UserAdminControls =
        require('../item-pages/components/user/UserAdminControls').default;

    const user = {
        '@id': '/users/abc/',
        email: 'target@example.com',
        status: 'current',
        groups: ['dbgap'],
        submits_for: [{ '@id': '/sc/1/', display_title: 'Center One' }],
    };
    const schemas = {
        User: {
            properties: {
                status: { enum: ['current', 'deleted', 'inactive', 'revoked'] },
                groups: {
                    items: {
                        enum: [
                            'admin',
                            'read-only-admin',
                            'dbgap',
                            'public-dbgap',
                        ],
                    },
                },
            },
        },
    };

    it('renders the admin panel with three controls seeded from context', () => {
        const html = renderToStaticMarkup(
            <UserAdminControls
                user={user}
                schemas={schemas}
                mayEdit={true}
                onUpdated={jest.fn()}
            />
        );
        expect(html).toContain('data-testid="user-admin-controls"');
        expect(html).toContain('data-input-id="user-admin-status"');
        expect(html).toContain('data-input-id="user-admin-groups"');
        expect(html).toContain('data-input-id="user-admin-submits-for"');
        // Selected values reflect the user's current fields.
        expect(html).toContain('current'); // status
        expect(html).toContain('dbgap'); // groups
        expect(html).toContain('Center One'); // submits_for label from embedded ctx
    });

    it('shows the full-edit link only when mayEdit', () => {
        const withEdit = renderToStaticMarkup(
            <UserAdminControls user={user} schemas={schemas} mayEdit={true} />
        );
        expect(withEdit).toContain('Open full edit page');
        const noEdit = renderToStaticMarkup(
            <UserAdminControls user={user} schemas={schemas} mayEdit={false} />
        );
        expect(noEdit).not.toContain('Open full edit page');
    });
});

// -------------------------------------------------------------------------
// Guard test for the non-admin path: assert UserView keeps the original,
// byte-identical column classNames and gates the panel behind an admin check.
// A source-string assertion (like BrowseDonorPeekMetadata.test.js) avoids
// importing UserView's heavy dependency tree.
// -------------------------------------------------------------------------
describe('UserView admin gating (source invariants)', () => {
    const userViewSource = fs.readFileSync(
        path.resolve(__dirname, '../item-pages/UserView.js'),
        'utf8'
    );

    it('gates the admin panel behind the isAdmin state and renders it only then', () => {
        expect(userViewSource).toContain(
            "import UserAdminControls from './components/user/UserAdminControls';"
        );
        expect(userViewSource).toContain('isAdmin ? (');
        expect(userViewSource).toContain('<UserAdminControls');
    });

    it('resolves isAdmin after mount (no SSR hydration mismatch)', () => {
        expect(userViewSource).toContain('componentDidMount()');
        expect(userViewSource).toContain("groups.indexOf('admin')");
    });

    it('keeps the non-admin column classNames byte-identical to the pre-feature layout', () => {
        expect(userViewSource).toContain(
            "'col-12 col-lg-6 col-xl-7 mb-2 mb-lg-0'"
        );
        expect(userViewSource).toContain("'col-12 col-lg-6 col-xl-5'");
    });
});
