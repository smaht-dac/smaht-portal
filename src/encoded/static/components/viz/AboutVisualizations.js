import React from 'react';
import { ConsortiumMap } from './ConsortiumMap';
import {Alluvial} from './Alluvial/Alluvial';

export const AboutVisualizations = () => {
    return (
        <>
            <p>Below are some visualizations about the consortium</p>
            <div className='container pb-5'>
                <ConsortiumMap/>
            </div>
            <div className="alluvial-container container-full">
                <Alluvial />
            </div>
        </>
    )
}