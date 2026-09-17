"""Tests for transfer_tpc_tissue_sample_metadata command."""

from unittest.mock import patch

from encoded.commands.transfer_tpc_tissue_sample_metadata import (
    PROCESSED_TAG,
    build_patch,
    changed_relevant_fields,
    format_prefixed_value,
    get_all_tpc_samples,
    get_non_tpc_tissue_samples,
    has_metadata_changes,
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


def test_parse_prefixed_value_tpc_with_semicolons():
    """TPC values can contain semicolons (Fix #2)."""
    # TPC value with semicolons should be parsed correctly
    assert parse_prefixed_value("GCC: gcc notes; TPC: tpc; has; semicolons") == (
        "gcc notes",
        "tpc; has; semicolons",
    )
    assert parse_prefixed_value("TPC: tpc; has; semicolons") == (
        None,
        "tpc; has; semicolons",
    )


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
    assert patch == {"core_size": "3.0", "tags": [PROCESSED_TAG]}


def test_build_patch_core_size_match():
    """core_size match is OK, tag is added if not present."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"core_size": "3.0", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"tags": [PROCESSED_TAG]}


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
    assert patch == {"preservation_type": "Frozen", "tags": [PROCESSED_TAG]}


def test_build_patch_preservation_type_exists():
    """preservation_type is not overwritten if target already has one, but tag is added."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Fixed", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"tags": [PROCESSED_TAG]}


def test_build_patch_description_tpc_only():
    """description: TPC has value, target doesn't → TPC: <value>."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "TPC: tpc desc", "tags": [PROCESSED_TAG]}


def test_build_patch_description_gcc_exists():
    """description: both have values → GCC: <target>; TPC: <tpc>."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "gcc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "GCC: gcc desc; TPC: tpc desc", "tags": [PROCESSED_TAG]}


def test_build_patch_description_idempotent_same_tpc():
    """description: TPC value unchanged → tag is added if not present."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "GCC: gcc desc; TPC: tpc desc", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"tags": [PROCESSED_TAG]}


def test_build_patch_description_idempotent_update_tpc():
    """description: TPC value changed → replace TPC part only."""
    tpc_sample = {"description": "new tpc desc"}
    target_sample = {"description": "GCC: gcc desc; TPC: old tpc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "GCC: gcc desc; TPC: new tpc desc", "tags": [PROCESSED_TAG]}


def test_build_patch_description_update_tpc_only_value():
    """description: TPC-only value changed → replace with new TPC-only value."""
    tpc_sample = {"description": "new tpc desc"}
    target_sample = {"description": "TPC: old tpc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "TPC: new tpc desc", "tags": [PROCESSED_TAG]}


def test_build_patch_processing_notes_update_tpc_only_value():
    """processing_notes: TPC-only value changed → replace with new TPC-only value."""
    tpc_sample = {"processing_notes": "new tpc notes"}
    target_sample = {"processing_notes": "TPC: old tpc notes"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"processing_notes": "TPC: new tpc notes", "tags": [PROCESSED_TAG]}


def test_build_patch_description_malformed_skip():
    """description: malformed prefix → skip field (no update)."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "GCC: gcc TPC: malformed"}
    patch = build_patch(tpc_sample, target_sample)
    # Malformed field is skipped, patch should be empty (Fix #3: no tag on parse failure)
    assert patch == {}


def test_build_patch_processing_notes_same_logic():
    """processing_notes follows same logic as description."""
    tpc_sample = {"processing_notes": "tpc notes"}
    target_sample = {"processing_notes": "gcc notes"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"processing_notes": "GCC: gcc notes; TPC: tpc notes", "tags": [PROCESSED_TAG]}


def test_build_patch_processing_notes_idempotent():
    """processing_notes: idempotent when TPC value unchanged, but tag is added."""
    tpc_sample = {"processing_notes": "tpc notes"}
    target_sample = {"processing_notes": "GCC: gcc notes; TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"tags": [PROCESSED_TAG]}


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
        "tags": [PROCESSED_TAG],
    }


