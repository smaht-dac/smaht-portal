import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverContent,
    PopoverTitle,
} from 'react-bootstrap';

const CLTList = ({ list }) => {
    return (
        <ul>
            {list.map((item, i) => {
                if (item.data) {
                    return (
                        <li key={i}>
                            <OverlayTrigger
                                trigger={['hover', 'focus']}
                                placement="right"
                                rootClose
                                overlay={
                                    <Popover id="">
                                        <PopoverTitle>
                                            {item.title}
                                        </PopoverTitle>
                                        <PopoverContent>
                                            Additional information about{' '}
                                            {item.title} here
                                        </PopoverContent>
                                    </Popover>
                                }>
                                <div>
                                    <img src={item.iconSrc} />
                                    {item.title}
                                </div>
                            </OverlayTrigger>
                        </li>
                    );
                } else {
                    return (
                        <li key={i}>
                            <div>
                                <img src={item.iconSrc} />
                                {item.title}
                            </div>
                        </li>
                    );
                }
            })}
        </ul>
    );
};

// CLT = Cell Lines and Tissues
export const CLTCard = ({ currentTier }) => {
    const cltList = [
        {
            header: 'Ectoderm Tissues',
            items: [
                {
                    iconSrc: '',
                    title: 'Brain: 5 subregions',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Sun-exposed skin',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Non-exposed skin',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Adrenal medulla',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
            ],
        },
        {
            header: 'Mesoderm Tissues',
            items: [
                {
                    iconSrc: '',
                    title: 'Heart',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Adispose Tissue',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Blood',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Skeletal Muscle',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Aorta',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
            ],
        },
        {
            header: 'Endoderm Tissues',
            items: [
                {
                    iconSrc: '',
                    title: 'Liver',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Lung',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Ascending Colon',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Descending Colon',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Esophagus',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
            ],
        },
        {
            header: 'Cell Line Mixtures',
            items: [
                {
                    iconSrc: '',
                    title: 'COLO829 Mixture',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'HapMap Mixture',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'iPSC & Fibroblast',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '',
                    title: 'Descending Colon',
                    benchmarking: false,
                    expansion: false,
                    production: false,
                },
            ],
        },
        {
            header: 'Other Tissues',
            items: [
                {
                    iconSrc: '',
                    title: 'Buccal Swab',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Skin Fibroblast',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '',
                    title: 'Testis / Ovary',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
            ],
        },
    ];

    return (
        <div className="card clt">
            <div className="card-header">
                <h4>CELL LINES &amp; TISSUES</h4>
            </div>
            <div className="card-body">
                {cltList.map((clt, i) => {
                    const activeItems = clt.items.filter(
                        (item) => item[currentTier]
                    );

                    return activeItems.length > 0 ? (
                        <div className="card-list clt" key={i}>
                            <h5>{clt.header}</h5>
                            <CLTList list={activeItems} />
                        </div>
                    ) : null;
                })}
            </div>
        </div>
    );
};
