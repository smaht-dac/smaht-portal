'use strict';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import React from 'react';
import * as d3 from 'd3';

import {
    COVERAGE_QC_METRIC,
    EXTERNAL_RELEASE_STATUSES,
    INTERNAL_RELEASE_STATUSES,
    PAGE_SIZE,
} from './config';

export const formatDate = (date_str) => {
    if (!date_str) {
        return '';
    }
    const date_options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    };
    const date = new Date(date_str);

    return date.toLocaleDateString('en-US', date_options);
};

/**
 * Fetch items from the portal API and format them for display
 * @param {string} type - Item type to search for
 * @param {string} filter - Additional query parameters
 * @param {number} limit - Maximum number of items to return
 * @param {function} callback - Callback function to handle the results
 * @param {function} errorCallback - Error callback function
 */
export const getItemsFromPortal = (
    type,
    filter = '',
    limit = 100,
    callback,
    errorCallback = fallbackCallback
) => {
    ajax.load(
        `/search/?type=${type}${filter}&limit=${limit}`,
        (resp) => {
            const items = resp['@graph'].map((item) => ({
                title: item.display_title,
                uuid: item.uuid,
                ...item,
            }));

            items.sort((a, b) => a.title.localeCompare(b.title));
            callback(items);
        },
        'GET',
        errorCallback
    );
};

export const getSelect = (options, defaultValue, filterName, onChange) => {
    return (
        <React.Fragment>
            <select
                className="form-select"
                defaultValue={defaultValue}
                onChange={(e) => onChange(filterName, e.target.value)}>
                {options}
            </select>
        </React.Fragment>
    );
};

export const getPagination = (
    type,
    state,
    numResults,
    onChangePage,
    onRefresh
) => {
    let message = 'No results found';
    if (numResults > 0) {
        message = `Displaying ${type} ${
            state.tablePage * PAGE_SIZE + 1
        }-${Math.min(
            (state.tablePage + 1) * PAGE_SIZE,
            numResults
        )} of ${numResults}`;
    }

    const navButtons = [];
    if (
        numResults > PAGE_SIZE &&
        (state.tablePage + 1) * PAGE_SIZE <= numResults
    ) {
        navButtons.push(
            <button
                className="btn btn-primary btn-sm"
                onClick={() => onChangePage(1)}>
                Next
            </button>
        );
    }

    if (state.tablePage > 0) {
        navButtons.push(
            <button
                className="btn btn-primary btn-sm mx-2"
                onClick={() => onChangePage(-1)}>
                Previous
            </button>
        );
    }

    const syncIconClass = state.loading
        ? 'icon fas icon-spinner icon-spin'
        : 'icon fas icon-sync-alt clickable';

    return (
        <div className="d-flex flex-row-reverse">
            <div className="ms-1 ss-padding-top-3">
                <i className={syncIconClass} onClick={() => onRefresh()}></i>
            </div>
            {navButtons}
            <div className="mx-2 ss-padding-top-3">{message}</div>
        </div>
    );
};

export const getLink = (identifier, title) => {
    const href = '/' + identifier;
    return (
        <a href={href} target="_blank">
            {title}
        </a>
    );
};

export const formatQcValue = (value) => {
    if (isInteger(value)) {
        return d3.format(',')(value);
    } else if (isFloat(value)) {
        return d3.format(',.4f')(value);
    } else {
        return value;
    }
};

function isInteger(num) {
    return Number.isInteger(num);
}

function isFloat(num) {
    return Number(num) === num && num % 1 !== 0;
}

export const getStatusBadgeType = (status) => {
    let badgeType = 'warning';
    if (['open', 'protected', 'open-early', 'protected-early', 'open-network', 'protected-network'].includes(status)) {
        badgeType = 'success';
    } else if (['deleted', 'obsolete', 'retracted'].includes(status)) {
        badgeType = 'danger';
    }
    return badgeType;
}

export const createBadge = (type, description, tooltip = '') => {
    const cn = 'badge text-white bg-' + type;
    return (
        <span className={cn} data-tip={tooltip}>
            {description}
        </span>
    );
};

export const createQcBadgeLink = (type, identifier, description) => {
    const cn = 'badge text-white bg-' + type;
    const href = '/' + identifier;
    const tooltip =
        description === 'NA'
            ? 'QC available, but Overal Quality Status not assigned.'
            : 'Overal Quality Status: ' + description;
    return (
        <a className={cn} target="_blank" href={href} data-tip={tooltip}>
            {description}
        </a>
    );
};

export const createWarningIcon = () => {
    return (
        <span className="p-1 text-large text-warning">
            <i className="icon fas icon-exclamation-triangle icon-fw"></i>
        </span>
    );
};

export const fallbackCallback = (errResp, xhr) => {
    // Error callback
    console.error(errResp);
};

