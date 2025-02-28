import json, sys, subprocess, pprint, time, csv, datetime
import requests
import click
from pathlib import Path
from collections import OrderedDict
from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager

# Location of resulting file in portal
# s3://smaht-production-application-files/25d09e18-2f77-4541-a32c-0f1d99defbd3/SMAFILZCEQ1X.json

# Define where to get the data from
ENV = "data"
SMAHT_KEY = SMaHTKeyManager().get_keydict_for_env(ENV)

SEARCH_QUERY_QC = (
    "search/?submission_centers.display_title=UWSC+GCC"
    "&submission_centers.display_title=WASHU+GCC"
    "&submission_centers.display_title=BROAD+GCC"
    "&submission_centers.display_title=NYGC+GCC"
    "&submission_centers.display_title=BCM+GCC"
    "&field=uuid"
    "&type=FileSet"
    #"&limit=10000"
    "&limit=50&from=100"  # for testing
    # "&accession=SMAFSADRYKW2"
)


# Portal Constants
UUID = "uuid"
QUALITY_METRICS = "quality_metrics"
ACCESSION = "accession"
SUBMISSION_CENTERS = "submission_centers"
SUBMISSION_CENTER = "submission_center"
LIBRARIES = "libraries"
ASSAY = "assay"
SEQUENCING = "sequencing"
SEQUENCER = "sequencer"
STATUS = "status"
DISPLAY_TITLE = "display_title"
DELETED = "deleted"
COMPLETED = "completed"
EXTERNAL_ID = "external_id"

SAMPLE_SOURCE = "sample_source"
SAMPLE_SOURCE_GROUP = "sample_source_group"
READ_LENGTH = "read_length"

# Supported assays
WGS = "WGS"
RNA_SEQ = "RNA-seq"

WGS_ASSAYS = ["WGS", "Ultra-Long WGS", "PCR WGS", "Fiber-seq"]
RNA_ASSAYS = ["RNA-seq"]

# Supported sequencers
SEQ_ONT = "ONT PromethION 24"
SEQ_PACBIO = "PacBio Revio"
SEQ_ILL_NX = "Illumina NovaSeq X"
SEQ_ILL_NXP = "Illumina NovaSeq X Plus"
SEQ_ILL_N6000 = "Illumina NovaSeq 6000"

# Sequencer groups
ALL_ILLUMINA = "all_illumina"
ALL_LONG_READ = "all_long_read"

# long/short read sequencers
LONG_READ_SEQS = [SEQ_ONT, SEQ_PACBIO]
SHORT_READ_SEQS = [SEQ_ILL_NX, SEQ_ILL_NXP, SEQ_ILL_N6000]
SUPPORTED_SEQUENCERS = LONG_READ_SEQS + SHORT_READ_SEQS

# Sample source groups
CELL_LINE = "cell_line"
TISSUES = "tissue"

DEFAULT_FACET_GROUPING = [
    {"key": SUBMISSION_CENTER, "label": "Submission Center"},
    # {"key": ASSAY, "label": "Assay"},
    {"key": SAMPLE_SOURCE, "label": "Sample source"},
    # {"key": SAMPLE_SOURCE_GROUP, "label": "Tissue / Cell line"},
    # {"key": READ_LENGTH, "label": "Read length (short / long)"},
]

DEFAULT_FACET_SAMPLE_SOURCE = [
    {"key": CELL_LINE, "label": "All cell lines"},
    {"key": TISSUES, "label": "All tissues"},
]

DEFAULT_FACET_ASSAY = [
    {"key": WGS, "label": WGS},
    {"key": RNA_SEQ, "label": RNA_SEQ},
]

DEFAULT_FACET_SEQUENCER = [
    {"key": ALL_ILLUMINA, "label": "All short read: Illumina"},
    {"key": ALL_LONG_READ, "label": "All long read: ONT/PacBio"},
    {"key": SEQ_ONT, "label": SEQ_ONT},
    {"key": SEQ_PACBIO, "label": SEQ_PACBIO},
]

