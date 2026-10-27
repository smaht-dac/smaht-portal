'use strict';

import _ from 'underscore';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { TISSUE_SAMPLE_TYPE_FIELD } from './tissue-sample-types';
import { getDisplayedTerm, getRecordedTerms } from './merge-terms';

/**
 * Browse by Tissue's Cohort View chart counts tissue samples with histology
 * images and/or pathology reports -- not samples with released files, which
 * is what the File-based /bar_plot_aggregations/ the other browse pages use
 * would count. So this chart is built here, from TissueSample search, into
 * that same response shape (see visualization.py's bar_plot_chart).
 *
 * A HistologyImage always links a PathologyReport (a required field), so "has
 * an image and/or a report" comes down to "has a report", which a sample can
 * have in 2 ways:
 * - a Fixed sample's own `pathology_reports` (the report is about it), or
 * - a Frozen sample's `associated_pathology_reports` (the reports of the
 *   Fixed sample cut from the same tissue block, see types/tissue_sample.py).
 * Snovault filters can't OR 2 fields, so each is its own search.
 *
 * These are plain searches, so every viewer only counts what they are allowed
 * to see -- per explicit request, rather than a permission-free count.
 */

// The chart's own field keys -- the x axis and "Sample Type" keep the File
// field names the rest of the chart code (tissue category tabs, sample type
// colors/labels/order, merge-terms.js's Snap Frozen -> Frozen) is keyed by.
export const TISSUE_FIELD = 'sample_summary.tissues';
export const SUBMISSION_CENTER_FIELD = 'submission_centers.display_title';

// Same released-donor Production population as the rest of Browse by Tissue
// (see types/tissue_sample.py's sample_sources.donor.* embeds).
const SAMPLES_SEARCH_HREF =
    '/search/?type=TissueSample' +
    '&sample_sources.donor.study=Production&sample_sources.donor.tags=has_released_files' +
    '&limit=all&field=external_id&field=preservation_type&field=submission_centers.display_title' +
    '&field=sample_sources.tissue_type&field=sample_sources.donor.display_title&field=pathology_reports';

// Every visible HistologyImage with the report(s) it shows -- a bar's images
// are the ones of its samples' own reports.
const HISTOLOGY_IMAGES_SEARCH_HREF = '/search/?type=HistologyImage&limit=all&field=pathology_reports';

// The Files a popover links to are Browse by File's own, by tissue and the
// tissue's preservation type -- counted the same way, so each count matches
// the list its link opens.
const FILE_COUNT_FIELDS = [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD];

const SAMPLES_WITH_REPORT_FILTERS = [
    'pathology_reports.accession!=No+value',
    'associated_pathology_reports.pathology_reports.accession!=No+value',
];

const MISSING_TERM = 'Not specified';

// Samples with no preservation type of their own are left out of the chart
// altogether for now (per request, until it's worked out what they are) --
// set to false to chart them again, as "Not specified".
const HIDE_UNSPECIFIED_SAMPLE_TYPES = true;

const TERMS_BY_FIELD = {
    [TISSUE_FIELD]: (sample) => _.pluck(sample.sample_sources || [], 'tissue_type'),
    // The sample's OWN preservation type -- not its Tissue's, which File's
    // sample_summary.preservation_types reads.
    [TISSUE_SAMPLE_TYPE_FIELD]: (sample) => [sample.preservation_type],
    [SUBMISSION_CENTER_FIELD]: (sample) => _.pluck(sample.submission_centers || [], 'display_title'),
};

function fetchSearchGraph(href) {
    return new Promise((resolve) => {
        // An empty search answers 404 with an empty @graph -- same handling.
        const onResponse = (resp) => resolve(resp?.['@graph'] || []);
        ajax.load(href, onResponse, 'GET', onResponse);
    });
}

function fetchSamples(reportFilter) {
    return fetchSearchGraph(SAMPLES_SEARCH_HREF + '&' + reportFilter);
}

// An embedded link's @id -- `field=` returns either the object or just the id.
const getLinkId = (item) => (typeof item === 'string' ? item : item?.['@id']) || null;

function getReportIds(sample) {
    return _.compact(_.map(sample.pathology_reports || [], getLinkId));
}

function fetchImageIdsByReportId() {
    return fetchSearchGraph(HISTOLOGY_IMAGES_SEARCH_HREF).then((images) => {
        const imageIdsByReportId = {};
        images.forEach((image) => {
            _.compact(_.map(image.pathology_reports || [], getLinkId)).forEach((reportId) => {
                (imageIdsByReportId[reportId] || (imageIdsByReportId[reportId] = [])).push(image['@id']);
            });
        });
        return imageIdsByReportId;
    });
}

function fetchFileCountTerms(fileSearchParams) {
    return new Promise((resolve) => {
        ajax.load(
            '/bar_plot_aggregations/',
            (resp) => resolve(resp?.terms || {}),
            'POST',
            // Non-fatal: the popovers then just show 0 Files.
            () => resolve({}),
            JSON.stringify({ search_query_params: fileSearchParams, fields_to_aggregate_for: FILE_COUNT_FIELDS })
        );
    });
}

let cachedSamples = null;
let cachedLinkedCounts = null;

/**
 * Every visible TissueSample with a pathology report, either way. A TPC and a
 * GCC can each register their own record of the same aliquot (same
 * external_id), so samples are deduplicated by it.
 *
 * Pass `reuse` to skip refetching when only the chart's fields changed --
 * a session change has to refetch, since visibility depends on it.
 */
