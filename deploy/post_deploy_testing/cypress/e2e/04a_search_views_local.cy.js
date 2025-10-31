// cypress/e2e/deployment_ci_search_by_role.cy.js
import { cypressVisitHeaders, ROLE_TYPES, BROWSE_STATUS_PARAMS } from '../support';
import { dataNavBarItemSelectorStr } from "../support/selectorVars";

/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each scenario per role. Keep steps few and meaningful.

   Scenarios:
   - runItemSearchFlow:   General search page (type=Item) → filter to File, basic table config,
                          open a File detail & do essential checks (modal, tabs, status, notes icon)
   - runPageSearchFlow:   Pages listing redirect + has enough results
   - runFileSearchFlow:   Files redirect + expected columns exist
------------------------------------------------------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: 'Unauthenticated',
        isAuthenticated: false,

        runItemSearchFlow: true,
        runPageSearchFlow: true,
        runFileSearchFlow: true,

        expectedCanDownloadFile: false,
        expectedCanDownloadProtectedFile: false,
        expectedNotLoggedInAlert: true,
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: 'SMAHT_DBGAP',
        isAuthenticated: true,

        runItemSearchFlow: true,
        runPageSearchFlow: true,
        runFileSearchFlow: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: true,
        expectedNotLoggedInAlert: false,
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: 'SMAHT_NON_DBGAP',
        isAuthenticated: true,

        runItemSearchFlow: true,
        runPageSearchFlow: true,
        runFileSearchFlow: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: false,
        expectedNotLoggedInAlert: false,
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: 'PUBLIC_DBGAP',
        isAuthenticated: true,

        runItemSearchFlow: true,
        runPageSearchFlow: true,
        runFileSearchFlow: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: true,
        expectedNotLoggedInAlert: false,
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: 'PUBLIC_NON_DBGAP',
        isAuthenticated: true,

        runItemSearchFlow: true,
        runPageSearchFlow: true,
        runFileSearchFlow: true,

        expectedCanDownloadFile: true,
        expectedCanDownloadProtectedFile: false,
        expectedNotLoggedInAlert: false,
    },
};

/* ----------------------------- SESSION HELPERS ----------------------------- */
function goto(url = '/', headers = cypressVisitHeaders) {
    cy.visit(url, { headers });
}

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

function checkNotLoggedInAlert(caps) {
    // Wait until the main alert container is rendered (retry-safe)
    cy.get('#full-alerts-container').should('exist');

    // Verify the "Not Logged In" warning alert
    cy.get('#full-alerts-container .alerts .alert.alert-warning.show')
        .should('exist')       // Ensure alert exists in DOM
        .and('be.visible')     // Ensure it’s visible (handles fade/transition)
        .within(() => {
            // Check the alert heading text
            cy.contains('h4.alert-heading', 'Not Logged In').should('be.visible');

            // Verify the main message text
            cy.contains(
                '.mb-0',
                'You are currently browsing as guest, please'
            ).should('be.visible');

            // Verify the login link and its target
            cy.contains('a.link-underline-hover', 'login')
                .should('have.attr', 'href', '#loginbtn');
        });

    // Optionally test closing the alert
    cy.get('#full-alerts-container .alerts .alert.alert-warning.show')
        .within(() => {
            // Click the close (×) button
            cy.get('button.btn-close').click();
        });

    // Verify the alert is dismissed
    cy.get('#full-alerts-container .alerts .alert.alert-warning.show')
        .should('not.exist');
}
/* ----------------------------- STEP HELPERS ----------------------------- */

/**
 *  Search works, can narrow to ‘File’, columns can be configured,
 *  and a chosen file detail page behaves correctly (modal, tabs, status, notes icons).
 */