# Default filtering settings
DEFAULT_SELECTED_QC_METRIC_BOXPLOT = (
    "samtools_stats:percentage_of_properly_paired_reads"
)
DEFAULT_ASSAY_BOXPLOT = WGS
DEFAULT_GROUPING_BOXPLOT = SUBMISSION_CENTER
DEFAULT_SAMPLE_SOURCE_BOXPLOT = TISSUES
DEFAULT_SEQUENCER_BOXPLOT = ALL_ILLUMINA

DEFAULT_SELECTED_QC_METRIC_SCATTERPLOT_X = (
    "picard_collect_alignment_summary_metrics:pf_mismatch_rate"
)
DEFAULT_SELECTED_QC_METRIC_SCATTERPLOT_Y = (
    "samtools_stats_postprocessed:percentage_reads_mapped"
)
DEFAULT_ASSAY_SCATTERPLOT = WGS
DEFAULT_GROUPING_SCATTERPLOT = SUBMISSION_CENTER
DEFAULT_SAMPLE_SOURCE_SCATTERPLOT = TISSUES
DEFAULT_SEQUENCER_SCATTERPLOT = ALL_ILLUMINA

VISIBLE_FIELDS_IN_TOOLTIP = [
    {"key": "file_display_title", "label": "File"},
    {"key": "file_status", "label": "Status"},
    {"key": "fileset", "label": "Fileset"},
    {"key": "submission_center", "label": "Submission center"},
    {"key": "assay_label", "label": "Assay"},
    {"key": "sequencer", "label": "Sequencer"},
    {"key": "sample_source", "label": "Sample source"},
]

VISIBLE_FIELDS_IN_TOOLTIP_SAMPLE_IDENTITY = [
    {"key": "sample_a", "label": "Sample A"},
    {"key": "sample_b", "label": "Sample B"},
    {"key": "relatedness", "label": "Relatedness"},
    {"key": "ibs0", "label": "IBS0"},
    {"key": "ibs2", "label": "IBS2"},
]

# This is hardcoded for now, but it should be extracted from the MWF in the future
QC_THRESHOLDS = {
    f"{ALL_ILLUMINA}_{WGS}": {
        "verifybamid:freemix_alpha": 0.01,
        "samtools_stats_postprocessed:percentage_reads_duplicated": 8.0,
        "samtools_stats_postprocessed:percentage_reads_mapped": 99.0,
        "samtools_stats:percentage_of_properly_paired_reads": 96.0,
        "picard_collect_alignment_summary_metrics:pf_mismatch_rate": 0.008,
    },
    f"{SEQ_ONT}_{WGS}": {
        "samtools_stats_postprocessed:percentage_reads_mapped": 98.0,
        "picard_collect_alignment_summary_metrics:pf_mismatch_rate": 0.01,
    },
    f"{SEQ_PACBIO}_{WGS}": {
        "verifybamid:freemix_alpha": 0.01,
        "samtools_stats_postprocessed:percentage_reads_mapped": 98.0,
        "picard_collect_alignment_summary_metrics:pf_mismatch_rate": 0.003,
    },
}


