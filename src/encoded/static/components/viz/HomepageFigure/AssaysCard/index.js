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

export const AssaysCard = () => {
    const assaysList = [
        {
            header: 'Bulk WGS short read',
            items: [
                { icon: '', title: 'Illumina NovaSeq' },
                { icon: '', title: 'Ultima Genomics' },
            ],
        },
        {
            header: 'Bulk WGS long read',
            items: [
                { icon: '', title: 'PacBio HiFi' },
                { icon: '', title: 'ONT' },
            ],
        },
        {
            header: 'Bulk RNA-seq',
            items: [
                { icon: '', title: 'Illumina NovaSeq' },
                { icon: '', title: 'MAS-Seq' },
            ],
        },
        {
            header: 'Single-cell WGS',
            items: [
                { icon: '', title: 'DLP+' },
                { icon: '', title: 'MALBAC' },
                { icon: '', title: 'PTA and PTA-HAT-Seq' },
                { icon: '', title: 'Cas9-targeted seq' },
            ],
        },
        {
            header: 'Single-cell RNA-Seq',
            items: [
                { icon: '', title: 'snRNA-Seq' },
                { icon: '', title: 'STORM-Seq' },
                { icon: '', title: 'Tranquil-Seq' },
            ],
        },
        {
            header: 'Single-molecule/duplex WGS',
            items: [
                { icon: '', title: 'Nanoseq' },
                { icon: '', title: 'CODEC' },
                { icon: '', title: 'Duplex sequencing' },
                { icon: '', title: 'HiDEF-Seq' },
            ],
        },
        {
            header: 'Epigenome profiling',
            items: [
                { icon: '', title: 'NT-Seq' },
                { icon: '', title: 'Fiber-Seq' },
                { icon: '', title: 'Hi-C' },
                { icon: '', title: 'GoTchA' },
                { icon: '', title: 'ATAC-Seq/MetaCS' },
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
                    return (
                        <div className="card-list assays">
                            <h5>{assay.header}</h5>
                            <AssayList list={assay.items} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
