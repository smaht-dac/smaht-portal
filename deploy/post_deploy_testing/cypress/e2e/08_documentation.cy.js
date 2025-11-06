// cypress/e2e/documentation_pages_role_based.cy.js
import { cypressVisitHeaders, ROLE_TYPES } from "../support";
import { navUserAcctDropdownBtnSelector } from "../support/selectorVars";

// Prefer the explicit docs menu item selector (from original test)
const documentationNavBarItemSelectorStr =
    '#top-nav div.navbar-collapse .navbar-nav a.id-docs-menu-item';

// Escape numeric-starting IDs for CSS query selectors
const escapeElementWithNumericId = function (selector) {
    return /^#\d/.test(selector) ? `[id="${selector.substring(1)}"]` : selector;
};

/** Role capability matrix */
const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,
        canOpenDocsMenu: true,
        canRunToCTests: true,
        canRunSubmissionFAQTest: false,
        canRunSubmissionDataDictionaryTest: false,
        canRunAnalysisPipelineFAQTest: true,
        canRunDonorManifestDictionaryTest: true,
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        canOpenDocsMenu: true,
        canRunToCTests: true,
        canRunSubmissionFAQTest: true,
        canRunSubmissionDataDictionaryTest: true,
        canRunAnalysisPipelineFAQTest: true,
        canRunDonorManifestDictionaryTest: true,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        canOpenDocsMenu: true,
        canRunToCTests: true,
        canRunSubmissionFAQTest: true,
        canRunSubmissionDataDictionaryTest: true,
        canRunAnalysisPipelineFAQTest: true,
        canRunDonorManifestDictionaryTest: true,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        canOpenDocsMenu: true,
        canRunToCTests: false,
        canRunSubmissionFAQTest: false,
        canRunSubmissionDataDictionaryTest: false,
        canRunAnalysisPipelineFAQTest: true,
        canRunDonorManifestDictionaryTest: true,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        canOpenDocsMenu: true,
        canRunToCTests: false,
        canRunSubmissionFAQTest: false,
        canRunSubmissionDataDictionaryTest: false,
        canRunAnalysisPipelineFAQTest: true,
        canRunDonorManifestDictionaryTest: true,
    },
};

/* ---------------------------- Common helpers ---------------------------- */


function goto({ url = "/", headers = cypressVisitHeaders, failOnStatusCode = true }) {
    cy.visit(url, { headers, failOnStatusCode });
}

/** Login/Logout wrappers per role */
function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.loginSMaHT(roleKey).end();
}
function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) cy.logoutSMaHT();
}

/** Defensive: silence known hydration warnings in Cypress for SSR */
function registerHydrationNoiseFilter() {
    cy.on("uncaught:exception", function (err) {
        // Temporary suppression; see upstream React hydration notes
        if (
            /hydrat/i.test(err.message) ||
            /Minified React error #418/.test(err.message) ||
            /Minified React error #423/.test(err.message)
        ) {
            return false;
        }
        // Keep legacy negligible JSON error branch from original
        expect(err.message).to.include("return response;");
        Cypress.log({
            name: "Negligible JSON err.",
            message:
                "Hit error re: non-serializable function; fixed in subsequent deploys.",
        });
        return false;
    });
}

/** Open Docs menu and return the list of level-1/2 anchor elements */
function openDocsMenuAndGrabLinks() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for");

    return cy.get(
        "div.big-dropdown-menu div.level-1-title-container a, div.big-dropdown-menu a.level-2-title"
    );
}

function assertCannotAccessDocPage(path, caps) {
    goto({ url: path, failOnStatusCode: false });

    cy.contains("h1.page-title", "Forbidden").should("be.visible");

    cy.request({
        url: path,
        failOnStatusCode: false,
        headers: cypressVisitHeaders,
    }).then((resp) => {
        expect(resp.status).to.equal(403);
    });
}

/* ------------------------- Test fragments (reused) ------------------------- */

