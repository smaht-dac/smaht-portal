import React, { useState } from 'react';

export const ShowHideInformationToggle = ({ id, cls, children }) => {
    const [showInformation, setShowInformation] = useState(false);

    return (
        <div className="show-hide-information-toggle">
            <div
                className={
                    'toggle-information-container' +
                    (showInformation ? ' expanded' : ' collapsed')
                }
                id={id}>
                <div className={cls}>{children}</div>
            </div>
            <button
                type="button"
                onClick={() => setShowInformation(!showInformation)}
                className="toggle-information-text-button btn btn-link btn-sm shadow-none p-0"
                aria-label="Toggle full description"
                aria-expanded={showInformation}>
                <i
                    className={`icon icon-angle-${
                        showInformation ? 'up' : 'down'
                    } fas mr-05`}></i>
                <span className="toggle-information-text">
                    Show{showInformation ? ' less' : ' more'}
                </span>
            </button>
        </div>
    );
};
