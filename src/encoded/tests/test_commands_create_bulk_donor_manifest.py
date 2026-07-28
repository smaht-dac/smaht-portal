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
