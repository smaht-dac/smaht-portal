import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

jest.mock('../browse/BrowseView', () => ({
    BROWSE_STATUS_FILTERS: 'status=released&status=restricted',
}));

jest.mock('../browse/columnExtensionMap', () => ({
    columnExtensionMap: {},
}));

jest.mock(
    '../static-pages/components/SelectAllAboveTableComponent',
    () => ({
        SelectAllFilesButton: () => <span>Select all files</span>,
    })
);

jest.mock(
    '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController',
    () => ({
        SelectionItemCheckbox: () => <input type="checkbox" readOnly />,
    })
);

jest.mock(
    '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons/basicColumnExtensionMap',
    () => ({
        CustomTableRowToggleOpenButton: ({ children, toggleOpenIcon }) => (
            <button type="button">{children || toggleOpenIcon}</button>
        ),
    })
);

jest.mock(
    '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime',
    () => ({
        LocalizedTime: ({ timestamp }) => <span>{timestamp}</span>,
    })
);

jest.mock(
    '@hms-dbmi-bgm/shared-portal-components/es/components/util',
    () => ({
        ajax: { load: jest.fn() },
        valueTransforms: {
            bytesToLargerUnit: (value, _decimals, returnUnit) =>
                returnUnit ? 'KB' : String(value / 1024),
        },
    })
);

jest.mock('../util/data', () => ({
    getTissueCategoryFromFacetTerm: () => 'Other',
}));

const REQUIRED_ADDITIONAL_FACETS = [
    'sample_summary.tissues',
    'assays.display_title',
    'file_size',
];

function expectPeekMetadataHref(href) {
    expect(href).toContain('/peek-metadata/?skip_default_facets=true&');
    REQUIRED_ADDITIONAL_FACETS.forEach((facet) => {
        expect(href).toContain(`additional_facet=${facet}`);
    });
    expect(href).toContain('&dataset!=No+value&type=File&');
    expect(href).toContain('&donors.display_title=Donor%20ABC');
}

describe('donor browse peek-metadata URLs', () => {
    it('declares every facet the row-summary renderer reads', () => {
        const { buildDonorPeekMetadataHref } = require('../browse/browse-view/BrowseDonorPeekMetadata');

        expectPeekMetadataHref(
            buildDonorPeekMetadataHref({ display_title: 'Donor ABC' })
        );
    });

    it('never combines skip_default_facets=true with additional_facet=type (regression for HTTP 400)', () => {
        // additional_facet=type + skip_default_facets=true makes snovault
        // infer an invalid `stats` aggregation on the `embedded.@type.raw`
        // keyword field, which Elasticsearch rejects with HTTP 400. The File
        // count must come from the response's `total` instead (see
        // BrowseDonorBase.js `files` column render).
        const { buildDonorPeekMetadataHref } = require('../browse/browse-view/BrowseDonorPeekMetadata');

        const href = buildDonorPeekMetadataHref({ display_title: 'Donor ABC' });

        expect(href).toContain('skip_default_facets=true');
        expect(href).not.toContain('additional_facet=type');
    });

    it('is used by both donor browse callers', () => {
        const browseViewDir = path.resolve(__dirname, '../browse/browse-view');
        const donorSource = fs.readFileSync(
            path.join(browseViewDir, 'BrowseDonor.js'),
            'utf8'
        );
        const protectedDonorSource = fs.readFileSync(
            path.join(browseViewDir, 'BrowseProtectedDonor.js'),
            'utf8'
        );

        expect(donorSource).toContain(
            "import { buildDonorPeekMetadataHref } from './BrowseDonorPeekMetadata';"
        );
        expect(donorSource).toContain(
            'buildHref={buildDonorPeekMetadataHref}'
        );
        expect(protectedDonorSource).toContain(
            "import { buildDonorPeekMetadataHref } from './BrowseDonorPeekMetadata';"
        );
        expect(protectedDonorSource).toContain(
            'buildHref={buildDonorPeekMetadataHref}'
        );
    });
});

describe('donor browse row-summary rendering', () => {
    it('renders all fetched columns when only explicit skip-default facets are present', () => {
        const { createBaseDonorColumnExtensionMap } = require('../browse/browse-view/BrowseDonorBase');
        const { DonorDataContext } = require('../browse/browse-view/BrowseDonorDataProvider');
        const { columnExtensionMap } = createBaseDonorColumnExtensionMap({});
        const result = { display_title: 'Donor ABC' };
        const data = {
            total: 7,
            facets: [
                {
                    field: 'sample_summary.tissues',
                    terms: [{ key: 'Blood' }, { key: 'Skin' }],
                },
                {
                    field: 'assays.display_title',
                    terms: [
                        {
                            key: 'Bulk WGS',
                            terms: [{ key: 'WGS' }, { key: 'Hi-C' }],
                        },
                        { key: 'Bulk RNA-seq' },
                    ],
                },
                {
                    field: 'file_size',
                    sum: 2048,
                },
            ],
        };
        const parentProps = {
            href: '/browse/?type=Donor',
            context: {},
            rowNumber: 0,
            detailOpen: false,
            toggleDetailOpen: jest.fn(),
            detailPaneType: null,
            handleCellClick: jest.fn(),
        };
        const donorDataContext = {
            getDonorData: () => ({ data, loading: false }),
            enqueueDonor: jest.fn(),
            version: 0,
        };
        const renderColumn = (column) =>
            renderToStaticMarkup(
                <DonorDataContext.Provider value={donorDataContext}>
                    {column.render(result, parentProps)}
                </DonorDataContext.Provider>
            );

        const tissues = renderColumn(columnExtensionMap.tissues);
        const assays = renderColumn(columnExtensionMap.assays);
        const files = renderColumn(columnExtensionMap.files);
        const fileSize = renderColumn(columnExtensionMap.file_size);

        expect(tissues).toContain('2 Tissues');
        expect(assays).toContain('3 Assays');
        expect(files).toContain('7 Files');
        expect(fileSize).toContain('2 KB');
    });
});
