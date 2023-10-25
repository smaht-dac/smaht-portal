import React from 'react';

const CLTList = ({ list }) => {
    return (
        <ul>
            {list.map((item, i) => {
                return <li key={i}>{item.title}</li>;
            })}
        </ul>
    );
};

// CLT = Cell Lines and Tissues
export const CLTCard = () => {
    const cltList = [
        {
            header: 'Ectoderm Tissues',
            items: [
                { icon: '', title: 'Brain: 5 subregions' },
                { icon: '', title: 'Sun-exposed skin' },
                { icon: '', title: 'Non-exposed skin' },
            ],
        },
        {
            header: 'Endoderm Tissues',
            items: ['Liver', 'Lung', 'Ascending Colon', 'Descending Colon'],
        },
    ];
    return (
        <div className="card clt">
            <div className="card-header">
                <h4>CELL LINES &amp; TISSUES</h4>
            </div>
            <div className="card-body">
                {cltList.map((clt, i) => {
                    return (
                        <div>
                            <h5>{clt.header}</h5>
                            <CLTList list={clt.items} />
                        </div>
                    );
                })}
                <h5>Ectoderm Tissues</h5>
                <ul></ul>
            </div>
        </div>
    );
};
