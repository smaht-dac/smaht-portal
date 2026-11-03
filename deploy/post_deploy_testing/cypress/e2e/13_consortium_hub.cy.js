import { cypressVisitHeaders, ROLE_TYPES } from "../support";

const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,
        canAccessHub: false,
        canLoadDonorData: false,
        canLoadDonorCohort: false,
        canViewCohortDetails: false,
        canDownloadQuickLinkFiles: false,
        minimumQuickLinkResultCounts: {
            "Sequencing Data (BAMs & CRAMs)": 0,
            "Transcript Quantification Data (tsv, txt, gff)": 0,
            "Filtered Somatic SNV Callsets (vcf)": 0,
            "Germline Variant Callsets": 0,
            "DSA (FASTA, BED, Chain)": 0,
        },
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        canAccessHub: true,
        canLoadDonorData: true,
        canLoadDonorCohort: true,
        canViewCohortDetails: true,
        canDownloadQuickLinkFiles: true,
        minimumQuickLinkResultCounts: {
            "Sequencing Data (BAMs & CRAMs)": 3000,
            "Transcript Quantification Data (tsv, txt, gff)": 800,
            "Filtered Somatic SNV Callsets (vcf)": 600,
            "Germline Variant Callsets": 200,
            "DSA (FASTA, BED, Chain)": 40,
        },
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        canAccessHub: true,
        canLoadDonorData: false,
        canLoadDonorCohort: true,
        canViewCohortDetails: false,
        canDownloadQuickLinkFiles: true,
        minimumQuickLinkResultCounts: {
            "Sequencing Data (BAMs & CRAMs)": 0,
            "Transcript Quantification Data (tsv, txt, gff)": 0,
            "Filtered Somatic SNV Callsets (vcf)": 0,
            "Germline Variant Callsets": 0,
            "DSA (FASTA, BED, Chain)": 0,
        },
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        canAccessHub: false,
        canLoadDonorData: false,
        canLoadDonorCohort: false,
        canViewCohortDetails: false,
        canDownloadQuickLinkFiles: false,
        minimumQuickLinkResultCounts: {
            "Sequencing Data (BAMs & CRAMs)": 0,
            "Transcript Quantification Data (tsv, txt, gff)": 0,
            "Filtered Somatic SNV Callsets (vcf)": 0,
            "Germline Variant Callsets": 0,
            "DSA (FASTA, BED, Chain)": 0,
        },
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        canAccessHub: false,
        canLoadDonorData: false,
        canLoadDonorCohort: false,
        canViewCohortDetails: false,
        canDownloadQuickLinkFiles: false,
        minimumQuickLinkResultCounts: {
            "Sequencing Data (BAMs & CRAMs)": 0,
            "Transcript Quantification Data (tsv, txt, gff)": 0,
            "Filtered Somatic SNV Callsets (vcf)": 0,
            "Germline Variant Callsets": 0,
            "DSA (FASTA, BED, Chain)": 0,
        },
    },
};

const ROLES_TO_TEST = [
    "UNAUTH",
    ROLE_TYPES.SMAHT_DBGAP,
    ROLE_TYPES.SMAHT_NON_DBGAP,
    ROLE_TYPES.PUBLIC_DBGAP,
    ROLE_TYPES.PUBLIC_NON_DBGAP,
];

const QUICK_LINK_TITLES = [
    "Sequencing Data (BAMs & CRAMs)",
    "Transcript Quantification Data (tsv, txt, gff)",
    "Filtered Somatic SNV Callsets (vcf)",
    "Germline Variant Callsets",
    "DSA (FASTA, BED, Chain)",
];

// Direct file downloads rendered under a quick link, keyed by the quick link title
const QUICK_LINK_DOWNLOADS = {
    "Filtered Somatic SNV Callsets (vcf)": {
        title: "Filtered Somatic SNV Callset Metadata",
        files: [
            { title: "SNV V2 TSV", uuid: "2948738d-0d75-42ea-ad41-20018bcc38d5", tag: "P25 Paper" },
            { title: "SNV V1 TSV", uuid: "0eca12f0-737d-4b9a-bd71-b29872625a7f" },
        ],
    },
};

const SEQUENCING_DEFAULT_SEARCH_PARAMS = [
    "type=File",
    "donors.donor_groups=First 25 Donors [P25]",
    "file_format.display_title=cram",
    "file_format.display_title=bam",
    "sample_summary.studies=Production",
    "status=open",
    "status=open-early",
    "status=open-network",
    "status=protected",
    "status=protected-early",
    "status=protected-network",
];