export const getTargetCoverage = (sequencing) => {
    let targeCoverage = <span>Target coverage: NAx</span>;
    if (sequencing?.target_coverage) {
        targeCoverage = (
            <span>
                Target coverage: <strong>{sequencing?.target_coverage}x</strong>
            </span>
        );
    } else if (sequencing?.target_read_count) {
        const readCount = d3.format(',')(sequencing?.target_read_count);
        targeCoverage = (
            <span>
                Target read count: <strong>{readCount}</strong>
            </span>
        );
    }
    return targeCoverage;
};

export const copyBtn = (accession, size = '0.875rem') => {
    return (
        <object.CopyWrapper
            value={accession}
            className=""
            data-tip={'Click to copy accession'}
            wrapperElement="span"
            iconProps={{
                style: { fontSize: size, marginLeft: 3 },
            }}></object.CopyWrapper>
    );
};

export const getQcBagdeType = (flag) => {
    let badgeType = 'secondary';
    if (flag === 'Pass') {
        badgeType = 'success';
    } else if (flag === 'Warn') {
        badgeType = 'warning';
    } else if (flag === 'Fail') {
        badgeType = 'danger';
    }
    return badgeType;
};

export const getQcResults = (qc_results, showCopyBtn = false) => {
    if (qc_results.length === 0) {
        return <div>--</div>;
    }
    return qc_results.map((qc_info) => {
        const qcTags = qc_info.quality_metrics.map((qm) => {
            const overallQualityStatus = qm.overall_quality_status;
            const qc_uuid = qm.uuid;
            const badgeType = getQcBagdeType(overallQualityStatus);
            return createQcBadgeLink(badgeType, qc_uuid, overallQualityStatus);
        });
        const href = '/' + qc_info.uuid;
        const retracted =
            qc_info.status === 'retracted' ? (
                <span className="ps-1">
                    {createBadge('danger', 'Retracted')}
                </span>
            ) : (
                ''
            );
        const copyBtn = showCopyBtn ? (
            <object.CopyWrapper
                value={qc_info.accession}
                className=""
                data-tip={'Click to copy accession'}
                wrapperElement="span"
                iconProps={{
                    style: { marginLeft: 3 },
                }}></object.CopyWrapper>
        ) : (
            ''
        );
        return (
            <div className="text-nowrap">
                <a href={href} target="_blank" data-tip={qc_info.display_title}>
                    {qc_info.accession}
                </a>
                {retracted}
                {copyBtn}
                <span className="ps-1">{qcTags}</span>
            </div>
        );
    });
};

export const getQcResultsSummary = (qc_results) => {
    const statuses = [];
    for (const qc_info of qc_results) {
        for (const qm of qc_info.quality_metrics) {
            statuses.push(qm.overall_quality_status);
        }
    }
    const unique_statuses = [...new Set(statuses)];
    unique_statuses.sort();
    if (unique_statuses.length === 0) {
        unique_statuses.push('NA');
    }
    return unique_statuses.map((status, i, unique_statuses) => {
        const badgeType = getQcBagdeType(status);
        const badge = createBadge(badgeType, status);

        if (i + 1 === unique_statuses.length) {
            return badge;
        } else {
            return <span>{badge} / </span>;
        }
    });
};

// QC flag values that are considered problematic (matches FLAG_STATES in
// src/encoded/types/quality_metric.py)
const QC_FLAG_STATES = ['Warn', 'Fail'];

/**
 * Whether a file/QC-info is still relevant for review. Retracted and deleted
 * files are ignored when deciding QC pass/fail and when building comments.
 */
export const isActiveFileStatus = (status) => {
    return status !== 'retracted' && status !== 'deleted';
};

/**
 * Index a QualityMetric's qc_values array by their derived_from id for fast lookup.
 */
export const reformatQcValues = (qcValues) => {
    const result = {};
    (qcValues ?? []).forEach((qcValue) => {
        result[qcValue.derived_from] = qcValue;
    });
    return result;
};

/**
 * Sum the group coverage (mosdepth:total) across the given processed files,
 * deduping by accession so a file with multiple QualityMetric items is not
 * counted more than once. Returns a Number, or null when no coverage metric is
 * present (distinct from a real 0). Accepts files that already carry a
 * `qc_values_dict` or raw files with `quality_metric.qc_values`.
 */
export const computeGroupCoverageNumeric = (processedFiles) => {
    const filesSeen = [];
    let coverage = 0;
    let found = false;
    for (const pf of processedFiles ?? []) {
        const qcValues =
            pf['qc_values_dict'] ?? reformatQcValues(pf.quality_metric?.qc_values);
        if (COVERAGE_QC_METRIC in qcValues) {
            // If there are multiple QM items for the same file we don't want to
            // count the coverage more than once
            if (filesSeen.includes(pf.accession)) {
                continue;
            }
            const cov = Number(qcValues[COVERAGE_QC_METRIC]['value']);
            if (Number.isNaN(cov)) {
                continue;
            }
            coverage += cov;
            filesSeen.push(pf.accession);
            found = true;
        }
    }
    return found ? coverage : null;
};

