'use strict';

import _ from 'underscore';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { TISSUE_SAMPLE_TYPE_FIELD } from './tissue-sample-types';
import { getDisplayedTerm, getRecordedTerms } from './merge-terms';

/**
 * Browse by Tissue's Cohort View chart: every visible tissue sample of the
 * released-donor Production population, by tissue and sample type (or
 * submission center) -- the same samples, counted the same way, as the
 * Tissue Overview page's Sequencing/Histology & Pathology cards. Counted
 * server side by /tissue_sample_aggregations/ (visualization.py) as one
 * sample per physical aliquot: a Frozen aliquot's Cores, and a GCC's own
 * copy of each core it receives, count once -- the same unit as a Fixed
 * aliquot. Built into /bar_plot_aggregations/'s response shape here.
 *
 * Fresh tissues (Buccal Swab, Fibroblast, ...) are charted as "Fresh"
 * whatever their samples' own type (mostly Frozen) -- see visualization.py's
 * TISSUE_SAMPLE_TYPE_SCRIPT.
 *
 * Plain searches, so every viewer only counts what they are allowed to see --
 * per explicit request, rather than a permission-free count.
 */

// The chart's own field keys -- the x axis and "Sample Type" keep the File
// field names the rest of the chart code (tissue category tabs, sample type
// colors/labels/order, merge-terms.js's Snap Frozen -> Frozen) is keyed by.
export const TISSUE_FIELD = 'sample_summary.tissues';
export const SUBMISSION_CENTER_FIELD = 'submission_centers.display_title';

// Same released-donor Production population as the rest of Browse by Tissue
// (see types/tissue_sample.py's sample_sources.donor.* embeds). Samples with
// no preservation type of their own are left out for now (per request, until
// it's worked out what they are).
const SAMPLE_SEARCH_PARAMS = {
    'status!': ['deleted'],
    'sample_sources.donor.study': ['Production'],
    'sample_sources.donor.tags': ['has_released_files'],
    'preservation_type!': ['No value'],
};
// The chart's field keys -> the TissueSample fields /tissue_sample_aggregations/
// groups by ("sample_type" is its own Fresh-aware preservation type, see
// visualization.py's TISSUE_SAMPLE_TYPE_SCRIPT).
const AGGREGATION_FIELDS = {
    [TISSUE_FIELD]: 'sample_sources.tissue_type',
    [TISSUE_SAMPLE_TYPE_FIELD]: 'sample_type',
    [SUBMISSION_CENTER_FIELD]: 'submission_centers.display_title',
};
// Every visible HistologyImage with the report(s) it shows -- a bar's images
// are the ones of its samples' own reports.
const HISTOLOGY_IMAGES_SEARCH_HREF = '/search/?type=HistologyImage&limit=all&field=pathology_reports';

// The Files a popover links to are Browse by File's own, by tissue and the
// tissue's preservation type -- counted the same way, so each count matches
// the list its link opens.
const FILE_COUNT_FIELDS = [TISSUE_FIELD, TISSUE_SAMPLE_TYPE_FIELD];

const MISSING_TERM = 'Not specified';
// What visualization.py answers for a sample with no value for the field.
const NO_VALUE_TERM = 'No value';

function fetchSearchGraph(href) {
    return new Promise((resolve) => {
        // An empty search answers 404 with an empty @graph -- same handling.
        const onResponse = (resp) => resolve(resp?.['@graph'] || []);
        ajax.load(href, onResponse, 'GET', onResponse);
    });
}

// An embedded link's @id -- `field=` returns either the object or just the id.
const getLinkId = (item) => (typeof item === 'string' ? item : item?.['@id']) || null;

// "/non-brain-pathology-reports/<uuid>/" -> "<uuid>" -- the aggregation
// names a bar's reports by uuid.
const getUuidFromAtId = (atId) => String(atId || '').split('/')[2] || null;

