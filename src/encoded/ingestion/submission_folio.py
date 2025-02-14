# This is simple convenience wrapper around the (snovault) SubmissionFolio type.

from contextlib import contextmanager
import json
import os
from typing import Generator
from dcicutils.misc_utils import VirtualApp
from dcicutils.portal_utils import Portal
from snovault.ingestion.common import get_parameter
from snovault.types.ingestion import SubmissionFolio
from snovault.util import s3_local_file


class SmahtSubmissionFolio:
    """
    Convenience wrapper around the standard (snovault) SubmissionFolio, locally for SMaHT.
    """

    def __init__(self, submission: SubmissionFolio) -> None:
        self.submission = submission
        self.id = submission.submission_id
        self.data_file_name = get_parameter(submission.parameters, "datafile")
        self.data_file_size = get_parameter(submission.parameters, "datafile_size", default=0)
        self.data_file_checksum = get_parameter(submission.parameters, "datafile_checksum", default=None)
        self.s3_bucket = submission.bucket
        self.s3_data_file_location = f"s3://{submission.bucket}/{submission.object_name}"
        self.s3_details_location = f"s3://{submission.bucket}/{submission.submission_id}/submission.json"
        self.post_only = get_parameter(submission.parameters, "post_only", as_type=bool, default=False)
        self.patch_only = get_parameter(submission.parameters, "patch_only", as_type=bool, default=False)
        self.validate_only = get_parameter(submission.parameters, "validate_only", as_type=bool, default=False)
        self.validate_skip = get_parameter(submission.parameters, "validate_skip", as_type=bool, default=False)
        self.ref_nocache = get_parameter(submission.parameters, "ref_nocache", as_type=bool, default=False)
        self.autoadd = get_parameter(submission.parameters, "autoadd", as_type=str, default=None)
        self.merge = get_parameter(submission.parameters, "merge", as_type=bool, default=False)
        # N.B. 2025-02-11: We no longer assume consortia is passed throught to the ingester smaht-submitr;
        # so if not then we get it elsewhere from the autoadd field; which we will pickup below if not set here.
        # This came up with permission problems for non-admin users using submitr.
        # Went back/forth on this; in the end removed restricted_fields designation for consortia in mixins.json;
        # so actually as of now (2025-02-12) consortia is coming through from smaht-submitr.
        self.consortium = get_parameter(submission.parameters, "consortium", as_type=str, default=None)
        self.submission_center = get_parameter(submission.parameters, "submission_center", as_type=str, default=None)
        self.user = get_parameter(submission.parameters, "user", as_type=str, default=None)
        self.debug_sleep = get_parameter(submission.parameters, "debug_sleep", as_type=str, default=None)
        if self.autoadd:
            try:
                self.autoadd = json.loads(self.autoadd)
                if not self.consortium:
                    # 2025-02-11: If consortia is not coming through then pick it up from smaht-submitr
                    # then get it from autoadd, and then delete it from autoadd; see comments above.
                    if isinstance(consortia := self.autoadd.get("consortia"), list):
                        self.consortium = consortia[0]
                        del self.autoadd["consortia"]
            except Exception:
                self.autoadd = None
        if self.user:
            try:
                self.user = json.loads(self.user)
            except Exception:
                self.user = None
        if not self.validate_only and self.data_file_name == "null":
            validation_uuid = get_parameter(submission.parameters, "validation_uuid", as_type=str, default=None)
            if (validation_uuid and
                (validation_datafile := get_parameter(submission.parameters,
                                                      "validation_datafile", as_type=str, default=None))):
                # Here we know that this submission was started via check-submission, and not submit-metadata-bundle,
                # because the server validation had timed out (on the smaht-submitr side from submit-metadata-bundle),
                # and the ID for that validation "submission" is validation_uuid. In this case self.data_file_name
                # will be "null" as set by check-submission, which is just a dummy file, and the real submission file
                # is at the S3 bucket of the validation, i.e. at s3://{self.bucket}/{validation_uuid}. And so we
                # will copy it from that location to the location where it normally would be for a normal submission.
                validation_datafile = self._construct_data_file_name_suitable_for_s3(validation_datafile)
                validation_datafile_s3_key = f"{validation_uuid}/{validation_datafile}"
                self.data_file_name = validation_datafile
                self.submission.object_name = f"{self.id}/{validation_datafile}"
                self.s3_data_file_location = f"s3://{submission.bucket}/{submission.object_name}"
                with s3_local_file(self.submission.s3_client,
                                   bucket=self.submission.bucket,
                                   key=validation_datafile_s3_key,
                                   local_filename=validation_datafile) as datafile:
                    self.submission.s3_client.upload_file(Filename=datafile,
                                                          Bucket=self.submission.bucket,
                                                          Key=self.submission.object_name)
        # TODO: what do we actually do we the consortium and submission_center?
        # Should we validate that each submitted object, if specified, contains
        # values for these which match these values here in the submission folio?
        self.consortium = get_parameter(submission.parameters, "consortium", default=None)
        self.submission_center = get_parameter(submission.parameters, "submission_center")
        self.portal_vapp = submission.vapp
        # Prevent non-admin things; currently just no validation skipping allowed.
        if not self.is_admin_user(self.user, self.portal_vapp):
            self.validate_skip = False

    @staticmethod
    def is_admin_user(user: dict, portal_vapp: VirtualApp) -> bool:
        try:
            user_record = Portal(portal_vapp).get_metadata(user["uuid"])
            return "admin" in user_record.get("groups", [])
        except Exception:
            return False

    @property
    def outcome(self) -> str:
        return self.submission.outcome

    @contextmanager
    def s3_file(self) -> Generator[str, None, None]:
        """
        Context manager to download the submitted file from S3 to a local file; yields the full
        path name to the local file; cleans up (removes the local file) at the end of the context.
        """
        with s3_local_file(self.submission.s3_client,
                           bucket=self.submission.bucket,
                           key=self.submission.object_name,
                           local_filename=self.data_file_name) as data_file_name:
            yield data_file_name

    def record_results(self, results: dict, validation_summary: list) -> None:
        """
        Records/writes the given results and summary (either successful load results or
        a description of any problems encountered) to S3 and to the IngestionSubmission
        object destined for the Portal database as appropriate. The results are an
        itemization of each/every object (by action, e.g. POST, PATCH, etc) written
        to the database; the summary is a list of (text lines) summarizing the
        submission, e.g. with counts for inserts, updates, etc.
        """
        if ((isinstance(validation_errors := results.get("validation"), list) and validation_errors) or
            (isinstance(ref_errors := results.get("ref"), list) and ref_errors) or
            (isinstance(other_errors := results.get("errors"), list) and other_errors)):  # noqa
            self.submission.fail()

        upload_info = results.get("upload_info")
        results = {"result": results, "validation_output": validation_summary, "upload_info": upload_info}


        # object in the Portal database, accessible, for example, like this:
        # http://localhost:8000/ingestion-submissions/7da2f985-a6f7-4184-9544-b7439957617e?format=json
        # These results may be for success or for errors; this is what will get displayed,
        # by default, by the submitr tool when it detects processing has completed.
        self.submission.note_additional_datum("validation_output", from_dict=results)
        self.submission.note_additional_datum("upload_info", from_dict=results)

        # This process_standard_bundle_results call causes the "result" key of the results
        # above to be written to the submission.json key of the submission S3 bucket.
        # All possible results keys and associated target S3 keys are:
        #
        # results["result"]            -> s3://<submission-bucket>/<uuid>/submission.json (potentially large)
        # results["validation_output"] -> s3://<submission-bucket>/<uuid>/summary.json (new as of 9/2023)
        # results["post_output"]       -> s3://<submission-bucket>/<uuid>/submission_response.txt
        # results["upload_info"]       -> s3://<submission-bucket>/<uuid>/upload_info.txt
        #
        # These are in: in snovault.types.ingestion.SubmissionFolio.process_standard_bundle_results
        # But note that cgap-portal specifically also does this (not within snovault like above):
        #
        # results["validation_output"] -> s3://<submission-bucket>/<uuid>/validation_report.txt
        #
        # If the s3_only argument is False then this info is written NOT ONLY to the
        # associated S3 key as described above but ALSO to the additional_data property
        # of the IngestionSubmission object as described above for note_additional_datum.
        # We set this to True here because the ("result" key of the) results could potentially
        # be very large, as it is an itemization of each/every object written to the database.
        #
        self.submission.process_standard_bundle_results(results, s3_only=True)

    @staticmethod
    def _construct_data_file_name_suitable_for_s3(filename: str) -> str:
        # This code adapted from snovault.ingestion.submit_for_ingestion.
        if filename.endswith(".gz"):
            _, ext = os.path.splitext(filename[:-3])
            gz = ".gz"
        else:
            _, ext = os.path.splitext(filename)
            gz = ""
        return "datafile{ext}{gz}".format(ext=ext, gz=gz)
