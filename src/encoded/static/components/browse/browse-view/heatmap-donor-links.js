'use strict';

import React from 'react';

/**
 * Donor external_id -> the donor page to link to from the heatmap tables'
 * Donor ID cells: the ProtectedDonor page for a user with protected access
 * (same `userDownloadAccess.protected` check Browse by File's own donor
 * column uses, see BrowseView.js), otherwise the plain Donor page. Read off
 * the Tissue search results' own embedded donor (`donor.protected_donor`,
 * see types/tissue.py's embedded_list).
 */
export function buildDonorHrefs(tissueResults = [], hasProtectedAccess = false) {
    const donorHrefs = {};
    tissueResults.forEach((t) => {
        const donor = t?.donor;
        const donorId = donor?.external_id;
        if (!donorId || donorHrefs[donorId]) return;
        const protectedDonor = donor.protected_donor;
        const protectedHref = typeof protectedDonor === 'string' ? protectedDonor : protectedDonor?.['@id'];
        const href = (hasProtectedAccess && protectedHref) || donor['@id'];
        if (href) donorHrefs[donorId] = href;
    });
    return donorHrefs;
}

/** A Donor ID cell's own content -- a new-tab link when there's a page to link to. */
export function DonorIdLink({ donorId, donorHrefs }) {
    const href = donorHrefs?.[donorId];
    if (!href) return donorId;
    return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="tissue-heatmap-donor-link">
            {donorId}
        </a>
    );
}
