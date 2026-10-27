'use strict';

import React from 'react';
import { barplot_color_cycler } from './../ColorCycler';
import { navigate } from './../../util';
import { getRecordedTerms } from './../BarPlot/merge-terms';
import { TISSUE_SAMPLE_TYPE_FIELD } from './../BarPlot/tissue-sample-types';
import { TISSUE_FIELD } from './../BarPlot/tissue-histology-samples';
import {
    getTissueIconSrc,
    getTissueTypeUrlCode,
    getTissueNameFromFacetTerm,
} from './../../item-pages/components/tissue-overview/helpers';
import ChartDetailCursor from './ChartDetailCursor';

/**
 * Browse by Tissue's popover (see CursorViewBounds): one tissue's bar --
 * its sample type, sample/donor counts, and links to what those samples are
 * for: pathology reports/histology images (Fixed) or sequencing files (every
 * other sample type). Any other path, e.g. a legend term's, gets the default
 * ChartDetailCursor body.
 */

// What each sample type's samples are for -- see also
// tissue-sample-types.js's plural legend labels.
const SAMPLE_TYPE_TITLES = {
    'Fixed': 'Fixed Sample for Pathology Review',
    'Frozen': 'Frozen Sample for Sequencing',
    'Fresh': 'Fresh Sample for Sequencing',
};

// Fixed samples are what pathology reviews; every other kind is sequenced.
const FIXED_TERM = 'Fixed';

const POPULATION_FILTERS = [
    ['sample_sources.donor.study', 'Production'],
    ['sample_sources.donor.tags', 'has_released_files'],
];

// One tissue's reports/images, for the same released-donor Production
// population the chart counts (see types/pathology_report.py's and
// types/histology_image.py's embeds). Every bar of a tissue links to these.
const getTissueSearchHref = (type, samplesPrefix, tissueTerm) => '/search/?' + new URLSearchParams(
    [['type', type], [samplesPrefix + 'sample_sources.tissue_type', tissueTerm]].concat(
        POPULATION_FILTERS.map(([field, value]) => [samplesPrefix + field, value])
    )
).toString();

const getTissueFilesHref = (tissueTerm, sampleTypeTerm) => {
    const params = navigate.getBrowseBaseParams(null, 'all');
    params[TISSUE_FIELD] = [tissueTerm];
    // Every recorded term a merged one stands for (Frozen -> Frozen + Snap Frozen).
    if (sampleTypeTerm) params[TISSUE_SAMPLE_TYPE_FIELD] = getRecordedTerms(TISSUE_SAMPLE_TYPE_FIELD, sampleTypeTerm);
    return navigate.getBrowseBaseHref(params, 'all');
};

const getTissueOverviewHref = (tissueTerm) =>
    '/tissue-overview/?tissue_type=' + encodeURIComponent(getTissueTypeUrlCode(tissueTerm)).replace(/%20/g, '+');

// The bars' pastel colors are too light for the icon's thin outlines on white
// -- the icon gets the same hue, darkened by `amount` (0-1) toward black.
const darkenHex = (hex, amount) => {
    const match = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) return hex;
    const value = parseInt(match[1], 16);
    const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    return 'rgb(' + channels.map((channel) => Math.round(channel * (1 - amount))).join(', ') + ')';
};

const ICON_DARKEN_AMOUNT = 0.35;

const pluralize = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const CountLink = ({ href, count, noun }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">{ pluralize(count || 0, noun) }</a>
);

export default function TissueCursorBody(props) {
    const { path, sticky } = props;
    if (!Array.isArray(path) || path.length === 0) return null;
    const [tissueNode] = path;
    if (tissueNode.field !== TISSUE_FIELD) return <ChartDetailCursor.Body {...props} />;

    const tissueTerm = tissueNode.term;
    const leafNode = path[path.length - 1];
    const groupNode = path.length > 1 ? leafNode : null;
    const isSampleTypeGroup = groupNode?.field === TISSUE_SAMPLE_TYPE_FIELD;
    const isSequencedSampleType = isSampleTypeGroup && groupNode.term !== FIXED_TERM;
    const color = leafNode.color || barplot_color_cycler.colorForNode(leafNode);
    const iconSrc = getTissueIconSrc(tissueTerm);
    const tissueName = getTissueNameFromFacetTerm(tissueTerm);

    const groupTitle = groupNode
        ? (isSampleTypeGroup && SAMPLE_TYPE_TITLES[groupNode.term]) || groupNode.name || groupNode.term
        : null;

    const action = isSequencedSampleType
        ? { title: `Browse ${tissueName} Sequencing Data`, href: getTissueFilesHref(tissueTerm) }
        : { title: `Browse ${tissueName} Tissue Data`, href: getTissueOverviewHref(tissueTerm) };

    return (
        <div className="mosaic-cursor-body tissue-cursor-body">
            { groupTitle ? (
                <div className="tissue-cursor-group">
                    <span className="tissue-cursor-swatch" style={{ backgroundColor: color }} />
                    <span>{ groupTitle }</span>
                </div>
            ) : null }
            <div className="tissue-cursor-main">
                <div className="tissue-cursor-labels">
                    <span>Tissue</span>
                    <span># of Tissue Samples</span>
                </div>
                <div className="tissue-cursor-tissue">
                    { iconSrc ? (
                        <i className="tissue-cursor-icon" style={{
                            backgroundColor: darkenHex(color, ICON_DARKEN_AMOUNT),
                            WebkitMaskImage: `url(${iconSrc})`,
                            maskImage: `url(${iconSrc})`,
                        }} />
                    ) : null }
                    <span className="tissue-cursor-name">{ tissueTerm }</span>
                    <span className="tissue-cursor-count">{ leafNode.samples || 0 }</span>
                </div>
            </div>
            <div className="tissue-cursor-details">
                <div>{ leafNode.donors || 0 }<small> { (leafNode.donors === 1) ? 'Donor' : 'Donors' }</small></div>
                <div className="tissue-cursor-links">
                    { isSequencedSampleType ? (
                        <CountLink href={getTissueFilesHref(tissueTerm, groupNode.term)} count={leafNode.files} noun="File" />
                    ) : (
                        <React.Fragment>
                            <CountLink href={getTissueSearchHref('PathologyReport', 'tissue_samples.', tissueTerm)}
                                count={leafNode.pathology_reports} noun="Pathology Report" />
                            <CountLink href={getTissueSearchHref('HistologyImage', 'pathology_reports.tissue_samples.', tissueTerm)}
                                count={leafNode.histology_images} noun="Histology Image" />
                        </React.Fragment>
                    ) }
                </div>
            </div>
            { sticky ? (
                <div className="tissue-cursor-action d-grid">
                    <a className="btn btn-primary btn-sm" href={action.href} target="_blank" rel="noreferrer noopener">
                        { action.title }
                    </a>
                </div>
            ) : null }
        </div>
    );
}
