const { defineConfig } = require('cypress');

module.exports = defineConfig({
    projectId: '5p1xo7',
    defaultCommandTimeout: 60000,
    pageLoadTimeout: 120000,
    requestTimeout: 40000,
    responseTimeout: 120000,
    blockHosts: 'www.google-analytics.com',
    video: false,
    chromeWebSecurity: false,
    e2e: {
        // We've imported your old cypress plugins here.
        // You may want to clean this up later by importing these.
        setupNodeEvents(on, config) {
            return require('./cypress/plugins/index.js')(on, config);
        },
        baseUrl: 'https://data.smaht.org',
        specPattern: 'cypress/e2e/**/*.{js,jsx,ts,tsx}',
        testIsolation: false
    },
    viewportWidth: 1920,
    viewportHeight: 1080,
});