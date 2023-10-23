import React, { Component } from 'react';
import { ConsortiumMap } from './ConsortiumMap/ConsortiumMap';
import { Alluvial } from './Alluvial/Alluvial';

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
