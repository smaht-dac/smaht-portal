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
        // SMAHT (dbgap) user
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP).then(() => {
            cy.logoutSMaHT().then(() => {
                // SMAHT (non-dbgap) user
                cy.loginSMaHT(ROLE_TYPES.SMAHT_NON_DBGAP).then(() => {
                    cy.logoutSMaHT().then(() => {
                        // Public (dbgap) user
                        cy.loginSMaHT(ROLE_TYPES.PUBLIC_DBGAP).then(() => {
                            cy.logoutSMaHT().then(() => {
                                // Public (non-dbgap) user
                                cy.loginSMaHT(ROLE_TYPES.PUBLIC_NON_DBGAP).then(() => {
                                    cy.logoutSMaHT();
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
