<div key="someRandomKey">
    <DataMatrix
        key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        query={{
            "url": "/data_matrix_aggregations?type=SubmittedFile&limit=all",
            "agg_fields": ["donors.display_title", "data_generation_summary.assays"],
            "column_agg_fields": ["data_generation_summary.assays", "sequencing.sequencer.platform"], //composite column
            "row_agg_fields": ["donors.display_title", "sample_summary.tissues"], //multiple column
        }}
        fieldChangeMap={{
            "assay": "data_generation_summary.assays",
            "donor": "donors.display_title",
            "tissue": "sample_summary.tissues"
        }}
        valueChangeMap={{
            "assay": {
                "WGS Illumina": "WGS - Illumina",
                "WGS PacBio": "WGS - PacBio",
                "scDip-C Illumina": "scDip-C",
                "CompDuplex-seq Illumina": "CompDuplex-Seq",
                "Kinnex PacBio": "Kinnex",
                "Fiber-seq PacBio": "Fiber-Seq",
                "RNA-seq Illumina": "RNA-Seq - Illumina",
                "NanoSeq Illumina": "NanoSeq",
                "ATAC-seq Illumina": "ATAC-Seq",
                "varCUT&Tag Illumina": "varCUT&Tag",
                "VISTA-seq Illumina": "VISTA-Seq",
                "CODEC Illumina": "CODEC",
                "Single-cell MALBAC WGS ONT": "MALBAC-amplified WGS",
                "Single-cell MALBAC WGS Illumina": "MALBAC-amplified WGS",
                "TEnCATS ONT": "TEnCATS",
            }
        }}
        groupingProperties={["donor", "tissue"]}
        columnGrouping="assay"
        columnGroups={{
            "Bulk WGS": {
                "values": ['WGS - Illumina','WGS - PacBio','Fiber-Seq','WGS - Standard ONT','WGS - UltraLong ONT'],
                "backgroundColor": "#e04141",
                "textColor": "#ffffff"
            },
            "RNA-seq": {
                "values": ['RNA-Seq - Illumina', 'Kinnex'],
                "backgroundColor": "#ad48ad",
                "textColor": "#ffffff"
            },
            "Duplex-seq": {
                "values": ['NanoSeq','CODEC','ppmSeq','VISTA-Seq','CompDuplex-Seq','HiDEF-Seq'],
                "backgroundColor": "#2b4792",
                "textColor": "#ffffff"
            },
            "Single-cell WGS": {
                "values": ['PTA-amplified WGS','MALBAC-amplified WGS','WGS DLP+'],
                "backgroundColor": "#aac536",
                "textColor": "#ffffff"
            },
            "Targeted Seq": {
                "values": ['HAT-Seq','L1-ONT','TEnCATS'],
                "backgroundColor": "#e1d567",
                "textColor": "#ffffff"
            },
            "Single-cell RNA-Seq": {
                "values": ['snRNA-Seq','Slide-tags snRNA-Seq','STORM-Seq','Tranquil-Seq','10X Genomics Xenium'],
                "backgroundColor": "#d0b284",
                "textColor": "#ffffff"
            },
            "Other": {
                "values": ['Hi-C','scDip-C','Strand-Seq','ATAC-Seq','NT-Seq','varCUT&Tag','GoT-ChA'],
                "backgroundColor": "#76cbbe",
                "textColor": "#ffffff"
            }
        }}
        columnGroupsExtended={{
            "Core Assays": {
                "values": ['Bulk WGS', 'RNA-seq', 'Duplex-seq'],
                "backgroundColor": "#a786c2",
                "textColor": "#ffffff"
            },
            "Extended Assay": {
                "values": ['Single-cell WGS', 'Targeted Seq', 'SNT', 'SCT', 'Other'],
                "backgroundColor": "#d2bde3",
                "textColor": "#ffffff"
            }
        }}
        rowGroups={null} //not implemented yet
        rowGroupsExtended={{
            "Ectoderm": {
                "values": ['Brain - Cerebellum','Brain - Frontal lobe','Brain - Hippocampus','Brain - Temporal lobe','Skin - Abdomen (non-exposed)','Skin - Calf (sun-exposed)'],
                "backgroundColor": "#367151",
                "textColor": "#ffffff"
            },
            "Mesoderm": {
                "values": ['Aorta','Fibroblast','Heart','Muscle'],
                "backgroundColor": "#30975e",
                "textColor": "#ffffff"
            },
            "Endoderm": {
                "values": ['Colon - Ascending','Colon - Descending','Esophagus','Liver','Lung'],
                "backgroundColor": "#53b27e",
                "textColor": "#ffffff"
            },
            "Germ cells": {
                "values": ['Ovary','Testis'],
                "backgroundColor": "#80c4a0",
                "textColor": "#ffffff"
            },
            "Clinically accessible": {
                "values": ['Blood','Buccal swab'],
                "backgroundColor": "#70a588",
                "textColor": "#ffffff"
            }
        }}
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#6f2da8"
        useTestData={false}
    />
    {/* <DataMatrix
        key="data-matrix-demo-2"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        query={{
            "url": "/data_matrix_aggregations?type=SubmittedFile&limit=all",
            "agg_fields": ["file_sets.libraries.assay.display_title", "sample_summary.tissues"]
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
        query={{
            "url": "/data_matrix_aggregations?type=SubmittedFile&limit=all",
            "agg_fields": ["sample_summary.tissues", "donors.display_title"]
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
        query={{
            "url": "/data_matrix_aggregations?type=SubmittedFile&limit=all",
            "agg_fields": ["file_sets.libraries.assay.display_title", "file_sets.sequencing.sequencer.display_title"]
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
            "url": "/data_matrix_aggregations?type=SubmittedFile&limit=all",
            "agg_fields": ["data_type", "data_category"]
        }}
        fieldChangeMap={{
            "data_category": "data_category",
            "data_type": "data_type"
        }}
        groupingProperties={["data_category"]}
        columnGrouping="data_type"
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#e0475b"
    /> */}
</div>
