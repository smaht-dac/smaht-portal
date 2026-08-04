'use strict';

import React, { useEffect, useMemo, useState } from 'react';
import DefaultItemView from './DefaultItemView';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BROWSE_STATUS_FILTERS } from '../browse/BrowseView';
import AliquotVisualization from './components/tissue-overview/AliquotVisualization';
import NonSolidAliquotVisualization from './components/tissue-overview/NonSolidAliquotVisualization';
import { useUserDownloadAccess } from '../util/hooks';
import { formatDonorAge } from './components/donor-overview/ProtectedDonorViewDataCards';
import { formatCoverageDisplayValue } from '../viz/Matrix/StackedBlockVisual';
import {
    getDonorHref,
    getDisplayText,
    formatYesNo,
    getAutolysisScoreCellClass,
    dedupeTissuesByDonor,
    TissueDatum,
    sampleAliquotSlicesFallback,
    getTissueKitIdFromExternalId,
    sampleNonSolidAliquots,
    getCoreWellFromExternalId,
} from './components/tissue-overview/helpers';

export default class TissueOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(TissueView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs());
    }
}

const TissueViewTitle = ({ context }) => {
    // A user reaches this page from a Browse-by-Tissue table header, i.e. by
    // tissue *type*, not by picking this one specific Tissue record -- and
    // which record actually renders here is itself a best-effort pick among
    // possibly several sharing that type (see dedupeTissuesByDonor). Showing
    // its specific instance ID (e.g. "SMHT001-3AL") in the breadcrumb would
    // overstate that certainty, so use the same descriptive tissue name the
    // page heading uses instead.
    const targetTissueValue = context?.uberon_id || context?.tissue_type || null;
    const breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Tissues' },
        { display_title: getDisplayText(targetTissueValue) },
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
            <h1 className="view-title-text">Tissue Overview</h1>
        </div>
    );
};

