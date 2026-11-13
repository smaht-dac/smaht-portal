import { enableGeoTIFFTileSource } from 'geotiff-tilesource';

/**
 * Registers `OpenSeadragon.GeoTIFFTileSource`, which reads tiled TIFFs with
 * HTTP range requests instead of fetching pre-cut tile images.
 *
 * The plugin's default decoding worker URL points at its own build's
 * `/assets/` folder, which the portal doesn't serve. Instead, webpack bundles
 * the worker (resolved through the `geotiff-tilesource-worker` alias in
 * webpack.config.js) and the plugin is handed a factory for it.
 */
export function enableTiffTileSource(OpenSeadragon) {
    if (OpenSeadragon.GeoTIFFTileSource) return;

    enableGeoTIFFTileSource(OpenSeadragon, {
        workerPool: {
            createWorker: () =>
                new Worker(new URL('geotiff-tilesource-worker', import.meta.url), {
                    type: 'module',
                }),
        },
    });
}