def test_build_patch_no_changes_needed():
    """When no changes are needed, tag is added if not present."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Frozen", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"tags": [PROCESSED_TAG]}


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
    assert patch == {"core_size": "3.0", "tags": [PROCESSED_TAG]}


def test_build_patch_core_size_none_treated_as_absent():
    """None core_size is treated as absent."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"core_size": None}
    patch = build_patch(tpc_sample, target_sample)
    # None should be treated as absent, so should copy
    assert patch == {"core_size": "3.0", "tags": [PROCESSED_TAG]}


def test_build_patch_preservation_type_empty_string_treated_as_absent():
    """Empty string preservation_type is treated as absent."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": ""}
    patch = build_patch(tpc_sample, target_sample)
    # Empty string should be treated as absent, so should copy
    assert patch == {"preservation_type": "Frozen", "tags": [PROCESSED_TAG]}


def test_build_patch_preservation_type_none_treated_as_absent():
    """None preservation_type is treated as absent."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": None}
    patch = build_patch(tpc_sample, target_sample)
    # None should be treated as absent, so should copy
    assert patch == {"preservation_type": "Frozen", "tags": [PROCESSED_TAG]}


def test_build_patch_malformed_description_other_fields_transfer():
    """Malformed description is skipped but other fields transfer, no tag added."""
    tpc_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "tpc desc",
        "processing_notes": "tpc notes",
    }
    target_sample = {
        "description": "GCC: gcc TPC: malformed",  # Malformed (missing semicolon)
        "tags": [],
    }
    patch = build_patch(tpc_sample, target_sample)
    # Malformed description is skipped, but other fields should still transfer
    # Parse failure prevents tagging
    assert "description" not in patch
    assert patch["core_size"] == "3.0"
    assert patch["preservation_type"] == "Frozen"
    assert patch["processing_notes"] == "TPC: tpc notes"
    assert "tags" not in patch  # Parse failure prevents tagging
    assert patch.unresolved_fields == ["description"]


def test_build_patch_malformed_processing_notes_other_fields_transfer():
    """Malformed processing_notes is skipped but other fields transfer, no tag added."""
    tpc_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "tpc desc",
        "processing_notes": "tpc notes",
    }
    target_sample = {
        "processing_notes": "TPC: notes; GCC: wrong order",  # Malformed (wrong order)
        "tags": [],
    }
    patch = build_patch(tpc_sample, target_sample)
    # Malformed processing_notes is skipped, but other fields should still transfer
    # Parse failure prevents tagging
    assert "processing_notes" not in patch
    assert patch["core_size"] == "3.0"
    assert patch["preservation_type"] == "Frozen"
    assert patch["description"] == "TPC: tpc desc"
    assert "tags" not in patch  # Parse failure prevents tagging


