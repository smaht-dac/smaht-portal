import React from 'react';
import OverlayTrigger from 'react-bootstrap/esm/OverlayTrigger';
import Popover from 'react-bootstrap/esm/Popover';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const labels = {
    linkTo: 'Link',
    calculated: 'Calculated',
    reverse: 'Reverse',
};
export const visibleEdge = (edge, kinds) =>
    kinds.includes(edge.kind) || (edge.reverse && kinds.includes('reverse'));
export const edgeLabel = (edge) =>
    edge.reverse && edge.kind === 'calculated'
        ? 'Calculated · Reverse'
        : labels[edge.kind];
export const shortValue = (value) =>
    Array.isArray(value)
        ? `Array (${value.length})`
        : value && typeof value === 'object'
            ? value.display_title ||
          value['@id'] ||
          `Object (${Object.keys(value).length} fields)`
            : JSON.stringify(value);
export function Badge({ children, kind = '' }) {
    return <span className={`se-badge ${kind}`}>{children}</span>;
}
export function SourceLinks({ sources = [], onSource }) {
    return (
        <span className="se-sources">
            {sources.filter(Boolean).map((source, i) => (
                <button
                    type="button"
                    key={`${source.file}:${source.line}:${i}`}
                    onClick={() => onSource(source)}>
                    {source.file.split('/').slice(-2).join('/')}:{source.line} <i className="icon icon-fw icon-external-link-alt fas" aria-hidden="true" />
                </button>
            ))}
        </span>
    );
}
export function Filters({ kinds, onChange }) {
    return (
        <span className="se-filters">
            {Object.entries(labels).map(([kind, label]) => (
                <label key={kind}>
                    <input
                        type="checkbox"
                        checked={kinds.includes(kind)}
                        onChange={() =>
                            onChange(
                                kinds.includes(kind)
                                    ? kinds.filter((k) => k !== kind)
                                    : [...kinds, kind]
                            )
                        }
                    />
                    <Badge kind={kind}>{label}</Badge>
                </label>
            ))}
        </span>
    );
}
export function linkTargets(schema) {
    const targets = new Set();
    function visit(value) {
        if (!value || typeof value !== 'object') return;
        (Array.isArray(value.linkTo) ? value.linkTo : [value.linkTo])
            .filter((v) => typeof v === 'string')
            .forEach((v) => targets.add(v));
        if (Array.isArray(value.items)) value.items.forEach(visit);
        else visit(value.items);
        ['anyOf', 'oneOf', 'allOf', 'prefixItems'].forEach((key) =>
            value[key]?.forEach?.(visit)
        );
    }
    visit(schema);
    return [...targets];
}
export function portalRequest(url, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException('Cancelled', 'AbortError'));
            return;
        }
        const abort = () => {
            xhr.abort();
            reject(new DOMException('Cancelled', 'AbortError'));
        };
        const finish = (callback, value) => {
            signal?.removeEventListener('abort', abort);
            callback(value);
        };
        const xhr = ajax.load(
            url,
            (value) => finish(resolve, value),
            'GET',
            (error, response) =>
                finish(
                    reject,
                    new Error(
                        error.detail ||
                            error.description ||
                            `Portal returned HTTP ${response.status}.`
                    )
                )
        );
        signal?.addEventListener('abort', abort, { once: true });
    });
}
export async function exportPNG(svg, name) {
    await document.fonts?.ready;
    const clone = svg.cloneNode(true),
        originals = [svg, ...svg.querySelectorAll('*')],
        copies = [clone, ...clone.querySelectorAll('*')];
    const properties = [
        'fill',
        'fill-opacity',
        'stroke',
        'stroke-width',
        'stroke-opacity',
        'stroke-dasharray',
        'stroke-linecap',
        'stroke-linejoin',
        'opacity',
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'text-anchor',
        'dominant-baseline',
        'paint-order',
        'visibility',
        'display',
    ];
    originals.forEach((element, i) => {
        const style = getComputedStyle(element);
        properties.forEach((p) =>
            copies[i].style.setProperty(p, style.getPropertyValue(p))
        );
    });
    const world = svg.querySelector('[data-world]');
    const bounds = world?.children.length
        ? world.getBBox()
        : svg.viewBox.baseVal;
    clone.querySelector('[data-world]')?.removeAttribute('transform');
    const width = Math.max(1, bounds.width + 64),
        height = Math.max(1, bounds.height + 64);
    const scale = Math.min(
        2,
        8192 / width,
        8192 / height,
        Math.sqrt(24000000 / (width * height))
    );
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute(
        'viewBox',
        `${bounds.x - 32} ${bounds.y - 32} ${width} ${height}`
    );
    clone.setAttribute('width', Math.ceil(width * scale));
    clone.setAttribute('height', Math.ceil(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(clone)], {
            type: 'image/svg+xml;charset=utf-8',
        })
    );
    try {
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
        });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `${name}.png`;
        link.click();
    } finally {
        URL.revokeObjectURL(url);
    }
}

// Summary and Map are two views of one concept; the tabs make the switch read as staying on the same page.
// Reading help behind an info icon, as on the portal's chart titles; it opens on click and closes on outside click or Escape.
export function InfoPopover({ id, label, title, className = '', placement = 'bottom-start', children }) {
    const popover = (
        <Popover id={id} className={`se-info-popover ${className}`}>
            <Popover.Header as="h3">{title}</Popover.Header>
            <Popover.Body>{children}</Popover.Body>
        </Popover>
    );
    return (
        <OverlayTrigger trigger="click" placement={placement} overlay={popover} rootClose rootCloseEvent="click">
            <button type="button" className="se-info-tooltip" aria-label={label}><i className="icon icon-info-circle fas" aria-hidden="true" /></button>
        </OverlayTrigger>
    );
}

export function ConceptTabs({ active, label, onSummary, onMap }) {
    return (
        <div className="se-concept-tabs" role="tablist" aria-label={`${label} views`}>
            <button type="button" role="tab" aria-selected={active === 'summary'} onClick={active === 'summary' ? undefined : onSummary}>Summary</button>
            <button type="button" role="tab" aria-selected={active === 'map'} onClick={active === 'map' ? undefined : onMap}>Map</button>
        </div>
    );
}
