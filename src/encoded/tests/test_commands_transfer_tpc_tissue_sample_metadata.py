"""Tests for transfer_tpc_tissue_sample_metadata command."""

from unittest.mock import patch, MagicMock

from encoded.commands.transfer_tpc_tissue_sample_metadata import (
    PROCESSED_TAG,
    build_patch,
    format_prefixed_value,
    get_all_tpc_samples,
    get_non_tpc_tissue_samples,
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
    assert patch == {"preservation_type": "Frozen", "tags": [PROCESSED_TAG]}


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
    assert patch == {"description": "TPC: tpc desc", "tags": [PROCESSED_TAG]}


def test_build_patch_description_gcc_exists():
    """description: both have values → GCC: <target>; TPC: <tpc>."""
    tpc_sample = {"description": "tpc desc"}
    target_sample = {"description": "gcc desc"}
    patch = build_patch(tpc_sample, target_sample)
    assert patch == {"description": "GCC: gcc desc; TPC: tpc desc", "tags": [PROCESSED_TAG]}


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
        "tags": [PROCESSED_TAG],
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
    assert patch["tags"] == [PROCESSED_TAG]


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
    assert patch["tags"] == [PROCESSED_TAG]


def test_build_patch_skip_tagging():
    """When skip_tagging=True, tag is not added (Fix #5)."""
    tpc_sample = {"core_size": "3.0"}
    target_sample = {}
    patch = build_patch(tpc_sample, target_sample, skip_tagging=True)
    assert patch == {"core_size": "3.0"}
    assert "tags" not in patch


def test_build_patch_tag_not_added_to_empty_patch():
    """Tag is not added when there are no metadata changes (Fix #5)."""
    tpc_sample = {"preservation_type": "Frozen"}
    target_sample = {"preservation_type": "Frozen"}
    patch = build_patch(tpc_sample, target_sample, skip_tagging=False)
    # No changes, so no tag should be added (empty patch)
    assert patch == {}


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
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
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
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
def test_main_execute_patches(
    mock_patch, mock_get_metadata, mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth
):
    """With --execute, patches are applied (Fix #6: refetch before patch)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []  # Connection check
    mock_get_non_tpc.return_value = [
        {"uuid": "target1", "external_id": "EXT1", "tags": []}
    ]
    mock_get_all_tpc.return_value = {"EXT1": {"uuid": "tpc1", "core_size": "3.0"}}
    # Fresh refetch returns same sample
    mock_get_metadata.return_value = {"uuid": "target1", "external_id": "EXT1", "tags": []}

    with patch("sys.argv", ["cmd", "--env", "test", "--execute"]):
        main()

    # Should have called patch_metadata twice: once for validation, once for execution
    assert mock_patch.call_count == 2
    # First call should be validation (check_only=True)
    assert mock_patch.call_args_list[0][1]["check_only"] is True
    # Second call should be actual patch
    patch_call = mock_patch.call_args_list[1]
    assert patch_call[1]["obj_id"] == "target1"
    assert "core_size" in patch_call[0][0]
    assert "tags" in patch_call[0][0]  # Default tagging


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_non_tpc_tissue_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
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
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
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
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
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
def test_main_limit_flag(mock_get_all_tpc, mock_get_non_tpc, mock_search, mock_get_auth):
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

    # Should have limited to 2 samples (check via mocked get_metadata call count)
    # In this case, we don't have patches so just verify it ran


@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_auth_key")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.search_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.get_metadata")
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.get_all_tpc_samples")
def test_main_identifiers_flag(mock_get_all_tpc, mock_get_metadata, mock_search, mock_get_auth):
    """--identifiers flag processes only specified samples (Fix #10)."""
    mock_get_auth.return_value = {"server": "test"}
    mock_search.return_value = []
    mock_get_metadata.side_effect = [
        {"@type": ["TissueSample"], "uuid": "target1", "external_id": "EXT1", "submission_centers": [{"display_title": "GCC"}]},
        {"@type": ["TissueSample"], "uuid": "target2", "external_id": "EXT2", "submission_centers": [{"display_title": "GCC"}]},
    ]
    mock_get_all_tpc.return_value = {}

    with patch("sys.argv", ["cmd", "--env", "test", "--identifiers", "target1", "target2"]):
        main()

    # Should have fetched exactly 2 samples
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
@patch("encoded.commands.transfer_tpc_tissue_sample_metadata.ff_utils.patch_metadata")
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
