'use strict';

import React from 'react';

/** Component which displays a banner at top of page informing users about this portal containing test data. */
export class TestWarning extends React.PureComponent {
    constructor(props) {
        super(props);
        this.handleClose = this.handleClose.bind(this);
    }

    handleClose(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        if (typeof this.props.setHidden === 'function') {
            this.props.setHidden(evt);
            return;
        }
    }

    render() {
        const { visible, message } = this.props;
        if (!visible || !message) return null;
        return (
            <div className="test-warning">
                <div className="container">
                    <div className="row">
                        <div
                            className="col-11 text-container"
                            style={{ fontSize: '13.5px' }}>
                            <i className="icon fas icon-fw icon-triangle-exclamation circle-icon d-none d-md-inline-block" />
                            <span>{message}</span>
                        </div>
                        <div className="col-1 close-button-container">
                            <a
                                className="test-warning-close icon icon-times fas"
                                title="Hide"
                                onClick={this.handleClose}
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
