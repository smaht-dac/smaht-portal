'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import Collapse from 'react-bootstrap/esm/Collapse';
import { responsiveGridState } from './../../util/layout';

export class CollapsibleItemViewButtonToolbar extends React.PureComponent {
    static defaultProps = {
        collapseButtonTitle: function (isOpen) {
            return (
                <React.Fragment>
                    <i
                        className={
                            'icon icon-fw fas icon-' +
                            (isOpen ? 'angle-up' : 'ellipsis-v')
                        }
                    />
                    &nbsp; Options
                </React.Fragment>
            );
        },
    };

    constructor(props) {
        super(props);
        this.toggleOpenMenu = _.throttle(this.toggleOpenMenu.bind(this), 1000);
        this.wrapChildForMobile = this.wrapChildForMobile.bind(this);
        this.state = { open: false, mounted: false };
    }

    componentDidMount() {
        this.setState({ mounted: true });
    }

    toggleOpenMenu() {
        this.setState(function (currState) {
            return { open: !currState.open };
        });
    }

    wrapChildForMobile(elem, idx = 0) {
        var className = 'mobile-size-elem mb-05' + (idx !== 0 ? ' mt-05' : '');

        return <div className={className}>{elem}</div>;
    }

    render() {
        const { mounted, open } = this.state;
        if (!mounted) {
            return (
                <div className="text-medium" key="loading-indicator">
                    <i className="icon icon-fw icon-circle-notch fas icon-spin" />
                    &nbsp;&nbsp;&nbsp;&nbsp;
                </div>
            );
        }

        const {
            children,
            windowWidth,
            collapseButtonTitle,
            tooltip,
            constantButtons,
        } = this.props;
        const gridState = mounted && responsiveGridState(windowWidth);
        const isMobileSize =
            gridState && ['xs', 'sm', 'md'].indexOf(gridState) > -1;
        const isOpen = !isMobileSize || open;

        return (
            <div className="tabview-title-controls-container">
                {isMobileSize ? (
                    <Collapse in={isOpen} data-tip={tooltip}>
                        <div
                            className="inner-panel"
                            key="inner-collapsible-panel">
                            {Array.isArray(children)
                                ? _.map(children, this.wrapChildForMobile)
                                : this.wrapChildForMobile(children)}
                            <hr />
                        </div>
                    </Collapse>
                ) : null}
                <div className="toolbar-wrapper" key="toolbar">
                    <div
                        className="btn-toolbar"
                        role="toolbar"
                        data-tip={isMobileSize ? null : tooltip}>
                        {!isMobileSize && children}
                        <button
                            className="btn btn-outline-dark d-lg-none d-xl-none toggle-open-button"
                            onClick={this.toggleOpenMenu}
                            key="collapse-toggle-btn"
                            type="button">
                            {typeof collapseButtonTitle === 'function'
                                ? collapseButtonTitle(isOpen)
                                : collapseButtonTitle}
                        </button>
                        {constantButtons}
                    </div>
                </div>
            </div>
        );
    }
}
