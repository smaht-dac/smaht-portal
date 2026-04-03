'use strict';

import React, { useState, useEffect } from 'react';
import DefaultItemView from './DefaultItemView';

// Page containing the details of Items of type File
export default class PublicationOverview extends DefaultItemView {
    getTabViewContents() {
        const initTabs = [];
        initTabs.push(PublicationView.getTabObject(this.props));
        return initTabs.concat(this.getCommonTabs()); // Add remainder of common tabs (Details, Attribution)
    }
}

// Header component containing high-level information for the file item
const PublicationViewTitle = () => {
    // Default breadcrumbs for the File Overview page
    let breadcrumbs = [
        { display_title: 'Home', href: '/' },
        { display_title: 'Data' },
        { display_title: 'Browse by Publication' },
    ];
    return (
        <div className="view-title container-wide">
            <nav className="view-title-navigation">
                <ul className="breadcrumb-list">
                    {breadcrumbs.map(({ display_title, href }, i, arr) => {
                        return (
                            <li className="breadcrumb-list-item" key={i}>
                                <a
                                    className={
                                        'breadcrumb-list-item-link link-underline-hover' +
                                        (href ? '' : ' no-link')
                                    }
                                    href={href}>
                                    {display_title}
                                </a>
                                {i < arr.length - 1 ? (
                                    <i className="icon icon-fw icon-angle-right fas"></i>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </nav>
            <h1 className="view-title-text">Publication Overview</h1>
        </div>
    );
};

/** Top-level component for the Donor Overview Page */
const PublicationView = React.memo(function PublicationView(props) {
    const { context, session, href } = props;
    console.log('PublicationView', context);

    useEffect(() => {}, []);

    const pubYear = context?.date_published?.split('-')[0];
    const doiLink = context?.doi ? `https://doi.org/${context.doi}` : '';
    const doiCode = context?.doi ? context.doi.split('/').pop() : '';
    const citationString =
        context?.authors?.join(', ') +
        ' (' +
        pubYear +
        '). ' +
        context?.title +
        '. ' +
        context?.journal +
        '. ' +
        doiCode;
    '.' + doiLink;

    return (
        <div className="publication-view">
            <PublicationViewTitle />
            <div className="view-content">
                <div className="publication-header">
                    <img
                        className="thumbnail"
                        src="https://placehold.co/600x400"
                        alt="placeholder"
                    />
                    <div className="publication-header-text">
                        <h2 className="title">{context?.display_title}</h2>
                        <div className="details">
                            {context?.short_citation && (
                                <span className="author">
                                    {context.short_citation ||
                                        context.authors[0]}
                                </span>
                            )}
                            <span>|</span>
                            <span>Placeholder Category</span>
                        </div>
                    </div>
                </div>

                <div className="citation-container">
                    <div className="citation-text">
                        <span>Publication Citation</span>
                        <span className="citation">{citationString}</span>
                    </div>
                    <div className="citation-links">
                        {context?.journal_url && (
                            <a
                                className="btn btn-primary"
                                href={context.journal_url}
                                target="_blank"
                                rel="noopener noreferrer">
                                Journal
                                <i className="icon icon-external-link-alt fas"></i>
                            </a>
                        )}
                        {context?.pubmed_id && (
                            <a
                                className="btn btn-primary"
                                href={`https://pubmed.ncbi.nlm.nih.gov/${context.pubmed_id}/`}
                                target="_blank"
                                rel="noopener noreferrer">
                                Pubmed
                                <i className="icon icon-external-link-alt fas"></i>
                            </a>
                        )}
                    </div>
                </div>

                <div className="data-cards-container">
                    <div className="data-card abstract">
                        <div className="header">
                            <span className="header-text">Abstract</span>
                        </div>
                        <div className="body">
                            <span>{context?.abstract}</span>
                        </div>
                    </div>
                    <div className="data-card findings">
                        <div className="header">
                            <span className="header-text">
                                Key / Novel Findings
                            </span>
                        </div>
                        <div className="body">
                            <div className="data-card-callout">
                                <div className="callout-header">
                                    Lorem ipsum dolor sit amet, consectetur
                                    adipiscing elit.
                                </div>
                                <div className="callout-body">
                                    Mauris imperdiet ipsum sed leo efficitur,
                                    nec scelerisque mauris vulputate. Sed at
                                    finibus metus, et bibendum quam. Proin
                                    dignissim felis non augue finibus, non
                                    egestas dui viverra. Vestibulum non dui id
                                    massa commodo bibendum euismod nec orci.
                                </div>
                            </div>
                            <div className="data-card-callout">
                                <div className="callout-header">
                                    Nam felis dui, tincidunt a pharetra vel,
                                    gravida eget felis.
                                </div>
                                <div className="callout-body">
                                    Fusce tincidunt tortor non orci rhoncus
                                    interdum. In hac habitasse platea dictumst.
                                    Quisque porttitor varius porttitor. Donec
                                    mattis bibendum orci sed maximus.
                                </div>
                            </div>
                            <div className="data-card-callout">
                                <div className="callout-header">
                                    Nam felis dui, tincidunt a pharetra vel,
                                    gravida eget felis.
                                </div>
                                <div className="callout-body">
                                    Fusce tincidunt tortor non orci rhoncus
                                    interdum. In hac habitasse platea dictumst.
                                    Quisque porttitor varius porttitor. Donec
                                    mattis bibendum orci sed maximus.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

/**
 * Tab object for the FileView component, provides necessary information
 * to parent class, DefaultItemView
 */
PublicationView.getTabObject = function (props) {
    return {
        tab: <span>Publication Overview</span>,
        key: 'publication-overview',
        content: <PublicationView {...props} />,
    };
};
