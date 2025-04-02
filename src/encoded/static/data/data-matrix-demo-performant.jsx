<div key="someRandomKey">
    <DataMatrix
        key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/bar_plot_aggregations?type=SubmittedFile&limit=all",
            "url_fields": ["donors.display_title", "file_sets.libraries.assay.display_title"]
        }}
        fieldChangeMap={{
            "donor": "donors.display_title",
            "assay": "file_sets.libraries.assay.display_title"
        }}
        groupingProperties={["assay"]}
        columnGrouping="donor"
        columnGroups={{
            "Tier 1": {
                "values": ['ISLET1','DONOR_LB','COLO829','LIBD75','NC0'],
                "backgroundColor": "#FFB5C2",
                "textColor": "#ffffff"
            },
            "Tier 2": {
                "values": ['ST002','ST001','936_49F','ST003','ST004','P5246','CB0','P5844','P5818','SMHT008','P1740','P4643','P5182','P4546','P4925','P5554','SMHT004','UMB1465','UMB5278','SN001','SN002','SN003','UMB1864','UMB4428','UMB4638'],
                "backgroundColor": "#FF99AC",
                "textColor": "#ffffff"
            },
        }}
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#6f2da8"
    />
    <DataMatrix
        key="data-matrix-demo-2"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        queries={{
            "url": "/bar_plot_aggregations?type=SubmittedFile&limit=all",
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
            "url": "/bar_plot_aggregations?type=SubmittedFile&limit=all",
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
            "url": "/bar_plot_aggregations?type=SubmittedFile&limit=all",
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
            "url": "/bar_plot_aggregations?type=SubmittedFile&limit=all",
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
