'use strict';

import React from 'react';
import { LocalizedTime } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import DefaultItemView from './DefaultItemView';

// Kept local (not imported from a shared helpers module) so this view has
// no dependency outside item-pages/ -- lets the whole report page move as
// one self-contained unit.
const getDisplayText = (value) => {
    if (value === null || typeof value === 'undefined' || value === '') {
        return '-';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '-';
        return value.join(', ');
    }
    if (typeof value === 'number') {
        return String(value);
    }
    if (typeof value === 'object') {
        if (value.display_title) return value.display_title;
        if (value.title) return value.title;
        if (value['@id']) return value['@id'];
    }
    return String(value);
};

/** Plain label/value pair, rendered into the `.pathology-summary-grid`'s
 * shared grid tracks (see _report.scss's `display: contents` trick) or, for
 * a full-width row, into `.pathology-summary-card > .body > .datum`. */
const ReportDatum = ({ title, value }) => {
    const text = getDisplayText(value);
    return (
        <div className="datum">
            <span className="datum-title">{title}</span>
            <span className="datum-value">{text}</span>
        </div>
    );
};

/** Free-text note field (`unacceptable_description`, `additional_notes`,
 * `description`) -- given its own quiet boxed card instead of the plain
 * label/value row every other Report Summary field uses, since these carry
 * actual clinical prose that otherwise reads as just another list row and
 * is easy to skim past. */
const NoteDatum = ({ title, text }) => (
    <div className="pathology-note-datum">
        <div className="pathology-note-datum-label">
            <i className="icon icon-sticky-note fas" />
            {title}
        </div>
        <div className="pathology-note-datum-text">{text}</div>
    </div>
);

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
// shown as an empty "-" tile (see ScoreTile). `hint` is each field's own
// schema `description` (schemas/brain_pathology_report.json), surfaced as a
// caption so the meter is legible to a reader unfamiliar with the specific
// staging system, not just to someone who already knows what "ABC Score A"
// or "CERAD" means.
const BRAIN_NUMERIC_SCORE_FIELDS = [
    {
        key: 'abc_score_A',
        label: 'ABC Score A',
        max: 3,
        hint: 'Distribution of Aβ/amyloid plaques. 0 = none, 3 = severe.',
    },
    {
        key: 'abc_score_B',
        label: 'ABC Score B',
        max: 3,
        hint: 'Distribution of neurofibrillary tangles. 0 = none, 3 = severe.',
    },
    {
        key: 'abc_score_C',
        label: 'ABC Score C',
        max: 3,
        hint: 'Density of neuritic plaques. 0 = none, 1 = sparse, 2 = moderate, 3 = frequent.',
    },
    {
        key: 'cerad_score',
        label: 'CERAD',
        max: 100,
        hint: 'Consortium to Establish a Registry for Alzheimer’s Disease score of neuritic plaques. Higher values indicate greater plaque density.',
    },
    {
        key: 'braak_pd',
        label: 'Braak PD',
        max: 6,
        hint: "Braak staging of Parkinson's disease. Stage 0 = none, stage 6 = most widespread (neocortical) involvement.",
    },
    {
        key: 'thal',
        label: 'Thal',
        max: 5,
        hint: 'Thal phase of amyloid deposits by anti-Aβ immunohistochemistry. Phase 0 = no deposits, phase 5 = most widespread.',
    },
    {
        key: 'caa_vonsattel',
        label: 'CAA VonSattel',
        max: 4,
        hint: 'Cerebral amyloid angiopathy, VonSattel system. 0 = none, 1 = mild, 2 = moderate, 3–4 = severe.',
    },
    {
        key: 'mckeith',
        label: 'McKeith',
        max: 4,
        hint: 'McKeith staging system for Lewy body dementia. Higher score indicates more widespread Lewy body pathology.',
    },
    {
        key: 'vonsattel_hd',
        label: "VonSattel (Huntington's)",
        max: 4,
        hint: "VonSattel grading system for Huntington's disease. Grade 0 = no abnormality, grade 4 = severe striatal atrophy.",
    },
];

