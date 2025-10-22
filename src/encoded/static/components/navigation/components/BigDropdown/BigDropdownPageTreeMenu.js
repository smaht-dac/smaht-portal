'use strict';

import React from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import url from 'url';
import _ from 'underscore';
import {
    console,
    memoizedUrlParse,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { BigDropdownIntroductionWrapper } from './BigDropdownIntroductionWrapper';
import { BigDropdownBigLink } from './BigDropdownBigLink';

import { BROWSE_LINKS } from '../../../browse/BrowseView';

export function BigDropdownPageTreeMenuIntroduction(props) {
    const {
        linkToTopLevelDirPage = true,
        menuTree,
        windowHeight,
        windowWidth,
        titleIcon = null,
        isActive = false,
    } = props;
    const { display_title, identifier: pathName, description } = menuTree || {};

    if (!menuTree || !menuTree.display_title || windowHeight < 600) {
        // Hide this link to top-level page on smaller heights.
        // TODO: Reconsider and maybe remove this; works currently for /help and /resources since they serve
        // as "directory" pages without much useful content themselves.
        return null;
    }

    return (
        <BigDropdownIntroductionWrapper
            {...{ windowHeight, windowWidth, titleIcon, isActive }}>
            <h4 className="mt-0 mb-0">
                {linkToTopLevelDirPage ? (
                    <a href={'/' + pathName}>{display_title}</a>
                ) : (
                    display_title
                )}
            </h4>
            {description ? (
                <div className="description">{description}</div>
            ) : null}
        </BigDropdownIntroductionWrapper>
    );
}

export function BigDropdownPageTreeMenu(props) {
    const {
        menuTree,
        href,
        childrenToHide = [],
        disableLinksOnLevel1Titles = false,
        session,
    } = props;
    const {
        display_title,
        identifier: pathName,
        children = [],
    } = menuTree || {};

    if (!pathName || !display_title) return null;

    /*
    var mostChildrenHaveChildren = _.filter(helpMenuTree.children, function(c){
        return (c.children || []).length > 0;
    }).length >= parseInt(helpMenuTree.children.length / 2);
    */

    const urlParts = memoizedUrlParse(href);

    function filterOutChildren(child) {
        // Ensure Item has view permission, title, and name (now identifier) (route/URL).
        return (
            !child.error &&
            child.display_title &&
            child.identifier &&
            !childrenToHide.includes(child.identifier)
        );
    }

    const level1ChildrenWithoutSubChildren = [];
    const level1ChildrenWithSubChildren = _.filter(children, function (child) {
        const childValid = filterOutChildren(child);
        if (!childValid) return false;
        const filteredChildren = _.filter(
            child.children || [],
            filterOutChildren
        );
        if (filteredChildren.length > 0) {
            return true;
        } else {
            if ((child.content || []).length > 0) {
                level1ChildrenWithoutSubChildren.push(child);
            }
            return false;
        }
    });

    const hasLevel2Children = level1ChildrenWithSubChildren.length > 0;
    let topLeftMenuCol = null;

    if (level1ChildrenWithoutSubChildren.length > 0) {
        topLeftMenuCol = (
            <div
                key="reserved"
                className={
                    'help-menu-tree level-1-no-child-links level-1 col-12' +
                    (!hasLevel2Children ? ' col-lg-8' : ' col-lg-4')
                }>
                {level1ChildrenWithoutSubChildren.map(function (child) {
                    const active =
                        urlParts.pathname.indexOf(child.identifier) > -1;
                    return (
                        <Level1Title
                            childPageItem={child}
                            key={child.identifier}
                            active={active}
                        />
                    );
                })}
            </div>
        );
    }

    const childItems = level1ChildrenWithSubChildren.map(function (
        childLevel1
    ) {
        const level1Children = _.filter(
            childLevel1.children || [],
            filterOutChildren
        );
        const hasChildren = level1Children.length > 0;
        const active = urlParts.pathname.indexOf(childLevel1.identifier) > -1;
        const outerCls =
            'help-menu-tree level-1 col-12 col-md-6 col-lg-4' +
            (hasChildren ? ' has-children' : '');
        return (
            <div className={outerCls} key={childLevel1.identifier}>
                <Level1Title
                    childPageItem={childLevel1}
                    active={active}
                    disableLinks={disableLinksOnLevel1Titles}
                />
                {hasChildren
                    ? level1Children.map(function (childLevel2) {
                          return (
                              <a
                                  className={
                                      'level-2-title text-small' +
                                      (urlParts.pathname.indexOf(
                                          childLevel2.identifier
                                      ) > -1
                                          ? ' active'
                                          : '')
                                  }
                                  href={'/' + childLevel2.identifier}
                                  data-tip={childLevel2.description}
                                  data-delay-show={500}
                                  key={childLevel2.identifier}
                                  id={
                                      'menutree-linkto-' +
                                      childLevel2.identifier.replace(/\//g, '_')
                                  }>
                                  {childLevel2.display_title}
                              </a>
                          );
                      })
                    : null}
            </div>
        );
    });
    const childItemsLen = childItems.length;
    const cls =
        'tree-menu-container row' +
        (!hasLevel2Children ? ' no-level-2-children gx-0' : '') +
        (!topLeftMenuCol
            ? ''
            : childItemsLen < 3
            ? ''
            : (childItemsLen + 1) % 3 === 1
            ? ' justify-content-lg-center'
            : ' justify-content-lg-end');

    return (
        <div className={cls}>
            {topLeftMenuCol}
            <CustomStaticLinks {...{ pathName, href, session }} />
            {childItems}
        </div>
    );
}

function Level1Title({ childPageItem, active, disableLinks }) {
    const { identifier, display_title, description } = childPageItem;
    if (disableLinks) {
        return (
            <div
                className={
                    'level-1-title-container' + (active ? ' active' : '')
                }>
                <span
                    className="level-1-title text-medium"
                    data-tip={description}
                    data-delay-show={500}
                    id={'menutree-linkto-' + identifier.replace(/\//g, '_')}>
                    <span>{display_title}</span>
                </span>
            </div>
        );
    }
    return (
        <div className={'level-1-title-container' + (active ? ' active' : '')}>
            <a
                className="level-1-title text-medium"
                href={'/' + identifier}
                data-tip={description}
                data-delay-show={500}
                id={'menutree-linkto-' + identifier.replace(/\//g, '_')}>
                <span>{display_title}</span>
            </a>
        </div>
    );
}

function CustomStaticLinks({ pathName, href, session }) {
    switch (pathName) {
        case 'data':
            return (
                <div className="custom-static-links row gx-0 mb-2">
                    <div className="col-12 col-xl gx-0">
                        <h3 className="mt-2 text-400 text-larger">
                            Production Data
                        </h3>
                        <hr className="mb-0" />
                        <BigDropdownBigLink
                            href={BROWSE_LINKS.file}
                            titleIcon="file fas"
                            className="primary-big-link is-fa-icon">
                            <h4 className="text-large">Browse By File</h4>
                        </BigDropdownBigLink>
                        <BigDropdownBigLink
                            session={session}
                            href={BROWSE_LINKS.donor}
                            protectedHref={BROWSE_LINKS.protected_donor}
                            titleIcon="users fas"
                            className="primary-big-link is-fa-icon">
                            <h4 className="text-large">Browse By Donor</h4>
                        </BigDropdownBigLink>
                        <BigDropdownBigLink
                            disabled
                            href=""
                            titleIcon="lungs fas mb-03"
                            className="primary-big-link is-fa-icon">
                            <h4 className="text-large">
                                Tissue Histology Browser
                                <span className="text-300 fst-italic text-medium">
                                    {' '}
                                    - Coming Soon
                                </span>
                            </h4>
                        </BigDropdownBigLink>
                    </div>
                    <div className="col-12 col-xl gx-0 mt-md-2 mt-lg-0">
                        <h3 className="mt-2 text-400 text-larger">
                            Benchmarking Data
                        </h3>
                        <hr className="mb-0" />
                        <BigDropdownBigLink
                            href="/data/benchmarking/COLO829"
                            titleIcon={
                                <div>
                                    <img
                                        className="big-link-icon-svg"
                                        src="/static/img/misc-icons/Cell Line bench.svg"
                                        alt={`Cell lines icon`}
                                    />
                                </div>
                            }
                            className="primary-big-link">
                            <h4 className="text-large">Cell Lines</h4>
                            <div className="description text-medium">
                                COLO829 - Hap Map - iPSC & Fibroblasts
                            </div>
                        </BigDropdownBigLink>
                        <BigDropdownBigLink
                            href="/data/benchmarking/donor-st001"
                            titleIcon="lungs fas"
                            className="primary-big-link">
                            <h4 className="text-large">Tissue Homogenates</h4>
                            <div className="description text-medium">
                                Donor: ST001, ST002, ST003, ST004
                            </div>
                        </BigDropdownBigLink>
                        <BigDropdownBigLink
                            disabled={!session}
                            href={
                                session
                                    ? '/data/analysis/colo829-snv-indel-detection'
                                    : ''
                            }
                            titleIcon={
                                <div>
                                    <img
                                        className="big-link-icon-svg"
                                        src="/static/img/misc-icons/Analysis Bench.svg"
                                        alt={`Analysis icon`}
                                    />
                                </div>
                            }
                            className="primary-big-link is-fa-icon">
                            <h4 className="text-large">
                                Published Somatic Variant Sets
                                <br />
                                <span className="text-300 fst-italic text-medium">
                                    {' '}
                                    - Coming Soon
                                </span>
                            </h4>
                            <div className="description text-medium">
                                Somatic SNV/Indel, SV, MEI Call Sets published
                                in SMaHT Network Papers
                            </div>
                        </BigDropdownBigLink>
                    </div>
                    <div className="col-12 col-xl gx-0 mt-md-2 mt-lg-0">
                        <h3 className="mt-2 text-400 text-larger">
                            Data Overview
                        </h3>
                        <hr className="mb-0" />
                        <BigDropdownBigLink
                            href="/data-matrix"
                            titleIcon="table-cells fas"
                            className="primary-big-link">
                            <h4 className="text-large">Data Matrix</h4>
                        </BigDropdownBigLink>
                        {session && (
                            <>
                                <BigDropdownBigLink
                                    href="/qc-metrics"
                                    titleIcon="magnifying-glass-chart fas"
                                    className="primary-big-link">
                                    <h4 className="text-large">Data QC</h4>
                                </BigDropdownBigLink>
                                <BigDropdownBigLink
                                    href="/retracted-files"
                                    titleIcon="file-circle-xmark fas"
                                    className="primary-big-link">
                                    <h4 className="text-large">
                                        Data Retraction
                                    </h4>
                                </BigDropdownBigLink>
                            </>
                        )}
                    </div>
                </div>
            );
        default:
            return null;
    }
}
