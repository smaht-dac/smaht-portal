import React from 'react';

/**
 * NOTE: Because there is a custom top nav component (BigDropdownPageTreeMenu) being used
 * to render these items in two lists, you will need to also update that there whenever
 * adding or deleting a top-level key to/from this object (or if changing URL).
 *
 * Order of these items is reflected in the side nav on benchmarking page
 */

const primaryTissuePageDescription = (
    <>
        <p>
            The SMaHT benchmarking tissues were obtained from four{' '}
            <i>post mortem</i> donors. From the donors, four tissue types were
            obtained, in total, i.e., lung, liver, colon, and the brain. The
            benchmarking tissues were homogenized (unless otherwise noted) to
            ensure the cellular homogeneity in sample distribution.
        </p>

        <p>
            For the SMaHT benchmarking study, the Tissue Procurement Center
            (TPC) provided the homogenized tissue samples from the following
            benchmarking donors:
        </p>
        <ul>
            <li>Donor ST001: Liver 1A, Lung 1D, and Skin 1K</li>
            <li>Donor ST002: Colon 1G, Lung 1D, and Skin 1K</li>
            <li>Donor ST003: Brain 1Q</li>
            <li>Donor ST004: Brain 1Q</li>
        </ul>
    </>
);

export const BenchmarkingDataMap = {
    COLO829: {
        navBarTitle: 'COLO829',
        title: 'COLO829 Cell Line Data',
        description: (
            <div>
                <p>
                    COLO829 (COLO829T) is a metastatic melanoma cancer cell
                    line, which has a matched normal lymphoblast cell line,
                    COLO892BL, derived from the same individual. For
                    benchmarking analysis, COLO829T cells were mixed with
                    COLO829BL cells at a mixture ratio of 1:50 (COLO829BLT50).
                </p>
                <p>
                    <span className="fst-italic">In silico</span> COLO829BLT50
                    files were created by sampling and merging COLO829T and
                    COLO829BL Illumina WGS data at a mixture ratio of 1:50 at
                    varying sequencing depths (100 - 500X).
                </p>
            </div>
        ),
        type: 'Cell Line Data',
        path: '/data/benchmarking/COLO829',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'COLO829T',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829t&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#BL',
                title: 'COLO829BL',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829bl&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#150',
                title: 'COLO829BLT50',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829blt_50to1&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#silico',
                title: 'In silico BLT50',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829blt_in_silico&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#truthset',
                title: 'Truth Set',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829_snv_indel_challenge_data&tags=truth_set&sort=-file_status_tracking.released_date',
                facetsToHide: [
                    'dataset',
                    'file_sets.libraries.analytes.samples.sample_sources.code',
                    'status',
                    'validation_errors.name',
                    'file_sets.libraries.assay.display_title',
                    'file_sets.sequencing.sequencer.display_title',
                    'sequencing_center.display_title',
                    'software.display_title',
                    'tags',
                    // File facets used in production browse ui
                    'access_status',
                    'donors.display_title',
                    'donors.age',
                    'donors.sex',
                    'sample_summary.tissues',
                    'date_created',
                ],
                columns: {
                    '@type': {},
                    access_status: {},
                    annotated_filename: {},
                    data_type: {},
                    'file_format.display_title': {},
                    data_category: {},
                    'submission_centers.display_title': {},
                    date_created: {},
                    file_size: {},
                },
            },
        ],
    },
    HapMap: {
        navBarTitle: 'HapMap',
        title: 'HapMap Cell Line Data',
        description: (
            <div>
                <p>
                    For the SMaHT benchmarking study, six cell lines profiled in
                    the International HapMap project (hence the “HapMap” cell
                    lines) were mixed at Coriell, and the cell mixture samples
                    were distributed to GCCs and TTDs for analyses.
                </p>

                <p>
                    Information about the six HapMap cell lines and mixture
                    ratios are the following:
                </p>

                <ul>
                    <li>0.5%: HG00438 (Female; Chinese Han in the South)</li>
                    <li>2%: HG002 (Male; Ashkenazim Jewish)</li>
                    <li>2%: HG02257 (Female; African Caribbean in Barbados)</li>
                    <li>2%: HG02486 (Male; African Caribbean in Barbados)</li>
                    <li>
                        10%: HG02622 (Female; Gambian in Western Division,
                        Mandinka)
                    </li>
                    <li>83.5%: HG005 (Male; Chinese)</li>
                </ul>

                <p>
                    For the MEI Detection Challenge, DAC used the bulk WGS data
                    from BCM-GCC to downsample the HapMap mixture data to 50X,
                    100X, 200X, and 300X for Illumina (originally ~400X); and to
                    30X, 60X, and 90X for PacBio and ONT (originally ~100X
                    each).{' '}
                </p>
            </div>
        ),
        type: 'Cell Line Data',
        path: '/data/benchmarking/HapMap',
        tabMapArray: [
            {
                eventKey: '#hapmap-mixture',
                title: 'HapMap mixture',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=hapmap&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#hapmap-downsampled',
                title: 'Downsampled',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=mei_detection_challenge_data&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#hapmap-truthset',
                title: 'Truth Set',
                // searchHref:
                //     '/search/?type=File&status=released&status=restricted&status=public&dataset=hapmap_snv_indel_challenge_data',
            },
        ],
    },
    iPScFibroblasts: {
        navBarTitle: 'iPSC and Fibroblasts',
        title: 'iPSC Cell Line Data',
        description: (
            <span>
                For the SMaHT benchmarking study, five distinct clones of
                induced pluripotent stem cells (iPSCs; specifically the clone
                #1, #2, #4, #52, and #60) derived from a fibroblast cell line,
                LB-LA2, were cultured and expanded. The iPSC lines and the
                fibroblast cell lines were initially described in{' '}
                <a
                    href="https://pubmed.ncbi.nlm.nih.gov/33737484/"
                    target="_blank"
                    rel="noreferrer noopener">
                    Fasching L et al. (2021) Science
                </a>
                .
            </span>
        ),
        type: 'Cell Line Data',
        path: '/data/benchmarking/iPSC-fibroblasts',
        tabMapArray: [
            {
                eventKey: '#lb-fibroblast',
                title: 'LB-LA2',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_fibroblast&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lb_ipsc_1',
                title: 'LB-LA2 iPSC-1',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_1&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lb_ipsc_2',
                title: 'LB-LA2 iPSC-2',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_2&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lb_ipsc_4',
                title: 'LB-LA2 iPSC-4',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_4&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lb_ipsc_52',
                title: 'LB-LA2 iPSC-52',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_52&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lb_ipsc_60',
                title: 'LB-LA2 iPSC-60',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_60&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lb_ipsc_truthset',
                title: 'Truth Set',
                // searchHref:
                //     '/search/?type=File&status=released&status=restricted&status=public&dataset=ipsc_snv_indel_challenge_data',
            },
        ],
        callout: (
            <div className="callout success">
                <p className="callout-text">
                    <span className="flag">Note:</span> The iPSC and fibroblast
                    data are available via Globus upon request. To access the
                    data on Globus, please contact SMaHT Data Analysis Center
                    (DAC) through the{' '}
                    <a href="mailto:smhelp@hms-dbmi.atlassian.net?subject=Helpdesk%20Inquiry%20from%20data.smaht.org&body=Name%3A%0D%0AContact%20Information%20(so%20we%20can%20get%20back%20to%20you!)%3A%0D%0A%0D%0AQuestions%2FComments%3A%0D%0A%0D%0A">
                        Helpdesk
                    </a>
                    .
                </p>
            </div>
        ),
    },
    Donor1: {
        navBarTitle: 'Donor ST001',
        title: 'Donor ST001 : Benchmarking Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/donor-st001',
        tabMapArray: [
            {
                eventKey: '#liver',
                title: 'Liver 1A',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lung',
                title: 'Lung 1D',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#skin',
                title: 'Skin 1K',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1K&sort=-file_status_tracking.released_date',
            },
        ],
    },
    Donor2: {
        navBarTitle: 'Donor ST002',
        title: 'Donor ST002 : Benchmarking Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/donor-st002',
        tabMapArray: [
            {
                eventKey: '#colon',
                title: 'Colon 1G',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#lung',
                title: 'Lung 1D',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&sort=-file_status_tracking.released_date',
            },
            {
                eventKey: '#skin',
                title: 'Skin 1K',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1K&sort=-file_status_tracking.released_date',
            },
        ],
    },
    Donor3: {
        navBarTitle: 'Donor ST003',
        title: 'Donor ST003 : Benchmarking Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/donor-st003',
        tabMapArray: [
            {
                eventKey: '#brain',
                title: 'Brain 1Q',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q&sort=-file_status_tracking.released_date',
            },
        ],
    },
    Donor4: {
        navBarTitle: 'Donor ST004',
        title: 'Donor ST004 : Benchmarking Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/donor-st004',
        tabMapArray: [
            {
                eventKey: '#brain',
                title: 'Brain 1Q',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&sort=-file_status_tracking.released_date',
            },
        ],
    },
};

export const BenchmarkingDataKeys = Object.keys(BenchmarkingDataMap);
