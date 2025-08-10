// cypress/e2e/public-protected-donor-overview.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from "../support";

describe('Public/Protected Donor Overview - Verify Random 3 Protected Donors and 3 Public Donors That are Associated with Released Files', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .validateUser('SCM');
    });

    after(function () {
        cy.logoutSMaHT();
    });

    const BASE_BROWSE_URL = '/browse/?type=File&sample_summary.studies=Production&status=released';

    // Prefer env var for flexibility (set in cypress.config.* -> env.BASE_BROWSE_URL)
    const getBaseUrl = () => Cypress.env('BASE_BROWSE_URL') ?? BASE_BROWSE_URL;

    // Safe query param append (handles both bare and existing query string)
    const appendParam = (base, key, value) =>
        `${base}${base.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

    // Stable selector for the "Data Summary" card using jQuery :has / :contains
    // This avoids detaching by resolving the correct card in a single query.
    const summaryCardSel = '.donor-view .data-card:has(.header .header-text:contains("Data Summary"))';

    // Wait until the statistic's value text resolves to a pure number, then parse and return it.
    // We don't assert spinner state; we just wait for the final number (most deterministic).
    const getNumericStatByLabel = (label) => {
        const baseSel =
            `${summaryCardSel} .donor-statistic:` +
            `has(.donor-statistic-label:contains("${label}")) .donor-statistic-value`;

        // Ensure the summary container exists/visible before reading values
        cy.get(`${summaryCardSel} .data-summary`, { timeout: 60000 }).should('be.visible');

        // Wait until value's text matches a numeric pattern (Cypress retries internally)
        return cy.contains(baseSel, /^\s*\d+(\.\d+)?\s*$/, { timeout: 60000 })
            .then($el => {
                const txt = $el.text().trim();
                const cleaned = txt.replace(/[^\d.-]/g, '');
                const num = Number(cleaned);
                expect(Number.isNaN(num), `${label} should be a number (raw="${txt}")`).to.be.false;
                return num;
            });
    };

    // Verify "Data Summary" card content on donor view (scoped via summaryCardSel)
    const verifyDonorSummary = (expectedDonorId, filesCount) => {
        // Ensure the specific card is present and visible
        cy.get(summaryCardSel, { timeout: 60000 }).should('be.visible');

        // Section header checks
        cy.get(`${summaryCardSel} .header .header-text`)
            .should('be.visible')
            .and('have.text', 'Data Summary');

        cy.get(`${summaryCardSel} .data-card-section .section-title`)
            .should('be.visible')
            .and('have.text', 'Donor Overview');

        // Donor Overview fields
        const overviewFields = [
            'Donor ID',
            'Age',
            'Sex',
            'Hardy Scale',
            'Tier',
            'Bulk WGS Coverage',
            'DSA',
        ];

        overviewFields.forEach((label) => {
            // Ensure the label exists within the summary card
            cy.get(`${summaryCardSel} .datum-title span:contains("${label}")`)
                .should('be.visible')
                .closest('.datum')
                .find('.datum-value')
                .should('be.visible')
                .invoke('text')
                .then((txt) => {
                    const val = txt.trim();
                    expect(val.length, `${label} value should not be empty`).to.be.greaterThan(0);

                    // Strictly match Donor ID to the expected ID if provided
                    if (label === 'Donor ID' && expectedDonorId) {
                        expect(val).to.eq(expectedDonorId);
                    }
                });
        });

        // Donor statistics (Tissues, Assays, Files) — wait for numeric value only
        getNumericStatByLabel('Tissues').then((n) => expect(n).to.be.greaterThan(0));
        getNumericStatByLabel('Assays').then((n) => expect(n).to.be.greaterThan(0));
        getNumericStatByLabel('Files').then((n) => {
            expect(n).to.be.greaterThan(0);
            if (Number.isFinite(filesCount)) {
                expect(n).to.eq(filesCount);
            }
        });
    };

    it('Browse by 3 random donors associated with released files and validate donor view', function () {
        // Visit base browse page
        cy.visit(getBaseUrl(), { headers: cypressVisitHeaders });

        // Wait for initial loaders to disappear
        cy.get('#slow-load-container').should('not.have.class', 'visible');
        cy.get('.facet-charts.loading').should('not.exist');

        // Confirm facets area is ready
        cy.get('.facets-header .facets-title').should('have.text', 'Included Properties');

        // Ensure the donors facet is open (click header if closed)
        cy.get('[data-field="donors.display_title"].closed > h5').click();

        // Collect donors from facet <li data-key="...">
        cy.get('[data-field="donors.display_title"] li.facet-list-element')
            .should('have.length.at.least', 1)
            .then(($lis) => {
                const donors = [...$lis].map((li) => li.getAttribute('data-key')).filter(Boolean);

                // Pick 3 unique random donors (or fewer if not enough)
                const selected = Cypress._.sampleSize(donors, Math.min(3, donors.length));
                cy.log(`Selected donors: ${selected.join(', ')}`);

                // Repeat the flow for each selected donor
                cy.wrap(selected).each((donorID) => {
                    // Build URL with &donors.display_title=donorName
                    const url = appendParam(getBaseUrl(), 'donors.display_title', donorID);

                    cy.visit(url, { headers: cypressVisitHeaders });

                    // Wait for results to render
                    cy.get('#slow-load-container').should('not.have.class', 'visible');
                    cy.get('.facet-charts.loading').should('not.exist');
                    cy.url().should('include', `donors.display_title=${encodeURIComponent(donorID)}`);

                    // Ensure at least one search-result row is present
                    cy.get('.search-result-row[data-row-number]', { timeout: 10000 })
                        .as('resultRows')
                        .should('have.length.at.least', 1);

                    cy.searchPageTotalResultCount().then((totalCountExpectedRaw) => {
                        const totalCountExpected = Number(totalCountExpectedRaw);

                        // Find the donor link that matches the selected donor and open it
                        cy.get('@resultRows').first().scrollIntoView().then(($row) => {
                            cy.wrap($row).find('[data-field="donors"] a')
                                .contains(donorID)
                                .invoke('removeAttr', 'target') // keep your current approach
                                .click({ force: true });
                        });

                        // Land on protected donor view
                        cy.location('pathname', { timeout: 15000 }).should('include', '/protected-donors/');

                        // (Optional) Header contains donor ID
                        cy.get('.donor-view .view-header .header-text', { timeout: 15000 })
                            .should('be.visible')
                            .and('contain', donorID);

                        // Verify "Data Summary" / "Donor Overview" and stats (Option B for numbers)
                        verifyDonorSummary(donorID, totalCountExpected);
                    });
                });
            });
    });

});