/**
 * Collect the problematic (Warn/Fail) qc_values from the given files (already
 * filtered to the relevant fileset and active statuses). Returns a flat list of
 * { accession, key, value, flag }.
 */
export const collectProblematicQcValues = (files) => {
    const problems = [];
    (files ?? []).forEach((file) => {
        (file.quality_metric?.qc_values ?? []).forEach((qv) => {
            if (QC_FLAG_STATES.includes(qv.flag)) {
                problems.push({
                    accession: file.accession,
                    key: qv.key,
                    value: qv.value,
                    flag: qv.flag,
                });
            }
        });
    });
    return problems;
};

/**
 * Coerce a qc_value value to a number, or return null when it is not numeric
 * (e.g. empty string, null, boolean, non-numeric text).
 */
const toNumberOrNull = (v) => {
    if (typeof v === 'number') {
        return Number.isNaN(v) ? null : v;
    }
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
        return Number(v);
    }
    return null;
};

/**
 * Group problematic qc_values (from collectProblematicQcValues) by metric and
 * flag, counting the number of distinct files affected. Used to collapse dozens
 * of submitted files into one line per metric. When every value in a group is
 * numeric, also returns the value range (min/max).
 * Returns { key, flag, count, numeric, min, max }[].
 */
export const groupProblematicQcByMetric = (problems) => {
    const groups = {};
    (problems ?? []).forEach((p) => {
        const groupKey = `${p.key}||${p.flag}`;
        if (!groups[groupKey]) {
            groups[groupKey] = {
                key: p.key,
                flag: p.flag,
                accessions: new Set(),
                values: [],
            };
        }
        groups[groupKey].accessions.add(p.accession);
        groups[groupKey].values.push(p.value);
    });
    return Object.values(groups).map((g) => {
        const numericValues = g.values.map(toNumberOrNull);
        const numeric =
            numericValues.length > 0 && numericValues.every((v) => v !== null);
        return {
            key: g.key,
            flag: g.flag,
            count: g.accessions.size,
            numeric,
            min: numeric ? Math.min(...numericValues) : null,
            max: numeric ? Math.max(...numericValues) : null,
        };
    });
};

export const isReleasedExternally = (status) => {
    return EXTERNAL_RELEASE_STATUSES.includes(status);
};

export const isReleasedInternally = (status) => {
    return INTERNAL_RELEASE_STATUSES.includes(status);
};

export const getCommentsList = (
    fsUuid,
    fsComments,
    isUserAdmin,
    removeCommentFct,
    prefix = ''
) => {
    if (!fsComments) {
        return;
    }
    const comments = [];
    fsComments.forEach((c) => {
        const trashSymbol = isUserAdmin ? (
            <span
                className="far icon icon-fw icon-trash-alt text-muted ps-1 clickable"
                onClick={() => removeCommentFct(fsUuid, c)}></span>
        ) : (
            ''
        );
        comments.push(
            <li className="ss-line-height-140">
                {prefix}
                <strong>{c}</strong>
                {trashSymbol}
            </li>
        );
    });

    return <ul>{comments}</ul>;
};

export function shortenStringKeepBothEnds(str, maxLength) {
    if (str.length <= maxLength) {
        return str;
    }
    const partLength = Math.floor((maxLength - 3) / 2);
    const start = str.substring(0, partLength);
    const end = str.substring(str.length - partLength);

    return start + '...' + end;
}

export const getCommentInputField = (
    fs,
    isUserAdmin,
    visibleCommentInputs,
    handlers
) => {
    const commentInputClass = visibleCommentInputs.includes(fs.uuid)
        ? 'input-group input-group-sm mb-1'
        : 'collapse';

    const commentInputField = isUserAdmin ? (
        <React.Fragment>
            <a
                href="#"
                className="link-underline-hover"
                onClick={(e) =>
                    handlers.handleToggleCommentInputField(e, fs.uuid)
                }>
                <i className="icon fas icon-plus-circle icon-fw"></i>
                Add
            </a>
            <div className={commentInputClass}>
                <input
                    type="text"
                    className="form-control"
                    placeholder="Your comment"
                    onChange={(e) =>
                        handlers.handleCommentInput(fs, e.target.value)
                    }
                />
                <div className="input-group">
                    <div className="input-group-text">
                        <i
                            className="fas icon icon-save clickable"
                            onClick={() => handlers.addComment(fs)}></i>
                    </div>
                </div>
            </div>
        </React.Fragment>
    ) : (
        ''
    );

    return (
        <li className="ss-line-height-140">Comments: {commentInputField}</li>
    );
};

export const DEFAULT_SELECT = (
    <React.Fragment>
        <select className="form-select" defaultValue="all">
            <option value="all">All</option>
        </select>
    </React.Fragment>
);
