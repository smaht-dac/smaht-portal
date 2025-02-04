from datetime import datetime
from pyramid.request import Request as PyramidRequest
from typing import Optional
from unittest.mock import patch
from webob.multidict import MultiDict
from encoded.endpoints.recent_files_summary.recent_files_summary import recent_files_summary
import encoded.endpoints.endpoint_utils

recent_files_summary_raw_results = {
    "@context": "/terms/",
    "@id": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2023-07-01&date_created.to=2025-01-31&from=0&limit=0",
    "@type": [
        "OutputFileSearchResults",
        "FileSearchResults",
        "ItemSearchResults",
        "Search"
    ],
    "title": "Search",
    "filters": [
        {
            "field": "type",
            "term": "OutputFile",
            "remove": "/search/?status=released&data_category%21=Quality+Control&date_created.from=2023-07-01&date_created.to=2025-01-31"
        },
        {
            "field": "status",
            "term": "released",
            "remove": "/search/?type=OutputFile&data_category%21=Quality+Control&date_created.from=2023-07-01&date_created.to=2025-01-31"
        },
        {
            "field": "data_category!",
            "term": "Quality Control",
            "remove": "/search/?type=OutputFile&status=released&date_created.from=2023-07-01&date_created.to=2025-01-31"
        },
        {
            "field": "date_created.from",
            "term": "2023-07-01",
            "remove": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.to=2025-01-31"
        },
        {
            "field": "date_created.to",
            "term": "2025-01-31",
            "remove": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2023-07-01"
        }
    ],
    "facets": [
        {
            "field": "type",
            "title": "Data Type",
            "total": 0,
            "hide_from_view": True,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "File",
                    "doc_count": 54
                },
                {
                    "key": "Item",
                    "doc_count": 54
                },
                {
                    "key": "OutputFile",
                    "doc_count": 54
                }
            ],
            "extra_aggs": {
                "meta": {},
                "requested_agg": {
                    "doc_count_error_upper_bound": 0,
                    "sum_other_doc_count": 0,
                    "buckets": [
                        {
                            "key": "File",
                            "doc_count": 54
                        },
                        {
                            "key": "Item",
                            "doc_count": 54
                        },
                        {
                            "key": "OutputFile",
                            "doc_count": 54
                        }
                    ]
                }
            }
        },
        {
            "field": "file_sets.libraries.assay.display_title",
            "title": "Experimental Assay",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "WGS",
                    "doc_count": 44
                },
                {
                    "key": "Fiber-seq",
                    "doc_count": 6
                },
                {
                    "key": "Ultra-Long WGS",
                    "doc_count": 4
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "file_sets.sequencing.sequencer.display_title",
            "title": "Sequencing Platform",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "ONT PromethION 24",
                    "doc_count": 26
                },
                {
                    "key": "Illumina NovaSeq X",
                    "doc_count": 15
                },
                {
                    "key": "PacBio Revio",
                    "doc_count": 8
                },
                {
                    "key": "Illumina NovaSeq X Plus",
                    "doc_count": 5
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "file_format.display_title",
            "title": "Data Format",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "bam",
                    "doc_count": 54
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "data_type",
            "title": "Data Category",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "Aligned Reads",
                    "doc_count": 54
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "sequencing_center.display_title",
            "title": "Sequencing Center",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "UWSC GCC",
                    "doc_count": 27
                },
                {
                    "key": "BCM GCC",
                    "doc_count": 18
                },
                {
                    "key": "WASHU GCC",
                    "doc_count": 5
                },
                {
                    "key": "BROAD GCC",
                    "doc_count": 3
                },
                {
                    "key": "NYGC GCC",
                    "doc_count": 1
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "submission_centers.display_title",
            "title": "Generated By",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "HMS DAC",
                    "doc_count": 54
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "software.display_title",
            "title": "Analysis Method",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "Sentieon minimap2",
                    "doc_count": 26
                },
                {
                    "key": "Sentieon BWA-MEM",
                    "doc_count": 20
                },
                {
                    "key": "pbmm2",
                    "doc_count": 8
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "version",
            "title": "Release Version",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "No value",
                    "doc_count": 54
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "status",
            "title": "Status",
            "total": 0,
            "aggregation_type": "terms",
            "terms": [
                {
                    "key": "released",
                    "doc_count": 54
                },
                {
                    "key": "uploaded",
                    "doc_count": 3
                }
            ],
            "extra_aggs": {
                "meta": {},
                "requested_agg": {
                    "doc_count_error_upper_bound": 0,
                    "sum_other_doc_count": 0,
                    "buckets": [
                        {
                            "key": "released",
                            "doc_count": 54
                        },
                        {
                            "key": "uploaded",
                            "doc_count": 3
                        }
                    ]
                }
            }
        },
        {
            "field": "data_category",
            "title": "Data Category",
            "total": 0,
            "aggregation_type": "terms",
            "description": "Category for information in the file",
            "terms": [
                {
                    "key": "Quality Control",
                    "doc_count": 92
                },
                {
                    "key": "Sequencing Reads",
                    "doc_count": 54
                }
            ],
            "extra_aggs": {
                "meta": {}
            }
        },
        {
            "field": "date_created",
            "title": "Date Created",
            "total": 54,
            "aggregation_type": "stats",
            "field_type": "date",
            "count": 54,
            "min": 1711656610441.0,
            "max": 1724352187507.0,
            "avg": 1716196769409.3704,
            "sum": 92674625548106.0,
            "min_as_string": "2024-03-28T20:10:10.441Z",
            "max_as_string": "2024-08-22T18:43:07.507Z",
            "avg_as_string": "2024-05-20T09:19:29.409Z",
            "sum_as_string": "4906-09-28T23:32:28.106Z",
            "extra_aggs": {
                "meta": {}
            }
        }
    ],
    "@graph": [],
    "notification": "Success",
    "sort": {
        "date_created": {
            "order": "desc",
            "unmapped_type": "keyword"
        },
        "label": {
            "order": "asc",
            "missing": "_last",
            "unmapped_type": "keyword"
        }
    },
    "clear_filters": "/search/?type=OutputFile",
    "total": 54,
    "aggregations": {
        "aggregate_by_cell_line": {
            "meta": {
                "field_name": "date_created"
            },
            "doc_count": 54,
            "dummy_date_histogram": {
                "buckets": [
                    {
                        "key_as_string": "2024-08",
                        "key": 1722470400000,
                        "doc_count": 2,
                        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                            "meta": {
                                "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
                            },
                            "doc_count_error_upper_bound": 0,
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {
                                    "key": "donors.display_title:DAC_DONOR_COLO829",
                                    "doc_count": 1,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:ST003-1Q",
                                    "doc_count": 1,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "key_as_string": "2024-07",
                        "key": 1719792000000,
                        "doc_count": 0,
                        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                            "meta": {
                                "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
                            },
                            "doc_count_error_upper_bound": 0,
                            "sum_other_doc_count": 0,
                            "buckets": []
                        }
                    },
                    {
                        "key_as_string": "2024-06",
                        "key": 1717200000000,
                        "doc_count": 19,
                        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                            "meta": {
                                "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
                            },
                            "doc_count_error_upper_bound": 0,
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:ST002-1G",
                                    "doc_count": 5,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 3
                                            },
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 2
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:ST001-1A",
                                    "doc_count": 4,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 3
                                            },
                                            {
                                                "key": "Fiber-seq PacBio Revio bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:ST001-1D",
                                    "doc_count": 4,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 3
                                            },
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:ST002-1D",
                                    "doc_count": 4,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 3
                                            },
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:COLO829BLT50",
                                    "doc_count": 1,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:ST004-1Q",
                                    "doc_count": 1,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 1
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "key_as_string": "2024-05",
                        "key": 1714521600000,
                        "doc_count": 22,
                        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                            "meta": {
                                "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
                            },
                            "doc_count_error_upper_bound": 0,
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:COLO829BLT50",
                                    "doc_count": 10,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 4
                                            },
                                            {
                                                "key": "WGS Illumina NovaSeq X Plus bam",
                                                "doc_count": 2
                                            },
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 2
                                            },
                                            {
                                                "key": "WGS PacBio Revio bam",
                                                "doc_count": 2
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "donors.display_title:DAC_DONOR_COLO829",
                                    "doc_count": 7,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS Illumina NovaSeq X bam",
                                                "doc_count": 7
                                            }
                                        ]
                                    }
                                },
                                {
                                    "key": "file_sets.libraries.analytes.samples.sample_sources.code:HAPMAP6",
                                    "doc_count": 5,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "WGS Illumina NovaSeq X Plus bam",
                                                "doc_count": 3
                                            },
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 2
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "key_as_string": "2024-04",
                        "key": 1711929600000,
                        "doc_count": 3,
                        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                            "meta": {
                                "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
                            },
                            "doc_count_error_upper_bound": 0,
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {
                                    "key": "donors.display_title:DAC_DONOR_COLO829",
                                    "doc_count": 3,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "Fiber-seq PacBio Revio bam",
                                                "doc_count": 3
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    },
                    {
                        "key_as_string": "2024-03",
                        "key": 1709251200000,
                        "doc_count": 8,
                        "file_sets.libraries.analytes.samples.sample_sources.cell_line.code": {
                            "meta": {
                                "field_name": "file_sets.libraries.analytes.samples.sample_sources.cell_line.code"
                            },
                            "doc_count_error_upper_bound": 0,
                            "sum_other_doc_count": 0,
                            "buckets": [
                                {
                                    "key": "donors.display_title:DAC_DONOR_COLO829",
                                    "doc_count": 8,
                                    "release_tracker_description": {
                                        "meta": {
                                            "field_name": "release_tracker_description"
                                        },
                                        "doc_count_error_upper_bound": 0,
                                        "sum_other_doc_count": 0,
                                        "buckets": [
                                            {
                                                "key": "Ultra-Long WGS ONT PromethION 24 bam",
                                                "doc_count": 4
                                            },
                                            {
                                                "key": "Fiber-seq PacBio Revio bam",
                                                "doc_count": 2
                                            },
                                            {
                                                "key": "WGS ONT PromethION 24 bam",
                                                "doc_count": 2
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }
    },
    "actions": [
        {
            "name": "add",
            "title": "Add",
            "profile": "/profiles/OutputFile.json",
            "href": "/search/?type=OutputFile&currentAction=add"
        }
    ],
    "columns": {
        "display_title": {
            "title": "Title",
            "order": -1000
        },
        "access_status": {
            "title": "Access"
        },
        "annotated_filename": {
            "title": "File"
        },
        "file_sets.libraries.assay.display_title": {
            "title": "Assay"
        },
        "file_sets.sequencing.sequencer.display_title": {
            "title": "Platform"
        },
        "file_format.display_title": {
            "title": "Data Format"
        },
        "data_type": {
            "title": "Data Category"
        },
        "sequencing_center.display_title": {
            "title": "Sequencing Center"
        },
        "submission_centers.display_title": {
            "title": "Generated By"
        },
        "software.display_title": {
            "title": "Method"
        },
        "file_status_tracking.released_date": {
            "title": "Release Date"
        },
        "file_size": {
            "title": "File Size"
        },
        "status": {
            "title": "Status",
            "default_hidden": True,
            "order": 980
        },
        "date_created": {
            "title": "Date Created",
            "colTitle": "Created",
            "default_hidden": True,
            "order": 1000
        }
    }
}

recent_files_summary_expected_results = {
    "count": 54,
    "items": [
        {
            "name": "date_created",
            "value": "2024-08",
            "count": 2,
            "items": [
                {
                    "name": "donors.display_title",
                    "value": "DAC_DONOR_COLO829",
                    "count": 1,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-08-01&date_created.to=2024-08-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-08-01&date_created.to=2024-08-31&donors.display_title=DAC_DONOR_COLO829"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "ST003-1Q",
                    "count": 1,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-08-01&date_created.to=2024-08-31&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-08-01&date_created.to=2024-08-31&file_sets.libraries.analytes.samples.sample_sources.code=ST003-1Q"
                }
            ],
            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-08-01&date_created.to=2024-08-31"
        },
        {
            "name": "date_created",
            "value": "2024-06",
            "count": 19,
            "items": [
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "ST002-1G",
                    "count": 5,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 3,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1G"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "ST001-1A",
                    "count": 4,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 3,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "Fiber-seq PacBio Revio bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A&release_tracker_description=Fiber-seq+PacBio+Revio+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1A"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "ST001-1D",
                    "count": 4,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 3,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST001-1D"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "ST002-1D",
                    "count": 4,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 3,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST002-1D"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "COLO829BLT50",
                    "count": 1,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "ST004-1Q",
                    "count": 1,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 1,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30&file_sets.libraries.analytes.samples.sample_sources.code=ST004-1Q"
                }
            ],
            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-06-01&date_created.to=2024-06-30"
        },
        {
            "name": "date_created",
            "value": "2024-05",
            "count": 22,
            "items": [
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "COLO829BLT50",
                    "count": 10,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 4,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X Plus bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS PacBio Revio bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50&release_tracker_description=WGS+PacBio+Revio+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=COLO829BLT50"
                },
                {
                    "name": "donors.display_title",
                    "value": "DAC_DONOR_COLO829",
                    "count": 7,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X bam",
                            "count": 7,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+Illumina+NovaSeq+X+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&donors.display_title=DAC_DONOR_COLO829"
                },
                {
                    "name": "file_sets.libraries.analytes.samples.sample_sources.code",
                    "value": "HAPMAP6",
                    "count": 5,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "WGS Illumina NovaSeq X Plus bam",
                            "count": 3,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS+Illumina+NovaSeq+X+Plus+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31&file_sets.libraries.analytes.samples.sample_sources.code=HAPMAP6"
                }
            ],
            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-05-01&date_created.to=2024-05-31"
        },
        {
            "name": "date_created",
            "value": "2024-04",
            "count": 3,
            "items": [
                {
                    "name": "donors.display_title",
                    "value": "DAC_DONOR_COLO829",
                    "count": 3,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "Fiber-seq PacBio Revio bam",
                            "count": 3,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Fiber-seq+PacBio+Revio+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30&donors.display_title=DAC_DONOR_COLO829"
                }
            ],
            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-04-01&date_created.to=2024-04-30"
        },
        {
            "name": "date_created",
            "value": "2024-03",
            "count": 8,
            "items": [
                {
                    "name": "donors.display_title",
                    "value": "DAC_DONOR_COLO829",
                    "count": 8,
                    "items": [
                        {
                            "name": "release_tracker_description",
                            "value": "Ultra-Long WGS ONT PromethION 24 bam",
                            "count": 4,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Ultra-Long+WGS+ONT+PromethION+24+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "Fiber-seq PacBio Revio bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=Fiber-seq+PacBio+Revio+bam"
                        },
                        {
                            "name": "release_tracker_description",
                            "value": "WGS ONT PromethION 24 bam",
                            "count": 2,
                            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829&release_tracker_description=WGS+ONT+PromethION+24+bam"
                        }
                    ],
                    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31&donors.display_title=DAC_DONOR_COLO829"
                }
            ],
            "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2024-03-01&date_created.to=2024-03-31"
        }
    ],
    "query": "/search/?type=OutputFile&status=released&data_category%21=Quality+Control&date_created.from=2023-07-01&date_created.to=2025-01-31"
}

class TestPyramidRequest(PyramidRequest):
    def __init__(self, args: Optional[dict] = None):
        super().__init__({})
        self._params = MultiDict(args if isinstance(args, dict) else {})
    @property  # noqa
    def params(self) -> MultiDict:
        return self._params
    @params.setter  # noqa
    def params(self, value: MultiDict) -> None:
        if isinstance(value, MultiDict):
            self._params = value

def test_recent_files_summary():

    global recent_files_summary_raw_results

    request = TestPyramidRequest({
        "date_property_name": "date_created",
        "nmonths": 18
    })

    fixed_datetime = datetime(2025, 1, 30)
    with patch("encoded.endpoints.endpoint_utils._get_today", return_value=fixed_datetime):
        mocked_execute_aggregation_query = lambda *args, **kwargs: recent_files_summary_raw_results  # noqa
        response = recent_files_summary(request, custom_execute_aggregation_query=mocked_execute_aggregation_query)
        assert response == recent_files_summary_expected_results
