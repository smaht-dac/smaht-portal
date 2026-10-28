import React, { useState, useEffect, useRef } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const CONFIG_ENDPOINT = '/get_somatic_variant_browser_config/';

const HIGLASS_OPTIONS = {
    bounded: true,
    editable: false,
};

/**
 * Loads the HiGlass view config for the Somatic Variant Browser from the backend.
 * `params` is sent as the JSON body and will be used to select datasets.
 */
function loadViewConfig(params, onSuccess, onError) {
    ajax.load(
        CONFIG_ENDPOINT,
        (resp) => {
            if (resp.error) {
                onError(resp.error_msg);
                return;
            }
            onSuccess(resp.data.viewconf);
        },
        'POST',
        (resp) => onError((resp && resp.error_msg) || 'Request failed.'),
        JSON.stringify(params || {})
    );
}

export const SomaticVariantBrowser = () => {
    // HiGlass (and Pixi) access the DOM at import time, so they are code-split
    // and only loaded client-side. `higlass` is stubbed out of the server bundle in webpack.config.js.
    const [HiGlassComponent, setHiGlassComponent] = useState(null);
    const [viewConfig, setViewConfig] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);
    const hgcRef = useRef(null);

    useEffect(() => {
        let isMounted = true;
        const onError = (msg) => {
            if (!isMounted) return;
            console.error('Somatic Variant Browser:', msg);
            setErrorMsg(msg || 'Unknown error.');
        };

        import(/* webpackChunkName: "higlass" */ 'higlass')
            .then((hglib) => {
                // Wrap in a function, otherwise React treats the component as a state updater.
                if (isMounted) setHiGlassComponent(() => hglib.HiGlassComponent);
            })
            .catch((err) => onError(err && err.message));

        loadViewConfig(
            {},
            (viewconf) => {
                if (isMounted) setViewConfig(viewconf);
            },
            onError
        );

        return () => {
            isMounted = false;
        };
    }, []);

    if (errorMsg) {
        return (
            <div className="somatic-variant-browser">
                <div className="alert alert-danger m-3">
                    Failed to load the Somatic Variant Browser. You might not
                    have permission to view this page.
                </div>
            </div>
        );
    }

    if (!HiGlassComponent || !viewConfig) {
        return (
            <div className="somatic-variant-browser">
                <div className="loader-container text-center m-5">
                    <span className="spinner">
                        <i className="icon icon-spin icon-circle-notch fas" />{' '}
                        Loading...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="somatic-variant-browser">
            <div className="higlass-container">
                <HiGlassComponent
                    ref={hgcRef}
                    viewConfig={viewConfig}
                    options={HIGLASS_OPTIONS}
                />
            </div>
        </div>
    );
};
