/**
 * Not sure it's worth converting this to json and running JSON.parse on every page...
 * Also nice to be able to include comments, use consts, etc.
 */

export const BenchmarkingDataMap = {
    COLO829: {
        navBarTitle: 'COLO829',
        type: 'Cell Line Data',
        path: '/data/benchmarking/COLO829',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'COLO829T',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#BL',
                title: 'COLO829BL',
                searchHref: '/search/?type=Item',
            },
            {
                eventKey: '#110',
                title: 'Mix 1:10',
                searchHref: '/search/?type=Page',
            },
            {
                eventKey: '#150',
                title: 'Mix 1:50',
                searchHref: '/search/?type=User',
            },
            {
                eventKey: '#1200',
                title: 'Mix 1:200',
                searchHref: '/search/?type=StaticSection',
            },
        ],
    },
    HapMap: {
        navBarTitle: 'HapMap',
        type: 'Cell Line Data',
        path: '/data/benchmarking/HapMap',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'Data',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
    iPScFibroblasts: {
        navBarTitle: 'iPSc and Fibroblasts',
        type: 'Cell Line Data',
        path: '/data/benchmarking/iPSC-fibroblasts',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'Data',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
    Brain: {
        navBarTitle: 'Brain',
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/brain',
        tabMapArray: [
            {
                eventKey: '#frontal-lobe',
                title: 'Frontal Lobe',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#cerebellum',
                title: 'Cerebellum',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#hippocampus',
                title: 'Hippocampus',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#temporal-lobe',
                title: 'Temporal Lobe',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#dendate-gyrus',
                title: 'Dendate Gyrus',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
    Skin: {
        navBarTitle: 'Skin',
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/skin',
        tabMapArray: [
            {
                eventKey: '#sun-exposed',
                title: 'Sun Exposed',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#non-sun-exposed',
                title: 'Non Sun Exposed',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
    Lung: {
        navBarTitle: 'Lung',
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/lung',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'Data',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
    Colon: {
        navBarTitle: 'Colon',
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/colon',
        tabMapArray: [
            {
                eventKey: '#ascending',
                title: 'Ascending',
                searchHref: '/search/?type=ReferenceFile',
            },
            {
                eventKey: '#descending',
                title: 'Descending',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
    Heart: {
        navBarTitle: 'Heart',
        type: 'Primary Tissue Data',
        path: '/data/benchmarking/heart',
        tabMapArray: [
            {
                eventKey: '#main',
                title: 'Data',
                searchHref: '/search/?type=ReferenceFile',
            },
        ],
    },
};

export const BenchmarkingDataKeys = Object.keys(BenchmarkingDataMap);
