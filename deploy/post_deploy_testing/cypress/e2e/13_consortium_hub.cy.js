import { cypressVisitHeaders, ROLE_TYPES } from "../support";

const ROLE_MATRIX = {
    UNAUTH: {
        label: "Unauthenticated",
        isAuthenticated: false,
        canAccessHub: false,
        canLoadDonorData: false,
    },
    [ROLE_TYPES.SMAHT_DBGAP]: {
        label: "SMAHT_DBGAP",
        isAuthenticated: true,
        canAccessHub: true,
        canLoadDonorData: true,
    },
    [ROLE_TYPES.SMAHT_NON_DBGAP]: {
        label: "SMAHT_NON_DBGAP",
        isAuthenticated: true,
        canAccessHub: true,
        canLoadDonorData: false,
    },
    [ROLE_TYPES.PUBLIC_DBGAP]: {
        label: "PUBLIC_DBGAP",
        isAuthenticated: true,
        canAccessHub: false,
        canLoadDonorData: false,
    },
    [ROLE_TYPES.PUBLIC_NON_DBGAP]: {
        label: "PUBLIC_NON_DBGAP",
        isAuthenticated: true,
        canAccessHub: false,
        canLoadDonorData: false,
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
    "Filtered Somatic Variant Callsets",
    "Germline Variant Callsets",
    "DSA (FASTA, BED, Chain)",
];

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
                expect($link.find(".parent-link").text().trim()).to.equal(
                    QUICK_LINK_TITLES[index]
                );
            });
        });
}

function assertAccordionBehavior(hasDonorData) {
    const toggleSelector =
        ".quick-links-container > .nav-group:nth-of-type(2) .toggle[role='button']";

    cy.get(toggleSelector)
        .should("contain", "Cancer & Tobacco Status - List View")
        .and("have.attr", "aria-expanded", "false");

    if (hasDonorData) {
        cy.get(toggleSelector)
            .scrollIntoView()
            .find("i.icon")
            .first()
            .click({ force: true });

        cy.get(toggleSelector).should("have.attr", "aria-expanded", "true");
        cy.get(".cohort-details-list").should("be.visible");
        cy.get(".cohort-details-list li").should("have.length.at.least", 1);

        cy.get(toggleSelector)
            .scrollIntoView()
            .find("i.icon")
            .first()
            .click({ force: true });
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

            it("shows the correct access state and hub content", () => {
                if (!caps.canAccessHub) {
                    assertForbiddenPage();
                    return;
                }

                assertHubShell();
                assertQuickLinks();
                assertAccordionBehavior(caps.canLoadDonorData);

                if (caps.canLoadDonorData) {
                    // The data query is role-sensitive; some authenticated roles can
                    // access the hub shell and the ProtectedDonor-backed cohort data.
                    assertLoadedDonorData();
                } else {
                    assertFailedToLoadDonorData();
                }
            });
        });
    });
});
