'use strict';

import React from 'react';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import DefaultItemView from './DefaultItemView';
import {
    getDisplayText,
    TissueDatum,
} from './components/tissue-overview/helpers';

// `present`/`description` field pairs shared by every BrainPathologyReport
// finding category (schemas/brain_pathology_report.json) -- fed into
// FindingsCardGroup as synthetic entries (see toBrainFindingEntries) so this
// flat-field shape renders through the same present/absent card UI as the
// report's real array fields (brain_subregions, target_tissues, etc.)
// instead of a bespoke table. A new category only needs an entry here.
const BRAIN_FINDING_CATEGORIES = [
    { key: 'developmental_neuropathology', label: 'Developmental' },
    { key: 'infectious_neuropathology', label: 'Infectious' },
    { key: 'inflammatory_neuropathology', label: 'Inflammatory' },
    { key: 'neoplastic_neuropathology', label: 'Neoplastic' },
    { key: 'tbi_neuropathology', label: 'Traumatic Brain Injury' },
    { key: 'vascular_neuropathology', label: 'Vascular' },
    { key: 'neurodegenerative_neuropathology', label: 'Neurodegenerative' },
    { key: 'metabolic_neuropathology', label: 'Metabolic' },
    { key: 'artifacts', label: 'Artifacts' },
    { key: 'other_pathology', label: 'Other' },
];

// Numeric-scale scores -- rendered as a filled meter (value / max), one tile
// per field. A field with no value set is skipped entirely rather than
// shown as an empty "-" tile (see ScoreTile).
const BRAIN_NUMERIC_SCORE_FIELDS = [
    { key: 'abc_score_A', label: 'ABC Score A', max: 3 },
    { key: 'abc_score_B', label: 'ABC Score B', max: 3 },
    { key: 'abc_score_C', label: 'ABC Score C', max: 3 },
    { key: 'cerad_score', label: 'CERAD', max: 100 },
    { key: 'braak_pd', label: 'Braak PD', max: 6 },
    { key: 'thal', label: 'Thal', max: 5 },
    { key: 'caa_vonsattel', label: 'CAA VonSattel', max: 4 },
    { key: 'mckeith', label: 'McKeith', max: 4 },
    { key: 'vonsattel_hd', label: "VonSattel (Huntington's)", max: 4 },
];

// Ordered-stage scores (no numeric scale of their own) -- rendered as a dot
// stepper against their own enum, in schema order (schemas/brain_pathology_report.json).
const BRAIN_STAGE_SCORE_FIELDS = [
    {
        key: 'ad_neuropathologic_change_level',
        label: 'AD Neuropathologic Change',
        steps: ['None', 'Low', 'Intermediate', 'High'],
    },
    {
        key: 'small_vessel_disease',
        label: 'Small Vessel Disease',
        steps: ['None', 'Mild', 'Moderate', 'Severe'],
    },
    {
        key: 'braak_and_braak_ad',
        label: 'Braak & Braak AD',
        steps: ['0', 'I', 'II', 'III', 'IV', 'V', 'VI'],
    },
];

/** Turns the flat `<category>_present`/`<category>_description` field pairs
 * on a BrainPathologyReport into the same {label, present, description}
 * entry shape FindingsCardGroup expects for a real array field. */
const toBrainFindingEntries = (context) =>
    BRAIN_FINDING_CATEGORIES.filter(
        ({ key }) =>
            typeof context[`${key}_present`] !== 'undefined' ||
            typeof context[`${key}_description`] !== 'undefined'
    ).map(({ key, label }) => {
        return {
            label,
            present: context[`${key}_present`],
            description: context[`${key}_description`],
        };
    });

/**
 * Datum whose value can be a *list* of linked items (e.g. `tissue_samples`,
 * `histology_images`) rather than one scalar -- unlike TissueDatum (which
 * joins arrays into a plain comma string via getDisplayText), each entry
 * here renders as its own icon-chip, linked when it carries an `@id`, so a
 * multi-value linkTo field reads as a set of distinct records rather than a
 * run-on line of plain text links.
 */