function stepItemSearchFlow(caps) {
    // 1) Land on /search/?type=Item and ensure there is plenty of data
    cy.visit('/search/', { headers: cypressVisitHeaders });
    cy.location('search').should('include', 'type=Item').end();
    cy.get('div.search-result-row.loading').should('not.exist').end();
    cy.get('.search-results-container .search-result-row')
        .its('length')
        .should('be.at.least', 10);
    cy.searchPageTotalResultCount().should('be.greaterThan', 50);

    // 2) Filter the "type" facet to File using the facet search box
    cy.get('.facets-column .facets-container .expandable-list .form-control[type="search"]')
        .type('File');
    cy.get('div.facet.open[data-field="type"] .facet-list-element[data-key]')
        .each(($el) => cy.wrap($el).should('contain.text', 'File'));
    cy.get('.facet-list-element[data-key]').should('not.contain.text', 'Item');
    cy.get('li[data-key="File"] a').click();
    cy.get('#page-title-container .page-title').should('contain', 'File');

    // 3) Columns panel: hide a column → verify removed; then show it back → verify re-appears
    cy.get('.above-results-table-row button[data-tip="Configure visible columns"]')
        .click({ force: true })
        .should('have.class', 'active');
    cy.get('.search-result-config-panel').should('have.class', 'show');

    // Unselect one visible column (take first active)
    cy.get('.search-result-config-panel .row .column-option .checkbox.clickable.is-active')
        .first()
        .as('activeCol')
        .scrollIntoView()
        .click()
        .should('not.have.class', 'is-active')
        .find('label input')
        .invoke('val')
        .then((field) => {
            cy.get(`.search-results-container .search-headers-row div[data-field="${field}"]`)
                .should('not.exist');

            // Re-select it
            cy.get(`.search-result-config-panel .row .checkbox.clickable:not(.is-active) input[value="${field}"]`)
                .click();
            cy.get(`.search-results-container .search-headers-row div[data-field="${field}"]`)
                .should('exist')
                .and('have.attr', 'data-field', field);
        });

    cy.get('.search-result-config-panel .close-button')
        .click({ force: true });
    cy.get('.search-result-config-panel').should('not.have.class', 'active');

    // 4) Navigate to a File detail and validate essential UI bits
    cy.visit(
        `/search/?type=File&donors.display_title%21=No+value&file_status_tracking.release_dates.initial_release%21=No+value&${BROWSE_STATUS_PARAMS}&sort=-file_status_tracking.release_dates.initial_release`,
        { headers: cypressVisitHeaders }
    );

    // Open random file detail
    cy.get('.results-column .result-table-row div.search-result-column-block[data-field="annotated_filename"] .value a')
        .first()
        .scrollIntoView()
        .then(($a) => {
            const expectedTitle = $a.text().trim();
            cy.wrap($a).invoke('removeAttr', 'target').click({ force: true });
            cy.get('.view-title h1.view-title-text')
                .invoke('text')
                .then((title) => {
                    expect(title.trim()).to.eq(expectedTitle);
                });
        });

    if (caps.isAuthenticated === false && caps.expectedNotLoggedInAlert === true) {
        // Verify the "Not Logged In" alert
        checkNotLoggedInAlert(caps);
    }   

    // Remember file size to compare in batch download modal
    let fileSize;
    cy.get('.datum').each(($el) => {
        if ($el.find('.datum-title').text().trim() === 'Size') {
            fileSize = $el.find('.datum-value').text().trim();

            if (fileSize === 'N/A') {
                fileSize = '0 Bytes';
            }
        }
    });

    cy.get('.datum-value .file-status')
        .then(($el) => {
            const textNode = [...$el[0].childNodes]
                .find((node) => node.nodeType === Node.TEXT_NODE)
                ?.textContent.trim();
            cy.wrap(textNode).as('status');
        });

    if (caps.expectedCanDownloadFile === true) {
        cy.get('@status').then((status) => {
            if (status.toLowerCase().includes('protected') && !caps.expectedCanDownloadProtectedFile) {
                cy.get(dataNavBarItemSelectorStr)
                    .should("have.class", "dropdown-toggle")
                    .then(($el) => {
                        // very hacky - workaround to verify the page is loaded completely by checking navigation bar arrow icon
                        const win = $el[0].ownerDocument.defaultView;
                        const after = win.getComputedStyle($el[0], '::after');
                        // Assert the pseudo-element exists (content is not 'none')
                        expect(after.content).to.not.equal('none');

                        // Protected file download not expected to be allowed
                        cy.get('.download-button.btn.btn-primary[disabled]').then(($disabledButton) => {
                            cy.wrap($disabledButton)
                                .trigger('mouseover', { force: true }); // Trigger a hover event
                            cy.get('.popover.download-popover').should('be.visible');
                            cy.wrap($disabledButton).trigger('mouseout', { force: true });
                            cy.get('.popover.download-popover').should('not.exist');
                        });
                    });           
            } else {
                // Open batch download modal and verify selected size equals the file size
                cy.get('#download_tsv_multiselect').should('not.be.disabled').click({ force: true });
                cy.get('div.modal.batch-files-download-modal').should('have.class', 'show');
                cy.get('.tsv-metadata-stat .icon-circle-notch').should('not.exist');
                cy.get('.tsv-metadata-stat-title').each(($title) => {
                    if ($title.text().trim() === 'Selected Files Size') {
                        cy.wrap($title)
                            .next('.tsv-metadata-stat')
                            .invoke('text')
                            .then((selectedSize) => {
                                expect(selectedSize.trim()).to.equal(fileSize);
                            });
                    }
                });
                cy.get('.modal-header > .btn-close').click();
                cy.get('div.modal.batch-files-download-modal').should('not.exist');
            }
        });
    } else if (caps.expectedCanDownloadFile === false) {
        // Handle the case where the download button is disabled
        cy.get('.download-button.btn.btn-primary[disabled]').then(($downloadButton) => {
            const selectedFileText = $downloadButton.text();
            expect(selectedFileText).to.equal('Download File');

            cy.wrap($downloadButton).trigger('mouseover', { force: true }); // Trigger a hover event
            cy.get('.popover.download-popover').should('exist').and('be.visible');
            cy.wrap($downloadButton).trigger('mouseout', { force: true });
            cy.get('.popover.download-popover').should('not.exist');
        });
    }

    // Tabs can be switched and become active
    cy.get('.tabs-bar-outer > .tabs-bar > a.tab-item[data-tab-for="details"]')
        .click({ force: true })
        .should('have.class', 'active');
    cy.get('.tabs-bar-outer > .tabs-bar > a.tab-item[data-tab-for="file-overview"]')
        .click({ force: true })
        .should('have.class', 'active');

    // Status indicator consistency (dot vs group)
    cy.get('.status-indicator-dot')
        .invoke('data', 'status')
        .then((indicatorStatus) => {
            cy.get('.status-group i.status-indicator-dot')
                .invoke('data', 'status')
                .then((groupStatus) => {
                    expect(indicatorStatus).to.equal(groupStatus);
                });
        });

    // If the warning icon exists in the tab header AND we have results, it should also be present in content;
    // and the “TSV notes” popovers should open/close on click.
    cy.get('.benchmarking-layout .icon-circle-notch').should('not.exist');
    cy.get('.search-results-container .icon-circle-notch').should('not.exist');
    cy.document().then((doc) => {
        const iconExists =
            doc.querySelectorAll('.tab-router .dot-tab-nav-list i.icon-exclamation-triangle').length > 0;
        const rc = doc.querySelector('#results-count');
        const hasData = rc && parseInt(rc.textContent) > 0;

        if (iconExists && hasData) {
            cy.get('div.tab-router-contents > div.content i.icon-exclamation-triangle')
                .should('exist')
                .scrollIntoView();

            cy.get('.search-result-column-block[data-field="tsv_notes"] .btn.btn-link')
                .each(($btn) => {
                    cy.wrap($btn).click({ force: true });
                    cy.get('.popover.show').should('exist');
                    cy.wrap($btn).click({ force: true });
                    cy.get('.popover.show').should('not.exist');
                });
        } else {
            cy.log('No warning icon in tab navigation (or no data).');
        }
    });
}

