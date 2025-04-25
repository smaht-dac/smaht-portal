<div key="someRandomKey">
    <DataMatrix
        key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
        session={session}        // Required - hooks in 'session' (boolean) from App.
        query={{
            "url": "/data_matrix_aggregations?type=File&sample_summary.studies!=No+value&limit=all",
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
                "scDip-C - Illumina": "scDip-C",
                "CompDuplex-seq - Illumina": "CompDuplex-Seq",
                "Kinnex - PacBio": "Kinnex",
                "Fiber-seq - PacBio": "Fiber-Seq",
                "RNA-seq - Illumina": "RNA-Seq - Illumina",
                "NanoSeq - Illumina": "NanoSeq",
                "ATAC-seq - Illumina": "ATAC-Seq",
                "varCUT&Tag - Illumina": "varCUT&Tag",
                "VISTA-seq - Illumina": "VISTA-Seq",
                "scVISTA-seq - Illumina": "VISTA-Seq",
                "Microbulk VISTA-seq - Illumina": "VISTA-Seq",
                "CODEC - Illumina": "CODEC",
                "Single-cell MALBAC WGS - ONT": "MALBAC-amplified WGS",
                "Single-cell MALBAC WGS - Illumina": "MALBAC-amplified WGS",
                "TEnCATS - ONT": "TEnCATS",
                "WGS - ONT": "WGS - Standard ONT",
            },
            "tissue": {
                "endocrine pancreas": "Endocrine pancreas",
            }
        }}
        groupingProperties={["donor", "tissue"]}
        columnGrouping="assay"
        columnGroups={{
            "Bulk WGS": {
                "values": ['WGS - Illumina','WGS - PacBio','Fiber-Seq','WGS - Standard ONT','WGS - UltraLong ONT'],
                "backgroundColor": "#e04141",
                "textColor": "#ffffff",
                "shortName": "WGS"
            },
            "RNA-seq": {
                "values": ['RNA-Seq - Illumina', 'Kinnex'],
                "backgroundColor": "#ad48ad",
                "textColor": "#ffffff",
                "shortName": "RNA"
            },
            "Duplex-seq": {
                "values": ['NanoSeq','CODEC','ppmSeq','VISTA-Seq','CompDuplex-Seq','HiDEF-Seq'],
                "backgroundColor": "#2b4792",
                "textColor": "#ffffff",
                "shortName": "Dupl"
            },
            "Single-cell WGS": {
                "values": ['PTA-amplified WGS','MALBAC-amplified WGS','WGS DLP+'],
                "backgroundColor": "#aac536",
                "textColor": "#ffffff",
                "shortName": "scWGS"
            },
            "Targeted Seq": {
                "values": ['HAT-Seq','L1-ONT','TEnCATS'],
                "backgroundColor": "#e1d567",
                "textColor": "#ffffff",
                "shortName": "Tgtd"
            },
            "Single-cell RNA-Seq": {
                "values": ['snRNA-Seq','Slide-tags snRNA-Seq','STORM-Seq','Tranquil-Seq','10X Genomics Xenium'],
                "backgroundColor": "#d0b284",
                "textColor": "#ffffff",
                "shortName": "scRNA"
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
                "values": ['Single-cell WGS', 'Targeted Seq', 'Single-cell RNA-Seq', 'Other'],
                "backgroundColor": "#d2bde3",
                "textColor": "#ffffff"
            }
        }}
        showColumnGroupsExtended={false}
        rowGroups={null} //not implemented yet
        rowGroupsExtended={{
            "Ectoderm": {
                "values": ['Brain', 'Brain - Cerebellum', 'Brain - Frontal lobe', 'Brain - Hippocampus', 'Brain - Temporal lobe', 'Skin', 'Skin - Abdomen (non-exposed)', 'Skin - Calf (sun-exposed)'],
                "backgroundColor": "#367151",
                "textColor": "#ffffff",
                "shortName": "Ecto"
            },
            "Mesoderm": {
                "values": ['Aorta', 'Fibroblast', 'Heart', 'Muscle'],
                "backgroundColor": "#30975e",
                "textColor": "#ffffff",
                "shortName": "Meso"
            },
            "Endoderm": {
                "values": ['Colon', 'Colon - Ascending', 'Colon - Descending', 'Esophagus', 'Liver', 'Lung'],
                "backgroundColor": "#53b27e",
                "textColor": "#ffffff",
                "shortName": "Endo"
            },
            "Germ cells": {
                "values": ['Ovary', 'Testis'],
                "backgroundColor": "#80c4a0",
                "textColor": "#ffffff",
                "shortName": "Germ"
            },
            "Clinically accessible": {
                "values": ['Blood', 'Buccal swab'],
                "backgroundColor": "#70a588",
                "textColor": "#ffffff",
                "shortName": "Clin"
            },
            "N/A": {
                "values": ['Endocrine pancreas'],
                "backgroundColor": "#ffffff",
                "textColor": "#000000"
            }
        }}
        showRowGroupsExtended={true}
        headerFor={<h3 className="mt-2 mb-0 text-300">SMaHT</h3>}
        baseColorOverride="#6f2da8"
        xAxisLabel="Assay"
        yAxisLabel="Donor"
        useTestData={false}
    />
</div>
