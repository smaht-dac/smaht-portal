// A curated reading guide projected from the deployed schema graph. A concept
// groups schemas without inventing references. The reference graph retains schema
// direction; overviewFlow separately projects the numbered biological path.
export const concepts = [
    { id: 'donor', label: 'Donor', step: 1, hint: 'Who donated the material?', example: 'Donor', domain: 'donors', color: '#356a9a', types: 'Donor ProtectedDonor AbstractDonor', description: 'Donor metadata identifies the individual who supplied the biological material. Clinical history and protected details provide additional context.' },
    { id: 'material', label: 'Source material', step: 2, hint: 'Which tissue or culture?', example: 'Tissue · CellCulture', domain: 'samples', color: '#237b68', types: 'SampleSource Tissue CellCulture CellLine CellCultureMixture', description: 'Source material is the tissue or cultured material from which specimens originate. Tissue and CellLine records can reference a donor directly; CellCulture and CellLine records can also reference the tissue samples they were derived from (tissue_samples), so a culture can appear both before and after a sample in the workflow.' },
    { id: 'sample', label: 'Sample', step: 3, hint: 'Which specimen was used?', example: 'Sample and subtypes', domain: 'samples', color: '#237b68', types: 'Sample TissueSample CellSample CellCultureSample', description: 'A sample is the specimen used for an experiment. Its sample_sources field references source material. TissueSample, CellSample and CellCultureSample share the Sample model.' },
    { id: 'analyte', label: 'Analyte', step: 4, hint: 'What material was extracted?', example: 'Analyte · preparation', domain: 'sequencing', color: '#8058a0', types: 'Analyte AnalytePreparation', description: 'An analyte is biological material prepared from one or more samples. The samples field preserves those source specimens; analyte_preparation records how the material was prepared.' },
    { id: 'library', label: 'Library', step: 5, hint: 'What was prepared for sequencing?', example: 'Library · preparation', domain: 'sequencing', color: '#8058a0', types: 'Library LibraryPreparation', description: 'A library references its source analytes and its library preparation. Following analytes links the sequencing material back to the original specimens.' },
    { id: 'fileSet', label: 'Experiment / FileSet', step: 6, hint: 'Which library and sequencing run?', example: 'FileSet', domain: 'sequencing', color: '#8058a0', types: 'FileSet', description: 'A FileSet connects libraries with sequencing metadata. Files reference their file sets, which provide the bridge from data to the experimental material. Some FileSets also reference CellSample directly.' },
    { id: 'files', label: 'Data files', step: 7, hint: 'Where are the reads and results?', example: 'File and subtypes', domain: 'files', color: '#a06424', types: 'File SubmittedFile OutputFile UnalignedReads AlignedReads VariantCalls HistologyImage SupplementaryFile ExternalOutputFile DonorSpecificAssembly', description: 'Files represent reads, variants, images and other data. File subtypes connect to file sets, analysis context and quality metrics. The exact fields and available links depend on the subtype.' },
    { id: 'analysis', label: 'Analysis context', hint: 'Which donor and tissue were analyzed?', example: 'AnalysisRun', domain: 'workflows', color: '#5262a0', types: 'AnalysisRun', description: 'AnalysisRun collects analysis-level donor and tissue context. File subtypes can reference analysis runs through analysis_runs. Workflow execution is represented separately by WorkflowRun and MetaWorkflowRun.' },
    { id: 'workflow', label: 'Workflow execution', hint: 'Which files went in and came out?', example: 'WorkflowRun · Workflow', domain: 'workflows', color: '#5262a0', types: 'WorkflowRun Workflow MetaWorkflowRun MetaWorkflow', description: 'Workflow runs record execution and input/output file references. Workflow definitions describe the processing method. Input and output roles are retained in the exact field names shown below.' },
    { id: 'quality', label: 'Quality assessment', hint: 'How was data quality measured?', example: 'QualityMetric', domain: 'files', color: '#a06424', types: 'QualityMetric ExternalQualityMetric', description: 'Files reference quality measurements through quality_metrics and external_quality_metrics. These records describe quality rather than biological provenance.' },
    { id: 'sequencing', label: 'Sequencing', hint: 'How was the library sequenced?', example: 'Sequencing', domain: 'sequencing', color: '#8058a0', types: 'Sequencing', description: 'Sequencing metadata records the run configuration, sequencer and preparation kits. FileSet.sequencing links an experiment to this information.' },
];
export const connections = [
    { from: 'material', to: 'donor', fields: ['donor'], question: "Which donor supplied this material?", explanation: "The donor field connects source material to its donor. The exact reference is defined on the source-material schema, such as Tissue or CellLine.", label: 'donated by', primary: true },
    { from: 'sample', to: 'material', fields: ['sample_sources[]'], question: "Where did the sample come from?", explanation: "The sample_sources field connects a specimen to its source tissue or culture. A sample can reference more than one source record.", label: 'taken from', primary: true },
    { from: 'analyte', to: 'sample', fields: ['samples[]'], question: "Which samples were used for the analyte?", explanation: "The samples field preserves the specimens used to prepare an analyte. Following these references leads back to the source material.", label: 'extracted from', primary: true },
    { from: 'library', to: 'analyte', fields: ['analytes[]'], question: "Which analytes were used for the library?", explanation: "The analytes field links a library to the biological material from which it was prepared.", label: 'prepared from', primary: true },
    { from: 'fileSet', to: 'library', fields: ['libraries[]'], question: "Which libraries belong to the experiment?", explanation: "The libraries field connects a FileSet to the libraries associated with the experiment.", label: 'uses libraries', primary: true },
    { from: 'files', to: 'fileSet', fields: ['file_sets[]'], question: "Which experiment is this file associated with?", explanation: "The file_sets field connects file records to their experimental metadata. From a FileSet you can continue to libraries and sequencing.", label: 'file set', primary: true },
    { from: 'files', to: 'analysis', fields: ['analysis_runs[]'], question: "Which analysis context is attached to the file?", explanation: "The analysis_runs field connects files to AnalysisRun records, which hold analysis-level donor and tissue context.", label: 'analysis', primary: false },
    { from: 'workflow', to: 'files', fields: ['input_files[].value', 'output_files[].value'], question: "Which files went into and came out of the workflow?", explanation: "WorkflowRun records identify input and output files through separate fields. Inspect the definitions below to distinguish those two roles.", label: 'processes', primary: false },
    { from: 'files', to: 'quality', fields: ['quality_metrics[]', 'external_quality_metrics[]'], question: "Where are the file\u2019s quality measurements?", explanation: "The quality_metrics and external_quality_metrics fields connect files to the records that describe their data quality.", label: 'assessed by', primary: false },
    { from: 'fileSet', to: 'sequencing', fields: ['sequencing'], question: "How was this experiment sequenced?", explanation: "The sequencing field connects a FileSet to its sequencing metadata, including the sequencer and preparation information.", label: 'run details', primary: false },
];

