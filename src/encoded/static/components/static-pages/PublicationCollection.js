import React, { useEffect, useState } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { PublicationSearchResultRow } from '../browse/components/PublicationSearchTable';
import { EmbeddedItemSearchTable } from '../item-pages/components/EmbeddedItemSearchTable';

// Links for PublicationCollection page tables
const PUBLICATION_LINKS = {
    benchmarking: '/search/?type=Publication&publication_groups=Benchmarking',
    p25: '/search/?type=Publication&publication_groups=P25',
    p150: '/search/?type=Publication&publication_groups=P150',
};

// Sttatistics for Publication Browse - scoped to the same `publication_groups`
// filter (`PUBLICATION_LINKS[type]`) used by the tables below, so the counts
// always match what's actually shown on this page.
const PublicationStatistics = ({ type }) => {
    const [publicationCount, setPublicationCount] = useState(0);
    const [journalCount, setJournalCount] = useState(0);
    const [filesAnalyzedCount, setFilesAnalyzedCount] = useState(0);
    const [isLoadingPublicationStats, setIsLoadingPublicationStats] =
        useState(true);
    const [isLoadingFilesAnalyzed, setIsLoadingFilesAnalyzed] = useState(true);

    const groupHref = PUBLICATION_LINKS[type];

    // Load Publication and Journal counts for this publication group.
    // `limit=0` skips fetching @graph rows entirely - the response still
    // includes `total` and the full `journal` facet (a default facet on
    // Publication), which is all this block needs.
    useEffect(() => {
        if (!groupHref) {
            setIsLoadingPublicationStats(false);
            return;
        }
        let canceled = false;
        ajax.load(
            groupHref + '&limit=0',
            (resp) => {
                if (canceled) return;
                const journalTerms =
                    resp?.facets?.find((f) => f.field === 'journal')
                        ?.original_terms || [];
                setPublicationCount(resp?.total || 0);
                setJournalCount(
                    journalTerms.filter((term) => term.key !== 'No value')
                        .length
                );
                setIsLoadingPublicationStats(false);
            },
            'GET',
            (error) => {
                console.error('Error loading publication statistics:', error);
                if (canceled) return;
                setIsLoadingPublicationStats(false);
            }
        );
        return () => {
            canceled = true;
        };
    }, [groupHref]);

    // Load Files Analyzed count: Files have no `publication_groups` field, so
    // a File can't be filtered by publication group directly. Instead, fetch
    // this group's publication DOIs first, then count Files whose
    // `doi_list` matches any of them.
    useEffect(() => {
        if (!groupHref) {
            setIsLoadingFilesAnalyzed(false);
            return;
        }
        let canceled = false;
        ajax.load(
            groupHref + '&limit=all&field=doi',
            (resp) => {
                if (canceled) return;
                const dois = (resp?.['@graph'] || [])
                    .map((pub) => pub.doi)
                    .filter(Boolean);
                if (dois.length === 0) {
                    setFilesAnalyzedCount(0);
                    setIsLoadingFilesAnalyzed(false);
                    return;
                }
                const doiParams = dois
                    .map((doi) => 'doi_list=' + encodeURIComponent(doi))
                    .join('&');
                ajax.load(
                    '/search/?type=File&' +
                        doiParams +
                        '&skip_default_facets=true&limit=0',
                    (fileResp) => {
                        if (canceled) return;
                        setFilesAnalyzedCount(fileResp?.total || 0);
                        setIsLoadingFilesAnalyzed(false);
                    },
                    'GET',
                    (error) => {
                        console.error(
                            'Error loading files analyzed count:',
                            error
                        );
                        if (canceled) return;
                        setIsLoadingFilesAnalyzed(false);
                    }
                );
            },
            'GET',
            (error) => {
                console.error(
                    'Error loading publication DOIs for files analyzed count:',
                    error
                );
                if (canceled) return;
                setIsLoadingFilesAnalyzed(false);
            }
        );
        return () => {
            canceled = true;
        };
    }, [groupHref]);

    return (
        <div className="data-summary">
            <div className="donor-statistic publications d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Publications
                </div>
                <div className="donor-statistic-value text-center">
                    {isLoadingPublicationStats ? (
                        <i className="icon icon-circle-notch icon-spin fas" />
                    ) : (
                        publicationCount
                    )}
                </div>
            </div>
            <div className="donor-statistic journals d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Journals / Preprints
                </div>
                <div className="donor-statistic-value text-center">
                    {isLoadingPublicationStats ? (
                        <i className="icon icon-circle-notch icon-spin fas" />
                    ) : (
                        journalCount
                    )}
                </div>
            </div>
            <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Files Analyzed
                </div>
                <div className="donor-statistic-value text-center">
                    {isLoadingFilesAnalyzed ? (
                        <i className="icon icon-circle-notch icon-spin fas" />
                    ) : (
                        filesAnalyzedCount
                    )}
                </div>
            </div>
        </div>
    );
};

