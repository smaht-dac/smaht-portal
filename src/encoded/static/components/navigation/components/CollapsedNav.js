'use strict';

import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import url from 'url';
import _ from 'underscore';
import NavbarCollapse from 'react-bootstrap/esm/NavbarCollapse';

import {
    BigDropdownNavItem,
    BigDropdownPageLoader,
    BigDropdownPageTreeMenu,
    BigDropdownPageTreeMenuIntroduction,
    BigDropdownGroupController,
} from './BigDropdown';
import { AccountNav } from './AccountNav';

export const CollapsedNav = React.memo(function CollapsedNav(props) {
    const {
        context,
        href,
        currentAction,
        session,
        mounted,
        overlaysContainer,
        windowWidth,
        windowHeight,
        testWarningVisible,
        addToBodyClassList,
        removeFromBodyClassList,
        schemas,
        updateAppSessionState,
    } = props;

    const leftNavProps = {
        context,
        windowWidth,
        windowHeight,
        href,
        mounted,
        overlaysContainer,
        session,
        testWarningVisible, //, addToBodyClassList, removeFromBodyClassList
    };

    const userActionNavProps = {
        windowWidth,
        windowHeight,
        href,
        mounted,
        overlaysContainer,
        session,
        schemas,
        updateAppSessionState,
        testWarningVisible,
    };

    // We'll probably keep using NavbarCollapse for a bit since simpler than implementing own
    // (responsive openable mobile menus)
    return (
        <NavbarCollapse>
            <BigDropdownGroupController
                {...{ addToBodyClassList, removeFromBodyClassList }}>
                {session ? (
                    <LeftNavAuthenticated {...leftNavProps} />
                ) : (
                    <LeftNavGuest {...leftNavProps} />
                )}
                <AccountNav {...userActionNavProps} />
            </BigDropdownGroupController>
        </NavbarCollapse>
    );
});

function AboutNavItem(props) {
    const { session, ...navItemProps } = props;
    // `navItemProps` contains: href, windowHeight, windowWidth, isFullscreen, testWarning, mounted, overlaysContainer
    return (
        <BigDropdownPageLoader treeURL="/about" session={session}>
            <BigDropdownNavItem
                {...navItemProps}
                id="about-menu-item"
                navItemHref="/about"
                navItemContent="About">
                <BigDropdownPageTreeMenuIntroduction
                    titleIcon="info-circle fas"
                    linkToTopLevelDirPage={false}
                />
                <BigDropdownPageTreeMenu disableLinksOnLevel1Titles />
            </BigDropdownNavItem>
        </BigDropdownPageLoader>
    );
}

function DocsNavItem(props) {
    const { session, ...navItemProps } = props;
    // `navItemProps` contains: href, windowHeight, windowWidth, isFullscreen, testWarning, mounted, overlaysContainer
    return (
        <BigDropdownPageLoader treeURL="/docs" session={session}>
            <BigDropdownNavItem
                {...navItemProps}
                id="docs-menu-item"
                navItemHref="/docs"
                navItemContent="Documentation">
                <BigDropdownPageTreeMenuIntroduction
                    titleIcon="book fas"
                    linkToTopLevelDirPage={false}
                />
                <BigDropdownPageTreeMenu
                    disableLinksOnLevel1Titles
                    childrenToHide={[
                        'docs/additional-resources/fastq_files',
                        'docs/additional-resources/short-read_illumina_paired-end',
                        'docs/additional-resources/long-read_pacbio_hifi',
                        'docs/additional-resources/long-read_oxford_nanopore',
                        'docs/additional-resources/short-read_rna-seq_paired-end',
                        'docs/additional-resources/long-read_rna-seq_pacbio_kinnex',
                        'docs/additional-resources/genome_builds',
                        'docs/additional-resources/genome_annotations',
                        'docs/additional-resources/variant_catalogs',
                        'docs/additional-resources/software_specific',
                        'docs/additional-resources/release_changelog',
                    ]}
                />
            </BigDropdownNavItem>
        </BigDropdownPageLoader>
    );
}

function DataNavItem(props) {
    const { session, ...navItemProps } = props;
    // `navItemProps` contains: href, windowHeight, windowWidth, isFullscreen, testWarning, mounted, overlaysContainer
    return (
        <BigDropdownPageLoader treeURL="/data" session={session}>
            <BigDropdownNavItem
                {...navItemProps}
                id="data-menu-item"
                navItemHref="/data"
                navItemContent="Data">
                <BigDropdownPageTreeMenuIntroduction
                    titleIcon="database fas"
                    linkToTopLevelDirPage={false}
                />
                <BigDropdownPageTreeMenu
                    childrenToHide={['data/benchmarking', 'data/analysis']}
                />
            </BigDropdownNavItem>
        </BigDropdownPageLoader>
    );
}

function ResourcesNavItem(props) {
    const { session, ...navItemProps } = props;
    // `navItemProps` contains: href, windowHeight, windowWidth, isFullscreen, testWarning, mounted, overlaysContainer

    return (
        <BigDropdownPageLoader treeURL="/resources" session={session}>
            <BigDropdownNavItem
                {...navItemProps}
                id="resources-menu-item"
                navItemHref="/resources"
                navItemContent="Resources">
                <BigDropdownPageTreeMenuIntroduction
                    titleIcon="info-circle fas"
                    linkToTopLevelDirPage={false}
                />
                <BigDropdownPageTreeMenu disableLinksOnLevel1Titles />
            </BigDropdownNavItem>
        </BigDropdownPageLoader>
    );
}

/**
 * @todo Test user actions or role for things to have here?
 */
function LeftNavAuthenticated(props) {
    const { context, href } = props;
    const { isGeneListsLinkActive, isCohortsLinkActive } = useMemo(
        function () {
            const { '@id': contextID } = context;
            const { query = {}, pathname } = url.parse(href || contextID, true);
            // We assume href and context change together, so we memoize on context instead of href
            // since is a more performant comparison.
            return {
                isGeneListsLinkActive:
                    pathname.substring(0, 7) === '/search' &&
                    query.type === 'GeneList',
                isCohortsLinkActive:
                    pathname.substring(0, 16) === '/cohort-analysis',
            };
        },
        [context]
    );
    return (
        <div className="navbar-nav me-auto">
            <DataNavItem {...props} />
            <DocsNavItem {...props} />
            <AboutNavItem {...props} />
            <ResourcesNavItem {...props} />
        </div>
    );
}

const LeftNavGuest = React.memo(function LeftNavGuest(props) {
    const { href, ...passProps } = props;
    const { pathname = '/' } = url.parse(href, false);

    return (
        <div className="navbar-nav me-auto">
            <DataNavItem {...props} />
            <DocsNavItem {...props} />
            <AboutNavItem {...props} />
            <ResourcesNavItem {...props} />
        </div>
    );
});
