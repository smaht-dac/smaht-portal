'use strict';

import _ from 'underscore';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

/**
 * Fixed tissue samples on Browse by Tissue's line chart ("Group By: Sample
 * Type"), per explicit request.
 *
 * That chart is built from File aggregations, so it only ever counts samples
 * with released files -- Fixed (histology) samples generally have none, and
 * never showed up. This adds a separate "Fixed" series counted straight from
 * TissueSample search instead (each sample's OWN preservation_type, not its
 * parent Tissue's like the File-based Frozen/Fresh series) -- i.e. Fixed
 * samples collected, not Fixed samples with files.
 *
 * Self-contained on purpose: flip SHOW_FIXED_TISSUE_SAMPLES to false to turn
 * it off entirely (no request is made then either).
 */
export const SHOW_FIXED_TISSUE_SAMPLES = true;

export const FIXED_TERM = 'Fixed';

const PRESERVATION_TYPES_FIELD = 'sample_summary.preservation_types';

// Same released-donor Production population as the rest of Browse by Tissue
// (see types/tissue_sample.py's sample_sources.donor.* embeds).
const FIXED_TISSUE_SAMPLES_HREF =
    '/search/?type=TissueSample&preservation_type=Fixed' +
    '&sample_sources.donor.study=Production&sample_sources.donor.tags=has_released_files' +
    '&limit=all&field=external_id&field=sample_sources.tissue_type&field=sample_sources.donor.display_title';

let fixedCountsPromise = null;

/**
 * tissue_type -> { samples, donors, all_donors_ids }, loaded once per page
 * load. Samples are counted by distinct external_id: a TPC and a GCC can each
 * register their own TissueSample record for the same aliquot (see
 * FacetCharts.js's TPC exclusion), which would otherwise count it twice.
 */
export function loadFixedTissueSampleCounts() {
    if (fixedCountsPromise) return fixedCountsPromise;
    fixedCountsPromise = new Promise((resolve) => {
        const build = (resp) => {
            const samplesByTissue = {};
            const donorsByTissue = {};
            (resp?.['@graph'] || []).forEach((sample) => {
                const sampleKey = sample.external_id || sample['@id'];
                (sample.sample_sources || []).forEach((source) => {
                    const tissueType = source?.tissue_type;
                    if (!tissueType) return;
                    (samplesByTissue[tissueType] || (samplesByTissue[tissueType] = new Set())).add(sampleKey);
                    const donorId = source?.donor?.display_title;
                    if (donorId) (donorsByTissue[tissueType] || (donorsByTissue[tissueType] = new Set())).add(donorId);
                });
            });
            const counts = {};
            _.each(samplesByTissue, (sampleKeys, tissueType) => {
                const donorIds = Array.from(donorsByTissue[tissueType] || []).sort();
                counts[tissueType] = { samples: sampleKeys.size, donors: donorIds.length, all_donors_ids: donorIds };
            });
            resolve(counts);
        };
        // An empty search answers 404 with an empty @graph -- same handling.
        ajax.load(FIXED_TISSUE_SAMPLES_HREF, build, 'GET', (resp) => build(resp));
    });
    return fixedCountsPromise;
}

const addedByData = new WeakMap();

/**
 * Adds a FIXED_TERM sub-term (from loadFixedTissueSampleCounts) under every
 * tissue in a Tissue x Sample Type /bar_plot_aggregations/ response, adding
 * tissues that only have Fixed samples too, and bumping each tissue's own
 * total by its Fixed count so the chart's Y scale fits the new series. A
 * file-derived "Fixed" term (a whole Tissue recorded as Fixed), if any, is
 * replaced -- this series is always the TissueSample-level count.
 */
export function addFixedTissueSamples(barplotData, fixedCounts) {
    if (!barplotData || !barplotData.terms || !fixedCounts) return barplotData;
    const cached = addedByData.get(barplotData);
    if (cached && cached.fixedCounts === fixedCounts) return cached.result;

    const terms = { ...barplotData.terms };
    _.each(fixedCounts, (fixed, tissueType) => {
        const existing = terms[tissueType];
        const fixedNode = {
            doc_count: 0,
            files: 0,
            samples: fixed.samples,
            donors: fixed.donors,
            all_donors_ids: fixed.all_donors_ids,
        };
        if (!existing) {
            terms[tissueType] = {
                term: tissueType,
                field: PRESERVATION_TYPES_FIELD,
                total: { ...fixedNode },
                terms: { [FIXED_TERM]: fixedNode },
                other_doc_count: 0,
            };
            return;
        }
        if (existing.field !== PRESERVATION_TYPES_FIELD) return;
        const previousFixedSamples = existing.terms?.[FIXED_TERM]?.samples || 0;
        const donorIds = _.union(existing.total?.all_donors_ids || [], fixed.all_donors_ids);
        terms[tissueType] = {
            ...existing,
            terms: { ...(existing.terms || {}), [FIXED_TERM]: fixedNode },
            total: {
                ...(existing.total || {}),
                samples: (existing.total?.samples || 0) - previousFixedSamples + fixed.samples,
                donors: donorIds.length,
                all_donors_ids: donorIds,
            },
        };
    });

    const addedSamples = _.reduce(terms, (sum, node, tissueType) => (
        sum + (node.total?.samples || 0) - (barplotData.terms[tissueType]?.total?.samples || 0)
    ), 0);
    const result = {
        ...barplotData,
        terms,
        total: { ...(barplotData.total || {}), samples: (barplotData.total?.samples || 0) + addedSamples },
    };
    addedByData.set(barplotData, { fixedCounts, result });
    return result;
}
