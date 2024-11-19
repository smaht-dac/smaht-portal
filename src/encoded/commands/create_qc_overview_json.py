import json, sys, subprocess, pprint, time, csv, datetime
import click
from pathlib import Path
from collections import OrderedDict
from dcicutils import ff_utils
from dcicutils.creds_utils import SMaHTKeyManager

# Define where to get the data from
ENV = "data"
SMAHT_KEY = SMaHTKeyManager().get_keydict_for_env(ENV)

SEARCH_QUERY = (
    "search/?submission_centers.display_title=UWSC+GCC"
    "&submission_centers.display_title=WASHU+GCC"
    "&submission_centers.display_title=BROAD+GCC"
    "&submission_centers.display_title=NYGC+GCC"
    "&submission_centers.display_title=BCM+GCC"
    "&field=uuid"
    "&type=FileSet"
    "&limit=10000"
    #"&limit=20&from=0"  # for testing
    #"&accession=SMAFSADRYKW2"
)


# Portal Constants
UUID = "uuid"
QUALITY_METRICS = "quality_metrics"
ACCESSION = "accession"
SUBMISSION_CENTERS = "submission_centers"
LIBRARIES = "libraries"
ASSAY = "assay"
SEQUENCING = "sequencing"
SEQUENCER = "sequencer"
STATUS = "status"
DELETED = "deleted"
COMPLETED = "completed"

#Supported assays
WGS = "WGS"
RNA_SEQ = "RNA-seq"

WGS_ASSAYS = ["WGS", "Ultra-Long WGS", "PCR WGS"]
RNA_ASSAYS = ["RNA-seq"]

# long read sequencers
LONG_READ_SEQS = ["ONT PromethION 24", "PacBio Revio"]


class FileStats:
    def __init__(self, output):
        self.errors = []
        self.warnings = []
        self.output_path = output
        self.stats = []
        self.qc_info = {}

    def get_stats(self):
        print(f"Retrieving filesets...")

        filesets = search(SEARCH_QUERY)
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
  

            sequencer = fileset[SEQUENCING][SEQUENCER]["display_title"]
            sample_source_codes = []
            for sample_source in self.get_sample_sources_from_fileset(fileset):
                code = sample_source.get("code")
                if "Tissue" in sample_source["@type"]:
                    sample_source_codes.append(
                        f"{code}"
                    )
                else:
                    if not code:
                        cell_line = sample_source.get("cell_line", {})
                        if isinstance(cell_line, list):
                            for cl in cell_line:
                                code = cl.get("code", "")
                                sample_source_codes.append(f"{code}")
                        else:
                            code = sample_source.get("cell_line", {}).get("code", "")
                            sample_source_codes.append(f"{code}")
                    else:
                        sample_source_codes.append(f"{code}")

            sample_source_codes = list(set(sample_source_codes))
            sample_source_codes.sort()

            tissues = []
            for ssc in sample_source_codes:
                tissues.append(tissue_code_to_word(ssc) or '?')

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

            result = {}
            result["fileset"] = fileset_accession
            result["bam_file"] = final_ouput_file[ACCESSION]
            result["bam_file_status"] = final_ouput_file[STATUS]
            result["submission_center"] = submission_centers
            result["tags"] = tags
            if assay:
                result["assay"] = assay
            result["sequencer"] = sequencer
            result["sample_source"] = sample_source_codes
            if tissues != "?":
                result["tissue"] = tissues
                result["tissue_or_cell_line"] = "tissue"
            else:
                result["tissue_or_cell_line"] = "cell_line"
            result["read_length"] = "long" if sequencer in LONG_READ_SEQS else "short"
            result["quality_metrics"] = {}



            qm = self.get_quality_metrics(final_ouput_file)
            qc_values = qm["qc_values"]

            for qc_value in qc_values:
                derived_from = qc_value["derived_from"]
                value = qc_value["value"]
                result["quality_metrics"][derived_from] = value
                if derived_from not in self.qc_info:
                    self.qc_info[derived_from] = {
                        "derived_from": derived_from,
                        "tooltip": qc_value.get("tooltip", ""),
                        "key": qc_value.get("key", "")
                    }

            self.stats.append(result)

        for w in self.warnings:
            print(w)
        for e in self.errors:
            print(e)

    def write_json(self):
        if len(self.stats) == 0:
            print("No results found.")
            return

        print(f"Writing results to {self.output_path}")

        # pprint.pprint(self.stats)
        # pprint.pprint(self.qc_info)

        data = {
            "qc_info": self.qc_info,
            "qc_results": self.stats
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
                if file["output_status"] == "Final Output" and (file["status"] not in ["deleted", "retracted"]):
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


def download_file_from_portal(file_uuid, output_path):
    file = get_item(file_uuid)
    href = file["href"]
    cmd = f"curl -sL --user {SMAHT_KEY['key']}:{SMAHT_KEY['secret']} {SMAHT_KEY['server']}{href} --output {output_path}"
    subprocess.Popen(cmd, shell=True).wait()


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
