========================
smaht-portal permissions
========================

Permissions in the smaht-portal rely on 3 mechanisms:
    * Entity tagging with consortia, submission center
    * The "status" field
    * The admin group

For the most part, those internal to the DAC are admins and can/view edit
all data. We maintain a comprehensive revision history in the case of
accidental edits to data by internal members.

Consortia Tagging
-----------------

Read permissions are typically federated by consortia entity tagging. Users
are associated with one or multiple consortia based on their access control
levels. If they do not meet the necessary consortia based condition they will
not be granted read access to data. For example, a public user would not be
able to access data released only to consortia (eg: an object with consortia =
smaht and status = released).

Submission Center Tagging
-------------------------

Write permissions are typically given to data submitters through the submission
center tagging. This gives submission center users specifically the ability to
submit certain metadata objects to the portal associated with their analysis.
They are also able view/edit that metadata through the portal up until the
point it is either released to consortia or made public. For example, a
submitter uploads a file, it receives status = in review and is only
viewable by the submission center and DAC, and upon completion of
review the status is moved to released and all consortia members will be
able to view it.

Status Controls
---------------

With a few exceptions, there are 6 statuses used by the smaht-portal:
    * public
    * draft
    * released
    * in review
    * obsolete
    * deleted

Public is intended for public release and is viewable by everybody and only
editable by admins.

Draft is for internal use where we are not sure if we want to release it outside
of the DAC internally.

Released is intended for data that should be viewable by all consortia members.

In review is the default status for uploaded data and is only viewable and
editable by the submitter and the DAC.

Obsolete is a form of released where data has either been superseded in some
way or is only up for historical purposes.

Deleted is a special status for data that should not be viewable by anyone
except the DAC and is kept only for historical purposes.


Additional statuses are used by the User and File items as their specific use
cases necessitate it, but this documentation will not detail their use.