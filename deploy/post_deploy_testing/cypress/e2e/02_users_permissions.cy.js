import { cypressVisitHeaders } from '../support';
import { navUserAcctDropdownBtnSelector, navUserAcctLoginBtnSelector } from '../support/selectorVars';

describe('Impersonate user JWT, navigate to profile, edit last_name to & back.', function () {


    context('Frontend Test User Profile', function () {

        beforeEach(function () {
            cy.visit('/', { headers: cypressVisitHeaders });
            cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false }).end()
                .get(navUserAcctDropdownBtnSelector)
                .should('not.contain.text', 'Login')
                .then((accountListItem) => {
                    expect(accountListItem.text()).to.contain('SCM');
                }).end();
        });

        afterEach(function () {
            cy.logoutSMaHT();
        });

        it('Ensure logged in, visit profile page, add & remove access key', function () {

            cy.get(navUserAcctDropdownBtnSelector).click().end()
                .get('#overlays-container .big-dropdown-menu .help-menu-tree .level-1-title-container').contains('a', 'Profile').click().end()
                .get('.page-container .user-info h1.user-title').should('contain', "Scientist").end() // Test only for first name as we're editing last name & it may change re: delayed indexing, etc.
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

        // TODO: Currently, editing the first and last name is not permitted for regular users. Comment out the code block below when it gets available
        // it('Ensure logged in, visit profile page, edit last name 2x.', function () {

        //     cy.get(navUserAcctDropdownBtnSelector).click().end()
        //         .get('#overlays-container .big-dropdown-menu')
        //         .should('have.class', 'is-open')
        //         .get('.help-menu-tree .level-1-title-container').contains('a', 'Profile').click().end()
        //         .get('.page-container .user-info h1.user-title').invoke('text').should('include', "Scientist").end() // Test only for first name as we're editing last name & it may change re: delayed indexing, etc.
        //         .url().then(function (currUrl) {
        //             return cy.visit(currUrl + '?datastore=database', { headers: cypressVisitHeaders }).end() // Edit last name ON DATASTORE=DATABASE TO PREVENT ERRORS DUE TO INDEXING NOT BEING CAUGHT UP FROM PRIOR TEST
        //                 .get('.page-container .user-info h1.user-title .last_name .value.saved a.edit-button').click().end()
        //                 .get('.page-container .user-info h1.user-title .last_name .value.editing input')
        //                 .scrollToCenterElement().clear().type('SuperTest', { delay: 0 }).then(function (inputfield) {
        //                     return cy.window().get('.page-container .user-info h1.user-title .last_name .value.editing .save-button').click()
        //                         .should('have.length', 0).end()
        //                         .get('.page-container .user-info h1.user-title .last_name .value.editing .loading-icon').should('have.length', 0).end()
        //                         .get('.page-container .user-info h1.user-title').should('have.text', "Scientist SuperTest").end()
        //                         // After reloading on datastore=database, last name stays edited. Then change back.
        //                         .reload()//.visit(currUrl + '?datastore=database').end()
        //                         .get('.page-container .user-info h1.user-title').should('have.text', "Scientist SuperTest").end()
        //                         // Cleanup & test again
        //                         .get('.page-container .user-info h1.user-title .last_name .value.saved a.edit-button').click().end()
        //                         .get('.page-container .user-info h1.user-title .last_name .value.editing input').should('have.value', 'SuperTest')
        //                         .clear({ force: true }).type('Test', { delay: 0 }).then(function (inputfield) {
        //                             return cy
        //                                 .get('.page-container .user-info h1.user-title .last_name .value.editing .save-button').click()
        //                                 .should('have.length', 0).end()
        //                                 .get('.page-container .user-info h1.user-title .last_name .value.editing .loading-icon').should('have.length', 0).end()
        //                                 .get('.page-container .user-info h1.user-title').should('have.text', "Scientist Test").end()
        //                                 .reload()
        //                                 .get('.page-container .user-info h1.user-title').should('have.text', "Scientist Test").end();
        //                         });

        //                 });
        //         }).end().logoutSMaHT();
        // });

    });

});
