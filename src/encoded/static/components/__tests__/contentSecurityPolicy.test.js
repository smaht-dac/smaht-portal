import { buildContentSecurityPolicy } from '../contentSecurityPolicy';

describe('portal Content Security Policy', () => {
    const connectSources = buildContentSecurityPolicy()
        .split('; ')
        .find((directive) => directive.startsWith('connect-src '))
        .split(' ')
        .slice(1);

    test.each([
        'https://login-test.srce.hms.harvard.edu/oauth2/default/.well-known/openid-configuration',
        'https://login-test.srce.hms.harvard.edu/oauth2/default/v1/token',
        'https://login-test.srce.hms.harvard.edu/oauth2/default/v1/keys',
    ])('allows issuer connection %s', (url) => {
        const origin = new URL(url).origin;
        expect(connectSources).toContain(origin);
    });

    test('does not allow an unrelated origin or broaden to the HMS domain', () => {
        expect(connectSources).not.toContain('https://unrelated.example.org');
        expect(connectSources).not.toContain('https://*.hms.harvard.edu');
    });
});
