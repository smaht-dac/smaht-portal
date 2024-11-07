<div className="html-container">
    <p>The mosaic SNV/indel Detection Challenge was carried out within the SMaHT consortium in May 2024 to test current SNV/indel-calling pipelines that use Illumina WGS as the primary sequencing data. The goal of this challenge is to determine the optimal pipeline for somatic mosaic SNV/indel pipelines for the consortium.</p>
    <div className="admonition info mt-3 mb-3" role="alert">
        <div className="admonition-title">
            Version Notice
        </div>
        Version 1.0 (initially released via Globus on June 26, 2024) is an <b>unofficial release, and the V1.0 data are to be shared internally, i.e. within the SMaHT Network only</b>.
    </div>
    <p><b>What is released in V1.0:</b></p>
    <ol className="mb-2">
        <li>Truth set for SNVs in COLO829-BLT50.</li>
        <li>Negative controls for SNVs: (i) germline variant sites based on COLO829-BL and (ii) homozygous reference / non-variant sites.</li>
        <li>Genome stratification: (i) Easy, (ii) difficult, and (iii) extreme regions.</li>
    </ol>

    <h3>Release History</h3>

    <div class="table-responsive"> 
        <table class="table table-borderless table-sm text-start">
            <thead class="thead-smaht-purple">
                <tr>
                    <th className="ps-1">Release Version</th>
                    <th className="ps-1">Description</th>
                    <th className="ps-1">Release date</th>
                    <th className="ps-1">Document</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td className="ps-1">V1.0 [Latest]</td>
                    <td className="ps-1">COLO829 SNV/indel detection challenge - SNV truth set and related datasets</td>
                    <td className="ps-1">August 29, 2024</td>
                    <td className="ps-1">
                        <a href="/static/files/SMaHT_Benchmark_SNVIndel_Challenge-DataRelease_V1_Aug12-2024.pdf" download>
                            <i className="icon fas icon-file-pdf text-danger icon-lg"></i>
                        </a>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <div className="row py-2 mt-5">
        <div className="col-md-6 col-12">
            <h2 className="section-title d-inline-block">Version 1.0</h2>
        </div>
        <div className="col-md-6 col-12 justify-content-md-end d-flex">
            <div className="align-content-center">
                <DownloadAllFilesFromSearchHrefButton session={session} searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags!=analysis_results">Download All Version 1.0 Files</DownloadAllFilesFromSearchHrefButton>
            </div>
        </div>
    </div>
   
    <h3 className="section-title">COLO829 SNV Truth Sets</h3>
    <p className="mb-2">To analyze variants for the SNV/indel detection challenge, the V1.0 truth set includes SNVs with VAF &gt; 25% in the pure COLO829-T cancer cell line, which correspond to VAF &gt; 0.5% expected in the BLT50 mixture samples.</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=truth_set" context={context} schemas={schemas} session={session} href={href}/>

    <h3 className="section-title">Negative Control Sites for COLO829 SNVs</h3>
    <p className="mb-2">For accurate estimation of precision, we derived the “negative control” set consisting of positions that are (almost certainly) not true mosaic variant sites. The negative controls include non-variant, homozygous reference positions and germline variant positions in COLO829-BL.</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=negative_control&sort=filename" context={context} schemas={schemas} session={session} href={href} />

    <h3 className="section-title mt-4">Genome Stratification for Benchmarking</h3>
    <p className="mb-2">We categorized genomic regions with different levels of confidence for mosaic variant detection, stratified into three groups, i.e. “Easy”, “Difficult”, and “Extreme”. We considered the easy regions in the Genome in a Bottle and expanded the genome categorization based on k-mer-based read mappability scores using the UMAP software (<a href="https://pubmed.ncbi.nlm.nih.gov/30169659/" target="_blank" rel="noreferrer noopener">Karimzadeh M et al. (2018) NAR</a>). The regions are based on the GRCh38 reference human genome.</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=genome_stratification&sort=description" context={context} schemas={schemas} session={session} href={href}/>

    {/* <h3 className="section-title">Submitted VCFs & Analysis Results</h3>
    <p>[Description Here]</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=analysis_results" context={context} schemas={schemas} session={session} href={href}/> */}
</div>
