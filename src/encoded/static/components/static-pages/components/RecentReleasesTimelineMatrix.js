import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { ajax, console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/EmbeddedSearchView';
import { SelectionItemCheckbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';
import DataMatrix from '../../viz/Matrix/DataMatrix';
import { EmbeddedItemSearchTable } from '../../item-pages/components/EmbeddedItemSearchTable';
import { SelectAllAboveTableComponent, SelectAllFilesButton } from './SelectAllAboveTableComponent';
import { createBrowseFileColumnExtensionMap } from '../../browse/BrowseView';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RECENT_MONTHS = 6;
const OLDEST_NAVIGABLE_MONTH = '2025-01';
const TIMELINE_MODES = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly'
};
const DETAIL_VIEW_MODES = {
    MATRIX: 'matrix',
    TABLE: 'table'
};
const TIMELINE_MONTH_WINDOW_SIZE = {
    [TIMELINE_MODES.DAILY]: 2,
    [TIMELINE_MODES.WEEKLY]: 3,
    [TIMELINE_MODES.MONTHLY]: 6
};
const RELEASE_DATE_FIELD = 'file_status_tracking.release_dates.initial_release_date';
const RELEASE_DATE_FACET_FIELDS = [
    'file_status_tracking.release_dates.initial_release',
    'file_status_tracking.release_dates.initial_release_date'
];
const RECENT_RELEASES_URL_PARAMS = {
    VIEW: 'view',
    DATE: 'date'
};

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

const formatCalendarDayCount = (count = 0) => {
    const numericCount = Number(count) || 0;
    if (numericCount < 1000) {
        return String(numericCount);
    }
    if (numericCount < 10000) {
        return `${Math.round(numericCount / 100) / 10}K`;
    }
    if (numericCount < 1000000) {
        return `${Math.round(numericCount / 1000)}K`;
    }
    return `${Math.round(numericCount / 100000) / 10}M`;
};

const toDateKey = (dateObj) => (
    `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`
);

const stripDateFiltersFromParams = (queryParams = new URLSearchParams()) => {
    Array.from(queryParams.keys()).forEach((key) => {
        const lowerKey = String(key).toLowerCase();
        const isDateLike = lowerKey.includes('date');
        if (!isDateLike) return;
        if (lowerKey.endsWith('.from') || lowerKey.endsWith('.to') || lowerKey.endsWith('_date')) {
            queryParams.delete(key);
        }
    });
};

const normalizeDateFilter = (dateFilter = null) => {
    if (!dateFilter) return null;
    if (typeof dateFilter === 'string') {
        return { from: dateFilter, to: dateFilter };
    }
    if (typeof dateFilter === 'object' && dateFilter.from && dateFilter.to) {
        return { from: dateFilter.from, to: dateFilter.to };
    }
    return null;
};

const buildBrowseQueryWithDateRange = (browseQuery = '', dateFilter = null) => {
    const [path, queryString = ''] = String(browseQuery).split('?');
    if (!path || !queryString) {
        return '/browse/?type=File';
    }
    const queryParams = new URLSearchParams(queryString);
    const normalizedDateFilter = normalizeDateFilter(dateFilter);
    if (normalizedDateFilter) {
        stripDateFiltersFromParams(queryParams);
        queryParams.set(`${RELEASE_DATE_FIELD}.from`, normalizedDateFilter.from);
        queryParams.set(`${RELEASE_DATE_FIELD}.to`, normalizedDateFilter.to);
    }
    return `/browse/?${queryParams.toString()}`;
};

const buildMatrixQueryFromBrowseQuery = (browseQuery = '', dateFilter = null) => {
    const [path, queryString = ''] = String(browseQuery).split('?');
    if (!path || !queryString) {
        return '/data_matrix_aggregations/?type=File&limit=all';
    }
    const queryParams = new URLSearchParams(queryString);
    if (!queryParams.get('limit')) {
        queryParams.set('limit', 'all');
    }
    // Hide empty assay/platform buckets to avoid "N/A" synthetic columns.
    if (!queryParams.get('assays.display_title!')) {
        queryParams.set('assays.display_title!', 'No value');
    }
    if (!queryParams.get('sequencers.platform!')) {
        queryParams.set('sequencers.platform!', 'No value');
    }

    const normalizedDateFilter = normalizeDateFilter(dateFilter);
    if (normalizedDateFilter) {
        stripDateFiltersFromParams(queryParams);
        queryParams.set(`${RELEASE_DATE_FIELD}.from`, normalizedDateFilter.from);
        queryParams.set(`${RELEASE_DATE_FIELD}.to`, normalizedDateFilter.to);
    }

    return `/data_matrix_aggregations/?${queryParams.toString()}`;
};

const normalizeData = (items = []) => (
    (items || [])
        .map((monthItem = {}) => {
            const monthValue = monthItem.value || monthItem.key || monthItem.key_as_string || '';
            const days = (monthItem.items || [])
                .map((dayItem = {}) => {
                    const dayValue = dayItem.value || dayItem.key || dayItem.key_as_string || '';
                    if (!dayValue) {
                        return null;
                    }
                    const dayParts = formatDayParts(dayValue);
                    return {
                        key: dayValue,
                        value: dayValue,
                        count: dayItem.count || 0,
                        browseQuery: dayItem.query || null,
                        matrixQuery: buildMatrixQueryFromBrowseQuery(dayItem.query || '', { from: dayValue, to: dayValue }),
                        ...dayParts
                    };
                })
                .filter(Boolean)
                .sort((a, b) => String(b.value).localeCompare(String(a.value)));
            return {
                key: monthValue,
                value: monthValue,
                label: formatMonthLabel(monthValue),
                count: monthItem.count || 0,
                browseQuery: monthItem.query || null,
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

const isValidTimelineMode = (value = '') => Object.values(TIMELINE_MODES).includes(value);

const isValidDetailViewMode = (value = '') => Object.values(DETAIL_VIEW_MODES).includes(value);

const getMonthKeyFromDateString = (dateString = '') => {
    if (/^\d{4}-\d{2}$/.test(String(dateString))) {
        return String(dateString);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateString))) {
        return String(dateString).slice(0, 7);
    }
    return null;
};

const getDateStringFromLocation = () => {
    if (typeof window === 'undefined') return '';
    return window.location?.search || '';
};

const getRecentReleasesURLState = () => {
    // Recent Releases supports deep-linking into a specific timeline mode/date,
    // e.g. `?view=weekly&date=2026-04-19`.
    const queryString = getDateStringFromLocation();
    const queryParams = new URLSearchParams(queryString);
    const view = queryParams.get(RECENT_RELEASES_URL_PARAMS.VIEW);
    const date = queryParams.get(RECENT_RELEASES_URL_PARAMS.DATE);

    return {
        timelineMode: isValidTimelineMode(view) ? view : TIMELINE_MODES.WEEKLY,
        selectedDate: date || null
    };
};

const buildRecentReleasesTargetFromDate = (months = [], timelineMode = TIMELINE_MODES.WEEKLY, selectedDate = null) => {
    if (!selectedDate || !months.length) {
        return null;
    }

    if (timelineMode === TIMELINE_MODES.DAILY) {
        const day = _.chain(months).pluck('days').flatten().find((item) => item?.key === selectedDate).value() || null;
        return day ? {
            monthKey: getMonthKeyFromDateString(day.key),
            selectedDay: day,
            selectedTimelineTarget: day
        } : null;
    }

    if (timelineMode === TIMELINE_MODES.WEEKLY) {
        const allWeeks = _.chain(months).map((month) => buildWeekBucketsForMonth(month)).flatten().value();
        const week = _.find(allWeeks, (item) => item?.from <= selectedDate && item?.to >= selectedDate) || null;
        return week ? {
            monthKey: getMonthKeyFromDateString(selectedDate),
            selectedDay: null,
            selectedTimelineTarget: week
        } : null;
    }

    const monthKey = getMonthKeyFromDateString(selectedDate);
    const month = _.find(months, (item) => item?.value === monthKey) || null;
    return month ? {
        monthKey,
        selectedDay: null,
        selectedTimelineTarget: {
            key: `month-${month.value}`,
            fullLabel: month.label,
            browseQuery: month.browseQuery,
            matrixQuery: buildMatrixQueryFromBrowseQuery(month.browseQuery || '')
        }
    } : null;
};

const getMonthWindowStartIndexForTarget = (months = [], monthWindowSize = 1, monthKey = null) => {
    if (!monthKey || !months.length) return 0;
    const targetMonthIndex = _.findIndex(months, (month) => month?.value === monthKey);
    if (targetMonthIndex < 0) return 0;
    return Math.min(
        targetMonthIndex,
        Math.max(0, months.length - monthWindowSize)
    );
};

const getURLDateForSelectedTarget = (timelineMode = TIMELINE_MODES.WEEKLY, selectedDay = null, selectedTimelineTarget = null) => {
    if (timelineMode === TIMELINE_MODES.DAILY) {
        return selectedDay?.key || selectedTimelineTarget?.key || null;
    }
    if (timelineMode === TIMELINE_MODES.WEEKLY) {
        return selectedTimelineTarget?.from
            || selectedTimelineTarget?.key?.replace(/^month-/, '')
            || selectedTimelineTarget?.browseQuery?.match(/\d{4}-\d{2}(?:-\d{2})?/)?.[0]
            || null;
    }
    return selectedTimelineTarget?.key?.replace(/^month-/, '') || selectedTimelineTarget?.browseQuery?.match(/\d{4}-\d{2}/)?.[0] || null;
};

const syncRecentReleasesURLState = ({ timelineMode, selectedDate }) => {
    if (typeof window === 'undefined') return;
    // Keep the URL in sync with the current calendar selection so reloading,
    // sharing, or opening in a new tab lands on the same Recent Releases state.
    const url = new URL(window.location.href);
    if (timelineMode) {
        url.searchParams.set(RECENT_RELEASES_URL_PARAMS.VIEW, timelineMode);
    }
    if (selectedDate) {
        url.searchParams.set(RECENT_RELEASES_URL_PARAMS.DATE, selectedDate);
    } else {
        url.searchParams.delete(RECENT_RELEASES_URL_PARAMS.DATE);
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const compareMonthKeys = (leftMonthKey = '', rightMonthKey = '') => (
    String(leftMonthKey).localeCompare(String(rightMonthKey))
);

const countMonthsInclusive = (latestMonthKey = '', oldestMonthKey = '') => {
    if (!latestMonthKey || !oldestMonthKey || compareMonthKeys(latestMonthKey, oldestMonthKey) < 0) {
        return 0;
    }
    const [latestYear, latestMonth] = String(latestMonthKey).split('-').map(Number);
    const [oldestYear, oldestMonth] = String(oldestMonthKey).split('-').map(Number);
    if (!latestYear || !latestMonth || !oldestYear || !oldestMonth) {
        return 0;
    }
    return ((latestYear - oldestYear) * 12) + (latestMonth - oldestMonth) + 1;
};

const buildMonthRange = (latestMonthKey = getMonthKey(new Date()), nmonths = RECENT_MONTHS) => (
    _.range(0, nmonths).map((idx) => addMonthOffset(latestMonthKey, -idx))
);

const withEmptyMonths = (normalizedMonths = [], nmonths = RECENT_MONTHS, latestMonthKey = getMonthKey(new Date())) => {
    const monthMap = _.indexBy(normalizedMonths, 'value');
    const orderedKeys = buildMonthRange(latestMonthKey, nmonths);
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

const mergeMonths = (existingMonths = [], incomingMonths = []) => (
    _.chain([...(existingMonths || []), ...(incomingMonths || [])])
        .compact()
        .groupBy('value')
        .map((monthGroup = []) => monthGroup[0])
        .sortBy((month) => String(month?.value || ''))
        .reverse()
        .value()
);

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
        "donors.display_title",
        "sample_summary.tissues",
        "data_type",
        "analysis_details",
        "sample_summary.category"
    ]
};

const RecentReleasesFileTable = React.memo(function RecentReleasesFileTable(props) {
    const {
        session,
        searchHref,
        href,
        context,
        selectedItems = new Set(),
        onSelectItem,
        onResetSelectedItems
    } = props;

    const selectedFileProps = useMemo(() => {
        return {
            selectedItems,
            onSelectItem,
            onResetSelectedItems
        };
    }, [selectedItems, onSelectItem, onResetSelectedItems]);

    const { columnExtensionMap, columns, hideFacets } = useMemo(
        () => createBrowseFileColumnExtensionMap(selectedFileProps),
        [selectedFileProps]
    );
    const hideFacetsForRecentReleases = useMemo(
        // The calendar/timeline selection already defines the release-date scope.
        // Hiding both facet variants keeps the embedded search title/query aligned
        // with the selected day/week/month bucket.
        () => _.uniq([...(hideFacets || []), ...RELEASE_DATE_FACET_FIELDS]),
        [hideFacets]
    );
    const alignedColumnExtensionMap = useMemo(() => {
        return {
            ...columnExtensionMap,
            '@type': {
                ...(columnExtensionMap?.['@type'] || {}),
                noSort: true,
                widthMap: { lg: 60, md: 60, sm: 60 },
                colTitle: (
                    <div className="d-flex align-items-center justify-content-center w-100">
                        <SelectAllFilesButton {...selectedFileProps} searchHref={searchHref} type="checkbox" />
                    </div>
                ),
                render: (result) => (
                    <div className="d-flex align-items-center justify-content-center w-100">
                        <SelectionItemCheckbox
                            {...{ selectedItems, onSelectItem, result }}
                            isMultiSelect={true}
                        />
                    </div>
                )
            },
            access_status: {
                ...(columnExtensionMap?.access_status || {}),
                noSort: true,
                widthMap: { lg: 60, md: 60, sm: 60 },
                colTitle: (
                    <div className="d-flex align-items-center justify-content-center w-100">
                        <i className="icon icon-lock fas" data-tip="Access" />
                    </div>
                ),
                render: (result = {}) => {
                    const accessStatus = result?.access_status || null;
                    return (
                        <div className="d-flex align-items-center justify-content-center w-100">
                            {accessStatus === 'Protected' ? (
                                <i className="icon icon-lock fas" data-tip="Protected" />
                            ) : (
                                <span className="value text-center">{accessStatus || ''}</span>
                            )}
                        </div>
                    );
                }
            }
        };
    }, [columnExtensionMap, selectedFileProps, selectedItems, onSelectItem]);

    return (
        <EmbeddedItemSearchTable
            searchHref={searchHref}
            href={href}
            context={context}
            session={session}
            selectedItems={selectedItems}
            onSelectItem={onSelectItem}
            onResetSelectedItems={onResetSelectedItems}
            embeddedTableHeader={
                <SelectAllAboveTableComponent
                    session={session}
                    searchHref={searchHref}
                    deniedAccessPopoverType="login"
                    selectedItems={selectedItems}
                    onSelectItem={onSelectItem}
                    onResetSelectedItems={onResetSelectedItems}
                />
            }
            columnExtensionMap={alignedColumnExtensionMap}
            columns={columns}
            hideFacets={hideFacetsForRecentReleases}
            rowHeight={31}
            openRowHeight={40}
            maxResultsBodyHeight={620}
            maxHeight={700}
            clearSelectedItemsOnFilter
            //useCustomSelectionController
        />
    );
});

const formatWeekLabel = (fromDateKey = '', toDateKey = '') => {
    const fromDate = new Date(`${fromDateKey}T00:00:00`);
    const toDate = new Date(`${toDateKey}T00:00:00`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
        return `${fromDateKey} - ${toDateKey}`;
    }
    return `${fromDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${toDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
};

const buildWeekBucketsForMonth = (month = {}) => {
    const dayItems = Array.isArray(month.days) ? month.days : [];
    const weekMap = {};
    dayItems.forEach((day) => {
        const parsed = new Date(`${day.value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) return;
        const weekday = parsed.getDay();
        const start = new Date(parsed);
        start.setDate(parsed.getDate() - weekday);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const from = toDateKey(start);
        const to = toDateKey(end);
        const key = `${from}_${to}`;
        if (!weekMap[key]) {
            weekMap[key] = {
                key: `week-${key}`,
                from,
                to,
                count: 0
            };
        }
        weekMap[key].count += Number(day.count) || 0;
    });
    return _.chain(weekMap)
        .values()
        .map((week) => {
            const browseQuery = buildBrowseQueryWithDateRange(month.browseQuery || '/browse/?type=File', {
                from: week.from,
                to: week.to
            });
            return {
                ...week,
                label: formatWeekLabel(week.from, week.to),
                fullLabel: `Week of ${formatWeekLabel(week.from, week.to)}`,
                browseQuery,
                matrixQuery: buildMatrixQueryFromBrowseQuery(browseQuery)
            };
        })
        .sortBy((week) => week.from)
        .reverse()
        .value();
};

export const RecentReleasesTimelineMatrix = ({ session }) => {
    const initialURLState = useMemo(() => getRecentReleasesURLState(), []);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingOlderMonths, setIsLoadingOlderMonths] = useState(false);
    const [months, setMonths] = useState([]);
    const [selectedDay, setSelectedDay] = useState(null);
    const [selectedTimelineTarget, setSelectedTimelineTarget] = useState(null);
    const [monthWindowStartIndex, setMonthWindowStartIndex] = useState(0);
    const [timelineMode, setTimelineMode] = useState(initialURLState.timelineMode);
    const [detailViewMode, setDetailViewMode] = useState(DETAIL_VIEW_MODES.TABLE);
    const pendingURLTargetRef = useRef(initialURLState.selectedDate);
    const isApplyingURLStateRef = useRef(!!initialURLState.selectedDate);
    const pendingTimelineSelectionRef = useRef(null);

    useEffect(() => {
        let isCancelled = false;

        setIsLoading(true);
        ajax.load(
            `/recent_release_days?format=json&nmonths=${RECENT_MONTHS}`,
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
                setSelectedTimelineTarget(firstDay);
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
                setSelectedTimelineTarget(null);
                setMonthWindowStartIndex(0);
                setIsLoading(false);
            }
        );

        return () => {
            isCancelled = true;
        };
    }, []);

    const selectedDayLabel = useMemo(() => selectedTimelineTarget?.fullLabel || null, [selectedTimelineTarget]);
    const selectedBrowseHref = useMemo(() => selectedTimelineTarget?.browseQuery || null, [selectedTimelineTarget]);
    const selectedSearchContext = useMemo(() => (
        selectedBrowseHref ? { '@id': selectedBrowseHref, total: 0 } : { '@id': '/browse/?type=File', total: 0 }
    ), [selectedBrowseHref]);
    const monthWindowSize = useMemo(
        () => TIMELINE_MONTH_WINDOW_SIZE[timelineMode] || TIMELINE_MONTH_WINDOW_SIZE[TIMELINE_MODES.DAILY],
        [timelineMode]
    );
    const visibleMonths = useMemo(
        () => months.slice(monthWindowStartIndex, monthWindowStartIndex + monthWindowSize),
        [months, monthWindowStartIndex, monthWindowSize]
    );
    const visibleMonthsWithWeeks = useMemo(
        () => visibleMonths.map((month) => ({ ...month, weeks: buildWeekBucketsForMonth(month) })),
        [visibleMonths]
    );
    const canGoToNewerMonths = monthWindowStartIndex > 0;
    const hasLocalOlderMonths = monthWindowStartIndex + monthWindowSize < months.length;
    const oldestLoadedMonth = months[months.length - 1]?.value || null;
    const canFetchOlderMonths = oldestLoadedMonth
        ? compareMonthKeys(oldestLoadedMonth, OLDEST_NAVIGABLE_MONTH) > 0
        : false;
    const canGoToOlderMonths = hasLocalOlderMonths || canFetchOlderMonths;
    const isOlderButtonDisabled = isLoadingOlderMonths || !canGoToOlderMonths;

    useEffect(() => {
        if (!months?.length) return;
        const maxStartIndex = Math.max(0, months.length - monthWindowSize);
        if (monthWindowStartIndex > maxStartIndex) {
            setMonthWindowStartIndex(maxStartIndex);
        }
    }, [months, monthWindowSize, monthWindowStartIndex]);

    const loadOlderMonths = () => {
        if (isLoadingOlderMonths || !months.length) return Promise.resolve(false);
        if (!oldestLoadedMonth) return Promise.resolve(false);
        if (compareMonthKeys(oldestLoadedMonth, OLDEST_NAVIGABLE_MONTH) <= 0) {
            return Promise.resolve(false);
        }

        const nextChunkLatestMonthKey = addMonthOffset(oldestLoadedMonth, -1);
        const nextChunkOldestMonthKey = compareMonthKeys(
            addMonthOffset(nextChunkLatestMonthKey, -(RECENT_MONTHS - 1)),
            OLDEST_NAVIGABLE_MONTH
        ) < 0
            ? OLDEST_NAVIGABLE_MONTH
            : addMonthOffset(nextChunkLatestMonthKey, -(RECENT_MONTHS - 1));
        const nextChunkMonthCount = countMonthsInclusive(nextChunkLatestMonthKey, nextChunkOldestMonthKey);
        const chunkStartDate = `${nextChunkOldestMonthKey}-01`;
        const chunkEndDate = new Date(`${nextChunkLatestMonthKey}-01T00:00:00`);
        chunkEndDate.setMonth(chunkEndDate.getMonth() + 1, 0);
        const thruDate = toDateKey(chunkEndDate);

        setIsLoadingOlderMonths(true);
        return ajax.promise(
            `/recent_release_days?format=json&from_date=${chunkStartDate}&thru_date=${thruDate}`
        ).then((resp) => {
            const normalizedMonths = normalizeData(resp?.items || []);
            const monthsWithGaps = withEmptyMonths(normalizedMonths, nextChunkMonthCount, nextChunkLatestMonthKey);
            setMonths((prevMonths) => mergeMonths(prevMonths, monthsWithGaps));
            setIsLoadingOlderMonths(false);
            return true;
        }).catch((err) => {
            console.log('ERROR RecentReleasesTimelineMatrix older months response', err);
            setIsLoadingOlderMonths(false);
            return false;
        });
    };

    useEffect(() => {
        if (!months?.length) return;
        if (isApplyingURLStateRef.current && pendingURLTargetRef.current) {
            const requestedMonthKey = getMonthKeyFromDateString(pendingURLTargetRef.current);
            const requestedTarget = buildRecentReleasesTargetFromDate(months, timelineMode, pendingURLTargetRef.current);

            if (requestedTarget) {
                setMonthWindowStartIndex(getMonthWindowStartIndexForTarget(months, monthWindowSize, requestedTarget.monthKey));
                setSelectedDay(requestedTarget.selectedDay);
                setSelectedTimelineTarget(requestedTarget.selectedTimelineTarget);
                pendingURLTargetRef.current = null;
                isApplyingURLStateRef.current = false;
                return;
            }

            if (
                requestedMonthKey &&
                oldestLoadedMonth &&
                compareMonthKeys(requestedMonthKey, oldestLoadedMonth) < 0 &&
                compareMonthKeys(requestedMonthKey, OLDEST_NAVIGABLE_MONTH) >= 0 &&
                !isLoadingOlderMonths
            ) {
                loadOlderMonths();
                return;
            }

            pendingURLTargetRef.current = null;
            isApplyingURLStateRef.current = false;
        }

        if (pendingTimelineSelectionRef.current?.timelineMode === timelineMode) {
            const { selectedDay: pendingSelectedDay = null, selectedTimelineTarget: pendingSelectedTimelineTarget = null } = pendingTimelineSelectionRef.current;
            setSelectedDay(pendingSelectedDay);
            setSelectedTimelineTarget(pendingSelectedTimelineTarget);
            pendingTimelineSelectionRef.current = null;
            return;
        }

        if (timelineMode === TIMELINE_MODES.DAILY) {
            if (selectedDay?.key) {
                setSelectedTimelineTarget(selectedDay);
                return;
            }
            const firstDay = _.chain(months).pluck('days').flatten().find((day) => !!day).value() || null;
            setSelectedDay(firstDay);
            setSelectedTimelineTarget(firstDay);
            return;
        }
        if (timelineMode === TIMELINE_MODES.WEEKLY) {
            const firstWeek = _.chain(months)
                .map((month) => buildWeekBucketsForMonth(month))
                .flatten()
                .find((week) => (week?.count || 0) > 0)
                .value() || null;
            setSelectedDay(null);
            setSelectedTimelineTarget(firstWeek);
            return;
        }
        const firstMonth = _.find(months, (month) => (month?.count || 0) > 0) || null;
        setSelectedDay(null);
        setSelectedTimelineTarget(firstMonth ? {
            key: `month-${firstMonth.value}`,
            fullLabel: firstMonth.label,
            browseQuery: firstMonth.browseQuery,
            matrixQuery: buildMatrixQueryFromBrowseQuery(firstMonth.browseQuery || '')
        } : null);
    }, [timelineMode, months, monthWindowSize, oldestLoadedMonth, isLoadingOlderMonths]);

    useEffect(() => {
        if (isLoading || isApplyingURLStateRef.current) return;
        syncRecentReleasesURLState({
            timelineMode,
            selectedDate: getURLDateForSelectedTarget(timelineMode, selectedDay, selectedTimelineTarget)
        });
    }, [isLoading, timelineMode, selectedDay, selectedTimelineTarget]);

    if (isLoading) {
        return (
            <div className="recent-releases-page">
                <div className="recent-releases-timeline-column card recent-releases-loading-card">
                    <div className="card-body">
                        <h3 className="recent-releases-title">Recently Released Files</h3>
                        <p className="recent-releases-subtitle mb-2">
                            Select a time range below to view files
                        </p>
                        <div className="recent-releases-divider" />
                        <div className="release-view-mode-toggle mb-2">
                            <button type="button" className={`btn btn-sm ${timelineMode === TIMELINE_MODES.DAILY ? 'btn-primary active' : 'btn-outline-primary'}`} disabled>
                                Daily
                            </button>
                            <button type="button" className={`btn btn-sm ${timelineMode === TIMELINE_MODES.WEEKLY ? 'btn-primary active' : 'btn-outline-primary'}`} disabled>
                                Weekly
                            </button>
                            <button type="button" className={`btn btn-sm ${timelineMode === TIMELINE_MODES.MONTHLY ? 'btn-primary active' : 'btn-outline-primary'}`} disabled>
                                Monthly
                            </button>
                        </div>
                        <div className="release-month-nav recent-releases-loading-nav">
                            <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
                                <i className="icon icon-chevron-left fas" />
                                <span>Older</span>
                            </button>
                            <button type="button" className="btn btn-outline-secondary btn-sm" disabled>
                                <span>Newer</span>
                                <i className="icon icon-chevron-right fas" />
                            </button>
                        </div>
                        <div className="recent-releases-loading-spinner-wrap">
                            <i className="icon fas icon-spinner icon-spin"></i>
                        </div>
                    </div>
                </div>
                <div className="recent-releases-matrix-column card recent-releases-loading-card">
                    <div className="card-body">
                        <div className="recent-releases-matrix-header">
                            <div>
                                <h3 className="recent-releases-title mb-0">
                                    {timelineMode === TIMELINE_MODES.DAILY ? 'Release Day Details' : null}
                                    {timelineMode === TIMELINE_MODES.WEEKLY ? 'Release Week Details' : null}
                                    {timelineMode === TIMELINE_MODES.MONTHLY ? 'Release Month Details' : null}
                                </h3>
                                <p className="recent-releases-subtitle mb-0">Loading recent release data...</p>
                            </div>
                        </div>
                        <div className="recent-releases-divider" />
                        <div className="recent-releases-loading-spinner-wrap recent-releases-loading-spinner-wrap-right">
                            <i className="icon fas icon-spinner icon-spin"></i>
                        </div>
                    </div>
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
                        Select a time range below to view files
                    </p>
                    <div className="recent-releases-divider" />
                    <div className="release-view-mode-toggle mb-2">
                        <button
                            type="button"
                            className={`btn btn-sm ${timelineMode === TIMELINE_MODES.DAILY ? 'btn-primary active' : 'btn-outline-primary'}`}
                            onClick={() => setTimelineMode(TIMELINE_MODES.DAILY)}>
                            Daily
                        </button>
                        <button
                            type="button"
                            className={`btn btn-sm ${timelineMode === TIMELINE_MODES.WEEKLY ? 'btn-primary active' : 'btn-outline-primary'}`}
                            onClick={() => setTimelineMode(TIMELINE_MODES.WEEKLY)}>
                            Weekly
                        </button>
                        <button
                            type="button"
                            className={`btn btn-sm ${timelineMode === TIMELINE_MODES.MONTHLY ? 'btn-primary active' : 'btn-outline-primary'}`}
                            onClick={() => setTimelineMode(TIMELINE_MODES.MONTHLY)}>
                            Monthly
                        </button>
                    </div>
                    {(canGoToOlderMonths || canGoToNewerMonths || isLoadingOlderMonths) ? (
                        <div className="release-month-nav">
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => {
                                    if (hasLocalOlderMonths) {
                                        setMonthWindowStartIndex((idx) => Math.min(Math.max(0, months.length - monthWindowSize), idx + monthWindowSize));
                                        return;
                                    }
                                    loadOlderMonths().then((didLoad) => {
                                        if (didLoad) {
                                            setMonthWindowStartIndex((idx) => idx + monthWindowSize);
                                        }
                                    });
                                }}
                                disabled={isOlderButtonDisabled}>
                                <i className="icon icon-chevron-left fas" />
                                <span>{isLoadingOlderMonths ? 'Loading' : 'Older'}</span>
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => setMonthWindowStartIndex((idx) => Math.max(0, idx - monthWindowSize))}
                                disabled={!canGoToNewerMonths}>
                                <span>Newer</span>
                                <i className="icon icon-chevron-right fas" />
                            </button>
                        </div>
                    ) : null}
                    <div className="recent-releases-months">
                        {visibleMonthsWithWeeks.map((month) => (
                            <section key={month.key} className="release-month-section">
                                {timelineMode !== TIMELINE_MODES.MONTHLY ? (
                                    <header className="release-month-header">
                                        <h4>{month.label}</h4>
                                        {month.browseQuery && month.count > 0 ? (
                                            <button
                                                type="button"
                                                className="count-badge count-badge-link"
                                                onClick={() => {
                                                    const nextMonthlyTarget = {
                                                        key: `month-${month.value}`,
                                                        fullLabel: month.label,
                                                        browseQuery: month.browseQuery,
                                                        matrixQuery: buildMatrixQueryFromBrowseQuery(month.browseQuery || '')
                                                    };
                                                    if (timelineMode !== TIMELINE_MODES.MONTHLY) {
                                                        pendingTimelineSelectionRef.current = {
                                                            timelineMode: TIMELINE_MODES.MONTHLY,
                                                            selectedDay: null,
                                                            selectedTimelineTarget: nextMonthlyTarget
                                                        };
                                                        setTimelineMode(TIMELINE_MODES.MONTHLY);
                                                    } else {
                                                        setSelectedDay(null);
                                                        setSelectedTimelineTarget(nextMonthlyTarget);
                                                    }
                                                }}
                                                title={`Browse files released in ${month.label}`}>
                                                {month.count} {month.count === 1 ? 'File' : 'Files'}
                                            </button>
                                        ) : (
                                            <span className="count-badge">
                                                {month.count} {month.count === 1 ? 'File' : 'Files'}
                                            </span>
                                        )}
                                    </header>
                                ) : null}
                                {timelineMode === TIMELINE_MODES.DAILY ? (
                                    <React.Fragment>
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
                                                        onClick={cell.hasData ? () => {
                                                            setSelectedDay(cell.data);
                                                            setSelectedTimelineTarget(cell.data);
                                                        } : undefined}
                                                        onFocus={cell.hasData ? () => {
                                                            setSelectedDay(cell.data);
                                                            setSelectedTimelineTarget(cell.data);
                                                        } : undefined}
                                                        aria-pressed={isSelected}
                                                        disabled={!cell.hasData}
                                                        title={cell.fullLabel}>
                                                        <span className="day-num">{cell.dayNumber}</span>
                                                        {cell.hasData ? (
                                                            <span className="day-count">{formatCalendarDayCount(cell.count)}</span>
                                                        ) : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </React.Fragment>
                                ) : null}
                                {timelineMode === TIMELINE_MODES.WEEKLY ? (
                                    <div className="release-bucket-list">
                                        {(month.weeks || []).map((week) => {
                                            const isSelected = selectedTimelineTarget?.key === week.key;
                                            return (
                                                <button
                                                    key={week.key}
                                                    type="button"
                                                    className={`release-bucket-btn ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setSelectedDay(null);
                                                        setSelectedTimelineTarget(week);
                                                    }}>
                                                    <span className="bucket-label">{week.label}</span>
                                                    <span className="bucket-count">{formatCalendarDayCount(week.count)}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                                {timelineMode === TIMELINE_MODES.MONTHLY ? (
                                    <div className="release-bucket-list">
                                        <button
                                            type="button"
                                            className={`release-bucket-btn ${selectedTimelineTarget?.key === `month-${month.value}` ? 'selected' : ''}`}
                                            onClick={() => {
                                                setSelectedDay(null);
                                                setSelectedTimelineTarget({
                                                    key: `month-${month.value}`,
                                                    fullLabel: month.label,
                                                    browseQuery: month.browseQuery,
                                                    matrixQuery: buildMatrixQueryFromBrowseQuery(month.browseQuery || '')
                                                });
                                            }}>
                                            <span className="bucket-label">{month.label}</span>
                                            <span className="bucket-count">{month.count}</span>
                                        </button>
                                    </div>
                                ) : null}
                            </section>
                        ))}
                    </div>
                </div>
            </div>
            <div className="recent-releases-matrix-column card">
                <div className="card-body">
                    <div className="recent-releases-matrix-header">
                        <div>
                            <h3 className="recent-releases-title mb-0">
                                {timelineMode === TIMELINE_MODES.DAILY ? 'Release Day Details' : null}
                                {timelineMode === TIMELINE_MODES.WEEKLY ? 'Release Week Details' : null}
                                {timelineMode === TIMELINE_MODES.MONTHLY ? 'Release Month Details' : null}
                            </h3>
                            {selectedDayLabel ? (
                                <p className="recent-releases-subtitle mb-0">{selectedDayLabel}</p>
                            ) : null}
                        </div>
                        <div className="recent-releases-results-mode-toggle d-none">
                            <button
                                type="button"
                                className={`btn btn-sm ${detailViewMode === DETAIL_VIEW_MODES.MATRIX ? 'btn-primary' : 'btn-outline-primary'}`}
                                onClick={() => setDetailViewMode(DETAIL_VIEW_MODES.MATRIX)}>
                                Data Matrix
                            </button>
                            <button
                                type="button"
                                className={`btn btn-sm ${detailViewMode === DETAIL_VIEW_MODES.TABLE ? 'btn-primary' : 'btn-outline-primary'}`}
                                onClick={() => setDetailViewMode(DETAIL_VIEW_MODES.TABLE)}>
                                File Table
                            </button>
                        </div>
                    </div>
                    <div className="recent-releases-divider" />
                    {detailViewMode === DETAIL_VIEW_MODES.MATRIX && selectedTimelineTarget?.matrixQuery ? (
                        <div className="recent-releases-matrix-scroll">
                            <DataMatrix
                                key={`recent-releases-${selectedTimelineTarget.key}`}
                                session={session}
                                query={{
                                    ...matrixQueryTemplate,
                                    url: selectedTimelineTarget.matrixQuery
                                }}
                                headerFor={null}
                                idLabel="recent-releases"
                                showCountFor={true}
                                showMatrixModeTabs={false}
                                showColumnSummary={true}
                                showFacetTermsPanel={true}
                                showAxisLabels={false}
                                disableConfigurator={true}
                                showUniqueDonorsAssayBand={true}
                                resultTransformedPostProcessFuncKey="analysisDerivedColumns"
                                browseFilteringTransformFuncKey="analysisDerivedColumns"
                                excludePrimaryColumnNoValue={true}
                                defaultExpandedRowIndices={[0]}
                            />
                        </div>
                    ) : null}
                    {detailViewMode === DETAIL_VIEW_MODES.TABLE && selectedBrowseHref ? (
                        <div className="recent-releases-table-scroll">
                            <SelectedItemsController
                                key={`recent-releases-selection-${selectedTimelineTarget?.key || selectedBrowseHref}`}
                                context={selectedSearchContext}
                                href={selectedBrowseHref}
                                currentAction="multiselect">
                                <RecentReleasesFileTable
                                    key={`recent-releases-table-${selectedTimelineTarget?.key || 'default'}`}
                                    searchHref={selectedBrowseHref}
                                    href={selectedBrowseHref}
                                    session={session}
                                />
                            </SelectedItemsController>
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