class FileStats:
    def __init__(self, output):
        self.errors = []
        self.warnings = []
        self.output_path = output
        self.stats = []
        self.somalier_results = {}
        self.qc_info = {}
        self.viz_info = {
            "facets": {
                "qc_metrics": {},
                "grouping": DEFAULT_FACET_GROUPING,
                "assay": DEFAULT_FACET_ASSAY,
                "sample_source": DEFAULT_FACET_SAMPLE_SOURCE,
                "sequencer": DEFAULT_FACET_SEQUENCER,
                "sample_identity_donors": [],
            },
            "default_settings": {
                "boxplot": {
                    "selectedQcMetric": DEFAULT_SELECTED_QC_METRIC_BOXPLOT,
                    "assay": DEFAULT_ASSAY_BOXPLOT,
                    "grouping": DEFAULT_GROUPING_BOXPLOT,
                    "sampleSource": DEFAULT_SAMPLE_SOURCE_BOXPLOT,
                    "sequencer": DEFAULT_SEQUENCER_BOXPLOT,
                    "tooltipFields": VISIBLE_FIELDS_IN_TOOLTIP,
                },
                "scatterplot": {
                    "selectedQcMetricX": DEFAULT_SELECTED_QC_METRIC_SCATTERPLOT_X,
                    "selectedQcMetricY": DEFAULT_SELECTED_QC_METRIC_SCATTERPLOT_Y,
                    "assay": DEFAULT_ASSAY_SCATTERPLOT,
                    "grouping": DEFAULT_GROUPING_SCATTERPLOT,
                    "sampleSource": DEFAULT_SAMPLE_SOURCE_SCATTERPLOT,
                    "sequencer": DEFAULT_SEQUENCER_SCATTERPLOT,
                    "tooltipFields": VISIBLE_FIELDS_IN_TOOLTIP,
                },
                "scatterplot_sample_identity": {
                    "tooltipFields": VISIBLE_FIELDS_IN_TOOLTIP_SAMPLE_IDENTITY,
                },
            },
            "qc_thresholds": QC_THRESHOLDS,
        }

    def get_stats(self):
        print(f"Retrieving filesets...")

        sample_source_codes_for_facets = []

        filesets = search(SEARCH_QUERY_QC)
        print(f"Number of filesets considered: {len(filesets)}")
        for fileset_from_search in progressbar(filesets, "Processing filesets "):
            fileset = get_item(fileset_from_search[UUID])
            fileset_accession = fileset[ACCESSION]

            # Get information from the fileset
            tags = fileset.get("tags", [])
            tags.sort()
            tags = ", ".join(tags)
            submission_centers = [
                s["display_title"] for s in fileset[SUBMISSION_CENTERS]
            ]
            submission_centers.sort()
            submission_centers = ", ".join(submission_centers)
            assays = [l[ASSAY]["display_title"] for l in fileset[LIBRARIES]]

            assay = None
            if set(assays) & set(WGS_ASSAYS):
                assay = WGS
            elif set(assays) & set(RNA_ASSAYS):
                assay = RNA_SEQ

            if not assay:
                self.warnings.append(
                    f"Warning: Fileset {fileset[ACCESSION]} has no supported assay"
                )
                continue

            sequencer = fileset[SEQUENCING][SEQUENCER]["display_title"]
            if sequencer not in SUPPORTED_SEQUENCERS:
                self.warnings.append(
                    f"Warning: Fileset {fileset[ACCESSION]} has no supported sequencer"
                )
                continue

            sample_source_codes = []
            for sample_source in self.get_sample_sources_from_fileset(fileset):
                code = sample_source.get("code")
                if "Tissue" in sample_source["@type"]:
                    if not code:
                        break
                    sample_source_codes.append(f"{code}")
                else:
                    if not code:
                        cell_line = sample_source.get("cell_line", {})
                        if isinstance(cell_line, list):
                            for cl in cell_line:
                                code = cl.get("code", "")
                                sample_source_codes.append(f"{code}")
                        else:
                            code = sample_source.get("cell_line", {}).get("code", None)
                            if code:
                                sample_source_codes.append(f"{code}")
                    else:
                        sample_source_codes.append(f"{code}")

            if not sample_source_codes:
                self.warnings.append(
                    f"Warning: Fileset {fileset[ACCESSION]} has no sample source codes"
                )
                continue
            sample_source_codes = list(set(sample_source_codes))
            sample_source_codes.sort()

            tissues = []
            for ssc in sample_source_codes:
                tissues.append(tissue_code_to_word(ssc) or "?")

            sample_source_codes = ", ".join(sample_source_codes)
            tissues = ", ".join(tissues)

            # Get the alignment MWFR to process the fastp outputs and get the final BAM
            mwfr = self.get_alignment_mwfr(fileset)
            if not mwfr:
                continue

            # Search the aligned BAM and extract quality metrics from it
            final_ouput_file = self.get_final_ouput_file(mwfr, assay)
            if not final_ouput_file:
                self.warnings.append(
                    f"Warning: Fileset {fileset[ACCESSION]} has no final output file"
                )
                continue

            sample_source_codes_for_facets.append(
                tissues if ("?" not in tissues) else sample_source_codes
            )

            result = {}
            result["fileset"] = fileset_accession
            result["file_accession"] = final_ouput_file[ACCESSION]
            result["file_status"] = final_ouput_file[STATUS]
            result["file_display_title"] = final_ouput_file[DISPLAY_TITLE]
            result[SUBMISSION_CENTER] = submission_centers
            result["tags"] = tags
            result[ASSAY] = assay
            result["assay_label"] = ",".join(assays)
            result[SEQUENCER] = sequencer
            if sequencer in SHORT_READ_SEQS:
                result["sequencer_group"] = ALL_ILLUMINA
            elif sequencer in LONG_READ_SEQS:
                result["sequencer_group"] = ALL_LONG_READ
            result[SAMPLE_SOURCE] = sample_source_codes
            if tissues != "?":
                result["tissue"] = tissues
                result["sample_source_subgroup"] = tissues
                result[SAMPLE_SOURCE_GROUP] = TISSUES
            else:
                result["sample_source_subgroup"] = sample_source_codes
                result[SAMPLE_SOURCE_GROUP] = CELL_LINE
            result["read_length"] = "long" if sequencer in LONG_READ_SEQS else "short"
            result["quality_metrics"] = {}

            qm = self.get_quality_metrics(final_ouput_file)
            qc_values = qm["qc_values"]
            result["quality_metrics"]["overall_quality_status"] = qm.get(
                "overall_quality_status", "NA"
            )
            result["quality_metrics"]["qc_values"] = {}
            for qc_value in qc_values:
                derived_from = qc_value["derived_from"]
                value = qc_value["value"]
                flag = qc_value.get("flag", "NA")
                result["quality_metrics"]["qc_values"][derived_from] = {
                    "value": value,
                    "flag": flag,
                }
                if derived_from not in self.qc_info:
                    self.qc_info[derived_from] = {
                        "derived_from": derived_from,
                        "tooltip": qc_value.get("tooltip", ""),
                        "key": qc_value.get("key", ""),
                    }
                    if assay in self.viz_info["facets"]["qc_metrics"]:
                        self.viz_info["facets"]["qc_metrics"][assay].append(
                            self.qc_info[derived_from]
                        )
                    else:
                        self.viz_info["facets"]["qc_metrics"][assay] = []

            self.viz_info["facets"]["qc_metrics"][assay].sort(
                key=lambda x: x["derived_from"]
            )

            self.stats.append(result)

        for w in self.warnings:
            print(w)
        for e in self.errors:
            print(e)

        sample_source_codes_for_facets = list(set(sample_source_codes_for_facets))
        sample_source_codes_for_facets.sort()
        for ssc in sample_source_codes_for_facets:
            # tissue = tissue_code_to_word(ssc)
            # label = f"{ssc} ({tissue})" if tissue else ssc
            # self.viz_info["facets"]["sample_source"].append(
            #     {"key": ssc, "label": label},
            # )
            self.viz_info["facets"]["sample_source"].append(
                {"key": ssc, "label": ssc},
            )

        # GET SAMPLE IDENTITY CHECK RESULTS
        print("\n\nWorking on sample identity results")
        print("Retrieving donors")

        search_query_donors = "search/?type=Donor" "&limit=10000"
        donors = search(search_query_donors)
        for donor in donors:
            donor_accession = donor[ACCESSION]
            print(donor[ACCESSION])

            latest_run = get_latest_somalier_run_for_donor(donor_accession)
            if not latest_run:
                continue

            latest_run = latest_run[0]
            #print(f"Latest run: {latest_run[ACCESSION]}")

            self.viz_info["facets"]["sample_identity_donors"].append(
                {"value": donor_accession, "label": donor[DISPLAY_TITLE]},
            )

            somalier_relate_wfr = get_somalier_relate_worklfow(latest_run)
            overall_quality_status = somalier_relate_wfr["output"][0]["file"]["quality_metrics"][0][
                "overall_quality_status"
            ]
            tsv_content = get_somalier_relate_output(latest_run)
            if not tsv_content:
                raise Exception(
                    f"Could not get TSV content for somalier run {latest_run[ACCESSION]}"
                )
            self.somalier_results[donor_accession] = {
                "info": {
                    "overall_quality_status": overall_quality_status
                },
                "results": []
            }
            for line in tsv_content.splitlines():
                # file header: #sample_a	sample_b	relatedness	ibs0	ibs2	hom_concordance	hets_a	hets_b	hets_ab	shared_hets	hom_alts_a	hom_alts_b	shared_hom_alts	n	x_ibs0	x_ibs2	expected_relatedness
                if line.startswith("#"):
                    continue
                line_ = line.split("\t")
                sample_a = line_[0]
                sample_b = line_[1]
                ibs0 = float(line_[3])
                ibs2 = float(line_[4])
                relatedness = float(line_[2])

                # We need to bring this into this format so that it's compatible with the scatter plot (same format as QC results)
                somalier_result = {
                    "sample_a": sample_a,
                    "sample_b": sample_b,
                    #"data_point_identifier": f"{sample_a}_{sample_b}",
                    "relatedness": relatedness,
                    "ibs0": ibs0,
                    "ibs2": ibs2,
                    # "quality_metrics": {
                    #     "overall_quality_status": "NA",
                    #     "qc_values": {
                    #         "somalier:ibs0": {"value": ibs0, "flag": "NA"},
                    #         "somalier:ibs2": {"value": ibs2, "flag": "NA"},
                    #         "somalier:relatedness": {"value": relatedness, "flag": "NA"},
                    #     },
                    # },
                }
                
                self.somalier_results[donor_accession]["results"].append(somalier_result)

    def write_json(self):
        if len(self.stats) == 0:
            print("No results found.")
            return

        print(f"Writing results to {self.output_path}")

        # pprint.pprint(self.stats)
        # pprint.pprint(self.qc_info)

        data = {
            "viz_info": self.viz_info,
            "qc_info": self.qc_info,
            "qc_results": self.stats,
            "somalier_results": self.somalier_results,
        }

        with open(self.output_path, "w") as file:
            json.dump(data, file, indent=4)

    def get_alignment_mwfr(self, fileset):
        mwfrs = fileset.get("meta_workflow_runs", [])
        results = []
        for mwfr in mwfrs:
            mwfr_item = get_item(mwfr[UUID])
            if mwfr_item[STATUS] == DELETED or mwfr_item["final_status"] != COMPLETED:
                continue
            categories = mwfr_item["meta_workflow"]["category"]
            if "Alignment" in categories:
                results.append(mwfr_item)
        if len(results) == 1:
            return results[0]
        elif len(results) > 1:
            self.warnings.append(
                f"Warning: Fileset {fileset[ACCESSION]} has multiple alignment MWFRs. Taking last one."
            )
            return results[-1]
        return None

    def get_final_ouput_file(self, mwfr, assay):
        workflow_runs = mwfr["workflow_runs"]
        mode = "RNA" if assay == RNA_SEQ else WGS

        for workflow_run in workflow_runs:
            if (mode == "WGS" and workflow_run["name"] == "samtools_merge") or (
                mode == "RNA" and workflow_run["name"] == "sentieon_Dedup"
            ):
                file_uuid = workflow_run["output"][0]["file"][UUID]
                file = get_item(file_uuid)
                if file["output_status"] == "Final Output" and (
                    file["status"] not in ["deleted", "retracted"]
                ):
                    return file

    def get_quality_metrics(self, file):
        qms = file.get(QUALITY_METRICS, [])
        if len(qms) == 0:
            print(f"WARNING: File {file[ACCESSION]} has no quality metrics.")
            return None
        if len(qms) > 1:
            print(
                f"WARNING: Multiple QualityMetrics for file {file[ACCESSION]}. Only considering last one."
            )
        qm_uuid = qms[-1][UUID]
        qm = get_item(qm_uuid)
        return qm

    def get_sample_sources_from_fileset(self, fileset):
        return [
            ss
            for library in fileset["libraries"]
            for analyte in library["analytes"]
            for sample in analyte["samples"]
            for ss in sample["sample_sources"]
        ]


