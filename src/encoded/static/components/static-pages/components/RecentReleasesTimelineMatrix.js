import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { ajax, console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import DataMatrix from '../../viz/Matrix/DataMatrix';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RECENT_MONTHS = 6;

const formatMonthLabel = (monthValue = '') => {
    const parsed = new Date(`${monthValue}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return monthValue;
    }
    return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatDayParts = (dayValue = '') => {
    const parsed = new Date(`${dayValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return {
            dayNumber: dayValue,
            weekdayShort: '',
            fullLabel: dayValue
        };
    }
    return {
        dayNumber: parsed.toLocaleDateString('en-US', { day: '2-digit' }),
        weekdayShort: parsed.toLocaleDateString('en-US', { weekday: 'short' }),
        fullLabel: parsed.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })
    };
};

const buildMatrixQueryFromBrowseQuery = (browseQuery = '') => {
    const [path, queryString = ''] = String(browseQuery).split('?');
    if (!path || !queryString) {
        return '/data_matrix_aggregations/?type=File&limit=all';
    }
    const queryParams = new URLSearchParams(queryString);
    if (!queryParams.get('limit')) {
        queryParams.set('limit', 'all');
    }
    return `/data_matrix_aggregations/?${queryParams.toString()}`;
};

const normalizeData = (items = []) => (
    (items || [])
        .map((monthItem = {}) => {
            const monthValue = monthItem.value;
            const days = (monthItem.items || [])
                .map((dayItem = {}) => {
                    const dayValue = dayItem.value;
                    const dayParts = formatDayParts(dayValue);
                    return {
                        key: dayValue,
                        value: dayValue,
                        count: dayItem.count || 0,
                        browseQuery: dayItem.query || null,
                        matrixQuery: buildMatrixQueryFromBrowseQuery(dayItem.query || ''),
                        ...dayParts
                    };
                })
                .sort((a, b) => String(b.value).localeCompare(String(a.value)));
            return {
                key: monthValue,
                value: monthValue,
                label: formatMonthLabel(monthValue),
                count: monthItem.count || 0,
                days
            };
        })
        .sort((a, b) => String(b.value).localeCompare(String(a.value)))
);

const getMonthKey = (dateObj = new Date()) => {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

const addMonthOffset = (monthKey = '', offset = 0) => {
    const [yearStr, monthStr] = String(monthKey).split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    if (!year || !month) return monthKey;
    const shifted = new Date(year, month - 1 + offset, 1);
    return getMonthKey(shifted);
};

const withEmptyMonths = (normalizedMonths = [], nmonths = RECENT_MONTHS) => {
    const monthMap = _.indexBy(normalizedMonths, 'value');
    const currentMonthKey = getMonthKey(new Date());
    const orderedKeys = _.range(0, nmonths).map((idx) => addMonthOffset(currentMonthKey, -idx));
    return orderedKeys.map((monthKey) => {
        const existing = monthMap[monthKey];
        if (existing) return existing;
        return {
            key: monthKey,
            value: monthKey,
            label: formatMonthLabel(monthKey),
            count: 0,
            days: []
        };
    });
};

const toPadded = (value) => String(value).padStart(2, '0');

const buildCalendarCells = (monthValue = '', monthDays = []) => {
    const parsedMonth = new Date(`${monthValue}-01T00:00:00`);
    if (Number.isNaN(parsedMonth.getTime())) {
        return [];
    }

    const year = parsedMonth.getFullYear();
    const month = parsedMonth.getMonth(); // 0-indexed
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysByKey = _.indexBy(monthDays, 'key');
    const cells = [];

    for (let i = 0; i < firstWeekday; i++) {
        cells.push({ kind: 'padding', key: `${monthValue}-pad-start-${i}` });
    }

    for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
        const dayKey = `${year}-${toPadded(month + 1)}-${toPadded(dayNumber)}`;
        const data = daysByKey[dayKey] || null;
        const dayParts = formatDayParts(dayKey);
        cells.push({
            kind: 'day',
            key: dayKey,
            dayNumber,
            fullLabel: dayParts.fullLabel,
            hasData: !!data,
            count: data?.count || 0,
            data
        });
    }

    const trailingPaddingCount = (7 - (cells.length % 7)) % 7;
    for (let i = 0; i < trailingPaddingCount; i++) {
        cells.push({ kind: 'padding', key: `${monthValue}-pad-end-${i}` });
    }

    return cells;
};

const matrixQueryTemplate = {
    columnAggFields: ['assays.display_title', 'sequencers.platform'],
    rowAggFields: [
        'donors.display_title',
        'sample_summary.tissues',
        'sample_summary.category'
    ]
};