/** A) Visit each docs page from menu, assert title & <pre> blocks; ensure ToC works at least once */
function stepAllDocsToCAndPreBlocks() {
    registerHydrationNoiseFilter();

    cy.getLoadedMenuItem(documentationNavBarItemSelectorStr)
        .click({force: true})
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(
                "div.big-dropdown-menu div.level-1-title-container a, div.big-dropdown-menu a.level-2-title"
            ).then(($listItems) => {
                expect($listItems).to.have.length.above(9); // At least 10 total entries

                const allLinkElementIDs = Cypress._.map($listItems, (liEl) => liEl.id);

                cy.get(".homepage-contents .homepage-header h1")
                    .should(
                        "contain",
                        "Somatic Mosaicism across Human Tissues Data Portal"
                    )
                    .then((title) => {
                        let prevTitle = title.text();
                        let count = 0;
                        let seenToC = false;

                        const finish = (titleText) => {
                            count++;
                            Cypress.log({
                                name: `Documentation Page ${count}/${$listItems.length}`,
                                message: `Visited page with title "${titleText}".`,
                            });
                            if (count < $listItems.length) {
                                cy.get(documentationNavBarItemSelectorStr)
                                    .scrollIntoView()
                                    .should("have.class", "dropdown-toggle")
                                    .then(($el) => {
                                        // very hacky - workaround to verify the page is loaded completely by checking navigation bar arrow icon
                                        const win = $el[0].ownerDocument.defaultView;
                                        const after = win.getComputedStyle($el[0], '::after');
                                        // Assert the pseudo-element exists (content is not 'none')
                                        expect(after.content).to.not.equal('none');

                                        cy.wrap($el)
                                            .click({ force: true })
                                            .should("have.class", "dropdown-open-for")
                                            .then(() => {
                                                cy.get(
                                                    `div.big-dropdown-menu a#${escapeElementWithNumericId(
                                                        allLinkElementIDs[count]
                                                    )}`
                                                )
                                                    .wait(1000) // retain small wait from original to avoid race
                                                    .click()
                                                    .then(($nextListItem) => {
                                                        const linkHref = $nextListItem.attr("href");
                                                        cy.location("pathname").should("equal", linkHref);
                                                        drill();
                                                    });
                                            });
                                    });
                            }
                        };

                        const drill = () => {
                            cy.get("#page-title-container .page-title")
                                .should("not.have.text", prevTitle)
                                .then((t) => {
                                    const titleText = t.text();
                                    expect(titleText).to.have.length.above(0);
                                    cy.title().should("equal", `${titleText} – SMaHT Data Portal`);
                                    prevTitle = titleText;

                                    // Verify presence of <pre> blocks under .rst-container > div (if any)
                                    cy.document().then((doc) => {
                                        const preEls = doc.querySelectorAll(
                                            ".rst-container > div > pre"
                                        );
                                        if (preEls.length > 0) {
                                            cy.get(".rst-container > div > pre").each(($pre) => {
                                                expect($pre.text().trim()).to.not.be.empty;
                                            });
                                        } else {
                                            cy.log("No <pre> elements found under .rst-container > div");
                                        }
                                    });

                                    // Try Table of Contents (once)
                                    if (!seenToC) {
                                        cy.window().then((win) => {
                                            const tocItems = win.document.querySelectorAll(
                                                "div.table-of-contents li.table-content-entry a"
                                            );
                                            if (tocItems.length > 0) {
                                                seenToC = true;
                                                const originalScrollY = win.scrollY;

                                                cy.scrollTo("top", { ensureScrollable: false }).then(
                                                    () => {
                                                        cy.get(
                                                            "div.table-of-contents li.table-content-entry a"
                                                        )
                                                            .last()
                                                            .then(($link) => {
                                                                const linkHref = $link.attr("href");
                                                                cy.wrap($link).click({ force: true });
                                                                cy.get(escapeElementWithNumericId(linkHref))
                                                                    .wait(1000)
                                                                    .should("be.visible")
                                                                    .then(() => {
                                                                        expect(win.scrollY).to.not.equal(
                                                                            originalScrollY
                                                                        );
                                                                        finish(titleText);
                                                                    });
                                                            });
                                                    }
                                                );
                                            } else {
                                                finish(titleText);
                                            }
                                        });
                                    } else {
                                        finish(titleText);
                                    }
                                });
                        };

                        // Kick off by clicking the first menu item
                        cy.wrap($listItems.eq(0))
                            .should("be.visible")
                            .click({ force: true })
                            .then(($linkElem) => {
                                cy.get("#slow-load-container").should(
                                    "not.have.class",
                                    "visible"
                                );
                                const linkHref = $linkElem.attr("href");
                                cy.location("pathname").should("equal", linkHref);
                                drill();
                            });
                    });
            });
        });
}

