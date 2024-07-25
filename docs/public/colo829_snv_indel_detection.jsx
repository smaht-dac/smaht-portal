<div className="html-container">
    <h3>Release History</h3>

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
                    <td className="pl-1"><a href="#">V1.0</a></td>
                    <td className="pl-1">COLO829 SNV Indel Detection Challenge - Presented at 2024 SMaHT annual meeting</td>
                    <td className="pl-1">June 15, 2024</td>
                </tr>
            </tbody>
        </table>
    </div>

    <h2 className="section-title py-2 mt-3 d-inline-block">Version 1.0 [latest]</h2>
    <DownloadAllFilesFromSearchHrefButton {...{ session }} searchHref="?type=File&dataset=colo829_indel_challenge_data" cls="mt-5 float-right"/>

    <h3 className="section-title">Truth Sets</h3>
    <p>[Description Here]</p>
    <ChallengeTableWrapper searchHref="?type=File&dataset=colo829_indel_challenge_data&tags=truth_sets" context={context} schemas={schemas} session={session} href={href}/>

    <h3 className="section-title">Negative Control</h3>
    <p>[Description Here]</p>
    <ChallengeTableWrapper searchHref="?type=File&dataset=colo829_indel_challenge_data&tags=negative_control" context={context} schemas={schemas} session={session} href={href} />

    <h3 className="section-title">Genome Stratification for Benchmarking</h3>
    <p>[Description Here]</p>
    <ChallengeTableWrapper searchHref="?type=File&dataset=colo829_indel_challenge_data&tags=genome_stratification" context={context} schemas={schemas} session={session} href={href}/>

    <h3 className="section-title">Submitted VCFs & Analysis Results</h3>
    <p>[Description Here]</p>
    <ChallengeTableWrapper searchHref="?type=File&dataset=colo829_indel_challenge_data&tags=analysis_results" context={context} schemas={schemas} session={session} href={href}/>
</div>