/**
 *  Going to /pages sends me to the Page search, and there are plenty of results.
 */
function stepPageSearchFlow(caps) {
    cy.visit('/pages', { headers: cypressVisitHeaders }); // should redirect to ?type=Page
    cy.location('search').should('include', 'type=Page').end();
    cy.location('pathname').should('include', '/search/');
    cy.get('.search-results-container .search-result-row')
        .its('length')
        .should('be.greaterThan', 10);
}

/**
 *  “/files/ redirects to File search, and key columns are visible.
 */
function stepFileSearchFlow(caps) {
    cy.visit('/files/', { headers: cypressVisitHeaders });
    cy.location('search').should('include', 'type=File').end();
    cy.location('pathname').should('include', '/search/');

    cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="data_type"]')
        .contains('Data Type');
    cy.get('.headers-columns-overflow-container .columns .search-headers-column-block[data-field="file_format.display_title"]')
        .contains('Format');
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    'UNAUTH',
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe('Search View by role', () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → search flows`, () => {
            before(() => {
                goto('/');
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`General search works end-to-end (filter to File, open detail, basic UI checks) (enabled: ${caps.runItemSearchFlow})`, () => {
                if (!caps.runItemSearchFlow) return;
                stepItemSearchFlow(caps);
            });

            it(`Pages listing redirects and shows enough results (enabled: ${caps.runPageSearchFlow})`, () => {
                if (!caps.runPageSearchFlow) return;
                stepPageSearchFlow(caps);
            });

            it(`Files listing redirects and shows key columns (enabled: ${caps.runFileSearchFlow})`, () => {
                if (!caps.runFileSearchFlow) return;
                stepFileSearchFlow(caps);
            });
        });
    });
});
