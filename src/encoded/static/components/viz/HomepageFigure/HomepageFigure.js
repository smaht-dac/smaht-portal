import React from 'react';
import { HumanFigure } from './HumanFigure';
import { CLTCard } from './CLTCard';
import { AssaysCard } from './AssaysCard';
import { TierSelection } from '.';

export const HomepageFigure = () => {
    // Must have ability to set the tier, might need to get this passed down
    const [currentTier, setCurrentTier] = useState('Benchmarking');

    return (
        <div className="homepage-figure">
            <CLTCard />
            <HumanFigure />
            <AssaysCard />
            <TierSelection />
        </div>
    );
};
