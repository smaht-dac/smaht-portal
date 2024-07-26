<div className="html-container">
    <h3>Release History</h3>

    <p>SMaHT Mosaic SNV/indel Detection Challenge was carried out within the Network in May 2024 to test available pipelines for detecting mosaic SNVs/indels using Illumina data. The output of this challenge will form the basis of the SMaHT SNV/indel pipeline at DAC.</p>
    <p>Version 1.0 (June 26, 2024) is an unofficial internal release, and the V1.0 data are to be shared within the SMaHT Network only.</p>
    <p>What is released in V1.0:</p>
    <ol>
        <li>Truth set for SNVs in COLO829-BLT50.</li>
        <li>Negative controls for SNVs: (i) germline variant sites based on COLO829-BL and (ii) homozygous reference / non-variant sites.</li>
        <li>Genome stratification: (i) easy, (ii) difficult, and (iii) extreme regions.</li>
    </ol>

    <div class="table-responsive"> 
        <table class="table table-borderless table-sm text-left">
            <thead class="thead-smaht-purple">
                <tr>
                    <th className="pl-1">Release Version</th>
                    <th className="pl-1">Title</th>
                    <th className="pl-1">Release date</th>
                </tr>
            </thead>
            <tbody class="table-border-inner">
                <tr>
                    <td className="pl-1">V1.0</td>
                    <td className="pl-1">COLO829 SNV Indel Detection Challenge - Presented at 2024 SMaHT annual meeting</td>
                    <td className="pl-1">June 15, 2024</td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2 className="section-title py-2 mt-3 d-inline-block">Version 1.0 [latest]</h2>
    <DownloadAllFilesFromSearchHrefButton {...{ session }} searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data" cls="mt-5 float-right"/>

    <h3 className="section-title">Truth Sets</h3>
    <p className="mb-2">The truth set in the Version 1 release includes SNVs with VAF &gt; 25% in the pure COLO829-T cancer cell line (corresponding to VAF &gt; 0.5%, expected in the BLT50 mixture samples) to analyze variants considered for the SNV/Indel Detection Challenge.</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=truth_set" context={context} schemas={schemas} session={session} href={href}/>

    <h3 className="section-title">Negative Control</h3>
    <p className="mb-2">For accurate estimation of precision, we derived the “negative control” set consisting of positions that are (almost certainly) not true mosaic variant sites. The negative controls include non-variant, homozygous reference positions and germline variant positions in COLO829-BL.</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=negative_control" context={context} schemas={schemas} session={session} href={href} />

    <h3 className="section-title">Genome Stratification for Benchmarking</h3>
    <p className="mb-2">We categorized genomic regions with different levels of confidence for mosaic variant detection, stratified into three groups, i.e. “Easy”, “Difficult”, and “Extreme”. We considered the easy regions in the Genome in a Bottle and expanded the genome categorization based on k-mer-based read mappability scores using the UMAP software (Karimzadeh M et al. (2018) NAR). The regions are based on the GRCh38 reference human genome.</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=genome_stratification" context={context} schemas={schemas} session={session} href={href}/>

    {/* <h3 className="section-title">Submitted VCFs & Analysis Results</h3>
    <p>[Description Here]</p>
    <ChallengeTableWrapper searchHref="/search/?type=File&dataset=colo829_snv_indel_challenge_data&tags=analysis_results" context={context} schemas={schemas} session={session} href={href}/> */}
</div>
