import React from 'react';
import { TissueHistologyBrowser } from './TissueHistologyBrowser';

const TissueOverviewHeader = () => (
    <>
        <div className="data-group data-row header">
            <h1 className="header-text">Sample Name</h1>
            <button
                type="button"
                className="download-button btn btn-primary btn-sm"
                disabled
                title="Not yet available">
                <i className="icon icon-download fas" />
                Download Histology Image
            </button>
        </div>
        <div className="data-group data-row">
            <div className="datum description">
                <span className="datum-title">Notes </span>
                <span className="vertical-divider">|</span>
                <span className="datum-value">
                    Extended Clinical Data about this donor is available
                    through the donor manifest
                </span>
            </div>
        </div>
    </>
);

export const TissueOverviewPage = ({ tileSource, tissueInfo }) => (
    <div className="tissue-overview-page">
        <div className="view-content">
            <TissueOverviewHeader />
            <TissueHistologyBrowser
                tileSource={tileSource}
                tissueInfo={tissueInfo}
            />
        </div>
    </div>
);
