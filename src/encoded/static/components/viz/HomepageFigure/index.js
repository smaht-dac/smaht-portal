import React from 'react';
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

const TierSelector = ({ currentTier, setCurrentTier }) => {
    return (
        <div className="selector-buttons">
            <div className={'backdrop' + ' tier-' + currentTier}></div>
            <button
                onClick={() => setCurrentTier(0)}
                className={currentTier === 0 ? 'active' : ''}>
                <span>Tier 0</span>
            </button>
            <button
                onClick={() => setCurrentTier(1)}
                className={currentTier === 1 ? 'active' : ''}>
                <span>Tier 1</span>
            </button>
        </div>
    );
};

export const HomepageFigure = ({ currentTier, setCurrentTier }) => {
    return (
        <div className="homepage-figure">
            <div className="homepage-figure-content">
                <CLTCard currentTier={currentTier} />
                <div className="human-figure-container">
                    <img
                        src="/static/img/homepage_human_figure.svg"
                        alt="Human figure diagram"
                    />
                </div>
                <AssaysCard currentTier={currentTier} />
            </div>
            <div className="homepage-figure-tier-selector">
                <p className="footnote">
                    Select a tier below to see which tissues and assays will be
                    used
                </p>
                <TierSelector
                    currentTier={currentTier}
                    setCurrentTier={setCurrentTier}
                />
            </div>
        </div>
    );
};
