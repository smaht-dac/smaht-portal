'use strict';

// The pathology report outcome's own schema description, e.g. "Pathology
// report outcome: A sample is unacceptable if any of the following apply:
// (i) ...; (ii) ...; or (iii) ..." -- shown as its opening sentence and a
// numbered list of the reasons, per design feedback, rather than as 1 long
// tooltip. Read from the schema so it can't drift from it; falls back to the
// plain text if the description isn't in that "(i)/(ii)/(iii)" shape.
const OUTCOME_REASON_PATTERN = /\(([ivx]+)\)\s*/g;

export function parseOutcomeCriteria(description) {
    if (!description) return null;
    const text = description.replace(/^[^:]*outcome:\s*/i, '');
    const parts = text.split(OUTCOME_REASON_PATTERN);
    // [intro, numeral, reason, numeral, reason, ...]
    if (parts.length < 3) return { intro: text, reasons: [] };
    const reasons = [];
    for (let i = 2; i < parts.length; i += 2) {
        reasons.push(parts[i].replace(/[;,.]?\s*(or|and)?\s*$/i, '').trim());
    }
    return { intro: parts[0].trim(), reasons };
}
