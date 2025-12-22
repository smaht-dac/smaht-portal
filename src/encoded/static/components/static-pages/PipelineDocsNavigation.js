import React, { useState } from 'react';
import { RightArrowIcon } from '../util/icon';

export const Dropdown = (props) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { parentTitle, parentLink, subLinks, overview } = props;

    return (
        <div className="dropdown">
            <div className="header">
                <div
                    className="toggle d-flex align-items-center"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={(e) => {
                        if (e.target.localName !== 'a') {
                            setIsExpanded(!isExpanded);
                        }
                    }}>
                    <i
                        className={`icon ${
                            isExpanded ? 'icon-minus' : 'icon-plus'
                        } fas me-1`}></i>
                    <a className="parent-link" href={parentLink}>
                        {parentTitle}
                    </a>
                </div>
                <a className="header-link" href={parentLink}>
                    <RightArrowIcon />
                </a>
            </div>
            {isExpanded && <hr className="my-auto" />}
            <div className={`body ${isExpanded ? 'open' : 'closed'}`}>
                <ol className="sublinks">
                    {subLinks.map((sublink, i) => {
                        return (
                            <li key={i} className="sublink-item">
                                <a href={parentLink + sublink.href}>
                                    {sublink.title}
                                </a>
                            </li>
                        );
                    })}
                </ol>
                {overview && <div className="overview-text">{overview}</div>}
            </div>
        </div>
    );
};

