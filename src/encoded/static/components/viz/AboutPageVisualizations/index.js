import React, { Component } from 'react';
import { ConsortiumMap } from './ConsortiumData/ConsortiumMap';
import { Alluvial } from './Alluvial/Alluvial';

export default class AboutPageVisualizations extends Component {
    render() {
        return (
            <>
                <div className="consortium-map-container container py-5">
                    <ConsortiumMap />
                </div>
                <div className="alluvial-container container py-5">
                    <Alluvial />
                </div>
            </>
        );
    }
}
