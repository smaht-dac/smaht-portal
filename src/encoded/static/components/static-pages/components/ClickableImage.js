'use strict';

import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import Modal from 'react-bootstrap/esm/Modal';

/**
 * Image that opens a full-size view in a modal on click. Pass enlargedSrc to
 * show a larger image in the modal than the one displayed inline.
 *
 * Note: The click handling is self-contained rather than accepting an onClick
 * prop because react-jsx-parser, which renders jsx static section content,
 * strips any attribute starting with "on" by default.
 */
export const ClickableImage = React.memo(function ClickableImage(props) {
    const { src, enlargedSrc, alt, className } = props;
    const [enlarged, setEnlarged] = useState(false);

    const openEnlarged = useCallback(() => setEnlarged(true), []);
    const closeEnlarged = useCallback(() => setEnlarged(false), []);
    const onKeyDown = useCallback((event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setEnlarged(true);
        }
    }, []);

    if (!src) {
        return null;
    }

    return (
        <>
            <span
                className={
                    'clickable-image-container' +
                    (className ? ` ${className}` : '')
                }
                role="button"
                tabIndex={0}
                onClick={openEnlarged}
                onKeyDown={onKeyDown}>
                <img className="clickable-image" src={src} alt={alt} />
                <div className="clickable-image-overlay"></div>
                <i
                    className="icon icon-maximize fas clickable-image-expand-icon"
                    aria-hidden="true"
                />
            </span>
            {enlarged && (
                <Modal
                    show
                    onHide={closeEnlarged}
                    centered
                    size="lg"
                    className="clickable-image-modal">
                    <Modal.Header closeButton />
                    <Modal.Body>
                        <img src={enlargedSrc || src} alt={alt} />
                    </Modal.Body>
                </Modal>
            )}
        </>
    );
});

ClickableImage.propTypes = {
    src: PropTypes.string.isRequired,
    // Larger image shown in the modal, defaults to src
    enlargedSrc: PropTypes.string,
    alt: PropTypes.string,
    className: PropTypes.string,
};