function fetchImageIdsByReportUuid() {
    return fetchSearchGraph(HISTOLOGY_IMAGES_SEARCH_HREF).then((images) => {
        const imageIdsByReportUuid = {};
        images.forEach((image) => {
            _.compact(_.map(image.pathology_reports || [], getLinkId)).forEach((reportId) => {
                const uuid = getUuidFromAtId(reportId);
                if (!uuid) return;
                (imageIdsByReportUuid[uuid] || (imageIdsByReportUuid[uuid] = [])).push(image['@id']);
            });
        });
        return imageIdsByReportUuid;
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

let cachedLinkedCounts = null;

/**
 * The chart's sample counts for `fields` ([x axis field, optional group by
 * field], the chart's own keys), counted server side by
 * /tissue_sample_aggregations/ -- one sample per physical aliquot, the same
 * count as the Tissue Overview page's cards. Resolves to that endpoint's
 * response, or null when it fails.
 */
export function loadTissueSampleAggregations(fields = []) {
    return new Promise((resolve) => {
        ajax.load(
            '/tissue_sample_aggregations/',
            (resp) => resolve(resp || null),
            'POST',
            () => resolve(null),
            JSON.stringify({
                search_query_params: SAMPLE_SEARCH_PARAMS,
                fields_to_aggregate_for: _.compact(fields.map((field) => AGGREGATION_FIELDS[field])),
            })
        );
    });
}

/**
 * What the popovers count besides samples: the histology images of each
 * pathology report, and Browse by File's file counts per tissue/preservation
 * type (a /bar_plot_aggregations/ `terms`) for `fileSearchParams`, Browse by
 * File's own base filters. Pass `reuse` to skip refetching when only the
 * chart's fields changed -- a session change has to refetch, since
 * visibility depends on it.
 */
export function loadTissueHistologyLinkedCounts({ reuse = false, fileSearchParams = {} } = {}) {
    if (reuse && cachedLinkedCounts) return cachedLinkedCounts;
    cachedLinkedCounts = Promise.all([fetchImageIdsByReportUuid(), fetchFileCountTerms(fileSearchParams)]).then(
        ([imageIdsByReportUuid, fileCountTerms]) => {
            return { imageIdsByReportUuid, fileCountTerms };
        }
    );
    return cachedLinkedCounts;
}

const EMPTY_COUNTS = { samples: 0, all_donors_ids: [], pathology_report_uuids: [] };

function toCounts(counts = EMPTY_COUNTS, imageIdsByReportUuid = {}, files = 0) {
    const reportUuids = counts.pathology_report_uuids || [];
    const imageIds = _.uniq(_.flatten(reportUuids.map((uuid) => imageIdsByReportUuid[uuid] || [])));
    const donorIds = counts.all_donors_ids || [];
    return {
        doc_count: counts.samples || 0,
        files,
        samples: counts.samples || 0,
        donors: donorIds.length,
        all_donors_ids: donorIds,
        pathology_reports: reportUuids.length,
        histology_images: imageIds.length,
    };
}

const toChartTerm = (term) => (term === NO_VALUE_TERM ? MISSING_TERM : term);

/**
 * The /bar_plot_aggregations/-shaped chart data for `fields` ([x axis field,
 * optional group by field]) out of a /tissue_sample_aggregations/ response
 * (see loadTissueSampleAggregations): distinct samples (aliquots)/donors per
 * bar, the distinct pathology reports/histology images of those samples and,
 * from `linkedCounts` (see loadTissueHistologyLinkedCounts), the tissue's files.
 */
export function buildTissueHistologyBarplotData(aggregations = null, fields = [], linkedCounts = {}) {
    const [xAxisField, groupByField] = fields;
    const { imageIdsByReportUuid = {}, fileCountTerms = {} } = linkedCounts;
    const aggTerms = aggregations?.terms || {};

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

    const terms = {};
    _.forEach(aggTerms, (node, rawTerm) => {
        const term = toChartTerm(rawTerm);
        if (!groupByField) {
            terms[term] = toCounts(node, imageIdsByReportUuid, getFileCount(term));
            return;
        }
        const subNodes = {};
        _.forEach(node.terms || {}, (subNode, rawSubTerm) => {
            subNodes[toChartTerm(rawSubTerm)] = subNode;
        });
        const subTerms = _.keys(subNodes).sort();
        terms[term] = {
            term,
            field: groupByField,
            total: toCounts(node.total, imageIdsByReportUuid, getFileCount(term)),
            terms: _.mapObject(subNodes, (subNode, subTerm) =>
                toCounts(subNode, imageIdsByReportUuid, getFileCount(term, subTerm, subTerms))
            ),
            other_doc_count: 0,
        };
    });

    return {
        field: xAxisField,
        terms,
        total: toCounts(aggregations?.total, imageIdsByReportUuid),
        other_doc_count: 0,
        meta: {},
    };
}
