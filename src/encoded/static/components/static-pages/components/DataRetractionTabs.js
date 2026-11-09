'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import {
    DotRouter,
    DotRouterTab,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/DotRouter';
import RetractedFilesTable from './RetractedFilesTable';
import RenamedFilesTable from './RenamedFilesTable';

// Each tab's table plus the description shown above it
const TABS = [
    {
        dotPath: '.retracted',
        title: 'Retracted Files',
        iconCls: 'icon-file-circle-xmark',
        description: (
            <>
                <p>
                    Below are the files that had been released to the portal,
                    and later <strong>retracted</strong>. The retracted files{' '}
                    <strong>
                        will not be searchable and shown in the data tables
                    </strong>{' '}
                    on the portal.
                </p>
                <p>
                    We will include the replacement data in the table below if
                    and when they are made available.
                </p>
            </>
        ),
        FilesTableComponent: RetractedFilesTable,
    },
    {
        dotPath: '.renamed',
        title: 'Renamed Files',
        iconCls: 'icon-file-pen',
        description: (
            <>
                <p>
                    Below are the files that had been previously released, but
                    due to incorrect metadata or other important changes, they
                    were <strong>renamed</strong> after correction. Other than
                    the file name,{' '}
                    <strong>the files themselves did not change</strong>.
                </p>
                <p>
                    We recommend simply renaming the file as there is{' '}
                    <strong>no need to redownload</strong>.
                </p>
            </>
        ),
        FilesTableComponent: RenamedFilesTable,
    },
];

/**
 * Retracted and renamed files tables, each in its own tab. The selected tab
 * is kept in the URL hash (e.g. `#data-retraction.renamed`) so each table can
 * be linked to directly. Only the selected tab's table is mounted.
 */
export function DataRetractionTabs({ href, schemas, session }) {
    return (
        <DotRouter
            href={href}
            prependDotPath="data-retraction"
            elementID="data-retraction-tabs"
            className="data-retraction-tabs"
            navClassName=""
            contentsClassName="">
            {TABS.map(
                (
                    { dotPath, title, iconCls, description, FilesTableComponent },
                    index
                ) => (
                    <DotRouterTab
                        key={dotPath}
                        dotPath={dotPath}
                        tabTitle={
                            <>
                                <i className={`icon fas ${iconCls}`} />
                                {title}
                            </>
                        }
                        arrowTabs={false}
                        default={index === 0}>
                        <div className="data-retraction-panel">
                            <h2 className="data-retraction-panel-title">
                                {title}
                            </h2>
                            <div className="data-retraction-panel-body">
                                <div className="data-retraction-panel-description">
                                    {description}
                                </div>
                                <FilesTableComponent
                                    schemas={schemas}
                                    session={session}
                                />
                            </div>
                        </div>
                    </DotRouterTab>
                )
            )}
        </DotRouter>
    );
}

DataRetractionTabs.propTypes = {
    href: PropTypes.string,
    schemas: PropTypes.object,
    session: PropTypes.any,
};
