import pandas as pd

from encoded.commands.create_bulk_donor_manifest import (
    format_value_from_properties,
)


def _manifest_with_column(column: str) -> pd.DataFrame:
    return pd.DataFrame(columns=[column], index=[0])


def test_capped_age_displayed_as_89_plus_for_protected_donor():
    donor_manifest = _manifest_with_column("ProtectedDonor.age")
    result = format_value_from_properties(
        donor_manifest, 0, "ProtectedDonor", ["ProtectedDonor.age"], [{"age": 89}]
    )
    assert result.at[0, "ProtectedDonor.age"] == "89+"


def test_capped_age_displayed_as_89_plus_for_public_donor():
    donor_manifest = _manifest_with_column("Donor.age")
    result = format_value_from_properties(
        donor_manifest, 0, "Donor", ["Donor.age"], [{"age": 89}]
    )
    assert result.at[0, "Donor.age"] == "89+"


def test_uncapped_age_passed_through_unchanged():
    donor_manifest = _manifest_with_column("ProtectedDonor.age")
    result = format_value_from_properties(
        donor_manifest, 0, "ProtectedDonor", ["ProtectedDonor.age"], [{"age": 65}]
    )
    assert result.at[0, "ProtectedDonor.age"] == 65


def test_embedded_newline_replaced_with_space_single_result():
    donor_manifest = _manifest_with_column("Diagnosis.comments")
    result = format_value_from_properties(
        donor_manifest,
        0,
        "Diagnosis",
        ["Diagnosis.comments"],
        [{"comments": "Family reports patient\nwas previously treating it as an infection"}],
    )
    assert result.at[0, "Diagnosis.comments"] == (
        "Family reports patient was previously treating it as an infection"
    )


def test_embedded_crlf_and_cr_replaced_with_space():
    donor_manifest = _manifest_with_column("Diagnosis.comments")
    result = format_value_from_properties(
        donor_manifest, 0, "Diagnosis", ["Diagnosis.comments"], [{"comments": "line1\r\nline2\rline3"}]
    )
    assert result.at[0, "Diagnosis.comments"] == "line1 line2 line3"


def test_embedded_newline_replaced_in_multi_result_join():
    donor_manifest = _manifest_with_column("Diagnosis.comments")
    result = format_value_from_properties(
        donor_manifest,
        0,
        "Diagnosis",
        ["Diagnosis.comments"],
        [{"comments": "first\ncomment"}, {"comments": "second comment"}],
    )
    assert result.at[0, "Diagnosis.comments"] == "first comment|second comment"