const TRANSCRIPT_DEFAULT_SEARCH_PARAMS = [
    "type=File",
    "data_category=RNA Quantification",
    "donors.donor_groups=First 25 Donors [P25]",
    "sample_summary.studies=Production",
    "status=open",
    "status=open-early",
    "status=open-network",
    "status=protected",
    "status=protected-early",
    "status=protected-network",
];

const FILTERED_SOMATIC_DEFAULT_SEARCH_PARAMS = [
    "type=File",
    "analysis_details=Filtered",
    "data_category=Somatic Variant Calls",
    "donors.donor_groups=First 25 Donors [P25]",
    "release_tracker_description!=No value",
    "sample_summary.studies=Production",
    "status=open",
    "status=open-early",
    "status=open-network",
    "status=protected",
    "status=protected-early",
    "status=protected-network",
];

const GERMLINE_DEFAULT_SEARCH_PARAMS = [
    "type=File",
    "data_category=Germline Variant Calls",
    "donors.donor_groups=First 25 Donors [P25]",
    "release_tracker_description!=No value",
    "sample_summary.studies=Production",
    "status=open",
    "status=open-early",
    "status=open-network",
    "status=protected",
    "status=protected-early",
    "status=protected-network",
];

const DSA_DEFAULT_SEARCH_PARAMS = [
    "type=File",
    "data_type=DSA",
    "data_type=Chain File",
    "data_type=Sequence Interval",
    "donors.donor_groups=First 25 Donors [P25]",
    "sample_summary.studies=Production",
    "status=open",
    "status=open-early",
    "status=open-network",
    "status=protected",
    "status=protected-early",
    "status=protected-network",
];

function assertMinimumQuickLinkResultCount(caps, quickLinkTitle) {
    if (!caps.canLoadDonorData) {
        return;
    }

    const minCount = caps?.minimumQuickLinkResultCounts?.[quickLinkTitle];
    if (typeof minCount === "number") {
        cy.searchPageTotalResultCount().should("be.gt", minCount);
    }
}

function loginIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.loginSMaHT(roleKey).end();
    }
}

function logoutIfNeeded(roleKey) {
    const caps = ROLE_MATRIX[roleKey];
    if (caps.isAuthenticated) {
        cy.logoutSMaHT();
    }
}

function expectSearchToIncludeParams(search, expectedParams) {
    const searchParams = new URLSearchParams(search);

    expectedParams.forEach((param) => {
        const [rawKey, rawValue = ""] = param.split("=");
        const actualValues = searchParams.getAll(rawKey);
        expect(
            actualValues,
            `Expected search params for ${rawKey} to include ${rawValue}`
        ).to.include(rawValue);
    });
}

/** Defensive: silence known hydration warnings in Cypress for SSR */
function registerHydrationNoiseFilter() {
    cy.on("uncaught:exception", function (err) {
        if (
            /hydrat/i.test(err.message) ||
            /Minified React error #418/.test(err.message) ||
            /Minified React error #423/.test(err.message)
        ) {
            return false;
        }
        return undefined;
    });
}

function visitConsortiumHub(roleKey) {
    cy.visit("/", { headers: cypressVisitHeaders });
    loginIfNeeded(roleKey);
    cy.visit("/consortium-hub", {
        headers: cypressVisitHeaders,
        failOnStatusCode: false,
    });
}

function assertForbiddenPage() {
    cy.contains("h1.page-title", "Forbidden").should("be.visible");
    cy.request({
        url: "/consortium-hub",
        failOnStatusCode: false,
        headers: cypressVisitHeaders,
    }).then((resp) => {
        expect(resp.status).to.equal(403);
    });
}

function assertHubShell() {
    cy.location("pathname").should("eq", "/consortium-hub");
    cy.get("#page-title-container .page-title")
        .should("be.visible")
        .and("contain", "Consortium Hub");
    cy.title().should("contain", "Consortium Hub");

    cy.get(".consortium-hub-container h3")
        .should("be.visible")
        .and("contain", "P25 Data Freeze");
    cy.contains(
        ".consortium-hub-container > p",
        "Welcome to the consortium hub for the P25 Data Freeze"
    ).should("be.visible");
}

