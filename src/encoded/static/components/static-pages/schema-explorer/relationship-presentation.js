// Curated interpretations are restricted to known field paths and target types.
// Unrecognized relationships retain their model description without inferred advice.
export const guides = {
    'reference_genome|ReferenceGenome': ['Genome reference', 'Identifies the reference genome used for alignment. This establishes the reference context for interpreting genomic coordinates and comparing datasets; the relationship alone does not establish coordinate compatibility.'],
    'derived_from[]|File': ['Input provenance', 'Identifies the files used to generate this file. This records direct input provenance; it does not encode the processing steps or execution parameters.'],
    'file_sets[]|FileSet': ['Experimental context', 'Associates a file with its experimental metadata through a FileSet. Library and sequencing references provide material and acquisition context, separately from computational input provenance.'],
    'analysis_runs[]|AnalysisRun': ['Analysis context', 'Associates a file with analysis-level donor and tissue context. This association describes the analysis context rather than the execution history of an individual workflow.'],
    'quality_metrics[]|QualityMetric': ['Data quality measurements', 'Associates data with quality measurements. The linked metric records supply the assessment; the presence of this relationship alone does not indicate that a file passed quality control.'],
    'external_quality_metrics[]|ExternalQualityMetric': ['External quality measurements', 'Associates data with externally generated quality measurements. These records carry the supplied assessments, rather than an implicit pass or fail decision.'],
    'donor|Donor': ['Donor provenance', 'Associates the record with the donor of the biological material. Specimen and processing provenance are represented by separate relationships.'],
    'donor|AbstractDonor': ['Donor provenance', 'Associates the record with donor metadata through the shared donor definition. The referenced donor type determines which donor details are available.'],
    'protected_donor|ProtectedDonor': ['Protected donor context', 'Associates the record with protected donor metadata. The relationship identifies the association; access to the referenced information is governed separately.'],
    'sample_sources[]|SampleSource': ['Specimen origin', 'Identifies the source material associated with a sample. Source records distinguish tissue or cultured material from the specimen subsequently used in an experiment.'],
    'samples[]|Sample': ['Source specimens', 'Identifies the specimens used to prepare an analyte. Multiple references preserve the source associations without specifying their relative contributions.'],
    'analytes[]|Analyte': ['Library material provenance', 'Identifies the analytes used to prepare a library. This preserves material provenance separately from the library preparation metadata.'],
    'libraries[]|Library': ['Experimental libraries', 'Associates an experiment with its libraries. These references identify the prepared material, while sequencing metadata describes acquisition.'],
    'sequencing|Sequencing': ['Sequencing context', 'Associates an experiment with its sequencing metadata, including available instrument and preparation information. This describes acquisition context rather than downstream analysis.'],
    'file_format|FileFormat': ['File representation', 'Identifies the format used to represent the file contents. Format metadata describes the representation, separately from biological origin and processing provenance.'],
    'input_files[].value|File': ['Workflow inputs', 'Identifies files supplied to a workflow execution. Input mappings preserve their workflow argument roles; outputs are recorded separately.'],
    'output_files[].value|File': ['Workflow outputs', 'Identifies files saved as outputs of a workflow execution. The output mappings associate results with workflow arguments; input provenance is recorded separately.'],
};

export function relationshipPresentation(references, index) {
    const groups = new Map();
    for (const edge of references) {
        const key = `${edge.field}|${edge.to}|${edge.kind}`;
        const root = edge.field.split('.')[0].replaceAll('[]', '');
        const field = index.models.find((model) => model.name === edge.from)?.fields.find((candidate) => candidate.name === root);
        const description = typeof field?.schema?.description === 'string' ? field.schema.description : '';
        const label = typeof field?.schema?.title === 'string' ? field.schema.title : root.replaceAll('_', ' ');
        const guide = edge.kind === 'linkTo' ? guides[`${edge.field}|${edge.to}`] : null;
        const assembly = guide && root === 'derived_from' && edge.from === 'DonorSpecificAssembly';
        if (!groups.has(key)) groups.set(key, {
            key, from: [], to: edge.to, kind: edge.kind, field: edge.field,
            title: assembly ? 'Assembly input provenance' : guide?.[0] || label,
            meaning: assembly
                ? 'Identifies the files used to generate a donor-specific assembly. This records the assembly’s direct input provenance; it does not encode the processing steps or execution parameters.'
                : guide?.[1] || description || '',
            description,
            multiple: edge.field.includes('[]'),
        });
        const group = groups.get(key);
        if (!group.from.includes(edge.from)) group.from.push(edge.from);
    }
    return [...groups.values()];
}