def get_item(uuid, add_on=""):
    item = ff_utils.get_metadata(uuid, key=SMAHT_KEY, add_on=add_on)
    return item


def search(query):
    return ff_utils.search_metadata(query, key=SMAHT_KEY)


# def download_file_from_portal(file_uuid, output_path):
#     file = get_item(file_uuid)
#     href = file["href"]
#     cmd = f"curl -sL --user {SMAHT_KEY['key']}:{SMAHT_KEY['secret']} {SMAHT_KEY['server']}{href} --output {output_path}"
#     subprocess.Popen(cmd, shell=True).wait()


def get_file_content_from_portal_file(file_uuid):
    file = get_item(file_uuid)
    href = file["href"]
    url = f"{SMAHT_KEY['server']}{href}"
    response = requests.get(
        url, auth=(SMAHT_KEY["key"], SMAHT_KEY["secret"]), allow_redirects=True
    )

    if response.status_code == 200:
        return response.text
    else:
        print(f"Error: {response.status_code}")


# The QC visualization assume that sample identity MWFRs are tagged as follows:
def get_tag_for_sample_identity_check(donor_accession):
    return f"sample_identity_check_for_donor_{donor_accession}"


def tissue_code_to_word(code):
    if "-1A" in code:
        return "Liver"
    elif "-1D" in code:
        return "Lung"
    elif "-1G" in code:
        return "Colon"
    elif "-1Q" in code:
        return "Brain"
    elif "-1K" in code:
        return "Skin"


