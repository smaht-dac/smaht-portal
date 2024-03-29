import React from 'react';

/**
 * NOTE: Because there is a custom top nav component (BigDropdownPageTreeMenu) being used
 * to render these items in two lists, you will need to also update that there whenever
 * adding or deleting a top-level key to/from this object (or if changing URL).
 *
 * Order of these items is reflected in the side nav on benchmarking page
 */

const primaryTissuePageDescription = (
    <span>
        The SMaHT benchmarking tissues were obtained from two <i>post mortem</i>{' '}
        donors. From each donor, three tissue types, i.e., lung, liver, and
        colon, were obtained, homogenized and subjected to sequencing.
    </span>
);

export const BenchmarkingDataMap = {
    COLO829: {
        navBarTitle: 'COLO829',
        title: 'COLO829 Cell Line Data',
        description:
            'COLO829 (COLO829T) is a metastatic melanoma cancer cell line, which has a matched normal lymphoblast cell line, COLO892BL, derived from the same individual. For benchmarking analysis, COLO829T cells were mixed with COLO829BL cells at a mixture ratio of 1:50 (COLO829BLT50).',
        type: 'Cell Line Data',
        path: '/data/benchmarking/COLO829',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'COLO829T',
                searchHref: '/search/?type=File&dataset=colo829t',
            },
            {
                eventKey: '#BL',
                title: 'COLO829BL',
                searchHref: '/search/?type=File&dataset=colo829bl',
            },
            {
                eventKey: '#150',
                title: 'COLO829BLT50',
                searchHref: '/search/?type=File&dataset=colo829blt_50to1',
            },
            // {
            //     eventKey: '#silico',
            //     title: 'In Silico Mix',
            //     // searchHref: '/search/?type=SubmittedFile&dataset=colo829blt_200to1',
            // },
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
            </div>
        ),
        type: 'Cell Line Data',
        path: '/data/benchmarking/HapMap',
        tabMapArray: [
            {
                eventKey: '#hapmap-mixture',
                title: 'HapMap mixture',
                searchHref: '/search/?type=File&dataset=hapmap',
            },
            {
                eventKey: '#hg002',
                title: 'HG002',
                searchHref: '/search/?type=File&dataset=hg002',
            },
            {
                eventKey: '#hg00438',
                title: 'HG00438',
                searchHref: '/search/?type=File&dataset=hg00438',
            },
            {
                eventKey: '#hg005',
                title: 'HG005',
                searchHref: '/search/?type=File&dataset=hg005',
            },
            {
                eventKey: '#hg02257',
                title: 'HG02257',
                searchHref: '/search/?type=File&dataset=hg02257',
            },
            {
                eventKey: '#hg02486',
                title: 'HG02486',
                searchHref: '/search/?type=File&dataset=hg02486',
            },
            {
                eventKey: '#hg02622',
                title: 'HG02622',
                searchHref: '/search/?type=File&dataset=hg02622',
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
                searchHref: '/search/?type=File&dataset=lb_fibroblast',
            },
            {
                eventKey: '#lb_ipsc_1',
                title: 'LB-LA2 iPSC 1',
                searchHref: '/search/?type=File&dataset=lb_ipsc_1',
            },
            {
                eventKey: '#lb_ipsc_2',
                title: 'LB-LA2 iPSC 2',
                searchHref: '/search/?type=File&dataset=lb_ipsc_2',
            },
            {
                eventKey: '#lb_ipsc_4',
                title: 'LB-LA2 iPSC 4',
                searchHref: '/search/?type=File&dataset=lb_ipsc_4',
            },
            {
                eventKey: '#lb_ipsc_52',
                title: 'LB-LA2 iPSC 52',
                searchHref: '/search/?type=File&dataset=lb_ipsc_52',
            },
            {
                eventKey: '#lb_ipsc_60',
                title: 'LB-LA2 iPSC 60',
                searchHref: '/search/?type=File&dataset=lb_ipsc_60',
            },
        ],
    },
    Lung: {
        navBarTitle: 'Lung',
        title: 'Lung Primary Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/lung',
        tabMapArray: [
            {
                eventKey: '#donor-1',
                title: 'Donor 1',
                // searchHref: '/search/?type=File',
            },
            {
                eventKey: '#donor-2',
                title: 'Donor 2',
                // searchHref: '/search/?type=File',
            },
        ],
    },
    Liver: {
        navBarTitle: 'Liver',
        title: 'Liver Primary Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/liver',
        tabMapArray: [
            {
                eventKey: '#donor-1',
                title: 'Donor 1',
                // searchHref: '/search/?type=File',
            },
            {
                eventKey: '#donor-2',
                title: 'Donor 2',
                // searchHref: '/search/?type=File',
            },
        ],
    },
    Colon: {
        navBarTitle: 'Colon',
        title: 'Colon Primary Tissue Data',
        description: primaryTissuePageDescription,
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/colon',
        tabMapArray: [
            {
                eventKey: '#donor-1',
                title: 'Donor 1',
                // searchHref: '/search/?type=File',
            },
            {
                eventKey: '#donor-2',
                title: 'Donor 2',
                // searchHref: '/search/?type=File',
            },
        ],
    },
    // Heart: {
    //     navBarTitle: 'Heart',
    //     title: "Heart Primary Tissue Data",
    //     description: "",
    //     type: 'Primary Tissue Data',
    //     path: '/data/benchmarking/heart',
    //     tabMapArray: [
    //         {
    //             eventKey: '#main',
    //             title: 'Data',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //     ],
    // },
    // Brain: {
    //     navBarTitle: 'Brain',
    //     title: "Brain Primary Tissue Data",
    //     description: "",
    //     type: 'Primary Tissue Data',
    //     path: '/data/benchmarking/brain',
    //     tabMapArray: [
    //         {
    //             eventKey: '#frontal-lobe',
    //             title: 'Frontal Lobe',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //         {
    //             eventKey: '#cerebellum',
    //             title: 'Cerebellum',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //         {
    //             eventKey: '#hippocampus',
    //             title: 'Hippocampus',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //         {
    //             eventKey: '#temporal-lobe',
    //             title: 'Temporal Lobe',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //         {
    //             eventKey: '#dendate-gyrus',
    //             title: 'Dendate Gyrus',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //     ],
    // },
    // Skin: {
    //     navBarTitle: 'Skin',
    //     title: "Skin Primary Tissue Data",
    //     description: "",
    //     type: 'Primary Tissue Data',
    //     path: '/data/benchmarking/skin',
    //     tabMapArray: [
    //         {
    //             eventKey: '#sun-exposed',
    //             title: 'Sun Exposed',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //         {
    //             eventKey: '#non-sun-exposed',
    //             title: 'Non Sun Exposed',
    //             // searchHref: '/search/?type=ReferenceFile',
    //         },
    //     ],
    // },
};

export const BenchmarkingDataKeys = Object.keys(BenchmarkingDataMap);
