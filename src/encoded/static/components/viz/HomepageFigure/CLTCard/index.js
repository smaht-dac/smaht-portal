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
                                // Looks like popperConfig's flip is broken here; might create an issue for that...
                                // auto-start and auto-end seem to give us left/right alignment on large screens and
                                // top/bottom on smaller ones; should suffice for now, in the absense of a better solution
                                placement="auto-start"
                                rootClose
                                overlay={
                                    <Popover
                                        id={item.title}
                                        className="md-w-25">
                                        <PopoverTitle>
                                            {item.title}
                                        </PopoverTitle>
                                        <PopoverContent>
                                            {item.data}
                                        </PopoverContent>
                                    </Popover>
                                }>
                                <div>
                                    <img
                                        src={item.iconSrc}
                                        alt={`${item.title} icon`}
                                    />
                                    <span>{item.title}</span>
                                </div>
                            </OverlayTrigger>
                        </li>
                    );
                } else {
                    return (
                        <li key={i}>
                            <div>
                                <img
                                    src={item.iconSrc}
                                    alt={`${item.title} icon`}
                                />
                                <span>{item.title}</span>
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
                    iconSrc: '/static/img/anatomy-icons/Brain.svg',
                    title: 'Brain (unrelated donors*)',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                    // TODO: Discuss implications adjusting overall popover style override for
                    // max-width in _bootstrap-theme-overrides.scss (potential effect on consortium map?)
                    data: (
                        <>
                            <div>Please Note:</div>
                            <div className="font-italic">
                                The donors for brain tissue differ from and are
                                unrelated to those who supplied other
                                benchmarking tissues (e.g. such as skin, liver,
                                lung, and colon).
                            </div>
                        </>
                    ),
                },
                {
                    // Added a second version of Brain, since they are meant to have slightly different titles
                    iconSrc: '/static/img/anatomy-icons/Brain.svg',
                    title: 'Brain: 4 subregions',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                    // TODO: Does this also require the same note as above?
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Sun-exposed skin.svg',
                    title: 'Sun-exposed skin',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    // TODO: Double check that it was correct to remove this from just Tier 0
                    iconSrc: '/static/img/anatomy-icons/Non-exposed skin.svg',
                    title: 'Non-exposed skin',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Adrenal Gland.svg',
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
                    iconSrc: '/static/img/anatomy-icons/Heart.svg',
                    title: 'Heart',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Blood.svg',
                    title: 'Blood',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Skeletal Muscle.svg',
                    title: 'Skeletal Muscle',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Aorta.svg',
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
                    iconSrc: '/static/img/anatomy-icons/Liver.svg',
                    title: 'Liver',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Lung.svg',
                    title: 'Lung',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Ascending Colon.svg',
                    title: 'Ascending Colon',
                    benchmarking: true,
                    expansion: true,
                    production: true,
                },
                {
                    // TODO: Double check it was correct to remove this from just tier 0
                    iconSrc: '/static/img/anatomy-icons/Descending Colon.svg',
                    title: 'Descending Colon',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Esophagus.svg',
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
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'COLO829 Mixture',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'HapMap Mixture',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'iPSC & Fibroblast',
                    benchmarking: true,
                    expansion: false,
                    production: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
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
                    iconSrc: '/static/img/anatomy-icons/Buccal Swab.svg',
                    title: 'Buccal Swab',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Fibroblast.svg',
                    title: 'Skin Fibroblast',
                    benchmarking: false,
                    expansion: true,
                    production: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Testes or Ovary.svg',
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
                {currentTier === 'benchmarking' ? (
                    <h4>CELL LINES &amp; TISSUES</h4>
                ) : (
                    <h4>TISSUES</h4>
                )}
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
