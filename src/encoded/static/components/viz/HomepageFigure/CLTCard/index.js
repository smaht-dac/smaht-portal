import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverBody,
    PopoverHeader,
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
                                        <PopoverHeader>
                                            {item.title}
                                        </PopoverHeader>
                                        <PopoverBody>{item.data}</PopoverBody>
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
                    title: 'Brain: unrelated donors',
                    tier_0: true,
                    tier_1: false,
                    // TODO: Discuss implications adjusting overall popover style override for
                    // max-width in _bootstrap-theme-overrides.scss (potential effect on consortium map?)
                    data: (
                        <>
                            <div>Please Note:</div>
                            <div className="fst-italic">
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
                    tier_0: false,
                    tier_1: true,
                    // TODO: Does this also require the same note as above?
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Sun-exposed skin.svg',
                    title: 'Sun-exposed skin',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    // TODO: Double check that it was correct to remove this from just Tier 0
                    iconSrc: '/static/img/anatomy-icons/Non-exposed skin.svg',
                    title: 'Non-exposed skin',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Adrenal Gland.svg',
                    title: 'Adrenal medulla',
                    tier_0: false,
                    tier_1: true,
                },
            ],
        },
        {
            header: 'Mesoderm Tissues',
            items: [
                {
                    iconSrc: '/static/img/anatomy-icons/Heart.svg',
                    title: 'Heart',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Blood.svg',
                    title: 'Blood',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Skeletal Muscle.svg',
                    title: 'Skeletal Muscle',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Aorta.svg',
                    title: 'Aorta',
                    tier_0: false,
                    tier_1: true,
                },
            ],
        },
        {
            header: 'Endoderm Tissues',
            items: [
                {
                    iconSrc: '/static/img/anatomy-icons/Liver.svg',
                    title: 'Liver',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Lung.svg',
                    title: 'Lung',
                    tier_0: true,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Colon.svg',
                    title: 'Colon',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Ascending Colon.svg',
                    title: 'Ascending Colon',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    // TODO: Double check it was correct to remove this from just tier 0
                    iconSrc: '/static/img/anatomy-icons/Descending Colon.svg',
                    title: 'Descending Colon',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Esophagus.svg',
                    title: 'Esophagus',
                    tier_0: false,
                    tier_1: true,
                },
            ],
        },
        {
            header: 'Cell Line Mixtures',
            items: [
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'COLO829 Mixture',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'HapMap Mixture',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'iPSC & Fibroblast',
                    tier_0: true,
                    tier_1: false,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Cell Line Mixture.svg',
                    title: 'Descending Colon',
                    tier_0: false,
                    tier_1: false,
                },
            ],
        },
        {
            header: 'Other Tissues',
            items: [
                {
                    iconSrc: '/static/img/anatomy-icons/Buccal Swab.svg',
                    title: 'Buccal Swab',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Fibroblast.svg',
                    title: 'Skin Fibroblast',
                    tier_0: false,
                    tier_1: true,
                },
                {
                    iconSrc: '/static/img/anatomy-icons/Testes or Ovary.svg',
                    title: 'Testis / Ovary',
                    tier_0: false,
                    tier_1: true,
                },
            ],
        },
    ];

    return (
        <div className="card clt">
            <div className="card-header">
                {currentTier === 0 ? (
                    <h4>CELL LINES &amp; TISSUES</h4>
                ) : (
                    <h4>TISSUES</h4>
                )}
            </div>
            <div className="card-body">
                {cltList.map((clt, i) => {
                    const activeItems = clt.items.filter(
                        (item) => item[`tier_${currentTier}`]
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