def test_build_patch_skip_tagging():
    """When skip_tagging=True, tag is not added (Fix #5)."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample, skip_tagging=True)
    assert patch == {"core_size": "3.0"}
    assert "tags" not in patch


def test_build_patch_tag_not_added_to_empty_patch():
    """Tag IS added even when there are no metadata changes (Fix #1)."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Frozen", "tags": []}
    patch = build_patch(tpc_sample, target_sample, skip_tagging=False)
    # No metadata changes, but tag should be added
    assert patch == {"tags": [PROCESSED_TAG]}


def test_build_patch_tag_not_duplicated():
    """Tag is not duplicated if already present."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"tags": [PROCESSED_TAG, "other_tag"]}
    patch = build_patch(tpc_sample, target_sample)
    # Tag is already present, so tags should not be in the patch (Fix #5)
    assert "tags" not in patch
    assert patch == {"core_size": "3.0"}


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
# get_all_tpc_samples tests (Fix #8: bulk loading)
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_all_tpc_samples_success(mock_search):
    """Successfully loads all TPC samples into a dict."""
    mock_search.return_value = [
        {"uuid": "tpc1", "external_id": "EXT1"},
        {"uuid": "tpc2", "external_id": "EXT2"},
    ]
    auth_key = {"server": "test"}

    result = get_all_tpc_samples(auth_key)

    assert len(result) == 2
    assert result["EXT1"] == {"uuid": "tpc1", "external_id": "EXT1"}
    assert result["EXT2"] == {"uuid": "tpc2", "external_id": "EXT2"}


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_all_tpc_samples_duplicate_external_id(mock_search):
    """Duplicate external_ids in TPC samples cause exit(1) (Fix #8)."""
    mock_search.return_value = [
        {"uuid": "tpc1", "external_id": "EXT1"},
        {"uuid": "tpc2", "external_id": "EXT1"},  # Duplicate!
    ]
    auth_key = {"server": "test"}

    try:
        get_all_tpc_samples(auth_key)
        assert False, "Should have raised SystemExit"
    except SystemExit as e:
        assert e.code == 1


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_get_all_tpc_samples_no_external_id(mock_search):
    """TPC samples without external_id are skipped with warning."""
    mock_search.return_value = [
        {"uuid": "tpc1", "external_id": "EXT1"},
        {"uuid": "tpc2"},  # Missing external_id
    ]
    auth_key = {"server": "test"}

    result = get_all_tpc_samples(auth_key)

    assert len(result) == 1
    assert "EXT1" in result


# =============================================================================
# main CLI integration tests
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_dry_run_default(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Dry run by default, no patches applied."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "tags": []}

    with patch("sys.argv", ["cmd", "--env", "test"]):
        main()

    # No actual patches should be called in dry run
    mock_patch.assert_not_called()


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_execute_patches(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """The patch is built directly from the search result; an unchanged
    authoritative pre-write refetch is the sole additional read and permits
    the validated write."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    # Pre-write refetch returns the same values as the search result
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "tags": []}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # Should have called patch_metadata twice: once for validation, once for execution
    assert mock_patch.call_count == 2
    # First call uses the locked dcicutils signature and query-string validation.
    assert mock_patch.call_args_list[0].kwargs["add_on"] == "?check_only=true"
    # Second call should be actual patch
    patch_call = mock_patch.call_args_list[1]
    assert patch_call[1]["obj_id"] == "target1"
    assert "core_size" in patch_call[0][0]
    assert "tags" in patch_call[0][0]  # Default tagging
    # Only one authoritative database read per write: immediately before
    # applying it. Patch construction used the search result directly.
    assert mock_get_metadata.call_count == 1
    call = mock_get_metadata.call_args_list[0]
    assert call.args == ("target1",)
    assert call.kwargs == {
        "key": {"server": "test"},
        "add_on": "frame=object&datastore=database",
    }


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_skip_tagging(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """With --skip-tagging, tag is not added to patch."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "tags": []}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute", "--skip-tagging"]):
        main()

    assert mock_patch.call_count == 2  # Validation + execution
    patch_data = mock_patch.call_args_list[1][0][0]
    assert "tags" not in patch_data
    assert "core_size" in patch_data


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
def test_main_ignore_tag(mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth):
    """With --ignore-tag, tagged samples are included."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = []
    mock_get_all_tpc.return_value = {}

    with patch("sys.argv", ["cmd", "--env", "test", "--ignore-tag"]):
        main()

    # Check that ignore_tag=True was passed
    assert mock_get_non_tpc.call_args[1]["ignore_tag"] is True


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_core_size_mismatch_skipped(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """core_size mismatch is logged and sample is skipped (Fix #4: no live failure)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "core_size": "1.5", "tags": []}
    ]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "core_size": "1.5", "tags": []}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # No patch should be applied due to mismatch
    mock_patch.assert_not_called()


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
def test_main_connection_failure_exits_nonzero(mock_search, mock_get_auth):
    """Connection failure exits with code 1 (Fix #4)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.side_effect = Exception("Connection failed")

    with patch("sys.argv", ["cmd", "--env", "test"]):
        try:
            main()
            assert False, "Should have raised SystemExit"
        except SystemExit as e:
            assert e.code == 1


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_validation_failure_exits_nonzero(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Validation failure exits with code 1 (Fix #9)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_non_tpc.return_value = [{"uuid": "target1", "external_id": "EXT1", "tags": []}]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "tags": []}
    # Validation fails
    mock_patch.side_effect = Exception("Validation error")

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        try:
            main()
            assert False, "Should have raised SystemExit"
        except SystemExit as e:
            assert e.code == 1


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
def test_main_limit_flag(
    mock_get_metadata,
    mock_get_all_tpc,
    mock_get_non_tpc,
    mock_search,
    mock_get_auth,
    capsys,
):
    """--limit flag limits the number of samples processed (Fix #10)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1"},
        {"uuid": "target2", "external_id": "EXT2"},
        {"uuid": "target3", "external_id": "EXT3"},
    ]
    mock_get_all_tpc.return_value = {}

    with patch("sys.argv", ["cmd", "--env", "test", "--limit", "2"]):
        main()

    assert "Limited to first 2 samples" in capsys.readouterr().err
    # No TPC matches, and dry run never reaches the pre-write authoritative
    # read, so get_metadata is not called; --limit is exercised purely via
    # get_non_tpc's returned list being truncated to 2 before Phase 1.
    mock_get_metadata.assert_not_called()


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
def test_main_identifiers_flag(mock_get_all_tpc, mock_get_metadata, mock_search, mock_get_auth):
    """--identifiers flag processes only specified samples (Fix #10). Each
    identifier is resolved once; that resolved record already carries every
    RELEVANT_TARGET_FIELDS value, so (with no TPC match and no --execute
    here) no further get_metadata call is needed to build or write a patch."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_metadata.side_effect = [
        {"@type": ["TissueSample"], "uuid": "target1", "external_id": "EXT1", "submission_centers": [{"display_title": "GCC"}]},
        {"@type": ["TissueSample"], "uuid": "target2", "external_id": "EXT2", "submission_centers": [{"display_title": "GCC"}]},
    ]
    mock_get_all_tpc.return_value = {}

    with patch("sys.argv", ["cmd", "--env", "test", "--identifiers", "target1", "target2"]):
        main()

    # One resolution fetch per identifier; no extra Phase 1 authoritative read.
    assert mock_get_metadata.call_count == 2


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
def test_main_identifiers_fetch_failure_exits_nonzero(
    mock_get_all_tpc, mock_get_metadata, mock_search, mock_get_auth
):
    """Failed fetch of specified identifier exits with code 1 (Fix #4)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_metadata.side_effect = Exception("Not found")
    mock_get_all_tpc.return_value = {}

    with patch("sys.argv", ["cmd", "--env", "test", "--identifiers", "nonexistent"]):
        try:
            main()
            assert False, "Should have raised SystemExit"
        except SystemExit as e:
            assert e.code == 1


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_patch_failure_exits_nonzero(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Patch failure exits with code 1 (Fix #4)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_non_tpc.return_value = [{"uuid": "target1", "external_id": "EXT1", "tags": []}]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "tags": []}
    # Validation passes, but actual patch fails
    mock_patch.side_effect = [None, Exception("Patch failed")]

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        try:
            main()
            assert False, "Should have raised SystemExit"
        except SystemExit as e:
            assert e.code == 1


# =============================================================================
# has_metadata_changes tests
# =============================================================================


def test_has_metadata_changes_true_with_fields():
    """Patch with metadata fields returns True."""
    patch = {"core_size": "3.0", "tags": [PROCESSED_TAG]}
    assert has_metadata_changes(patch) is True


def test_has_metadata_changes_false_with_only_tags():
    """Patch with only tags field returns False."""
    patch = {"tags": [PROCESSED_TAG]}
    assert has_metadata_changes(patch) is False


def test_has_metadata_changes_false_empty_patch():
    """Empty patch returns False."""
    assert has_metadata_changes({}) is False


def test_has_metadata_changes_true_with_description():
    """Patch with description and tags returns True."""
    patch = {"description": "TPC: new", "tags": [PROCESSED_TAG]}
    assert has_metadata_changes(patch) is True


# =============================================================================
# Tag behavior tests (Fix #1: every examined record gets tagged)
# =============================================================================


def test_build_patch_tag_added_to_unchanged_record():
    """Tag is added even when metadata matches perfectly."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Frozen", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    # No metadata changes, but tag should be added
    assert patch == {"tags": [PROCESSED_TAG]}


def test_build_patch_no_patch_when_tag_already_present():
    """No patch returned when tag already present and no changes needed."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Frozen", "tags": [PROCESSED_TAG]}
    patch = build_patch(tpc_sample, target_sample)
    # Tag already present, no changes needed
    assert patch == {}


def test_build_patch_tag_not_added_on_parse_failure():
    """Parse failure prevents tagging even if other fields would change."""
    tpc_sample = {
        "core_size": "3.0",
        "description": "tpc desc",
    }
    target_sample = {
        "description": "GCC: gcc TPC: malformed",  # Missing semicolon
        "tags": [],
    }
    patch = build_patch(tpc_sample, target_sample)
    # Malformed description prevents tagging, but core_size still transfers
    assert "tags" not in patch
    assert patch["core_size"] == "3.0"


def test_build_patch_tag_added_with_metadata_changes():
    """Tag is added along with metadata changes."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"core_size": "3.0", "tags": [PROCESSED_TAG]}


def test_build_patch_tag_not_duplicated_with_changes():
    """Tag is not duplicated when already present and metadata changes."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"tags": [PROCESSED_TAG, "other_tag"]}
    patch = build_patch(tpc_sample, target_sample)
    # Tag already present, so only metadata change
    assert patch == {"core_size": "3.0"}
    assert "tags" not in patch


# =============================================================================
# Field clearing tests (Fix #2: when TPC clears a field)
# =============================================================================


def test_build_patch_description_tpc_clears_from_gcc_tpc_format():
    """TPC clearing description removes TPC portion, keeps GCC portion."""
    tpc_sample = {"description": None}
    target_sample = {"description": "GCC: gcc notes; TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    # When TPC portion is removed, only GCC part remains (without prefix)
    assert patch["description"] == "gcc notes"
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_description_tpc_clears_from_tpc_only_format():
    """TPC clearing description removes entire value when only TPC portion exists."""
    tpc_sample = {"description": None}
    target_sample = {"description": "TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch["description"] == ""
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_description_tpc_clears_from_plain_format():
    """TPC clearing description with plain text target doesn't change it (GCC portion)."""
    tpc_sample = {"description": None}
    target_sample = {"description": "plain text notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    # Plain text is treated as GCC portion, no TPC to clear
    assert "description" not in patch
    # But tag is still added
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_description_tpc_empty_string_treated_as_clear():
    """Empty string TPC value clears TPC portion."""
    tpc_sample = {"description": ""}
    target_sample = {"description": "TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch["description"] == ""
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_description_tpc_whitespace_only_treated_as_clear():
    """Whitespace-only TPC value clears TPC portion."""
    tpc_sample = {"description": "   "}
    target_sample = {"description": "GCC: gcc; TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    # When TPC portion is removed, only GCC part remains (without prefix)
    assert patch["description"] == "gcc"
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_processing_notes_tpc_clears_from_gcc_tpc_format():
    """TPC clearing processing_notes removes TPC portion, keeps GCC portion."""
    tpc_sample = {"processing_notes": None}
    target_sample = {"processing_notes": "GCC: gcc notes; TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    # When TPC portion is removed, only GCC part remains (without prefix)
    assert patch["processing_notes"] == "gcc notes"
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_processing_notes_tpc_clears_from_tpc_only_format():
    """TPC clearing processing_notes removes entire value when only TPC portion exists."""
    tpc_sample = {"processing_notes": ""}
    target_sample = {"processing_notes": "TPC: tpc notes", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert patch["processing_notes"] == ""
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_core_size_cleared_when_tpc_clears():
    """Core size is cleared when TPC clears it (consistent with description/processing_notes)."""
    tpc_sample = {"core_size": None}
    target_sample = {"core_size": "3.0", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert "core_size" not in patch
    assert patch.delete_fields == ["core_size"]
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_preservation_type_cleared_when_tpc_clears():
    """Preservation type is cleared when TPC clears it (consistent with description/processing_notes)."""
    tpc_sample = {"preservation_type": ""}
    target_sample = {"preservation_type": "Frozen", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert "preservation_type" not in patch
    assert patch.delete_fields == ["preservation_type"]
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_clearing_with_other_changes():
    """Field clearing works alongside other field updates."""
    tpc_sample = {
        "core_size": "3.0",
        "description": None,  # Clearing
        "processing_notes": "new notes",  # Setting
    }
    target_sample = {
        "description": "TPC: old desc",
        "processing_notes": "GCC: gcc notes; TPC: old notes",
        "tags": [],
    }
    patch = build_patch(tpc_sample, target_sample)
    assert patch["core_size"] == "3.0"
    assert patch["description"] == ""  # Cleared
    assert patch["processing_notes"] == "GCC: gcc notes; TPC: new notes"  # Updated
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_core_size_cleared_with_empty_string():
    """Core size is cleared when TPC has empty string."""
    tpc_sample = {"core_size": ""}
    target_sample = {"core_size": "2.5", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert "core_size" not in patch
    assert patch.delete_fields == ["core_size"]
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_preservation_type_cleared_with_none():
    """Preservation type is cleared when TPC has None."""
    tpc_sample = {"preservation_type": None}
    target_sample = {"preservation_type": "FFPE", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    assert "preservation_type" not in patch
    assert patch.delete_fields == ["preservation_type"]
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_core_size_mismatch_still_skips():
    """Core size mismatch still causes sample to be skipped entirely."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {"core_size": "2.0", "tags": []}
    patch = build_patch(tpc_sample, target_sample)
    # Should return None to signal skip
    assert patch is None


def test_build_patch_all_fields_cleared():
    """All clearable fields can be cleared simultaneously."""
    tpc_sample = {
        "core_size": None,
        "preservation_type": "",
        "description": None,
        "processing_notes": "",
    }
    target_sample = {
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "TPC: old desc",
        "processing_notes": "GCC: gcc; TPC: old notes",
        "tags": [],
    }
    patch = build_patch(tpc_sample, target_sample)
    assert "core_size" not in patch
    assert "preservation_type" not in patch
    assert patch.delete_fields == ["core_size", "preservation_type"]
    assert patch["description"] == ""
    # format_prefixed_value("gcc", None) returns "gcc" (no GCC: prefix when no TPC portion)
    assert patch["processing_notes"] == "gcc"
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_core_size_clearing_with_description_update():
    """Core size clearing works alongside description updates."""
    tpc_sample = {
        "core_size": None,  # Clearing
        "description": "new tpc desc",  # Updating
    }
    target_sample = {
        "core_size": "2.5",
        "description": "GCC: gcc desc; TPC: old desc",
        "tags": [],
    }
    patch = build_patch(tpc_sample, target_sample)
    assert "core_size" not in patch
    assert patch.delete_fields == ["core_size"]
    assert patch["description"] == "GCC: gcc desc; TPC: new tpc desc"
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_preservation_type_not_cleared_when_target_empty():
    """Preservation type not cleared if target already empty."""
    tpc_sample = {"preservation_type": None}
    target_sample = {"tags": []}  # No preservation_type
    patch = build_patch(tpc_sample, target_sample)
    # Should not include preservation_type in patch
    assert "preservation_type" not in patch
    assert patch["tags"] == [PROCESSED_TAG]


# =============================================================================
# Integration tests for counting behavior
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_tag_only_updates_counted_separately(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Tag-only updates are counted separately from metadata changes."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []},
        # Already matches TPC's preservation_type, so this is tag-only.
        {"uuid": "target2", "external_id": "EXT2", "preservation_type": "Frozen", "tags": []},
    ]
    mock_get_all_tpc.return_value = {
        "EXT1": {"uuid": "tpc1", "core_size": "3.0"},  # Will have metadata change
        "EXT2": {"uuid": "tpc2", "preservation_type": "Frozen"},  # Will have metadata change
    }
    # Sole pre-write authoritative reads (one per patch), unchanged from the
    # search result used to build each patch.
    mock_get_metadata.side_effect = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []},
        {"uuid": "target2", "external_id": "EXT2", "preservation_type": "Frozen", "tags": []},
    ]

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # First patch: validation + execution for target1 (metadata change)
    # Second patch: validation + execution for target2 (tag only)
    assert mock_patch.call_count == 4
    
    # Check the execution calls (not validation calls)
    exec_calls = [
        call
        for call in mock_patch.call_args_list
        if "check_only=true" not in call.kwargs["add_on"]
    ]
    assert len(exec_calls) == 2
    
    # First execution: has core_size (metadata change)
    first_patch = exec_calls[0][0][0]
    assert "core_size" in first_patch
    assert "tags" in first_patch
    
    # Second execution: only tags (no metadata change)
    second_patch = exec_calls[1][0][0]
    assert "core_size" not in second_patch
    assert "preservation_type" not in second_patch
    assert "tags" in second_patch


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_tag_only_updates_sent_to_server(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """Tag-only updates are sent to the server."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    # Target already has matching preservation_type, but no tag
    mock_get_non_tpc.return_value = [
        {
            "uuid": "target1",
            "external_id": "EXT1",
            "preservation_type": "Frozen",
            "tags": [],
        }
    ]
    mock_get_all_tpc.return_value = {
        "EXT1": {"uuid": "tpc1", "preservation_type": "Frozen"}
    }
    # Sole pre-write authoritative read, unchanged from the search result.
    mock_get_metadata.return_value = {
        "uuid": "target1",
        "external_id": "EXT1",
        "preservation_type": "Frozen",
        "tags": [],
    }

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # Should have validation call + execution call
    assert mock_patch.call_count == 2
    
    # Check the execution call
    exec_call = [
        call
        for call in mock_patch.call_args_list
        if "check_only=true" not in call.kwargs["add_on"]
    ][0]
    patch_data = exec_call[0][0]
    
    # Should only have tags
    assert patch_data == {"tags": [PROCESSED_TAG]}
    assert exec_call[1]["obj_id"] == "target1"


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_clears_scalar_fields_with_delete_fields(
    mock_patch,
    mock_get_metadata,
    mock_get_all_tpc,
    mock_get_non_tpc,
    mock_search,
    mock_get_auth,
):
    """Schema-constrained scalar fields are deleted, never patched as null."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_non_tpc.return_value = [
        {
            "uuid": "target1",
            "external_id": "EXT1",
            "core_size": "3.0",
            "preservation_type": "Frozen",
            "tags": [],
        }
    ]
    mock_get_all_tpc.return_value = {
        "EXT1": {"uuid": "tpc1", "core_size": None, "preservation_type": None}
    }
    # Sole pre-write authoritative read, unchanged from the search result.
    mock_get_metadata.return_value = {
        "uuid": "target1",
        "external_id": "EXT1",
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "tags": [],
    }

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    assert mock_patch.call_count == 2
    validation, execution = mock_patch.call_args_list
    assert validation.args[0] == {"tags": [PROCESSED_TAG]}
    assert execution.args[0] == {"tags": [PROCESSED_TAG]}
    assert validation.kwargs["add_on"] == (
        "?check_only=true&delete_fields=core_size,preservation_type"
    )
    assert execution.kwargs["add_on"] == (
        "?delete_fields=core_size,preservation_type"
    )


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
def test_main_reports_malformed_values_as_unresolved(
    mock_get_metadata,
    mock_get_all_tpc,
    mock_get_non_tpc,
    mock_search,
    mock_get_auth,
    capsys,
):
    """Malformed prefixed values are a failing unresolved outcome, not no-change."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    # Dry run never reaches the pre-write authoritative read, so the malformed
    # value must be present directly in the search result build_patch uses.
    mock_get_non_tpc.return_value = [
        {
            "uuid": "target1",
            "external_id": "EXT1",
            "description": "GCC: missing separator TPC: ambiguous",
            "tags": [],
        }
    ]
    mock_get_all_tpc.return_value = {
        "EXT1": {"uuid": "tpc1", "description": "new TPC text"}
    }

    with patch("sys.argv", ["cmd", "--env", "test"]):
        try:
            main()
            assert False, "Should have raised SystemExit"
        except SystemExit as exc:
            assert exc.code == 1

    mock_get_metadata.assert_not_called()
    stderr = capsys.readouterr().err
    assert "Unresolved prefixed metadata for target1" in stderr
    assert "Unresolved: 1" in stderr
    assert "Skipped (no changes): 0" in stderr


def test_changed_relevant_fields_ignores_unrelated_changes():
    """Only values used to construct a write plan participate in the guard."""
    original = {
        "external_id": "EXT1",
        "core_size": "3.0",
        "preservation_type": "Frozen",
        "description": "description",
        "processing_notes": "notes",
        "tags": ["tag"],
        "last_modified": {"date_modified": "before"},
    }
    current = {
        **original,
        "last_modified": {"date_modified": "after"},
    }

    assert changed_relevant_fields(original, current) == []

    for field in (
        "external_id",
        "core_size",
        "preservation_type",
        "description",
        "processing_notes",
        "tags",
    ):
        changed = {**current, field: "changed"}
        assert changed_relevant_fields(original, changed) == [field]


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_detects_conflict_and_prevents_stale_write(
    mock_patch,
    mock_get_metadata,
    mock_get_all_tpc,
    mock_get_non_tpc,
    mock_search,
    mock_get_auth,
    capsys,
):
    """A post-validation concurrent edit is counted and never overwritten.

    The patch is built directly from the search result (the "original"
    values); the sole additional authoritative read happens immediately
    before the write and, finding a changed value, blocks the stale patch.
    """
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_non_tpc.return_value = [
        {
            "uuid": "target1",
            "external_id": "EXT1",
            "description": "original GCC description",
            "tags": [],
        }
    ]
    mock_get_all_tpc.return_value = {
        "EXT1": {"uuid": "tpc1", "description": "TPC description"}
    }
    mock_get_metadata.return_value = {
        "uuid": "target1",
        "external_id": "EXT1",
        "description": "concurrent GCC edit",
        "tags": [],
    }

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        try:
            main()
            assert False, "Should have raised SystemExit"
        except SystemExit as exc:
            assert exc.code == 1

    # The only PATCH is check-only pre-validation; no write follows the conflict.
    mock_patch.assert_called_once()
    assert mock_patch.call_args.kwargs["add_on"] == "?check_only=true"
    # Exactly one authoritative read: the pre-write conflict check.
    mock_get_metadata.assert_called_once()
    stderr = capsys.readouterr().err
    assert "Concurrent change detected for target1" in stderr
    assert "stale patch not applied" in stderr
    assert "Conflicts: 1" in stderr
    assert "Errors: 0" in stderr


# =============================================================================
# Search-frame completeness: the default search's embedded frame and the
# per-identifier fetch both already carry every RELEVANT_TARGET_FIELDS value,
# so build_patch works directly off the initial candidate listing and the
# pre-write authoritative read (Phase 3) is the only additional database read.
# =============================================================================


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_default_search_result_has_every_field_build_patch_needs(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """The default search result alone (no extra Phase 1 fetch) carries every
    RELEVANT_TARGET_FIELDS value build_patch needs, including a value TPC is
    clearing. Only the sole pre-write authoritative read follows."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_non_tpc.return_value = [
        {
            "uuid": "target1",
            "external_id": "EXT1",
            "core_size": "3.0",
            "preservation_type": "Frozen",
            "description": "GCC: gcc text; TPC: old tpc text",
            "processing_notes": "GCC: gcc notes",
            "tags": [],
        }
    ]
    # TPC clears core_size and updates description's TPC portion.
    mock_get_all_tpc.return_value = {
        "EXT1": {
            "uuid": "tpc1",
            "core_size": None,
            "preservation_type": "Frozen",
            "description": "new tpc text",
            "processing_notes": None,
        }
    }
    mock_get_metadata.return_value = dict(mock_get_non_tpc.return_value[0])

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    assert mock_patch.call_count == 2
    execution = mock_patch.call_args_list[1]
    assert execution.args[0]["description"] == "GCC: gcc text; TPC: new tpc text"
    assert execution.kwargs["add_on"] == "?delete_fields=core_size"
    # Exactly one authoritative read for the single write: no Phase 1 fetch
    # was needed because the search result already had every field.
    assert mock_get_metadata.call_count == 1


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch(
    "encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata",
    autospec=True,
)
def test_main_identifiers_resolution_has_every_field_build_patch_needs(
    mock_patch, mock_get_all_tpc, mock_get_metadata, mock_search, mock_get_auth
):
    """Under --identifiers, the per-identifier resolution fetch alone
    carries every RELEVANT_TARGET_FIELDS value needed; the only later
    get_metadata call is the sole pre-write authoritative read."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    resolved = {
        "@type": ["TissueSample"],
        "uuid": "target1",
        "external_id": "EXT1",
        "submission_centers": [{"display_title": "GCC"}],
        "tags": [],
    }
    mock_get_metadata.side_effect = [resolved, dict(resolved)]

    with patch("sys.argv", ["cmd", "--env", "test", "--identifiers", "target1", "--execute"]):
        main()

    assert mock_patch.call_count == 2
    assert "core_size" in mock_patch.call_args_list[1].args[0]
    # One resolution fetch plus the sole pre-write authoritative read.
    assert mock_get_metadata.call_count == 2
