'use strict';

import React from 'react';
import _ from 'underscore';
import { pageTitleViews } from './../../PageTitleSection';
import { GuestHomeView } from './GuestHomeView';

/**
 * Homepage View component. Gets rendered at '/' and '/home' paths.
 *
 * @module {Component} static-pages/home
 * @prop {Object} context - Should have properties typically needed for any static page.
 */
export default class HomePage extends React.PureComponent {
    /**
     * The render function. Renders homepage contents.
     * @returns {Element} A React <div> element.
     */
    render() {
        const {
            session,
            context,
            alerts,
            schemas,
            windowHeight,
            windowWidth,
            updateAppSessionState,
        } = this.props;
        const commonProps = { session, context };
        // Render alerts here instead of (unused-for-homepage) PageTitleSection
        return (
            <div className="homepage-wrapper">
                <GuestHomeView
                    {...commonProps}
                    {...{ updateAppSessionState, alerts }}
                />
            </div>
        );
    }
}

const HomePageTitle = React.memo(function HomePageTitle(props) {
    const { session, alerts } = props;

    return null;
});

pageTitleViews.register(HomePageTitle, 'HomePage');
