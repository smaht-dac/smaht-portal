import { cypressVisitHeaders } from '../support';
import { ROLE_TYPES } from '../support';

describe('Home Page', function () {
    before(() => {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .end();
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

    it('Has Data Release Tracker feed w. item(s)', function() {
        cy.get('.notifications-panel .data-release-tracker .data-release-item-container')
            .should('have.length.greaterThan', 0);
    });

    it('Each Data Release Tracker item links to correct number of files', function () {
        // Use an array to accumulate test steps
        cy.get('.data-release-item-container').then(($containers) => {
            // Iterate manually because we need sequential navigation (cy.visit)
            const containerCount = $containers.length;

            for (let i = 0; i < containerCount; i++) {
                const $container = $containers.eq(i);

                // Extract count text and href from DOM snapshot
                const countText = $container.find('.header-link .count').text().trim();
                const match = countText.match(/^(\d+)/);
                const expectedCount = match ? parseInt(match[1], 10) : 0;
                const href = $container.find('.header-link').attr('href');

                // Add test logic to Cypress queue
                cy.then(() => {
                    cy.visit(href, { headers: cypressVisitHeaders });

                    // Wait for results to load — update selector accordingly
                    cy.searchPageTotalResultCount()
                        .then((actualCount) => {
                            expect(actualCount).to.eq(expectedCount);
                        });

                    // Go back for the next iteration
                    cy.go('back');

                    // Wait for page to reload before next loop
                    cy.get('.data-release-item-container').should('have.length.at.least', containerCount);
                });
            }
        });
    });



    it('Has Announcements feed w. item(s)', function() {
        cy.visit('/', { headers: cypressVisitHeaders })
            .get('.notifications-panel .announcements .announcement-container')
            .should('have.length.greaterThan', 0);
    });

    it('Navbar dropdowns work as expected when logged in', () => {
        /* ==== Generated with Cypress Studio ==== */
        cy.get('#data-menu-item').clickEvent();
        cy.get('#docs-menu-item').clickEvent();
        cy.get('#about-menu-item').clickEvent();
        /* ==== End Cypress Studio ==== */
    });
});
