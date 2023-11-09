import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverTitle,
    PopoverContent,
} from 'react-bootstrap';
import { LungSvg } from './LungSvg';

export const Lung = ({ currentTier }) => {
    return (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="bottom"
            rootClose
            overlay={
                <Popover id="popover-human-figure-organ">
                    <PopoverTitle>Lung</PopoverTitle>
                    <PopoverContent>
                        Tissue samples from this area will be available in the{' '}
                        {currentTier} tier.
                    </PopoverContent>
                </Popover>
            }>
            <g data-svg-role="lung-group">
                <LungSvg />
            </g>
        </OverlayTrigger>
    );
};
