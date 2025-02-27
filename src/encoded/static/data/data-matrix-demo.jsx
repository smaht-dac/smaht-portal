<div key="someRandomKey">
    <DataMatrix
        key="data-matrix-demo-5"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=File&limit=all",
            "url_fields": ["file_sets.libraries.assay.display_title", "donors.display_title"]
        }}
        fieldChangeMap={{
            "donor": "donors.display_title",
            "assay": "file_sets.libraries.assay.display_title"
        }}
        groupingProperties={["donor"]}
        columnGrouping="assay"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#6f2da8"
    />
    <DataMatrix
        key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=File&limit=all",
            "url_fields": ["file_sets.libraries.assay.display_title", "sample_summary.tissues"]
        }}
        fieldChangeMap={{
            "assay": "file_sets.libraries.assay.display_title",
            "tissues": "sample_summary.tissues"
        }}
        groupingProperties={["tissues"]}
        columnGrouping="assay"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#e0475b"
    />
    <DataMatrix
        key="data-matrix-demo-2"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=File&limit=all",
            "url_fields": ["sample_summary.tissues", "donors.display_title"]
        }}
        fieldChangeMap={{
            "donor": "donors.display_title",
            "tissues": "sample_summary.tissues"
        }}
        groupingProperties={["donor"]}
        columnGrouping="tissues"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#4F7942"
    />
    <DataMatrix
        key="data-matrix-demo-3"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=File&file_sets.sequencing.sequencer.display_title!=No+value&limit=all",
            "url_fields": ["file_sets.libraries.assay.display_title", "file_sets.sequencing.sequencer.display_title"]
        }}
        fieldChangeMap={{
            "assay": "file_sets.libraries.assay.display_title",
            "sequencer": "file_sets.sequencing.sequencer.display_title"
        }}
        groupingProperties={["assay"]}
        columnGrouping="sequencer"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#84e3c8"
    />
    <DataMatrix
        key="data-matrix-demo-4"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=File&limit=all",
            "url_fields": ["data_type", "data_category"]
        }}
        fieldChangeMap={{
            "data_category": "data_category",
            "data_type": "data_type"
        }}
        groupingProperties={["data_category"]}
        columnGrouping="data_type"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#e0475b"
    />
    {/* <h4>ENCODE</h4>
    <DataMatrix
        key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "https://www.encodeproject.org/search/?type=Experiment&control_type!=*&status=released&perturbed=false&biosample_ontology.classification=tissue&limit=all",
            "url_fields": ["assay_slims", "biosample_summary", "biosample_ontology.term_name", "assay_term_name", "description", "lab", "status"]
        }}
        valueChangeMap={{
            "cell_type": {
                "H1": "H1-hESC",
                "HFFc6": "HFF",
                "WTC11": "WTC-11",
            },
            "state": {
                "released": "Submitted"
            }
        }}
        fieldChangeMap={{
            "experiment_category": "assay_slims",
            "experiment_type": "assay_term_name",
            "cell_type": "biosample_ontology.term_name",
            "lab_name": "lab.title",
            "short_description": "description",
            "state": "status"
        }}
        groupingProperties={["experiment_category", "experiment_type"]}
        columnGrouping="cell_type"
        headerFor={(
            <React.Fragment>
                <h3 className="mt-2 mb-0 text-300">ENCODE</h3>
                <h5 className="mt-0 text-500" style={{ 'marginBottom': -20, 'height': 20, 'position': 'relative', 'zIndex': 10 }}>
                    <a href="https://www.encodeproject.org/search/?type=Experiment&biosample_ontology.term_name=H1&biosample_ontology.term_name=HFFc6&biosample_ontology.term_name=WTC11&status%21=archived&status%21=revoked"> Browse all</a> H1, HFF and WTC-11 data from ENCODE
                </h5>
            </React.Fragment>
        )}
        sectionStyle={{
            "sectionClassName": "col-12",
            "labelClassName": "col-2",
            "listingClassName": "col-10",
        }}
        headerColumnsOrder={["H1-hESC", "H1-DE", "HFF", "WTC-11"]}
        columnSubGroupingOrder={["Submitted", "In Submission", "Planned", "Not Planned"]}
        titleMap={{
            "_common_name": " ",
            "sub_cat": "AnyStringHere",
            "experiment_type": "Experiment Type",
            "data_source": "Available through",
            "lab_name": "Lab",
            "experiment_category": "Category",
            "state": "Submission Status",
            "cell_type": "Cell Type",
            "short_description": "Description",
            "award": "Award",
            "accession": "Accession",
            "number_of_experiments": "# Experiments in Set",
            "submitted_by": "Submitter",
            "experimentset_type": "Set Type"
        }}
        fallbackNameForBlankField="None"
        disableConfigurator={true}
    />  */}
</div>
