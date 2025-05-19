===========================
Frequently Asked Questions
===========================


Where can I find the latest version of the submission template?
===============================================================
The latest version of the submission template can be found on our portal `here <https://data.smaht.org/docs/submission/getting-started-with-submissions#templates>`__ (`at this URL <https://docs.google.com/spreadsheets/d/1LEaS5QTwm86iZjjKt3tKRe_P31sE9-aJZ7tMINxw3ZM/edit?gid=1958643317#gid=1958643317>`_).



What metadata properties are required for each item type?
=========================================================
On the metadata spreadsheet, properties indicated in **bold** are required for all items of that type. 

Other properties may also be required depending on the specific assay or sequencer. For example, ``rna_integrity_number`` is required for RNA-sequencing assays, but not for DNA sequencing assays. Read the tooltips for each property for additional details on what properties are required.

However, we ask that you fill out as much of the metadata spreadsheet as possible to support future downstream analyses.



I noticed on the metadata spreadsheet that italicized fields are indicated as being “LinkTo” properties or say “Link:  Yes” in their tooltips. What does this mean?
===================================================================================================================================================================
Refer to our documentation on “LinkTo” properties and linking metadata items during submission `here <https://data.smaht.org/docs/submission/links-to-existing-data>`__.



I am getting the error Portal credentials do not seem to work: ~/.smaht-keys.json (data) when running smaht-submitr. How do I obtain or generate the correct portal credentials?
========================================================================================================================================================================================
See our documentation `here <https://data.smaht.org/docs/access/access-key-generation>`__ on how to create your portal credentials. If you have already generated your credentials but they do not work, double-check that your credentials are up-to-date. Credentials expire every 30 days, so if you have not submitted metadata recently, it is likely that your credentials expired.



When I try to run smaht-submitr, I keep getting the help text. Can you help me figure out what is going on?
===============================================================================================================

There is likely an error in the command you are running. There are lots of possible causes for this error. For example, there might be an invalid character in the command or there might be spaces in the directory path that are not escaped property.

To troubleshoot, we would recommend running the command with each argument individually to determine which argument or flag is throwing the error. Additionally, we would recommend typing out the command manually – copying and pasting the command from a word document, for instance, can sometimes result in errors.



I am getting validation errors for my submitted_ids, but it looks correct. What am I doing wrong?
=====================================================================================================

submitted_ids are important unique identifiers for each submitted item in the data portal. These identifiers must be in the format ``[CENTER]_[ITEM-TYPE]_[UNIQUE-ID]``, must be _entirely_ uppercase, and must be _unique_. Each bracketed portion of the IDs is separated by underscores. The ``[ITEM-TYPE]`` portion of the ID is delimited using dashes. The ``submitted_ids`` must only include the following: 

* Alphanumeric characters (A-Z, 0-9)
* Periods (.)
* Dashes (-)
* Underscores (_)

No other additional characters are allowed in your identifiers, such as spaces or backslashes. Double-check that your ``submitted_id`` follows all of the requirements listed above.



I am getting the following error from smaht-submitr: - ERROR: Additional properties are not allowed, but I am using the submission template. How do I resolve this?
=======================================================================================================================================================================

We are regularly updating and improving our data model, so there may be fields (and sometimes even entire item types) that are added and removed. In conjunction with this, we regularly create and release new versions of the submission template. Ensure that you are using the latest version of the submission template, which can be found on our portal `here <https://data.smaht.org/docs/submission/getting-started-with-submissions#templates>`__ (`at this URL <https://docs.google.com/spreadsheets/d/1LEaS5QTwm86iZjjKt3tKRe_P31sE9-aJZ7tMINxw3ZM/edit?gid=1958643317#gid=1958643317>`_).



I am trying to submit production data that links to tissue items from the TPC (NDRI). However, I keep getting an error like Submitted ID start (NDRI) does not match options for given submission centers: [DAC]. What does this mean?
==========================================================================================================================================================================================================================================

This error is thrown because users are not allowed to submit metadata items from other centers. For example, we wouldn't want a user from NYU-TTD to accidentally submit file items for WashU-GCC. Because the Donor and Tissue items are existing metadata items submitted by the TPC (given that their submitted_ids begin with “NDRI”) and you are associated with another center, ``smaht-submitr`` throws an error. To fix this, you can put parentheses around the names of tabs to tell ``smaht-submitr`` to ignore that tab e.g. changing the tab name from “Tissue” to “(Tissue)”.



When trying to upload files to the data portal using smaht-submitr, I get the following error: Cannot find the given submission type or file type or accession ID. How do I resolve this?
=================================================================================================================================================================================================

There are a couple of things to check:

1. Confirm that the ``submission_uuid`` you are using is correct. When copying and pasting, it is very easy to truncate your UUID by a couple of characters when copying and pasting it.
2. Ensure that your credentials are up-to-date. Credentials expire every 30 days, so if you have not submitted metadata recently, it is likely that your credentials expired, resulting in that error.



I am looking to submit a new assay type or data type to the DAC, and the metadata spreadsheet is currently missing some metadata fields that would be important to capture. What should I do?
=============================================================================================================================================================================================

If you are looking to submit data for a new assay type or sequencer to the DAC, please reach out to us (see the question below)! We would be happy to schedule a meeting with you to discuss what metadata is important to capture for your assay.



Where or how can I reach out to the DAC if I have additional questions?
=======================================================================

Every Monday at 1pm EST, we hold DAC Open Hours on Zoom (at this `link <https://harvard.zoom.us/j/97300725687?pwd=cEJWRjc0dTVtSDJKTDhBTUI0YjVNQT09>`_) to answer any questions you may have regarding data submissions. You can also email us at our help desk (`smhelp@hms-dbmi.atlassian.net <smhelp@hms-dbmi.atlassian.net>`_) or message us directly over Slack!
