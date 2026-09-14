"""Tests for transfer_tpc_tissue_sample_metadata command."""

from unittest.mock import patch

from encoded.commands.transfer_tpc_tissue_sample_metadata import (
    PROCESSED_TAG,
    build_patch,
    format_prefixed_value,
    get_non_tpc_tissue_samples,
    get_tpc_sample_for_external_id,
    main,
    parse_prefixed_value,
)


# =============================================================================
# parse_prefixed_value tests
# =============================================================================


def test_parse_prefixed_value_empty():
    """Empty string returns empty GCC part and no TPC part."""
    assert parse_prefixed_value("") == ("", None)


def test_parse_prefixed_value_plain():
    """Plain value without prefix is treated as GCC part."""
    assert parse_prefixed_value("some notes") == ("some notes", None)


def test_parse_prefixed_value_tpc_only():
    """TPC: prefix only returns no GCC part and TPC value."""
    assert parse_prefixed_value("TPC: tpc notes") == (None, "tpc notes")


def test_parse_prefixed_value_gcc_and_tpc():
    """Full GCC: ... ; TPC: ... format is parsed correctly."""
    assert parse_prefixed_value("GCC: gcc notes; TPC: tpc notes") == (
        "gcc notes",
        "tpc notes",
    )


def test_parse_prefixed_value_gcc_and_tpc_multiline():
    """GCC/TPC format with multiline values."""
    value = "GCC: line1\nline2; TPC: tpc line1\ntpc line2"
    gcc, tpc = parse_prefixed_value(value)
    assert gcc == "line1\nline2"
    assert tpc == "tpc line1\ntpc line2"


def test_parse_prefixed_value_extra_whitespace():
    """Extra whitespace around parts is stripped."""
    assert parse_prefixed_value("GCC:  gcc notes  ;  TPC:  tpc notes  ") == (
        "gcc notes",
        "tpc notes",
    )


def test_parse_prefixed_value_malformed_both_keywords():
    """Value containing both GCC: and TPC: but not matching format returns None."""
    # Missing semicolon
    assert parse_prefixed_value("GCC: gcc notes TPC: tpc notes") is None
    # Wrong order
    assert parse_prefixed_value("TPC: tpc notes; GCC: gcc notes") is None


def test_parse_prefixed_value_gcc_keyword_only():
    """GCC: keyword alone without TPC: is just a plain value (GCC part)."""
    # This is intentional: "GCC: something" without TPC: is treated as a plain value
    result = parse_prefixed_value("GCC: something")
    assert result == ("GCC: something", None)


def test_parse_prefixed_value_surrounding_whitespace_gcc_tpc():
    """GCC/TPC format with surrounding whitespace is accepted."""
    assert parse_prefixed_value("  GCC: gcc notes; TPC: tpc notes  ") == (
        "gcc notes",
        "tpc notes",
    )


def test_parse_prefixed_value_surrounding_whitespace_tpc_only():
    """TPC-only format with surrounding whitespace is accepted."""
    assert parse_prefixed_value("  TPC: tpc notes  ") == (None, "tpc notes")


def test_parse_prefixed_value_surrounding_whitespace_plain():
    """Plain value with surrounding whitespace is accepted."""
    assert parse_prefixed_value("  plain notes  ") == ("plain notes", None)


# =============================================================================
# format_prefixed_value tests
# =============================================================================


def test_format_prefixed_value_both():
    """Both GCC and TPC parts format correctly."""
    assert format_prefixed_value("gcc", "tpc") == "GCC: gcc; TPC: tpc"


def test_format_prefixed_value_tpc_only():
    """TPC part only."""
    assert format_prefixed_value(None, "tpc") == "TPC: tpc"


def test_format_prefixed_value_gcc_only():
    """GCC part only returns plain value."""
    assert format_prefixed_value("gcc", None) == "gcc"


def test_format_prefixed_value_empty():
    """No parts returns empty string."""
    assert format_prefixed_value(None, None) == ""
    assert format_prefixed_value("", None) == ""


# =============================================================================
# build_patch tests
# =============================================================================


def test_build_patch_core_size_copy():
    """core_size is copied when TPC has it and target doesn't."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"core_size": "3.0"}


def test_build_patch_core_size_match():
    """core_size match is OK, no update needed."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"core_size": "3.0"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {}


