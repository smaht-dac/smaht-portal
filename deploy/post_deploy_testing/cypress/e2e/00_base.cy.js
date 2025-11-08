import { cypressVisitHeaders, ROLE_TYPES } from '../support';

describe('Basic functionality: page loads and can authenticate.', function () {
    it('Has correct title', function () {
        cy.visit('/', { headers: cypressVisitHeaders })
            .end()
            .title()
            .should('include', 'SMaHT Data Portal')
            .end();
    });

    it('Can users having different roles login and out in order', function () {
        const rolesInOrder = [
            ROLE_TYPES.SMAHT_DBGAP,
            ROLE_TYPES.SMAHT_NON_DBGAP,
            ROLE_TYPES.PUBLIC_DBGAP,
            ROLE_TYPES.PUBLIC_NON_DBGAP,
        ];
        cy.wrap(rolesInOrder).each((role) => {
            cy.loginSMaHT(role);
            cy.logoutSMaHT();
        });

    });
});
