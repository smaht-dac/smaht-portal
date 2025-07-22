import { cypressVisitHeaders, ROLE_TYPES } from "../support";
/**
* Test you can visit the statistics page.
*/
describe('Statistics Page Validation (Submissions and Usage)', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .validateUser('SCM')
            .end();
    });

    after(function () {
        cy.logoutSMaHT();
    });

    it('Has correct title & tabs', function () {

        cy.visit('/statistics', { headers: cypressVisitHeaders }).end()
            .title().should('include', 'Portal Statistics').end()
            .get('.chart-section-control-wrapper.row a.select-section-btn[href="#submissions"]').should('contain', 'Data Submissions Statistics').end()
            .get('.chart-section-control-wrapper.row a.select-section-btn[href="#usage"]').should('contain', 'Portal Usage Statistics').end();
    });

    it('Usage statistics tab displays the File Downloads, Top File Set Downloads, File Overview Page Views and Page Views charts', function () {
        cy.get('.chart-section-control-wrapper.row a.select-section-btn[href="#usage"]').then(function ($tabBtn) {
            cy.wrap($tabBtn).click({ force: true }).end();
            cy.get('#usage.stats-charts-container .chart-group h3.charts-group-title').each(($el, index, $list) => {
                switch (index) {
                    case 0:
                        cy.wrap($el).should('contain', 'File Downloads');
                        break;
                    case 1:
                        cy.wrap($el).should('contain', 'Top File Set Downloads');
                        break;
                    case 2:
                        cy.wrap($el).should('contain', 'File Overview Page Views');
                        break;
                    case 3:
                        cy.wrap($el).should('contain', 'Page Views');
                        break;
                }
            });
        });
    });

    // TODO: enable this test once the submissions statistics is available for non-admins
    it.skip('Submission statistics tab displays the Metadata submitted, Data submitted and Data released to the portal charts', function () {
        cy.get('.chart-section-control-wrapper.row a.select-section-btn[href="#submissions"]').then(function ($tabBtn) {
            cy.wrap($tabBtn).click({ force: true }).end();
            cy.get('#submissions.stats-charts-container .legend').should('contain', 'HMS DAC').end();
            cy.get('#submissions.stats-charts-container .chart-group h3.charts-group-title').each(($el, index, $list) => {
                switch (index) {
                    case 0:
                        cy.wrap($el).should('contain', 'Metadata submitted');
                        break;
                    case 1:
                        cy.wrap($el).should('contain', 'Data submitted');
                        break;
                    case 2:
                        cy.wrap($el).should('contain', 'Data released to the portal');
                        break;
                }
            });
        });
    });
});
