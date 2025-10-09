
<div className="faq-container">
    <h2 className="faq-header">Frequently Asked Questions</h2>

    <div className="faq-body">
        <details>
            <summary><span>What processing and alignment steps are applied by the SMaHT Data Analysis Center (DAC) to the originally submitted sequencing data in the FASTQ or unaligned BAM format?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <b>Illumina paired-end</b>
                <ul>
                    <li>All reads - both mapped and unmapped - are retained. No read is discarded, and the whole reads are retained. No trimming (“hard clipping”) of reads is performed.</li>
                    <li>The only reads removed are those affected by polyG artifacts, which arise on one- and two-channel sequencers (e.g., NovaSeq) when the dark base G is incorrectly called after synthesis termination. These artifacts typically appear as long G-runs at the ends of reads and can accumulate in GC-rich regions (e.g., chr2:32916230-32916625), creating downstream alignment issues.</li>
                    <li>Original quality scores are retained in the OQ tag, enabling regeneration of FASTQ files with the original base qualities.</li>
                    <li>Read groups are updated to include SMaHT portal identifiers for SM and LB.</li>
                </ul>
                <br/>
                <b>PacBio</b>
                <ul>
                    <li>All reads - both mapped and unmapped - are retained. No read is discarded, and the whole reads are retained. No trimming (“hard clipping”) of reads is performed.</li>
                    <li>Non-essential kinetic tags are removed to reduce file size, but methylation-related tags (MM, ML) and assay-specific tags (e.g., Fiber-seq) are preserved.</li>
                    <li>Read groups are modified to include SMaHT portal identifiers for SM and LB.</li>
                </ul>
                <br/>
                <b>ONT</b>
                <ul>
                    <li>All reads - both mapped and unmapped - are retained. No read is discarded, and the whole reads are retained. No trimming (“hard clipping”) of reads is performed.</li>
                    <li>Non-essential kinetic tags are removed to reduce file size, while methylation-related tags (MM, ML) and assay-specific tags are preserved.</li>
                    <li>Read groups are updated to include SMaHT portal identifiers for SM and LB.</li>
                </ul>
            </div>
        </details>

        <details>
            <summary><span>How are CRAM files generated?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>CRAM files are generated from BAM using Samtools <i>view</i>.</span>
                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`samtools view -@ <threads> -hC -T <reference.fasta> -o <output.cram>  <input.bam></input.bam>`}</code></pre>
            </div>
        </details>

        <details>
            <summary><span>Which reference genome is used for CRAM conversion?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>CRAM files are generated using the standard reference genome agreed upon by the consortium.</span>
                <br/>
                <span>The specific version in use is GCA_000001405.15 no_alt_analysis_set, accessible for download here in the following file: GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz</span>
                <br/>
                <span>This version excludes ALT contigs and Human decoy sequences from hs38d1 (GCA_000786075.2), and includes the following sequences:</span>
                <ul>
                    <li>Chromosomes from the GRCh38 Primary Assembly unit.</li>
                    <li>Mitochondrial genome from the GRCh38 non-nuclear assembly unit.</li>
                    <li>Unlocalized scaffolds from the GRCh38 Primary Assembly unit.</li>
                    <li>Unplaced scaffolds from the GRCh38 Primary Assembly unit.</li>
                    <li>Epstein-Barr virus (EBV) sequence.</li>
                </ul>
                <br/>
                <i>Note: The two PAR regions on chrY have been hard-masked with Ns, and the chromosome Y sequence is not identical to the GenBank sequence but shares the same coordinates. Similarly, duplicate copies of centromeric arrays and WGS on chromosomes 5, 14, 19, 21 & 22 have been hard-masked with Ns.</i>
                <br/>
                <i>Note: The EBV sequence is not part of the genome assembly but is included in the analysis set for aligning reads often present in sequencing samples.</i>
            </div>
        </details>

        <details>
            <summary><span>How can I convert a CRAM file back to BAM?</span><i className="icon icon-chevron-down fas"></i></summary>  
            <div className="response">
                <span>You can convert any CRAM file back to BAM using Samtools <i>view</i>.</span>
                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`samtools view -@ <threads> -hb -T <reference.fasta> <input.cram> > <output.bam></output.bam>`}</code></pre>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (-T) and produces BAM (-b) with header (-h).</li>
                </ul>
            </div>
        </details>

        <details>
            <summary><span>How can I generate an unaligned BAM (uBAM) from a CRAM file?</span><i className="icon icon-chevron-down fas"></i></summary>      
            <div className="response">
                <span>You can use Picard RevertSam. This command removes all alignment information, restores original qualities from the OQ tag if present, and sanitizes the file to enforce mate consistency (if paired-end data) while discarding non-primary alignments.</span>
                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`picard RevertSam \ \nI=<input.cram> \ \nO=<unmapped.bam> \ \nREFERENCE_SEQUENCE=<reference.fasta> \ \nREMOVE_ALIGNMENT_INFORMATION=true \ \nRESTORE_ORIGINAL_QUALITIES=true \ \nSANITIZE=true \ \nKEEP_FIRST_DUPLICATE=true`}</code></pre>
                <br/>
                <span>Use the <code>-Xmx</code> argument to set Java heap space if needed (e.g., -Xmx32g allocates 32G).</span>
            </div>
        </details>
        
        <details>
            <summary><span>How can I regenerate FASTQ files from a CRAM file?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <b>Illumina paired-end</b>
                <span>Use Samtools <code>view</code>, Samtools collate, and Samtools fastq in combination. Both mapped and unmapped reads are retained.</span>
                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`samtools view -@ <threads> -hb -T <reference.fasta> <input.cram> | \ \nsamtools view -@ <threads> -hb -T <reference.fasta> <input.cram> | \ \nsamtools collate -@ <threads> -f -r 10000000 -u -O - | \ \nsamtools fastq \ \n-1 <prefix>.1.fastq.gz \ \n-2 <prefix>.2.fastq.gz \ \n-0 /dev/null -s /dev/null -n \ \n-O \ \n-@ <threads> -`}</code></pre>
                <ul>
                    <li><code>view</code> decodes the CRAM file with the reference (-T) and produces BAM (-b) with header (-h).</li>
                    <li><code>collate</code> ensures read pairs are sorted correctly. Fast mode (-f) uses an in-memory buffer (-r) to speed up pairing (10M alignments ~12GB RAM).</li>
                    <li><code>fastq</code> writes paired reads to {`<prefix>`}.1.fastq.gz and {`<prefix>`}.2.fastq.gz, one mate per file. -O uses OQ quality scores if available. Unpaired and singleton reads are discarded (-0 /dev/null -s /dev/null) (- this is actually not necessary for DAC generated data since we do not discard individual mates during alignment and we don't have singleton or unpaired reads in the CRAM file; added to the command for completion.)</li>
                </ul>

                <br/>
                <b>PacBio</b>
                <span>Use Samtools <code>view</code> and Samtools <code>fastq</code> in combination. Both mapped and unmapped reads are retained.</span>
                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`samtools view -@ <threads> -hb -T <reference.fasta> <input.cram> | \ \nsamtools fastq -n -@ <threads> - | \ \nbgzip -@ <threads> > <prefix>.fastq.gz`}</code></pre>
                <ul>
                    <li><code>view</code> decodes the CRAM file with the reference (-T) and produces BAM (-b) with header (-h).</li>
                    <li><code>fastq / bgzip</code> writes all reads to {`<prefix>`}.fastq.gz. -n preserves original read names.</li>
                </ul>
                <br/>
                <i>Note: FASTQ cannot carry SAM auxiliary tags (e.g., MM/ML tags for methylation). If converted to FASTQ, these tags are lost unless re-annotated after re-alignment.</i>
                
                <br/>
                <br/>
                <b>Re-alignment using pbmm2</b>
                <span>If re-aligning using pbmm2 (<a href="https://github.com/PacificBiosciences/pbmm2">https://github.com/PacificBiosciences/pbmm2</a>), you can simply generate the aligned BAM from the CRAM file and run pbmm2 directly. pbmm2 will ignore non-primary alignments and import all tags correctly.</span>

                <br/>
                <br/>
                <b>ONT</b>
                <span>Use Samtools <code>view</code> and Samtools <code>fastq</code> in combination. Both mapped and unmapped reads are retained.</span>

                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`samtools view -@ <threads> -hb -T <reference.fasta> <input.cram> | \ \nsamtools fastq -n -@ <threads> - | \ \nbgzip -@ <threads> > <prefix>.fastq.gz`}</code></pre>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (-T) and produces BAM (-b) with header (-h).</li>
                    <li><i><code>fastq / bgzip</code></i> writes all reads to {`<prefix>`}<code>.fastq.gz. -n</code> preserves original read names.</li>
                </ul>

                <i>Note: FASTQ cannot carry SAM auxiliary tags (e.g., MM/ML tags for methylation). If converted to FASTQ, these tags are lost unless re-annotated after re-alignment.</i>

                <b>Re-alignment using minimap2</b>
                <span>If re-aligning using minimap2, FASTQ can be streamed directly into minimap2 while carrying over the desired tags.</span>

                <br/>
                <span>Command:</span>
                <br/>
                <pre><code>{`samtools view -@ <threads> -hb -T <reference.fasta> <input.cram> | \ \nsamtools fastq -n -@ <threads> -T <tag1>,<tag2> - | \ \nminimap2 -y <...> > <aligned.bam>`}</code></pre>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (-T) and produces BAM (-b) with header (-h).</li>
                    <li><i><code>fastq</code></i> extracts all reads while preserving read names (-n) and appending the specified tags (-T). In minimap2, the -y option re-imports these annotated tags into the alignment.</li>
                </ul>
            </div>
        </details>

    </div>
</div>