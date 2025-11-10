import React, { useState } from 'react';

export const Dropdown = (props) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { parentTitle, parentLink, subLinks } = props;

    return (
        <div className="dropdown">
            <div className="parent-link">
                <button
                    className="dropdown-toggle btn"
                    onClick={() => setIsExpanded(!isExpanded)}>
                    <i
                        className={`icon ${
                            isExpanded ? 'icon-caret-up' : 'icon-caret-down'
                        } fas`}></i>
                </button>{' '}
                <a href={parentLink}>
                    <b>{parentTitle}</b>
                </a>
            </div>
            <div className={`sublinks ${isExpanded ? 'open' : 'closed'}`}>
                <ul>
                    {subLinks.map((sublink, i) => {
                        return (
                            <li key={i} className="sublink-item">
                                <div>
                                    <a href={parentLink + sublink.href}>
                                        {sublink.title}
                                    </a>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export const PipelineDocsNavigation = (props) => {
    return (
        <div>
            <h2>SMaHT Pipelines Documentation</h2>
            <p>
                Welcome to the documentation for SMaHT analysis pipelines and
                associated resources.
            </p>

            <h3>CONTENTS</h3>

            <div className="nav-group mb-2">
                <h6>PREPROCESSING</h6>
                <Dropdown
                    parentTitle="FASTQ Files"
                    parentLink="/docs/additional-resources/pipeline-docs/fastq_files"
                    subLinks={[
                        {
                            title: 'polyG Artifacts Removal',
                            href: '#polyg-artifacts-removal',
                        },
                    ]}
                />
            </div>
            <div className="nav-group mb-2">
                <h6>ALIGNMENT</h6>
                <Dropdown
                    parentTitle="Short-Read Illumina, Paired-End"
                    parentLink="/docs/additional-resources/pipeline-docs/short-read_illumina_paired-end"
                    subLinks={[
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
                />
                <Dropdown
                    parentTitle="Long-Read PacBio HiFi"
                    parentLink="/docs/additional-resources/pipeline-docs/long-read_pacbio_hifi"
                    subLinks={[
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
                />
                <Dropdown
                    parentTitle="Long-Read Oxford Nanopore"
                    parentLink="/docs/additional-resources/pipeline-docs/long-read_oxford_nanopore"
                    subLinks={[
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
                />
            </div>

            <div className="nav-group mb-2">
                <h6>ANALYSIS</h6>
                <Dropdown
                    parentTitle="Short-Read RNA-seq, Paired-End"
                    parentLink="/docs/additional-resources/pipeline-docs/short-read_rna-seq_paired-end"
                    subLinks={[
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
                />
                <Dropdown
                    parentTitle="Long-Read RNA-seq, PacBio Kinnex"
                    parentLink="/docs/additional-resources/pipeline-docs/long-read_rna-seq_pacbio_kinnex"
                    subLinks={[
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
                />
            </div>
            <div className="nav-group mb-2">
                <h6>REFERENCE FILES</h6>
                <Dropdown
                    parentTitle="Genome Builds"
                    parentLink="/docs/additional-resources/pipeline-docs/genome_builds"
                    subLinks={[
                        {
                            title: 'Build GRCh38',
                            href: '#build-grch38',
                        },
                    ]}
                />
                <Dropdown
                    parentTitle="Genome Annotations"
                    parentLink="/docs/additional-resources/pipeline-docs/genome_annotations"
                    subLinks={[
                        {
                            title: 'GENCODE',
                            href: '#gencode',
                        },
                    ]}
                />
                <Dropdown
                    parentTitle="Variant Catalogs"
                    parentLink="/docs/additional-resources/pipeline-docs/variant_catalogs"
                    subLinks={[
                        {
                            title: 'Single Nucleotide Polymorphism Database',
                            href: '#single-nucleotide-polymorphism-database',
                        },
                        {
                            title: 'Mills and 1000 Genomes Project',
                            href: '#mills-and-1000-genomes-project',
                        },
                    ]}
                />
                <Dropdown
                    parentTitle="Software Specific"
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

            <div className="nav-group mb-2">
                <h6>
                    <a href="/docs/additional-resources/pipeline-docs/release_changelog">
                        <span>Release CHANGELOG</span>
                    </a>
                </h6>
            </div>
        </div>
    );
};
