'use strict';

import _ from 'underscore';
import React from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';

import { getNestedProperty } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/object';
import { isServerSide } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/misc';
import { patchedConsoleInstance as console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util/patched-console';

// @TODO Additional refactoring for SMaHT

export function shouldDisplayStructuredData(baseDomain) {
    if (baseDomain.indexOf('data.smaht.org') > -1) return true;
    if (baseDomain.indexOf('localhost') > -1) return true;
    return false;
}

export class CurrentContext extends React.PureComponent {
    static propTypes = {
        context: PropTypes.object.isRequired,
    };

    static commonSchemaBase(
        context,
        hrefParts,
        baseDomain,
        extraPageVals = {}
    ) {
        var currentURL = baseDomain + context['@id'];
        var base = {
            '@context': 'http://schema.org',
            mainEntityOfPage: _.extend(
                {
                    '@type': 'WebPage',
                    isPartOf: {
                        '@type': 'WebSite',
                        url: baseDomain,
                    },
                    url: currentURL,
                },
                extraPageVals
            ),
            datePublished:
                context.public_release || context.date_created || null,
            url: currentURL,
            '@id': currentURL,
        };
        // Optional but common
        // if (context.identifier || context.accession || context.uuid) {
        //     base.identifier =
        //         context.identifier || context.accession || context.uuid;
        // }
        if (context.description) {
            base.description = context.description;
        }
        base.dateModified =
            (context.last_modified && context.last_modified.date_modified) ||
            base.datePublished ||
            null;
        return base;
    }

    /**
     * @deprecated FROM 4DN
     * TODO: May want to do something like this in the future for the various consortia/submission centers
     */
    static labToSchema(lab, baseDomain) {
        if (!lab || !lab['@id'] || !lab.display_title) return null;
        var labRetObj = {
            '@type': 'EducationalOrganization',
            name: lab.display_title,
            url: baseDomain + lab['@id'],
            knowsAbout: FullSite.smahtConsortium(baseDomain),
        };
        if (lab.url && typeof lab.url === 'string') {
            labRetObj['sameAs'] = lab.url;
        }
        return labRetObj;
    }

    static transformationsByType = {
        User: function (context) {
            // No permission to view currently.
            return null;
        },

        HomePage: function (context, hrefParts, baseDomain) {
            // Only needed on home page.
            return FullSite.generate(baseDomain);
        },

        /**
         * @deprecated Need to double check if this will be useful for SMaHT; will we use TechArticle?
         * Generate an 'TechArticle' schema item for Help pages.
         * _OR_ a directory schema item if is a DirectoryPage, as well.
         */
        // HelpPage: function (context, hrefParts, baseDomain) {
        //     if (context['@id'].slice(0, 6) !== '/help/') {
        //         return null; // Skip if we're on Item page for a Static Page
        //     }
        //     var dcicOrg = FullSite.smahtConsortium(baseDomain);

        //     if (context['@type'].indexOf('DirectoryPage') > -1) {
        //         return _.extend(
        //             _.omit(
        //                 CurrentContext.commonSchemaBase(
        //                     context,
        //                     hrefParts,
        //                     baseDomain,
        //                     {
        //                         '@type': 'CollectionPage',
        //                         '@id': baseDomain + context['@id'],
        //                     }
        //                 ),
        //                 'datePublished',
        //                 'dateModified',
        //                 '@id'
        //             ),
        //             {
        //                 '@type': 'ItemList',
        //                 itemListElement: _.map(
        //                     context.children,
        //                     function (childPage, idx) {
        //                         return {
        //                             '@type': 'ListItem',
        //                             position: idx + 1,
        //                             url: baseDomain + '/' + childPage.name,
        //                         };
        //                     }
        //                 ),
        //             }
        //         );
        //     } else {
        //         return _.extend(
        //             _.omit(
        //                 CurrentContext.commonSchemaBase(
        //                     context,
        //                     hrefParts,
        //                     baseDomain,
        //                     { '@id': baseDomain + context['@id'] }
        //                 ),
        //                 '@id'
        //             ),
        //             {
        //                 '@type': 'TechArticle',
        //                 headline: context.display_title || context.title,
        //                 author: dcicOrg,
        //                 publisher: dcicOrg,
        //                 articleSection: 'Help',
        //                 isAccessibleForFree: true,
        //                 image: FullSite.logoSMaHT(baseDomain),
        //             }
        //         );
        //     }
        // },
    };

    /**
     * Go down `@type` list for this Item/context and find a transformation fxn, if any.
     */
    static getTransformFxnForItem(context) {
        var types = context['@type'];
        if (!types) return null;
        var currFxn = null;
        for (var i = 0; i < types.length; i++) {
            currFxn = CurrentContext.transformationsByType[types[i]];
            if (typeof currFxn === 'function') return currFxn;
        }
        return null;
    }

    render() {
        var { context, hrefParts, baseDomain } = this.props,
            transformFxn =
                shouldDisplayStructuredData(baseDomain) &&
                context &&
                CurrentContext.getTransformFxnForItem(context),
            structuredDataJSON =
                transformFxn && transformFxn(context, hrefParts, baseDomain);

        if (!structuredDataJSON) return null;
        return (
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html:
                        '\n' +
                        JSON.stringify(structuredDataJSON, null, 4) +
                        '\n',
                }}
            />
        );
    }
}

