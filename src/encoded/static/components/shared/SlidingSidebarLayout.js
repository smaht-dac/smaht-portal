import React, { useState } from 'react';

const SlidingSidebarLayout = (props) => {
    const { children, openByDefault = true } = props;

    const [showNav, setShowNav] = useState(openByDefault);

    const childrenArray = React.Children.toArray(children);

    // Default to empty if no nav is passed
    const nav = childrenArray[0] || null;
    const body = childrenArray[1] || null;

    return (
        <div
            className={
                'sliding-sidebar-ui-container row' +
                (showNav ? ' show-nav' : ' collapse-nav')
            }>
            {nav && (
                <div className="sliding-sidebar-nav-container col-12 col-xl-2">
                    <div className="sliding-sidebar-nav">
                        <button
                            type="button"
                            className="toggle-button"
                            aria-label="Toggle Side Navigation"
                            aria-expanded={showNav}
                            onClick={() => setShowNav(!showNav)}>
                            {showNav ? (
                                <i className="icon icon-arrow-left fas"></i>
                            ) : (
                                <i className="icon icon-arrow-right fas"></i>
                            )}
                        </button>
                        {nav}
                    </div>
                </div>
            )}
            <div className="sliding-sidebar-layout-container col-12 col-xl-10">
                {body}
            </div>
        </div>
    );
};

export default SlidingSidebarLayout;
