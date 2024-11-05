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
        (!hasLevel2Children ? ' no-level-2-children' : '') +
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
            <CustomStaticLinks {...{ pathName, href }} />
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

function CustomStaticLinks({ pathName, href }) {
    console.log('href, pathName', href, pathName, href.includes(pathName));
    switch (pathName) {
        case 'data':
            return (
                <>
                    <div className="help-menu-tree level-1 col-12 col-md-6 col-lg-8 has-children">
                        <div
                            className={`level-1-title-container ${
                                href.includes(pathName + '/benchmarking')
                                    ? ' active'
                                    : ''
                            }`}>
                            <div className="level-1-title text-medium">
                                Benchmarking Data
                            </div>
                        </div>
                        <div className="row">
                            <div className="level-2 col-12 col-md-6">
                                <div className="level-2-title-container my-1">
                                    <div className="level-2-title text-medium text-600">
                                        Cell Lines
                                    </div>
                                </div>

                                <div className="level-3">
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/COLO829"
                                        id="menutree-linkto-colo829_page">
                                        <span>COLO829</span>
                                    </a>
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/HapMap"
                                        id="menutree-linkto-hapmap_page">
                                        <span>HapMap</span>
                                    </a>
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/iPSC-fibroblasts"
                                        id="menutree-linkto-ipscfirbro_page">
                                        <span>iPSC and Fibroblasts</span>
                                    </a>
                                </div>
                            </div>
                            <div className="level-2 col-12 col-md-6 mt-md-0 mt-1">
                                <div className="level-2-title-container my-1">
                                    <div className="level-2-title text-medium text-600">
                                        Benchmarking Tissues
                                    </div>
                                </div>
                                <div className="level-3">
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/donor-st001"
                                        id="menutree-linkto-st001_page">
                                        <span>Donor ST001</span>
                                    </a>
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/donor-st002"
                                        id="menutree-linkto-st002_page">
                                        <span>Donor ST002</span>
                                    </a>
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/donor-st003"
                                        id="menutree-linkto-st003_page">
                                        <span>Donor ST003</span>
                                    </a>
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/benchmarking/donor-st004"
                                        id="menutree-linkto-st004_page">
                                        <span>Donor ST004</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="help-menu-tree level-1 col-12 col-md-6 col-lg-4 has-children">
                        <div
                            className={`level-1-title-container ${
                                href.includes(pathName + '/benchmarking')
                                    ? ' active'
                                    : ''
                            }`}>
                            <div className="level-1-title text-medium">
                                Benchmarking Analysis
                            </div>
                        </div>
                        <div className="row">
                            <div className="level-2 col-12">
                                <div className="level-2-title-container my-1">
                                    <div className="level-2-title text-medium text-600">
                                        SMaHT Challenges
                                    </div>
                                </div>

                                <div className="level-3">
                                    <a
                                        className="level-3-title text-small d-block"
                                        href="/data/analysis/colo829-snv-indel-detection"
                                        id="menutree-linkto-colo829_snv_indel_detection_page">
                                        <span>
                                            COLO829 SNV/Indel Detection
                                            Challenge
                                        </span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            );
        default:
            return null;
    }
}
