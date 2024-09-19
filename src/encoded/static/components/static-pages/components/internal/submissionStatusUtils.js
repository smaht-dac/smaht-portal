'use strict';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import React from 'react';
import * as d3 from 'd3';

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

export const createBadge = (type, description) => {
    const cn = 'badge text-white badge-' + type;
    return <span className={cn}>{description}</span>;
};

export const createQcBadgeLink = (type, identifier, description) => {
    const cn = 'badge text-white badge-' + type;
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
                {copyBtn}
                <span className="pl-1">{qcTags}</span>
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
            return <div>{badge} / </div>;
        }
    });
};
