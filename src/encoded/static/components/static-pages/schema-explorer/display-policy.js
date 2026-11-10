import policy from './display-policy.json';

const hidden = new Set(policy.hiddenFields);
export function visibleValue(value) {
    if (Array.isArray(value)) return value.map(visibleValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !key.split(/[.\[\]/]+/).some((part) => hidden.has(part)))
        .map(([key, entry]) => [key, visibleValue(entry)]));
}
