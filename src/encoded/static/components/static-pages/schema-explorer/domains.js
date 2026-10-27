// Curated from “SMaHT Metadata Model with Diagrams and Tables V2”.
// This is a navigation taxonomy, not schema inheritance or an access policy.
export const domains = [
    { id: 'donors', label: 'Donor & Clinical History', types: 'AbstractDonor Donor ProtectedDonor Demographic MedicalHistory Diagnosis Exposure MedicalTreatment FamilyHistory DeathCircumstances TissueCollection' },
    { id: 'samples', label: 'Samples, Tissue & Cell Lines', types: 'SampleSource Tissue CellCulture CellLine CellCultureMixture Sample TissueSample CellSample CellCultureSample PathologyReport BrainPathologyReport NonBrainPathologyReport' },
    { id: 'sequencing', label: 'Analytes, Libraries & Sequencing', types: 'Preparation Analyte AnalytePreparation Library LibraryPreparation FileSet Assay Sequencing Sequencer PreparationKit Treatment' },
    { id: 'files', label: 'Files & Quality Metrics', types: 'File SubmittedFile OutputFile ResourceFile ReferenceFile AlignedReads UnalignedReads VariantCalls HistologyImage SupplementaryFile ExternalOutputFile DonorSpecificAssembly ReferenceGenome Software FileFormat QualityMetric ExternalQualityMetric' },
    { id: 'workflows', label: 'Workflows & Analysis Runs', types: 'Workflow WorkflowRun MetaWorkflow MetaWorkflowRun AnalysisRun GenericConfig GenericQcConfig FilterSet HiglassViewConfig' },
    { id: 'administrative', label: 'Administrative, Content & Ontology', types: 'User Consortium SubmissionCenter AccessKey IngestionSubmission TrackingItem Page Document Image Protocol Ontology OntologyTerm Publication UserContent StaticSection EmailNotification Item' },
    { id: 'other', label: 'Other types', types: '' },
];
const domainByType = new Map(domains.flatMap((d) => d.types.split(' ').filter(Boolean).map((name) => [name, d.id])));
export const domainFor = (name) => domainByType.get(name) || 'other';

export function groupedLayout(nodes, nodeWidth, nodeHeight) {
    const populated = domains.map((domain) => {return {
        ...domain,
        nodes: nodes.filter((n) => domainFor(n.name) === domain.id).sort((a, b) => a.name.localeCompare(b.name)),
    };}).filter((domain) => domain.nodes.length);
    const positions = {};
    const frames = [];
    const columns = populated.length === 1 ? 1 : 3;
    const cellWidth = 3 * (nodeWidth + 34) + 40;
    let top = 0;
    for (let row = 0; row < populated.length; row += columns) {
        const items = populated.slice(row, row + columns);
        let rowHeight = 0;
        items.forEach((domain, col) => {
            const left = col * (cellWidth + 80);
            const frameHeight = 100 + Math.ceil(domain.nodes.length / 3) * (nodeHeight + 32);
            domain.nodes.forEach((node, i) => {
                positions[node.name] = {
                    x: left + 30 + nodeWidth / 2 + (i % 3) * (nodeWidth + 34),
                    y: top + 90 + nodeHeight / 2 + Math.floor(i / 3) * (nodeHeight + 32),
                };
            });
            frames.push({ id: domain.id, label: domain.label, left, top, width: cellWidth, height: frameHeight, count: domain.nodes.length });
            rowHeight = Math.max(rowHeight, frameHeight);
        });
        top += rowHeight + 80;
    }
    return { positions, frames };
}