// Ordered-stage scores (no numeric scale of their own) -- rendered as a
// meter filled to the value's step position within its own enum, in schema
// order (schemas/brain_pathology_report.json). See StageScoreTile.
const BRAIN_STAGE_SCORE_FIELDS = [
    {
        key: 'ad_neuropathologic_change_level',
        label: 'AD Neuropathologic Change',
        steps: ['None', 'Low', 'Intermediate', 'High'],
        hint: 'Amount of Alzheimer’s disease-related neuropathologic change observed, on a None–Low–Intermediate–High scale.',
    },
    {
        key: 'small_vessel_disease',
        label: 'Small Vessel Disease',
        steps: ['None', 'Mild', 'Moderate', 'Severe'],
        hint: 'Amount of small vessel disease observed, on a None–Mild–Moderate–Severe scale.',
    },
    {
        key: 'braak_and_braak_ad',
        label: 'Braak & Braak AD',
        steps: ['0', 'I', 'II', 'III', 'IV', 'V', 'VI'],
        hint: 'Distribution and severity of neurofibrillary tangle (NFT) pathology. Stage 0 = none, stage VI = most severe (isocortical) involvement.',
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
 * `histology_images`) rather than one scalar -- unlike ReportDatum (which
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
 * doesn't render as visual noise (a bare "-"). `hint` (the field's own
 * schema description) is printed as a caption so the meter reads as a
 * fast-scan layer over the score's real, citable definition rather than
 * replacing it -- see BRAIN_NUMERIC_SCORE_FIELDS. */
const ScoreTile = ({ label, value, max, hint }) => {
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
            {hint ? <div className="score-tile-hint">{hint}</div> : null}
        </div>
    );
};

/** A staged/enum score tile (e.g. None/Mild/Moderate/Severe) -- filled
 * against its own vocabulary's step position rather than a numeric max, but
 * through the exact same meter markup/style as ScoreTile (not a dot
 * stepper) so every tile in the Neuropathological Scores grid reads as one
 * visual language rather than two. Skipped when unset. Carries the same
 * `hint` caption as ScoreTile, for the same reason. */
const StageScoreTile = ({ label, value, steps, hint }) => {
    if (!value) return null;
    const activeIndex = steps.indexOf(value);
    const pct =
        activeIndex >= 0
            ? Math.max(
                0,
                Math.min(100, ((activeIndex + 1) / steps.length) * 100)
            )
            : 0;
    return (
        <div className="score-tile">
            <div className="score-tile-label">{label}</div>
            <div className="score-tile-value">{value}</div>
            <div className="score-tile-meter">
                <div
                    className="score-tile-meter-fill"
                    style={{ width: `${pct}%` }}
                />
            </div>
            {hint ? <div className="score-tile-hint">{hint}</div> : null}
        </div>
    );
};

// Standard scale for `tissue_autolysis_score`/`target_tissue_autolysis_score`
// (mixins.json / non_brain_pathology_report.json) -- the only field
// InlineMeter is ever used for, so it's hardcoded here rather than threaded
// through as a prop from every call site.
const AUTOLYSIS_SCALE_HINT =
    'Tissue autolysis score. 0 = none, 1 = mild, 2 = moderate, 3 = severe.';

/** Inline "<label> [====    ] value/max" meter used inside a
 * FindingsCardGroup entry card (e.g. a subregion or target tissue's own
 * autolysis score) -- same fill mechanics as ScoreTile's meter, just
 * without the standalone tile chrome. The label carries the scale's own
 * definition as a tooltip, via the app's shared `react-tooltip` instance
 * (mounted once in app.js, picked up by any `data-tip` element -- see
 * DefaultItemView.js's identical pattern) rather than the native `title`
 * attribute, whose OS-level hover delay reads as sluggish. */
