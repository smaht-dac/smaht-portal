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
            <li>Donor ST001: Liver and lung</li>
            <li>Donor ST002: Colon and lung</li>
            <li>Donor ST003: Brain</li>
            <li>Donor ST004: Brain</li>
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
                    <span className="font-italic">In silico</span> COLO829BLT50
                    BAM files were created by sampling and merging COLO829T and
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
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829t',
            },
            {
                eventKey: '#BL',
                title: 'COLO829BL',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829bl',
            },
            {
                eventKey: '#150',
                title: 'COLO829BLT50',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829blt_50to1',
            },
            {
                eventKey: '#silico',
                title: 'In silico BLT50',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=colo829blt_in_silico',
            },
        ],
        callout: (
            <div className="callout warning">
                <p className="callout-text">
                    <span className="flag">Attention: </span>
                    <span className="headline">
                        Illumina WGS BAMs from COLO829-BL, COLO829-T, and
                        COLO829-BLT50 from UW have been reprocessed{' '}
                    </span>
                    to include the local realignment step. If you downloaded
                    these datasets <u>before May 6</u>, please download them
                    again for your benchmarking analyses.
                </p>
            </div>
        ),
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
            </div>
        ),
        type: 'Cell Line Data',
        path: '/data/benchmarking/HapMap',
        tabMapArray: [
            {
                eventKey: '#hapmap-mixture',
                title: 'HapMap mixture',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=hapmap',
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
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_fibroblast',
            },
            {
                eventKey: '#lb_ipsc_1',
                title: 'LB-LA2 iPSC-1',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_1',
            },
            {
                eventKey: '#lb_ipsc_2',
                title: 'LB-LA2 iPSC-2',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_2',
            },
            {
                eventKey: '#lb_ipsc_4',
                title: 'LB-LA2 iPSC-4',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_4',
            },
            {
                eventKey: '#lb_ipsc_52',
                title: 'LB-LA2 iPSC-52',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_52',
            },
            {
                eventKey: '#lb_ipsc_60',
                title: 'LB-LA2 iPSC-60',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=lb_ipsc_60',
            },
        ],
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
                title: 'Liver',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A',
            },
            {
                eventKey: '#lung',
                title: 'Lung',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D',
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
                title: 'Colon',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G',
            },
            {
                eventKey: '#lung',
                title: 'Lung',
                searchHref:
                    '/search/?type=File&status=released&status=restricted&status=public&dataset=tissue&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D',
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
                title: 'Brain',
                // TODO: add brain URL
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
                title: 'Brain',
                // TODO: add brain URL
            },
        ],
    },
};

export const BenchmarkingDataKeys = Object.keys(BenchmarkingDataMap);
