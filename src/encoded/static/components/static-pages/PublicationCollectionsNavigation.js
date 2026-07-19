import React from 'react';

const pageLinks = {
    benchmarking: {
        title: 'Benchmarking',
        href: '/publication-collections/benchmarking',
        subtitle: 'Benchmarking Data',
    },
    p25: {
        title: 'P25',
        href: '/publication-collections/p25',
        subtitle: 'P25 Data',
    },
    p150: {
        title: 'P150',
        href: '/publication-collections/p150',
        subtitle: 'P150 Data',
    },
};

export const PublicationCollectionsNavigation = (props) => {
    return (
        <div className="static-page-top-navigation-container mb-5">
            {Object.values(pageLinks).map(({ title, href, subtitle }) => (
                <a className="nav-link" href={href} key={href}>
                    <i className="icon icon-dna fas"> </i>
                    <span className="nav-link-title">{title}</span>
                    {subtitle && (
                        <span className="nav-link-subtitle">{subtitle}</span>
                    )}
                </a>
            ))}
        </div>
    );
};
