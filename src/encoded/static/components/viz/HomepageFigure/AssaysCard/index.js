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
            icon: {
                src: '/static/img/assay-icons/Bulk WGS short read.svg',
                alt: 'Bulk WGS short read icon',
            },
            items: [
                {
                    title: 'Illumina NovaSeq',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
                {
                    title: 'Ultima Genomics',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
            ],
        },
        {
            header: 'Bulk WGS long read',
            icon: {
                src: '/static/img/assay-icons/Bulk WGS long read.svg',
                alt: 'Bulk WGS long read icon',
            },
            items: [
                {
                    title: 'PacBio HiFi',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
                {
                    title: 'ONT',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
            ],
        },
        {
            header: 'Bulk RNA-seq',
            icon: {
                src: '/static/img/assay-icons/Bulk RNA-seq.svg',
                alt: 'Bulk RNA-seq icon',
            },
            items: [
                {
                    title: 'Illumina NovaSeq',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
                {
                    title: 'MAS-Seq',
                    tier_0: true,
                    tier_1: true,
                    tier_2: false,
                },
            ],
        },
        {
            header: 'Single-cell WGS',
            icon: {
                src: '/static/img/assay-icons/Single-cell WGS.svg',
                alt: 'Single-cell WGS icon',
            },
            items: [
                {
                    title: 'DLP+',
                    tier_0: true,
                    tier_1: true,
                    tier_2: false,
                },
                {
                    title: 'MALBAC',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'PTA and PTA-HAT-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'Cas9-targeted seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
            ],
        },
        {
            header: 'Single-cell RNA-Seq',
            icon: {
                src: '/static/img/assay-icons/Single-cell RNA-Seq.svg',
                alt: 'Single-cell RNA-Seq icon',
            },
            items: [
                {
                    title: 'snRNA-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'STORM-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'Tranquil-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
            ],
        },
        {
            header: 'Single-molecule/duplex WGS',
            icon: {
                src: '/static/img/assay-icons/Single-molecule duplex WGS.svg',
                alt: 'Single-molecule duplex WGS icon',
            },
            items: [
                {
                    title: 'Nanoseq',
                    tier_0: true,
                    tier_1: true,
                    tier_2: false,
                },
                {
                    title: 'CODEC',
                    tier_0: true,
                    tier_1: true,
                    tier_2: false,
                },
                {
                    title: 'Duplex sequencing',
                    tier_0: true,
                    tier_1: true,
                    tier_2: false,
                },
                {
                    title: 'HiDEF-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'CompDuplex-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
            ],
        },
        {
            header: 'Epigenome profiling',
            icon: {
                src: '/static/img/assay-icons/Epigenome profiling.svg',
                alt: 'Epigenome profiling icon',
            },
            items: [
                {
                    title: 'NT-Seq',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'Fiber-Seq',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
                {
                    title: 'Hi-C',
                    tier_0: true,
                    tier_1: true,
                    tier_2: true,
                },
                {
                    title: 'GoTchA',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
                {
                    title: 'ATAC-Seq/MetaCS',
                    tier_0: true,
                    tier_1: false,
                    tier_2: false,
                },
            ],
        },
    ];
    return (
        <div className={`card assays tier-${currentTier}`}>
            <div className="card-header">
                <h4>AVAILABLE ASSAYS</h4>
            </div>
            <div className="card-body">
                {assaysList.map((assay, i) => {
                    const activeItems = assay.items.filter(
                        (item) => item[`tier_${currentTier}`]
                    );

                    return activeItems.length > 0 ? (
                        <div className="card-list assays" key={i}>
                            <h5>{assay.header}</h5>
                            <div className="card-list-icon-container">
                                <img
                                    src={assay.icon.src}
                                    alt={assay.icon.alt}
                                />
                                <AssayList list={activeItems} />
                            </div>
                        </div>
                    ) : null;
                })}
            </div>
        </div>
    );
};
