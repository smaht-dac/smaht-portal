import pytest


pytestmark = [pytest.mark.workbook]


def test_barplot_aggregation_endpoint(workbook, es_testapp):
    """ Basic tests on the barplot endpoint to verify counts against a normal search request """
    search_result = es_testapp.get('/search/?type=FileSet').json
    search_result_count = len(search_result['@graph'])
    res = es_testapp.post_json('/bar_plot_aggregations', {
        "search_query_params": {"type": ['FileSet']},
        "fields_to_aggregate_for": [
            "submission_centers.display_title",  # X Axis, always going to have 1 since 1 center in testing
            "files.display_title"  # Y axis, will have 7 since there are 7 files in the inserts
        ]
    }).json
    assert len(res['terms']['SMaHT Test Center']['terms'].keys()) == 7
    assert f'SMHT-FOO-BAR-M45-B003-DAC_SMAURF3ETDQJ_' \
           f'bwamem0.1.2_GRCh38.aligned.sorted.bam' in res['terms']['SMaHT Test Center']['terms']
    res = es_testapp.post_json('/bar_plot_aggregations', {
        "search_query_params": {"type": ['FileSet']},
        "fields_to_aggregate_for": [
            "submission_centers.display_title",  # X Axis, always going to have 1 since 1 center in testing
            "libraries.display_title"  # Y axis, will have 2 since right now there are two libraries
        ]
    }).json
    assert len(res['terms']['SMaHT Test Center']['terms'].keys()) == 2
    assert 'TEST_LIBRARY_HELA' in res['terms']['SMaHT Test Center']['terms']
    assert 'TEST_LIBRARY_LIVER' in res['terms']['SMaHT Test Center']['terms']
    res = es_testapp.post_json('/bar_plot_aggregations', {
        "search_query_params": {"type": ['FileSet']},
        "fields_to_aggregate_for": [
            "submission_centers.display_title",  # X Axis, always going to have 1 since 1 center in testing
            "libraries.assay.code"  # Y axis, only 1 code right now
        ]
    }).json
    assert len(res['terms']['SMaHT Test Center']['terms'].keys()) == 1
    assert '001' in res['terms']['SMaHT Test Center']['terms']
    res = es_testapp.post_json('/bar_plot_aggregations', {
        "search_query_params": {"type": ['FileSet']},
        "fields_to_aggregate_for": [
            "submission_centers.display_title",  # X Axis, always going to have 1 since 1 center in testing
            "libraries.analytes.display_title"  # Y axis, 2 analytes right now
        ]
    }).json
    assert len(res['terms']['SMaHT Test Center']['terms'].keys()) == 2
    assert 'TEST_ANALYTE_HELA' in res['terms']['SMaHT Test Center']['terms']
    assert 'TEST_ANALYTE_LIVER' in res['terms']['SMaHT Test Center']['terms']
    res = es_testapp.post_json('/bar_plot_aggregations', {
        "search_query_params": {"type": ['FileSet']},
        "fields_to_aggregate_for": [
            "submission_centers.display_title",  # X Axis, always going to have 1 since 1 center in testing
            "libraries.analytes.samples.display_title"  # Y axis, 2 samples right now
        ]
    }).json
    assert len(res['terms']['SMaHT Test Center']['terms'].keys()) == 3
    assert 'SMHT-0001' in res['terms']['SMaHT Test Center']['terms']
    assert 'TEST_CELL-CULTURE-SAMPLE_HELA' in res['terms']['SMaHT Test Center']['terms']
    assert 'TEST_CELL-CULTURE-SAMPLE_HELA-HEK293' in res['terms']['SMaHT Test Center']['terms']
    res = es_testapp.post_json('/bar_plot_aggregations', {
        "search_query_params": {"type": ['FileSet']},
        "fields_to_aggregate_for": [
            "submission_centers.display_title",  # X Axis, always going to have 1 since 1 center in testing
            "sequencing.sequencer.identifier"  # Y axis, only 1 sequencer
        ]
    }).json
    assert len(res['terms']['SMaHT Test Center']['terms'].keys()) == 1
    assert 'illumina_novaseqx' in res['terms']['SMaHT Test Center']['terms']
