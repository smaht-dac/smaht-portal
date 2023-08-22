import React, { Component } from 'react';
import { ConsortiumMap } from './ConsortiumMap';
import { Alluvial } from './Alluvial/Alluvial';

export default class AboutVisualizations extends Component {
    
    render() {
        return (
                <>
                    <div className='container pb-5'>
                        <ConsortiumMap/>
                    </div>
                    <div className="alluvial-container container-full">
                        <Alluvial />
                    </div>
                </>
        )
    }
}