export const PipelineDocsNavigation = (props) => {
    return (
        <div>
            <p className="introduction md-2">
                Welcome to the documentation for SMaHT analysis pipelines and
                associated resources. SMaHT runs a set of standardized workflows
                for processing genomic data. The documentation is organized
                around the major sequencing data types and the stages involved
                in their analysis.
            </p>

            <div className="nav-group">
                <h3>Whole Genome Sequencing (WGS) and Hi-C</h3>
                <p>
                    WGS workflows are structured according to the main
                    processing steps, preprocessing and alignment:
                </p>
                <h6>PREPROCESSING</h6>
                <Dropdown
                    parentTitle="FASTQ"
                    parentLink="/docs/additional-resources/pipeline-docs/fastq_files"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'polyG Artifacts Removal',
                            href: '#polyg-artifacts-removal',
                        },
                    ]}
                    overview={
                        <p>
                            FASTQ files contain raw sequencing information,
                            including nucleotide sequences and quality scores,
                            and serve as the initial input for a majority of
                            analyses. However, the presence of artifacts,
                            low-quality, or residual adapter sequences can
                            significantly impact downstream processing.
                            Preprocessing steps, including quality trimming,
                            adapter, and artifact removal, may be necessary to
                            ensure data quality and meeting requirements for
                            subsequent analyses.
                        </p>
                    }
                />
                <h6>ALIGNMENT</h6>
                <Dropdown
                    parentTitle="Illumina (short-read)"
                    parentLink="/docs/additional-resources/pipeline-docs/short-read_illumina_paired-end"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Alignment',
                            href: '#alignment-with-bwa-mem',
                        },
                        {
                            title: 'Read Groups',
                            href: '#read-groups',
                        },
                        {
                            title: 'Duplicate Reads',
                            href: '#duplicate-reads',
                        },
                        {
                            title: 'Local Realignment',
                            href: '#local-realignment',
                        },
                        {
                            title: 'Base Quality Score Recalibration (BQSR)',
                            href: '#base-quality-score-recalibration-bqsr',
                        },
                        {
                            title: 'Hi-C',
                            href: '#hi-c',
                        },
                    ]}
                    overview={
                        <p>
                            The paired-end short-read alignment pipeline for
                            Illumina data follows the Genome Analysis Toolkit
                            (GATK) Best Practices. It is designed for per-sample
                            and per-library execution, handling one or multiple
                            sets of paired FASTQ files. The pipeline is
                            optimized for distributed processing, requiring each
                            pair of FASTQ files to correspond to a single
                            sequencing lane.
                        </p>
                    }
                />
                <Dropdown
                    parentTitle="PacBio HiFi (long-read)"
                    parentLink="/docs/additional-resources/pipeline-docs/long-read_pacbio_hifi"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Alignment',
                            href: '#alignment-with-pbmm2',
                        },
                        {
                            title: 'Read Groups',
                            href: '#read-groups',
                        },
                        {
                            title: 'Methylation and Tags',
                            href: '#methylation-and-tags',
                        },
                    ]}
                    overview={
                        <p>
                            The long-read alignment pipeline for PacBio HiFi
                            data is designed for per-sample and per-library
                            execution, handling one or multiple unaligned BAM
                            files. The pipeline is optimized for distributed
                            processing, requiring each unaligned BAM file to
                            correspond to a single SMRT Cell.
                        </p>
                    }
                />
                <Dropdown
                    parentTitle="Oxford Nanopore (long-read)"
                    parentLink="/docs/additional-resources/pipeline-docs/long-read_oxford_nanopore"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Alignment',
                            href: '#alignment-with-minimap2',
                        },
                        {
                            title: 'Read Groups',
                            href: '#read-groups',
                        },
                        {
                            title: 'Methylation and Tags',
                            href: '#methylation-and-tags',
                        },
                    ]}
                    overview={
                        <p>
                            The long-read alignment pipeline for ONT data is
                            designed for per-sample and per-library execution,
                            handling one or multiple FASTQ files and the
                            corresponding unaligned BAM files. The pipeline is
                            optimized for distributed processing, requiring each
                            FASTQ file to correspond to a single flow cell.
                        </p>
                    }
                />
            </div>
            <div className="nav-group">
                <h3>RNA-seq</h3>
                <p>
                    RNA-seq workflows include alignment and downstream analysis
                    for:
                </p>
                <Dropdown
                    parentTitle="Bulk Total RNA (short-read)"
                    parentLink="/docs/additional-resources/pipeline-docs/short-read_rna-seq_paired-end"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Alignment',
                            href: '#alignment-with-star',
                        },
                        {
                            title: 'Duplicate Reads',
                            href: '#duplicate-reads',
                        },
                        {
                            title: 'Transcript Quantification',
                            href: '#transcript-quantification',
                        },
                        {
                            title: 'Gene Quantification',
                            href: '#gene-quantification',
                        },
                    ]}
                    overview={
                        <p>
                            The paired-end short-read analysis pipeline for
                            RNA-seq data is based on GTEx
                            <sup>
                                <sub>1</sub>
                            </sup>{' '}
                            and TOPMed
                            <sup>
                                <sub>2</sub>
                            </sup>{' '}
                            analysis pipelines. It is designed for per-sample
                            execution, handling one or multiple sets of paired
                            FASTQ files.
                        </p>
                    }
                />
                <Dropdown
                    parentTitle="PacBio Kinnex (long-read)"
                    parentLink="/docs/additional-resources/pipeline-docs/long-read_rna-seq_pacbio_kinnex"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Read Clustering',
                            href: '#read-clustering',
                        },
                        {
                            title: 'Alignment',
                            href: '#alignment-with-pbmm2',
                        },
                        {
                            title: 'Transcript Collapsing',
                            href: '#transcript-collapsing',
                        },
                        {
                            title: 'Isoform Classification and Filtering',
                            href: '#isoform-classification-and-filtering',
                        },
                        {
                            title: 'Read Annotation',
                            href: '#read-annotation',
                        },
                    ]}
                    overview={
                        <p>
                            The long-read analysis pipeline for PacBio Kinnex
                            RNA-seq data follows Iso-Seq processing guidelines
                            <sup>
                                <sub>1</sub>
                            </sup>
                            . It is designed for per-sample execution, handling
                            one or more Full Length Non Chimeric (FLNC) BAM
                            files. The pipeline has been extended to align and
                            annotate FLNC reads with isoform-level information
                            directly within the BAM file.
                        </p>
                    }
                />
            </div>
            <div className="nav-group">
                <h3>Reference Files</h3>
                <p>
                    All workflows share a set of common reference resources,
                    organized into:
                </p>
                <Dropdown
                    parentTitle="Genome Builds"
                    parentLink="/docs/additional-resources/pipeline-docs/genome_builds"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Build GRCh38',
                            href: '#build-grch38',
                        },
                    ]}
                    overview={
                        <p>
                            Genome analysis, particularly alignment pipelines,
                            heavily depends on a designated reference genome to
                            ensure consistency and reproducibility across
                            diverse analyses. The primary reference genome in
                            use for the pipelines is the Genome Reference
                            Consortium Human Build 38 (GRCh38).
                        </p>
                    }
                />
                <Dropdown
                    parentTitle="Gene and Transcript Annotations"
                    parentLink="/docs/additional-resources/pipeline-docs/genome_annotations"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'GENCODE',
                            href: '#gencode',
                        },
                    ]}
                    overview={
                        <p>
                            Genome annotations are critical for understanding
                            the functional elements within a genome, including
                            genes, transcripts, regulatory regions, and other
                            important features. Accurate genome annotations are
                            essential for tasks such as variant annotation, gene
                            expression analysis, and understanding the
                            biological significance of genetic variants. The
                            pipelines incorporate several genome annotation
                            resources compatible with the GRCh38 Genome Build.
                        </p>
                    }
                />
                <Dropdown
                    parentTitle="Variant Databases"
                    parentLink="/docs/additional-resources/pipeline-docs/variant_catalogs"
                    subLinks={[
                        {
                            title: 'Overview',
                            href: '#overview',
                        },
                        {
                            title: 'Single Nucleotide Polymorphism Database',
                            href: '#single-nucleotide-polymorphism-database',
                        },
                        {
                            title: 'Mills and 1000 Genomes Project',
                            href: '#mills-and-1000-genomes-project',
                        },
                    ]}
                    overview={
                        <p>
                            Alignment and variant calling pipelines frequently
                            depend on reference variant catalogs. These catalogs
                            contains known variant sites, such as polymorphic
                            sites for single nucleotides, insertions, or
                            deletions, providing information about genetic
                            variation to improve the accuracy of the models in
                            use. The pipelines utilize several of these
                            catalogs, specifically the versions built using the
                            GRCh38 Genome Build.
                        </p>
                    }
                />
                <Dropdown
                    parentTitle="Software-specific Reference Files"
                    parentLink="/docs/additional-resources/pipeline-docs/software_specific"
                    subLinks={[
                        {
                            title: 'Burrows-Wheeler Transform Index',
                            href: '#burrows-wheeler-transform-index',
                        },
                        {
                            title: 'STAR Index',
                            href: '#star-index',
                        },
                        {
                            title: 'RSEM Reference',
                            href: '#rsem-reference',
                        },
                    ]}
                />
            </div>

            <div className="nav-group">
                <h5 className="changelog">
                    <a href="/docs/additional-resources/pipeline-docs/release_changelog">
                        <span>Release CHANGELOG</span>
                    </a>
                </h5>
            </div>
        </div>
    );
};
