'use strict';

import _ from 'underscore';

/**
 * Terms that are shown -- and counted -- as one in the bar plot, per aggregated
 * field: { field: { recordedTerm: displayedTerm } }.
 *
 * The data itself keeps the recorded values (a tissue's `preservation_type` is
 * "Snap Frozen" or "Frozen" in the database, search facets and API); it's only
 * this chart, like the rest of the portal's Fixed/Frozen views, that treats
 * both as "Frozen". So the merge lives here, on the aggregation response,
 * rather than in what the backend indexes.
 */
export const TERM_MERGES_BY_FIELD = {
    'sample_summary.preservation_types': {
        'Snap Frozen': 'Frozen',
    },
};

/**
 * Every recorded term a displayed (possibly merged) term stands for -- what a
 * link out of the chart has to filter on so it lists everything the bar counted
 * (a "Frozen" bar is Frozen *and* Snap Frozen files). Just `[term]` for a term
 * that isn't merged.
 */
export function getRecordedTerms(field, term) {
    const merges = TERM_MERGES_BY_FIELD[field];
    if (!merges) return [term];
    const recorded = _.keys(merges).filter((recordedTerm) => merges[recordedTerm] === term);
    return _.uniq([term].concat(recorded));
}

const SUMMED_COUNTS = ['doc_count', 'files'];

/** Adds up two buckets' counts. Donors are unioned, not summed, when their ids are known. */
function mergeCounts(a, b) {
    const merged = { ...a };
    SUMMED_COUNTS.forEach((key) => {
        if (typeof a[key] === 'number' || typeof b[key] === 'number') {
            merged[key] = (a[key] || 0) + (b[key] || 0);
        }
    });
    if (a.all_donors_ids || b.all_donors_ids) {
        // A donor with samples of both merged types is still one donor.
        merged.all_donors_ids = _.union(a.all_donors_ids || [], b.all_donors_ids || []);
        merged.donors = merged.all_donors_ids.length;
    } else {
        merged.donors = (a.donors || 0) + (b.donors || 0);
    }
    return merged;
}

/**
 * Merges two term nodes: a terminal one (counts only) or one with its own
 * nested `terms` and a `total` (see visualization.py's bar_plot_aggregations).
 */
function mergeNodes(a, b) {
    if (!a.total && !b.total) return mergeCounts(a, b);
    const terms = { ...(a.terms || {}) };
    _.each(b.terms || {}, (node, key) => {
        terms[key] = terms[key] ? mergeNodes(terms[key], node) : node;
    });
    return {
        ...a,
        total: mergeCounts(a.total || {}, b.total || {}),
        terms,
        other_doc_count: (a.other_doc_count || 0) + (b.other_doc_count || 0),
    };
}

/** Returns `[terms, changed]` -- `terms` is the same object when nothing merged. */
function mergeTerms(terms, field) {
    const merges = TERM_MERGES_BY_FIELD[field] || {};
    const result = {};
    let changed = false;

    _.each(terms, (node, key) => {
        let nextNode = node;
        if (node && node.terms) {
            const [childTerms, childrenChanged] = mergeTerms(node.terms, node.field);
            if (childrenChanged) {
                nextNode = { ...node, terms: childTerms };
                changed = true;
            }
        }
        const targetKey = merges[key] || key;
        if (targetKey !== key) {
            changed = true;
            if (nextNode.term) nextNode = { ...nextNode, term: targetKey };
        }
        result[targetKey] = result[targetKey] ? mergeNodes(result[targetKey], nextNode) : nextNode;
        if (result[targetKey] !== nextNode) changed = true;
    });

    return [changed ? result : terms, changed];
}

// The same response object is asked for on every render, so remember its result.
const mergedByData = new WeakMap();

/**
 * Applies TERM_MERGES_BY_FIELD to a /bar_plot_aggregations/ response, at every
 * level of its nested `terms`. Returns `data` itself when nothing needs merging.
 */
export function mergeTermsInBarplotData(data) {
    if (!data || typeof data !== 'object' || !data.terms) return data;
    if (mergedByData.has(data)) return mergedByData.get(data);
    const [terms, changed] = mergeTerms(data.terms, data.field);
    const result = changed ? { ...data, terms } : data;
    mergedByData.set(data, result);
    return result;
}
