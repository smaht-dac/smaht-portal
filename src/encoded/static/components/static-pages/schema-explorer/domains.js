// Curated from “SMaHT Metadata Model with Diagrams and Tables V2”.
// This is a navigation taxonomy, not schema inheritance or an access policy.
export const domains = [
    { id: 'donors', label: 'Donor & Clinical History', types: 'AbstractDonor Donor ProtectedDonor Demographic MedicalHistory Diagnosis Exposure MedicalTreatment FamilyHistory DeathCircumstances TissueCollection' },
    { id: 'samples', label: 'Samples, Tissue & Cell Lines', types: 'SampleSource Tissue CellCulture CellLine CellCultureMixture Sample TissueSample CellSample CellCultureSample PathologyReport BrainPathologyReport NonBrainPathologyReport' },
    { id: 'sequencing', label: 'Analytes, Libraries & Sequencing', types: 'Preparation Analyte AnalytePreparation Library LibraryPreparation FileSet Assay Sequencing Sequencer PreparationKit Treatment' },
    { id: 'files', label: 'Files & Quality Metrics', types: 'File SubmittedFile OutputFile ResourceFile ReferenceFile AlignedReads UnalignedReads VariantCalls HistologyImage SupplementaryFile ExternalOutputFile DonorSpecificAssembly ReferenceGenome Software FileFormat QualityMetric ExternalQualityMetric' },
    { id: 'workflows', label: 'Workflows & Analysis Runs', types: 'Workflow WorkflowRun MetaWorkflow MetaWorkflowRun AnalysisRun GenericConfig GenericQcConfig FilterSet HiglassViewConfig' },
    { id: 'administrative', label: 'Admin, Content & Ontology', types: 'User Consortium SubmissionCenter AccessKey IngestionSubmission TrackingItem Page Document Image Protocol Ontology OntologyTerm Publication UserContent StaticSection EmailNotification Item' },
    { id: 'other', label: 'Other types', types: '' },
];
const domainByType = new Map(domains.flatMap((d) => d.types.split(' ').filter(Boolean).map((name) => [name, d.id])));
export const domainFor = (name) => domainByType.get(name) || 'other';

// Explicit biological roles. Base types match @abstract_collection declarations;
// concrete parents (e.g. Donor and WorkflowRun) remain in their biological stage.
export const stages = {
    donors: [
        ['Base types', 'AbstractDonor'],
        ['Donors', 'Donor ProtectedDonor'],
        ['Clinical context', 'Demographic DeathCircumstances MedicalHistory'],
        ['Clinical details', 'Diagnosis Exposure MedicalTreatment FamilyHistory'],
        ['Collection', 'TissueCollection'],
    ],
    samples: [
        ['Base types', 'SampleSource Sample PathologyReport'],
        ['Source material', 'Tissue CellLine'],
        ['Culture', 'CellCulture CellCultureMixture'],
        ['Samples', 'TissueSample CellSample CellCultureSample'],
        ['Pathology', 'BrainPathologyReport NonBrainPathologyReport'],
    ],
    sequencing: [
        ['Base types', 'Preparation'],
        ['Analyte preparation', 'AnalytePreparation Treatment'],
        ['Analytes', 'Analyte'],
        ['Library preparation', 'LibraryPreparation'],
        ['Libraries', 'Library'],
        ['Sequencing', 'Sequencing'],
        ['Experiments (FileSet)', 'FileSet'],
        ['Supporting types', 'Assay Sequencer PreparationKit'],
    ],
    workflows: [
        ['Base types', 'GenericConfig'],
        ['Definitions', 'Workflow MetaWorkflow'],
        ['Execution', 'WorkflowRun MetaWorkflowRun'],
        ['Analysis', 'AnalysisRun'],
        ['Supporting types', 'GenericQcConfig FilterSet HiglassViewConfig'],
    ],
    files: [
        ['Base types', 'File SubmittedFile'],
        ['Acquired data', 'UnalignedReads HistologyImage SupplementaryFile'],
        ['Processed data', 'OutputFile ExternalOutputFile AlignedReads'],
        ['Results', 'VariantCalls DonorSpecificAssembly'],
        ['Quality assessment', 'QualityMetric ExternalQualityMetric'],
        ['Supporting types', 'ResourceFile ReferenceFile ReferenceGenome Software FileFormat'],
    ],
    administrative: [
        ['Base types', 'Item UserContent'],
        ['Organization', 'User Consortium SubmissionCenter AccessKey'],
        ['Submission', 'IngestionSubmission TrackingItem EmailNotification'],
        ['Content', 'Page Document Image StaticSection'],
        ['Knowledge', 'Protocol Ontology OntologyTerm Publication'],
    ],
};
// Explicit abstract collections, shared by layout and schema presentation.
export const abstractTypes = new Set(Object.values(stages).flatMap((rows) => rows
    .filter(([label]) => label === 'Base types').flatMap(([, names]) => names.split(' '))));