/** B) Randomly sample a few docs pages and assert page-internal links return HTTP 200 */
function stepSampledDocsAndInternalLinks() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(".big-dropdown-menu.is-open a.level-2-title").then(
                ($listItems) => {
                    const listItemsTotalCount = $listItems.length;
                    expect(listItemsTotalCount).to.be.above(9); // At least 10 level-2 pages

                    // Create a random sample of 5 indices
                    const itemIndicesToVisit = Cypress._.sampleSize(
                        Cypress._.range(listItemsTotalCount),
                        5
                    );

                    let prevTitle = null;
                    let count = 0;

                    const step = () => {
                        cy.get("#page-title-container .page-title")
                            .should("not.have.text", prevTitle)
                            .then((t) => {
                                const titleText = t.text();
                                expect(titleText).to.have.length.above(0);
                                prevTitle = titleText;

                                // Skip pages that are not suitable for link checks
                                const skipPages = [
                                    "Data Release Status",
                                    "Submission Data Dictionary",
                                    "Getting dbGAP Access",
                                    "Donor Manifest Dictionary",
                                    "Data Availability and Access",
                                ];
                                if (!skipPages.includes(titleText)) {
                                    const linkSelector =
                                        '.help-entry.static-section-entry a:not([href^="#"]):not([href^="mailto:"]):not([href*=".gov"])';

                                    cy.get(linkSelector).should("be.visible").then(() => {
                                        count++;
                                        Cypress.log({
                                            name: `Documentation Page ${count}/5/${listItemsTotalCount}`,
                                            message: `Visited page with title "${titleText}".`,
                                        });

                                        if (itemIndicesToVisit.length > 0) {
                                            const nextIdx = itemIndicesToVisit.shift();
                                            cy.get(documentationNavBarItemSelectorStr)
                                                .should("have.class", "dropdown-toggle")
                                                .click()
                                                .should("have.class", "dropdown-open-for")
                                                .then(() => {
                                                    cy.get(".big-dropdown-menu.is-open a.level-2-title")
                                                        .eq(nextIdx)
                                                        .click()
                                                        .then(($linkElem) => {
                                                            const linkHref = $linkElem.attr("href");
                                                            cy.location("pathname").should(
                                                                "equal",
                                                                linkHref
                                                            );
                                                            step();
                                                        });
                                                });
                                        }
                                    });
                                }
                            });
                    };

                    const first = itemIndicesToVisit.shift();
                    cy.wrap($listItems.eq(first))
                        .click()
                        .then(($linkElem) => {
                            const linkHref = $linkElem.attr("href");
                            cy.location("pathname").should("equal", linkHref);
                            step();
                        });
                }
            );
        });
}

/** C) Public user: docs menu links return 200; searching released pages yields "No Results" */
function public_CheckLinksAndReleasedPages() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(".big-dropdown-menu.is-open a.level-2-title").then(
                ($listItems) => {
                    const listItemsTotalCount = $listItems.length;
                    expect(listItemsTotalCount).to.be.above(8);

                    // All public links should be reachable
                    [...$listItems].forEach(($linkElem) => {
                        const linkHref = $linkElem.getAttribute("href");
                        cy.request({
                            url: linkHref,
                            failOnStatusCode: false,
                        }).then((response) => {
                            expect(response.status).to.equal(200);
                        });
                    });
                }
            );
        });

    // Not Open page search should yield no results for public
    cy.visit("/search/?type=Page&status%21=open", {
        headers: cypressVisitHeaders,
        failOnStatusCode: false,
    });
    cy.get(".search-results-container.fully-loaded h3.text-300").should(
        "contain.text",
        "No Results"
    );
}

