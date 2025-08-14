import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { testMatrixPopoverValidation } from "../support/utils/dataMatrixUtils";

describe('Public Donor Overview - Verify Random 3 Public Donors That are Associated with Released Files', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .validateUser('SCM');
    });

    after(function () {
        cy.logoutSMaHT();
    });

    const BASE_BROWSE_URL = '/browse/?type=File&sample_summary.studies=Production&status=released';
    const DONOR_SEARCH_URL = '/search/?type=Donor';

    // TODO: Implement environment variable support
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
            .then(($el) => {
                const txt = $el.text().trim();
                const cleaned = txt.replace(/[^\d.-]/g, '');
                const num = Number(cleaned);
                expect(Number.isNaN(num), `${label} should be a number (raw="${txt}")`).to.be.false;
                return num;
            });
    };

    // Helper: read the value element and its text for a given label inside the summary card
    const getOverviewValue = (label) => {
        const sel = `${summaryCardSel} .datum-title span:contains("${label}")`;
        return cy.get(sel)
            .should('be.visible')
            .closest('.datum')
            .find('.datum-value')
            .should('be.visible')
            .then(($val) => {
                const text = $val.text().trim();
                return { $el: $val, text };
            });
    };

    const verifyDonorSummary = (expectedDonorId) => {
        // Ensure the specific card is present and visible
        cy.get(summaryCardSel, { timeout: 60000 }).should('be.visible');

        // Section header checks
        cy.get(`${summaryCardSel} .header .header-text`)
            .should('be.visible')
            .and('have.text', 'Data Summary');

        cy.get(`${summaryCardSel} .data-card-section .section-title`)
            .should('be.visible')
            .and('have.text', 'Donor Overview');

        // --- Donor Overview strict checks ---------------------------------------

        // Donor ID must exactly match expectedDonorId
        getOverviewValue('Donor ID').then(({ text }) => {
            expect(text.length, 'Donor ID should not be empty').to.be.greaterThan(0);
            if (expectedDonorId) expect(text).to.eq(expectedDonorId);
        });

        // Age: just ensure non-empty
        getOverviewValue('Age').then(({ text }) => {
            expect(text.length, 'Age should not be empty').to.be.greaterThan(0);
        });

        // Sex: must be Male or Female
        getOverviewValue('Sex').then(({ text }) => {
            expect(['Male', 'Female'], `Sex should be Male or Female (got "${text}")`).to.include(text);
        });

        // Hardy Scale: integer between 0 and 4 inclusive
        getOverviewValue('Hardy Scale').then(({ text }) => {
            if (expectedDonorId != 'COLO829') {
                const n = Number(text);
                expect(Number.isInteger(n), `Hardy Scale should be an integer (got "${text}")`).to.be.true;
                expect(n, 'Hardy Scale should be between 0 and 4 (inclusive)').to.be.within(0, 4);
            } else {
                expect(text).to.eq('N/A');
            }
        });

        // Tier: Protected (+ has .coming-soon class)
        getOverviewValue('Tier').then(({ $el, text }) => {
            expect(text, 'Tier should be "Protected"').to.eq('Protected');
            expect($el.hasClass('coming-soon'), 'Tier value should have .coming-soon class').to.be.true;
        });

        // Bulk WGS Coverage: Protected (+ class)
        getOverviewValue('Bulk WGS Coverage').then(({ $el, text }) => {
            expect(text, 'Bulk WGS Coverage should be "Protected"').to.eq('Protected');
            expect($el.hasClass('coming-soon'), 'Bulk WGS Coverage should have .coming-soon class').to.be.true;
        });

        // DSA: Protected (+ class)
        getOverviewValue('DSA').then(({ $el, text }) => {
            expect(text, 'DSA should be "Protected"').to.eq('Protected');
            expect($el.hasClass('coming-soon'), 'DSA should have .coming-soon class').to.be.true;
        });

        // --- Donor statistics ------------------
        getNumericStatByLabel('Tissues').then((n) => expect(n).to.be.greaterThan(0));
        getNumericStatByLabel('Assays').then((n) => expect(n).to.be.greaterThan(0));
        getNumericStatByLabel('Files').then((n) => expect(n).to.be.greaterThan(0));
    };

    // Stable selector for the "Prior Diagnosis" card
    const priorDiagnosisSel = '.donor-view .data-card.prior-diagnosis';

    // Verify "Prior Diagnosis" card content
    const verifyPriorDiagnosis = () => {
        // Ensure the card exists and header text is correct
        cy.get(priorDiagnosisSel, { timeout: 20000 })
            .should('be.visible')
            .within(() => {
                cy.get('.header .header-text')
                    .should('be.visible')
                    .and('have.text', 'Prior Diagnosis');

                // --- Cancer History ---
                // Protected Data Should Not Exist (Contrary to Protected Donor) ---
                cy.contains('.section-title', /^Cancer History$/)
                    .should('not.exist'); // Public donors do not have this section

                // --- Family Cancer History ---
                // Protected Data Should Not Exist (Contrary to Protected Donor) ---
                cy.contains('.section-title', /^Family Cancer History$/)
                    .should('not.exist'); // Public donors do not have this section

                // --- Protected Data ---
                cy.contains('.body .protected-data h4', /^Protected Data$/)
                    .should('be.visible');
            });
    };

    // Stable selector for the "Exposures" card
    const exposuresCardSel = '.donor-view .data-card.exposure';

    // Normalizes a raw text: trims and collapses internal whitespace
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

    // Verify a single exposure-card by its title (e.g., "Tobacco" or "Alcohol")
    const verifyExposureByTitle = (title) => {
        const cardSel = `${exposuresCardSel} .exposure-card:has(.exposure-card-header .title:contains("${title}"))`;

        // Ensure the card exists
        cy.get(cardSel, { timeout: 20000 }).should('not.exist');
    };

    // Verify the whole "Exposures" card
    const verifyExposures = () => {
        // Card header
        cy.get(`${exposuresCardSel} .header .header-text`, { timeout: 20000 })
            .should('be.visible')
            .and('have.text', 'Environmental / Lifestyle Exposure');

        // Tobacco & Alcohol cards
        // Protected Data Should Not Exist (Contrary to Protected Donor) ---
        verifyExposureByTitle('Tobacco');
        verifyExposureByTitle('Alcohol');

        cy.contains('.body .protected-data h4', /^Protected Data$/)
            .should('be.visible');
    };

    // list what's in the header, then assert presence using multiple fallbacks
    const verifyHeaderButtons = () => {
        // 1) Ensure the donor view header exists
        cy.get('.donor-view .view-header', { timeout: 60000 })
            .should('be.visible')
            .first()
            .then(($hdr) => {
                // DEBUG: log all link/button texts in header
                const texts = $hdr.find('a,button').toArray().map((el) => norm(el.innerText));
                cy.log('Header controls (a,button):', texts.join(' | '));

                // 2) Try to find Donor Metadata link by multiple strategies
                const findMetadataLink = () => {
                    // a) by icon
                    let $link = $hdr.find('a.btn i.icon-users').closest('a');
                    if ($link.length) return $link;

                    // b) by download attribute
                    $link = $hdr.find('a[download]').first();
                    if ($link.length) return $link;

                    // c) by href pattern
                    $link = $hdr.find('a[href*="/resource-files/"]').first();
                    if ($link.length) return $link;

                    // d) by visible text (case-insensitive)
                    $link = $hdr.find('a').filter((_, el) => /donor metadata/i.test(el.innerText || '')).first();
                    if ($link.length) return $link;

                    // e) sometimes rendered as a button (unlikely, but try)
                    $link = $hdr.find('button').filter((_, el) => /donor metadata/i.test(el.innerText || '')).first();
                    if ($link.length) return $link;

                    return null;
                };

                const $meta = findMetadataLink();
                if ($meta) {
                    cy.wrap($meta).should('not.exist');
                }

                // 4) Assert the disabled "Download Donor Manifest" button
                const $btn = $hdr.find('button.download-button').filter((_, el) =>
                    /download donor manifest/i.test(el.innerText || '')
                ).first();

                if (!$btn.length) {
                    // Try globally under donor-view as a fallback
                    cy.get('.donor-view').then(($view) => {
                        const $globalBtn = $view.find('button.download-button').filter((_, el) =>
                            /download donor manifest/i.test(el.innerText || '')
                        ).first();
                        cy.wrap($globalBtn).should('be.visible').and('be.disabled').find('i.icon-user').should('exist');
                    });
                } else {
                    cy.wrap($btn).should('be.visible').and('be.disabled').find('i.icon-user').should('exist');
                }
            });
    };


    it('Browse by 3 random public donors associated with released files and validate public donor view', function () {
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
                // explicitly add COLO829 that can be never listed in BASE_BROWSE_URL
                selected.push('COLO829');
                cy.log(`Selected donors: ${selected.join(', ')}`);

                let donorSearchUrl = DONOR_SEARCH_URL;
                selected.forEach((donorId) => {
                    donorSearchUrl = appendParam(donorSearchUrl, 'display_title', donorId);
                });

                cy.visit(donorSearchUrl, { headers: cypressVisitHeaders });

                // Wait for initial loaders to disappear
                cy.get('#slow-load-container').should('not.have.class', 'visible');
                cy.get('.facet-charts.loading').should('not.exist');

                cy.get('.search-result-row[data-row-number]').as('resultRows');

                // Ensure there are at least 3 results
                cy.get('@resultRows').should('have.length', selected.length);

                function testVisit(index) {
                    if (index >= selected.length) return;
                    // Alias the current row
                    cy.get('@resultRows').eq(index).as('currentRow');

                    // Find and click the display title link
                    cy.get('@currentRow')
                        .find('[data-field="display_title"] a')
                        .then(($a) => {
                            const donorID = $a.text().trim();

                            // Remove target to open in same tab and click
                            cy.wrap($a)
                                .invoke('removeAttr', 'target')
                                .click({ force: true });

                            // Land on protected donor view
                            cy.location('pathname', { timeout: 15000 }).should('include', '/donors/');

                            cy.get('.donor-view .view-header .header-text', { timeout: 15000 })
                                .should('be.visible')
                                .and('contain', donorID);

                            // Verify header buttons (scoped to the correct header)
                            verifyHeaderButtons(donorID);

                            // Verify "Data Summary" / "Donor Overview" and stats (Option B for numbers)
                            verifyDonorSummary(donorID);

                            // Verify "Prior Diagnosis" card
                            verifyPriorDiagnosis();

                            // Verify "Exposures" card
                            verifyExposures();

                            //Verify "Data Matrix"
                            testMatrixPopoverValidation(
                                '#data-matrix-for_donor',
                                [donorID],
                                [],
                                [],
                                ['Tissues'], // to be changed if COLO829's data matrix is specially handled in "the public donor view" in the future
                                5, //regularBlockCount
                                5, //rowSummaryBlockCount
                                1, //colSummaryBlockCount
                                0, //totalCountExpected - if <=0 then do not verify
                            );
                        });

                    // Go back to the list page and continue with the next file
                    cy.go('back');
                    cy.get('.search-result-row[data-row-number]', { timeout: 10000 })
                        .should('have.length.at.least', selected.length)
                        .as('resultRows');

                    cy.then(() => testVisit(index + 1));
                }

                testVisit(0);
            });
    });

});