export function buildResearchMap(index, available, viewport = { width: 1200, height: 650 }) {
    const enabled = new Set(available.map((node) => node.name));
    const nodes = concepts.map((concept) => {return {
        ...concept, name: concept.id, members: concept.types.split(' ').filter((name) => enabled.has(name)),
    };}).filter((node) => node.members.length);
    const owners = new Map(nodes.flatMap((node) => node.members.map((name) => [name, node.id])));
    const edges = [];
    for (const connection of connections) {
        const actual = index.edges.filter((edge) => edge.kind === 'linkTo' && owners.get(edge.from) === connection.from &&
            owners.get(edge.to) === connection.to && connection.fields.includes(edge.field));
        if (actual.length) edges.push({ ...connection, key: `${connection.from}-${connection.to}`, kind: 'linkTo', edges: actual });
    }
    const nodeWidth = 216, nodeHeight = 104;
    const columns = viewport.width >= 1080 ? 4 : viewport.width >= 810 ? 3 : 2;
    const positions = {};
    nodes.forEach((node, i) => {
        const row = Math.floor(i / columns), col = i % columns;
        positions[node.id] = { x: nodeWidth / 2 + (row % 2 ? columns - col - 1 : col) * 316, y: nodeHeight / 2 + row * 190 };
    });
    return { nodes, edges, positions, nodeWidth, nodeHeight };
}

