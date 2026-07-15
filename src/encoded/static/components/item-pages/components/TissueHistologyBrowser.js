import React, { useEffect, useRef, useState } from 'react';

const INFO_FIELDS = [
    { key: 'donorId', label: 'Donor ID' },
    { key: 'tissueType', label: 'Tissue Type' },
    { key: 'stain', label: 'Stain' },
    { key: 'magnification', label: 'Magnification' },
    { key: 'collectionDate', label: 'Collection Date' },
    { key: 'notes', label: 'Notes' },
];

export const TissueHistologyBrowser = ({ tileSource, tissueInfo = {} }) => {
    const viewerRef = useRef(null);
    const toolbarRef = useRef(null);
    const osdInstance = useRef(null);
    const [isFullPage, setIsFullPage] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function initViewer() {
            const OpenSeadragon = (await import('openseadragon')).default;

            if (!isMounted || !viewerRef.current) return;

            osdInstance.current = OpenSeadragon({
                element: viewerRef.current,
                // Registering our toolbar with OpenSeadragon lets it move the
                // toolbar along with the viewer when entering/exiting full page
                // mode, instead of it being left behind underneath the viewer.
                toolbar: toolbarRef.current,
                prefixUrl:
                    'https://openseadragon.github.io/openseadragon/images/',
                tileSources: tileSource,
                showNavigator: true,
                showNavigationControl: false,
            });

            osdInstance.current.addHandler('full-page', (event) => {
                setIsFullPage(event.fullPage);
            });
        }

        initViewer();

        return () => {
            isMounted = false;
            if (osdInstance.current) {
                osdInstance.current.destroy();
                osdInstance.current = null;
            }
        };
    }, [tileSource]);

    const onZoomIn = () => osdInstance.current?.viewport.zoomBy(1.2);
    const onZoomOut = () => osdInstance.current?.viewport.zoomBy(0.8);
    const onGoHome = () => osdInstance.current?.viewport.goHome();
    const onToggleFullPage = () =>
        osdInstance.current?.setFullPage(!isFullPage);

    return (
        <div className="histology-viewer">
            <div className="histology-viewer-main">
                <div className="histology-viewer-toolbar" ref={toolbarRef}>
                    <h4>Controls</h4>
                    <div
                        className="btn-group"
                        role="group"
                        aria-label="Tissue histology viewer controls">
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title="Zoom in"
                            onClick={onZoomIn}>
                            <i className="icon icon-fw fas icon-magnifying-glass-plus" />
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title="Zoom out"
                            onClick={onZoomOut}>
                            <i className="icon icon-fw fas icon-magnifying-glass-minus" />
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title="Reset view"
                            onClick={onGoHome}>
                            <i className="icon icon-fw fas icon-house" />
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title={
                                isFullPage ? 'Exit full page' : 'Full page'
                            }
                            onClick={onToggleFullPage}>
                            <i
                                className={
                                    'icon icon-fw fas ' +
                                    (isFullPage
                                        ? 'icon-compress'
                                        : 'icon-expand')
                                }
                            />
                        </button>
                    </div>
                </div>
                <div ref={viewerRef} className="histology-viewer-osd" />
                <div className="histology-viewer-info">
                    <h4>Sample Details</h4>
                    <dl>
                        {INFO_FIELDS.map(({ key, label }) => (
                            <div className="info-field" key={key}>
                                <dt>{label}</dt>
                                <dd>{tissueInfo[key] || '-'}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    );
};
