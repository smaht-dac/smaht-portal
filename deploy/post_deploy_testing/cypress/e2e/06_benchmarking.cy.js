// cypress/e2e/benchmarking_by_role.cy.js
import { ca } from "date-fns/locale";
import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { dataNavBarItemSelectorStr } from "../support/selectorVars";
import { gotoUrl } from "../support/utils/basicUtils";


/* ----------------------------- ROLE MATRIX -----------------------------
   Toggle each step per role.
   Legend of step toggles:
   - runNavAndRedirection:       top menu → benchmarking pages → tab checks
   - runSidebarToggle:           collapse/expand left sliding sidebar
   - runFileSelectionSuite:      checkbox select/deselect + download modal + per-tab command checks
   - runFacetSuite:              include/exclude facets flow and counts
   - runEmbeddedSearchSuite:     collapse all facets + edge scroll buttons
------------------------------------------------------------------------- */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,

        runNavAndRedirection: true,    // can follow menu links (public pages)
        runSidebarToggle: true,        // UI-only toggle
        runFileSelectionSuite: true,   // usually requires auth (checkbox/download)
        runFacetSuite: true,           // if search/filters require auth, keep false
        runEmbeddedSearchSuite: true,  // keep off if page requires auth

        expectedDownloadButtonStatus: "disabled", // "enabled" || "disabled"
    },

    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,

        runNavAndRedirection: true,
        runSidebarToggle: true,
        runFileSelectionSuite: true,
        runFacetSuite: true,
        runEmbeddedSearchSuite: true,

        expectedDownloadButtonStatus: "enabled",
    },

    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,

        runNavAndRedirection: true,
        runSidebarToggle: true,
        runFileSelectionSuite: true,
        runFacetSuite: true,
        runEmbeddedSearchSuite: true,

        expectedDownloadButtonStatus: "enabled",
    },

    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        runNavAndRedirection: true,
        runSidebarToggle: true,
        runFileSelectionSuite: true,
        runFacetSuite: true,
        runEmbeddedSearchSuite: true,

        expectedDownloadButtonStatus: "enabled",
    },

    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        runNavAndRedirection: true,
        runSidebarToggle: true,
        runFileSelectionSuite: false,
        runFacetSuite: true,
        runEmbeddedSearchSuite: true,

        expectedDownloadButtonStatus: "enabled",
    },
};

/* ----------------------------- UTILITIES ----------------------------- */

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

// Escape numeric-leading IDs for a[href="#123"] type targets
const escapeElementWithNumericId = (selector) =>
    /^#\d/.test(selector) ? `[id="${selector.substring(1)}"]` : selector;

// Verify command tabs content in download modal
function verifyTabContent(tabKey, expectedText) {
    cy.get(
        `div.code-snippet-container > ul.nav-pills > li.nav-item > button.nav-link[data-rr-ui-event-key="${tabKey}"]`
    )
        .click()
        .should("have.class", "active");

    cy.get(
        ".code-snippet-container > div.tab-content > div.tab-pane.active.show > div.curl-command-wrapper > pre"
    )
        .invoke("text")
        .then((text) => {
            expect(text).to.include(expectedText);
        });
}

