import React from 'react';
// import { HumanFigure } from './HumanFigure';
import { CLTCard } from './CLTCard';
import { AssaysCard } from './AssaysCard';

export const HomepageFigure = () => {
    return (
        <div className="homepage-figure">
            <CLTCard />
            {/* <HumanFigure /> */}
            <AssaysCard />
        </div>
    );
};
