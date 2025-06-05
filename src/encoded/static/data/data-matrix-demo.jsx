<div key="someRandomKey" className="container">
    <div className="row">
        <div className="col-12 col-xxl-7">
            <h4 className="text-500">Benchmarking Data</h4>
            <DataMatrix
                key="data-matrix-demo-1"   // Required to prevent re-instantiation of component upon window resize & similar.
                session={session}        // Required - hooks in 'session' (boolean) from App.
                query={{
                    "url": "/data_matrix_aggregations?type=File&sample_summary.studies=Benchmarking&status=public&status=released&status=restricted&limit=all",
                    "columnAggFields": ["file_sets.libraries.assay.display_title", "sequencing.sequencer.platform"], //composite column
                    "rowAggFields": ["donors.display_title", "sample_summary.tissues", "dataset"], //multiple column
                }}
                fieldChangeMap={{
                    "assay": "file_sets.libraries.assay.display_title",
                    "donor": "donors.display_title",
                    "tissue": "sample_summary.tissues",
                    "platform": "sequencing.sequencer.platform",
                    "data_type": "data_type",
                    "file_format": "file_format.display_title",
                    "data_category": "data_category",
                    "software": "software.display_title",
                    "study": "sample_summary.studies",
                    "dataset": "dataset",
                }}
                valueChangeMap={{
                    "assay": {
                        "scDip-C - Illumina": "scDip-C",
                        "CompDuplex-seq - Illumina": "CompDuplex-Seq",
                        "Kinnex - PacBio": "Kinnex",
                        "Fiber-seq - PacBio": "Fiber-Seq",
                        "Fiber-seq - Illumina": "Fiber-Seq",
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
                        "Ultra-Long WGS - ONT": "WGS - UltraLong ONT",
                        "HiDEF-seq - Illumina": "HiDEF-seq",
                        "HiDEF-seq - PacBio": "HiDEF-seq",
                        "Hi-C - Illumina": "Hi-C",
                        "Hi-C - PacBio": "Hi-C",
                    },
                    "tissue": {
                        "endocrine pancreas": "Endocrine pancreas",
                    },
                    "study": {
                        "Benchmarking": "Donors"
                    },
                    "donor": {
                        "colo829t": "COLO829T",
                        "colo829bl": "COLO829BL",
                        "colo829blt_50to1": "COLO829BLT50",
                        "colo829blt_in_silico": "In silico BLT50",
                        "colo829_snv_indel_challenge_data": "Truth Set",
                        "hapmap": "HapMap Mixture",
                        "mei_detection_challenge_data": "Downsampled",
                        "lb_fibroblast": "LB-LA2 Fibroblast",
                        "lb_ipsc_1": "LB-LA2 iPSC-1",
                        "lb_ipsc_2": "LB-LA2 iPSC-2",
                        "lb_ipsc_4": "LB-LA2 iPSC-4",
                        "lb_ipsc_52": "LB-LA2 iPSC-52",
                        "lb_ipsc_60": "LB-LA2 iPSC-60",
                        "ipsc_snv_indel_challenge_data": "Truth Set",
                    }
                }}
                resultPostProcessFuncKey="cellLinePostProcess"
                groupingProperties={["donor", "tissue"]}
                columnGrouping="assay"
                columnGroups={{
                    "Bulk WGS": {
                        "values": ['WGS - Illumina', 'WGS - PacBio', 'Fiber-Seq', 'WGS - Standard ONT', 'WGS - UltraLong ONT'],
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
                        "values": ['NanoSeq', 'CODEC', 'ppmSeq', 'VISTA-Seq', 'CompDuplex-Seq', 'HiDEF-seq'],
                        "backgroundColor": "#2b4792",
                        "textColor": "#ffffff",
                        "shortName": "Dupl"
                    },
                    "Single-cell WGS": {
                        "values": ['PTA-amplified WGS', 'MALBAC-amplified WGS', 'WGS DLP+'],
                        "backgroundColor": "#aac536",
                        "textColor": "#ffffff",
                        "shortName": "scWGS"
                    },
                    "Targeted Seq": {
                        "values": ['HAT-Seq', 'L1-ONT', 'TEnCATS'],
                        "backgroundColor": "#e1d567",
                        "textColor": "#ffffff",
                        "shortName": "Tgtd"
                    },
                    "Single-cell RNA-Seq": {
                        "values": ['snRNA-Seq', 'Slide-tags snRNA-Seq', 'STORM-Seq', 'Tranquil-Seq', '10X Genomics Xenium'],
                        "backgroundColor": "#d0b284",
                        "textColor": "#ffffff",
                        "shortName": "scRNA"
                    },
                    "Other": {
                        "values": ['Hi-C', 'scDip-C', 'Strand-Seq', 'ATAC-Seq', 'NT-Seq', 'varCUT&Tag', 'GoT-ChA'],
                        "backgroundColor": "#76cbbe",
                        "textColor": "#ffffff"
                    }
                }}
                columnGroupsExtended={{
                    "Core Assay": {
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
                showColumnGroups={true}
                showColumnGroupsExtended={false}
                rowGroups={{
                    "Cell Line": {
                        "values": ['COLO829T', 'COLO829BL', 'COLO829BLT50', 'In silico BLT50', 'Truth Set', 'HapMap Mixture', 'Downsampled', 'LB-LA2 Fibroblast', 'LB-LA2 iPSC-1', 'LB-LA2 iPSC-2', 'LB-LA2 iPSC-4', 'LB-LA2 iPSC-52', 'LB-LA2 iPSC-60'],
                        "backgroundColor": "#f4f4ff",
                        "textColor": "#000000",
                        "shortName": "Cell Line",
                        "customUrlParams": "dataset!=tissue"
                    },
                    "Donor": {
                        "values": ['ST001', 'ST002', 'ST003', 'ST004'],
                        "backgroundColor": "#f4f4ff",
                        "textColor": "#000000",
                        "shortName": "Donor",
                        "customUrlParams": "dataset=tissue"
                    }
                }}
                showRowGroups={true}
                autoPopulateRowGroupsProperty="study"
                rowGroupsExtended={{
                    "Ectoderm": {
                        "values": ['Brain', 'Brain - Cerebellum', 'Brain - Frontal lobe', 'Brain - Hippocampus', 'Brain - Temporal lobe', 'Skin', 'Skin - Abdomen (non-exposed)', 'Skin - Calf (sun-exposed)'],
                        "backgroundColor": "#367151",
                        "textColor": "#ffffff",
                        "shortName": "Ecto"
                    },
                    "Mesoderm": {
                        "values": ['Aorta', 'Fibroblast', 'Heart', 'Muscle', 'Adrenal Gland'],
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
                    }
                }}
                showRowGroupsExtended={true}
                headerFor={null}
                colorRangeBaseColor="#47adff"
                summaryBackgroundColor="#9ea0ff"
                allowedFields={[
                    "donors.display_title",
                    "sequencing.sequencer.display_title",
                    "file_sets.libraries.assay.display_title",
                    "sample_summary.tissues",
                    "data_type",
                    "file_format.display_title",
                    "data_category",
                    "software.display_title",
                    "sequencing.sequencer.platform",
                    "sample_summary.studies",
                    "dataset",
                ]}
                xAxisLabel="Assays"
                yAxisLabel="Cell Lines + Donors"
                showAxisLabels={false}
                showColumnSummary={false}
                defaultOpen={false}
                compositeValueSeparator=" - "
                disableConfigurator={false}
            />
        </div>
        <div className="col-12 col-xxl-5">
            <h4 className="text-500">Production Data</h4>
            <DataMatrix
                key="data-matrix-demo-2"   // Required to prevent re-instantiation of component upon window resize & similar.
                session={session}        // Required - hooks in 'session' (boolean) from App.
                query={{
                    "url": "/data_matrix_aggregations?type=File&sample_summary.studies=Production&status=released&limit=all",
                    "columnAggFields": ["file_sets.libraries.assay.display_title", "sequencing.sequencer.platform"], //composite column
                    "rowAggFields": ["donors.display_title", "sample_summary.tissues"], //multiple column
                }}
                fieldChangeMap={{
                    "assay": "file_sets.libraries.assay.display_title",
                    "donor": "donors.display_title",
                    "tissue": "sample_summary.tissues",
                    "platform": "sequencing.sequencer.platform",
                    "data_type": "data_type",
                    "file_format": "file_format.display_title",
                    "data_category": "data_category",
                    "software": "software.display_title",
                    "study": "sample_summary.studies",
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
                        "Ultra-Long WGS - ONT": "WGS - UltraLong ONT",
                        "HiDEF-seq - Illumina": "HiDEF-seq",
                        "HiDEF-seq - PacBio": "HiDEF-seq",
                        "Hi-C - Illumina": "Hi-C",
                        "Hi-C - PacBio": "Hi-C",
                    },
                    "tissue": {
                        "endocrine pancreas": "Endocrine pancreas",
                    }
                }}
                resultPostProcessFuncKey={null}
                groupingProperties={["donor", "tissue"]}
                columnGrouping="assay"
                columnGroups={{
                    "Bulk WGS": {
                        "values": ['WGS - Illumina', 'WGS - PacBio', 'Fiber-Seq', 'WGS - Standard ONT', 'WGS - UltraLong ONT'],
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
                        "values": ['NanoSeq', 'CODEC', 'ppmSeq', 'VISTA-Seq', 'CompDuplex-Seq', 'HiDEF-seq'],
                        "backgroundColor": "#2b4792",
                        "textColor": "#ffffff",
                        "shortName": "Dupl"
                    },
                    "Single-cell WGS": {
                        "values": ['PTA-amplified WGS', 'MALBAC-amplified WGS', 'WGS DLP+'],
                        "backgroundColor": "#aac536",
                        "textColor": "#ffffff",
                        "shortName": "scWGS"
                    },
                    "Targeted Seq": {
                        "values": ['HAT-Seq', 'L1-ONT', 'TEnCATS'],
                        "backgroundColor": "#e1d567",
                        "textColor": "#ffffff",
                        "shortName": "Tgtd"
                    },
                    "Single-cell RNA-Seq": {
                        "values": ['snRNA-Seq', 'Slide-tags snRNA-Seq', 'STORM-Seq', 'Tranquil-Seq', '10X Genomics Xenium'],
                        "backgroundColor": "#d0b284",
                        "textColor": "#ffffff",
                        "shortName": "scRNA"
                    },
                    "Other": {
                        "values": ['Hi-C', 'scDip-C', 'Strand-Seq', 'ATAC-Seq', 'NT-Seq', 'varCUT&Tag', 'GoT-ChA'],
                        "backgroundColor": "#76cbbe",
                        "textColor": "#ffffff"
                    }
                }}
                columnGroupsExtended={{
                    "Core Assay": {
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
                showColumnGroups={true}
                showColumnGroupsExtended={false}
                rowGroups={null}
                showRowGroups={false}
                autoPopulateRowGroupsProperty={null}
                rowGroupsExtended={{
                    "Ectoderm": {
                        "values": ['Brain', 'Brain - Cerebellum', 'Brain - Frontal lobe', 'Brain - Hippocampus', 'Brain - Temporal lobe', 'Skin', 'Skin - Abdomen (non-exposed)', 'Skin - Calf (sun-exposed)'],
                        "backgroundColor": "#367151",
                        "textColor": "#ffffff",
                        "shortName": "Ecto"
                    },
                    "Mesoderm": {
                        "values": ['Aorta', 'Fibroblast', 'Heart', 'Muscle', 'Adrenal Gland'],
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
                    }
                }}
                showRowGroupsExtended={true}
                headerFor={null}
                colorRangeBaseColor="#47adff"
                summaryBackgroundColor="#9ea0ff"
                allowedFields={[
                    "donors.display_title",
                    "sequencing.sequencer.display_title",
                    "file_sets.libraries.assay.display_title",
                    "sample_summary.tissues",
                    "data_type",
                    "file_format.display_title",
                    "data_category",
                    "software.display_title",
                    "sequencing.sequencer.platform",
                    "sample_summary.studies",
                    "dataset",
                ]}
                xAxisLabel="Assays"
                yAxisLabel="Donors"
                showAxisLabels={false}
                showColumnSummary={true}
                defaultOpen={false}
                compositeValueSeparator=" - "
                disableConfigurator={false}
            />
        </div>
    </div>
</div>
