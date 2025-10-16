
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
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2">
                    <code>samtools view -@</code> {`<threads>`} <code>-hC -T</code> {`<reference.fasta>`} <code>-o</code> {`<output.cram>`} {`<input.bam>`}
                </div>
            </div>
        </details>

        <details>
            <summary><span>Which reference genome is used for CRAM conversion?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>CRAM files are generated using the standard reference genome agreed upon by the consortium.</span>
                <br/>
                <br/>
                <span>The specific version in use is GCA_000001405.15 no_alt_analysis_set, accessible for download <a tagret="_blank" href="https://www.google.com/url?q=https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/000/001/405/GCA_000001405.15_GRCh38/seqs_for_alignment_pipelines.ucsc_ids/&sa=D&source=docs&ust=1760049508430248&usg=AOvVaw1Xxrhdbz21NdR1DnkE1wEH">here</a> in the following file: GCA_000001405.15_GRCh38_no_alt_analysis_set.fna.gz</span>
                <br/>
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
                <br/>
                <i>Note: The EBV sequence is not part of the genome assembly but is included in the analysis set for aligning reads often present in sequencing samples.</i>
            </div>
        </details>

        <details>
            <summary><span>How can I convert a CRAM file back to BAM?</span><i className="icon icon-chevron-down fas"></i></summary>  
            <div className="response">
                <span>You can convert any CRAM file back to BAM using Samtools <i>view</i>.</span>
                <br/>
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2"><code>samtools view -@</code> {`<threads>`} <code>-hb -T</code> {`<reference.fasta>`} {`<input.cram>`} <code>{`>`}</code> {`<output.bam>`}</div>
                <br/>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (-T) and produces BAM (-b) with header (-h).</li>
                </ul>
            </div>
        </details>

        <details>
            <summary><span>How can I generate an unaligned BAM (uBAM) from a CRAM file?</span><i className="icon icon-chevron-down fas"></i></summary>      
            <div className="response">
                <span>You can use Picard <i>RevertSam</i>. This command removes all alignment information, restores original qualities from the OQ tag if present, and sanitizes the file to enforce mate consistency (if paired-end data) while discarding non-primary alignments.</span>
                <br/>
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2"><code>picard RevertSam \ <br/></code><code>I=</code>{`<input.cram>`} <code>\ <br/>O=</code>{`<unmapped.bam>`} <br/><code>{`\ REFERENCE_SEQUENCE=`}</code>{`<reference.fasta>`} <code>\ <br/>REMOVE_ALIGNMENT_INFORMATION=true <br/>RESTORE_ORIGINAL_QUALITIES=true <br/>SANITIZE=true <br/>KEEP_FIRST_DUPLICATE=true</code></div>
                <br/>
                <br/>
                <span>Use the <code>-Xmx</code> argument to set Java heap space if needed (e.g., -Xmx32g allocates 32G).</span>
            </div>
        </details>
        
        <details>
            <summary><span>How can I regenerate FASTQ files from a CRAM file?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <b>Illumina paired-end</b>
                <br/>
                <span>Use Samtools <i>view</i>, Samtools <i>collate</i>, and Samtools <i>fastq</i> in combination. Both mapped and unmapped reads are retained.</span>
                <br/>
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2"><code>samtools view -@</code> {`<threads>`} <code>-hb -T</code> {`<reference.fasta>`} {`<input.cram> `}<code> {`| `}\<br/>{`samtools collate -@`}</code> {`<threads>`} <code>{`-f -r 10000000 -u -O - | `}\<br/>{`samtools fastq`} \</code><br/>
                    <div class="ps-4">
                        <code>-1</code> {`<prefix>`}<code>{`.1.fastq.gz`} \<br/>{`-2 `}</code>{`<prefix>`}<code>{`.2.fastq.gz`} \ <br/>{`-0 /dev/null -s /dev/null -n`} \ <br/>-O \ <br/>-@</code> {`<threads>`} <code>-</code>
                    </div>
                </div>
                <br/>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (<code>-T</code>) and produces BAM (<code>-b</code>) with header (<code>-h</code>).</li>
                    <li><i><code>collate</code></i> ensures read pairs are sorted correctly. Fast mode (<code>-f</code>) uses an in-memory buffer (<code>-r</code>) to speed up pairing (10M alignments ~12GB RAM).</li>
                    <li><i><code>fastq</code></i> writes paired reads to {`<prefix>`}<code>.1.fastq.gz</code> and {`<prefix>`}<code>.2.fastq.gz</code>, one mate per file. <code>-O</code> uses OQ quality scores if available. Unpaired and singleton reads are discarded (<code>-0 /dev/null -s /dev/null</code>) - <i>this is actually not necessary for DAC generated data since we do not discard individual mates during alignment and we don't have singleton or unpaired reads in the CRAM file; added to the command for completion.</i></li>
                </ul>

                <br/>
                <b>PacBio</b>
                <br/>
                <span>Use Samtools <code>view</code> and Samtools <code>fastq</code> in combination. Both mapped and unmapped reads are retained.</span>
                <br/>
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2">
                    <code>samtools view -@</code> {`<threads>`} <code>-hb -T</code> {`<reference.fasta>`} {`<input.cram>`}<code> | \<br/>samtools fastq -n -@ </code>{`<threads>`}<code> - | \</code><br/><code>bgzip -@ </code>{`<threads>`}<code> {`>`} </code>{`<prefix>`}<code>.fastq.gz</code>
                </div>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (<code>-T</code>) and produces BAM (<code>-b</code>) with header (<code>-h</code>).</li>
                    <li><i><code>fastq</code></i> / <i><code>bgzip</code></i> writes all reads to {`<prefix>`}<code>.fastq.gz</code>. <code>-n</code> preserves original read names.</li>
                </ul>
                <br/>
                <i>Note: FASTQ cannot carry SAM auxiliary tags (e.g., MM/ML tags for methylation). If converted to FASTQ, these tags are lost unless re-annotated after re-alignment.</i>
                
                <br/>
                <br/>
                <b>Re-alignment using pbmm2</b>
                <br/>
                <span>If re-aligning using pbmm2 (<a href="https://github.com/PacificBiosciences/pbmm2">https://github.com/PacificBiosciences/pbmm2</a>), you can simply generate the aligned BAM from the CRAM file and run pbmm2 directly. pbmm2 will ignore non-primary alignments and import all tags correctly.</span>

                <br/>
                <br/>
                <b>ONT</b>
                <br/>
                <span>Use Samtools <i>view</i> and Samtools <i>fastq</i> in combination. Both mapped and unmapped reads are retained.</span>
                <br/>
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2"><code>samtools view -@ </code>{`<threads>`}<code> -hb -T </code>{`<reference.fasta> <input.cram>`} <code>| \</code><br/> <code>samtools fastq -n -@ </code>{`<threads>`}<code> - | \</code><br/><code>bgzip -@ </code>{`<threads>`}<code> {`>`} </code>{`<prefix>`}<code>.fastq.gz</code></div>
                <br/>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (<code>-T</code>) and produces BAM (<code>-b</code>) with header (<code>-h</code>).</li>
                    <li><i><code>fastq / bgzip</code></i> writes all reads to {`<prefix>`}<code>.fastq.gz</code>. <code>-n</code> preserves original read names.</li>
                </ul>

                <br/>
                <i>Note: FASTQ cannot carry SAM auxiliary tags (e.g., MM/ML tags for methylation). If converted to FASTQ, these tags are lost unless re-annotated after re-alignment.</i>

                <br/>
                <br/>
                <b>Re-alignment using minimap2</b>
                <br/>
                <span>If re-aligning using minimap2, FASTQ can be streamed directly into minimap2 while carrying over the desired tags.</span>
                <br/>
                <br/>
                <span>Command:</span>
                <br/>
                <div class="ps-2"><code>samtools view -@</code> {`<threads>`} <code>-hb -T </code>{`<reference.fasta> <input.cram>`} <code>| \</code> <br/><code>samtools fastq -n -@ </code>{`<threads>`} <code>-T </code>{`<tag1>,<tag2>`} <code>- |</code> <br/><code>minimap2 -y</code> {`<...>`} <code>{`>`}</code> {`<aligned.bam>`}</div>
                <br/>
                <ul>
                    <li><i><code>view</code></i> decodes the CRAM file with the reference (<code>-T</code>) and produces BAM (<code>-b</code>) with header (<code>-h</code>).</li>
                    <li><i><code>fastq</code></i> extracts all reads while preserving read names (<code>-n</code>) and appending the specified tags (<code>-T</code>). In minimap2, the <code>-y</code> option re-imports these annotated tags into the alignment.</li>
                </ul>
            </div>
        </details>

    </div>
</div>