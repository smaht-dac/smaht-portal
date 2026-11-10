// Explorer presentation scope; authorization remains the responsibility of the API.
export const excludedSchemas = new Set(['User', 'SubmissionCenter', 'Consortium', 'Consortia', 'AccessKey']);

export function explorerIndex(index) {
    return {
        ...index,
        models: index.models.filter((model) => !excludedSchemas.has(model.name)),
        edges: index.edges.filter((edge) => !excludedSchemas.has(edge.from) && !excludedSchemas.has(edge.to)),
    };
}
