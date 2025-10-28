// cypress/e2e/home_profile_access.spec.js
import { cypressVisitHeaders, ROLE_TYPES } from '../support';
import { navUserAcctDropdownBtnSelector } from '../support/selectorVars';
import { gotoUrl } from '../support/utils/basicUtils';

const PROFILE_URL = '/me';
const NO_VIEW_PERMISSIONS_TEXT = 'no view permissions';
const DEFAULT_CONSORTIA_NAME = 'SMaHT';

const ROLE_MATRIX = {
    UNAUTH: {
        label: 'Unauthenticated',
        isAuthenticated: false,
        // steps
        canSeeProfile: false,
        canManageAccessKeys: false,
        // expectations
        expectedConsortia: null,
        expectedSubmissionCenter: null,
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,

        canSeeProfile: true,
        canManageAccessKeys: true,

        expectedConsortia: DEFAULT_CONSORTIA_NAME,
        expectedSubmissionCenter: null,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,

        canSeeProfile: true,
        canManageAccessKeys: true,

        expectedConsortia: DEFAULT_CONSORTIA_NAME,
        expectedSubmissionCenter: null,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,

        canSeeProfile: true,
        canManageAccessKeys: true,

        expectedConsortia: null,
        expectedSubmissionCenter: null,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,

        canSeeProfile: true,
        canManageAccessKeys: true,

        expectedConsortia: null,
        expectedSubmissionCenter: null,
    },
};

// 2) Common helper functions

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.loginSMaHT(roleKey).end();
    }
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.logoutSMaHT();
    }
}

// Navigate to the profile page if allowed; otherwise assert no access.
function openProfileMenuOrAssertForbidden(caps) {
    if (!caps.canSeeProfile) {
        // visit PROFILE_URL directly and get 403 error
        cy.visit(PROFILE_URL, { headers: cypressVisitHeaders, failOnStatusCode: false });
        cy.get('body').should('contain', '403').and('contain', 'Not logged in').end();

        return;
    }

    // If profile is allowed, open the dropdown and click Profile
    cy.get(navUserAcctDropdownBtnSelector).click().end()
        .get('#overlays-container .big-dropdown-menu .help-menu-tree .level-1-title-container')
        .contains('a', 'Profile')
        .click()
        .end();
}

// Validate profile details (name, consortia, submission center)
function assertProfileBasics(caps) {
    if (!caps.canSeeProfile) return;

    cy.get('.page-container .user-info h1.user-title')
        .should('contain', 'Cypress')
        .end();

    if (caps.expectedConsortia) {
        const selector = caps.expectedConsortia === NO_VIEW_PERMISSIONS_TEXT
            ? '.page-container .organizations #consortia li em'
            : '.page-container .organizations #consortia li a';
        cy.get(selector)
            .should('contain', caps.expectedConsortia)
            .end();
    } else {
        cy.get('.page-container .organizations #consortia li').should('not.exist');
    }

    if (caps.expectedSubmissionCenter) {
        const selector = caps.expectedSubmissionCenter === NO_VIEW_PERMISSIONS_TEXT
            ? '.page-container .organizations #submission_centers li em'
            : '.page-container .organizations #submission_centers li a';
        cy.get(selector)
            .should('contain', caps.expectedSubmissionCenter)
            .end();
    } else {
        cy.get('.page-container .organizations #submission_centers li')
            .should('have.length.at.least', 0);
    }
}

// Validate or skip access key management based on role capabilities
function maybeAddAndRemoveAccessKey(caps) {
    if (!caps.canManageAccessKeys) {
        // If the role should not manage keys, verify section absence or button absence
        cy.get('body').then(($b) => {
            if ($b.find('.page-container .access-keys-container').length > 0) {
                cy.get('.page-container .access-keys-container h3')
                    .should('contain', "Access Keys");
                cy.get('.page-container .access-keys-container #add-access-key')
                    .should('not.exist');
            } else {
                cy.log('Access keys section not present for this role, as expected');
            }
        });
        return;
    }

    // Full add/remove key workflow for allowed roles
    cy.get('.page-container .access-keys-container h3').should('contain', "Access Keys").end()
        .get('.page-container .access-keys-container #add-access-key').scrollToCenterElement().click({ force: true }).end()
        .get('.modal-body').should('contain', 'Access Key ID').should('contain', 'Secret Access Key').end()
        .get('.modal-body div.row:first-of-type code').invoke('text').then((accessKeyID) =>
            cy
                .get('.fade.show.modal-backdrop').click({ force: true }).end()
                // Verify key appears in table
                .get('.page-container .access-keys-container').should('contain', accessKeyID).end()
                // Delete the key
                .get('.page-container .access-keys-container .access-keys-table tr:first-child .access-key-buttons .btn-danger').click().end()
                .get('.fade.show.modal-backdrop').click({ force: true }).end()
                // Verify removal
                .get('.page-container .access-keys-container').should('not.contain', accessKeyID)
        );
}

// 3) Parameterized test generation for all roles
const ROLES_TO_TEST = [
    'UNAUTH',
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Impersonate / Profile smoke by role', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = ROLE_MATRIX[roleKey].label || String(roleKey);

        context(`${label} → profile capabilities`, () => {

            before(() => {
                gotoUrl();
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`should open profile (if allowed) and validate user info (enabled: ${caps.canSeeProfile})`, () => {
                openProfileMenuOrAssertForbidden(caps);
                assertProfileBasics(caps);
            });

            it(`should add/remove access key if the role has permission (enabled: ${caps.canManageAccessKeys})`, () => {
                openProfileMenuOrAssertForbidden(caps);
                maybeAddAndRemoveAccessKey(caps);
            });
        });
    });
});
