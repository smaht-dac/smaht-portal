import React, { useEffect, useRef, useState } from 'react';

const INFO_FIELDS = [
    { key: 'donorId', label: 'Donor ID' },
    { key: 'tissueType', label: 'Tissue Type' },
    { key: 'stain', label: 'Stain' },
    { key: 'magnification', label: 'Magnification' },
    { key: 'micronsPerPixel', label: 'Microns / Pixel', suffix: ' µm' },
    { key: 'collectionDate', label: 'Collection Date' },
    { key: 'notes', label: 'Notes' },
];

// No item schema currently stores slide calibration (microns per pixel of the
// full-resolution image), so this placeholder stands in for it until a real
// field exists (e.g. on HistologyImage). Used to size the scale bar below.
const DEFAULT_MICRONS_PER_PIXEL = 0.25;

// "Nice" round scale-bar lengths (microns) to choose from as the user zooms.
const SCALE_BAR_STEPS_UM = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000,
    100000,
];
const SCALE_BAR_MAX_WIDTH_PX = 150;

function formatScaleBarLabel(microns) {
    if (microns >= 1000) {
        return `${microns / 1000} mm`;
    }
    return `${microns} µm`;
}

function pickScaleBarStepUm(micronsPerScreenPixel) {
    let [chosen] = SCALE_BAR_STEPS_UM;
    for (const step of SCALE_BAR_STEPS_UM) {
        if (step / micronsPerScreenPixel <= SCALE_BAR_MAX_WIDTH_PX) {
            chosen = step;
        } else {
            break;
        }
    }
    return chosen;
}

export const TissueHistologyBrowser = ({ tileSource, tissueInfo = {} }) => {
    const viewerRef = useRef(null);
    const toolbarRef = useRef(null);
    const osdInstance = useRef(null);
    const [isFullPage, setIsFullPage] = useState(false);
    const [viewerState, setViewerState] = useState({
        canZoomIn: true,
        canZoomOut: true,
        isHome: true,
    });
    const [scaleBar, setScaleBar] = useState(null);

    const micronsPerPixel =
        tissueInfo.micronsPerPixel || DEFAULT_MICRONS_PER_PIXEL;
    const displayInfo = { ...tissueInfo, micronsPerPixel };

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

            const viewer = osdInstance.current;

            // OpenSeadragon has no built-in scale bar or zoom-limit-aware button
            // state, so both are derived here from its viewport API, recomputed
            // on every pan/zoom/resize via 'update-viewport'.
            const updateViewerState = () => {
                const { viewport } = viewer;
                if (!viewport) return;

                const zoom = viewport.getZoom();
                const minZoom = viewport.getMinZoom();
                const maxZoom = viewport.getMaxZoom();
                const homeZoom = viewport.getHomeZoom();
                const homeBounds = viewport.getHomeBounds();
                const bounds = viewport.getBounds();

                const isHome =
                    Math.abs(zoom - homeZoom) < homeZoom * 0.001 &&
                    Math.abs(bounds.x - homeBounds.x) <
                        homeBounds.width * 0.001 &&
                    Math.abs(bounds.y - homeBounds.y) <
                        homeBounds.width * 0.001;

                setViewerState({
                    canZoomIn: zoom < maxZoom * 0.999,
                    canZoomOut: zoom > minZoom * 1.001,
                    isHome,
                });

                const p0 = viewport.imageToViewerElementCoordinates(
                    new OpenSeadragon.Point(0, 0)
                );
                const p1 = viewport.imageToViewerElementCoordinates(
                    new OpenSeadragon.Point(1, 0)
                );
                const screenPxPerImagePx = Math.abs(p1.x - p0.x);
                if (screenPxPerImagePx > 0) {
                    const micronsPerScreenPx =
                        micronsPerPixel / screenPxPerImagePx;
                    const stepUm = pickScaleBarStepUm(micronsPerScreenPx);
                    setScaleBar({
                        widthPx: stepUm / micronsPerScreenPx,
                        label: formatScaleBarLabel(stepUm),
                    });
                }
            };

            viewer.addHandler('open', updateViewerState);
            viewer.addHandler('update-viewport', updateViewerState);

            viewer.addHandler('full-page', (event) => {
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
    }, [tileSource, micronsPerPixel]);

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
                            disabled={!viewerState.canZoomIn}
                            onClick={onZoomIn}>
                            <i className="icon icon-fw fas icon-magnifying-glass-plus" />
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title="Zoom out"
                            disabled={!viewerState.canZoomOut}
                            onClick={onZoomOut}>
                            <i className="icon icon-fw fas icon-magnifying-glass-minus" />
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-secondary"
                            title="Reset view"
                            disabled={viewerState.isHome}
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
                {scaleBar && (
                    <div className="histology-viewer-scalebar">
                        <div
                            className="scalebar-line"
                            style={{ width: `${scaleBar.widthPx}px` }}
                        />
                        <div className="scalebar-label">
                            {scaleBar.label}
                        </div>
                    </div>
                )}
                <div className="histology-viewer-info">
                    <h4>Sample Details</h4>
                    <dl>
                        {INFO_FIELDS.map(({ key, label, suffix }) => (
                            <div className="info-field" key={key}>
                                <dt>{label}</dt>
                                <dd>
                                    {displayInfo[key]
                                        ? `${displayInfo[key]}${suffix || ''}`
                                        : '-'}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>
        </div>
    );
};