const InlineMeter = ({ label, value, max }) => {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return (
        <div className="finding-entry-meter">
            <span
                className="finding-entry-meter-label"
                data-tip={AUTOLYSIS_SCALE_HINT}>
                {label}
                <i className="icon icon-info-circle fas" />
            </span>
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
 * "Yes" and the rest are "No" (worth confirming were checked, not worth a
 * full row each). Present entries get their own card with whatever detail
 * they carry; absent entries collapse into one line of muted chips, and an
 * all-absent field collapses further to a single reassuring "None observed"
 * line -- so a report with mostly negative entries reads as mostly *quiet*,
 * not as a wall of repeated "No"s.
 *
 * `tone` controls whether "present" is flagged as something to notice
 * (`"finding"`, the default -- an unexpected/pathologic finding actually was
 * observed, e.g. Neuropathological Findings, Pathologic Findings,
 * Non-Target Tissues) or is just expected inventory (`"neutral"` -- e.g.
 * Brain Subregions being present, or a Target Tissue subtype being present,
 * are the *normal*, desired case, not something to flag). Reusing the amber
 * warning-triangle treatment for the neutral case would read as "5 things
 * are wrong" when it actually means "5 regions were accounted for".
 */
const FindingsCardGroup = ({
    title,
    entries,
    labelKey = 'label',
    presentKey = 'present',
    descriptionKey = 'description',
    percentageKey = null,
    percentageHint = 'Percentage of the sample this occupied.',
    autolysisKey = null,
    autolysisMax = 3,
    tone = 'finding',
}) => {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const present = entries.filter((e) => e[presentKey] === 'Yes');
    const absent = entries.filter((e) => e[presentKey] !== 'Yes');
    const isNeutral = tone === 'neutral';

    return (
        <div
            className={
                'pathology-findings-card' + (isNeutral ? ' is-neutral' : '')
            }>
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
                                    <div
                                        className="finding-entry-icon"
                                        data-tip={
                                            isNeutral
                                                ? undefined
                                                : 'Documented finding, present in this sample -- see description'
                                        }>
                                        <i
                                            className={
                                                'icon fas ' +
                                                (isNeutral
                                                    ? 'icon-check-circle'
                                                    : 'icon-exclamation-triangle')
                                            }
                                        />
                                    </div>
                                    <div className="finding-entry-body">
                                        <div className="finding-entry-label">
                                            <span>
                                                {getDisplayText(
                                                    entry[labelKey]
                                                )}
                                            </span>
                                            {hasPercentage ? (
                                                <span
                                                    className="finding-entry-percentage"
                                                    data-tip={percentageHint}>
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
    // A brain report's `tissue_name` is always literally "Brain" (schema
    // enum), so appending it after "Brain Pathology Report" only ever
    // repeats a word already in the title -- suppressed there. Non-brain
    // reports vary (Liver, Lung, Skin, ...), so the suffix carries real
    // information for them.
    const titleSuffix = !isBrain && tissue_name ? `: ${tissue_name}` : '';
    const headerIcon = isBrain ? 'icon-brain' : 'icon-file-medical-alt';
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
                            <i className={`icon ${headerIcon} fas`}></i>
                        </div>
                        <div className="pathology-summary-header-content">
                            <h1 className="header-text fw-semibold">
                                {reportTypeTitle}
                                {titleSuffix}
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
                                <ReportDatum
                                    title="Tissue Name"
                                    value={tissue_name}
                                />
                                {isNonBrain ? (
                                    <ReportDatum
                                        title="Anatomical Sample Location"
                                        value={anatomical_sample_location}
                                    />
                                ) : null}
                                <ReportDatum title="Outcome" value={outcome} />
                                <ReportDatum
                                    title="Is Indeterminate"
                                    value={is_indeterminate}
                                />
                                <ReportDatum
                                    title="Final Review Determination"
                                    value={final_review_determination}
                                />
                                {isNonBrain ? (
                                    <ReportDatum
                                        title="Tissue Autolysis Score"
                                        value={getDisplayText(
                                            tissue_autolysis_score
                                        )}
                                    />
                                ) : null}
                                {isBrain ? (
                                    <ReportDatum
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
                                <NoteDatum
                                    title="Unacceptable Description"
                                    text={unacceptable_description}
                                />
                            ) : null}
                            {additional_notes ? (
                                <NoteDatum
                                    title="Additional Notes"
                                    text={additional_notes}
                                />
                            ) : null}
                            {description ? (
                                <NoteDatum
                                    title="Description"
                                    text={description}
                                />
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
                            percentageHint="Percentage range of the sample displaying this finding."
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
                            tone="neutral"
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
                                percentageHint="Percentage range of the sample composed of this target tissue subtype."
                                autolysisKey="target_tissue_autolysis_score"
                                tone="neutral"
                            />
                            <FindingsCardGroup
                                title="Non-Target Tissues"
                                entries={non_target_tissues}
                                labelKey="non_target_tissue_subtype"
                                presentKey="non_target_tissue_present"
                                descriptionKey="non_target_tissue_description"
                                percentageKey="non_target_tissue_percentage"
                                percentageHint="Percentage range of the sample composed of this non-target tissue subtype."
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
                                        ({ key, label, max, hint }) => (
                                            <ScoreTile
                                                key={key}
                                                label={label}
                                                value={context[key]}
                                                max={max}
                                                hint={hint}
                                            />
                                        )
                                    )}
                                    {populatedStageScores.map(
                                        ({ key, label, steps, hint }) => (
                                            <StageScoreTile
                                                key={key}
                                                label={label}
                                                value={context[key]}
                                                steps={steps}
                                                hint={hint}
                                            />
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : null}

                    {date_created ? (
                        <div className="pathology-report-recordinfo">
                            <span>
                                Created{' '}
                                <LocalizedTime
                                    timestamp={date_created}
                                    formatType="date-md"
                                />
                            </span>
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
