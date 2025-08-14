import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { testMatrixPopoverValidation } from "../support/utils/dataMatrixUtils";

describe('Protected Donor Overview - Verify Random 3 Protected Donors That are Associated with Released Files', function () {

    before(function () {
        cy.visit('/', { headers: cypressVisitHeaders });
        cy.loginSMaHT(ROLE_TYPES.SMAHT_DBGAP)
            .validateUser('SCM');
    });

    after(function () {
        cy.logoutSMaHT();
    });

    const BASE_BROWSE_URL = '/browse/?type=File&sample_summary.studies=Production&status=released';

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
            .then($val => {
                const text = $val.text().trim();
                return { $el: $val, text };
            });
    };

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

        // --- Donor Overview strict checks ---------------------------------------

        // Donor ID must exactly match expectedDonorId
        getOverviewValue('Donor ID').then(({ text }) => {
            expect(text.length, 'Donor ID should not be empty').to.be.greaterThan(0);
            if (expectedDonorId) expect(text).to.eq(expectedDonorId);
        });

        // Age: just ensure non-empty (tighten later if you have bounds)
        getOverviewValue('Age').then(({ text }) => {
            expect(text.length, 'Age should not be empty').to.be.greaterThan(0);
        });

        // Sex: must be Male or Female
        getOverviewValue('Sex').then(({ text }) => {
            expect(['Male', 'Female'], `Sex should be Male or Female (got "${text}")`).to.include(text);
        });

        // Hardy Scale: integer between 0 and 4 inclusive
        getOverviewValue('Hardy Scale').then(({ text }) => {
            const n = Number(text);
            expect(Number.isInteger(n), `Hardy Scale should be an integer (got "${text}")`).to.be.true;
            expect(n, 'Hardy Scale should be between 0 and 4 (inclusive)').to.be.within(0, 4);
        });

        // Tier: Coming soon (+ has .coming-soon class)
        getOverviewValue('Tier').then(({ $el, text }) => {
            expect(text, 'Tier should be "Coming soon"').to.eq('Coming soon');
            expect($el.hasClass('coming-soon'), 'Tier value should have .coming-soon class').to.be.true;
        });

        // Bulk WGS Coverage: Coming soon (+ class)
        getOverviewValue('Bulk WGS Coverage').then(({ $el, text }) => {
            expect(text, 'Bulk WGS Coverage should be "Coming soon"').to.eq('Coming soon');
            expect($el.hasClass('coming-soon'), 'Bulk WGS Coverage should have .coming-soon class').to.be.true;
        });

        // DSA: Coming soon (+ class)
        getOverviewValue('DSA').then(({ $el, text }) => {
            expect(text, 'DSA should be "Coming soon"').to.eq('Coming soon');
            expect($el.hasClass('coming-soon'), 'DSA should have .coming-soon class').to.be.true;
        });

        // --- Donor statistics ------------------
        getNumericStatByLabel('Tissues').then((n) => expect(n).to.be.greaterThan(0));
        getNumericStatByLabel('Assays').then((n) => expect(n).to.be.greaterThan(0));
        getNumericStatByLabel('Files').then((n) => {
            expect(n).to.be.greaterThan(0);
            if (Number.isFinite(filesCount)) {
                expect(n).to.eq(filesCount);
            }
        });
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
                cy.contains('.section-title', /^Cancer History$/)
                    .should('be.visible')
                    .siblings('.section-body')
                    .find('span')
                    .invoke('text')
                    .then((txt) => {
                        const val = txt.trim();
                        const allowed = ['Yes', 'No', 'Unknown'];
                        if (!allowed.includes(val)) {
                            expect(val.length, `Cancer History should be Yes/No/Unknown or non-empty value (got "${val}")`)
                                .to.be.greaterThan(0);
                        }
                    });

                // --- Family Cancer History ---
                cy.contains('.section-title', /^Family Cancer History$/)
                    .should('be.visible')
                    .siblings('.section-body')
                    .find('span')
                    .invoke('text')
                    .then((txt) => {
                        const val = txt.trim();
                        const allowed = ['Yes', 'No', 'N/A'];
                        expect(allowed, `Family Cancer History should be Yes, No or N/A (got "${val}")`).to.include(val);
                    });

                // --- Other Diagnosis ---
                cy.contains('.section-title', /^Other Diagnosis$/)
                    .should('be.visible')
                    .siblings('.section-body')
                    .find('span')
                    .invoke('text')
                    .then((txt) => {
                        const val = txt.trim();
                        expect(val.startsWith('Protected'), `Other Diagnosis should start with "Protected" (got "${val}")`).to.be.true;
                    });
            });
    };

    // Stable selector for the "Exposures" card
    const exposuresCardSel = '.donor-view .data-card.exposure';

    // Normalizes a raw text: trims and collapses internal whitespace
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

    // Returns true if value should trigger frequency check (non-empty and not '--' or 'N/A')
    const triggersFrequency = (text) => {
        const t = norm(text).toUpperCase();
        return t !== '' && t !== '--' && t !== 'N/A';
    };

    // Read a datum value under a given exposure-card by its label
    const readExposureDatum = (cardSel, label) =>
        cy.get(`${cardSel} .datum .datum-title:contains("${label}")`)
            .should('be.visible')
            .closest('.datum')
            .find('.datum-value')
            .should('be.visible')
            .invoke('text')
            .then((t) => norm(t)); // norm() handles undefined cases


    // Verify a single exposure-card by its title (e.g., "Tobacco" or "Alcohol")
    const verifyExposureByTitle = (title) => {
        const cardSel = `${exposuresCardSel} .exposure-card:has(.exposure-card-header .title:contains("${title}"))`;

        // Ensure the card exists
        cy.get(cardSel, { timeout: 20000 }).should('be.visible');

        // Read values
        return Cypress.Promise.all([
            readExposureDatum(cardSel, 'Duration'),
            readExposureDatum(cardSel, 'Frequency'),
            readExposureDatum(cardSel, 'Cessation'),
        ]).then(([duration, frequency, cessation]) => {
            // If Duration or Cessation is a valid/triggering value, Frequency must be in the allowed set
            const mustCheckFrequency = triggersFrequency(duration) || triggersFrequency(cessation);
            if (mustCheckFrequency) {
                const allowed = ['Social', 'Light', 'Moderate', 'Heavy'];
                expect(allowed, `${title} -> Frequency must be one of ${allowed.join(', ')} (got "${frequency}")`)
                    .to.include(frequency);
            }
            return { duration, frequency, cessation };
        });
    };

    // Verify the whole "Exposures" card
    const verifyExposures = () => {
        // Card header
        cy.get(`${exposuresCardSel} .header .header-text`, { timeout: 20000 })
            .should('be.visible')
            .and('have.text', 'Exposures');

        // Tobacco & Alcohol cards
        verifyExposureByTitle('Tobacco');
        verifyExposureByTitle('Alcohol');

        // Other Exposures must start with "Protected"
        cy.get(`${exposuresCardSel} .data-card-section .section-title:contains("Other Exposures")`)
            .should('be.visible')
            .siblings('.section-body')
            .find('span')
            .invoke('text')
            .then((t) => {
                const val = norm(t);
                expect(val.startsWith('Protected'), `Other Exposures should start with "Protected" (got "${val}")`).to.be.true;
            });
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

                // 3) Assert the metadata control
                cy.wrap($meta)
                    .should('be.visible')
                    .then(($el) => {
                        const tag = ($el.prop('tagName') || '').toLowerCase();
                        // If it's an anchor, check href
                        if (tag === 'a') {
                            const href = $el.attr('href') || '';
                            expect(href.length, 'Donor Metadata href should not be empty').to.be.greaterThan(0);
                            // If your environment always uses /resource-files/, keep this; else comment out:
                            expect(href).to.match(/\/resource-files\//);
                        }
                    })
                    .invoke('text')
                    .then((txt) => {
                        expect(norm(txt)).to.match(/donor metadata/i);
                    });

                // Optional icon
                cy.wrap($meta).find('i.icon-users').should('exist');

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


    it('Browse by 3 random protected donors associated with released files and validate protected donor view', function () {
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

                        cy.get('.donor-view .view-header .header-text', { timeout: 15000 })
                            .should('be.visible')
                            .and('contain', donorID);

                        // Verify header buttons (scoped to the correct header)
                        verifyHeaderButtons(donorID);

                        // Verify "Data Summary" / "Donor Overview" and stats (Option B for numbers)
                        verifyDonorSummary(donorID, totalCountExpected);

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
                            ['Tissues'],
                            5, //regularBlockCount
                            5, //rowSummaryBlockCount
                            1, //colSummaryBlockCount
                            totalCountExpected
                        );
                    });
                });
            });
    });

});
