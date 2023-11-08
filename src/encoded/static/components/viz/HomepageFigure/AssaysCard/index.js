import React from 'react';

const AssayList = ({ list }) => {
    return (
        <ul>
            {list.map((item, i) => {
                return <li key={i}>{item.title}</li>;
            })}
        </ul>
    );
};

export const AssaysCard = ({ currentTier }) => {
    const assaysList = [
        {
            header: 'Bulk WGS short read',
            items: [
                {
                    iconSrc: '',
                    title: 'Illumina NovaSeq',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Ultima Genomics',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
            ],
        },
        {
            header: 'Bulk WGS long read',
            items: [
                {
                    iconSrc: '',
                    title: 'PacBio HiFi',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'ONT',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
            ],
        },
        {
            header: 'Bulk RNA-seq',
            items: [
                {
                    iconSrc: '',
                    title: 'Illumina NovaSeq',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'MAS-Seq',
                    benchmarking: true,
                    expansion: true,
                    production: false,
                },
            ],
        },
        {
            header: 'Single-cell WGS',
            items: [
                {
                    iconSrc: '',
                    title: 'DLP+',
                    benchmarking: true,
                    expansion: true,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'MALBAC',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'PTA and PTA-HAT-Seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'Cas9-targeted seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
            ],
        },
        {
            header: 'Single-cell RNA-Seq',
            items: [
                {
                    iconSrc: '',
                    title: 'snRNA-Seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'STORM-Seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'Tranquil-Seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
            ],
        },
        {
            header: 'Single-molecule/duplex WGS',
            items: [
                {
                    iconSrc: '',
                    title: 'Nanoseq',
                    benchmarking: true,
                    expansion: true,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'CODEC',
                    benchmarking: true,
                    expansion: true,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'Duplex sequencing',
                    benchmarking: true,
                    expansion: true,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'HiDEF-Seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
            ],
        },
        {
            header: 'Epigenome profiling',
            items: [
                {
                    iconSrc: '',
                    title: 'NT-Seq',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'Fiber-Seq',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Hi-C',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'GoTchA',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'ATAC-Seq/MetaCS',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
            ],
        },
    ];
    return (
        <div className="card assays">
            <div className="card-header">
                <h4>AVAILABLE ASSAYS</h4>
            </div>
            <div className="card-body">
                {assaysList.map((assay, i) => {
                    const activeItems = assay.items.filter(
                        (item) => item[currentTier]
                    );

                    return activeItems.length > 0 ? (
                        <div className="card-list assays" key={i}>
                            <h5>{assay.header}</h5>
                            <AssayList list={activeItems} />
                        </div>
                    ) : null;
                })}
            </div>
        </div>
    );
};