// Publication Table
const PublicationTable = ({
    type,
    context,
    schemas,
    session,
    href,
    showFacets = false,
    ...props
}) => {
    return (
        <div className="publication-search-table-container">
            <h2 className="table-header text-gray-70 fs-3 fw-semibold">
                {props.header_title || 'Publications'}
            </h2>
            <EmbeddedItemSearchTable
                key={session}
                embeddedTableHeader={null}
                searchHref={PUBLICATION_LINKS[type]}
                schemas={schemas}
                session={session}
                selectedItems={props.selectedItems}
                onSelectItem={props.onSelectItem}
                onResetSelectedItems={props.onResetSelectedItems}
                hideHeaderRow
                hideFacetHeader
                rowHeight={150}
                maxResultsBodyHeight={735}
                defaultClosedFacets
                facets={showFacets ? undefined : null}
                renderResultRow={(result, rowNumber, rowProps) => (
                    <PublicationSearchResultRow
                        result={result}
                        rowNumber={rowNumber}
                        rowProps={rowProps}
                    />
                )}
                columnExtensionMap={{}}
                hideColumns={[]}
                columns={{ '@type': {}, access_status: {} }}
            />
        </div>
    );
};

// Layout for PublicationCollection pages
const PublicationCollectionLayout = ({ ...props }) => {
    return (
        <div className="publication-collection-layout">
            <div className="introduction">
                <div className="text">
                    <div>
                        <span>
                            <span className="text-slate-70 fw-medium">
                                Benchmarking
                            </span>
                            <span className="text-gray-20"> | </span>
                            <span className="text-slate-70 fw-light">
                                Publication
                            </span>
                        </span>
                        <h2 className="text-gray-70 fw-semibold fs-3">
                            Benchmarking Somatic Mutation Detection
                        </h2>
                        <p className="fw-light">
                            Somatic mosaicism is important yet hard to detect.
                            The SMaHT Network benchmarked sequencing and
                            computational methods across multiple samples using
                            deep short- and long-read data. We integrated bulk,
                            single-cell, and duplex approaches, and made use of
                            donor-specific assemblies and the pangenome for
                            accurate detection of somatic mutation, identifying
                            optimal, genome-wide strategies.
                        </p>
                        <p className="fw-light">
                            Here, we present the compendium of papers as the
                            result of the benchmarking studies from the SMaHT
                            Network.
                        </p>
                    </div>
                    <div className="statistics-block">
                        <PublicationStatistics type={props.type} />
                    </div>
                </div>
                <div className="image">
                    <img
                        src="/static/img/publication-page-header-img.png"
                        alt="Publication page header image"
                    />
                </div>
            </div>
            <div className="publication-tables-container">
                <PublicationTable
                    {...props}
                    header_title="Introducing the SMaHT Network & Benchmark Studies"
                />
                <PublicationTable
                    {...props}
                    header_title="Variant Detection from SMaHT Working Groups"
                />
                <PublicationTable
                    {...props}
                    header_title="Individual Contributor Papers"
                    showFacets={true}
                />
            </div>
        </div>
    );
};

export const PublicationCollection = (props) => {
    return <PublicationCollectionLayout {...props} />;
};
