<!---------------------------------------------------------------------------->
<!-- Long-Read_Oxford_Nanopore -->
<!---------------------------------------------------------------------------->
## Long-Read_Oxford_Nanopore

<!-- 0: Overview -->
### Overview

#### Long-Read Oxford Nanopore Technologies (ONT)
The long-read alignment pipeline for ONT data is designed for per-sample and per-library execution, handling one or multiple FASTQ files and the corresponding unaligned BAM files. The pipeline is optimized for distributed processing, requiring each FASTQ file to correspond to a single flow cell.

#### Key Pipeline Steps
1. **Alignment with minimap2:** Initial alignment of the raw reads to the reference genome using minimap2.
2. **Read Groups Assignment:** Assignment of reads to specific groups.
3. **Methylation and Tags Linking:** Linking the methylation status information and other specific tags from the unaligned to the alignment BAM file.

#### Pipeline Chart

![flow_chart](/static/img/pipeline-docs/Flow_Chart_Pipeline_Long-Read_Oxford_Nanopore.png)

---
<!-- 1: Alignment -->
### Alignment

#### Alignment with minimap2

For alignment, the pipeline uses minimap2 on each FASTQ file. The reads are then sorted by genomic coordinates, and an integrity check is performed on the resulting BAM file.

#### Aligning and Sorting

__Align and sort reads__

```text
sentieon minimap2 -Y -L --eqx --secondary=no -ax map-ont reference.fasta reads.fastq |
  samtools sort -o sorted.bam -
```

Arguments:

- *-Y*: enable soft clipping.
- *-L*: use long cigars for tag `CG`.
- *-\-eqx*: use X/= in cigars instead of M.
- *-\-secondary=no*: ignore secondary alignments.

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with Sentieon

