<div key="someRandomKey">
    <DataMatrix
        key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=SubmittedFile&limit=all",
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
        key="data-matrix-demo-2"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=SubmittedFile&limit=all",
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
        key="data-matrix-demo-3"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=SubmittedFile&limit=all",
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
        key="data-matrix-demo-4"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=SubmittedFile&limit=all",
            "url_fields": ["file_sets.libraries.assay.display_title", "file_sets.sequencing.sequencer.display_title"]
        }}
        fieldChangeMap={{
            "assay": "file_sets.libraries.assay.display_title",
            "sequencer": "file_sets.sequencing.sequencer.display_title"
        }}
        groupingProperties={["sequencer"]}
        columnGrouping="assay"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#84e3c8"
    />
    <DataMatrix
        key="data-matrix-demo-5"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/search/?type=SubmittedFile&limit=all",
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
</div>
