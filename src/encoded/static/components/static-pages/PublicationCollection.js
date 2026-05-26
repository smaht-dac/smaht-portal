import React from 'react';
import { BrowsePublicationBody } from '../browse/browse-view/BrowsePublication';
import { BrowsePublicationSearchTable } from '../browse/components/PublicationSearchTable';
import { EmbeddedItemSearchTable } from '../item-pages/components/EmbeddedItemSearchTable';

// Links for PublicationCollection page tables
const PUBLICATION_LINKS = {
    // benchmarking: '/search/?type=Publication&study=Benchmarking',
    benchmarking: '/search/?type=Publication',
    p25: '/search/?type=Publication&study=p25',
    p150: '/search/?type=Publication&study=p150',
};

// Layout for PublicationCollection pages
const PublicationCollectionLayout = () => {};

export const PublicationCollection = ({
    type,
    context,
    schemas,
    session,
    href,
    ...props
}) => {
    console.log('PublicationCollection type:', type, 'props:', props);
    return (
        <EmbeddedItemSearchTable
            key={props.session}
            embeddedTableHeader={null}
            rowHeight={31}
            {...{
                searchHref: PUBLICATION_LINKS[type],
                schemas: schemas,
                session: session,
                selectedItems: props.selectedItems,
                onSelectItem: props.onSelectItem,
                onResetSelectedItems: props.onResetSelectedItems,
            }}
            facets={[]}
            columnExtensionMap={{}}
            hideColumns={[]}
            columns={{
                '@type': {},
                access_status: {},
            }}
        />
    );
};
