import { visibleValue } from './display-policy';

export const itemURL = (identifier) => {
    if (typeof identifier !== 'string' || !identifier.trim())
        throw new Error('Enter an item identifier.');
    const url = new URL(identifier.trim(), location.origin + '/');
    if (url.origin !== location.origin || url.username || url.password)
        throw new Error('Use an item from this portal only.');
    url.search = '';
    url.hash = '';
    return url;
};
async function json(url, signal) {
    // mode=same-origin also rejects redirects to other origins; cookies never go there.
    const response = await fetch(url, {
        method: 'GET',
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
    });
    if (!response.ok)
        throw new Error(`Portal returned HTTP ${response.status}.`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0,
        text = '';
    try {
        let finished = false;
        while (!finished) {
            // Streaming reads must be sequential to enforce the response size limit.
            // eslint-disable-next-line no-await-in-loop
            const { done, value } = await reader.read();
            finished = done;
            if (done) break;
            size += value.byteLength;
            if (size > 16 * 1024 * 1024)
                throw new Error('Response exceeds the 16 MB limit.');
            text += decoder.decode(value, { stream: true });
        }
        return JSON.parse(text + decoder.decode());
    } catch (error) {
        await reader.cancel();
        throw error;
    } finally {
        reader.releaseLock();
    }
}

export async function loadItem(identifier, requestedFrame, signal) {
    const frame = requestedFrame || 'auto';
    if (
        ![
            'auto',
            'raw',
            'object',
            'embedded',
            'page',
            'columns',
            'expand',
        ].includes(frame)
    )
        throw new Error('Unsupported frame.');
    const frameURL = (base, name) => {
        const url = new URL(base);
        url.searchParams.set('frame', name);
        url.searchParams.set('datastore', 'database');
        if (name === 'raw') url.searchParams.set('upgrade', 'false');
        return url;
    };
    const object = await json(frameURL(itemURL(identifier), 'object'), signal);
    if (
        !object ||
        Array.isArray(object) ||
        typeof object['@id'] !== 'string' ||
        !Array.isArray(object['@type']) ||
        !object['@type'].length ||
        object['@graph']
    )
        throw new Error('Enter a single item, not a search or collection.');
    const canonical = itemURL(object['@id']);
    const names = ['raw', 'embedded', 'profile'];
    const urls = [
        frameURL(canonical, 'raw'),
        frameURL(canonical, 'embedded'),
        new URL(
            '/profiles/' + encodeURIComponent(object['@type'][0]) + '.json',
            location.origin
        ),
    ];
    if (['page', 'columns', 'expand'].includes(frame)) {
        names.push(frame);
        urls.push(frameURL(canonical, frame));
    }
    const results = await Promise.allSettled(
        urls.map((url) => json(url, signal))
    );
    const bundle = {
        environment: location.host,
        id: object['@id'],
        types: object['@type'],
        object,
        raw: null,
        embedded: null,
        profile: null,
        notes: [],
        fetchedAt: new Date().toISOString(),
    };
    names.forEach((name, i) => {
        const result = results[i];
        if (result.status !== 'fulfilled')
            bundle.notes.push(`${name} unavailable: ${result.reason.message}`);
        else if (
            !result.value ||
            typeof result.value !== 'object' ||
            Array.isArray(result.value)
        )
            bundle.notes.push(`${name} unavailable: invalid response.`);
        else if (
            name !== 'profile' &&
            object.uuid &&
            result.value.uuid &&
            object.uuid !== result.value.uuid
        )
            bundle.notes.push(`${name} identity differs; frame ignored.`);
        else bundle[name] = result.value;
    });
    bundle.frame =
        frame === 'auto' ? (bundle.embedded ? 'embedded' : 'object') : frame;
    bundle.view = bundle[bundle.frame];
    if (!bundle.view) throw new Error(`Requested ${frame} frame unavailable.`);

    return visibleValue(bundle);
}
