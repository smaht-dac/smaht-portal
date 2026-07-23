import { min } from 'underscore';
import { cypressVisitHeaders, ROLE_TYPES, BROWSE_STATUS_PARAMS } from '../support';
import {
    navBrowseByDonorBtnSelector,
    dataNavBarItemSelectorStr,
    navUserAcctLoginBtnSelector,
} from '../support/selectorVars';
import {
    parseIntSafe,
    parsePositiveIntegerCount,
    reconcileApiTotalWithUiCount,
    toBarIdentity,
} from '../support/utils/dataMatrixUtils';


/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role:

   - runNavFromHome:           From Home → open "Data" menu → click "Browse"
   - runDirectBrowseRedirect:  Visit /browse/ (no params) → redirected to Production
   - runQuickInfoBarCounts:    Verify QuickInfoBar has non-zero stats
   - runSidebarToggle:         Sidebar toggle expand/collapse
------------------------------------------------------------------------- */

const EMPTY_STATS_SUMMARY_OPTS = {
    totalFiles: 0,
    totalDonors: 0,
    totalTissues: 0,
    totalAssays: 0,
    totalFileSizeGB: 0,
};
const DEFAULT_STATS_SUMMARY_OPTS = {
    totalFiles: 20,
    totalDonors: 5,
    totalTissues: 5,
    totalAssays: 3,
    totalFileSizeGB: 1000,
};

