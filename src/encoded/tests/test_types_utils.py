from webtest import TestApp

from ..type_annotations import JsonObject


def test_center_submitter_ids(
    testapp: TestApp,
    aliquot: JsonObject,
    test_submission_center: JsonObject,
    test_second_submission_center: JsonObject,
) -> None:
    """Integrated test for 'center_submitter_ids' calcprop.

    Arbitrarily using aliquot items here.
    """
    expected_submitter_id = "some_submitter_id"
    assert aliquot.get("submitter_id") == expected_submitter_id
    assert aliquot.get("center_submitter_ids") == [
        f"{test_submission_center.get('identifier')}:{expected_submitter_id}",
        f"{test_second_submission_center.get('identifier')}:{expected_submitter_id}",
    ]

    # Ensure unique key conflict
    aliquot_with_same_submitter_id = {
        "submission_centers": [test_submission_center["uuid"]],
        "submitter_id": expected_submitter_id,
    }
    testapp.post_json("/aliquot", aliquot_with_same_submitter_id, status=409)