def test_build_patch_core_size_mismatch():
    """core_size mismatch returns None (skip signal)."""
    tpc_sample = {"core_size": "3.0", "uuid": "tpc-uuid"}
    target_sample = {"core_size": "1.5", "uuid": "target-uuid"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch is None


def test_build_patch_preservation_type_copy():
    """preservation_type is copied when TPC has it and target doesn't."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"preservation_type": "Frozen"}


def test_build_patch_preservation_type_exists():
    """preservation_type is not overwritten if target already has one."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Fixed"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {}


def test_build_patch_description_tpc_only():
    """description: TPC has value, target doesn't → TPC: <value>."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "TPC: tpc desc"}


def test_build_patch_description_gcc_exists():
    """description: both have values → GCC: <target>; TPC: <tpc>."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "gcc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "GCC: gcc desc; TPC: tpc desc"}


def test_build_patch_description_idempotent_same_tpc():
    """description: TPC value unchanged → no update."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "GCC: gcc desc; TPC: tpc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {}


def test_build_patch_description_idempotent_update_tpc():
    """description: TPC value changed → replace TPC part only."""
    tpc_sample = {"description": "new tpc desc"}
    target_sample = {"description": "GCC: gcc desc; TPC: old tpc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "GCC: gcc desc; TPC: new tpc desc"}


def test_build_patch_description_update_tpc_only_value():
    """description: TPC-only value changed → replace with new TPC-only value."""
    tpc_sample = {"description": "new tpc desc"}
    target_sample = {"description": "TPC: old tpc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "TPC: new tpc desc"}


def test_build_patch_processing_notes_update_tpc_only_value():
    """processing_notes: TPC-only value changed → replace with new TPC-only value."""
    tpc_sample = {"processing_notes": "new tpc notes"}
    target_sample = {"processing_notes": "TPC: old tpc notes"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"processing_notes": "TPC: new tpc notes"}


def test_build_patch_description_malformed_skip():
    """description: malformed prefix → skip field (no update)."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "GCC: gcc TPC: malformed"}
    patch = build_patch(tpc_sample, target_sample)
    # Malformed field is skipped, patch should be empty
    assert patch == {}


def test_build_patch_processing_notes_same_logic():
    """processing_notes follows same logic as description."""
    tpc_sample = {"processing_notes": "tpc notes"}
    target_sample = {"processing_notes": "gcc notes"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"processing_notes": "GCC: gcc notes; TPC: tpc notes"}


def test_build_patch_processing_notes_idempotent():
    """processing_notes: idempotent when TPC value unchanged."""
    tpc_sample = {"processing_notes": "tpc notes"}
    target_sample = {"processing_notes": "GCC: gcc notes; TPC: tpc notes"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {}


def test_build_patch_all_fields():
    """Multiple fields can be patched together."""
    tpc_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "tpc desc",
        "processing_notes": "tpc notes",
    }
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "TPC: tpc desc",
        "processing_notes": "TPC: tpc notes",
    }


def test_build_patch_no_changes_needed():
    """When no changes are needed, patch is empty dict."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Frozen"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {}


def test_build_patch_core_size_mismatch_blocks_all():
    """core_size mismatch returns None, preventing any field updates."""
    tpc_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "tpc desc",
    }
    target_sample = {
        "core_size": "1.5",
    }
    patch = build_patch(tpc_sample, target_sample)
    # Should return None, not a dict with preservation_type or description
    assert patch is None


def test_build_patch_core_size_empty_string_treated_as_absent():
    """Empty string core_size is treated as absent."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"core_size": ""}
    patch = build_patch(tpc_sample, target_sample)
    # Empty string should be treated as absent, so should copy
    assert patch == {"core_size": "3.0"}


def test_build_patch_core_size_none_treated_as_absent():
    """None core_size is treated as absent."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"core_size": None}
    patch = build_patch(tpc_sample, target_sample)
    # None should be treated as absent, so should copy
    assert patch == {"core_size": "3.0"}


def test_build_patch_preservation_type_empty_string_treated_as_absent():
    """Empty string preservation_type is treated as absent."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": ""}
    patch = build_patch(tpc_sample, target_sample)
    # Empty string should be treated as absent, so should copy
    assert patch == {"preservation_type": "Frozen"}


