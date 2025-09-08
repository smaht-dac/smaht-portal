import React, { useState, useEffect, useMemo } from 'react';

import url from 'url';
import memoize from 'memoize-one';
import _ from 'underscore';

import { BrowseSummaryStatsViewer } from './BrowseSummaryStatController';
import { FacetCharts } from '../components/FacetCharts';
import DonorCohortViewChart from '../components/DonorCohortViewChart';
import { renderHardyScaleDescriptionPopover } from '../../item-pages/components/donor-overview/PublicDonorViewDataCards';

import { IconToggle } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Toggle';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Popover } from 'react-bootstrap';


/**
 * Donor self-reported ethnicity data
 * This data is used to visualize the distribution of self-reported ethnicities among donors.
 */
export const donorSelfReportedEthnicityData = memoize(() =>
    _.chain([
        {
            group: 'American Indian or Alaska Native',
            blue: 1,
            pink: 0,
            total: 10,
        },
        // { group: 'Asian', blue: 8, pink: 0, total: 83 },
        // { group: 'Black or African American', blue: 11, pink: 0, total: 83 },
        {
            group: 'Hispanic, Latino or Spanish Origin',
            blue: 1,
            pink: 0,
            total: 10,
        },
        // { group: 'Middle Eastern or North African', blue: 15, pink: 0, total: 83 },
        // { group: 'Native Hawaiian or Other Pacific Islander', blue: 10, pink: 0, total: 83 },
        // { group: 'Other', blue: 8, pink: 0, total: 83 },
        { group: 'White', blue: 7, pink: 0, total: 10 },
        { group: 'More than 1 Race/Ethnicity', blue: 1, pink: 0, total: 10 },
    ])
        .sortBy((item) => item.group.toLowerCase()) // 2. kriter: group (artan)
        .sortBy((item) => -item.blue) // 1. kriter: blue (azalan)
        .value()
);

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

export const BrowseDonorVizWrapper = (props) => {
    const [toggleViewIndex, setToggleViewIndex] = useState(1);
    const [donorAgeGroupData, setDonorAgeGroupData] = useState();
    const [donorHardyScaleData, setDonorHardyScaleData] = useState();
    const [loading, setLoading] = useState(false);
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
    const initialFields = ['sample_summary.tissues'];

    useEffect(() => {
        const dataUrl = '/bar_plot_aggregations/';

        const hrefParts = url.parse(href, true);
        const hrefQuery = _.clone(hrefParts.query);
        delete hrefQuery.limit;
        delete hrefQuery.field;

        const requestBody = {
            search_query_params: hrefQuery,
            fields_to_aggregate_for: ['hardy_scale', 'sex', 'age'],
        };
        const commonCallback = (rawData) => {
            // Age intervals
            const ageGroups = [
                { label: '18-30', min: 18, max: 30 },
                { label: '31-55', min: 31, max: 55 },
                { label: '56-65', min: 56, max: 65 },
                { label: '66-75', min: 66, max: 75 },
                { label: '76-85', min: 76, max: 85 },
                { label: '≥86', min: 86, max: Infinity },
            ];

            const hardyScaleRange = [0, 1, 2, 3, 4];

            // Donor Hardy Scale Data
            const updatedDonorHardyScaleData = hardyScaleRange.map(
                (scaleValue) => {
                    const scale = rawData.terms[scaleValue] || null;
                    let totalCount = 0;

                    if (scale) {
                        for (const sexKey in scale.terms) {
                            totalCount += scale.terms[sexKey].total.doc_count;
                        }
                    }

                    return {
                        group: String(scaleValue),
                        blue: totalCount,
                        pink: 0,
                        total: rawData.total.doc_count,
                    };
                }
            );

            // Donor Age Group Data (Male → blue, Female → pink)
            const updatedDonorAgeGroupData = ageGroups.map((group) => {
                let blueCount = 0;
                let pinkCount = 0;

                Object.values(rawData.terms).forEach((scale) => {
                    Object.values(scale.terms).forEach((sex) => {
                        Object.entries(sex.terms).forEach(([age, info]) => {
                            const ageNum = parseInt(age, 10);
                            if (ageNum >= group.min && ageNum <= group.max) {
                                if (sex.term === 'Male')
                                    blueCount += info.doc_count;
                                if (sex.term === 'Female')
                                    pinkCount += info.doc_count;
                            }
                        });
                    });
                });

                return {
                    group: group.label,
                    blue: blueCount,
                    pink: pinkCount,
                    total: rawData.total.doc_count,
                };
            });

            setDonorAgeGroupData(updatedDonorAgeGroupData);
            setDonorHardyScaleData(updatedDonorHardyScaleData);
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
                        className="container ps-4">
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
                            data={session ? donorAgeGroupData : []}
                            chartWidth="auto"
                            chartHeight={420}
                            chartType="stacked"
                            topStackColor="#4567CF"
                            bottomStackColor="#9892F5"
                            xAxisTitle="Age Group"
                            yAxisTitle="# of Donors"
                            legendTitle="Donor Sex"
                            showLegend
                            showXAxisTitle={false}
                            session={session}
                            loading={loading}
                        />

                        <DonorCohortViewChart
                            title="Hardy Scale"
                            data={session ? donorHardyScaleData : []}
                            chartWidth="auto"
                            chartHeight={420}
                            chartType="single"
                            topStackColor="#56A9F5"
                            xAxisTitle="Hardy Scale"
                            yAxisTitle="# of Donors"
                            showXAxisTitle={false}
                            popover={
                                session &&
                                renderHardyScaleDescriptionPopover()
                            }
                            session={session}
                            loading={loading}
                        />

                        <DonorCohortViewChart
                            title="Self-Reported Ethnicity"
                            data={
                                session
                                    ? donorSelfReportedEthnicityData()
                                    : []
                            }
                            chartWidth="auto"
                            chartHeight={420}
                            chartType="horizontal"
                            topStackColor="#17C0CC"
                            xAxisTitle="# of Donors"
                            yAxisTitle="Ethnicity"
                            showYAxisTitle={false}
                            popover={session && renderEthnicityPopover()}
                            session={session}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}