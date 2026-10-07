==================================
Genome Reference & Related Data
==================================

This is a data repository of human genome reference files that are used in the standard alignment pipeline for the SMaHT Network by the Data Analysis Center (DAC).

Reference files include the GRCh38 human reference genome sequence file and its index file for the bwa-mem aligner, as well as known indel sites used for local realignment.


Genome Alignment & Variant Calling
----------------------------------

.. raw:: html

    <hr />
    <div class="table-responsive"> 
        <table class="table table-borderless table-sm text-start" style="min-width: 1200px;">
            <thead class="thead-smaht">
                <tr class="sticky-first-column">
                    <th class="px-2"><i class="icon fas icon-download"></i></th>
                    <th class="px-2">File</th>
                    <th class="px-2">Description</th>
                    <th class="px-2 text-end">Date Created</th>
                    <th class="px-2 text-center" style="width: 80px;">Size</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/f5ad62fa-5a76-4cf3-bf66-3b71d740be22/@@download/SMAFIA6PK1S1.bwt" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/f5ad62fa-5a76-4cf3-bf66-3b71d740be22" rel="noreferrer noopener" target="_blank">
                            GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.bwa_index.tar.gz
                            <br/>
                            (SMAFIA6PK1S1.bwt)
                        </a>
                    </td>
                    <td class="px-2">
                        Complete genome reference BWT index. Version GCA_000001405.15 for build hg38/GRCh38. Does NOT include ALT contigs.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Genome_Builds/1_Build_GRCh38.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">12-13-2023</td>
                    <td class="px-2 text-end">2.89 GB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/cca516c0-3931-4fbe-bc2c-c26fe9ba23fa/@@download/SMAFI23ELK2A.fa" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/cca516c0-3931-4fbe-bc2c-c26fe9ba23fa" rel="noreferrer noopener" target="_blank">
                            GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz
                            <br/>
                            (SMAFI23ELK2A.fa)
                        </a>
                    </td>
                    <td class="px-2">
                        Complete genome reference sequence in FASTA format. Version GCA_000001405.15 for build hg38/GRCh38. Does NOT include ALT contigs.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Genome_Builds/1_Build_GRCh38.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">12-13-2023</td>
                    <td class="px-2 text-end">2.93 GB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/4b672f38-50b1-47bb-a2f8-a7b6c6c62fb8/@@download/SMAFIPOL9T5R.vcf.gz" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/4b672f38-50b1-47bb-a2f8-a7b6c6c62fb8" rel="noreferrer noopener" target="_blank">
                            Mills_and_1000G_gold_standard.indels.hg38.vcf.gz
                            <br/>
                            (SMAFIPOL9T5R.vcf.gz)
                        </a>
                    </td>
                    <td class="px-2">
                        Mills and 1000 Genomes Gold Standard indels. Build hg38/GRCh38.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Variant_Catalogs/2_Mills_and_1kGP.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">12-13-2023</td>
                    <td class="px-2 text-end">19.73 MB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/f1bd67d5-b2d5-4d52-bb67-0d2450957fc9/@@download/SMAFIXP5QCB8.fa" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/f1bd67d5-b2d5-4d52-bb67-0d2450957fc9" rel="noreferrer noopener" target="_blank">
                            Homo_sapiens_assembly38.fasta
                            <br/>
                            (SMAFIXP5QCB8.fa)
                        </a>
                    </td>
                    <td class="px-2">
                        GRCh38 Human genome reference sequence in FASTA format used to generate the STAR genome index files for short-read RNA-Seq alignment. This genome reference is identical to the one used by GTEx, to allow compatibility between SMaHT and GTEx data.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Software_Specific/1_STAR_Index.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">04-12-2024</td>
                    <td class="px-2 text-end">3.03 GB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/3497a714-6413-4450-8e12-d7509e470db2/@@download/SMAFIDGDK63W.tar.gz" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/3497a714-6413-4450-8e12-d7509e470db2" rel="noreferrer noopener" target="_blank">
                            Homo_sapiens_assembly38_NoALT_NoHLA_STAR_genome_index_GENCODEv47_100bp.tar.gz
                            <br/>
                            (SMAFIDGDK63W.tar.gz)
                        </a>
                    </td>
                    <td class="px-2">
                        STAR genome index file for 99bp-long RNA-Seq reads (+1 base overhang). Generated from the Genome version GRCh38 GCA_000001405.15, after removing ALT and HLA contigs, and used GENCODE v47.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Software_Specific/1_STAR_Index.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">10-25-2024</td>
                    <td class="px-2 text-end">25.12 GB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/bbde170b-b9b1-463b-a423-825b056451ad/@@download/SMAFI33D8ASZ.tar.gz" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/bbde170b-b9b1-463b-a423-825b056451ad" rel="noreferrer noopener" target="_blank">
                            Homo_sapiens_assembly38_NoALT_NoHLA_STAR_genome_index_GENCODEv47_146bp.tar.gz
                            <br/>
                            (SMAFI33D8ASZ.tar.gz)
                        </a>
                    </td>
                    <td class="px-2">
                        STAR genome index file for 145bp-long RNA-Seq reads (+1 base overhang). Generated from the Genome version GRCh38 GCA_000001405.15, after removing ALT and HLA contigs, and used GENCODE v47.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Software_Specific/1_STAR_Index.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">10-25-2024</td>
                    <td class="px-2 text-end">25.50 GB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/cf965cb0-1a3c-404e-97ca-9e847e31f052/@@download/SMAFILA1C4SQ.tar.gz" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/cf965cb0-1a3c-404e-97ca-9e847e31f052" rel="noreferrer noopener" target="_blank">
                            Homo_sapiens_assembly38_NoALT_NoHLA_STAR_genome_index_GENCODEv47_150bp.tar.gz
                            <br/>
                            (SMAFILA1C4SQ.tar.gz)
                        </a>
                    </td>
                    <td class="px-2">
                        STAR genome index file for 149bp-long RNA-Seq reads (+1 base overhang). Generated from the Genome version GRCh38 GCA_000001405.15, after removing ALT and HLA contigs, and used GENCODE v47.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Software_Specific/1_STAR_Index.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">06-03-2025</td>
                    <td class="px-2 text-end">25.54 GB</td>
                </tr>
                <tr class="sticky-first-column">
                    <td class="px-2">
                        <a href="/reference-files/fd26127d-b556-4ae4-84bf-33761cdc1065/@@download/SMAFIDA7K6S9.tar.gz" class="text-muted">
                            <i class="icon fas icon-download"></i>
                        </a>
                    </td>
                    <td class="px-2">
                        <a href="/fd26127d-b556-4ae4-84bf-33761cdc1065" rel="noreferrer noopener" target="_blank">
                            Homo_sapiens_assembly38_NoALT_NoHLA_STAR_genome_index_GENCODEv47_151bp.tar.gz
                            <br/>
                            (SMAFIDA7K6S9.tar.gz)
                        </a>
                    </td>
                    <td class="px-2">
                        STAR genome index file for 150bp-long RNA-Seq reads (+1 base overhang). Generated from the Genome version GRCh38 GCA_000001405.15, after removing ALT and HLA contigs, and used GENCODE v47.
                        <br/>
                        <a href="https://smaht-dac.github.io/pipelines-docs/DOCS/REFERENCE_FILES/Software_Specific/1_STAR_Index.html" rel="noreferrer noopener" target="_blank">
                            (View Source)
                        </a>
                    </td>
                    <td class="px-2 text-end">10-25-2024</td>
                    <td class="px-2 text-end">25.55 GB</td>
                </tr>
            </tbody>
        </table>
    </div>