const LinkListDatum = ({ title, items = [], icon = 'icon-link' }) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return (
        <div className="datum">
            <div className="datum-title">{title}</div>
            <div className="datum-value">
                {list.length === 0 ? (
                    '-'
                ) : (
                    <div className="pathology-link-chip-list">
                        {list.map((item, i) => {
                            const href = item?.['@id'] || null;
                            const label = getDisplayText(item);
                            const Tag = href ? 'a' : 'span';
                            return (
                                <Tag
                                    className="pathology-link-chip"
                                    href={href || undefined}
                                    key={href || i}>
                                    <i className={`icon ${icon} fas`} />
                                    <span>{label}</span>
                                </Tag>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

/** A single "<value> / <max>" meter tile -- skipped entirely (returns null)
 * when this report doesn't carry a value for it, so an unpopulated score
 * doesn't render as visual noise (a bare "-"). */
const ScoreTile = ({ label, value, max }) => {
    if (typeof value !== 'number') return null;
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return (
        <div className="score-tile">
            <div className="score-tile-label">{label}</div>
            <div className="score-tile-value">
                {value}
                <span className="score-tile-max">/{max}</span>
            </div>
            <div className="score-tile-meter">
                <div
                    className="score-tile-meter-fill"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
};

/** A staged/enum score tile (e.g. None/Mild/Moderate/Severe) rendered as a
 * dot stepper against its own vocabulary rather than a numeric meter, since
 * these fields have no shared numeric scale. Skipped when unset. */
const StageScoreTile = ({ label, value, steps }) => {
    if (!value) return null;
    const activeIndex = steps.indexOf(value);
    return (
        <div className="score-tile">
            <div className="score-tile-label">{label}</div>
            <div className="score-tile-value">{value}</div>
            <div className="score-tile-dots">
                {steps.map((step, i) => (
                    <span
                        key={step}
                        className={
                            'score-tile-dot' +
                            (activeIndex >= 0 && i <= activeIndex
                                ? ' is-filled'
                                : '')
                        }
                        title={step}
                    />
                ))}
            </div>
        </div>
    );
};

/** Inline "<label> [====    ] value/max" meter used inside a
 * FindingsCardGroup entry card (e.g. a subregion or target tissue's own
 * autolysis score) -- same fill mechanics as ScoreTile's meter, just
 * without the standalone tile chrome. */
const InlineMeter = ({ label, value, max }) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return (
        <div className="finding-entry-meter">
            <span className="finding-entry-meter-label">{label}</span>
            <div className="score-tile-meter">
                <div
                    className="score-tile-meter-fill"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="finding-entry-meter-value">
                {value}/{max}
            </span>
        </div>
    );
};

/**
 * Generic present/absent card renderer -- the one pattern every one of a
 * report's multi-value fields (brain_subregions, target_tissues,
 * non_target_tissues, pathologic_findings) and the brain finding-category
 * fields all share underneath their differing field names: some entries are
 * "Yes" (worth a reader's attention) and the rest are "No" (worth
 * confirming were checked, not worth a full row each). Present entries get
 * their own card with whatever detail they carry; absent entries collapse
 * into one line of muted chips, and an all-absent field collapses further
 * to a single reassuring "None observed" line -- so a report with mostly
 * negative findings reads as mostly *quiet*, not as a wall of repeated "No"s.
 */
const FindingsCardGroup = ({
    title,
    entries,
    labelKey = 'label',
    presentKey = 'present',
    descriptionKey = 'description',
    percentageKey = null,
    autolysisKey = null,
    autolysisMax = 3,
}) => {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const present = entries.filter((e) => e[presentKey] === 'Yes');
    const absent = entries.filter((e) => e[presentKey] !== 'Yes');

    return (
        <div className="pathology-findings-card">
            <div className="header">
                <span className="header-text">{title}</span>
                {present.length > 0 ? (
                    <span className="header-count">
                        {present.length} present
                    </span>
                ) : null}
            </div>
            <div className="body">
                {present.length > 0 ? (
                    <div className="findings-present-grid">
                        {present.map((entry, i) => {
                            const hasPercentage = Boolean(
                                percentageKey && entry[percentageKey]
                            );
                            const hasAutolysisScore =
                                autolysisKey &&
                                typeof entry[autolysisKey] === 'number';
                            const hasDescription = Boolean(
                                descriptionKey && entry[descriptionKey]
                            );
                            return (
                                <div className="finding-entry" key={i}>
                                    <div className="finding-entry-icon">
                                        <i className="icon icon-exclamation-triangle fas" />
                                    </div>
                                    <div className="finding-entry-body">
                                        <div className="finding-entry-label">
                                            <span>
                                                {getDisplayText(
                                                    entry[labelKey]
                                                )}
                                            </span>
                                            {hasPercentage ? (
                                                <span className="finding-entry-percentage">
                                                    {getDisplayText(
                                                        entry[percentageKey]
                                                    )}
                                                </span>
                                            ) : null}
                                        </div>
                                        {hasAutolysisScore ? (
                                            <InlineMeter
                                                label="Autolysis"
                                                value={entry[autolysisKey]}
                                                max={autolysisMax}
                                            />
                                        ) : null}
                                        {hasDescription ? (
                                            <div className="finding-entry-description">
                                                {entry[descriptionKey]}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="findings-none-observed">
                        <i className="icon icon-check-circle fas" />
                        <span>None observed</span>
                    </div>
                )}
                {absent.length > 0 ? (
                    <div className="findings-absent-row">
                        <span className="findings-absent-label">
                            Not present
                        </span>
                        <div className="findings-absent-chips">
                            {absent.map((entry, i) => (
                                <span className="finding-chip" key={i}>
                                    {getDisplayText(entry[labelKey])}
                                    <span className="finding-chip-value">
                                        {getDisplayText(entry[presentKey])}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

const PathologyReportViewTitle = ({ context }) => {
    const { tissue_name, accession } = context;
    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Pathology Reports' },
        { display_title: tissue_name || accession || 'Report' },
    ];
    return (
        <div className="view-title container-wide">
            <nav className="view-title-navigation">
                <ul className="breadcrumb-list">
                    {breadcrumbs.map(({ display_title, href }, i, arr) => (
                        <li className="breadcrumb-list-item" key={i}>
                            <a
                                className={
                                    'breadcrumb-list-item-link link-underline-hover' +
                                    (href ? '' : ' no-link')
                                }
                                href={href}>
                                {display_title}
                            </a>
                            {i < arr.length - 1 ? (
                                <i className="icon icon-fw icon-angle-right fas"></i>
                            ) : null}
                        </li>
                    ))}
                </ul>
            </nav>
            <h1 className="view-title-text">Pathology Report</h1>
        </div>
    );
};

const PathologyReportOverview = React.memo(function PathologyReportOverview({
    context = {},
}) {
    const {
        '@type': atType = [],
        accession,
        submitted_id,
        status,
        date_created,
        last_modified,
        description,
        tissue_name,
        outcome,
        is_indeterminate,
        final_review_determination,
        unacceptable_description,
        additional_notes,
        tissue_samples = [],
        tissue_autolysis_score,
        anatomical_sample_location,
        brain_subregions = [],
        target_tissues = [],
        non_target_tissues = [],
        pathologic_findings = [],
        final_neuropathological_diagnosis,
        histology_images = [],
    } = context;
    const additionalStainingPerformed =
        context['additional_age-related_staining_performed'];

    const isBrain = atType.includes('BrainPathologyReport');
    const isNonBrain = atType.includes('NonBrainPathologyReport');
    const reportTypeTitle = isBrain
        ? 'Brain Pathology Report'
        : isNonBrain
            ? 'Non-Brain Pathology Report'
            : 'Pathology Report';
    const outcomeClass =
        outcome === 'Acceptable'
            ? 'is-acceptable'
            : outcome === 'Unacceptable'
                ? 'is-unacceptable'
                : '';

    const brainFindingEntries = isBrain ? toBrainFindingEntries(context) : [];
    const populatedNumericScores = isBrain
        ? BRAIN_NUMERIC_SCORE_FIELDS.filter(
            ({ key }) => typeof context[key] === 'number'
        )
        : [];
    const populatedStageScores = isBrain
        ? BRAIN_STAGE_SCORE_FIELDS.filter(({ key }) => !!context[key])
        : [];
    const hasAnyScore =
        populatedNumericScores.length > 0 || populatedStageScores.length > 0;

    return (
        <div className="pathology-report-view">
            <PathologyReportViewTitle context={context} />
            <div className="view-content">
                <div className="pathology-report-paper">
                    <div className="pathology-summary-header">
                        <div className="pathology-summary-header-icon">
                            <i className="icon icon-microscope fas"></i>
                        </div>
                        <div className="pathology-summary-header-content">
                            <h1 className="header-text fw-semibold">
                                {reportTypeTitle}
                                {tissue_name ? `: ${tissue_name}` : ''}
                            </h1>
                            <div className="pathology-summary-header-notes">
                                {submitted_id ? (
                                    <span className="notes-item">
                                        <span className="notes-label">
                                            Submitted ID
                                        </span>
                                        <span className="notes-value">
                                            {submitted_id}
                                        </span>
                                    </span>
                                ) : null}
                                {accession ? (
                                    <span className="notes-item">
                                        <span className="notes-label">
                                            Accession
                                        </span>
                                        <span className="notes-value">
                                            {accession}
                                        </span>
                                    </span>
                                ) : null}
                                {status ? (
                                    <span className="notes-item">
                                        <span className="notes-label">
                                            Status
                                        </span>
                                        <span className="notes-value text-capitalize">
                                            {status}
                                        </span>
                                    </span>
                                ) : null}
                                {outcome ? (
                                    <span
                                        className={
                                            'pathology-outcome-badge ' +
                                            outcomeClass
                                        }>
                                        {outcome}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="pathology-summary-card is-primary">
                        <div className="header">
                            <span className="header-text">Report Summary</span>
                        </div>
                        <div className="body">
                            <div className="pathology-summary-grid">
                                <TissueDatum
                                    title="Tissue Name"
                                    value={tissue_name}
                                />
                                {isNonBrain ? (
                                    <TissueDatum
                                        title="Anatomical Sample Location"
                                        value={anatomical_sample_location}
                                    />
                                ) : null}
                                <TissueDatum title="Outcome" value={outcome} />
                                <TissueDatum
                                    title="Is Indeterminate"
                                    value={is_indeterminate}
                                />
                                <TissueDatum
                                    title="Final Review Determination"
                                    value={final_review_determination}
                                />
                                {isNonBrain ? (
                                    <TissueDatum
                                        title="Tissue Autolysis Score"
                                        value={getDisplayText(
                                            tissue_autolysis_score
                                        )}
                                    />
                                ) : null}
                                {isBrain ? (
                                    <TissueDatum
                                        title="Additional Staining Performed"
                                        value={additionalStainingPerformed}
                                    />
                                ) : null}
                            </div>
                            <LinkListDatum
                                title="Tissue Samples"
                                items={tissue_samples}
                                icon="icon-vial"
                            />
                            <LinkListDatum
                                title="Histology Images"
                                items={histology_images}
                                icon="icon-images"
                            />
                            {unacceptable_description ? (
                                <div className="datum">
                                    <div className="datum-title">
                                        Unacceptable Description
                                    </div>
                                    <div className="datum-value">
                                        {unacceptable_description}
                                    </div>
                                </div>
                            ) : null}
                            {additional_notes ? (
                                <div className="datum">
                                    <div className="datum-title">
                                        Additional Notes
                                    </div>
                                    <div className="datum-value">
                                        {additional_notes}
                                    </div>
                                </div>
                            ) : null}
                            {description ? (
                                <div className="datum">
                                    <div className="datum-title">
                                        Description
                                    </div>
                                    <div className="datum-value">
                                        {description}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {isBrain && final_neuropathological_diagnosis ? (
                        <div className="pathology-diagnosis-callout">
                            <div className="pathology-diagnosis-callout-label">
                                Final Neuropathological Diagnosis
                            </div>
                            <div className="pathology-diagnosis-callout-text">
                                {final_neuropathological_diagnosis}
                            </div>
                        </div>
                    ) : null}

                    {isBrain ? (
                        <FindingsCardGroup
                            title="Neuropathological Findings"
                            entries={brainFindingEntries}
                        />
                    ) : null}

                    {isNonBrain ? (
                        <FindingsCardGroup
                            title="Pathologic Findings"
                            entries={pathologic_findings}
                            labelKey="finding_type"
                            presentKey="finding_present"
                            descriptionKey="finding_description"
                            percentageKey="finding_percentage"
                        />
                    ) : null}

                    {isBrain ? (
                        <FindingsCardGroup
                            title="Brain Subregions"
                            entries={brain_subregions}
                            labelKey="subregion"
                            presentKey="is_present"
                            descriptionKey={null}
                            autolysisKey="tissue_autolysis_score"
                        />
                    ) : null}

                    {isNonBrain ? (
                        <>
                            <FindingsCardGroup
                                title="Target Tissues"
                                entries={target_tissues}
                                labelKey="target_tissue_subtype"
                                presentKey="target_tissue_present"
                                descriptionKey={null}
                                percentageKey="target_tissue_percentage"
                                autolysisKey="target_tissue_autolysis_score"
                            />
                            <FindingsCardGroup
                                title="Non-Target Tissues"
                                entries={non_target_tissues}
                                labelKey="non_target_tissue_subtype"
                                presentKey="non_target_tissue_present"
                                descriptionKey="non_target_tissue_description"
                                percentageKey="non_target_tissue_percentage"
                            />
                        </>
                    ) : null}

                    {isBrain && hasAnyScore ? (
                        <div className="pathology-summary-card">
                            <div className="header">
                                <span className="header-text">
                                    Neuropathological Scores
                                </span>
                            </div>
                            <div className="body">
                                <div className="score-tile-grid">
                                    {populatedNumericScores.map(
                                        ({ key, label, max }) => (
                                            <ScoreTile
                                                key={key}
                                                label={label}
                                                value={context[key]}
                                                max={max}
                                            />
                                        )
                                    )}
                                    {populatedStageScores.map(
                                        ({ key, label, steps }) => (
                                            <StageScoreTile
                                                key={key}
                                                label={label}
                                                value={context[key]}
                                                steps={steps}
                                            />
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {date_created || last_modified?.date_modified ? (
                        <div className="pathology-report-recordinfo">
                            {date_created ? (
                                <span>
                                    Record created{' '}
                                    <LocalizedTime
                                        timestamp={date_created}
                                        formatType="date-time-md"
                                        dateTimeSeparator=" - "
                                    />
                                </span>
                            ) : null}
                            {last_modified?.date_modified ? (
                                <span>
                                    Last modified{' '}
                                    <LocalizedTime
                                        timestamp={last_modified.date_modified}
                                        formatType="date-time-md"
                                        dateTimeSeparator=" - "
                                    />
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
});

PathologyReportOverview.getTabObject = function (props) {
    return {
        tab: <span>Pathology Report</span>,
        key: 'pathology-report-overview',
        content: <PathologyReportOverview {...props} />,
    };
};

export default class PathologyReportView extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(PathologyReportOverview.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs());
    }
}
