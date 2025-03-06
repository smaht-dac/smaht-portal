import React, { Component } from 'react';
import { ConsortiumMap } from './ConsortiumMap';
import { Alluvial } from './Alluvial';

export default class AboutPageVisualizations extends Component {
    render() {
        return (
            <>
                <ConsortiumMap />
                <Alluvial />
            </>
        );
    }
}