export function loadTissueHistologySamples({ reuse = false } = {}) {
    if (reuse && cachedSamples) return cachedSamples;
    cachedSamples = Promise.all(SAMPLES_WITH_REPORT_FILTERS.map(fetchSamples)).then((results) =>
        _.uniq(_.flatten(results, true), false, (sample) => sample.external_id || sample['@id'])
            .filter((sample) => !HIDE_UNSPECIFIED_SAMPLE_TYPES || sample.preservation_type)
    );
    return cachedSamples;
}

/**
 * What the popovers count besides samples: the histology images of each
 * pathology report, and Browse by File's file counts per tissue/preservation
 * type (a /bar_plot_aggregations/ `terms`) for `fileSearchParams`, Browse by
 * File's own base filters. `reuse` works as in loadTissueHistologySamples.
 */
export function loadTissueHistologyLinkedCounts({ reuse = false, fileSearchParams = {} } = {}) {
    if (reuse && cachedLinkedCounts) return cachedLinkedCounts;
    cachedLinkedCounts = Promise.all([fetchImageIdsByReportId(), fetchFileCountTerms(fileSearchParams)]).then(
        ([imageIdsByReportId, fileCountTerms]) => {
            return { imageIdsByReportId, fileCountTerms };
        }
    );
    return cachedLinkedCounts;
}

function getTerms(sample, field) {
    const getTermsForField = TERMS_BY_FIELD[field];
    const terms = _.uniq(_.compact(getTermsForField ? getTermsForField(sample) : []));
    return terms.length > 0 ? terms : [MISSING_TERM];
}

function getDonorIds(sample) {
    return _.compact(_.map(sample.sample_sources || [], (source) => source?.donor?.display_title));
}

function addSample(counter, sampleKey, donorIds, reportIds, imageIds) {
    counter.samples.add(sampleKey);
    donorIds.forEach((donorId) => counter.donors.add(donorId));
    reportIds.forEach((reportId) => counter.reports.add(reportId));
    imageIds.forEach((imageId) => counter.images.add(imageId));
}

function newCounter() {
    return { samples: new Set(), donors: new Set(), reports: new Set(), images: new Set() };
}

function toCounts(counter, files = 0) {
    const donorIds = Array.from(counter.donors).sort();
    return {
        doc_count: counter.samples.size,
        files,
        samples: counter.samples.size,
        donors: donorIds.length,
        all_donors_ids: donorIds,
        pathology_reports: counter.reports.size,
        histology_images: counter.images.size,
    };
}

/**
 * The /bar_plot_aggregations/-shaped chart data for `fields` ([x axis field,
 * optional group by field]) -- every count is distinct samples/donors, plus
 * the distinct pathology reports/histology images of those samples and, from
 * `linkedCounts` (see loadTissueHistologyLinkedCounts), the tissue's files.
 */
export function buildTissueHistologyBarplotData(samples = [], fields = [], linkedCounts = {}) {
    const [xAxisField, groupByField] = fields;
    const { imageIdsByReportId = {}, fileCountTerms = {} } = linkedCounts;
    const total = newCounter();
    const countersByTerm = {};

    samples.forEach((sample) => {
        const sampleKey = sample.external_id || sample['@id'];
        const donorIds = getDonorIds(sample);
        const reportIds = getReportIds(sample);
        const imageIds = _.flatten(reportIds.map((reportId) => imageIdsByReportId[reportId] || []));
        addSample(total, sampleKey, donorIds, reportIds, imageIds);
        getTerms(sample, xAxisField).forEach((term) => {
            const termCounters = countersByTerm[term] || (countersByTerm[term] = { counter: newCounter(), subCounters: {} });
            addSample(termCounters.counter, sampleKey, donorIds, reportIds, imageIds);
            if (!groupByField) return;
            getTerms(sample, groupByField).forEach((subTerm) => {
                const subCounter = termCounters.subCounters[subTerm] || (termCounters.subCounters[subTerm] = newCounter());
                addSample(subCounter, sampleKey, donorIds, reportIds, imageIds);
            });
        });
    });

    // Files are only counted by tissue and preservation type (FILE_COUNT_FIELDS).
    const getFileCount = (term, subTerm, subTerms) => {
        const fileNode = xAxisField === TISSUE_FIELD ? fileCountTerms[term] : null;
        if (!fileNode) return 0;
        if (subTerm === undefined) return fileNode.total?.files || 0;
        if (groupByField !== TISSUE_SAMPLE_TYPE_FIELD) return 0;
        // Terms shown as one (Snap Frozen -> Frozen) are summed once merged,
        // so the shown term's whole count goes on just one of them.
        const shownTerm = getDisplayedTerm(groupByField, subTerm);
        if (_.find(subTerms, (t) => getDisplayedTerm(groupByField, t) === shownTerm) !== subTerm) return 0;
        return getRecordedTerms(groupByField, shownTerm).reduce(
            (sum, recordedTerm) => sum + (fileNode.terms?.[recordedTerm]?.files || 0),
            0
        );
    };

    const terms = _.mapObject(countersByTerm, ({ counter, subCounters }, term) => {
        if (!groupByField) return toCounts(counter, getFileCount(term));
        const subTerms = _.keys(subCounters).sort();
        return {
            term,
            field: groupByField,
            total: toCounts(counter, getFileCount(term)),
            terms: _.mapObject(subCounters, (subCounter, subTerm) =>
                toCounts(subCounter, getFileCount(term, subTerm, subTerms))
            ),
            other_doc_count: 0,
        };
    });

    return {
        field: xAxisField,
        terms,
        total: toCounts(total),
        other_doc_count: 0,
        meta: {},
    };
}
