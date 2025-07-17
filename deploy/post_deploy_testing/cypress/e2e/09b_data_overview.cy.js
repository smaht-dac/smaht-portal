import { cypressVisitHeaders } from "../support";

const dataNavBarItemSelectorStr = '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';

describe('Data Overview - QC Metrics', function () {

    const tabLabels = [
        'Sample Integrity',
        'Key Metrics',
        'Metrics - All',
        'Metric vs. Metric - All',
        'Metrics by file'
    ];

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });

        cy.loginSMaHT({ 'email': 'cypress-main-scientist@cypress.hms.harvard.edu', 'useEnvToken': false })
            .validateUser('SCM')
            .get(dataNavBarItemSelectorStr)
            .should('have.class', 'dropdown-toggle')
            .click()
            .should('have.class', 'dropdown-open-for').then(() => {

                cy.get('.big-dropdown-menu.is-open a.big-link[href="/qc-metrics"]')
                    .click({ force: true }).then(function ($linkElem) {
                        cy.get('#slow-load-container').should('not.have.class', 'visible').end();
                        const linkHref = $linkElem.attr('href');
                        cy.location('pathname').should('equal', linkHref);
                    });

                // Verify that the page contains the correct header
                cy.contains('div#qc_visualizations h2.section-title', 'QC Metric Visualizations').should('be.visible');
            });
    });

    it('Verify all tabs are present and functional', function () {

        // Verify that the tabs are present
        cy.get('#qc-metrics-tabs')
            .should('exist')
            .and('be.visible')
            .find('button')
            .should('have.length', tabLabels.length)
            .each((tab, index) => {
                cy.wrap(tab).should('contain.text', tabLabels[index]);
            });

        // Click on each tab and verify its functionality
        cy.get('#qc-metrics-tabs').within(() => {
            tabLabels.forEach((label, index) => {
                cy.contains('button', label)
                    .click()
                    .should('have.class', 'active')
                    .and('have.attr', 'aria-selected', 'true');
            });
        });
    });

    it('Verify Sample Integrity tab, check presence of dropdown, chart and table', function () {

        // Verify that the Sample Integrity tab is present and functional
        cy.get('#qc-metrics-tabs')
            .contains('button', 'Sample Integrity')
            .should('be.visible')
            .click()
            .should('have.class', 'active')
            .and('have.attr', 'aria-selected', 'true')
            .get('#qc-metrics-tabs-tabpane-sample-integrity').within(() => {

                // Assert that the combobox displays COLO829 as the selected value
                cy.get('div[class$="singleValue"]')
                    .should('contain.text', 'COLO829');

                // Open the dropdown menu
                cy.get('[role="combobox"]').click();

                // Wait for the options to become visible and select the first option that is not COLO829
                cy.get('[role="option"]').then(($options) => {
                    // Find the first option whose text is not COLO829
                    const otherOption = [...$options].find((opt) => opt.textContent.trim() !== 'COLO829');
                    // Click the found option
                    if (otherOption) {
                        cy.wrap(otherOption).click();
                    }
                });

                // Assert that the selected value has changed and is no longer COLO829
                cy.get('div[class$="singleValue"]')
                    .should('not.contain.text', 'COLO829');

                // Open the dropdown to get all available options' text values
                cy.get('[role="combobox"]').click();
                cy.get('[role="option"]').then(($options) => {
                    const optionTexts = [...$options].map((opt) => opt.textContent.trim());
                    let prevFirstCell = null;
                    let prevXAxisTick = null;
                    let prevYAxisTick = null;

                    cy.wrap(optionTexts).each((optionText, index) => {
                        cy.get('[role="combobox"]').click();
                        cy.get('[role="option"]').contains(optionText).click();
                        cy.get('div[class$="singleValue"]').should('have.text', optionText);

                        // Table existence and row check
                        cy.contains('div.pt-5.h4', 'Somalier results').should('be.visible');
                        cy.get('table.qc-metrics-data-table')
                            .should('exist')
                            .and('be.visible')
                            .find('tbody tr')
                            .its('length')
                            .should('be.gte', 1);

                        // Table change check
                        cy.get('table.qc-metrics-data-table tbody tr:first td:first')
                            .invoke('text')
                            .then((firstCellText) => {
                                if (index > 0) {
                                    expect(firstCellText).not.to.eq(prevFirstCell);
                                }
                                prevFirstCell = firstCellText;
                            });

                        // Chart existence and axis label checks
                        cy.contains('h4', 'Pairwise sample relatedness')
                            .should('be.visible')
                            .parent()
                            .find('svg.sample-contamination-svg')
                            .should('exist')
                            .and('be.visible')
                            .as('chartSvg');

                        // Chart must have axis labels
                        cy.get('@chartSvg')
                            .should('contain.text', 'Sample A')
                            .and('contain.text', 'Sample B');

                        // X and Y axis tick label update check
                        // X axis: horizontal bottom tick labels (usually the last <g.tick> at the bottom)
                        cy.get('@chartSvg')
                            .find('g.tick text')
                            .then(($ticks) => {
                                // Heuristic: X axis tick is the tick with highest y attribute
                                // Y axis tick is the tick with lowest x attribute (can be improved if axes structure changes)
                                const ticks = [...$ticks].map((el) => {
                                    return {
                                        text: el.textContent.trim(),
                                        x: Number(el.getAttribute('x') || 0),
                                        y: Number(el.getAttribute('y') || 0),
                                        transform: el.getAttribute('transform') || ''
                                    };
                                });

                                // Find X axis ticks (often y is the largest)
                                const xAxisTicks = ticks.filter((t) => t.transform.includes('rotate(-45)') || t.y > 500); // heuristics
                                // Find Y axis ticks (often x is negative or very small)
                                const yAxisTicks = ticks.filter((t) => t.x < 10 && !t.transform.includes('rotate(-45)'));

                                const firstXAxisTick = xAxisTicks.length > 0 ? xAxisTicks[0].text : '';
                                const firstYAxisTick = yAxisTicks.length > 0 ? yAxisTicks[0].text : '';

                                if (index > 0) {
                                    expect(firstXAxisTick).not.to.eq(prevXAxisTick);
                                    expect(firstYAxisTick).not.to.eq(prevYAxisTick);
                                }
                                prevXAxisTick = firstXAxisTick;
                                prevYAxisTick = firstYAxisTick;
                            });
                    });
                });
            });

    });

});