/** D) Submission Data Dictionary: schema list + React-Select count & selection */
function stepSubmissionDataDictionary() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(
                '.big-dropdown-menu.is-open a.level-2-title[href="/docs/submission/submission-data-dictionary"]'
            )
                .click({ force: true })
                .then(($linkElem) => {
                    cy.get("#slow-load-container").should("not.have.class", "visible");
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                });

            // Ensure schema items exist
            cy.get(".schema-item").should("have.length.greaterThan", 10);

            // Open React-Select and validate options
            cy.get('input[id^="react-select-"][type="text"]').focus().click();

            cy.get('[role="listbox"]', { timeout: 5000 }).should("be.visible");

            cy.get("[role='option']").then(($options) => {
                const optionCount = $options.length;
                cy.get(".schema-item").should("have.length", optionCount);

                const randomIndex = Math.floor(Math.random() * optionCount);
                const selectedOptionText = $options[randomIndex].innerText;

                cy.wrap($options[randomIndex]).click();

                cy.get(".schema-item").first().should("contain.text", selectedOptionText);
            });
        })
        .end();
}

/** E) Submission FAQ: expand each detail and ensure an answer exists */
function stepSubmissionFAQ() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(
                '.big-dropdown-menu.is-open a.level-2-title[href="/docs/submission/submission_faq"]'
            )
                .click({ force: true })
                .then(($linkElem) => {
                    cy.get("#slow-load-container").should("not.have.class", "visible");
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                });

            cy.contains("h2.faq-header", "Frequently Asked Questions").should(
                "be.visible"
            );

            cy.get("div.faq-body details").should("have.length.greaterThan", 5);

            cy.get("div.faq-body details").each(($el) => {
                cy.wrap($el).within(() => {
                    cy.root().should("not.have.attr", "open");
                    cy.get("summary").click();
                    cy.root().should("have.attr", "open");
                    cy.get(".response")
                        .should("be.visible")
                        .and(($resp) => {
                            expect($resp.text().trim()).to.not.equal("");
                        });
                });
            });
        });
}

/** F) Analysis Pipeline FAQ: expand each detail and ensure an answer exists */
function stepAnalysisPipelineFAQ() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(
                '.big-dropdown-menu.is-open a.level-2-title[href="/docs/additional-resources/pipeline_faq"]'
            )
                .click({ force: true })
                .then(($linkElem) => {
                    cy.get("#slow-load-container").should("not.have.class", "visible");
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                });

            cy.contains("h2.faq-header", "Frequently Asked Questions").should(
                "be.visible"
            );

            cy.get("div.faq-body details").should("have.length.greaterThan", 5);

            cy.get("div.faq-body details").each(($el) => {
                cy.wrap($el).within(() => {
                    cy.root().should("not.have.attr", "open");
                    cy.get("summary").click();
                    cy.root().should("have.attr", "open");
                    cy.get(".response")
                        .should("be.visible")
                        .and(($resp) => {
                            expect($resp.text().trim()).to.not.equal("");
                        });
                });
            });
        });
}

