import React, { useEffect, useRef } from 'react';

export const TissueHistologyBrowser = ({ tileSource }) => {
    const viewerRef = useRef(null);
    const osdInstance = useRef(null);

    useEffect(() => {
        let isMounted = true;

        async function initViewer() {
            const OpenSeadragon = (await import('openseadragon')).default;

            if (!isMounted || !viewerRef.current) return;

            osdInstance.current = OpenSeadragon({
                element: viewerRef.current,
                prefixUrl:
                    'https://openseadragon.github.io/openseadragon/images/',
                tileSources: tileSource,
                showNavigator: true,
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

    return <div ref={viewerRef} style={{ width: '100%', height: '600px' }} />;
};