const FullSite = {
    logoSMaHT: function (baseDomain = 'https://data.smaht.org') {
        return {
            '@type': 'ImageObject',
            caption: 'Logo for the SMaHT Data Portal',
            width: {
                '@type': 'QuantitativeValue',
                unitCode: 'E37',
                value: 300,
            },
            height: {
                '@type': 'QuantitativeValue',
                unitCode: 'E37',
                value: 300,
            },
            url: baseDomain + '/static/img/smaht-logo-seo.png',
        };
    },

    smahtConsortium: function (portalBaseDomain, short = true) {
        var shortVersion = {
            '@type': 'EducationalOrganization',
            name: 'Somatic Mosaicism across Human Tissues (SMaHT) Network',
            // sameAs: 'http://dcic.4dnucleome.org/', // TODO: when we have an "about" page, maybe add that here
            url: 'https://data.smaht.org/',
            logo: FullSite.logoSMaHT(portalBaseDomain),
        };
        if (short) return shortVersion;
        return _.extend(shortVersion, {
            member: [
                {
                    '@type': 'EducationalOrganization',
                    name: 'Department of Biomedical Informatics',
                    alternateName: 'HMS DBMI',
                    url: 'https://dbmi.hms.harvard.edu/',
                    parentOrganization: {
                        // This part taken from https://www.harvard.edu source
                        '@type': 'CollegeOrUniversity',
                        name: 'Harvard',
                        alternateName: 'Harvard University',
                        url: 'http://www.harvard.edu',
                        logo: 'http://www.harvard.edu/sites/default/files/content/harvard-university-logo-151.png',
                    },
                    sameAs: 'https://www.youtube.com/HarvardDBMI',
                },
                // TODO: Should we add other non-DAC consortium members here? Which ones?
            ],
            knowsAbout: [
                // 'http://higlass.io/', TODO: May want to restore this, add chromoscope, goslang, any others, etc. in future.
                'http://www.smaht.org/',
                'https://www.smaht.org/',
                'https://commonfund.nih.gov/smaht',
            ],
        });
    },

    generate: function (baseDomain) {
        return (
            shouldDisplayStructuredData(baseDomain) && {
                '@context': 'http://schema.org',
                '@type': 'WebSite',
                url: baseDomain + '/',
                description:
                    'The SMaHT Data Portal hosts data generated by the Somatic Mosaicism across Human Tissues (SMaHT) Network and provides a platform to search, visualize, and download somatic mosaic variants in normal tissues.',
                creator: FullSite.smahtConsortium(baseDomain, false),
            }
        );
    },
};