def test_build_patch_preservation_type_none_treated_as_absent():
    """None preservation_type is treated as absent."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": None}
    patch = build_patch(tpc_sample, target_sample)
    # None should be treated as absent, so should copy
    assert patch == {"preservation_type": "Frozen"}


def test_build_patch_malformed_description_other_fields_transfer():
    """Malformed description is skipped but other fields transfer."""
    tpc_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "tpc desc",
        "processing_notes": "tpc notes",
    }
    target_sample = {
        "description": "GCC: gcc TPC: malformed",  # Malformed (missing semicolon)
    }
    patch = build_patch(tpc_sample, target_sample)
    # Malformed description is skipped, but other fields should still transfer
    assert "description" not in patch
    assert patch["core_size"] == "3.0"
    assert patch["preservation_type"] == "Frozen"
    assert patch["processing_notes"] == "TPC: tpc notes"


def test_build_patch_malformed_processing_notes_other_fields_transfer():
    """Malformed processing_notes is skipped but other fields transfer."""
    tpc_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "tpc desc",
        "processing_notes": "tpc notes",
    }
    target_sample = {
        "processing_notes": "TPC: notes; GCC: wrong order",  # Malformed (wrong order)
    }
    patch = build_patch(tpc_sample, target_sample)
    # Malformed processing_notes is skipped, but other fields should still transfer
    assert "processing_notes" not in patch
    assert patch["core_size"] == "3.0"
    assert patch["preservation_type"] == "Frozen"
    assert patch["description"] == "TPC: tpc desc"


# =============================================================================
# get_non_tpc_tissue_samples tests
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_non_tpc_tissue_samples_default(mock_search):
    """Default behavior excludes tpc_metadata_synced tag."""
    mock_search.return_value = [{"uuid": "sample1"}]
    auth_key = {"server": "test"}

    result = get_non_tpc_tissue_samples(auth_key)

    assert result == [{"uuid": "sample1"}]
    call_query = mock_search.call_args[0][0]
    assert "tags!=tpc_metadata_synced" in call_query
    assert "submission_centers.display_title!=NDRI+TPC" in call_query
    assert "status!=deleted" in call_query
    # Regression: ensure page_limit=50 to avoid InvalidChunkLength with limit=all
    assert mock_search.call_args[1]["page_limit"] == 50


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_non_tpc_tissue_samples_ignore_tag(mock_search):
    """With ignore_tag=True, tag filter is omitted."""
    mock_search.return_value = [{"uuid": "sample1"}]
    auth_key = {"server": "test"}

    result = get_non_tpc_tissue_samples(auth_key, ignore_tag=True)

    assert result == [{"uuid": "sample1"}]
    call_query = mock_search.call_args[0][0]
    assert "tags!=" not in call_query
    assert "submission_centers.display_title!=NDRI+TPC" in call_query
    # Regression: ensure page_limit=50 to avoid InvalidChunkLength with limit=all
    assert mock_search.call_args[1]["page_limit"] == 50


# =============================================================================
# get_tpc_sample_for_external_id tests
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_tpc_sample_no_results(mock_search):
    """No TPC sample found returns None."""
    mock_search.return_value = []
    auth_key = {"server": "test"}

    result = get_tpc_sample_for_external_id("EXT123", auth_key)

    assert result is None


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_tpc_sample_single_result(mock_search):
    """Single TPC sample is returned."""
    mock_search.return_value = [{"uuid": "tpc1", "external_id": "EXT123"}]
    auth_key = {"server": "test"}

    result = get_tpc_sample_for_external_id("EXT123", auth_key)

    assert result == {"uuid": "tpc1", "external_id": "EXT123"}


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_tpc_sample_multiple_results(mock_search, caplog):
    """Multiple TPC samples logs warning and returns first."""
    mock_search.return_value = [
        {"uuid": "tpc1", "external_id": "EXT123"},
        {"uuid": "tpc2", "external_id":"EXT123"},
    ]
    auth_key = {"server": "test"}

    result = get_tpc_sample_for_external_id("EXT123", auth_key)

    assert result == {"uuid": "tpc1", "external_id": "EXT123"}
    assert "Multiple TPC samples found" in caplog.text


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_tpc_sample_url_encodes_special_characters(mock_search):
    """external_id with special characters is URL-encoded in the query.

    This prevents query injection attacks where special characters like &, =,
    spaces, +, ?, and # could alter the query structure.
    """
    mock_search.return_value = [{"uuid": "tpc1", "external_id": "EXT&123=foo bar+test?baz#qux"}]
    auth_key = {"server": "test"}

    result = get_tpc_sample_for_external_id("EXT&123=foo bar+test?baz#qux", auth_key)

    assert result == {"uuid": "tpc1", "external_id": "EXT&123=foo bar+test?baz#qux"}

    # Verify the query passed to search_metadata has URL-encoded external_id
    call_query = mock_search.call_args[0][0]
    # & should be %26, = should be %3D, space should be %20, + should be %2B,
    # ? should be %3F, # should be %23
    assert "external_id=EXT%26123%3Dfoo%20bar%2Btest%3Fbaz%23qux" in call_query
    # Verify other query parts are still present and correct
    assert "type=TissueSample" in call_query
    assert "submission_centers.display_title=NDRI+TPC" in call_query
    assert "status!=deleted" in call_query


# =============================================================================
# main CLI integration tests
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_dry_run_default(
    mock_patch, mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Dry run by default, no patches applied."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_tpc.return_value = {"uuid": "tpc1", "core_size": "3.0"}

    with patch("sys.argv", ["cmd", "--env", "test"]):
        main()

    # No actual patches should be called in dry run
    mock_patch.assert_not_called()


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_execute_patches(
    mock_patch, mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """With --execute, patches are applied."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_tpc.return_value = {"uuid": "tpc1", "core_size": "3.0"}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # Should have called patch_metadata
    assert mock_patch.call_count == 1
    patch_call = mock_patch.call_args
    assert patch_call[1]["obj_id"] == "target1"
    assert "core_size" in patch_call[0][0]
    assert "tags" in patch_call[0][0]  # Default tagging


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_skip_tagging(
    mock_patch, mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """With --skip-tagging, tag is not added to patch."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_tpc.return_value = {"uuid": "tpc1", "core_size": "3.0"}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute", "--skip-tagging"]):
        main()

    assert mock_patch.call_count == 1
    patch_call = mock_patch.call_args
    patch_data = patch_call[0][0]
    assert "tags" not in patch_data
    assert "core_size" in patch_data


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
def test_main_ignore_tag(mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth):
    """With --ignore-tag, tagged samples are included."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = []

    with patch("sys.argv", ["cmd", "--env", "test", "--ignore-tag"]):
        main()

    # Check that ignore_tag=True was passed
    assert mock_get_non_tpc.call_args[1]["ignore_tag"] is True


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_core_size_mismatch_skipped(
    mock_patch, mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """core_size mismatch is logged and sample is skipped."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "core_size": "1.5", "tags": []}
    ]
    mock_get_tpc.return_value = {"uuid": "tpc1", "core_size": "3.0"}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # No patch should be applied due to mismatch
    mock_patch.assert_not_called()


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_mixed_patchable_and_mismatch(
    mock_patch, mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Some samples are patchable, some have mismatches."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "core_size": "1.5", "tags": []},
        {"uuid": "target2", "external_id": "EXT2", "tags": []},
    ]

    def get_tpc_side_effect(external_id, auth_key):
        if external_id == "EXT1":
            return {"uuid": "tpc1", "core_size": "3.0"}  # Mismatch
        elif external_id == "EXT2":
            return {"uuid": "tpc2", "core_size": "3.0"}  # Patchable
        return None

    mock_get_tpc.side_effect = get_tpc_side_effect

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # Only target2 should be patched, target1 skipped due to mismatch
    assert mock_patch.call_count == 1
    assert mock_patch.call_args[1]["obj_id"] == "target2"


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
def test_main_no_tpc_match(mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth):
    """Sample with no TPC match is skipped."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_tpc.return_value = None

    with patch("sys.argv", ["cmd", "--env", "test"]):
        main()

    # Summary line goes to stderr/stdout, not caplog - just check it ran without error
    assert True


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_tpc_sample_for_external_id")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_no_changes_needed(
    mock_patch, mock_get_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Sample that needs no changes is skipped."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {
            "uuid": "target1",
            "external_id": "EXT1",
            "core_size": "3.0",
            "tags": [PROCESSED_TAG],
        }
    ]
    mock_get_tpc.return_value = {"uuid": "tpc1", "core_size": "3.0"}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute", "--ignore-tag"]):
        main()

    mock_patch.assert_not_called()
    # Summary line goes to stderr/stdout, not caplog
    assert True
