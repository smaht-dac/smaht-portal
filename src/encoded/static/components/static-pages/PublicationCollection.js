import React from 'react';
import { PublicationSearchResultRow } from '../browse/components/PublicationSearchTable';
import { EmbeddedItemSearchTable } from '../item-pages/components/EmbeddedItemSearchTable';

// Links for PublicationCollection page tables
const PUBLICATION_LINKS = {
    // Set to all Publications for testing
    // benchmarking: '/search/?type=Publication&study=Benchmarking',
    // p25: '/search/?type=Publication&study=P25',
    // p150: '/search/?type=Publication&study=P150',
    benchmarking: '/search/?type=Publication',
    p25: '/search/?type=Publication',
    p150: '/search/?type=Publication',
};

// Sttatistics for Publication Browse
const PublicationStatistics = ({ context }) => {
    console.log('PublicationStatistics props', context);
    const publicationCount = context?.total || 0;
    const journalCount =
        context?.facets?.find((f) => f.field === 'journal')?.terms?.length || 0;
    return (
        <div className="data-summary">
            <div className="donor-statistic publications d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Publications
                </div>
                <div className="donor-statistic-value text-center">
                    {publicationCount}
                </div>
            </div>
            <div className="donor-statistic journals d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Journals / Preprints
                </div>
                <div className="donor-statistic-value text-center">
                    {journalCount}
                </div>
            </div>
            <div className="donor-statistic files d-flex flex-column p-2 gap-2">
                <div className="donor-statistic-label text-center">
                    Files Analyzed
                </div>
                <div className="donor-statistic-value text-center">0</div>
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
    console.log('PublicationTable props', props);
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
    console.log('PublicationCollectionLayout props', props);
    const { context, session } = props;
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
                        <PublicationStatistics context={context} />
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
