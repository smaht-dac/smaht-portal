import React, { useState } from 'react';

/**
 * A component for toggling the visibility of additional information. It
 * displays a button that, when clicked, shows or hides the information. It
 * changes its text and icon based on the visibility state, `expanded` or
 * `collapsed`.
 * @param {Object} props - The component props.
 * @param {string} props.id - The ID of the component.
 * @param {string} props.cls - Additional CSS classes for styling.
 * @param {ReactNode} props.children - The content to be toggled.
 * @param {boolean} props.useToggle - Flag to determine if the toggle functionality should be used.
 * @param {boolean} [props.defaultShow=false] - Initial visibility state.
 * @param {string} [props.collapsedText='Show more'] - Button text for collapsed state.
 * @param {string} [props.expandedText='Show less'] - Button text for expanded state.
 * @param {string} [props.collapsedIcon='angle-down'] - Font Awesome icon name for collapsed state.
 * @param {string} [props.expandedIcon='angle-up'] - Font Awesome icon name for expanded state.
 * @returns {JSX.Element} The rendered component.
 *
 * Note: This component expects a fontawesome icon name
 */
export const ShowHideInformationToggle = ({
    id,
    cls,
    children,
    useToggle,
    defaultShow = false,
    collapsedText = 'Show more',
    expandedText = 'Show less',
    collapsedIcon = 'angle-down',
    expandedIcon = 'angle-up',
}) => {
    const [showInformation, setShowInformation] = useState(defaultShow);

    if (useToggle) {
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
                        className={`icon icon-${
                            showInformation ? expandedIcon : collapsedIcon
                        } fas me-05`}></i>
                    <span className="toggle-information-text">
                        {showInformation ? expandedText : collapsedText}
                    </span>
                </button>
            </div>
        );
    }
    return children;
};
