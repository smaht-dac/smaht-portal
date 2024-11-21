import { cypressVisitHeaders } from "../support";

describe('About Layout Tests', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
    });

    context('Consortium Member Data Validation and Interactions', function () {
        it('Verifies that the consortium member count matches the number found in the table', function () {
            cy.get('#about-menu-item').should('have.class', 'dropdown-toggle').click().should('have.class', 'dropdown-open-for').then(() => {
                cy.get('#menutree-linkto-about_consortium_awardees').click().end()
                    .get('#page-title-container .page-title').should('contain', 'SMaHT Consortium Members').end()
                    .get('.consortium-map-container svg > g.consortium-legend > text')
                    .each(($el) => {
                        cy.wrap($el)
                            .invoke('text')
                            .then((text) => {
                                const abbreviation = text
                                    .split(' ') // Split text by spaces to get individual words
                                    .filter(word => /^[A-Z]/.test(word)) // Filter to include only words starting with an uppercase letter
                                    .map(word => word[0]) // Take the first letter of each selected word
                                    .join('');   // Join letters to form the abbreviation

                                const number = parseInt(text.match(/\d+/)[0]);

                                cy.get(`.table-responsive > table > tbody > tr > td.consortium-table-${abbreviation}`)
                                    .its('length')
                                    .then((count) => {
                                        // You can also add an assertion if needed
                                        expect(parseInt(count)).to.be.equal(number); // Example assertion
                                    });
                            });
                    });
            });
        });

        it('Verifies the hover interaction for consortium member', function () {
            cy.get('.consortium-map-container > .interaction-notice')
                .should('contain', 'Hover over pins to read more about each SMaHT Consortium Member').end();

            cy.get('.consortium-map-container > svg')
                .find('g[transform]')
                .first() // Select the first <g> tag with a transform attribute
                .scrollIntoView()
                .find('svg') // Find the child <svg> tag within this <g> tag
                .trigger('mouseover', { force: true }) // Trigger a hover event
                .should('have.attr', 'aria-describedby', 'popover-consortium-map') // Verify if aria-describedby is set to popover-consortium-map
                .then(($svg) => {
                    cy.wrap($svg).trigger('mouseout', { force: true }).should('not.have.attr', 'aria-describedby', 'popover-consortium-map');
                });
        });

    });

    context('Consortium Data Interactions', function () {
        it('Verifies hover interactions for data consortium elements', function () {
            cy.get('#about-menu-item').should('have.class', 'dropdown-toggle').click().should('have.class', 'dropdown-open-for').then(() => {
                cy.get('#menutree-linkto-about_consortium_data').click().end()
                    .get('#page-title-container .page-title').should('contain', 'SMaHT Data').end()
                    .get('.stackrow-table > thead > tr > th > span')
                    .first()
                    .scrollIntoView()
                    .trigger('mouseover', { force: true }) // Trigger a hover event
                    .should('have.attr', 'aria-expanded', 'true')
                    .then(($element) => {
                        cy.wrap($element).trigger('mouseout', { force: true }).should('have.attr', 'aria-expanded', 'false');
                    }).end()
                    .get('.stackrow-table .stackrow-table-body > tr.stackrow-row > td.stackrow-item > div.stackrow-item-container > span')
                    .first()
                    .trigger('mouseover', { force: true })
                    .should('have.attr', 'aria-describedby', 'popover-consortium-data-alluvial-table')
                    .then(($svg) => {
                        cy.wrap($svg).trigger('mouseout', { force: true }).should('not.have.attr', 'aria-describedby', 'popover-consortium-data-alluvial-table');
                    });
            });
        });

    });

});
