import React, { useState, useEffect, useMemo } from 'react';

import url from 'url';
import memoize from 'memoize-one';
import _ from 'underscore';
import { Popover } from 'react-bootstrap';

import { BrowseSummaryStatsViewer } from './BrowseSummaryStatController';
import { FacetCharts } from '../components/FacetCharts';
import { ChartDataController } from '../../viz/chart-data-controller';
import DonorCohortViewChart from '../components/DonorCohortViewChart';
import DonorSequencingProgressChart from '../components/DonorSequencingProgressChart';
import { renderHardyScaleDescriptionPopover } from '../../item-pages/components/donor-overview/PublicDonorViewDataCards';
import { useUserDownloadAccess } from '../../util/hooks';

import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

/**
 * Donor self-reported ethnicity data
 * This data is used to visualize the distribution of self-reported ethnicities among donors.
 */
export const getDonorSelfReportedEthnicityData = memoize(() =>
    _.chain([
        { group: 'American Indian or Alaska Native', value1: 1, value2: 0, total: 10 },
        // { group: 'Asian', value1: 8, value2: 0, total: 83 },
        // { group: 'Black or African American', value1: 11, value2: 0, total: 83 },
        { group: 'Hispanic, Latino or Spanish Origin', value1: 1, value2: 0, total: 10 },
        // { group: 'Middle Eastern or North African', value1: 15, value2: 0, total: 83 },
        // { group: 'Native Hawaiian or Other Pacific Islander', value1: 10, value2: 0, total: 83 },
        // { group: 'Other', value1: 8, value2: 0, total: 83 },
        { group: 'White', value1: 7, value2: 0, total: 10 },
        { group: 'More than 1 Race/Ethnicity', value1: 1, value2: 0, total: 10 },
    ])
        .sortBy((item) => item.group.toLowerCase()) // #2 group asc
        .sortBy((item) => -item.value1) // #1 value1 desc
        .value()
);

// Age intervals
export const ageGroups = [
    { label: '18-30', min: 18, max: 30 },
    { label: '31-55', min: 31, max: 55 },
    { label: '56-65', min: 56, max: 65 },
    { label: '66-75', min: 66, max: 75 },
    { label: '76-85', min: 76, max: 85 },
    { label: '≥86', min: 86, max: Infinity },
];

export const hardyScaleRange = [0, 1, 2, 3, 4];

/**
 * Renders a popover with information about donor self-reported ethnicities.
 * @param {*} customId - The custom ID for the popover.
 * @returns - The popover component.
 */
export const renderEthnicityPopover = (customId) => (
    <Popover
        id={customId || 'chart-info-popover-ethnicity'}
        style={{ maxWidth: 400 }}
        className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <table className="table">
                <thead>
                    <tr>
                        <th className="text-left">Donor Privacy Notice</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="text-left">
                            These numbers are aggregated sums of every 10 donors
                            released by the Tissue Procurement Center.
                        </td>
                    </tr>
                </tbody>
            </table>
        </Popover.Body>
    </Popover>
);

const DONOR_SEQUENCING_TARGET = 150;

export const renderDonorSequencingPopover = (customId) => (
    <Popover id={customId || 'chart-info-popover-donor-progress'} style={{ maxWidth: 340 }} className="w-auto description-definitions-popover">
        <Popover.Body className="p-0">
            <div className="p-3">
                <strong>Donor sequencing progress</strong>
                <div className="mt-2">
                    Shows the number of donors that have completed sequencing against the program target. Values update with applied filters.
                </div>
            </div>
        </Popover.Body>
    </Popover>
);