/* ----------------------------- STEP HELPERS ----------------------------- */
/** 1) Navigation + page redirection + tab checks */
function stepNavAndRedirection(caps, roleKey) {
    cy.get(dataNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .get('.big-dropdown-menu-background', { timeout: 10000 })
        .should('have.class', 'big-dropdown-menu-transition-enter-done')
        .and('have.css', 'opacity', '1')
        .then(() => {
            cy.get(
                ".big-dropdown-menu .no-level-2-children .custom-static-links > div.col-12:nth-child(2) a.primary-big-link"
            )
                .should("be.visible")
                .then(($listItems) => {
                    expect($listItems).to.have.length(3);

                    const items = Array.from($listItems);

                    // Filter out disabled items, javascript: hrefs, and anything that mentions "Somatic Variant(s)"
                    const filteredListItems = items.filter((a) => {
                        // Prefer innerText for rendered text; fallback to textContent
                        const text = (a.innerText || a.textContent || "").toLowerCase();

                        // Robust disabled checks
                        const isDisabled = a.hasAttribute("data-disabled") && a.getAttribute("data-disabled") === "true";

                        // Exclude javascript: or empty hrefs
                        const rawHref = a.getAttribute("href") || "";
                        const isBadHref = !rawHref || rawHref.startsWith("javascript:");

                        // Match "somatic variant", "somatic variants", and allow trailing words like "sets"
                        const isSomaticVariant = /somatic\s+variants?\b/i.test(text);

                        return !isDisabled && !isBadHref && !isSomaticVariant;
                    });

                    expect(filteredListItems).to.have.length(2);

                    // Sonra href'leri çıkart
                    const allLinkElementHREFs = Cypress._.chain(filteredListItems)
                        .map((a) => new URL(a.href, window.location.origin).pathname)
                        .reverse()
                        .value();

                    // test Somatic Variants separately verify it is forbidden for now
                    cy.request({
                        url: "/data/analysis/colo829-snv-indel-detection",
                        failOnStatusCode: false,
                        headers: cypressVisitHeaders,
                    }).then((resp) => {
                        expect(resp.status).to.equal(roleKey !== ROLE_TYPES.SMAHT_DBGAP ? 403 : 200);
                    });

                    let prevTitle = "";
                    let count = 0;

                    function testVisit() {
                        cy.get("#page-title-container .page-title")
                            .should("not.have.text", prevTitle)
                            .then((t) => {
                                const titleText = t.text();
                                prevTitle = titleText;

                                cy.title()
                                    .should("equal", `${titleText} – SMaHT Data Portal`)
                                    .end();

                                if (titleText !== "COLO829 SNV/Indel Detection Challenge") {
                                    // Toggle the sticky info block collapsed/expanded
                                    cy.get(
                                        ".benchmarking-layout .information-container button.toggle-information-text-button"
                                    )
                                        .click({ force: true })
                                        .should("have.attr", "aria-expanded", "false")
                                        .get("#benchmarking-page-description-container")
                                        .should("have.class", "collapsed")
                                        .end()
                                        .get(
                                            ".benchmarking-layout .information-container button.toggle-information-text-button"
                                        )
                                        .click({ force: true })
                                        .should("have.attr", "aria-expanded", "true")
                                        .get("#benchmarking-page-description-container")
                                        .should("have.class", "expanded")
                                        .end();

                                    // Visit each tab, assert active, spinner gone, sidebar active link and results count match
                                    cy.location("pathname").then((currentPath) => {
                                        cy.get(
                                            "div.benchmarking-layout ul.nav-tabs li.nav-item button.nav-link"
                                        )
                                            .each(($button) => {
                                                const eventKey = $button.attr("data-rr-ui-event-key");
                                                const fullPath = `${currentPath}${eventKey}`;

                                                cy.wrap($button)
                                                    .click({ force: true })
                                                    .should("have.class", "active");

                                                cy.get(
                                                    ".tab-pane.active .search-results-outer-container"
                                                )
                                                    .should(
                                                        "have.attr",
                                                        "data-context-loading",
                                                        "false"
                                                    )
                                                    .end();

                                                cy.get(
                                                    ".sliding-sidebar-nav-container .accordion .sidenav-link.active a"
                                                ).should(($activeLink) => {
                                                    const hrefValue = $activeLink.attr("href");
                                                    expect(hrefValue).to.equal(fullPath);
                                                });

                                                cy.get(".tab-pane.active.show #results-count")
                                                    .invoke("text")
                                                    .should("not.equal", "0")
                                                    .then((originalFileText) => {
                                                        cy.wrap($button)
                                                            .find(".badge")
                                                            .invoke("text")
                                                            .should("not.equal", "-")
                                                            .then((badgeText) => {
                                                                expect(badgeText.trim()).to.equal(
                                                                    originalFileText.trim()
                                                                );
                                                            });
                                                    });
                                            })
                                            .then(() => {
                                                Cypress.log({
                                                    name: "Tab Navigation Completed",
                                                    message:
                                                        "All tabs navigated and verified successfully.",
                                                });
                                            });
                                    });
                                } else {
                                    // COLO829 challenge: different layout - currently not allowed to display this page
                                    cy.get(".search-results-container.fully-loaded")
                                        .should("be.visible")
                                        .end()
                                        .get(
                                            '.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]'
                                        )
                                        .should("have.length.greaterThan", 0);
                                }

                                count++;
                                if (count < filteredListItems.length) {
                                    cy.get(dataNavBarItemSelectorStr)
                                        .click()
                                        .should("have.class", "dropdown-open-for")
                                        .then(() => {
                                            cy.get(
                                                `div.big-dropdown-menu a[href="${escapeElementWithNumericId(
                                                    allLinkElementHREFs[count]
                                                )}"]`
                                            )
                                                .click({ force: true })
                                                .then(($nextListItem) => {
                                                    const linkHref = $nextListItem.attr("href");
                                                    cy.location("pathname").should("equal", linkHref);
                                                    testVisit();
                                                });
                                        });
                                }
                            });
                    }

                    // Start with the last item
                    cy.wrap(filteredListItems[filteredListItems.length - 1])
                        .scrollIntoView()
                        .should("be.visible")
                        .click({ force: true })
                        .then(($linkElem) => {
                            const linkHref = $linkElem.attr("href");
                            cy.location("pathname").should("equal", linkHref);
                            testVisit();
                        });
                });
        })
        .end();
}

/** 2) Left sliding sidebar toggle */
function stepSidebarToggle(caps) {
    cy.get(".sliding-sidebar-nav-container .toggle-button")
        .click({ force: true })
        .should("have.attr", "aria-expanded", "false")
        .get(".sliding-sidebar-ui-container")
        .should("have.class", "collapse-nav")
        .end()
        .get(".sliding-sidebar-nav-container .toggle-button")
        .click({ force: true })
        .should("have.attr", "aria-expanded", "true")
        .get(".sliding-sidebar-ui-container")
        .should("have.class", "show-nav")
        .end();
}

/** 3) File selection + download modal validations */
function stepFileSelectionSuite(caps) {
    let selectedCheckFileNumberCount = 0;
    let allResultTotalCount = 0;

    const checkFileCheckbox = ($checkBox) => {
        selectedCheckFileNumberCount += 1;
        return cy
            .wrap($checkBox)
            .scrollToCenterElement()
            .check({ force: true })
            .end();
    };

    const unCheckFileCheckbox = ($checkBox) => {
        selectedCheckFileNumberCount -= 1;
        if (selectedCheckFileNumberCount >= 0) {
            return cy
                .wrap($checkBox)
                .scrollToCenterElement()
                .uncheck({ force: true })
                .end();
        }
    };

    // Navigate directly to the benchmark page for stable state
    cy.visit("/data/benchmarking/COLO829", { headers: cypressVisitHeaders });

    // 3.1 Check all visible checkboxes
    cy.get("#page-title-container .page-title")
        .should("have.text", "COLO829")
        .end()
        .get(
            '.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]'
        )
        .should("have.length.greaterThan", 0)
        .each(($checkBox) => {
            checkFileCheckbox($checkBox).end();
        });

    if (caps.expectedDownloadButtonStatus === "enabled") {
        // 3.2 Selected badge should match selected count
        cy.get("#download_tsv_multiselect").then(($downloadButton) => {
            const selectedFileText = $downloadButton.text();
            const selectedFileCount = parseInt(selectedFileText.match(/\d+/)[0]);
            expect(selectedCheckFileNumberCount).to.equal(selectedFileCount);
        });

        // 3.3 Download modal — selected files metadata and code tabs
        cy.get("#download_tsv_multiselect").click({ force: true });
        cy.get(".tsv-metadata-stat-title")
            .contains("Selected Files")
            .siblings(".tsv-metadata-stat")
            .invoke("text")
            .then((text) => {
                expect(selectedCheckFileNumberCount).to.equal(parseInt(text));
            });

        verifyTabContent("curl", "curl");
        verifyTabContent("aws", "AWS_ACCESS_KEY_ID");

        cy.get(".modal-header > .btn-close").click({ force: true }).end();
    } else if (caps.expectedDownloadButtonStatus === "disabled") {
        // Handle the case where the download button is disabled
        cy.get('.download-button.btn.btn-primary[disabled]').then(($selectedIndexCount) => {
            const selectedFileText = $selectedIndexCount.text();
            const selectedFileCount = parseInt(selectedFileText.match(/\d+/)[0]);
            expect(selectedCheckFileNumberCount).to.equal(selectedFileCount);

            cy.wrap($selectedIndexCount)
                .trigger('mouseover', { force: true }); // Trigger a hover event
            cy.get('.popover.download-popover').should('be.visible');
            cy.wrap($selectedIndexCount).trigger('mouseout', { force: true });
            cy.get('.popover.download-popover').should('not.exist');
        });
    }

    // 3.4 Uncheck all
    cy.get(
        '.search-results-container .search-result-row .search-result-column-block input[type="checkbox"]'
    ).each(($checkBox) => {
        unCheckFileCheckbox($checkBox);
    });

    // 3.5 Select-all flow should match total results and then clear to 0
    cy.get("#results-count").then(($origTotalResults) => {
        const originalFileText = $origTotalResults.text();
        allResultTotalCount = parseInt(originalFileText.match(/\d+/)[0]);

        cy.get("#select-all-files-button").click({ force: true }).end();
        cy.get("#select-all-files-button i.icon-circle-notch").should("not.exist");

        cy.get("#download_tsv_multiselect, .download-button.btn.btn-primary[disabled]") //handle both enabled and disabled cases
            .invoke("text")
            .then((text) => {
                const selectedFile = parseInt(text.match(/\d+/)[0]);
                expect(allResultTotalCount).to.equal(selectedFile);
            });

        cy.get("#select-all-files-button").click({ force: true }).end();
        cy.get("#select-all-files-button i.icon-circle-notch").should("not.exist");

        cy.get("#download_tsv_multiselect, .download-button.btn.btn-primary[disabled]") //handle both enabled and disabled cases
            .invoke("text")
            .then((text) => {
                const selectedFile = parseInt(text.match(/\d+/)[0]);
                expect(selectedFile).to.equal(0);
            });
    });
}

/** 4) Facet include/exclude flow and counts (per original) */
function stepFacetSuite(caps) {
    cy.visit("/data/benchmarking/COLO829", { headers: cypressVisitHeaders });

    let externalDataCount, initialDataCount, includeDataCount;

    cy.get("#slow-load-container").should("not.have.class", "visible").end()
        .get(".benchmarking-layout .icon-circle-notch")
        .should("not.exist")
        .end()
        .get(".search-results-container .icon-circle-notch")
        .should("not.exist")
        .end();

    // Baseline results
    cy.get(".tab-pane.active.show #results-count")
        .invoke("text")
        .then((count) => {
            initialDataCount = parseInt(count);
            expect(initialDataCount).to.be.greaterThan(0);
        })
        .end();

    // Switch to "Excluded Properties"
    cy.get('.facets-header .facets-title')
        .should("have.text", "Included Properties")
        .scrollToCenterElement()
        .end()
        .get(".facets-header button")
        .first()
        .click({ force: true })
        .end()
        .get(".facets-header .facets-title")
        .should("have.text", "Excluded Properties")
        .end()
        .get(
            '.facet.closed[data-field="file_sets.libraries.assay.display_title"] > h5'
        )
        .scrollIntoView()
        .should("be.visible")
        .click()
        .end()
        .get(
            '.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element:not([data-is-grouping="true"]) a'
        )
        .first()
        .within(($term) => {
            cy.get("span.facet-count")
                .then((assayCount) => {
                    externalDataCount = parseInt(assayCount.text());
                    expect(externalDataCount).to.be.greaterThan(0);
                })
                .end();

            cy.wrap($term).scrollIntoView().should("be.visible").click({ force: true }).end();
        })
        .end();

    // Verify count after exclusion
    cy.get(".facets-container")
        .should("have.attr", "data-context-loading", "false")
        .end()
        .get(".tab-pane.active.show #results-count")
        .invoke("text")
        .then((next1) => {
            expect(parseInt(next1)).to.equal(initialDataCount - externalDataCount);
        });

    // Toggle back to Included
    cy.get(".facets-header button").first().click({ force: true }).end()
        .get(".facets-header .facets-title")
        .should("have.text", "Included Properties")
        .end();

    // Re-include the first term
    cy.get(
        '.facet[data-field="file_sets.libraries.assay.display_title"] .persistent .facet-list-element:not([data-is-grouping="true"]) a'
    )
        .first()
        .within(($term) => {
            cy.wrap($term).click({ force: true }).end();
        })
        .end();

    // Count should return to initial
    cy.get(".facets-container")
        .should("have.attr", "data-context-loading", "false")
        .end()
        .get(".tab-pane.active.show #results-count")
        .invoke("text")
        .then((next2) => {
            expect(initialDataCount).to.equal(parseInt(next2));
        })
        .end();

    // Exclude again and verify includeDataCount
    cy.get(
        '.facet[data-field="file_sets.libraries.assay.display_title"] .facet-list-element:not([data-is-grouping="true"]) a'
    )
        .first()
        .within(($term) => {
            cy.wrap($term).click({ force: true }).end();
        })
        .end();

    cy.get(".facets-container")
        .should("have.attr", "data-context-loading", "false")
        .end()
        .get(".tab-pane.active.show #results-count")
        .invoke("text")
        .then((next3) => {
            includeDataCount = parseInt(next3);
            expect(includeDataCount).to.equal(externalDataCount);
        })
        .end();

    // Clear filters → back to initial
    cy.get('.properties-controls button[data-tip="Clear all filters"]').click({ force: true }).end();
    cy.get(".facets-container")
        .should("have.attr", "data-context-loading", "false")
        .end()
        .get(".tab-pane.active.show #results-count")
        .invoke("text")
        .then((next4) => {
            expect(initialDataCount).to.equal(parseInt(next4));
        })
        .end();
}

/** 5) Embedded search container (collapse facets + edge scroll buttons) */
function stepEmbeddedSearchSuite(caps) {
    cy.get("#slow-load-container").should("not.have.class", "visible").end()
        .get(".benchmarking-layout .icon-circle-notch")
        .should("not.exist")
        .end()
        .get(".search-results-container .icon-circle-notch")
        .should("not.exist")
        .end()
        .get('.properties-controls button[data-tip="Collapse all facets below"]')
        .click({ force: true })
        .end()
        .get(".facets-column .facets-body .facet")
        .should("not.have.class", "open")
        .end();

    // Edge scroll buttons
    cy.get(
        "#content div.shadow-border-layer div.edge-scroll-button.right-edge:not(.faded-out)"
    )
        .scrollIntoView()
        .trigger("mousedown", { button: 0, force: true })
        .should("have.class", "faded-out")
        .trigger("mouseup", { force: true })
        .wait(1000)
        .end()
        .get(
            "#content div.shadow-border-layer div.edge-scroll-button.left-edge:not(.faded-out)"
        )
        .trigger("mousedown", { button: 0, force: true })
        .should("have.class", "faded-out")
        .trigger("mouseup", { force: true })
        .end();
}

/* ----------------------------- PARAMETERIZED SUITE ----------------------------- */

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("Benchmarking by role", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → capabilities`, () => {
            before(() => {
                gotoUrl("/");
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`nav → benchmarking pages → tab checks (enabled: ${caps.runNavAndRedirection})`, () => {
                if (!caps.runNavAndRedirection) return;
                stepNavAndRedirection(caps, roleKey);
            });

            it(`sidebar toggle (enabled: ${caps.runSidebarToggle})`, () => {
                if (!caps.runSidebarToggle) return;
                stepSidebarToggle(caps);
            });

            it(`file selection + download modal (enabled: ${caps.runFileSelectionSuite})`, () => {
                if (!caps.runFileSelectionSuite) return;
                stepFileSelectionSuite(caps);
            });

            it(`facet include/exclude flow (enabled: ${caps.runFacetSuite})`, () => {
                if (!caps.runFacetSuite) return;
                stepFacetSuite(caps);
            });

            it(`embedded search container (enabled: ${caps.runEmbeddedSearchSuite})`, () => {
                if (!caps.runEmbeddedSearchSuite) return;
                // Ensure we’re on a benchmarking page before running
                gotoUrl("/data/benchmarking/COLO829");
                stepEmbeddedSearchSuite(caps);
            });
        });
    });
});
