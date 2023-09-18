const { defineConfig } = require("cypress");

module.exports = defineConfig({
    defaultCommandTimeout : 60000,
    pageLoadTimeout : 120000,
    requestTimeout : 40000,
    responseTimeout : 120000,
    blockHosts: "www.google-analytics.com", // Don't want to confuse test-views/clicks with real ones
    e2e: {
        baseUrl: "https://data.smaht.org/",
        specPattern: "./cypress/e2e/*.cy.js",
        setupNodeEvents(on, config) {
            // implement node event listeners here
        }
    }
});
