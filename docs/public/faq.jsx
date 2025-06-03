
<div className="faq-container">
    <h2 className="faq-header">Frequently Asked Questions</h2>

    <div className="faq-body">
        <details>
            <summary><span>Where can I find the latest version of the submission template?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>The latest version of the submission template can be found on our portal <a href="https://data.smaht.org/docs/submission/getting-started-with-submissions#templates">here</a> (<a target="_blank" href="https://docs.google.com/spreadsheets/d/1LEaS5QTwm86iZjjKt3tKRe_P31sE9-aJZ7tMINxw3ZM/edit?gid=1958643317#gid=1958643317>">at this URL</a>).</span>
            </div>
        </details>

        <details>
            <summary><span>What metadata properties are required for each item type?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>On the metadata spreadsheet, properties indicated in <b>bold</b> are required for all items of that type.</span>
                <span>Other properties may also be required depending on the specific assay or sequencer. For example, <code>rna_integrity_number</code> is required for RNA-sequencing assays, but not for DNA sequencing assays. Read the tooltips for each property for additional details on what properties are required.</span>
                <span>However, we ask that you fill out as much of the metadata spreadsheet as possible to support future downstream analyses.</span>
            </div>
        </details>

        <details>
            <summary><span>I noticed on the metadata spreadsheet that italicized fields are indicated as being “LinkTo” properties or say “Link:  Yes” in their tooltips. What does this mean?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>Refer to our documentation on “LinkTo” properties and linking metadata items during submission <a href="https://data.smaht.org/docs/submission/links-to-existing-data">here</a>.</span>
            </div>
        </details>

        <details>
            <summary><span>I am getting the error <code>Portal credentials do not seem to work: ~/.smaht-keys.json (data)</code> when running smaht-submitr. How do I obtain or generate the correct portal credentials?</span><i className="icon icon-chevron-down fas"></i></summary>  
            <div className="response">
                <span>See our documentation <a href="https://data.smaht.org/docs/access/access-key-generation">here</a> on how to create your portal credentials.</span>
                <span>If you have already generated your credentials, but they do not work, double-check that your credentials are up-to-date. Credentials expire every 30 days, so it is possible that your credentials expired.</span>
            </div>
        </details>

        <details>
            <summary><span>When I try to run smaht-submitr, I keep getting the help text. Can you help me figure out what is going on?</span><i className="icon icon-chevron-down fas"></i></summary>      
            <div className="response">
                <span>There is likely an error in the command you are running. There are lots of possible causes for this error. For example, there might be an invalid character in the command or there might be spaces in the directory path that are not escaped properly.</span>
                <span>To troubleshoot, we would recommend running the command with each argument individually to determine which argument or flag is throwing the error. Additionally, we would recommend typing out the command manually - copying and pasting the command from a word document, for instance, can sometimes result in errors.</span>
            </div>
        </details>
        
        <details>
            <summary><span>I am getting validation errors for my submitted_ids, but they look correct. What am I doing wrong?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>submitted_ids are important unique identifiers for each submitted item in the data portal. These identifiers must be in the format <code>[CENTER]_[ITEM-TYPE]_[UNIQUE-ID]</code>, must be <i>entirely</i> uppercase, and must be <i>unique</i>. Each bracketed portion of the IDs is separated by underscores. The <code>[ITEM-TYPE]</code> portion of the ID is delimited using dashes. The <code>submitted_ids</code> must only include the following:</span>
                <ul>
                    <li>Alphanumeric characters (A-Z, 0-9)</li>
                    <li>Periods (.)</li>
                    <li>Dashes (-)</li>
                    <li>Underscores (_)</li>
                </ul>
                <span>No other characters are allowed in your identifiers, such as spaces or backslashes. Double-check that your <code>submitted_id</code> follows all of the requirements listed above.</span>
            </div>
        
        </details>

        <details>
            <summary><span>I am getting the following error from smaht-submitr:<code> - ERROR: Additional properties are not allowed</code>, but I am using the submission template. What's going on?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>We are regularly updating and improving our data model, so there may be fields (and sometimes even entire item types) that are added and removed. In conjunction with this, we regularly create and release new versions of the submission template. Ensure that you are using the latest version of the submission template, which can be found on our portal <a href="https://data.smaht.org/docs/submission/getting-started-with-submissions#templates">here</a> (<a href="https://docs.google.com/spreadsheets/d/1LEaS5QTwm86iZjjKt3tKRe_P31sE9-aJZ7tMINxw3ZM/edit?gid=1958643317#gid=1958643317" target="_blank">at this URL</a>).</span>
            </div>
        </details>
        
        <details>
            <summary><span>I am trying to submit production data that links to tissue items from the TPC (NDRI). However, I keep getting an error like <code>Submitted ID start (NDRI) does not match options for given submission centers: [DAC]</code>. What does this mean?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>This error is thrown because users are not allowed to submit metadata items from other centers. For example, we wouldn't want a user from NYU-TTD to accidentally submit file items for WashU-GCC. Because the Donor and Tissue items are existing metadata items submitted by the TPC (given that their submitted_ids begin with “NDRI”) and you are associated with another center, <code>smaht-submitr</code> throws an error. To fix this, you can put parentheses around the names of tabs to tell <code>smaht-submitr</code> to ignore that tab e.g. changing the tab name from “Tissue” to “(Tissue)”.</span>
            </div>
        </details>
        
        <details>
            <summary><span>When trying to upload files to the data portal using smaht-submitr, I get the following error: <code>Cannot find the given submission type or file type or accession ID</code>. How do I resolve this?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>There are a couple of things to check:</span>
                <ol>
                    <li>Confirm that the <code>submission_uuid</code> you are using is correct. When copying and pasting, it is very easy to truncate your UUID by a couple of characters.</li>
                    <li>Ensure that your credentials are up-to-date. Credentials expire every 30 days, so it is possible that your credentials expired, resulting in that error.</li>
                </ol>
            </div>
        </details>

        <details>
            <summary><span>I am looking to submit a new assay type or data type to the DAC, and the metadata spreadsheet is currently missing some metadata fields that would be important to capture. What should I do?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>If you are looking to submit data for a new assay type or sequencer to the DAC, please reach out to us using any of the methods described in the response below! We would be happy to schedule a meeting with you to discuss what metadata is important to capture for your assay and changes we can make to our data model.</span>
            </div>
        </details>

        <details>
            <summary><span>Where or how can I reach out to the DAC if I have additional questions?</span><i className="icon icon-chevron-down fas"></i></summary>
            <div className="response">
                <span>Every Monday at 1pm EST, we hold DAC Open Hours on Zoom (at this <a href="https://harvard.zoom.us/j/97300725687?pwd=cEJWRjc0dTVtSDJKTDhBTUI0YjVNQT09">link</a>) to answer any questions you may have regarding data submissions. You can also email us at our help desk at <a href="mailto:smhelp@hms-dbmi.atlassian.net">smhelp@hms-dbmi.atlassian.net</a> or message us directly over Slack!</span>
            </div>
        </details>
    </div>
</div>