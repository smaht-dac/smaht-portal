import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverContent,
    PopoverTitle,
} from 'react-bootstrap';

const AssayList = ({ list }) => {
    return (
        <ul>
            {list.map((item, i) => {
                if (item.data) {
                    return (
                        <li key={i}>
                            <OverlayTrigger
                                trigger={['hover', 'focus']}
                                placement="left"
                                rootClose
                                overlay={
                                    <Popover>
                                        <PopoverTitle>
                                            {item.title}
                                        </PopoverTitle>
                                        <PopoverContent>
                                            Additional information about{' '}
                                            {item.title} here
                                        </PopoverContent>
                                    </Popover>
                                }>
                                <div>{item.title}</div>
                            </OverlayTrigger>
                        </li>
                    );
                } else {
                    return <li key={i}>{item.title}</li>;
                }
            })}
        </ul>
    );
};

export const AssaysCard = ({ currentTier }) => {
    const assaysList = [
        {
            header: 'Bulk WGS short read',
            iconSrc: '/static/img/assay-icons/Bulk WGS short read.svg',
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
            iconSrc: '/static/img/assay-icons/Bulk WGS long read.svg',
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
            iconSrc: '/static/img/assay-icons/Bulk RNA-seq.svg',
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
            iconSrc: '/static/img/assay-icons/Single-cell WGS.svg',
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
            iconSrc: '/static/img/assay-icons/Single-cell RNA-seq.svg',
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
            iconSrc: '/static/img/assay-icons/Single-molecule duplex WGS.svg',
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
            iconSrc: '/static/img/assay-icons/Epigenome profiling.svg',
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
        <div className={`card assays ${currentTier}`}>
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
                            <div className="card-list-icon-container">
                                <img src={assay.iconSrc} />
                                <AssayList list={activeItems} />
                            </div>
                        </div>
                    ) : null;
                })}
            </div>
        </div>
    );
};
