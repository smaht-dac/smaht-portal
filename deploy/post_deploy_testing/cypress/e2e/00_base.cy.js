import { ROLE_TYPES } from '../support';
import { gotoUrl } from '../support/utils/basicUtils';

// 1) Define role capabilities matrix
const ROLE_MATRIX = {
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,
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

// 3) Parameterized test generation for all roles
const ROLES_TO_TEST = [
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Basic functionality: page loads and can authenticate.', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = ROLE_MATRIX[roleKey].label || String(roleKey);

        context(`${label} → profile capabilities`, () => {

            before(() => {
                gotoUrl();
                loginIfNeeded(roleKey, { forceLogout: true });
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it('Has correct title', function () {
                cy.title()
                    .should('include', 'SMaHT Data Portal')
                    .end();
            });
        });
    });
});
