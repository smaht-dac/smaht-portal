<DataMatrixComparisonTabs
    session={session}
    tabs={[
        {
            "key": "benchmarking",
            "title": "Benchmarking Data",
            "className": "benchmarking-tab column-grow-3",
            "matrixProps": {
                "key": "data-matrix-benchmarking",
                "query": {
                    "url": "/data_matrix_aggregations/?type=File&sample_summary.studies=Benchmarking&dataset!=No+value&dataset!=colo829blt_in_silico&dataset!=colo829_snv_indel_challenge_data&dataset!=mei_detection_challenge_data&dataset!=ipsc_snv_indel_challenge_data&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&limit=all",
                    "columnAggFields": ["file_sets.libraries.assay.display_title", "sequencing.sequencer.platform"],
                    "rowAggFields": ["donors.display_title", "sample_summary.tissues", "dataset", "data_type", "sample_summary.category"]
                },
                "resultItemPostProcessFuncKey": "cellLinePostProcess",
                "resultTransformedPostProcessFuncKey": "dsaChainFile",
                "browseFilteringTransformFuncKey": "dsaChainFile",
                "rowGroups": {
                    "Cell Line": {
                        "values": ["COLO829T", "COLO829BL", "COLO829BLT50", "In silico BLT50", "Truth Set", "HapMap Mixture", "Downsampled", "LB-LA2 Fibroblast", "LB-LA2 iPSC-1", "LB-LA2 iPSC-2", "LB-LA2 iPSC-4", "LB-LA2 iPSC-52", "LB-LA2 iPSC-60"],
                        "backgroundColor": "#f4f4ff",
                        "textColor": "#000000",
                        "shortName": "Cell Line",
                        "customUrlParams": "dataset!=tissue"
                    },
                    "Donor": {
                        "values": ["ST001", "ST002", "ST003", "ST004"],
                        "backgroundColor": "#f4f4ff",
                        "textColor": "#000000",
                        "shortName": "Donor",
                        "customUrlParams": "dataset=tissue"
                    }
                },
                "showRowGroups": true,
                "autoPopulateRowGroupsProperty": "study",
                "headerFor": null,
                "showColumnSummary": false,
                "idLabel": "benchmarking",
                "baseBrowseFilesPath": "/search/"
            }
        },
        {
            "key": "production",
            "title": "Production Data",
            "className": "production-tab column-grow-2",
                "matrixProps": {
                    "key": "data-matrix-production",
                    "query": {
                        "url": "/data_matrix_aggregations/?type=File&sample_summary.studies=Production&dataset!=No+value&status=open&status=open-early&status=open-network&status=protected&status=protected-early&status=protected-network&limit=all",
                        "columnAggFields": ["file_sets.libraries.assay.display_title", "sequencing.sequencer.platform"],
                        "rowAggFields": ["donors.display_title", "sample_summary.tissues", "sample_summary.category"]
                    },
                    "headerFor": null,
                    "idLabel": "production",
                    "showCountFor": true
                }
            }
        ]}
/>