export function traceProvenance(graph, start) {
    const nodes = new Set([start]), edges = new Set(), queue = [start];
    while (queue.length) {
        const from = queue.shift();
        for (const edge of graph.edges) {
            if (!edge.primary || edge.from !== from) continue;
            edges.add(edge.key);
            if (!nodes.has(edge.to)) { nodes.add(edge.to); queue.push(edge.to); }
        }
    }
    return { nodes, edges };
}

function intersects(a, b, padding = 0) {
    return a.left < b.left + b.width + padding && a.left + a.width + padding > b.left &&
        a.top < b.top + b.height + padding && a.top + a.height + padding > b.top;
}

// Put short explanations in the whitespace around connectors. Labels are also
// clickable, and their exact references remain available in the inspector.
export function researchLabels(graph, routes) {
    const obstacles = graph.nodes.map((node) => {
        const p = graph.positions[node.id];
        return { left: p.x - graph.nodeWidth / 2, top: p.y - graph.nodeHeight / 2, width: graph.nodeWidth, height: graph.nodeHeight };
    });
    const labels = {};
    for (const edge of graph.edges) {
        const route = routes[edge.key];
        if (!route) continue;
        const width = Math.max(56, edge.label.length * 5.8 + 12), height = 22;
        const segments = route.points.slice(1).map((b, i) => {
            const a = route.points[i];
            return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) };
        }).sort((a, b) => b.length - a.length);
        let chosen;
        for (const { a, b } of segments) {
            for (const fraction of [0.5, 0.35, 0.65]) {
                const x = a.x + (b.x - a.x) * fraction, y = a.y + (b.y - a.y) * fraction;
                // A vertical run through a narrow column gap only fits a label slid sideways
                // while it still covers the line, so those shifts are tried last.
                const shifts = Array.from({ length: Math.floor(width / 8) }, (_, i) => (i + 1) * 4).flatMap((dx) => [[-dx, 0], [dx, 0]]);
                const offsets = a.y === b.y ? [[0, -17], [0, 17], [0, 0]] : [[width / 2 + 8, 0], [-width / 2 - 8, 0], [0, 0], ...shifts];
                for (const [dx, dy] of offsets) {
                    const box = { left: x + dx - width / 2, top: y + dy - height / 2, width, height };
                    if (obstacles.some((obstacle) => intersects(box, obstacle, 3))) continue;
                    chosen = box; break;
                }
                if (chosen) break;
            }
            if (chosen) break;
        }
        if (chosen) { labels[edge.key] = chosen; obstacles.push(chosen); }
    }
    return labels;
}

// Each arrow reads as a sentence from its source box: "Donor provides Source material".
// Labels between neighbouring boxes must stay short (about 14 characters) to fit the gap.
export const flowLabels = {
    'material-donor': 'provides',
    'sample-material': 'is sampled as',
    'analyte-sample': 'yields',
    'library-analyte': 'is made into',
    'fileSet-library': 'is run in',
    'files-fileSet': 'produces',
    'files-analysis': 'analyzed in',
    'workflow-files': 'reads & writes',
    'files-quality': 'is assessed by',
    'fileSet-sequencing': 'sequenced with',
};

// The entry map follows biological progression. Schema direction remains in
// graph.edges and each connection's exact references for detail views/tracing.
export function overviewFlow(graph) {
    return { ...graph, edges: graph.edges.map((edge) => {return {
        ...edge,
        from: edge.primary ? edge.to : edge.from,
        to: edge.primary ? edge.from : edge.to,
        label: flowLabels[edge.key] || edge.label,
    };}) };
}

const conceptByType = new Map(concepts.flatMap((concept) => concept.types.split(' ').map((name) => [name, concept])));
export const conceptFor = (name) => conceptByType.get(name);

// The map sentence behind an exact schema reference, e.g. Tissue.donor -> Donor reads
// "Donor provides Source material". Schema diagrams keep reference direction, so the
// sentence names both ends instead of relying on the arrow.
export function mapSentence(edge) {
    const from = conceptFor(edge.from), to = conceptFor(edge.to);
    const connection = from && to && connections.find((c) => c.from === from.id && c.to === to.id && c.fields.includes(edge.field));
    if (!connection) return null;
    const key = `${connection.from}-${connection.to}`;
    const [subject, object] = connection.primary ? [to, from] : [from, to];
    return { key, verb: flowLabels[key], text: `${subject.label} ${flowLabels[key]} ${object.label}` };
}
