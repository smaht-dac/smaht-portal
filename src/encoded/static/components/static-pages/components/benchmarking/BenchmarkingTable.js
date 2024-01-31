import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import _ from 'underscore';
import { Modal } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';

import {
    ajax,
    analytics,
    memoizedUrlParse,
    object,
    logger,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import {
    LocalizedTime,
    display as dateTimeDisplay,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import {
    SelectedItemsController,
    SelectionItemCheckbox,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';

import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';

export const BenchmarkingTableController = (props) => {
    // Mostly serves as an intermediary/wrapper HOC to make selectedItemsController methods
    // and props available in BenchmarkingTable's aboveTableComponent
    const { searchHref, schemas, facets, session, href, context } = props;

    // Some fields overriden in BenchmarkingTable component
    const originalColExtMap =
        EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

    if (!searchHref) {
        return (
            <div className="tbd-notice mt-2">
                Data: <span className="font-italic">Coming Soon</span>
            </div>
        );
    }

    return (
        <SelectedItemsController
            {...{ context, href }}
            currentAction={'multiselect'}>
            <BenchmarkingTable
                columnExtensionMap={originalColExtMap}
                {...{
                    session,
                    searchHref,
                    schemas,
                    href,
                    context,
                    facets,
                }}
            />
        </SelectedItemsController>
    );
};

const BenchmarkingTable = (props) => {
    const {
        searchHref,
        schemas,
        facets,
        session,
        href,
        columnExtensionMap: originalColExtMap,
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    } = props;

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
        href,
        searchHref,
    };

    /**
     * A column extension map speifically for benchmarking tables.
     * Some of these things may be worth moving to the global colextmap eventually.
     */
    const benchmarkingColExtMap = {
        ...originalColExtMap, // Pull in defaults for all tables
        // Then overwrite or add onto the ones that already are there:
        // Select all button
        '@type': {
            colTitle: (
                // Context now passed in from HeadersRowColumn (for file count)
                <SelectAllFilesButton {...selectedFileProps} type="checkbox" />
            ),
            hideTooltip: true,
            noSort: true,
            widthMap: { lg: 63, md: 63, sm: 63 },
            render: (result, parentProps) => {
                return (
                    <SelectionItemCheckbox
                        {...{ selectedItems, onSelectItem, result }}
                        isMultiSelect={true}
                    />
                );
            },
        },
        // File
        annotated_filename: {
            widthMap: { lg: 500, md: 400, sm: 300 },
            render: function (result, parentProps) {
                const {
                    '@id': atId,
                    display_title,
                    annotated_filename,
                } = result || {};

                return (
                    <span className="value text-left">
                        <a
                            href={atId}
                            target="_blank"
                            rel="noreferrer noopener">
                            {annotated_filename || display_title}
                        </a>
                    </span>
                );
            },
        },
        // Format
        'file_format.display_title': {
            colTitle: 'Format',
            widthMap: { lg: 100, md: 90, sm: 80 },
        },
        // Center
        'submission_centers.display_title': {
            colTitle: 'Center',
            render: function (result, parentProps) {
                const { submission_centers: gccs = [] } = result || {};
                if (gccs.length === 0) return null;
                return (
                    <span className="value text-left">
                        {gccs.map((gcc) => gcc.display_title).join(', ')}
                    </span>
                );
            },
        },
        // File Size
        file_size: {
            widthMap: { lg: 130, md: 120, sm: 100 },
            render: function (result, parentProps) {
                const value = result?.file_size;
                if (!value) return null;
                return (
                    <span className="value text-right">
                        {valueTransforms.bytesToLargerUnit(value)}
                    </span>
                );
            },
        },
        // Submission Date
        date_created: {
            widthMap: { lg: 180, md: 160, sm: 140 },
            render: function (result, parentProps) {
                const value = result?.date_created;
                if (!value) return null;
                return (
                    <span className="value text-right">
                        <LocalizedTime
                            timestamp={value}
                            formatType="date-file"
                        />
                    </span>
                );
            },
        },
    };

    return (
        <EmbeddedItemSearchTable
            key={session}
            embeddedTableHeader={
                <BenchmarkingAboveTableComponent
                    {...{
                        session,
                        selectedItems,
                        onSelectItem,
                        onResetSelectedItems,
                        href,
                        searchHref,
                    }}
                />
            }
            rowHeight={31}
            // maxHeight={200}
            {...{
                searchHref,
                schemas,
                session,
                facets,
            }}
            columnExtensionMap={benchmarkingColExtMap}
            hideFacets={['dataset']}
            hideColumns={['display_title']}
        />
    );
};

const BenchmarkingAboveTableComponent = React.memo(
    function BenchmarkingAboveTableComponent(props) {
        const {
            href,
            searchHref,
            context,
            onFilter,
            schemas,
            isContextLoading = false, // Present only on embedded search views,
            navigate,
            sortBy,
            sortColumns,
            hiddenColumns,
            addHiddenColumn,
            removeHiddenColumn,
            columnDefinitions,
            session,
            selectedItems, // From SelectedItemsController
            onSelectItem, // From SelectedItemsController
            onResetSelectedItems, // From SelectedItemsController
        } = props;
        const { filters: ctxFilters = null, total: totalResultCount = 0 } =
            context || {};

        const selectedFileProps = {
            selectedItems, // From SelectedItemsController
            onSelectItem, // From SelectedItemsController
            onResetSelectedItems, // From SelectedItemsController
            href,
            searchHref,
        };
        // console.log('abovetablecomponent props', props);

        return (
            <div className="d-flex w-100 mb-05">
                <div className="col-auto ml-0 pl-0">
                    <span className="text-400" id="results-count">
                        {totalResultCount}
                    </span>{' '}
                    Results
                </div>
                <div className="ml-auto col-auto mr-0 pr-0">
                    <SelectAllFilesButton
                        {...selectedFileProps}
                        {...{ context }}
                        totalFilesCount={totalResultCount}
                    />
                    <SelectedItemsDownloadButton
                        id="download_tsv_multiselect"
                        disabled={selectedItems.size === 0}
                        className="btn btn-primary btn-sm mr-05 align-items-center"
                        {...{ selectedItems, session }}
                        analyticsAddItemsToCart>
                        <i className="icon icon-download fas mr-03" />
                        Download {selectedItems.size} Selected Files
                    </SelectedItemsDownloadButton>
                </div>
            </div>
        );
    }
);

const SELECT_ALL_LIMIT = 8000;

class SelectAllFilesButton extends React.PureComponent {
    /** These are fields included when "Select All" button is clicked to AJAX all files in */
    static fieldsToRequest = [
        'accession',
        'display_title',
        '@id',
        '@type',
        'status',
        'data_type',
        'file_format.*',
        'submission_centers.display_title',
        'consortia.display_title',
    ];

    constructor(props) {
        super(props);
        this.isAllSelected = this.isAllSelected.bind(this);
        this.handleSelectAll = this.handleSelectAll.bind(this);
        this.state = { selecting: false };
    }

    isEnabled() {
        const { totalFilesCount, context } = this.props;
        const { total: totalFromPropContext = 0 } = context || {};
        if (!totalFilesCount && !totalFromPropContext) return true;
        if (totalFilesCount > SELECT_ALL_LIMIT) return false;
        return true;
    }

    isAllSelected() {
        const { totalFilesCount, selectedItems, context } = this.props;
        const { total: totalFromPropContext = 0 } = context || {};

        if (!totalFilesCount && !totalFromPropContext) return false;
        // totalFilesCount as returned from bar plot aggs at moment is unique.
        if (
            totalFilesCount === selectedItems.size ||
            totalFromPropContext === selectedItems.size
        ) {
            return true;
        }
        return false;
    }

    handleSelectAll(evt) {
        const { searchHref, onSelectItem, onResetSelectedItems } = this.props;
        if (
            typeof onSelectItem !== 'function' ||
            typeof onResetSelectedItems !== 'function'
        ) {
            logger.error(
                "No 'onSelectItems' or 'onResetSelectedItems' function prop passed from SelectedItemsController."
            );
            throw new Error(
                "No 'onSelectItems' or 'onResetSelectedItems' function prop passed from SelectedItemsController."
            );
        }

        this.setState({ selecting: true }, () => {
            if (!this.isAllSelected()) {
                const currentHrefParts = memoizedUrlParse(searchHref);
                const currentHrefQuery = _.extend({}, currentHrefParts.query);
                currentHrefQuery.field = SelectAllFilesButton.fieldsToRequest;
                currentHrefQuery.limit = 'all';
                const reqHref =
                    currentHrefParts.pathname +
                    '?' +
                    queryString.stringify(currentHrefQuery);

                ajax.load(reqHref, (resp) => {
                    const filesToSelect = resp['@graph'] || [];
                    onSelectItem(filesToSelect, true);
                    this.setState({ selecting: false });

                    //analytics
                    const extData = {
                        item_list_name: analytics.hrefToListName(
                            window && window.location.href
                        ),
                    };
                    const products = analytics.transformItemsToProducts(
                        filesToSelect,
                        extData
                    );
                    const productsLength = Array.isArray(products)
                        ? products.length
                        : filesToSelect.length;
                    analytics.event(
                        'add_to_cart',
                        'SelectAllFilesButton',
                        'Select All',
                        function () {
                            console.info(
                                `Adding ${productsLength} items from cart.`
                            );
                        },
                        {
                            items: Array.isArray(products) ? products : null,
                            list_name: extData.item_list_name,
                            value: productsLength,
                            // filters: analytics.getStringifiedCurrentFilters(
                            //     (context && context.filters) || null
                            // ),
                        }
                    );
                });
            } else {
                onResetSelectedItems();
                this.setState({ selecting: false });
            }
        });
    }

    render() {
        const { selecting } = this.state;
        const { type } = this.props;

        const isAllSelected = this.isAllSelected();
        const isEnabled = this.isEnabled();
        const iconClassName =
            'mr-05 icon icon-fw icon-' +
            (selecting
                ? 'circle-notch icon-spin fas'
                : isAllSelected
                ? 'square far'
                : 'check-square far');
        const cls =
            'btn btn-sm mr-05 align-items-center ' +
            (isAllSelected ? 'btn-secondary' : 'btn-outline-secondary');
        const tooltip =
            !isAllSelected && !isEnabled
                ? `"Select All" is disabled since the total file count exceeds the upper limit: ${SELECT_ALL_LIMIT}`
                : null;

        if (type === 'checkbox') {
            return (
                <input
                    type="checkbox"
                    disabled={selecting || (!isAllSelected && !isEnabled)}
                    checked={isAllSelected}
                    onChange={this.handleSelectAll}
                />
            );
        }

        return (
            <button
                type="button"
                id="select-all-files-button"
                disabled={selecting || (!isAllSelected && !isEnabled)}
                className={cls}
                onClick={this.handleSelectAll}
                data-tip={tooltip}>
                <i className={iconClassName} />
                <span className="d-none d-md-inline text-400">
                    {isAllSelected ? 'Deselect' : 'Select'}{' '}
                </span>
                <span className="text-600">All</span>
            </button>
        );
    }
}

/**
 * Upon clicking the button, reveal a modal popup giving users more download instructions.
 */
export class SelectedItemsDownloadButton extends React.PureComponent {
    static propTypes = {
        id: PropTypes.string,
        selectedItems: PropTypes.object.isRequired,
        filenamePrefix: PropTypes.string.isRequired,
        children: PropTypes.node.isRequired,
        disabled: PropTypes.bool,
        context: PropTypes.object,
        session: PropTypes.bool,
        action: PropTypes.string,
        analyticsAddItemsToCart: PropTypes.bool,
    };

    static defaultProps = {
        id: null,
        filenamePrefix: 'smaht_manifest_',
        children: 'Download',
        className: 'btn-primary',
        analyticsAddItemsToCart: false,
        action: '/metadata/',
    };

    constructor(props) {
        super(props);
        _.bindAll(this, 'hideModal', 'showModal');
        this.state = { modalOpen: false };
    }

    hideModal() {
        this.setState({ modalOpen: false });
    }

    showModal() {
        this.setState({ modalOpen: true });
    }

    render() {
        const {
            selectedItems,
            filenamePrefix,
            children,
            disabled,
            analyticsAddItemsToCart,
            action,
            session,
            ...btnProps
        } = this.props;
        const { modalOpen } = this.state;
        const isDisabled =
            typeof disabled === 'boolean' ? disabled : fileCountWithDupes === 0;
        btnProps.className =
            'btn ' + (modalOpen ? 'active ' : '') + btnProps.className;
        return (
            <React.Fragment>
                <button
                    type="button"
                    {...btnProps}
                    disabled={isDisabled}
                    onClick={this.showModal}>
                    {children}
                </button>
                {modalOpen ? (
                    <SelectedItemsDownloadModal
                        {...{
                            selectedItems,
                            filenamePrefix,
                            analyticsAddItemsToCart,
                            action,
                            session,
                        }}
                        onHide={this.hideModal}
                    />
                ) : null}
            </React.Fragment>
        );
    }
}

const SelectedItemsDownloadModal = function (props) {
    const { onHide, filenamePrefix, selectedItems, session } = props;
    let { action } = props;

    useEffect(() => {
        const {
            analyticsAddItemsToCart = false,
            itemCountUnique,
            selectedItems = {},
            context,
        } = props;
        if (!analyticsAddItemsToCart) {
            return;
        }

        // const itemList = _.keys(selectedItems).map(function(accessionTripleString){
        //     return selectedItems[accessionTripleString];
        // });
        const itemList = Array.from(selectedItems.values());
        //analytics
        const extData = {
            item_list_name: analytics.hrefToListName(
                window && window.location.href
            ),
        };
        const products = analytics.transformItemsToProducts(itemList, extData);
        const productsLength = Array.isArray(products)
            ? products.length
            : itemList.length;
        analytics.event(
            'begin_checkout',
            'SelectedFilesDownloadModal',
            'Mounted',
            function () {
                console.info(
                    `Will download ${productsLength} items in the cart.`
                );
            },
            {
                items: Array.isArray(products) ? products : null,
                list_name: extData.item_list_name,
                value: itemCountUnique || itemList.length || 0,
                filters: analytics.getStringifiedCurrentFilters(
                    (context && context.filters) || null
                ),
            }
        );
    }, []);

    const suggestedFilename =
        filenamePrefix +
        dateTimeDisplay(new Date(), 'date-time-file', '-', false) +
        '.tsv';

    if ('search' === analytics.hrefToListName(window && window.location.href)) {
        action = '/metadata/?type=File&sort=accession';
        // workaround for file only search since type=File returns more than 10K results that prevent iterating all after ES7 upgrade
        const parts = _.clone(memoizedUrlParse(window.location.href));
        const modifiedQuery = _.omit(parts.query || {}, [
            'currentAction',
            'type',
            'sort',
            'limit',
        ]);
        const modifiedSearch = queryString.stringify(modifiedQuery);
        action += '&' + modifiedSearch;
    }

    const { accessionArray } = useMemo(
        function () {
            // Flatten selected items into an array (currently a set, I believe)
            const itemAtIds = Array.from(selectedItems.keys());

            const accessionArray = [];

            itemAtIds.forEach((atId) => {
                const value = selectedItems.get(atId);

                if (value?.accession) {
                    accessionArray.push(value.accession);
                } else {
                    throw new Error('File Item without accession found!');
                }
            });

            return { accessionArray };
        },
        [selectedItems]
    );

    return (
        <Modal
            show
            className="batch-files-download-modal"
            onHide={onHide}
            size="lg">
            <Modal.Header closeButton>
                <Modal.Title className="pl-2 d-flex align-items-center">
                    <img
                        className="mr-1"
                        src="/static/img/SMaHT_Vertical-Logo-Solo_FV.png"
                        height="47"
                    />
                    SMaHT Data Download
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <div className="col-auto mb-4 px-3">
                    <h2 className="text-larger">SMaHT Policy</h2>
                    <hr className="my-2" />
                    <ul className="pl-2">
                        <li className="mb-1">
                            <strong>Data Use:</strong> Please read the{' '}
                            <a
                                href="https://docs.google.com/document/d/16gLiH07v_KWljTFd_EqK6NQ1d_c08utEXEmU6DTgfFs/edit"
                                target="_blank"
                                rel="noreferrer noopener">
                                SMaHT Data Use Policy
                            </a>{' '}
                            for the use of open- and protected-access data.
                        </li>
                        <li>
                            <strong>Publication:</strong> Please read the{' '}
                            <a
                                href="https://docs.google.com/document/d/1PQF0uEvPNuAco3sVxl2dOdl1mxuZ1zbfcbUJbIdW6Ac/edit"
                                target="_blank"
                                rel="noreferrer noopener">
                                SMaHT Publication Policy
                            </a>
                            .
                        </li>
                    </ul>
                </div>
                <BenchmarkingDataDownloadOverviewStats
                    {...{ accessionArray }}
                    numSelectedFiles={selectedItems.size}
                />
                <div className="col-auto mb-4">
                    <h2 className="text-larger">
                        <i className="fas icon-exclamation-triangle text-danger mr-1" />{' '}
                        Important Reminders
                    </h2>
                    <hr className="my-2" />
                    <ul className="pl-2">
                        <li className="mb-1">
                            You{' '}
                            <span className="text-danger text-500">
                                must include an access key in your cURL command
                            </span>{' '}
                            for bulk downloads.
                        </li>
                        <li>
                            You can configure the access key in your profile,
                            then use it in place of
                            &lt;access_key_id&gt;:&lt;access_key_secret&gt;,
                            below.
                        </li>
                    </ul>
                </div>
                <div className="col-auto mb-4">
                    <h2 className="text-larger">Instructions for Download</h2>
                    <hr className="my-2" />
                    <ol className="pl-2">
                        <li className="mb-1">
                            Please press the &quot;Download&quot; button below
                            to save the manifest file which contains download
                            URLs and other information for the selected files.
                        </li>
                        <li>
                            Once you have saved the manifest you may download
                            the files on any machine or server with the
                            following cURL command:
                        </li>
                    </ol>
                    <ModalCodeSnippet
                        filename={suggestedFilename}
                        session={session}
                    />
                </div>
            </Modal.Body>
            <Modal.Footer>
                <button
                    type="reset"
                    onClick={onHide}
                    className="btn btn-outline-secondary btn-block-xs-only">
                    Cancel
                </button>
                <SelectedItemsDownloadStartButton
                    {...{
                        selectedItems,
                        accessionArray,
                        suggestedFilename,
                        action,
                    }}
                />
            </Modal.Footer>
        </Modal>
    );
};

const BenchmarkingDataDownloadOverviewStats = React.memo(
    function BenchmarkingDataDownloadOverviewStats(props) {
        const { numSelectedFiles, accessionArray } = props;

        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(false);
        const [fileStats, setFileStats] = useState({});
        const {
            selectedFileSize = null,
            numExtraFiles = null,
            extraFilesSize = null,
        } = fileStats;

        const postData = {
            accessions: accessionArray,
            include_extra_files: true,
        };

        const callbackFxn = useCallback((resp) => {
            // console.log('BenchmarkingDataDownloadOverviewStats resp', resp);
            const facets = resp || [];

            // Figure out which ones are the facets we need
            let selectedFileSizeResp;
            let extraFileSizeResp;
            let numExtraFilesResp;
            facets.forEach((facet, i) => {
                if (facet.field === 'extra_files.file_size') {
                    extraFileSizeResp = facet.sum;
                    numExtraFilesResp = facet.count;
                } else if (facet.field === 'file_size') {
                    selectedFileSizeResp = facet.sum;
                }
            });

            setLoading(false);
            setError(false);

            setFileStats({
                selectedFileSize: selectedFileSizeResp,
                extraFilesSize: extraFileSizeResp,
                numExtraFiles: numExtraFilesResp,
            });
        });

        const fallbackFxn = useCallback((resp) => {
            console.log('BenchmarkingDataDownloadOverviewStats error', resp);
            setLoading(false);
            setError(true);
        });

        const getStatistics = useCallback(() => {
            if (!loading) setLoading(true);
            if (error) setError(false);

            ajax.load(
                '/peek-metadata/',
                callbackFxn,
                'POST',
                fallbackFxn,
                JSON.stringify(postData)
            );
        }, [callbackFxn, fallbackFxn, postData]);

        // On mount, get statistics
        useEffect(() => {
            getStatistics();
        }, []);

        // When error is triggered, reload tooltips
        useEffect(() => {
            ReactTooltip.rebuild();
        }, [error]);

        const loadingIndicator = (
            <i className="icon icon-circle-notch icon-spin fas" />
        );
        const errorIndicatorAndRetry = (
            <>
                <i
                    className="icon icon-exclamation-circle icon-xs fas text-warning"
                    data-tip="Error: something went wrong while fetching statistics"
                />
                <button
                    type="button"
                    className="btn-xs btn-link btn text-secondary"
                    onClick={getStatistics}>
                    Retry?
                </button>
            </>
        );

        return (
            <div className="col-auto mb-4">
                <h2 className="text-larger">Data Overview</h2>
                <div className="card tsv-metadata-overview flex-row flex-wrap p-4">
                    <div>
                        <div className="tsv-metadata-stat-title text-smaller text-uppercase text-600">
                            Selected Files
                        </div>
                        <div className="tsv-metadata-stat">
                            {numSelectedFiles}
                        </div>
                    </div>
                    <div>
                        <div className="tsv-metadata-stat-title text-smaller text-uppercase text-600">
                            Selected Files Size
                        </div>
                        <div className="tsv-metadata-stat">
                            {loading && loadingIndicator}
                            {error && errorIndicatorAndRetry}
                            {selectedFileSize !== null &&
                                valueTransforms.bytesToLargerUnit(
                                    selectedFileSize
                                )}
                        </div>
                    </div>
                    <div>
                        <div className="tsv-metadata-stat-title text-smaller text-uppercase text-600">
                            Extra Files
                            <i
                                className="icon icon-info-circle fas ml-03"
                                data-tip="Extra files associated with selected files (e.g. index file of BAM (*.bai) or CRAM (*.crai)) are included in the download by default. These files are found in the manifest file."
                            />
                        </div>
                        <div className="tsv-metadata-stat">
                            {loading && loadingIndicator}
                            {error && errorIndicatorAndRetry}
                            {numExtraFiles}
                        </div>
                    </div>
                    <div>
                        <div className="tsv-metadata-stat-title text-smaller text-uppercase text-600">
                            Extra Files Size
                        </div>
                        <div className="tsv-metadata-stat">
                            {loading && loadingIndicator}
                            {error && errorIndicatorAndRetry}
                            {numExtraFiles !== null &&
                                valueTransforms.bytesToLargerUnit(
                                    extraFilesSize
                                )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
);

const ModalCodeSnippet = React.memo(function ModalCodeSnippet(props) {
    const { filename, session } = props;
    const htmlValue = (
        <pre className="mb-15 curl-command">
            cut -f 1,3 <b>~/Downloads/{filename}</b> | tail -n +4 | grep -v ^# |
            xargs -n 2 -L 1 sh -c &apos;curl -L
            {session ? (
                <>
                    <code style={{ opacity: 0.5 }}>
                        {' '}
                        --user <em>{'<access_key_id>:<access_key_secret>'}</em>
                    </code>{' '}
                    $0 --output $1&apos;
                </>
            ) : (
                " $0 --output $1'"
            )}
        </pre>
    );
    const plainValue =
        `cut -f 1,3 ~/Downloads/${filename} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'curl -L` +
        (session
            ? " --user <access_key_id>:<access_key_secret> $0 --output $1'"
            : " $0 --output $1'");

    return (
        <object.CopyWrapper
            value={plainValue}
            className="curl-command-wrapper mt-2"
            data-tip={'Click to copy'}
            wrapperElement="div"
            iconProps={{}}>
            {htmlValue}
        </object.CopyWrapper>
    );
});

/**
 * Use this button to download the tsv file metadata.
 *
 * Renders out a literal form (gets caught by App.js and serialized to JSON),
 * with 'accessions' (String[]) included in the POSTed form fields which identify the individual files to download.
 */
const SelectedItemsDownloadStartButton = React.memo(
    function SelectedItemsDownloadStartButton(props) {
        const {
            suggestedFilename,
            selectedItems,
            accessionArray = [],
            action,
        } = props;

        const { onClick } = useMemo(
            function () {
                /**
                 * We're going to consider download of metadata.tsv file to be akin to one step before the purchasing.
                 * Something they might download later...
                 */
                function onClick(evt) {
                    setTimeout(function () {
                        //analytics
                        const itemList = Array.from(selectedItems.values());
                        const extData = {
                            item_list_name: analytics.hrefToListName(
                                window && window.location.href
                            ),
                        };
                        const products = analytics.transformItemsToProducts(
                            itemList,
                            extData
                        );
                        const productsLength = Array.isArray(products)
                            ? products.length
                            : 0;
                        analytics.event(
                            'add_payment_info',
                            'SelectedFilesDownloadModal',
                            'Download metadata.tsv Button Pressed',
                            function () {
                                console.info(
                                    `Will download metadata.tsv having ${productsLength} items in the cart.`
                                );
                            },
                            {
                                items: Array.isArray(products)
                                    ? products
                                    : null,
                                payment_type: 'Metadata.tsv Download',
                                list_name: extData.item_list_name,
                                value: (products && products.length) || 0,
                                // filters: analytics.getStringifiedCurrentFilters((context && context.filters) || null)
                            }
                        );
                    }, 0);
                }

                return { onClick };
            },
            [selectedItems]
        );

        return (
            <form
                method="POST"
                action={action}
                className="d-inline-block d-block-xs-only">
                <input
                    type="hidden"
                    name="accessions"
                    value={JSON.stringify(accessionArray)}
                />
                <input
                    type="hidden"
                    name="download_file_name"
                    value={JSON.stringify(suggestedFilename)}
                />
                <input
                    type="hidden"
                    name="include_extra_files"
                    value={JSON.stringify(true)}
                />
                <button
                    type="submit"
                    name="Download"
                    onClick={onClick}
                    className="btn btn-primary mt-0 mr-1 btn-block-xs-only"
                    data-tip="Details for each individual selected file delivered via a TSV spreadsheet.">
                    <i className="icon icon-fw icon-download fas mr-1" />
                    Download Manifest
                </button>
            </form>
        );
    }
);
