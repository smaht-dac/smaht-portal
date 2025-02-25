import { cypressVisitHeaders } from '../support';

describe('Home Page', function () {
    beforeEach(() => {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT({
            email: 'cypress-main-scientist@cypress.hms.harvard.edu',
            useEnvToken: false,
        });
    });

    after(function () {
        cy.logoutSMaHT();
    });

    it('Header text is correct', () => {
        cy.get('.homepage-wrapper > .homepage-contents h1').contains(
            'Somatic Mosaicism across Human Tissues Data Portal'
        );
        cy.get('.homepage-wrapper > .homepage-contents h2')
            .contains(
                'A platform to search, visualize, and download somatic mosaic variants in normal tissues.'
            )
            .end();
    });

    it('Timeline dropdowns work as expected', () => {
        cy.get('#timeline .timeline-item').each(($item) => {
            cy.wrap($item)
                .find('.accordion .card-header-button')
                .each(($button) => {
                    cy.wrap($button)
                        .parents('.card')
                        .find('.accordion-collapse')
                        .then(($collapse) => {
                            cy.wrap($button).scrollIntoView();
                            cy.wrap($button).click({ force: true });

                            if (!$collapse.hasClass('show')) {
                                cy.wrap($button)
                                    .parents('.card')
                                    .find('.accordion-collapse')
                                    .should('have.class', 'show');
                            } else {
                                cy.wrap($button)
                                    .parents('.card')
                                    .find('.accordion-collapse')
                                    .should('not.have.class', 'show');
                            }
                        });
                });
        });
    });

    it(`Figure's tier buttons are working correctly.`, () => {
        cy.get('.selector-buttons button').then(($buttons) => {
            Cypress._.forEachRight($buttons, ($button, index) => {
                cy.log('index:', index, 'button:', $button);
                cy.wrap($button).click();

                cy.wrap($button)
                    .find('span')
                    .invoke('text')
                    .then((text) => {
                        const buttonText = text.toLowerCase().replace(/\s+/g, '-');

                        if (index === 0) {
                            expect(buttonText).to.equal('benchmarking');
                            cy.get('#timeline .timeline-item.tier-active')
                                .invoke('text')
                                .then((text) => {
                                    expect(text).to.contain('Benchmarking');
                                });
                        } else if (index === 1) {
                            expect(buttonText).to.equal('production');
                            cy.get('#timeline .timeline-item.tier-active')
                                .invoke('text')
                                .then((text) => {
                                    expect(text).to.contain('Production');
                                });
                        }

                        const className = `tier-${index}`;
                        cy.get('.card.assays').should('have.class', className);
                    });
            });
        });
    });

    it('Has Data Release Tracker feed w. 3+ items', function() {
        cy.get('.notifications-panel .data-release-tracker .data-release-item-container').should('have.length.of.at.least', 3);
    });

    it('Has Announcements feed w. 2+ items', function() {
        cy.get('.notifications-panel .announcements .announcement-container').should('have.length.of.at.least', 2);
    });

    it('Navbar dropdowns work as expected when logged in', () => {
        /* ==== Generated with Cypress Studio ==== */
        cy.get('#data-menu-item').clickEvent();
        cy.get('#docs-menu-item').clickEvent();
        cy.get('#about-menu-item').clickEvent();
        /* ==== End Cypress Studio ==== */
    });
});