const TissueView = React.memo(function TissueView({ context = {}, session }) {
    const {
        display_title,
        donor,
        uberon_id,
        tissue_type,
        study,
        category,
        uuid: tissueUuid,
    } = context;
    const { userDownloadAccess } = useUserDownloadAccess(session);

    const uberonHref = uberon_id && uberon_id['@id'] ? uberon_id['@id'] : null;
    const targetTissueValue = uberon_id || tissue_type || null;
    const targetTissueHref = uberon_id ? uberonHref : null;
    const tissueProtocolCode = tissue_type ? tissue_type.split(' - ')[0].trim() : null;
    // `category` is a real backend-calculated field (item_utils/tissue.py) --
    // "Clinically Accessible" covers exactly blood and buccal swab tissues.
    // Which of the two it is isn't itself a stored field, so that part still
    // falls back to matching the tissue_type label.
    const nonSolidSpecimenType =
        category === 'Clinically Accessible'
            ? tissue_type?.toLowerCase().includes('buccal')
                ? 'buccal'
                : 'blood'
            : null;
    const tissueMatrixFilterValue = useMemo(
        () => tissue_type || uberon_id?.display_title || null,
        [tissue_type, uberon_id]
    );
    const [isLoading, setIsLoading] = useState(true);
    const [fileCount, setFileCount] = useState(0);
    const [totalCoverage, setTotalCoverage] = useState(0);
    const [donors, setDonors] = useState([]);
    // Every Tissue record sharing this tissue_type, undeduped -- unlike
    // `donors` (one representative Tissue per donor, for the summary table),
    // this keeps sibling Fixed/Frozen Tissue records together so the aliquot
    // panel can combine both into one box for a given donor.
    const [allTissuesForType, setAllTissuesForType] = useState([]);
    const [donorsLoading, setDonorsLoading] = useState(true);
    const [tissueSamples, setTissueSamples] = useState(null);
    // True only while re-fetching for an already-rendered donor switch (not
    // the initial load, which uses aliquotSamplesLoading/the spinner
    // instead) -- lets the panel hint "updating" without unmounting the
    // still-valid previous diagram.
    const [samplesUpdating, setSamplesUpdating] = useState(false);
    // Which donor's aliquot layout the visualization panel reflects. Starts
    // null and is seeded below, once `donors` loads, to the first entry in
    // that same sorted (by display_title) list the <select> below renders --
    // NOT this page's own `donor` (an arbitrary pick among possibly several
    // Tissue records sharing this tissue_type, per dedupeTissuesByDonor's
    // note), since defaulting to that would silently select an option that
    // isn't the dropdown's first/visible one.
    const [selectedDonorUuid, setSelectedDonorUuid] = useState(null);

    // Re-seeds to the sorted list's first donor whenever `donors` (re)loads,
    // unless the current selection is a user choice that's still valid in
    // the new list (e.g. donors reloaded after a session change).
    useEffect(() => {
        if (donors.length === 0) return;
        setSelectedDonorUuid((current) => {
            if (current && donors.some((entry) => entry.donor?.uuid === current)) {
                return current;
            }
            return donors[0]?.donor?.uuid || null;
        });
    }, [donors]);

    const selectedDonorEntry = useMemo(
        () => donors.find((entry) => entry.donor?.uuid === selectedDonorUuid) || null,
        [donors, selectedDonorUuid]
    );
    // A donor's Fixed and Frozen Tissue records for this tissue_type are two
    // separate items sharing one tissue_type string (confirmed against real
    // data -- see note above sampleAliquotSlicesFallback), so the aliquot
    // panel needs every sibling Tissue's uuid, not just one. Falls back to
    // this page's own Tissue while the sibling search hasn't loaded yet.
    const tissueUuidsForSelectedDonor = useMemo(() => {
        const targetDonorUuid = selectedDonorUuid || donor?.uuid;
        const matches = targetDonorUuid
            ? allTissuesForType.filter((t) => t?.donor?.uuid === targetDonorUuid)
            : [];
        if (matches.length > 0) return matches.map((t) => t.uuid);
        return tissueUuid ? [tissueUuid] : [];
    }, [allTissuesForType, selectedDonorUuid, donor, tissueUuid]);
    const selectedDonorDisplayTitle = selectedDonorEntry?.donor?.display_title || donor?.display_title;
    // Real sample IDs are "{donor}-{protocol}-{aliquot}{suffix}" (e.g.
    // "SMHT001-3I-001A1", see item_utils/tissue_sample.py's *_REGEX
    // constants) -- used only as a fallback when a slice has no real
    // external_id of its own (the illustrative demo set).
    const aliquotIdPrefix =
        selectedDonorDisplayTitle && tissueProtocolCode
            ? `${selectedDonorDisplayTitle}-${tissueProtocolCode}`
            : tissueProtocolCode;

    // The number of aliquots isn't a fixed/derivable constant (confirmed
    // against real TissueSample fixture data and PR smaht-dac/smaht-portal#728's
    // associate_fixed_samples.py, which counts real linked samples rather than
    // assuming one) -- it's whatever was actually submitted for this tissue
    // block, so it has to come from a live count of TissueSamples across
    // every sibling Tissue (Fixed + Frozen) sharing this tissue_type.
    useEffect(() => {
        // Wait for the sibling-Tissue search (donorsLoading) to finish before
        // fetching -- otherwise this fires once with just this page's own
        // Tissue uuid, renders that partial result, then fires again once
        // the sibling Fixed/Frozen Tissue is found, replacing it a moment
        // later. Both fetches were real, but the visible flash between them
        // reads as a bug, so wait for the complete uuid set instead.
        if (donorsLoading || tissueUuidsForSelectedDonor.length === 0) {
            setTissueSamples(null);
            return;
        }
        // Deliberately not resetting to null here: on the very first load
        // that's already the initial state, but on a later donor switch it
        // would blank out an already-rendered diagram (swap to spinner, then
        // swap again to the new donor's data) for no reason -- keep showing
        // the previous donor's slices until the new ones are ready, then
        // swap directly, once.
        setSamplesUpdating(true);
        const sampleSourceParams = tissueUuidsForSelectedDonor
            .map((uuid) => `sample_sources.uuid=${encodeURIComponent(uuid)}`)
            .join('&');
        ajax.load(
            `/search/?type=TissueSample&status!=deleted&${sampleSourceParams}`,
            (resp) => {
                setTissueSamples(resp?.['@graph'] || []);
                setSamplesUpdating(false);
            },
            'GET',
            () => {
                setTissueSamples([]);
                setSamplesUpdating(false);
            }
        );
    }, [tissueUuidsForSelectedDonor, donorsLoading, session]);

    // Real samples win once loaded; while loading (tissueSamples === null) or
    // if none exist yet, fall back to the illustrative demo set so the panel
    // isn't empty.
    const solidAliquotSlices = useMemo(() => {
        const realSlices = (tissueSamples || [])
            .filter((sample) => sample.preservation_type !== 'Fresh')
            .map((sample) => {
                const coreWell = getCoreWellFromExternalId(sample.external_id);
                return {
                    id: sample.uuid,
                    type: sample.preservation_type === 'Fixed' ? 'pink' : 'yellow',
                    widthCm: sample.preservation_type === 'Fixed' ? 0.5 : 1,
                    description: sample.external_id || sample.accession || undefined,
                    // This slice's own real "{donor}-{protocol}" -- Fixed and
                    // Frozen siblings have different protocol codes despite
                    // sharing one tissue_type, so each slice needs its own.
                    idPrefix: getTissueKitIdFromExternalId(sample.external_id),
                    // Explicit [] (not undefined) for a real Frozen sample with
                    // no Core suffix -- so AliquotVisualization's `|| DEFAULT`
                    // fallback (meant only for illustrative demo slices) does
                    // not kick in and invent a well this real sample doesn't have.
                    frozenCoreWells: coreWell ? [coreWell] : [],
                    // Backend-computed (types/tissue_sample.py): chains this
                    // Frozen/Fresh sample's `linked_fixed_samples` through
                    // each linked Fixed sample's own `pathology_reports`.
                    // Only Frozen/Fresh samples have this; Fixed samples
                    // never will, so this is naturally empty for pink slices.
                    associatedPathologyReports: sample.associated_pathology_reports || [],
                    // A Fixed sample's *own* pathology_reports (direct
                    // rev-link) -- this is the actual, most direct
                    // relationship; associatedPathologyReports above only
                    // exists to give Frozen/Fresh samples a path to this same
                    // data through their linked Fixed sample(s).
                    pathologyReports: sample.pathology_reports || [],
                    // The real submitting institution (e.g. "BROAD GCC",
                    // "UWSC GCC") -- shown instead of a made-up "GCC1"/"GCC2"
                    // sequence number.
                    submissionCenter: sample.submission_centers?.[0]?.display_title || null,
                };
            });
        return realSlices.length > 0 ? realSlices : sampleAliquotSlicesFallback;
    }, [tissueSamples]);

    const nonSolidAliquots = useMemo(() => {
        const realAliquots = (tissueSamples || []).map((sample) => {
            return {
                id: sample.uuid,
                description: sample.external_id || sample.accession || undefined,
                submissionCenter: sample.submission_centers?.[0]?.display_title || null,
            };
        });
        return realAliquots.length > 0 ? realAliquots : sampleNonSolidAliquots;
    }, [tissueSamples]);

    // Real data replacing the illustrative fallback mid-render is a visible
    // jump no matter how few steps it takes to get there (different slice
    // counts/colors/arrangement) -- show a spinner instead of the fallback
    // while genuinely loading, and reserve the fallback for a tissue that
    // has finished loading and truly has no TissueSamples yet.
    const aliquotSamplesLoading = donorsLoading || tissueSamples === null;

    // `session` in the dependency array (here and below) so logging in/out
    // re-fetches -- permission-filtered results can change without `href`
    // or any of this component's other inputs changing.
    useEffect(() => {
        const queryParts = [
            'type=File',
            BROWSE_STATUS_FILTERS,
            'dataset!=No+value',
            donor?.display_title
                ? `donors.display_title=${encodeURIComponent(donor.display_title)}`
                : null,
            tissueMatrixFilterValue
                ? `sample_summary.tissues=${encodeURIComponent(tissueMatrixFilterValue)}`
                : null,
            // Needed for the coverage sum below, not just the count -- `total`
            // reflects every match regardless of page size, but summing
            // `@graph` without this only sees the first page (10 by default,
            // snovault/search/search.py's PAGINATION_SIZE) and silently
            // undercounts.
            'limit=all',
        ].filter(Boolean);

        setIsLoading(true);
        ajax.load(
            `/search/?${queryParts.join('&')}`,
            (resp) => {
                setFileCount(resp?.total || 0);
                // Same semantics as DataMatrix.js's total_coverage reducers
                // and visualization.py's SUM_DATA_GENERATION_SUMMARY_AGGREGATION_DEFINITION:
                // a sum of each File's own (already-averaged) per-BAM coverage.
                const files = resp?.['@graph'] || [];
                const coverageSum = files.reduce(
                    (sum, f) => sum + (Number(f?.data_generation_summary?.average_coverage) || 0),
                    0
                );
                setTotalCoverage(coverageSum);
                setIsLoading(false);
            },
            'GET',
            () => {
                setFileCount(0);
                setTotalCoverage(0);
                setIsLoading(false);
            }
        );
    }, [donor?.display_title, tissueMatrixFilterValue, session]);

    // All donors that share this Tissue's resolved tissue_type, not just this Tissue's own donor.
    useEffect(() => {
        if (!tissueMatrixFilterValue) {
            setDonors([]);
            setDonorsLoading(false);
            return;
        }
        setDonorsLoading(true);
        ajax.load(
            // donor.study/donor.tags restrict this to the same donor
            // population Browse by Donor/Browse by File use (Production
            // study, has_released_files tag) -- see types/tissue.py's
            // embedded_list -- so this list doesn't include donors who don't
            // have released files yet (e.g. benchmarking-only donors).
            `/search/?type=Tissue&tissue_type=${encodeURIComponent(tissueMatrixFilterValue)}&donor.study=Production&donor.tags=has_released_files&limit=all`,
            (resp) => {
                const results = resp?.['@graph'] || [];
                setAllTissuesForType(results);
                setDonors(dedupeTissuesByDonor(results));
                setDonorsLoading(false);
            },
            'GET',
            () => {
                setAllTissuesForType([]);
                setDonors([]);
                setDonorsLoading(false);
            }
        );
    }, [tissueMatrixFilterValue, session]);

    const donorCount = donors.length;

    return (
        <div className="tissue-view">
            <TissueViewTitle context={context} />
            <div className="view-content">
                <div className="tissue-summary-header">
                    <div className="tissue-summary-header-icon">
                        <i className="icon icon-lungs fas"></i>
                    </div>
                    <div className="tissue-summary-header-content">
                        <h1 className="header-text fw-semibold">
                            {study ? `${study} Tissue: ` : 'Tissue: '}
                            {getDisplayText(targetTissueValue) !== '-'
                                ? getDisplayText(targetTissueValue)
                                : display_title}
                        </h1>
                        <div className="tissue-summary-header-notes">
                            <span className="notes-label">Notes</span>
                            <span className="notes-value">
                                Extended Clinical Data about this donor is available through the donor manifest
                            </span>
                        </div>
                    </div>
                </div>

                <div className="tissue-summary-row">
                    <div className="tissue-summary-card">
                        <div className="header">
                            <span className="header-text">Tissue Summary</span>
                        </div>
                        <div className="body">
                            <div className="tissue-summary-subheader">Tissue Overview</div>
                            <div className="tissue-summary-fields">
                                <div className="tissue-summary-grid">
                                    <TissueDatum
                                        title="Target Tissue"
                                        value={targetTissueValue}
                                        href={targetTissueHref}
                                    />
                                    <TissueDatum title="Non-Tissue Presence" value="Protected" />
                                    <TissueDatum title="Sex" value={donor?.sex} />
                                    <TissueDatum
                                        title="Total Coverage"
                                        value={!isLoading ? formatCoverageDisplayValue(totalCoverage).display : null}
                                    />
                                </div>
                            </div>
                            <div className="tissue-summary-stats d-flex gap-3">
                                <div className="donor-statistic donors d-flex flex-column p-2 gap-2">
                                    <div className="donor-statistic-label text-center">
                                        <i className="icon icon-lungs fas"></i>Donors
                                    </div>
                                    <div className="donor-statistic-value text-center">
                                        {!donorsLoading ? (
                                            <span>{donorCount}</span>
                                        ) : (
                                            <i className="icon icon-circle-notch icon-spin fas" />
                                        )}
                                    </div>
                                </div>
                                <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                                    <div className="donor-statistic-label text-center">
                                        <i className="icon icon-file fas"></i>Files
                                    </div>
                                    <div className="donor-statistic-value text-center">
                                        {!isLoading ? (
                                            <span>{fileCount}</span>
                                        ) : (
                                            <i className="icon icon-circle-notch icon-spin fas" />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="tissue-aliquot-card">
                        <div className="tissue-aliquot-header">
                            <span className="aliquot-title">
                                {nonSolidSpecimenType
                                    ? 'Sample non-solid aliquot layout'
                                    : 'Sample solid-organ aliquot layout'}
                            </span>
                            {donors.length > 1 ? (
                                <div className="tissue-aliquot-donor-select">
                                    <label htmlFor="tissue-aliquot-donor-select">
                                        Donor
                                    </label>
                                    <select
                                        id="tissue-aliquot-donor-select"
                                        className="form-select form-select-sm"
                                        value={selectedDonorUuid || ''}
                                        onChange={(e) => setSelectedDonorUuid(e.target.value)}>
                                        {donors.map(({ donor: d }) => (
                                            <option key={d.uuid} value={d.uuid}>
                                                {getDisplayText(d)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}
                        </div>
                        <div
                            className={
                                'tissue-aliquot-body' +
                                (samplesUpdating && !aliquotSamplesLoading ? ' is-updating' : '')
                            }>
                            {aliquotSamplesLoading ? (
                                <div className="tissue-aliquot-loading">
                                    <i className="icon icon-circle-notch icon-spin fas" />
                                </div>
                            ) : nonSolidSpecimenType ? (
                                <NonSolidAliquotVisualization
                                    aliquots={nonSolidAliquots}
                                    specimenType={nonSolidSpecimenType}
                                    idPrefix={aliquotIdPrefix}
                                />
                            ) : (
                                <AliquotVisualization
                                    slices={solidAliquotSlices}
                                    dimensions={{
                                        heightCm: 1,
                                        depthCm: 1.5,
                                        heightLabel: '1 cm',
                                        depthLabel: '1.5 cm',
                                    }}
                                    idPrefix={aliquotIdPrefix}
                                    showSliceLabels={false}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className="tissue-donor-table-card">
                    <div className="header">
                        <span className="header-text">Donor Details</span>
                    </div>
                    {/*
                        Lists every donor whose Tissue shares this Tissue's resolved tissue_type
                        (not just this Tissue's own donor). Autolysis Score, Non-Target Tissue
                        Presence, and Unexpected/Pathologic Finding come from each donor's own
                        Tissue.pathology_summary (Tissue -> TissueSample -> PathologyReport
                        rev-link chain); "-" means no pathology report covers that tissue sample.
                    */}
                    <div className="body">
                        <table className="tissue-donor-table table">
                            <thead>
                                <tr>
                                    <th>Donor ID</th>
                                    <th>Sex</th>
                                    <th>Age</th>
                                    <th>Autolysis Score</th>
                                    <th>Non-Target Tissue Presence</th>
                                    <th>Unexpected/Pathologic Finding</th>
                                    <th>Histology Viewer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {donorsLoading ? (
                                    <tr>
                                        <td colSpan={8}>
                                            <i className="icon icon-circle-notch icon-spin fas" />
                                        </td>
                                    </tr>
                                ) : donors.length > 0 ? (
                                    donors.map(({ donor: d, tissue: t }) => {
                                        const donorHref = getDonorHref(d, userDownloadAccess);
                                        const pathologySummary = t?.pathology_summary || {};
                                        const histologyImages = pathologySummary.histology_images || [];
                                        return (
                                            <tr key={d.uuid}>
                                                <td>
                                                    {donorHref ? (
                                                        <a href={donorHref}>{getDisplayText(d)}</a>
                                                    ) : (
                                                        getDisplayText(d)
                                                    )}
                                                </td>
                                                <td>{getDisplayText(d.sex)}</td>
                                                <td>{getDisplayText(formatDonorAge(d.age))}</td>
                                                <td className={getAutolysisScoreCellClass(pathologySummary.autolysis_score)}>
                                                    {getDisplayText(pathologySummary.autolysis_score)}
                                                </td>
                                                <td>{formatYesNo(pathologySummary.non_target_tissue_present)}</td>
                                                <td>{formatYesNo(pathologySummary.pathologic_finding_present)}</td>
                                                <td>
                                                    {histologyImages.length > 0 ? (
                                                        <a href={histologyImages[0]}>
                                                            View{histologyImages.length > 1 ? ` (${histologyImages.length})` : ''}
                                                        </a>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8}>No donor data available for this tissue type.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
});

TissueView.getTabObject = function (props) {
    return {
        tab: <span>Tissue Overview</span>,
        key: 'tissue-overview',
        content: <TissueView {...props} />,
    };
};