function assertQuickLinks() {
    cy.get(".quick-links-container > .nav-group")
        .first()
        .within(() => {
            cy.get("h6").should("contain", "Quick Links to the P25 Dataset");

            cy.get("> .dropdown").should("have.length", QUICK_LINK_TITLES.length);

            cy.get("> .dropdown > a.header").each(($link, index) => {
                expect($link.attr("href"), "quick link href").to.match(/^\/browse\/\?/);
                const linkTitle = $link
                    .find(".parent-link")
                    .clone()
                    .children(".quick-link-badge")
                    .remove()
                    .end()
                    .text()
                    .trim();

                expect(linkTitle).to.equal(QUICK_LINK_TITLES[index]);
            });
        });
}

function assertQuickLinkDownloads(caps) {
    const quickLinksSelector = ".quick-links-container > .nav-group:first-of-type";
    cy.get(`${quickLinksSelector} > .dropdown .quick-link-downloads`).should(
        "have.length",
        Object.keys(QUICK_LINK_DOWNLOADS).length
    );

    Object.entries(QUICK_LINK_DOWNLOADS).forEach(([quickLinkTitle, downloads]) => {
        cy.contains(`${quickLinksSelector} > .dropdown > a.header .parent-link`, quickLinkTitle)
            .closest(".dropdown")
            .find(".quick-link-downloads")
            .within(() => {
                cy.get(".quick-link-downloads-title").should("have.text", downloads.title);
                cy.get(".quick-link-downloads-files > *").should("have.length", downloads.files.length);

                downloads.files.forEach((file, index) => {
                    // Buttons stay disabled until the ResourceFile search returns
                    const fileSelector = caps.canDownloadQuickLinkFiles
                        ? "a.quick-link-download"
                        : ".quick-link-download-wrapper > button.quick-link-download[disabled]";
                    cy.get(".quick-link-downloads-files > *", { timeout: 30000 })
                        .eq(index)
                        .find(".quick-link-download-title")
                        .should("contain", file.title);

                    if (file.tag) {
                        cy.get(".quick-link-downloads-files > *")
                            .eq(index)
                            .find(".quick-link-download-tag")
                            .should("have.text", file.tag);
                    }

                    if (caps.canDownloadQuickLinkFiles) {
                        cy.get(".quick-link-downloads-files > *", { timeout: 30000 })
                            .eq(index)
                            .should("match", fileSelector)
                            .and("have.attr", "aria-label", `Download ${file.title}`)
                            .and("have.attr", "download")
                            .then(($a) => {
                                const href = $a.attr("href");
                                expect(href, `${file.title} href`).to.match(
                                    new RegExp(`^/resource-files/${file.uuid}/@@download/`)
                                );
                                // The download redirects to the file's storage location
                                cy.request({ url: href, followRedirect: false, failOnStatusCode: false })
                                    .its("status")
                                    .should("be.oneOf", [200, 301, 302, 303, 307]);
                            });
                    } else {
                        cy.get(".quick-link-downloads-files > *", { timeout: 30000 })
                            .eq(index)
                            .find(fileSelector)
                            .should("exist");
                        cy.get(".quick-link-downloads-files > *")
                            .eq(index)
                            .should("have.class", "quick-link-download-wrapper")
                            .trigger("mouseover");
                        cy.root()
                            .closest("body")
                            .find(".tooltip")
                            .should("contain", "You do not have access to download this file.");
                    }
                });
            });
    });
}