const ROLE_MATRIX = {
    UNAUTH: {
        label: 'Unauthenticated',
        isAuthenticated: false,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetChartBarPlotTests: true,
        runTissueTypeFilterTests: true,
        runCohortViewChartTests: true,
        runSearchTableRowsTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
        expectedCancerHistoryVisible: false,
        expectedExposureTobaccoVisible: false,
        expectedExposureAlcoholVisible: false,
        expectedNoResultsModalVisible: true,
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetChartBarPlotTests: true,
        runTissueTypeFilterTests: true,
        runCohortViewChartTests: true,
        runSearchTableRowsTests: true,

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
        expectedType: 'ProtectedDonor',
        expectedCancerHistoryVisible: true,
        expectedExposureTobaccoVisible: true,
        expectedExposureAlcoholVisible: true,
        expectedNoResultsModalVisible: false,
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetChartBarPlotTests: true,
        runTissueTypeFilterTests: true,
        runCohortViewChartTests: true,
        runSearchTableRowsTests: true,

        expectedStatsSummaryOpts: DEFAULT_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
        expectedCancerHistoryVisible: false,
        expectedExposureTobaccoVisible: false,
        expectedExposureAlcoholVisible: false,
        expectedNoResultsModalVisible: false,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetChartBarPlotTests: true,
        runTissueTypeFilterTests: true,
        runCohortViewChartTests: true,
        runSearchTableRowsTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedType: 'ProtectedDonor',
        expectedCancerHistoryVisible: true,
        expectedExposureTobaccoVisible: true,
        expectedExposureAlcoholVisible: true,
        expectedNoResultsModalVisible: true,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,

        runNavFromHome: true,
        runDirectBrowseRedirect: false,
        runNoResultsModal: true,
        runQuickInfoBarCounts: true,
        runSidebarToggle: true,
        runFacetChartBarPlotTests: true,
        runTissueTypeFilterTests: true,
        runCohortViewChartTests: true,
        runSearchTableRowsTests: true,

        expectedStatsSummaryOpts: EMPTY_STATS_SUMMARY_OPTS,
        expectedType: 'Donor',
        expectedCancerHistoryVisible: false,
        expectedExposureTobaccoVisible: false,
        expectedExposureAlcoholVisible: false,
        expectedNoResultsModalVisible: true,
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */

function goto(url = '/', headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

/**
 * Navigates from the Browse dropdown to the Donor View.
 * @param {Object} caps - Config object containing the expected type (e.g. { expectedType: 'ProtectedDonor' })
 * @returns {Cypress.Chainable} - Cypress chain for further chaining
 */
function visitBrowseByDonor(caps) {
    const typeParam = `type=${caps.expectedType}`;

    // Step 1: Open the dropdown menu
    cy.getLoadedMenuItem(dataNavBarItemSelectorStr)
        .click()
        .should('have.class', 'dropdown-open-for');

    // Step 2: Validate the target link contains the correct href parameter
    cy.get(navBrowseByDonorBtnSelector)
        .should('have.attr', 'href')
        .and('include', typeParam);

    // Step 3: Re-query and click the link (to avoid detached DOM issues)
    cy.get(navBrowseByDonorBtnSelector)
        .should('be.visible')
        .click();

    // Step 4: Verify correct navigation
    cy.location('search').should('include', typeParam);

    // Step 5: Wait for page loading to complete
    return cy
        .get('#slow-load-container', { timeout: 30000 })
        .should('not.have.class', 'visible')
        .get('.facet-charts.loading', { timeout: 30000 })
        .should('not.exist');
}

// Helper function to check total donor count for a given chart title.
// Prefers series (white) labels; falls back to category totals (dark) labels.
// Excludes axis tick labels (gray).
function checkChartTotal(title, expectedTotal) {
    cy.contains('.donor-cohort-view-chart h3', title)
        .closest('.donor-cohort-view-chart')
        .find('svg text')
        .should(($texts) => {
            // Collect only numeric texts
            const numeric = Array.from($texts)
                .map((el) => { return { el, txt: el.textContent.trim(), style: el.getAttribute('style') || '' }; })
                .filter((o) => /^\d+$/.test(o.txt));

            // Exclude axis ticks (gray labels)
            const notAxis = numeric.filter((o) => !o.style.includes('rgb(107, 114, 128)'));

            // Prefer series labels (white on bars); else fallback to category totals (dark)
            const whites = notAxis.filter((o) => o.style.includes('rgb(255, 255, 255)')).map((o) => Number(o.txt));
            const darks = notAxis.filter((o) => o.style.includes('rgb(17, 24, 39)')).map((o) => Number(o.txt));

            const picked = whites.length ? whites : darks;
            const total = picked.reduce((s, n) => s + n, 0);

            expect(total, `${title} total`).to.eq(expectedTotal);
        });
}

// Compares a value read from the UI against an expected number that itself
// came from a different UI read moments earlier. Both numbers describe the
// same underlying live dataset, so persistent disagreement is a real
// diagnostic - but a single mismatch may just be one read catching mid-render
// or mid-filter state, so re-read once before failing with both values
// attached.
function assertCountsEventuallyEqual(readActualCount, readExpectedCount, message, retries = 1) {
    let firstMismatch = null;

    function attempt(remaining) {
        return readActualCount().then((actual) =>
            readExpectedCount().then((expected) => {
                if (actual === expected) return actual;
                if (!firstMismatch) firstMismatch = { actual, expected };
                if (remaining > 0) {
                    return cy.wait(1000).then(() => attempt(remaining - 1));
                }
                throw new Error(
                    `${message} persisted after re-read; ` +
                    `first actual/expected: ${firstMismatch.actual}/${firstMismatch.expected}, ` +
                    `final actual/expected: ${actual}/${expected}`
                );
            })
        );
    }

    return attempt(retries);
}

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

/* ----------------------------- STEP HELPERS ----------------------------- */

/** From Home → open "Data" dropdown → click "Browse" → lands on Production Data */
function stepNavigateFromHomeToBrowse(caps) {

    visitBrowseByDonor(caps).then(() => {
        cy.get('#page-title-container .page-title')
            .should('contain', 'SMaHT Production Data');

        cy.location('search').then((search) => {
            // Base query parameters that should always be included
            const baseParams = [`type=${caps.expectedType}`, 'study=Production'];

            // Split dynamic status parameters and merge them with base ones
            const allParams = [...baseParams, ...BROWSE_STATUS_PARAMS.split('&')];

            // Assert that each expected query parameter is present in the URL search string
            allParams.forEach((param) => {
                expect(search).to.include(param);
            });
        });
    });
}

/** Visit /browse/ (no params) → redirected to Production browse query */
/** NOT IN USE - BACKEND REDIRECT NOT IMPLEMENTED YET */
function stepDirectBrowseRedirect(caps) {
    cy.visit('/browse/', { headers: cypressVisitHeaders, failOnStatusCode: false });
    cy.location('search').should('include', 'study=Production');
}

/** Modal appears when no results found */
function stepNoResultsModal(caps) {
    visitBrowseByDonor(caps).then(() => {
        if (caps.expectedNoResultsModalVisible) {
            cy.get('#download-access-required-modal').should('be.visible');
            cy.searchPageTotalResultCount().then((totalCountExpected) => {
                expect(totalCountExpected).to.equal(0);
            });

            cy.get('body').then(($body) => {
                const $loginBtn = $body.find(navUserAcctLoginBtnSelector);
                const hasLoginText =
                    $loginBtn.length > 0 &&
                    $loginBtn.text().replace(/\s+/g, ' ').trim().includes('Login / Register');
                if (hasLoginText) {
                    cy.wrap($loginBtn).click({ force: true });
                    cy.get('[id^="auth0-lock-container"], .auth0-lock')
                        .should('be.visible')
                        .then(($lock) => {
                            const lockZIndex = parseInt($lock.css('z-index') || '0', 10);
                            const modalZIndex = parseInt(
                                $body
                                    .find('#download-access-required-modal')
                                    .closest('.modal')
                                    .css('z-index') || '0',
                                10
                            );
                            if (!Number.isNaN(lockZIndex) && !Number.isNaN(modalZIndex)) {
                                expect(lockZIndex).to.be.greaterThan(modalZIndex);
                            }
                        });
                    cy.get('body').then(($auth0Body) => {
                        if ($auth0Body.find('.auth0-lock-close-button').length > 0) {
                            cy.get('.auth0-lock-close-button').click({ force: true });
                        } else if ($auth0Body.find('.auth0-lock-overlay').length > 0) {
                            cy.get('.auth0-lock-overlay').click({ force: true });
                        }
                    });
                } else {
                    cy.log('Skipping Auth0 login popup check; login button not present or not labeled "Login / Register".');
                }
            });
        } else {
            cy.get('#download-access-required-modal').should('not.exist');
        }
    });
}

/** QuickInfoBar numbers should be present and > 0 (or ≥ threshold for size) */
function stepQuickInfoBarCounts(caps) {
    cy.getQuickInfoBar().then((info) => {
        cy.log('Files Generated: ' + info.file);
        if (caps.expectedStatsSummaryOpts.totalFiles > 0)
            expect(info.file).to.be.at.least(caps.expectedStatsSummaryOpts.totalFiles);
        else
            expect(info.file).to.equal(0);

        cy.log('Donors: ' + info.donor);
        if (caps.expectedStatsSummaryOpts.totalDonors > 0)
            expect(info.donor).to.be.at.least(caps.expectedStatsSummaryOpts.totalDonors);
        else
            expect(info.donor).to.equal(0);

        cy.log('Tissues: ' + info.tissue);
        if (caps.expectedStatsSummaryOpts.totalTissues > 0)
            expect(info.tissue).to.be.at.least(caps.expectedStatsSummaryOpts.totalTissues);
        else
            expect(info.tissue).to.equal(0);

        cy.log('Assays: ' + info.assay);
        if (caps.expectedStatsSummaryOpts.totalAssays > 0)
            expect(info.assay).to.be.at.least(caps.expectedStatsSummaryOpts.totalAssays);
        else
            expect(info.assay).to.equal(0);

        cy.log('Total File Size: ' + info['file-size']);
        if (caps.expectedStatsSummaryOpts.totalFileSizeGB > 0)
            expect(info['file-size']).to.be.at.least(0.01);
        else
            expect(info['file-size']).to.equal(0);
    });
}

/** Sidebar toggle expand/collapse */
function stepSidebarToggle(caps) {
    cy.get('.sliding-sidebar-nav-container .toggle-button')
        .click({ force: true })
        .should('have.attr', 'aria-expanded', 'true')
        .get('.sliding-sidebar-ui-container')
        .should('have.class', 'show-nav')
        .end()
        .get('.sliding-sidebar-nav-container .toggle-button')
        .click({ force: true })
        .should('have.attr', 'aria-expanded', 'false')
        .get('.sliding-sidebar-ui-container')
        .should('have.class', 'collapse-nav')
        .end();
}

// Tissue x sequencer combinations of particular interest. These are used as a
// *preference* when sampling bars to test (see selectBarPartSample) - never a
// hard requirement, since whether a given pair currently has any files is a
// live-data fact that changes independently of this test suite.
const tissueSequencerPairs = [
    {
        tissueTerms: [
            '3AK - Frontal Lobe, Brain, Left hemisphere',
            '3AK - Brain, Frontal Lobe',
            '3AK - Brain',
            'Brain',
        ],
        sequencer: 'Illumina NovaSeq X Plus',
    },
    {
        tissueTerms: ['3A - Whole Blood', 'Whole Blood', 'Blood'],
        sequencer: 'ONT PromethION 24',
    },
    {
        tissueTerms: ['3I - Liver', 'Liver'],
        sequencer: 'PacBio Revio',
    },
];

// TODO: reuse the mapping in data.js in utk_browse_viz_tissue_type branch is merged to prevent duplicate
const tissueInternalCodeByTpcCode = {
    '3A': 'BLOO',
    '3B': 'BUCC',
    '3C': 'ESOP',
    '3E': 'COAS',
    '3G': 'CODS',
    '3I': 'LIVR',
    '3K': 'ADGL',
    '3M': 'ADGR',
    '3O': 'AORT',
    '3Q': 'LUNG',
    '3S': 'HART',
    '3U': 'TESL',
    '3W': 'TESR',
    '3Y': 'OVAL',
    '3AA': 'OVAR',
    '3AC': 'FBRO',
    '3AD': 'SKSE',
    '3AF': 'SKNE',
    '3AH': 'MUSC',
    '3AK': 'BRFL',
    '3AL': 'BRTL',
    '3AM': 'BRCE',
    '3AN': 'BRHL',
    '3AO': 'BRHR',
};

const tissueCategoryByTpcCode = {
    '3A': 'Clinically accessible',
    '3B': 'Clinically accessible',
    '3C': 'Endoderm',
    '3E': 'Endoderm',
    '3G': 'Endoderm',
    '3I': 'Endoderm',
    '3K': 'Mesoderm',
    '3M': 'Mesoderm',
    '3O': 'Mesoderm',
    '3Q': 'Endoderm',
    '3S': 'Mesoderm',
    '3U': 'Germ cells',
    '3W': 'Germ cells',
    '3Y': 'Germ cells',
    '3AA': 'Germ cells',
    '3AC': 'Mesoderm',
    '3AD': 'Ectoderm',
    '3AF': 'Ectoderm',
    '3AH': 'Mesoderm',
    '3AK': 'Ectoderm',
    '3AL': 'Ectoderm',
    '3AM': 'Ectoderm',
    '3AN': 'Ectoderm',
    '3AO': 'Ectoderm',
};

const tissueTypeFilterOptions = [
    { buttonText: 'All', expectedCategory: null },
    { buttonText: 'Ectoderm', expectedCategory: 'Ectoderm' },
    { buttonText: 'Mesoderm', expectedCategory: 'Mesoderm' },
    { buttonText: 'Endoderm', expectedCategory: 'Endoderm' },
    { buttonText: 'Germ cells', expectedCategory: 'Germ cells' },
    { buttonText: 'Clinically accessible', expectedCategory: 'Clinically accessible' },
];

function getTissueVariants(tissueTerms) {
    const variants = new Set();

    tissueTerms.forEach((tissueTerm) => {
        variants.add(tissueTerm);

        const tpcCodeMatch = /^([A-Z0-9]+)\s+-/.exec(tissueTerm);
        const tpcCode = tpcCodeMatch?.[1];
        const internalCode = tissueInternalCodeByTpcCode[tpcCode];

        if (internalCode) {
            variants.add(internalCode);
        }
    });

    return [...variants];
}

function assertTextMatchesAnyVariant(actualText, acceptedVariants, message) {
    const normalizedText = (actualText || '').replace(/\s+/g, ' ').trim();
    const matchesVariant = acceptedVariants.includes(normalizedText);

    expect(
        matchesVariant,
        `${message}. Actual text: "${normalizedText}". Accepted: ${acceptedVariants.join(', ')}`
    ).to.equal(true);
}

// Discover every tissue x sequencer bar-part that is actually rendered in the
// current chart (data-driven; the chart contents change with live data), so
// tests never depend on a specific pair being present.
function getRenderedBarParts() {
    return cy.get('body').then(($body) => {
        const barPartsByKey = new Map();

        $body.find('.bar-plot-chart .chart-bar[data-term]').each((_, chartBar) => {
            const tissueTerm = chartBar.getAttribute('data-term');

            Cypress.$(chartBar)
                .find('.bar-part[data-term]')
                .each((__, barPartEl) => {
                    const sequencer = barPartEl.getAttribute('data-term');
                    const dataCount = Number(barPartEl.getAttribute('data-count'));
                    if (Number.isInteger(dataCount) && dataCount > 0) {
                        const key = JSON.stringify([tissueTerm, sequencer]);
                        if (!barPartsByKey.has(key)) {
                            // Sampling retains identity only. The count is live
                            // render state and must be re-read at execution.
                            barPartsByKey.set(key, toBarIdentity({ tissueTerm, sequencer }));
                        }
                    }
                });
        });

        return [...barPartsByKey.values()];
    });
}

// Build a small, deterministic sample of bar-parts to exercise. Known
// tissue/sequencer combinations of particular interest are preferred *if
// currently rendered*, but are never required - if none of them are present
// in the live chart, the sample falls back to whatever bars do exist so
// coverage doesn't drop to zero just because production data shifted.
function selectBarPartSample(renderedBarParts, sampleSize = 3) {
    const preferred = [];

    tissueSequencerPairs.forEach(({ tissueTerms, sequencer }) => {
        const variants = getTissueVariants(tissueTerms);
        const match = renderedBarParts.find(
            (part) => part.sequencer === sequencer && variants.includes(part.tissueTerm)
        );
        if (match) preferred.push(match);
    });

    const uniquePreferred = [...new Map(
        preferred.map((part) => [JSON.stringify([part.tissueTerm, part.sequencer]), part])
    ).values()];
    const preferredKeys = new Set(
        uniquePreferred.map((part) => JSON.stringify([part.tissueTerm, part.sequencer]))
    );
    const remaining = renderedBarParts
        .filter((part) => !preferredKeys.has(JSON.stringify([part.tissueTerm, part.sequencer])))
        .sort((a, b) => (a.tissueTerm + a.sequencer).localeCompare(b.tissueTerm + b.sequencer));

    return [...uniquePreferred, ...remaining].slice(0, sampleSize);
}

// Filter by attribute values in JavaScript rather than interpolating live data
// into a CSS selector; tissue/sequencer labels may legally contain quotes or
// other selector-significant characters.
function getRenderedBarPart(tissueTerm, sequencer) {
    let barPart;
    return cy.get('.bar-plot-chart .chart-bar[data-term]')
        .should(($chartBars) => {
            const chartBar = [...$chartBars].find(
                (candidate) => candidate.getAttribute('data-term') === tissueTerm
            );
            barPart = chartBar && [...Cypress.$(chartBar).find('.bar-part[data-term]')].find(
                (candidate) => candidate.getAttribute('data-term') === sequencer
            );
            expect(barPart, `Rendered bar-part for ${tissueTerm} x ${sequencer}`).to.exist;
        })
        .then(() => cy.wrap(barPart));
}

function assertTissueAxisLabel(tissueTerms, resolvedTissueTerm) {
    const acceptedVariants = [...new Set([...getTissueVariants(tissueTerms), resolvedTissueTerm])];

    cy.get('.bar-plot-chart .rotated-label[data-term]')
        .should(($labels) => {
            const label = [...$labels].find(
                (candidate) => candidate.getAttribute('data-term') === resolvedTissueTerm
            );
            expect(label, `Axis label for ${resolvedTissueTerm}`).to.exist;
            const $label = Cypress.$(label);
            const labelText = $label.text().replace(/\s+/g, ' ').trim();
            const labelTitle = ($label.attr('title') || '').trim();

            if (acceptedVariants.includes(labelText)) {
                return;
            }

            assertTextMatchesAnyVariant(
                labelTitle,
                acceptedVariants,
                `Axis label title should match an accepted tissue variant for ${resolvedTissueTerm}`
            );
        });
}

function getTissueCategoryFromAxisTerm(term) {
    const normalizedTerm = String(term || '').trim();
    const tpcCode = /^([A-Z0-9]+)\s+-/.exec(normalizedTerm)?.[1];

    if (tpcCode && tissueCategoryByTpcCode[tpcCode]) {
        return tissueCategoryByTpcCode[tpcCode];
    }

    if (/blood|buccal/i.test(normalizedTerm)) return 'Clinically accessible';
    if (/brain|skin/i.test(normalizedTerm)) return 'Ectoderm';
    if (/testis|ovary/i.test(normalizedTerm)) return 'Germ cells';
    if (/aorta|heart|muscle|fibroblast|adrenal/i.test(normalizedTerm)) return 'Mesoderm';
    if (/colon|esophagus|liver|lung/i.test(normalizedTerm)) return 'Endoderm';

    return null;
}

function getVisibleTissueAxisTerms() {
    return cy.get('.bar-plot-chart .rotated-label[data-term]:visible', { timeout: 30000 }).then(($labels) => {
        return Array.from($labels)
            .map((labelNode) => (labelNode.getAttribute('data-term') || '').trim())
            .filter(Boolean);
    });
}

function waitForDonorFacetBarPlotReady() {
    return cy
        .get('#slow-load-container', { timeout: 30000 })
        .should('not.have.class', 'visible')
        .get('.facet-charts.loading', { timeout: 30000 })
        .should('not.exist')
        .get('.bar-plot-chart', { timeout: 30000 })
        .should('exist')
        .get('.bar-plot-chart .chart-bar[data-term]', { timeout: 30000 })
        .should('have.length.greaterThan', 0)
        .get('.bar-plot-chart .rotated-label[data-term]:visible', { timeout: 30000 })
        .should('have.length.greaterThan', 0);
}

function stepTissueTypeFilterTests(caps) {
    if (caps.expectedStatsSummaryOpts.totalFiles === 0) {
        visitBrowseByDonor(caps).toggleView('Donor').then(() => {
            cy.log('Skipping stepTissueTypeFilterTests since no data is accessible for this role.');
        });
        return;
    }

    visitBrowseByDonor(caps).toggleView('Donor').then(() => {
        waitForDonorFacetBarPlotReady();
        tissueTypeFilterOptions.forEach(({ buttonText, expectedCategory }) => {
            cy.contains('button', buttonText)
                .should('be.visible')
                .click({ force: true });

            waitForDonorFacetBarPlotReady();
            getVisibleTissueAxisTerms().then((axisTerms) => {
                expect(axisTerms.length, `${buttonText} should leave visible tissue axis labels`).to.be.greaterThan(0);

                if (!expectedCategory) {
                    return;
                }

                axisTerms.forEach((axisTerm) => {
                    expect(
                        getTissueCategoryFromAxisTerm(axisTerm),
                        `${buttonText} filter should only show ${expectedCategory} tissues`
                    ).to.equal(expectedCategory);
                });
            });
        });
    });
}

/** Chart Bar Plot Tests */
function stepFacetChartBarPlotTests(caps) {
    if (caps.expectedStatsSummaryOpts.totalFiles > 0) {
        visitBrowseByDonor(caps).toggleView('Donor').then(() => {
            waitForDonorFacetBarPlotReady();
            cy.get('#select-barplot-field-1')
                .should('contain', 'Sequencer')
                .end()
                .get('#select-barplot-field-0')
                .should('contain', 'Tissue')
                .end();

            getRenderedBarParts().then((renderedBarParts) => {
                expect(
                    renderedBarParts.length,
                    'Facet chart should render at least one tissue x sequencer bar with files'
                ).to.be.greaterThan(0);

                const sample = selectBarPartSample(renderedBarParts, 3);
                expect(
                    sample.length,
                    'Should be able to select a bar-part sample from the rendered chart'
                ).to.be.greaterThan(0);

                sample.forEach(({ tissueTerm, sequencer }) => {
                    cy.log(`Testing bar part: Tissue = ${tissueTerm}, Sequencer = ${sequencer}`);

                    cy.window().scrollTo(0, 0).end()
                        .then(() => getRenderedBarPart(tissueTerm, sequencer))
                        .then(($barPart) => {
                            assertTissueAxisLabel([tissueTerm], tissueTerm);
                            const expectedFilteredResults = parsePositiveIntegerCount(
                                $barPart.attr('data-count'),
                                `Current bar data-count for ${tissueTerm} x ${sequencer}`
                            );
                            const acceptedVariants = getTissueVariants([tissueTerm]);
                            cy.window().scrollTo('top').end()
                                .wrap($barPart).hoverIn().end()
                                .get('.cursor-component-root .details-title').should('contain', sequencer).end()
                                .get('.cursor-component-root .detail-crumbs .crumb').invoke('text').then((crumbText) => {
                                    const normalizedCrumbText = crumbText.replace(/\s+/g, ' ').trim();
                                    const matchesVariant = acceptedVariants.some((variant) => {
                                        return normalizedCrumbText.includes(variant);
                                    });
                                    expect(
                                        matchesVariant,
                                        `Popover tissue crumb should reference the clicked tissue (${tissueTerm}) for ${sequencer}`
                                    ).to.equal(true);
                                }).end()
                                .get('.cursor-component-root .details-title .primary-count').invoke('text').then((text) => {
                                    const number = parseInt(text, 10);
                                    expect(number).to.eq(expectedFilteredResults);
                                })
                                // file count – retry until text is numeric and equals expected
                                .get('.cursor-component-root .details a') // Adjust selector if needed
                                .should('contain.text', 'Files') // Ensure the correct link
                                .then(($a) => {
                                    const text = $a.text();      // e.g. "39 Files"
                                    const href = $a.attr('href');
                                    const fullUrl = href.startsWith('http')
                                        ? href
                                        : `${Cypress.config('baseUrl')}${href}`;

                                    // Extract number before "Files"
                                    const uiCount = parseIntSafe(text);

                                    // Reconcile API total with UI count, tolerating one round
                                    // of transient data churn before failing with diagnostics.
                                    return reconcileApiTotalWithUiCount(
                                        fullUrl,
                                        () => cy.get('.cursor-component-root .details a')
                                            .should('contain.text', 'Files')
                                            .invoke('text')
                                            .then(parseIntSafe),
                                        { context: `Bar-part Files link (${tissueTerm} x ${sequencer})` }
                                    );
                                });
                            // `{ force: true }` is used a bunch here to prevent Cypress from attempting to scroll browser up/down during the test -- which may interfere w. mouse hover events.
                            // See https://github.com/cypress-io/cypress/issues/2353#issuecomment-413347535
                            cy.window().then((w) => {
                                w.scrollTo(0, 0);
                            }).end()
                                .wrap($barPart, { force: true }).scrollToCenterElement().trigger('mouseover', { force: true }).trigger('mousemove', { force: true }).wait(300).click({ force: true }).end()
                                .get('.cursor-component-root .actions.buttons-container .btn-primary').should('contain', "Explore").click({ force: true }).end() // Browser will scroll after click itself (e.g. triggered by app)
                                .location('search')
                                .should('include', 'external_id=')
                                .get('#slow-load-container').should('not.have.class', 'visible')
                                .url()
                                .then((filteredResultsUrl) => reconcileApiTotalWithUiCount(
                                    filteredResultsUrl,
                                    () => cy.searchPageTotalResultCount(),
                                    { context: `Filtered search results for ${tissueTerm} x ${sequencer}` }
                                ))
                                .then(() => cy
                                    .get('.properties-controls button[data-tip="Clear all filters"]')
                                    .click({ force: true })
                                    .get(".facet[data-field=\"external_id\"] .facet-list-element.selected .facet-item")
                                    .should('not.exist')
                                    .then(() => assertCountsEventuallyEqual(
                                        () => cy.get("div.above-facets-table-row #results-count").invoke("text").then((t) => parseInt(t, 10)),
                                        () => cy.getQuickInfoBar().then((currentInfo) => currentInfo.donor),
                                        'Cleared-filters results count should reconcile with the current donor count from QuickInfoBar'
                                    ))
                                );
                        });
                });
            });
        });
    } else {
        visitBrowseByDonor(caps).toggleView('Donor').then(() => {
            cy.get('#facet-charts-container').invoke('text').should('be.empty');
            cy.log('Skipping stepFacetChartBarPlotTests since no data is accessible for this role.');
        });
    }
};

const chartTitles = [
    'Age Groups',
    'Hardy Scale',
    'Donor Sequencing Progress'
];

function stepCohortViewChartTests(caps) {

    // Check that info tooltip is working properly
    visitBrowseByDonor(caps).toggleView('Cohort').then(() => {
        chartTitles.forEach((title) => {
            cy.contains('.donor-cohort-view-chart h3', title)
              .then(($h3) => {

                const $icon = $h3.find('button.info-tooltip i.icon-info-circle')

                // Tooltip does not exist, do nothing
                if (!$icon.length) {
                    cy.log('No tooltip icon for this chart')
                    return
                }

                // Tooltip exists, hover and assert popover
                // Note: NoResultsModal will block interactions with chart
                if (!caps.expectedNoResultsModalVisible) {
                    cy.wrap($icon)
                        .first()
                        .trigger('mouseover')
                        .trigger('mouseenter')
    
                    cy.get('div[role="tooltip"]', { timeout: 1000 })
                        .should('exist')
                        .and('be.visible')
    
                    cy.wrap($icon)
                        .first()
                        .trigger('mouseout')
                        .trigger('mouseleave')
    
                    cy.get('div[role="tooltip"]', { timeout: 1000 })
                        .should('not.exist')
                }
            })
        });
    });

    if (caps.expectedStatsSummaryOpts.totalFiles > 0) {
        visitBrowseByDonor(caps).toggleView('Cohort').then(() => {
            cy.getQuickInfoBar().then((info) => {
                const totalDonors = info.donor;

                chartTitles.forEach((title) => {
                    if (title === 'Self-Reported Ethnicity') {
                        const expectedMax = min([10, totalDonors]);
                        cy.log(`Adjusting expected max for ${title} chart to: ${expectedMax}`);
                        checkChartTotal(title, expectedMax);
                    } else if (title === 'Donor Sequencing Progress') {
                        cy.get('.donor-cohort-view-chart.donor-sequencing-progress .dsp-center .dsp-count-current').then(($el) => {
                            const dspTotal = parseIntSafe($el.text());
                            expect(dspTotal).to.equal(info.donor);
                        });
                    } else {
                        checkChartTotal(title, totalDonors);
                    }
                });
            });
        });
    } else {
        visitBrowseByDonor(caps).toggleView('Cohort').then(() => {
            chartTitles.forEach((title) => {
                
                // Check for a chart title element
                cy.contains('.donor-cohort-view-chart h3', title)
                    .closest('.donor-cohort-view-chart')
                    .find('.no-data span.text-secondary')
                    .should('be.visible')
                    .and('contain.text', 'No data available');
                
            });
            cy.log('Skipping stepCohortViewChartTests since no data is accessible for this role.');
        });
    }
};

function stepSearchTableRowsTests(caps) {

    if (caps.expectedStatsSummaryOpts.totalDonors === 0) {
        visitBrowseByDonor(caps).then(() => {
            cy.searchPageTotalResultCount().then((totalCount) => {
                expect(totalCount).to.equal(0);
            });
            cy.log('Skipping stepSearchTableRowsTests since no data is accessible for this role.');
        });
        return;
    }

    const dataRowSelector = '.search-result-row:not(.fin)';

    // Parse "X Tissue(s)", "Y Assay(s)", "Z File(s)" etc.
    function parseCountFromLabel(text) {
        const match = text.replace(/\s+/g, ' ').match(/(\d+)/);
        expect(match, `Could not parse numeric count from label: "${text}"`).to.not.be.null;
        return Number(match[1]);
    }

    // Optional column visibility based on caps
    function assertOptionalColumnVisibility(fieldKey, expectedVisible) {
        const headerSelector = `.search-headers-column-block[data-field="${fieldKey}"]`;
        const cellSelector = `.search-result-column-block[data-field="${fieldKey}"]`;

        if (expectedVisible) {
            // Header must exist
            cy.get(headerSelector).should('exist');

            // At least one cell for this field must exist
            cy.get(cellSelector)
                .its('length')
                .should('be.gt', 0);
        } else {
            // Column should not be rendered at all
            cy.get(headerSelector).should('not.exist');
            cy.get(cellSelector).should('not.exist');
        }
    }

    // Pick N unique random indices between 0..maxIndex
    function getRandomIndices(maxIndex, count) {
        const all = Array.from({ length: maxIndex + 1 }, (_, i) => i);
        for (let i = all.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [all[i], all[j]] = [all[j], all[i]];
        }
        return all.slice(0, count);
    }

    // 1) Optional columns visibility (Cancer / Tobacco / Alcohol)
    assertOptionalColumnVisibility('medical_history.cancer_history', caps.expectedCancerHistoryVisible);
    assertOptionalColumnVisibility('medical_history.tobacco_use', caps.expectedExposureTobaccoVisible);
    assertOptionalColumnVisibility('medical_history.alcohol_use', caps.expectedExposureAlcoholVisible);

    // 2) Random 5 rows inside first 20 rows of the table
    cy.get(dataRowSelector)
        .should('have.length.gte', 5) // must have at least 5 rows loaded
        .then(($rows) => {
            const totalRows = $rows.length;
            const maxIndexToUse = Math.min(totalRows, 20) - 1; // only within first 20
            const randomIndices = getRandomIndices(maxIndexToUse, 5);

            cy.log(`Random selected row indices: ${randomIndices.join(', ')}`);

            randomIndices.forEach((rowIndex) => {
                const $rowEl = $rows.eq(rowIndex); // jQuery element for this row

                // We store these counts to later compare with the detail panel content.
                let tissuesCount;
                let assaysCount;

                // --- Tissues (read & store count from cell label) ---
                cy.wrap($rowEl)
                    .find('.search-result-column-block[data-field="tissues"] .icon-container')
                    .should('exist')
                    .invoke('text')
                    .then((text) => {
                        const count = parseCountFromLabel(text);
                        tissuesCount = count;
                        expect(count, `Row ${rowIndex}: Tissues count must be > 0`).to.be.greaterThan(0);
                    });

                // --- Assays (read & store count from cell label) ---
                cy.wrap($rowEl)
                    .find('.search-result-column-block[data-field="assays"] .icon-container')
                    .should('exist')
                    .invoke('text')
                    .then((text) => {
                        const count = parseCountFromLabel(text);
                        assaysCount = count;
                        expect(count, `Row ${rowIndex}: Assays count must be > 0`).to.be.greaterThan(0);
                    });

                // --- Files: UI vs API ---
                cy.wrap($rowEl)
                    .find('.search-result-column-block[data-field="files"] a')
                    .should('exist')
                    .then(($a) => {
                        const linkText = $a.text();
                        const href = $a.attr('href');
                        const uiCount = parseCountFromLabel(linkText);

                        expect(uiCount, `Row ${rowIndex}: Files count must be > 0`).to.be.greaterThan(0);
                        expect(href, `Row ${rowIndex}: Files href must exist`).to.be.a('string').and.not.be.empty;

                        return reconcileApiTotalWithUiCount(
                            href,
                            () => cy.get(dataRowSelector)
                                .eq(rowIndex)
                                .find('.search-result-column-block[data-field="files"] a')
                                .invoke('text')
                                .then(parseCountFromLabel),
                            { context: `Row ${rowIndex}: search-table Files link` }
                        );
                    });

                // --- Tissues detail: open panel and verify header + list count ---
                cy.wrap($rowEl)
                    .find('.search-result-column-block[data-field="tissues"] .toggle-detail-button')
                    .should('exist')
                    .click({ force: true });

                cy.wrap($rowEl)
                    .find('.result-table-detail-container')
                    .should('have.class', 'detail-open')
                    .within(() => {
                        // Header <b>14 </b> should match the tissuesCount we parsed from the cell
                        cy.get('.detail-header b')
                            .invoke('text')
                            .then((headerCountText) => {
                                const headerCount = Number(headerCountText.trim());
                                expect(
                                    headerCount,
                                    `Row ${rowIndex}: Tissues header count should match tissues cell count`
                                ).to.equal(tissuesCount);
                            });

                        // Sum of all <li> across all tissue categories must equal tissuesCount
                        cy.get('.detail-body .tissue-list-container ul li')
                            .its('length')
                            .should('eq', tissuesCount);
                    });

                // --- Assays detail: open panel and verify header + list count ---
                cy.wrap($rowEl)
                    .find('.search-result-column-block[data-field="assays"] .toggle-detail-button')
                    .should('exist')
                    .click({ force: true });

                cy.wrap($rowEl)
                    .find('.result-table-detail-container')
                    .should('have.class', 'detail-open')
                    .within(() => {
                        // Header <b>N </b> should match the assaysCount we parsed from the cell
                        cy.get('.detail-header b')
                            .invoke('text')
                            .then((headerCountText) => {
                                const headerCount = Number(headerCountText.trim());
                                expect(
                                    headerCount,
                                    `Row ${rowIndex}: Assays header count should match assays cell count`
                                ).to.equal(assaysCount);
                            });

                        // Only real assays have <ul><li> entries; N/A sections have spans.
                        // Total <li> count must equal assaysCount.
                        cy.get('.detail-body .tissue-list-container ul li')
                            .its('length')
                            .should('eq', assaysCount);
                    });
            });
        });
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    'UNAUTH',
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Browse by role — Donor', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → browse by donor capabilities`, () => {
            before(() => {
                goto('/');
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`From Home → Browse via menu (enabled: ${caps.runNavFromHome})`, () => {
                if (!caps.runNavFromHome) return;
                stepNavigateFromHomeToBrowse(caps);
            });

            it(`Direct /browse/ redirects to Production (enabled: ${caps.runDirectBrowseRedirect})`, () => {
                if (!caps.runDirectBrowseRedirect) return;
                stepDirectBrowseRedirect(caps);
            });

            it(`Modal appears when no results found (enabled: ${caps.runNoResultsModal})`, () => {
                if (!caps.runNoResultsModal) return;
                stepNoResultsModal(caps);
            });

            it(`QuickInfoBar has non-zero counts (enabled: ${caps.runQuickInfoBarCounts})`, () => {
                if (!caps.runQuickInfoBarCounts) return;
                stepQuickInfoBarCounts(caps);
            });

            it(`Sidebar toggle expand/collapse (enabled: ${caps.runSidebarToggle})`, () => {
                if (!caps.runSidebarToggle) return;
                stepSidebarToggle(caps);
            });

            it(`Facet chart bar plot tests → X-axis grouping and hover over & click Tissue x Sequencer pairs bar part + popover button --> matching filtered /browse/ results (enabled: ${caps.runFacetChartBarPlotTests})`, () => {
                if (!caps.runFacetChartBarPlotTests) return;
                stepFacetChartBarPlotTests(caps);
            });

            it(`Tissue type filter tests (enabled: ${caps.runTissueTypeFilterTests})`, () => {
                if (!caps.runTissueTypeFilterTests) return;
                stepTissueTypeFilterTests(caps);
            });

            it(`Cohort View Chart Tests (enabled: ${caps.runCohortViewChartTests})`, () => {
                if (!caps.runCohortViewChartTests) return;
                stepCohortViewChartTests(caps);
            });

            it(`Search Table Rows Tests (enabled: ${caps.runSearchTableRowsTests})`, () => {
                if (!caps.runSearchTableRowsTests) return;
                stepSearchTableRowsTests(caps);
            });
        });
    });
});
