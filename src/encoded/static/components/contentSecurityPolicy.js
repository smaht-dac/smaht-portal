/**
 * Builds the policy emitted in the portal's HTML meta tag.
 *
 * Keep the Okta issuer origin explicit: devtest uses an organization-owned
 * custom domain that does not match the standard Okta host patterns.
 */
export function buildContentSecurityPolicy() {
    return [
        "default-src 'self'",
        "img-src 'self' https://* https://i.ytimg.com data: blob:",
        'child-src blob:',
        // Allowing unsafe-eval temporarily re: 'box-intersect' dependency of some HiGlass tracks.
        'frame-src https://www.google.com/recaptcha/ https://www.youtube.com',
        "script-src 'self' www.google-analytics.com www.googletagmanager.com https://secure.gravatar.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com  https://unpkg.com",
        "font-src 'self' https://fonts.gstatic.com",
        "worker-src 'self' blob:",
        // Okta is reached directly by the browser for PKCE token exchange,
        // logout revocation, and the issuer's JWKS/discovery documents.
        "connect-src 'self' https://www.google.com/recaptcha/ https://*.s3.amazonaws.com https://rest.ensembl.org https://eutils.ncbi.nlm.nih.gov https://www.google-analytics.com https://www.googletagmanager.com https://*.okta.com https://*.oktapreview.com https://login-test.srce.hms.harvard.edu https://login.srce.hms.harvard.edu",
    ].join('; ');
}