Sentieon implementation replicates the original [minimap2](https://github.com/lh3/minimap2) code. The pipeline is using Sentieon version 202308.01, corresponding to minimap2 version 2.26.

#### Source Code

All the relevant code can be accessed in the GitHub repository:

  - [sentieon_minimap2_sort.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_minimap2_sort.sh) [minimap2]


---
<!-- 2: Read Groups -->
### Read Groups

A read group (`@RG`) is a unique identifier that group reads together, capturing relevant information about the sample and the sequencing process and technology, utilized by various downstream bioinformatics tools.

The relevant fields in defining a read group include:

- **ID (Identifier):** A unique identifier for the read group within the BAM file and across multiple BAM files used in the same dataset.
- **SM (Sample):** The sample to which the reads belong.
- **PL (Platform):** The technology used to sequence the reads (e.g., ONT).
- **PM (Platform Model):** The platform model reflecting the instrument series.
- **PU (Platform Unit):** A unique identifier for the sequencer unit used for sequencing.
- **LB (Library):** The library used to sequence the reads.
- **DS (Description):** Semantic information about the reads in the group, encoded as a semicolon-delimited list of “Key=Value” strings.
- **DT (Date/Time):** The date and time when the run was produced (ISO8601 date or date/time).
- **basecall_model:** The model used for base calling.

#### Assigning Read Groups

The original read groups from the unaligned BAM files are linked and maintained in the corresponding alignment BAM files. In-house bash code that utilizes samtools replaces `SM` and `LB` information with the correct identifiers used by the portal, as follows:

- **SM:** `<sample name>`
- **LB:** `<sample name>.<library>`

E.g., in BAM file:

```text
@RG	ID:bcdb4058-3545-4c45-aea9-4159f1c2ca7d_dna_r10.4.1_e8.2_400bps_sup@v4.2.0	DT:2024-02-21T12:56:53.022625-06:00	DS:runid=bcdb4058-3545-4c45-aea9-4159f1c2ca7d	basecall_model=dna_r10.4.1_e8.2_400bps_sup@v4.2.0	LB:SMACUWVOKOZU.SMALI56YAYM5	PL:ONT	PM:3A	PU:PAW14872	al:unclassified SM:SMACUWVOKOZU
```

#### Source Code

All the relevant code is accessible in the GitHub repository:

  - [ImportReadGroups_methylink.sh](https://github.com/smaht-dac/alignment-pipelines/blob/main/dockerfiles/methylink/ImportReadGroups_methylink.sh) [ImportReadGroups]


---
<!-- 3: Methylation and Tags -->
### Methylation and Tags

Methylation, and other tags are linked from the unaligned to the alignment BAM file using methylink software. The specific tags may vary depending on the method used to generate the data.

#### Implementation with methylink

The pipeline uses [methylink](https://github.com/projectoriented/methylink) version 0.6.0.














<!---------------------------------------------------------------------------->
<!-- Long-Read_PacBio_HiFi File-->
<!---------------------------------------------------------------------------->
## Long-Read PacBio HiFi

<!-- 0: Overview -->
### Overview

The long-read alignment pipeline for PacBio HiFi data is designed for per-sample and per-library execution, handling one or multiple unaligned BAM files. The pipeline is optimized for distributed processing, requiring each unaligned BAM file to correspond to a single SMRT Cell.

#### Key Pipeline Steps

1. **Alignment with pbmm2:** Initial alignment of the raw reads to the reference genome using pbmm2.
2. **Read Groups Assignment:** Assignment of reads to specific groups.
3. **Methylation and Tags Linking:** Linking the methylation status information and other specific tags from the unaligned to the alignment BAM file.

#### Pipeline Chart
![flow_chart](/static/img/pipeline-docs/Flow_Chart_Pipeline_Long_Read_PacBio_HiFi.png)

---
<!-- 1: Alignment -->
### Alignment with pbmm2

The pipeline uses pbmm2 to align each unaligned BAM file to the reference genome. The software also sorts the reads by genomic coordinates, strips unnecessary tags, and links methylation tags if present. An integrity check is then performed on the resulting BAM file.

#### Aligning and Sorting

##### Align and sort reads

```text
pbmm2 align --sort --strip --unmapped reference.fasta unaligned.bam sorted.bam
```

Arguments:

- *-\-sort*: sort the aligned reads by genomic coordinates.
- *-\-strip*: remove extraneous tags if present in the input BAM file. Tags removed: `dq, dt, ip, iq, mq, pa, pc, pd, pe, pg, pm, pq, pt, pv, pw, px, sf, sq, st`.
- *-\-unmapped*: retain unmapped reads.

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with pbmm2

The pipeline uses [pbmm2](https://github.com/PacificBiosciences/pbmm2) version 1.13.0, which wraps [minimap2](https://github.com/lh3/minimap2) version 2.26. It's important to note that pbmm2 sets some defaults that may differ from the standard minimap2.

Default set by pbmm2 for minimap2:

- Soft clipping is enabled with `-Y`.
- Long cigars for the `CG` tag are set using `-L`.
- X/= cigars are used instead of M with `--eqx`.
- Overlapping query intervals with repeated matches trimming are disabled.
- Secondary alignments are excluded with `--secondary=no`.

*Note: Due to multi-threading the output alignment ordering can differ between multiple runs with the same input parameters. The same can occur even with option -\-sort for records that align to the same target sequence, the same position within that target, and in the same orientation, which are the only fields that samtools sort uses.*

---
<!-- 2: Read Groups -->
### Read Groups

A read group (`@RG`) is a unique identifier that group reads together, capturing relevant information about the sample and the sequencing process and technology, utilized by various downstream bioinformatics tools.

The relevant fields in defining a read group include:

- **ID (Identifier):** A unique identifier for the read group within the BAM file and across multiple BAM files used in the same dataset.
- **SM (Sample):** The sample to which the reads belong.
- **PL (Platform):** The technology used to sequence the reads (e.g., PACBIO).
- **PM (Platform Model):** The platform model reflecting the instrument series (e.g., REVIO, ASTRO, SEQUEL, RS).
- **PU (Platform Unit):** A unique identifier for the sequencer unit used for sequencing (i.e., PacBio movie name).
- **LB (Library):** The library used to sequence the reads.
- **DS (Description):** Semantic information about the reads in the group, encoded as a semicolon-delimited list of “Key=Value” strings.

#### Mandatory Description (DS) Information

| Key               | Value Specification                                                                | Example     |
|-------------------|------------------------------------------------------------------------------------|-------------|
| READTYPE          | One of ZMW, HQREGION, SUBREAD, CCS, SCRAP, or UNKNOWN                              | CCS         |
| BINDINGKIT        | Binding kit part number                                                            | 102-739-100 |
| SEQUENCINGKIT     | Sequencing kit part number                                                         | 102-118-800 |
| BASECALLERVERSION | Basecaller version number                                                          | 5.0         |
| FRAMERATEHZ       | Frame rate in Hz                                                                   | 100         |
| CONTROL           | TRUE if reads are classified as spike-in controls, otherwise CONTROL key is absent | TRUE        |

#### Optional Description (DS) Information

| Key            | Value Specification                                                                        | Example                                |
|----------------|--------------------------------------------------------------------------------------------|----------------------------------------|
| BarcodeFile    | Name of the FASTA file containing the sequences of the barcodes used                       | m84046_230828_225743_s2.barcodes.fasta |
| BarcodeHash    | The MD5 hash of the contents of the barcoding sequence file                                | e7c4279103df8c8de7036efdbdca9008       |
| BarcodeCount   | The number of barcode sequences in the barcode file                                        | 113                                    |
| BarcodeMode    | Experimental design of the barcodes. Must be Symmetric/Asymmetric/Tailed or None Symmetric | Symmetric                              |
| BarcodeQuality | The type of value encoded by the bq tag. Must be Score/Probability/None                    | Score                                  |

#### Assigning Read Groups

During the alignment process using pbmm2, the original read groups from the unaligned BAM files are linked and maintained in the corresponding alignment BAM files. In-house bash code that utilizes samtools replaces `SM` and `LB` information with the correct identifiers used by the portal, as follows:

- **SM:** `<sample name>`
- **LB:** `<sample name>.<library>`

E.g., in BAM file:

```text
@RG	ID:f115ea06/25--25	PL:PACBIO	DS:READTYPE=CCS;Ipd:Frames=ip;PulseWidth:Frames=pw;BINDINGKIT=102-739-100;SEQUENCINGKIT=102-118-800;BASECALLERVERSION=5.0;FRAMERATEHZ=100.000000;BarcodeFile=metadata/m84046_230828_225743_s2.barcodes.fasta;BarcodeHash=e7c4279103df8c8de7036efdbdca9008;BarcodeCount=113;BarcodeMode=Symmetric;BarcodeQuality=Score	LB:SMACUBS146SV.SMALIRA4HLNS	PU:m84046_230828_225743_s2	SM:SMACUBS146SV	PM:REVIO	BC:ACGCACGTACGAGTAT	CM:R/P1-C1/5.0-25M
```

#### Source Code

All the relevant code is accessible in the GitHub repository:

  - [ReplaceReadGroups.sh](https://github.com/smaht-dac/pipelines-scripts/blob/main/processing_scripts/ReplaceReadGroups.sh) [ReplaceReadGroups]

---
<!-- 3: Methylation and Tags -->
### Methylation and Tags

During the alignment process using pbmm2, methylation, and other tags are linked from the unaligned to the alignment BAM file. The specific tags may vary depending on the method used to generate the data. Here is a definition of these tags.

#### Fiber-seq

Fiber-seq<sup><sub>1</sub></sup> is a chromatin mapping technique that employs methyltransferases to mark accessible adenines in DNA with methyl groups. The chromatin structure (e.g., nucleosomes and bound transcription factors) is used as a "stencil" for the methyltransferase, mapping the structure of chromatin fibers onto the underlying DNA template. The position of the methylated adenines is then used to infer the DNA accessibility from the template, offering high-resolution insights into chromatin structure at nearly single-molecule level.

Raw PacBio HiFi data are processed through [fibertools-rs](https://github.com/fiberseq/fibertools-rs) to generate unaligned BAM files. fibertools-rs adds additional information to the files creating tags that are linked by pbmm2 during alignment.

Fiber-seq generates the following tags:

- **MM (mCpG and m6A Methylation Positions):** Positions of mCpG and m6A methylation along the read.
- **ML (Methylation Precision Values):** Precision values for each mCpG and m6A methylation call.
- **ns (Nucleosome Start Positions):** Start positions of identified nucleosomes along the read relative to the first base.
- **nl (Nucleosome Lengths):** Lengths of each nucleosome along the read.
- **as (Methyltransferase Accessible Patch Start Positions):** Start positions of identified methyltransferase accessible patches (MSP) along the read.
- **al (MSP Lengths):** Lengths of each MSP along the read.

<sub><b>1</b>: *Andrew B. Stergachis et al.* Single-molecule regulatory architectures captured by chromatin fiber sequencing. *Science 368, 1449-1454(2020).* doi: 10.1126/science.aaz1646</sub>
















<!---------------------------------------------------------------------------->
<!-- Short-Read_Illumina_Paired-End File -->
<!---------------------------------------------------------------------------->
## Short-Read Illumina, Paired-End

<!-- 0: Overview -->
### Overview

The paired-end short-read alignment pipeline for Illumina data follows the Genome Analysis Toolkit (GATK) Best Practices. It is designed for per-sample and per-library execution, handling one or multiple sets of paired FASTQ files. The pipeline is optimized for distributed processing, requiring each pair of FASTQ files to correspond to a single sequencing lane.

#### Key Pipeline Steps

1. **Alignment with BWA-MEM:** Initial alignment of the raw reads to the reference genome using BWA-MEM.
2. **Read Groups Assignment:** Assignment of reads to specific groups, providing essential information for subsequent steps.
3. **Duplicate Reads Marking:** Identification and labeling of duplicate reads, that originated during library preparation or as sequencing artifacts.
4. **Local Indel Realignment:** Local realignment at identified indel positions.
5. **Base Quality Score Recalibration (BQSR):** Recalibration of base quality scores, including indels, resulting in the generation of a refined, analysis-ready BAM file.

A modified alignment step with BWA-MEM is used for processing Hi-C data.

#### Sentieon Software and Distributed Mode

To meet the scalability demands, especially with high-coverage whole-genome sequencing data, the pipeline utilizes a more efficient software implementation from [Sentieon](https://www.sentieon.com/).

Sentieon offers a comprehensive toolkit (DNASeq<sup><sub>1</sub></sup>) that replicates the original BWA and GATK algorithms, while enhancing computational efficiency. The pipeline also leverage Sentieon’s [distributed mode](https://support.sentieon.com/appnotes/distributed_mode/) to streamline the processing of large data volumes.

The distributed version of the pipeline operates on reads divided by sequencing lanes and parallelizing some of the processing across multiple genomic regions, defined as shards. This implementation is a 1 to 1 equivalent to a standard implementation of the pipeline, producing identical results.

#### Pipeline Chart

![flow_chart](/static/img/pipeline-docs/Flow_Chart_Pipeline_Short-Read_Illumina_Paired-End.png)

<sub><b>1</b>: *Kendig KI, Baheti S, Bockol MA, Drucker TM, Hart SN, Heldenbrand JR, Hernaez M, Hudson ME, Kalmbach MT, Klee EW, Mattson NR, Ross CA, Taschuk M, Wieben ED, Wiepert M, Wildman DE, Mainzer LS.* Sentieon DNASeq Variant Calling Workflow Demonstrates Strong Computational Performance and Accuracy. *Front Genet. 2019 Aug 20;10:736.* doi: 10.3389/fgene.2019.00736</sub>


---
<!-- 1: Alignment -->
### Alignment with BWA-MEM

For the initial alignment, the pipeline uses BWA-MEM in paired-end mode on each set of paired FASTQ files. The reads are then sorted by genomic coordinates, and an integrity check is performed on the resulting BAM file.

#### Aligning and Sorting

##### Align and sort reads

```text
sentieon bwa mem -K 10000000 reference.fasta reads.fastq mates.fastq |
  samtools sort -o sorted.bam -
```

Arguments:

- *-K*: chunk size option to have number of threads independent results.

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with Sentieon

Sentieon implementation replicates the original [BWA](https://github.com/lh3/bwa) code. The pipeline is using Sentieon version 202308.01, corresponding to BWA version 0.7.17.

*Note: In the original BWA code there is a programming error affecting alignment score calculations. Specifically, when secondary alignments are present, the score calculation includes unrelated information, potentially influencing the Mapping Quality (MAPQ) of the primary alignment by lowering it. Sentieon introduced a fix to the issue, resulting in slight differences in MAPQ between the two software (approximately 0.008% of reads are affected).*

#### Source Code

All the relevant code can be accessed in the GitHub repository:

  - [sentieon_bwa-mem_sort.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_bwa-mem_sort.sh) [BWA-MEM]


---
<!-- 2. Read Groups -->
### Read Groups

As the second step, the pipeline assigns the reads to unique read groups, representing identifiers that group reads together. A read group (`@RG`) captures relevant information about the sample and the sequencing process and technology, utilized by various downstream bioinformatics tools.

The relevant fields in defining a read group include:

- **ID (Identifier):** A unique identifier for the read group within the BAM file and across multiple BAM files used in the same dataset.
- **SM (Sample):** The sample to which the reads belong.
- **PL (Platform):** The technology used to sequence the reads. This tag is required if running Base Quality Score Recalibration (BQSR) to determine the correct error model (e.g., ILLUMINA).
- **PU (Platform Unit):** A unique identifier for the sequencer unit used for sequencing (i.e., sequencing lane). This tag is required if running BQSR, as it models together all reads belonging to the same platform unit.
- **LB (Library):** The library used to sequence the reads. This tag is used in the process of marking or removing duplicate reads to determine groups that may contain duplicates, as duplicate reads need to belong to the same library.

### Assigning Read Groups

To assign read groups, an in-house Python script is used. It can automatically generate read groups based on Illumina read names and handle multiple read groups in the same file (e.g., reads from multiple lanes are merged into a single file).

The read groups are assigned as follows:

- **ID:** `<sample name>.<instrument>_<run>_<flow cell>.<lane>`
- **SM:** `<sample name>`
- **PL:** `<platform>`
- **PU:** `<instrument>_<run>_<flow cell>.<lane>`
- **LB:** `<sample name>.<library>`

E.g., in BAM file:

```text
@RG ID:SMAHT1.ST-E00127_336_HJ7YHCCXX.8  SM:SMAHT1  PL:ILLUMINA  PU:ST-E00127_336_HJ7YHCCXX.8  LB:SMAHT1.HISEQ-LIB1
```

#### Source Code

All the relevant code is accessible in the GitHub repository:

  - [AddReadGroups.py](https://github.com/smaht-dac/pipelines-scripts/blob/main/processing_scripts/AddReadGroups.py) [AddReadGroups]


---
<!-- 3. Duplicate Reads -->
### Duplicate Reads

In this step, the pipeline marks duplicate reads. Duplicate reads are sequencing artifacts that originate during library preparation and sequencing runs. Duplicate reads are evaluated per-library using the `LB` tag in the read groups.

The pipeline does not remove the duplicate reads that are tagged directly in the BAM file.

#### Detecting and Marking Duplicates

####### Detect duplicate reads

```text
sentieon driver -i sorted.bam
                --algo LocusCollector
                --fun score_info
                score.txt
```

####### Mark duplicate reads

```text
sentieon driver -i sorted.bam
                --algo Dedup
                --optical_dup_pix_dist 2500
                --score_info score.txt
                deduped.bam
```

Arguments:

- *-\-optical_dup_pix_dist*: maximum offset between two duplicate clusters to consider them optical duplicates. For structured flow cells (NovaSeq, HiSeq 4000, X), the pipeline uses 2500.

*Note: The actual implementation of the above command in the pipeline is more complex to support distributed execution, but functionally equivalent.*

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with Sentieon

The pipeline implementation uses Sentieon LocusCollector to calculate duplicate metrics per library and the Dedup algorithm to mark duplicate reads in the BAM file. The pipeline is using Sentieon version 202308.01, corresponding to Picard 2.9.0. Both algorithms combined are equivalent to the MarkDuplicates algorithm in Picard.

####### Detect and mark duplicate reads (Picard equivalent)

```text
java -jar picard.jar MarkDuplicates
      INPUT=sorted.bam
      OPTICAL_DUPLICATE_PIXEL_DISTANCE=2500
      OUTPUT=deduped.bam
```

#### Source Code

All the relevant code can be accessed in the GitHub repository:

  - [sentieon_LocusCollector.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_LocusCollector.sh) [LocusCollector]
  - [sentieon_LocusCollector_apply.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_LocusCollector_apply.sh) [Dedup]

---
<!-- 4. Local Realignment -->
### Local Realignment

In this step, the pipeline perform local realignment at indel positions. Unlike genome aligners that consider each read independently and may favor alignments with mismatches or soft-clips over opening a gap, local realignment takes into account all reads spanning a given position, enabling a high-scoring consensus that supports the presence of an indel event. The two-step realignment process identifies potential regions for alignment improvement and then realigns the reads in these regions using a consensus model that considers all reads in the alignment context together. This allows to correct potential mapping errors made by the aligners, enhancing the consistency of read alignments in regions with indels.

#### Realigning Reads

####### Realign reads around indels

```text
sentieon driver -r reference.fasta
                -i deduped.bam
                --algo Realigner
                -k known_sites_INDEL.vcf
                realigned.bam
```

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with Sentieon

The implementation uses Sentieon Realigner algorithm to identify the potential targets and perform local indel realignment. The pipeline is using Sentieon version 202308.01, corresponding to GATK versions 3.7, 3.8. The algorithm is equivalent to RealignerTargetCreator and IndelRealigner algorithms in GATK.

#### Identify potential targets (GATK equivalent)

```text
java -jar GenomeAnalysisTK.jar 
            -T RealignerTargetCreator
            -R reference.fasta
            -I deduped.bam 
            -known known_sites_INDEL.vcf
            -o realignment_targets.list
```

##### Local indel realignment (GATK equivalent)

```text
java -jar GenomeAnalysisTK.jar 
            -T IndelRealigner
            -R reference.fasta
            -I deduped.bam
            -targetIntervals realignment_targets.list
            -known known_sites_INDEL.vcf
            -o realigned.bam
```

#### Source Code

All the relevant code can be accessed in the GitHub repository:

  - [sentieon_Realigner.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_Realigner.sh) [Realigner]


---
<!-- 5. Base Quality Score Recalibration -->
### Base Quality Score Recalibration (BQSR)

In this final step, the pipeline recalibrates the base quality scores produced by the sequencing machine, correcting systematic (non-random) technical errors leading to over- or under-estimated base quality scores in the data. BQSR modeling is independently performed on groups of reads from different sequencer units (i.e., lanes), identified by the `PU` tag in the read groups.

#### Base Quality Score Modeling and Recalibration

####### Model quality scores

```text
sentieon driver -r reference.fasta
                -i realigned.bam
                --algo QualCal
                -k known_sites_SNP.vcf
                -k known_sites_INDEL.vcf
                recal_data.table
```

####### Apply score recalibration

```text
sentieon driver -r reference.fasta
                -i realigned.bam
                --read_filter 'QualCalFilter,table=recal_data.table,keep_oq=true'
                --algo ReadWriter
                recalibrated.bam
```
*Note: keep_oq=true in the -\-read_filter argument will preserve the original base quality scores by using the OQ tag in the recalibrated bam file.*

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with Sentieon

The implementation uses Sentieon QualCal algorithm to construct models of covariation based on the input data and a set of known variants. This process produces the recalibration table necessary for BQSR. The recalibration is then applied to the BAM file using the Sentieon ReadWriter command. The pipeline is using Sentieon version 202308.01, corresponding to GATK versions 3.7, 3.8, 4.0, and 4.1. The algorithms are equivalent to BaseRecalibrator and ApplyBQSR algorithms in GATK.

####### Model quality scores (GATK equivalent)

```text
gatk BaseRecalibrator -R reference.fasta
                      -I realigned.bam
                      --enable-baq
                      --known-sites known_sites_SNP.vcf
                      --known-sites known_sites_INDEL.vcf
                      -O recal_data.table
```

####### Apply score recalibration (GATK equivalent)

```text
gatk ApplyBQSR -R reference.fasta
               -I realigned.bam
               -bqsr recal_data.table
               -O recalibrated.bam
```

*Note: To reduce run time (at the expense of accuracy), GATK4 disables the base quality score recalibration of indels when using default settings. Consequently, the Sentieon BAM output will contain BI/BD tags from the indel recalibration, which will be missing from the GATK4 BAM output when run with default settings.*

#### Source Code

All the relevant code can be accessed in the GitHub repository:

  - [sentieon_QualCal.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_QualCal.sh) [QualCal + ReadWriter]



---
<!-- Hi-C -->
### Hi-C

For the alignment of Hi-C data, the pipeline uses BWA-MEM in paired-end mode on each set of paired FASTQ files. The reads are then sorted by genomic coordinates, and an integrity check is performed on the resulting BAM file. Compared to standard alignment, extra flags are required to support the read pairs generated for the Hi-C data.

#### Aligning and Sorting

##### Align and sort reads

```text
sentieon bwa mem -5SP -K 10000000 reference.fasta reads.fastq mates.fastq |
  samtools sort -o sorted.bam -
```

Standard arguments:

- *-K*: chunk size option to have number of threads independent results.

Hi-C specific arguments:

- *-S*: skip mate rescue.
- *-P*: skip pairing. Mate rescue performed unless -S also in use.
- *-5*: for split alignment, take the alignment with the smallest coordinate as primary.

*-SP* ensures that the results are equivalent to aligning each mate separately, while maintaining the proper paired-end read formatting. It also avoids forced alignment of a poorly aligned read given an alignment of its mate, based on assumption that the two mates belong to a single genomic segment.

*-5* ensures that the 5' portion of chimeric alignments is marked as the primary alignment. In Hi-C experiments, the 5' portion of the read is typically the alignment of interest, with the 3' portion representing the same fragment as the mate.

#### Integrity Check

To confirm the integrity of the alignment BAM file, in-house Python code checks for the presence of the 28-byte empty block representing the EOF marker in BAM format.

#### Implementation with Sentieon

Sentieon implementation replicates the original [BWA](https://github.com/lh3/bwa) code. The pipeline is using Sentieon version 202308.01, corresponding to BWA version 0.7.17.

#### Source Code

All the relevant code can be accessed in the GitHub repository:

  - [sentieon_bwa-mem_sort_Hi-C.sh](https://github.com/smaht-dac/sentieon-pipelines/blob/main/dockerfiles/sentieon/sentieon_bwa-mem_sort_Hi-C.sh) [BWA-MEM]