const flow = ['donors', 'samples', 'sequencing', 'workflows', 'files'];

const orderedDomains = [...flow, 'administrative', 'other'].map((id) => domains.find((d) => d.id === id));

// A group map has one grouping: the donor-to-data concepts (`concepts`, in path order, named and numbered as on the
// path) come first, and schemas outside every concept keep their unnumbered stage. A stage that a concept only
// partly covers gives its remaining schemas to "Supporting types", so no stage repeats a concept under another name;
// a base type left out of the concepts joins the group's last such panel, beside the subtypes it is the base of.
export function hierarchicalLayout(nodes, nodeWidth, nodeHeight, edges = [], viewport = { width: 1200, height: 650 }, concepts = []) {
    const positions = {}, frames = [], layers = [];
    const members = new Set(nodes.map((n) => n.name));
    const adjacency = new Map(nodes.map((n) => [n.name, new Set()]));
    for (const edge of edges) {
        if (edge.kind !== 'linkTo' || !members.has(edge.from) || !members.has(edge.to)) continue;
        adjacency.get(edge.from).add(edge.to);
        adjacency.get(edge.to).add(edge.from);
    }
    let groupTop = 0;
    for (const domain of orderedDomains) {
        const remaining = new Set(nodes.filter((n) => domainFor(n.name) === domain.id).map((n) => n.name));
        const rows = [], supporting = [], bases = [];
        for (const concept of concepts.filter((c) => c.domain === domain.id)) {
            const inConcept = concept.types.split(' ').filter((name) => remaining.delete(name));
            if (inConcept.length) rows.push({ name: concept.label, label: concept.step ? `${concept.step}. ${concept.label}` : concept.label, concept: concept.id, names: inConcept });
        }
        for (const [label, names] of stages[domain.id] || []) {
            const shown = names.split(' ').filter((name) => members.has(name));
            const namesInStage = shown.filter((name) => remaining.delete(name));
            if (!namesInStage.length) continue;
            if (label === 'Base types' && rows.length) bases.push(...namesInStage);
            else if (namesInStage.length === shown.length) rows.push({ name: label, label, names: namesInStage });
            else supporting.push(...namesInStage);
        }
        if (supporting.length) {
            const row = rows.find((r) => r.name === 'Supporting types');
            if (row) row.names.push(...supporting); else rows.push({ name: 'Supporting types', label: 'Supporting types', names: supporting });
        }
        if (bases.length) {
            const row = rows.findLast((r) => !r.concept);
            if (row) row.names.unshift(...bases); else rows.push({ name: 'Supporting types', label: 'Supporting types', names: bases });
        }
        if (remaining.size) rows.push({ name: 'Other types', label: 'Other types', names: [...remaining].sort() });
        if (!rows.length) continue;
        const ranks = new Map(rows.flatMap((row) => row.names.map((name, i) => [name, i])));
        const layerFor = new Map(rows.flatMap((row, i) => row.names.map((name) => [name, i])));
        for (const row of rows) {
            const scores = new Map(row.names.map((name) => {
                const previous = [...adjacency.get(name)].filter((n) => ranks.has(n) && layerFor.get(n) < layerFor.get(name));
                return [name, previous.length ? previous.reduce((sum, n) => sum + ranks.get(n), 0) / previous.length : ranks.get(name)];
            }));
            // A panel's abstract base leads it; the rest follow their links to earlier panels.
            row.names.sort((a, b) => abstractTypes.has(b) - abstractTypes.has(a) || scores.get(a) - scores.get(b) || a.localeCompare(b));
            row.names.forEach((name, i) => ranks.set(name, i));
        }
        const base = rows.find((row) => row.name === 'Base types');
        const main = rows.filter((row) => row !== base);
        const gap = 20, nodeGap = 24, padding = 24;
        const inset = 18, headerHeight = 40, bottomInset = 16;
        let best;
        const targets = new Set([600, viewport.width, viewport.width / 0.85,
            ...Array.from({ length: 22 }, (_, i) => 640 + i * 80)]);
        // Pack contiguous biological stages into rows. For each possible row,
        // vary its node columns to minimize height without wasting screen width.
        for (const target of [...targets].sort((a, b) => a - b)) {
            const available = target - padding * 2;
            const dp = [{ height: 0, rows: [], width: 0 }];
            for (let end = 1; end <= main.length; end++) {
                for (let start = 0; start < end; start++) {
                    if (!dp[start]) continue;
                    const items = main.slice(start, end);
                    const capacity = Math.max(...items.map((row) => row.names.length));
                    for (let down = 1; down <= capacity; down++) {
                        const tiles = items.map((row, i) => {
                            const across = Math.ceil(row.names.length / down);
                            return { row, index: start + i + 1, across, width: across * nodeWidth + (across - 1) * nodeGap + inset * 2 };
                        });
                        const width = tiles.reduce((sum, tile) => sum + tile.width, 0) + (tiles.length - 1) * gap;
                        if (width > available || tiles.some((tile) => tile.across > 4)) continue;
                        const count = Math.max(...tiles.map((tile) => Math.ceil(tile.row.names.length / tile.across)));
                        const rowHeight = headerHeight + count * nodeHeight + (count - 1) * nodeGap + bottomInset;
                        const height = dp[start].height + rowHeight + gap;
                        if (!dp[end] || height < dp[end].height || height === dp[end].height && width < dp[end].width) {
                            dp[end] = { height, width: Math.max(dp[start].width, width), rows: [...dp[start].rows, { tiles, height: rowHeight }] };
                        }
                    }
                }
            }
            const packed = dp[main.length];
            if (!packed) continue;
            const width = Math.max(600, packed.width + padding * 2);
            const baseColumns = Math.max(1, Math.floor((width - padding * 2 - inset * 2 + nodeGap) / (nodeWidth + nodeGap)));
            const baseRows = base ? Math.ceil(base.names.length / baseColumns) : 0;
            const baseHeight = base ? headerHeight + baseRows * nodeHeight + (baseRows - 1) * nodeGap + bottomInset : 0;
            let top = 54 + baseHeight + (base && main.length ? gap : 0);
            const tiles = [];
            for (const row of packed.rows) {
                let left = padding;
                for (const tile of row.tiles) {
                    tiles.push({ ...tile, left, top, height: row.height });
                    left += tile.width + gap;
                }
                top += row.height + gap;
            }
            const height = top - (packed.rows.length ? gap : 0) + padding;
            const scale = Math.min(viewport.width / (width + 40), viewport.height / (height + 40));
            const area = width * height;
            const widthFits = (width + 40) * 0.85 <= viewport.width;
            if (!best || widthFits && !best.widthFits || widthFits === best.widthFits &&
                (scale > best.scale + 0.0001 || Math.abs(scale - best.scale) < 0.0001 && area < best.area)) {
                best = { width, height, baseColumns, baseHeight, tiles, scale, area, widthFits };
            }
        }
        const placeStage = (row, left, top, width, across, label, index, height) => {
            const heading = { left: left + inset, top: groupTop + top + 10, width: Math.min(width - inset * 2, label.length * 10 + 12), height: 24 };
            layers.push({ ...heading, id: `${domain.id}-${row.name}`, label, domain: domain.id, stage: index, concept: row.concept, names: [...row.names],
                panel: { left, top: groupTop + top, width, height } });
            for (let start = 0; start < row.names.length; start += across) {
                const names = row.names.slice(start, start + across);
                const rowWidth = names.length * nodeWidth + (names.length - 1) * nodeGap;
                names.forEach((name, i) => {
                    positions[name] = { x: left + (width - rowWidth) / 2 + nodeWidth / 2 + i * (nodeWidth + nodeGap), y: groupTop + top + headerHeight + nodeHeight / 2 + Math.floor(start / across) * (nodeHeight + nodeGap) };
                });
            }
        };
        if (base) {
            placeStage(base, padding, 54, best.width - padding * 2, best.baseColumns, base.label, 0, best.baseHeight);
        }
        for (const tile of best.tiles) placeStage(tile.row, tile.left, tile.top, tile.width, tile.across, tile.row.label, tile.index, tile.height);
        frames.push({ id: domain.id, label: domain.label, left: 0, top: groupTop, width: best.width, height: best.height, count: rows.reduce((sum, row) => sum + row.names.length, 0) });
        groupTop += best.height + 64;
    }
    return { positions, frames, layers };
}