const QUICK_LINK_TESTS = [
    {
        title: "Sequencing Data (BAMs & CRAMs)",
        expectedSearchParams: SEQUENCING_DEFAULT_SEARCH_PARAMS,
        extraAssertions(caps) {
            cy.get('.facet[data-field="donors.donor_groups"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "First 25 Donors [P25]");

            cy.get('.facet[data-field="file_format.display_title"]')
                .find(".facet-list-element.selected .facet-item")
                .should("have.length", 2)
                .then(($items) => {
                    const selected = Array.from($items, (item) =>
                        Cypress.$(item).text().trim()
                    );
                    expect(selected).to.include("cram");
                    expect(selected).to.include("bam");
                });

            assertMinimumQuickLinkResultCount(caps, "Sequencing Data (BAMs & CRAMs)");
        },
    },
    {
        title: "Transcript Quantification Data (tsv, txt, gff)",
        expectedSearchParams: TRANSCRIPT_DEFAULT_SEARCH_PARAMS,
        extraAssertions(caps) {
            cy.get('.facet[data-field="donors.donor_groups"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "First 25 Donors [P25]");

            cy.get('.facet[data-field="data_category"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "RNA Quantification");

            assertMinimumQuickLinkResultCount(
                caps,
                "Transcript Quantification Data (tsv, txt, gff)"
            );
        },
    },
    {
        title: "Filtered Somatic SNV Callsets (vcf)",
        expectedSearchParams: FILTERED_SOMATIC_DEFAULT_SEARCH_PARAMS,
        extraAssertions(caps) {
            cy.get('.facet[data-field="donors.donor_groups"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "First 25 Donors [P25]");

            cy.get('.facet[data-field="data_category"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "Somatic Variant Calls");

            cy.get('.facet[data-field="analysis_details"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "Filtered Variant Calls");

            assertMinimumQuickLinkResultCount(
                caps,
                "Filtered Somatic SNV Callsets (vcf)"
            );
        },
    },
    {
        title: "Germline Variant Callsets",
        expectedSearchParams: GERMLINE_DEFAULT_SEARCH_PARAMS,
        extraAssertions(caps) {
            cy.get('.facet[data-field="donors.donor_groups"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "First 25 Donors [P25]");

            cy.get('.facet[data-field="data_category"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "Germline Variant Calls");

            assertMinimumQuickLinkResultCount(caps, "Germline Variant Callsets");
        },
    },
    {
        title: "DSA (FASTA, BED, Chain)",
        expectedSearchParams: DSA_DEFAULT_SEARCH_PARAMS,
        extraAssertions(caps) {
            cy.get('.facet[data-field="donors.donor_groups"]')
                .find(".facet-list-element.selected .facet-item")
                .should("contain", "First 25 Donors [P25]");

            cy.get('.facet[data-field="data_type"]')
                .find(".facet-list-element.selected .facet-item")
                .should("have.length", 3)
                .then(($items) => {
                    const selected = Array.from($items, (item) =>
                        Cypress.$(item).text().trim()
                    );
                    expect(selected).to.include("DSA");
                    expect(selected).to.include("Sequence Interval");
                    expect(selected).to.include("Chain File");
                });

            assertMinimumQuickLinkResultCount(caps, "DSA (FASTA, BED, Chain)");
        },
    },
];

function clickQuickLinkAndAssertDefaults(index, quickLinkTest, caps) {
    cy.get(".quick-links-container > .nav-group")
        .first()
        .find("> .dropdown > a.header")
        .eq(index)
        .should("contain", quickLinkTest.title)
        .then(($link) => {
            const href = $link.attr("href");
            expect(href, `${quickLinkTest.title} href`).to.match(/^\/browse\/\?/);

            cy.wrap($link).click({ force: true });

            cy.location("pathname").should("eq", "/browse/");
            cy.location("search").should((search) => {
                expectSearchToIncludeParams(search, quickLinkTest.expectedSearchParams);
                if (href) {
                    const expectedSearch = new URL(
                        href,
                        Cypress.config("baseUrl") || "http://localhost:8000"
                    ).search;
                    expect(search).to.equal(expectedSearch);
                }
            });
            cy.get("#slow-load-container").should("not.have.class", "visible");
            cy.get("#page-title-container .page-title")
                .should("contain", "SMaHT Production Data");

            if (typeof quickLinkTest.extraAssertions === "function") {
                quickLinkTest.extraAssertions(caps);
            }
        });
}

function assertAccordionBehavior(hasDonorCohort, canViewCohortDetails) {
    const toggleSelector =
        ".quick-links-container > .nav-group:nth-of-type(2) .toggle[role='button']";
    const accessMessage = "You need dbGaP access to protected donor metadata to view.";

    cy.get(toggleSelector)
        .should("contain", "Cancer & Tobacco Status - List View")
        .and("have.attr", "aria-expanded", "false");

    if (hasDonorCohort) {
        cy.get(".cohort-thumbnails-container .donor-group-container").should(
            "have.length",
            4
        );

        cy.get(toggleSelector)
            .scrollIntoView()
            .should("be.visible")
            .click();

        cy.get(toggleSelector).should("have.attr", "aria-expanded", "true");
        cy.get(".quick-links-container > .nav-group:nth-of-type(2)").then(($cohortDetails) => {
            const hasDetailsList = $cohortDetails.find(".cohort-details-list").length > 0;

            if (!canViewCohortDetails) {
                cy.wrap($cohortDetails).should("contain.text", accessMessage);
                return;
            }

            expect(hasDetailsList, "cohort details list should be rendered").to.equal(true);

            cy.get(".cohort-details-list").should("be.visible");
            cy.get(".cohort-details-list li").should("have.length", 25);

            cy.get(".cohort-thumbnails-container .donor-thumbnail-container .donor-id")
                .then(($thumbnailIds) =>
                    [...$thumbnailIds].map((el) => Cypress.$(el).text().trim())
                )
                .then((thumbnailDonorIds) => {
                    cy.get(".cohort-details-list li .donor-id a")
                        .then(($accordionIds) =>
                            [...$accordionIds].map((el) =>
                                Cypress.$(el)
                                    .text()
                                    .trim()
                                    .replace(/:$/, "")
                            )
                        )
                        .then((accordionDonorIds) => {
                            expect(
                                thumbnailDonorIds.sort(),
                                "donor IDs shown in thumbnails"
                            ).to.deep.equal(accordionDonorIds.sort());
                        });
                });

            cy.get(".cohort-details-list li").then(($items) => {
                const statusCounts = {
                    cancer: 0,
                    tobacco: 0,
                    both: 0,
                };

                [...$items].forEach((item) => {
                    const $item = Cypress.$(item);
                    const sexText = $item.find(".sex [aria-hidden='true']").text().trim();
                    expect(["M", "F"], "donor sex marker").to.include(sexText);

                    const statusText = $item.text();
                    const hasCancer = /Cancer/i.test(statusText);
                    const hasTobacco = /Tobacco/i.test(statusText);

                    if (hasCancer) {
                        statusCounts.cancer += 1;
                    }
                    if (hasTobacco) {
                        statusCounts.tobacco += 1;
                    }
                    if (hasCancer && hasTobacco) {
                        statusCounts.both += 1;
                    }
                });

                expect(statusCounts.cancer, "donors with Cancer").to.be.at.least(3);
                expect(statusCounts.tobacco, "donors with Tobacco").to.be.at.least(3);
                expect(statusCounts.both, "donors with both Cancer and Tobacco").to.be.at.least(3);
            });
        });

        cy.get(toggleSelector)
            .scrollIntoView()
            .should("be.visible")
            .click();
        cy.get(toggleSelector).should("have.attr", "aria-expanded", "false");
    } else {
        cy.contains(".cohort-thumbnails-container", "Failed to load donor data.")
            .should("be.visible");
        cy.get(".quick-links-container > .nav-group:nth-of-type(2)")
            .should("contain.text", "Failed to load donor data.");
    }
}

function assertLoadedDonorData() {
    cy.get(".cohort-thumbnails-container .donor-groups").should("be.visible");
    cy.get(".cohort-thumbnails-container .donor-group-container").should(
        "have.length",
        4
    );
    cy.contains(".donor-group-header", "Ages 31-55").should("be.visible");
    cy.get(".cohort-thumbnails-container .donor-thumbnail-container").should(
        "have.length.at.least",
        1
    );
}

function assertFailedToLoadDonorData() {
    cy.contains(".cohort-thumbnails-container", "Failed to load donor data.")
        .should("be.visible");
}

describe("Consortium Hub by role", () => {
    ROLES_TO_TEST.forEach((roleKey) => {
        const caps = ROLE_MATRIX[roleKey];
        const label = caps.label || String(roleKey);

        context(`${label} → consortium hub`, () => {
            beforeEach(() => {
                registerHydrationNoiseFilter();
                visitConsortiumHub(roleKey);
            });

            after(() => {
                logoutIfNeeded(roleKey);
            });

            it("shows the correct access state and quick-link browse defaults", () => {
                if (!caps.canAccessHub) {
                    assertForbiddenPage();
                    return;
                }

                assertHubShell();
                assertQuickLinks();
                assertQuickLinkDownloads(caps);

                if (caps.canLoadDonorCohort) {
                    // The data query is role-sensitive; some authenticated roles can
                    // access the hub shell and the donor cohort thumbnails.
                    assertLoadedDonorData();
                } else {
                    assertFailedToLoadDonorData();
                }

                assertAccordionBehavior(
                    caps.canLoadDonorCohort,
                    caps.canViewCohortDetails
                );

                QUICK_LINK_TESTS.forEach((quickLinkTest, index) => {
                    if (index > 0) {
                        visitConsortiumHub(roleKey);
                        assertHubShell();
                        assertQuickLinks();
                    }

                    clickQuickLinkAndAssertDefaults(index, quickLinkTest, caps);
                });
            });
        });
    });
});
