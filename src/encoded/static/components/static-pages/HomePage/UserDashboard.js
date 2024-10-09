'use strict';

import React from 'react';
import _ from 'underscore';

export const UserDashboard = React.memo(function UserDashboard({
    windowHeight,
    windowWidth,
}) {
    // const { schemas } = props;
    // We can turn container into container-wide to expand width
    // We can convert dashboard-header into tabs, similar to Item pages.
    // We can do novel stuff like sidebar menu or something.
    // Various options.

    // Since UserDashboard visible, we assume user is logged in.
    // We use email as unique component key for components
    // which need to make AJAX requests. This way we can just
    // re-initialize component upon 'Impersonate User' action
    // insteat of handling w. componentDidUpdate or similar.
    // const { uuid: userUUID = null } = JWT.getUserDetails() || {};

    return (
        <React.Fragment>
            <div className="dashboard-header">
                <div className="container-wide d-flex align-items-center justify-content-between">
                    <div className="align-items-center d-flex">
                        <i className="icon icon-fw icon-home fas me-1" />
                        <h5 className="mt-0 mb-0 text-400">Home Dashboard</h5>
                    </div>
                </div>
            </div>

            {/* We apply .bg-light class here instead of .container-wide child divs because home-dashboard-area height is calculated off of window height in stylesheet */}
            <div className="home-dashboard-area bg-light" id="content">
                User is logged in!
            </div>
        </React.Fragment>
    );
});