def get_latest_somalier_run_for_donor(donor_accession):
    search_filter = (
        "?type=MetaWorkflowRun"
        f"&meta_workflow.name=sample_identity_check"
        f"&tags={get_tag_for_sample_identity_check(donor_accession)}"
        "&final_status=completed"
        "&sort=-date_created"
        "&limit=1"
    )
    return search(f"/search/{search_filter}")


def get_somalier_relate_worklfow(mwfr):
    workflow_run = next(
        (item for item in mwfr["workflow_runs"] if item["name"] == "somalier_relate"),
        None,
    )
    if not workflow_run:
        raise Exception(f"No somalier_relate workflow run found")

    return workflow_run

def get_somalier_relate_output(mwfr):
    workflow_run = get_somalier_relate_worklfow(mwfr)
    tsv_uuid = workflow_run["output"][0]["file"][UUID]
    return get_file_content_from_portal_file(tsv_uuid)


def progressbar(it, prefix="", size=60, out=sys.stdout):
    count = len(it)
    start = time.time()  # time estimate start

    def show(j):
        x = int(size * j / count)
        # time estimate calculation and string
        remaining = ((time.time() - start) / j) * (count - j)
        mins, sec = divmod(remaining, 60)  # limited to minutes
        time_str = f"{int(mins):02}:{sec:03.1f}"
        print(
            f"{prefix}[{u'█'*x}{('.'*(size-x))}] {j}/{count} Est wait {time_str}",
            end="\r",
            file=out,
            flush=True,
        )

    show(0.1)  # avoid div/0
    for i, item in enumerate(it):
        yield item
        show(i + 1)
    print("\n", flush=True, file=out)


@click.command()
@click.option("--output", help="Output path (optional)")
def main(output):
    """Create a JSON that is input to the QC overview page

    Args:
        output (str): Path to output JSON
    """
    dt = datetime.datetime.now()
    output_path = output or f"./file_statistics_{dt.year}_{dt.month}_{dt.day}.json"

    FS = FileStats(output_path)
    FS.get_stats()
    FS.write_json()
    print("Done!")


if __name__ == "__main__":
    sys.exit(main())