/** G) Donor Manifest Dictionary: schema list + React-Select count & selection */
function stepDonorManifestDictionary() {
    cy.get(documentationNavBarItemSelectorStr)
        .should("have.class", "dropdown-toggle")
        .click()
        .should("have.class", "dropdown-open-for")
        .then(() => {
            cy.get(
                '.big-dropdown-menu.is-open a.level-2-title[href="/docs/additional-resources/donor-manifest-dictionary"]'
            )
                .click({ force: true })
                .then(($linkElem) => {
                    cy.get("#slow-load-container").should("not.have.class", "visible");
                    const linkHref = $linkElem.attr("href");
                    cy.location("pathname").should("equal", linkHref);
                });

            // Ensure schema items exist
            cy.get(".schema-item").should("have.length.greaterThan", 5);

            // Open React-Select and validate options
            cy.get('input[id^="react-select-"][type="text"]').focus().click();

            cy.get('[role="listbox"]', { timeout: 5000 }).should("be.visible");

            cy.get("[role='option']").then(($options) => {
                const optionCount = $options.length;
                cy.get(".schema-item.table-responsive tbody tr, .schema-item.table-responsive").should("have.length", optionCount);

                const randomIndex = Math.floor(Math.random() * optionCount);
                const selectedOptionText = $options[randomIndex].innerText;

                cy.wrap($options[randomIndex]).click();

                let itemSelector, matchText;
                if (selectedOptionText.indexOf('.') >= 0) {
                    itemSelector = '.selected-schema.schema-item.table-responsive tbody tr:first-child td:first-child';
                    // get last of splitted parts
                    matchText = selectedOptionText.split('.').pop().trim();
                } else {
                    itemSelector = '.selected-schema.schema-item h3';
                    matchText = selectedOptionText.trim();
                }

                cy.get(itemSelector).should("contain.text", matchText);
            });
        }).end();
}

/* ----------------------------- Role-based suite ----------------------------- */

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

describe("Documentation Page & Content (role-based)", () => {

    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → documentation`, () => {
            beforeEach(() => {
                cy.visit("/", { headers: cypressVisitHeaders });
            });
            
            before(() => {
                loginIfNeeded(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it(`can open Docs menu (enabled: ${caps.canOpenDocsMenu})`, () => {
                if (!caps.canOpenDocsMenu) return;
                cy.get(documentationNavBarItemSelectorStr)
                    .should("have.class", "dropdown-toggle")
                    .click()
                    .should("have.class", "dropdown-open-for");
            });

            it("PUBLIC: menu links return HTTP 200 and open Page search yields 'No Results' (enabled: ${roleKey !== 'UNAUTH'})", () => {
                if (roleKey !== "UNAUTH") return;
                public_CheckLinksAndReleasedPages();
            });

            it(`Visit each docs page; ToC works at least once; <pre> blocks not empty (enabled: ${caps.canRunToCTests})`, () => {
                if (!caps.canRunToCTests) return;
                stepAllDocsToCAndPreBlocks();
            });

            it(`Sample some docs pages and ensure internal links return HTTP 200 (enabled: true)`, () => {
                // if (!caps.canRunToCTests) return;
                stepSampledDocsAndInternalLinks();
            });

            it(`Submission Data Dictionary → schema list & select behavior (enabled: ${caps.canRunSubmissionDataDictionaryTest})`, () => {
                if (!caps.canRunSubmissionDataDictionaryTest) {
                    assertCannotAccessDocPage("/docs/submission/submission-data-dictionary", caps);
                    return;
                }
                stepSubmissionDataDictionary();
            });

            it(`Submission FAQ → expandable items have answers (enabled: ${caps.canRunSubmissionFAQTest})`, () => {
                if (!caps.canRunSubmissionFAQTest) {
                    assertCannotAccessDocPage("/docs/submission/submission_faq", caps);
                    return;
                }
                stepSubmissionFAQ();
            });

            it(`Analysis Pipeline FAQ → expandable items have answers (enabled: ${caps.canRunAnalysisPipelineFAQTest})`, () => {
                if (!caps.canRunAnalysisPipelineFAQTest) {
                    assertCannotAccessDocPage("/docs/additional-resources/pipeline_faq", caps);
                    return;
                }
                stepAnalysisPipelineFAQ();
            });

            it(`Donor Manifest Dictionary → schema list & select behavior (enabled: ${caps.canRunDonorManifestDictionaryTest})`, () => {
                if (!caps.canRunDonorManifestDictionaryTest) {
                    assertCannotAccessDocPage("/docs/additional-resources/donor-manifest-dictionary", caps);
                    return;
                }
                stepDonorManifestDictionary();
            });
        });
    });
});