export const RecentReleasesTimelineMatrix = ({ session }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [months, setMonths] = useState([]);
    const [selectedDay, setSelectedDay] = useState(null);
    const [monthWindowStartIndex, setMonthWindowStartIndex] = useState(0);

    useEffect(() => {
        let isCancelled = false;

        setIsLoading(true);
        ajax.load(
            `/recent_files_summary?format=json&nmonths=${RECENT_MONTHS}`,
            (resp) => {
                if (isCancelled) return;
                const normalizedMonths = normalizeData(resp?.items || []);
                const monthsWithGaps = withEmptyMonths(normalizedMonths, RECENT_MONTHS);
                const firstDay = _.chain(monthsWithGaps)
                    .pluck('days')
                    .flatten()
                    .find((day) => !!day)
                    .value() || null;
                setMonths(monthsWithGaps);
                setSelectedDay(firstDay);
                setMonthWindowStartIndex(0);
                setIsLoading(false);
            },
            'GET',
            (err) => {
                if (isCancelled) return;
                if (err?.notification !== 'No results found') {
                    console.log('ERROR RecentReleasesTimelineMatrix response', err);
                }
                setMonths([]);
                setSelectedDay(null);
                setMonthWindowStartIndex(0);
                setIsLoading(false);
            }
        );

        return () => {
            isCancelled = true;
        };
    }, []);

    const selectedDayLabel = useMemo(() => selectedDay?.fullLabel || null, [selectedDay]);
    const visibleMonths = useMemo(
        () => months.slice(monthWindowStartIndex, monthWindowStartIndex + 2),
        [months, monthWindowStartIndex]
    );
    const canGoToNewerMonths = monthWindowStartIndex > 0;
    const canGoToOlderMonths = monthWindowStartIndex + 2 < months.length;

    if (isLoading) {
        return (
            <div className="recent-releases-page">
                <div className="recent-releases-loading">
                    <i className="icon fas icon-spinner icon-spin"></i>
                </div>
            </div>
        );
    }

    if (!months || months.length === 0) {
        return (
            <div className="recent-releases-page">
                <div className="recent-releases-empty alert alert-info mb-0">
                    No recently released files were found for the configured period.
                </div>
            </div>
        );
    }

    return (
        <div className="recent-releases-page">
            <div className="recent-releases-timeline-column card">
                <div className="card-body">
                    <h3 className="recent-releases-title">Recently Released Files</h3>
                    <p className="recent-releases-subtitle mb-2">
                        Select a release day to view file details in the matrix.
                    </p>
                    {months.length > 2 ? (
                        <div className="release-month-nav">
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => setMonthWindowStartIndex((idx) => Math.max(0, idx - 1))}
                                disabled={!canGoToNewerMonths}>
                                Newer
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => setMonthWindowStartIndex((idx) => Math.min(months.length - 2, idx + 1))}
                                disabled={!canGoToOlderMonths}>
                                Older
                            </button>
                        </div>
                    ) : null}
                    <div className="recent-releases-months">
                        {visibleMonths.map((month) => (
                            <section key={month.key} className="release-month-section">
                                <header className="release-month-header">
                                    <h4>{month.label}</h4>
                                    <span className="count-badge">
                                        {month.count} {month.count === 1 ? 'file' : 'files'}
                                    </span>
                                </header>
                                <div className="release-weekdays-grid">
                                    {WEEKDAY_LABELS.map((weekdayLabel) => (
                                        <span key={`${month.key}-${weekdayLabel}`} className="release-weekday-label">
                                            {weekdayLabel}
                                        </span>
                                    ))}
                                </div>
                                <div className="release-calendar-grid">
                                    {buildCalendarCells(month.value, month.days).map((cell) => {
                                        if (cell.kind === 'padding') {
                                            return <span key={cell.key} className="release-day-pad" aria-hidden="true"></span>;
                                        }
                                        const isSelected = selectedDay?.key === cell.key;
                                        const dayClasses = [
                                            'release-day-btn',
                                            cell.hasData ? 'has-data' : 'no-data',
                                            isSelected ? 'selected' : ''
                                        ].filter(Boolean).join(' ');
                                        return (
                                            <button
                                                key={cell.key}
                                                type="button"
                                                className={dayClasses}
                                                onClick={cell.hasData ? () => setSelectedDay(cell.data) : undefined}
                                                onFocus={cell.hasData ? () => setSelectedDay(cell.data) : undefined}
                                                aria-pressed={isSelected}
                                                disabled={!cell.hasData}
                                                title={cell.fullLabel}>
                                                <span className="day-num">{cell.dayNumber}</span>
                                                {cell.hasData ? (
                                                    <span className="day-count">{cell.count}</span>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </div>
            <div className="recent-releases-matrix-column card">
                <div className="card-body">
                    <div className="recent-releases-matrix-header">
                        <div>
                            <h3 className="recent-releases-title mb-0">Release Day Details</h3>
                            {selectedDayLabel ? (
                                <p className="recent-releases-subtitle mb-0">{selectedDayLabel}</p>
                            ) : null}
                        </div>
                        {selectedDay?.browseQuery ? (
                            <a href={selectedDay.browseQuery} className="btn btn-outline-primary btn-sm">
                                Browse Files
                            </a>
                        ) : null}
                    </div>
                    {selectedDay?.matrixQuery ? (
                        <div className="data-matrix-container recent-releases-matrix-scroll">
                            <DataMatrix
                                key={`recent-releases-${selectedDay.key}`}
                                session={session}
                                query={{
                                    ...matrixQueryTemplate,
                                    url: selectedDay.matrixQuery
                                }}
                                headerFor={null}
                                idLabel="recent-releases"
                                showCountFor={false}
                                showMatrixModeTabs={false}
                                showColumnSummary={false}
                                showFacetTermsPanel={false}
                                showAxisLabels={false}
                                disableConfigurator={true}
                                excludePrimaryColumnNoValue={true}
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

RecentReleasesTimelineMatrix.propTypes = {
    session: PropTypes.object
};

RecentReleasesTimelineMatrix.defaultProps = {
    session: null
};

export default React.memo(RecentReleasesTimelineMatrix, _.isEqual);
