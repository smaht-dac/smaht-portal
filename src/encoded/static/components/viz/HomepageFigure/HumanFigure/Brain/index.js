import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverTitle,
    PopoverContent,
} from 'react-bootstrap';
import { BrainSvg } from './BrainSvg';

export const Brain = ({ currentTier }) => {
    return (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="bottom"
            rootClose
            overlay={
                <Popover id="popover-human-figure-organ">
                    <PopoverTitle>Brain</PopoverTitle>
                    <PopoverContent>
                        Tissue samples from this area will be available in the{' '}
                        {currentTier} tier.
                    </PopoverContent>
                </Popover>
            }>
            <BrainSvg />
        </OverlayTrigger>
    );
};
