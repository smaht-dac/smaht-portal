import React from 'react';
import {
    OverlayTrigger,
    Popover,
    PopoverTitle,
    PopoverContent,
} from 'react-bootstrap';
import { HumanOutlineSvg } from './HumanOutlineSvg';

export const HumanOutline = ({ currentTier }) => {
    return (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="bottom"
            rootClose
            overlay={
                <Popover id="popover-human-figure">
                    <PopoverTitle>Human Figure</PopoverTitle>
                    <PopoverContent>
                        Tissue samples from this area will be available in the{' '}
                        {currentTier} tier.
                    </PopoverContent>
                </Popover>
            }>
            <HumanOutlineSvg />
        </OverlayTrigger>
    );
};
