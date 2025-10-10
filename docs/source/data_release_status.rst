===================
Data Release Status
===================

Data releases for the SMaHT Data Portal are controlled by the ``status`` field on objects.
Users have access to metadata objects in the system based on their ``consortia`` and ``submission_center`` fields.


Metadata objects tagged under certain ``status`` values become viewable by users based on the value.
A description of important ``status`` values most
relevant to users is below.

* ``open``, ``protected`` status is used to denote open or protected data that is accessible to all SMaHT Data Portal users with appropriate portal registration or data access (e.g. dbGaP).
* ``open-network``, ``protected-network`` status is used to denote data that is accessible only to SMaHT Consortium users.
* ``obsolete`` status is used to denote previously ``released`` data that has been superseded by new data, also only viewable by registered SMaHT Consortia members.
* ``restricted`` status is used to denote controlled access data whose metadata is viewable by consortia users but can only be downloaded by dbGaP approved users. The set of approved users is managed internally by DAC.


Some additional statuses relevant for data submitters include:

* ``uploading`` status is specific to files and indicates a submitted file is pending md5 computation by DAC and is only viewable by the submitting center.
* ``uploaded`` status is specific to files and indicates a submitted file has completed md5 computation by DAC and is only viewable by the submitting center.
* ``in review`` status is for non-file metadata that is pending review prior to data release and is only viewable by the submitting center.