export const BrowseDonorVizWrapper = (props) => {
    const {
        alerts,
        windowWidth,
        windowHeight,
        navigate,
        isFullscreen,
        href,
        session,
        mapping
    } = props;
    const [toggleViewIndex, setToggleViewIndex] = useState(1);
    const [donorAgeGroupData, setDonorAgeGroupData] = useState();
    const [donorHardyScaleData, setDonorHardyScaleData] = useState();
    const [donorSequencingProgress, setDonorSequencingProgress] = useState({ complete: 0, target: DONOR_SEQUENCING_TARGET });
    const [loading, setLoading] = useState(false);
    const userDownloadAccess = useUserDownloadAccess(session);

    const initialFields = ['sample_summary.tissues', 'sequencing.sequencer.display_title'];

    const fileFilters = useMemo(() => {
        const hrefParts = url.parse(href, true);
        const hrefQuery = _.clone(hrefParts.query);
        delete hrefQuery.limit;
        delete hrefQuery.field;

        ChartDataController.transformFilterDonorToFile(hrefQuery, mapping);

        return hrefQuery;
    }, [href, session]);

    const buildFilesHref = (d, additionalParam = {}) => {
        const ff = { ...fileFilters, ...additionalParam };
        if (d?.field) {
            if (d.from !== null && d.from !== undefined)
                ff[`${d.field}.from`] = d.from;
            if (d.to !== null && d.to !== undefined)
                ff[`${d.field}.to`] = d.to;
        }
        return url.format({ pathname: '/browse/', query: ff });
    };

    const donorFilters = useMemo(() => {
        const hrefParts = url.parse(href, true);
        const hrefQuery = _.clone(hrefParts.query);
        delete hrefQuery.limit;
        delete hrefQuery.field;

        return hrefQuery;
    }, [href, session]);

    const buildExploreDonorsHref = (d, additionalParam = {}) => {
        const ff = { ...donorFilters, ...additionalParam };
        if (d?.field) {
            if (d.from !== null && d.from !== undefined)
                ff[`${d.field.replace('donors.', '')}.from`] = d.from;
            if (d.to !== null && d.to !== undefined)
                ff[`${d.field.replace('donors.', '')}.to`] = d.to;
        }
        return url.format({ pathname: '/browse/', query: ff });
    };

    useEffect(() => {
        const dataUrl = '/bar_plot_aggregations/';

        const requestBody = {
            search_query_params: fileFilters,
            fields_to_aggregate_for: ['donors.hardy_scale', 'donors.sex', 'donors.age'],
        };
        const commonCallback = (rawData) => {
            // Donor Hardy Scale Data
            const updatedDonorHardyScaleData = hardyScaleRange.map(
                (scaleValue) => {
                    const scale = rawData.terms[scaleValue] || null;
                    let totalCount = 0;
                    let totalFileCount = 0;

                    if (scale) {
                        for (const sexKey in scale.terms) {
                            totalCount += scale.terms[sexKey].total.donors;
                            totalFileCount += scale.terms[sexKey].total.files;
                        }
                    }

                    return {
                        group: String(scaleValue),
                        value1: totalCount,
                        value2: 0,
                        total: rawData.total.donors,
                        value1FileCount: totalFileCount,
                        value2FileCount: 0,
                        totalFileCount: totalFileCount,
                        field: 'donors.hardy_scale',
                        from: scaleValue,
                        to: scaleValue,
                    };
                }
            );

            // Donor Age Group Data (Male → value1, Female → value2)
            const updatedDonorAgeGroupData = ageGroups.map((group) => {
                let value1Count = 0;
                let value2Count = 0;
                let value1FileCount = 0;
                let value2FileCount = 0;

                Object.values(rawData.terms).forEach((scale) => {
                    Object.values(scale.terms).forEach((sex) => {
                        Object.entries(sex.terms).forEach(([age, info]) => {
                            const ageNum = parseInt(age, 10);
                            if (ageNum >= group.min && ageNum <= group.max) {
                                if (sex.term === 'Male') {
                                    value1Count += info.donors;
                                    value1FileCount += info.files;
                                }
                                if (sex.term === 'Female') {
                                    value2Count += info.donors;
                                    value2FileCount += info.files;
                                }
                            }
                        });
                    });
                });

                return {
                    group: group.label,
                    value1: value1Count,
                    value2: value2Count,
                    total: rawData.total.donors,
                    value1FileCount: value1FileCount,
                    value2FileCount: value2FileCount,
                    totalFileCount: value1FileCount + value2FileCount,
                    field: 'donors.age',
                    from: group.min,
                    to: group.max === Infinity ? null : group.max,
                };
            });

            setDonorAgeGroupData(updatedDonorAgeGroupData);
            setDonorHardyScaleData(updatedDonorHardyScaleData);
            setDonorSequencingProgress({
                complete: rawData?.total?.donors || 0,
                target: DONOR_SEQUENCING_TARGET
            });
            setLoading(false);
        };
        const commonFallback = (r) => {
            if (r && r.error) {
                console.error('Error fetching data:', r.error);
                setDonorAgeGroupData([]);
                setDonorHardyScaleData([]);
            } else {
                console.log('Data fetched successfully:', r);
            }
            setLoading(false);
        };
        setLoading(true);
        // Perform any necessary side effects here
        ajax.load(
            dataUrl,
            (r) => commonCallback(r),
            'POST',
            (r) => commonFallback(r),
            JSON.stringify(requestBody),
            {},
            null
        );
    }, [session, href]);

    const useCompactFor = ['xs', 'sm', 'md', 'xxl'];

    return (
        <div className="row browse-viz-container">
            <div className="stats-column col-auto">
                <h2 className="browse-summary-header">
                    {toggleViewIndex === 0 ? 'Data' : 'Cohort'} Summary
                </h2>
                <BrowseSummaryStatsViewer
                    {...{ session, href, windowWidth, useCompactFor, mapping }}
                />
                <IconToggle
                    options={[
                        {
                            title: (
                                <React.Fragment>
                                    <i className="icon fas icon-fas icon-database me-1" />{' '}
                                    Donor View
                                </React.Fragment>
                            ),
                            dataTip: 'Toggle donor view',
                            btnCls: 'w-100 btn-sm',
                            onClick: () => setToggleViewIndex(0),
                        },
                        {
                            title: (
                                <React.Fragment>
                                    <i className="icon fas icon-fas icon-users me-1" />{' '}
                                    Cohort View
                                </React.Fragment>
                            ),
                            dataTip: 'Toggle cohort view',
                            btnCls: 'w-100 btn-sm',
                            onClick: () => setToggleViewIndex(1),
                        },
                    ]}
                    activeIdx={toggleViewIndex}
                    divCls="view-toggle p-1"
                />
            </div>
            <div className="col ps-0">
                {toggleViewIndex === 0 ? (
                    <div
                        id="facet-charts-container"
                        className="container ps-0 ps-xl-4">
                        <FacetCharts
                            {..._.pick(
                                props,
                                'context',
                                'href',
                                'session',
                                'schemas',
                                'browseBaseState'
                            )}
                            {...{
                                windowWidth,
                                windowHeight,
                                navigate,
                                isFullscreen,
                                initialFields,
                                mapping,
                            }}
                        />
                    </div>
                ) : (
                    <div className="donor-cohort-view-chart-container">                      

                        <DonorCohortViewChart
                            title="Age Groups"
                            data={donorAgeGroupData}
                            chartWidth="auto"
                            chartHeight={420}
                            chartType="stacked"
                            topStackColor="#4567CF"
                            bottomStackColor="#9892F5"
                            xAxisTitle="Age Group"
                            yAxisTitle="# of Donors"
                            legendTitle="Donor Sex"
                            showLegend
                            showBarTooltip={true}
                            tooltipTitles={{ crumb: 'Age Group', left: 'Donor Sex', right: '# of Donors' }}
                            showXAxisTitle={false}
                            session={session}
                            loading={loading}
                            buildFilesHref={buildFilesHref}
                            buildExploreDonorsHref={buildExploreDonorsHref}
                        />

                        <DonorCohortViewChart
                            title="Hardy Scale"
                            data={donorHardyScaleData}
                            chartWidth="auto"
                            chartHeight={420}
                            chartType="single"
                            topStackColor="#56A9F5"
                            xAxisTitle="Hardy Scale"
                            yAxisTitle="# of Donors"
                            showXAxisTitle={false}
                            popover={renderHardyScaleDescriptionPopover()}
                            showBarTooltip={true}
                            tooltipTitles={{ crumb: null, left: 'Hardy Scale', right: '# of Donors' }}
                            session={session}
                            loading={loading}
                            buildFilesHref={buildFilesHref}
                            buildExploreDonorsHref={buildExploreDonorsHref}
                        />

                        <DonorSequencingProgressChart
                            complete={donorSequencingProgress.complete}
                            target={donorSequencingProgress.target}
                            popover={renderDonorSequencingPopover()}
                            loading={loading}
                        />

                        <div style={{ display: 'none' }} aria-hidden>
                            <DonorCohortViewChart
                                title="Self-Reported Ethnicity"
                                data={userDownloadAccess?.['open-early'] ? getDonorSelfReportedEthnicityData() : []}
                                chartWidth="auto"
                                chartHeight={420}
                                chartType="horizontal"
                                topStackColor="#17C0CC"
                                xAxisTitle="# of Donors"
                                yAxisTitle="Ethnicity"
                                showYAxisTitle={false}
                                popover={renderEthnicityPopover()}
                                session={session}
                                loading={loading}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
