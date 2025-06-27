import { cypressVisitHeaders } from '../support';
import { navUserAcctDropdownBtnSelector } from '../support/selectorVars';

describe('Impersonate user JWT, navigate to profile & back.', function () {


    context('Frontend Test User Profile', function () {

        beforeEach(function () {
            cy.visit('/', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false })
                .validateUser('SCM')
                .end();
        });

        afterEach(function () {
            cy.logoutSMaHT();
        });

        it('Ensure logged in, visit profile page, validate consortia and submission center(s), add & remove access key', function () {

            cy.get(navUserAcctDropdownBtnSelector).click().end()
                .get('#overlays-container .big-dropdown-menu .help-menu-tree .level-1-title-container').contains('a', 'Profile').click().end()
                .get('.page-container .user-info h1.user-title').should('contain', 'Scientist').end()
                .get('.page-container .organizations #consortia li a').should('contain', 'SMaHT').end()
                .get('.page-container .organizations #submission_centers li a').should('contain', 'HMS DAC').end()
                .get('.page-container .access-keys-container h3').should('contain', "Access Keys").end()
                .get('.page-container .access-keys-container #add-access-key').scrollToCenterElement().click({ force: true }).end()
                .get('.modal-body').should('contain', 'Access Key ID').should('contain', 'Secret Access Key').end()
                .get('.modal-body div.row:first-of-type code').invoke('text').then(function (accessKeyID) {
                    return cy.get('.fade.show.modal-backdrop').click({ force: true }).end()
                        // Assert we have new access key in table.
                        .get('.page-container .access-keys-container').should('contain', accessKeyID).end()
                        // Now, delete it.
                        .get('.page-container .access-keys-container .access-keys-table tr:first-child .access-key-buttons .btn-danger').click().end()
                        .get('.fade.show.modal-backdrop').click({ force: true }).end()
                        // Assert it gone from table.
                        .get('.page-container .access-keys-container').should('not.contain', accessKeyID);
                });

        });

    });

});
