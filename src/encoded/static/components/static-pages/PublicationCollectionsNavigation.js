import React from 'react';
import { RightArrowIcon } from '../util/icon';

const pageLinks = {
    benchmarking: {
        label: 'Benchmarking',
        title: 'Benchmarking Somatic Mutation Detection',
        description:
            'The SMaHT Network benchmarked sequencing and computational methods across multiple samples using deep short- and long-read data.',
        href: '/publication-collections/benchmarking',
        linkText: 'Learn More',
    },
    p25: {
        label: 'P25',
        title: 'Learning from the first 25 SMaHT Donors',
        description:
            'The P25 Donor paper collection is coming soon and will be announced upon its release in the proper journals.',
        href: '/publication-collections/p25',
        linkText: 'Coming Soon',
        disabled: true,
    },
    p150: {
        label: 'P150',
        title: 'Somatic Mosaicism across 150 Donors',
        description:
            'The P150 Donor paper collection will be announced upon its release in the proper journals upon the completion of Phase 1 of the project.',
        href: '/publication-collections/p150',
        linkText: 'Coming Soon',
        disabled: true,
    },
};

const CollectionCardThumbnail = ({ collectionKey, label }) => {
    if (collectionKey === 'benchmarking') {
        return (
            <div className="publication-collection-card-thumbnail thumbnail-benchmarking">
                <img src="/static/img/publication-page-header-img.png" alt="" />
            </div>
        );
    }
    return (
        <div
            className={`publication-collection-card-thumbnail thumbnail-${collectionKey}`}>
            <i className="icon icon-users fas" aria-hidden="true" />
            <span className="thumbnail-label">{label}</span>
        </div>
    );
};

export const PublicationCollectionsNavigation = (props) => {
    return (
        <div className="publication-collections-container">
            <div className="publication-collections-breadcrumb">
                <span>SMaHT Data</span>
                <span className="crumb-divider">|</span>
                <span>Publications</span>
            </div>
            <div className="publication-collections-heading-row">
                <h2 className="publication-collections-heading">
                    <b>Browse</b> all <b>SMaHT Collections</b>
                </h2>
                <a
                    className="publication-collections-search-btn"
                    href="/browse/?type=Publication">
                    Search all Publications
                </a>
            </div>
            <div className="publication-collections-grid">
                {Object.entries(pageLinks).map(
                    ([
                        key,
                        { label, title, description, href, linkText, disabled },
                    ]) => {
                        const CardTag = disabled ? 'div' : 'a';
                        return (
                            <CardTag
                                className={
                                    'publication-collection-card' +
                                    (disabled ? ' disabled' : '')
                                }
                                href={disabled ? undefined : href}
                                aria-disabled={disabled || undefined}
                                key={key}>
                                <CollectionCardThumbnail
                                    collectionKey={key}
                                    label={label}
                                />
                                <div className="publication-collection-card-body">
                                    <span className="publication-collection-card-label">
                                        {label}
                                    </span>
                                    <h3 className="publication-collection-card-title">
                                        {title}
                                    </h3>
                                    <p className="publication-collection-card-description">
                                        {description}
                                    </p>
                                    <span className="publication-collection-card-link">
                                        {linkText}
                                        <RightArrowIcon stemLength={40} />
                                    </span>
                                </div>
                            </CardTag>
                        );
                    }
                )}
            </div>
        </div>
    );
};
