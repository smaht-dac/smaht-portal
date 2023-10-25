import React from 'react';
import { HumanFigure } from './HumanFigure';
import { CLTCard } from './CLTCard';
import { AssaysCard } from './AssaysCard';

/**
 * Since the Tier selection component will determine which assays/tissues
 * will render, the logic should be handled here and passed down to the
 * child components.
 * CLTCard <-- cell line and tissues card list items
 * HumanFigure <-- list of body parts to highlight
 * AssaysCard <-- assays card list items
 * TierSelection <-- currentTier select
 */

const TierSelector = () => {
    return (
        <div className="selector-buttons">
            <button className="active">
                <span>Benchmarking</span>
            </button>
            <button className="">
                <span>Expansion</span>
            </button>
            <button className="">
                <span>Production</span>
            </button>
        </div>
    );
};

export const HomepageFigure = ({ currentTier = 'Benchmarking' }) => {
    // Must have ability to set the tier, might need to get this passed down
    // const [currentTier, setCurrentTier] = useState('Benchmarking');

    return (
        <div className="homepage-figure">
            <div className="homepage-figure-content">
                <CLTCard currentTier={currentTier} />
                <HumanFigure currentTier={currentTier} />
                <AssaysCard currentTier={currentTier} />
            </div>
            <div className="homepage-figure-tier-selector">
                <p className="footnote">
                    Select a tier below to see which tissues and assays will be
                    used
                </p>
                <TierSelector currentTier={currentTier} />
            </div>
        </div>
    );
};
