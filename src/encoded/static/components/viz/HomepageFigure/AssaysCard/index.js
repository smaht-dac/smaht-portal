import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverBody,
    PopoverHeader,
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
                                        <PopoverHeader>
                                            {item.title}
                                        </PopoverHeader>
                                        <PopoverBody>
                                            Additional information about{' '}
                                            {item.title} here
                                        </PopoverBody>
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
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'Ultima Genomics',
                    tier_0: true,
                    tier_1: true,
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
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'ONT',
                    tier_0: true,
                    tier_1: true,
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
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'MAS-Seq',
                    tier_0: true,
                    tier_1: true,
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
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'MALBAC',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'PTA and PTA-HAT-Seq',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'Cas9-targeted seq',
                    tier_0: true,
                    tier_1: false,
                },
            ],
        },
        {
            header: 'Single-cell RNA-Seq',
            iconSrc: '/static/img/assay-icons/Single-cell RNA-Seq.svg',
            items: [
                {
                    iconSrc: '',
                    title: 'snRNA-Seq',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'STORM-Seq',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'Tranquil-Seq',
                    tier_0: true,
                    tier_1: false,
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
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'CODEC',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'Duplex sequencing',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'HiDEF-Seq',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'CompDuplex-Seq',
                    tier_0: true,
                    tier_1: false,
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
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'Fiber-Seq',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'Hi-C',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '',
                    title: 'GoTchA',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '',
                    title: 'ATAC-Seq/MetaCS',
                    tier_0: true,
                    tier_1: false,
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
