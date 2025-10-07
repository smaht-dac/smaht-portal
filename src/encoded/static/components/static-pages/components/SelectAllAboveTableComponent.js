import React, { useState, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import _ from 'underscore';
import { Modal, Tabs, Tab, OverlayTrigger } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';

import {
    renderLoginAccessPopover,
    renderProtectedAccessPopover,
} from '../../item-pages/PublicDonorView';

import {
    ajax,
    analytics,
    memoizedUrlParse,
    object,
    logger,
    valueTransforms,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { display as dateTimeDisplay } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { useUserDownloadAccess } from '../../util/hooks';

export const SelectAllAboveTableComponent = (props) => {
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
        deniedAccessPopoverType = 'login', // default to login popover
    } = props;
    const { filters: ctxFilters = null, total: totalResultCount = 0 } =
        context || {};

    // Get user download access
    const userDownloadAccess = useUserDownloadAccess(session);

    // Determine if a user can download this table's files
    const canDownloadFiles =
        (deniedAccessPopoverType === 'protected' &&
            userDownloadAccess['protected']) ||
        (deniedAccessPopoverType === 'login' && userDownloadAccess['open']);

    const selectedFileProps = {
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    };

    return (
        <div className="d-flex w-100 mb-05">
            <div className="col-auto ms-0 ps-0">
                <span className="text-400" id="results-count">
                    {totalResultCount}
                </span>{' '}
                Results
            </div>
            <div className="ms-auto col-auto me-0 d-flex pe-0">
                <SelectAllFilesButton {...selectedFileProps} {...{ context }} />
                {/* Show popover if user has the access needed for this table */}
                {canDownloadFiles ? (
                    <SelectedItemsDownloadButton
                        id="download_tsv_multiselect"
                        disabled={selectedItems.size === 0}
                        className="download-button btn btn-primary btn-sm me-05 align-items-center"
                        {...{ selectedItems, session }}
                        analyticsAddItemsToCart>
                        <i className="icon icon-download fas me-03" />
                        Download {selectedItems.size} Selected Files
                    </SelectedItemsDownloadButton>
                ) : (
                    <OverlayTrigger
                        trigger={['hover', 'focus']}
                        placement="top"
                        overlay={
                            deniedAccessPopoverType === 'login' ? (
                                renderLoginAccessPopover()
                            ) : deniedAccessPopoverType === 'protected' ? (
                                renderProtectedAccessPopover()
                            ) : (
                                <></>
                            )
                        }>
                        <button
                            className="download-button btn btn-primary btn-sm me-05 align-items-center pe-auto download-button"
                            disabled={true}>
                            <i className="icon icon-download fas me-03" />
                            Download {selectedItems.size} Selected Files
                        </button>
                    </OverlayTrigger>
                )}
            </div>
        </div>
    );
};

const SELECT_ALL_LIMIT = 8000;

const manifest_enum_map = [
    'file',
    'clinical',
    'biosample',
    'experiment',
    'analyte',
    'sequencing',
];

export class SelectAllFilesButton extends React.PureComponent {
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
        'file_sets',
    ];

    constructor(props) {
        super(props);
        this.isAllSelected = this.isAllSelected.bind(this);
        this.handleSelectAll = this.handleSelectAll.bind(this);
        this.state = { selecting: false };
    }

    isEnabled() {
        const { context } = this.props;
        const { total } = context || {};

        if (!total) return true;
        if (total > SELECT_ALL_LIMIT) return false;
        return true;
    }

    isAllSelected() {
        const { selectedItems, context } = this.props;
        const { total } = context || {};

        if (!total) return false;
        if (total === selectedItems.size) {
            return true;
        }
        return false;
    }

    handleSelectAll(evt) {
        const {
            context: { '@id': searchHref } = {},
            onSelectItem,
            onResetSelectedItems,
        } = this.props;

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
            'me-05 icon icon-fw icon-' +
            (selecting
                ? 'circle-notch icon-spin fas'
                : isAllSelected
                ? 'square far'
                : 'check-square far');
        const cls =
            'btn btn-sm me-05 align-items-center ' +
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

    const [isAWSDownload, setIsAWSDownload] = useState(false);

    // If any of the selected items have file_sets, show additional manifest buttons
    const showAdditionalManifestButtons = Array.from(
        selectedItems.values()
    ).some((item) => item?.file_sets?.length > 0);

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
                list_name: `${extData.item_list_name} (${
                    isAWSDownload ? 'AWS CLI' : 'cURL'
                })`,
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
                            items: Array.isArray(products) ? products : null,
                            payment_type: 'Metadata.tsv Download',
                            list_name: `${extData.item_list_name} (${
                                isAWSDownload ? 'AWS CLI' : 'cURL'
                            })`,
                            value: (products && products.length) || 0,
                            // filters: analytics.getStringifiedCurrentFilters((context && context.filters) || null)
                        }
                    );
                }, 0);
            }

            return { onClick };
        },
        [selectedItems, isAWSDownload]
    );

    return (
        <Modal
            show
            className="batch-files-download-modal"
            onHide={onHide}
            size="lg">
            <Modal.Header closeButton>
                <Modal.Title className="ps-2 d-flex align-items-center">
                    <img
                        className="me-1"
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
                    <ul className="ps-2">
                        <li className="mb-1">
                            <strong>Data Use:</strong> Please read the{' '}
                            <a
                                href="https://smaht.org/policies/"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="link-underline-hover">
                                SMaHT Data Use Policy
                            </a>{' '}
                            for the use of open- and protected-access data.
                        </li>
                        <li>
                            <strong>Publication:</strong> Please read the{' '}
                            <a
                                href="https://smaht.org/policies/"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="link-underline-hover">
                                SMaHT Publication Policy
                            </a>
                            .
                        </li>
                    </ul>
                </div>
                <DataDownloadOverviewStats
                    {...{ accessionArray }}
                    numSelectedFiles={selectedItems.size}
                />
                <div className="col-auto mb-4">
                    <h2 className="text-larger">
                        <i className="fas icon-exclamation-triangle text-danger me-1" />{' '}
                        Important Reminders
                    </h2>
                    <hr className="my-2" />
                    <ul className="ps-2">
                        <li className="mb-1">
                            You{' '}
                            <span className="text-600">
                                must include an access key in your cURL or AWS
                                CLI command
                            </span>{' '}
                            for bulk downloads.
                        </li>
                        <li className="mb-1">
                            You can configure the access key in your profile,
                            then use it in place of
                            <span className="text-danger text-600">
                                {' '}
                                &lt;access_key_id&gt;:&lt;access_key_secret&gt;
                            </span>
                            , below.
                        </li>
                        <li className="mb-1">
                            Important information about the manifest file can be
                            found{' '}
                            <a
                                href="/docs/user-guide/manifest"
                                target="_blank"
                                rel="noreferrer noopener"
                                className="link-underline-hover">
                                here
                            </a>
                            .
                        </li>
                    </ul>
                </div>
                <div className="col-auto mb-4">
                    <h2 className="text-larger">Instructions for Download</h2>
                    <hr className="my-2" />
                    <ol className="ps-2">
                        <li className="mb-1">
                            Please press the &quot;Download&quot; button below
                            to save the manifest file which contains download
                            URLs and other information for the selected files.
                        </li>
                        <li>
                            Once you have saved the manifest you may download
                            the files on any machine or server with the
                            following <b>cURL or AWS CLI</b> command:
                        </li>
                    </ol>
                    <p className="disclaimer">
                        <span>
                            <b>Note:</b>
                        </span>{' '}
                        AWS CLI requires an additional package download, find
                        instructions{' '}
                        <a
                            href="/docs/access/how-to-download-files#downloading-files-with-the-aws-cli"
                            target="_blank"
                            className="link-underline-hover">
                            here
                        </a>
                        .
                    </p>
                    <ModalCodeSnippets
                        filename={suggestedFilename}
                        session={session}
                        isAWSDownload={isAWSDownload}
                        setIsAWSDownload={setIsAWSDownload}
                    />
                </div>
                {showAdditionalManifestButtons && (
                    <div className="col-auto mb-4">
                        <h2 className="text-larger">
                            Download Additional Metadata Files
                        </h2>
                        <hr className="my-2" />
                        <div className="additonal-manifest-buttons d-flex gap-2 flex-wrap">
                            {/* Biosample manifest download */}
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
                                    value={JSON.stringify(
                                        suggestedFilename.split('.tsv')[0] +
                                            `_${manifest_enum_map[2]}.tsv`
                                    )}
                                />
                                <input
                                    type="hidden"
                                    name="include_extra_files"
                                    value={JSON.stringify(false)}
                                />
                                <input
                                    type="hidden"
                                    name="manifest_enum"
                                    value={2}
                                />
                                <button
                                    type="submit"
                                    name="Download"
                                    className="btn btn-outline-secondary mt-0"
                                    data-tip="Details for each individual selected file delivered via a TSV spreadsheet.">
                                    <i className="icon icon-fw icon-download fas me-1" />
                                    Biosample
                                </button>
                            </form>

                            {/* Analyte manifest download */}
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
                                    value={JSON.stringify(
                                        suggestedFilename.split('.tsv')[0] +
                                            `_${manifest_enum_map[4]}.tsv`
                                    )}
                                />
                                <input
                                    type="hidden"
                                    name="include_extra_files"
                                    value={JSON.stringify(false)}
                                />
                                <input
                                    type="hidden"
                                    name="manifest_enum"
                                    value={4}
                                />
                                <button
                                    type="submit"
                                    name="Download"
                                    className="btn btn-outline-secondary mt-0"
                                    data-tip="Details for each individual selected file delivered via a TSV spreadsheet.">
                                    <i className="icon icon-fw icon-download fas me-1" />
                                    Analyte
                                </button>
                            </form>

                            {/* Sequencing manifest download */}
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
                                    value={JSON.stringify(
                                        suggestedFilename.split('.tsv')[0] +
                                            `_${manifest_enum_map[5]}.tsv`
                                    )}
                                />
                                <input
                                    type="hidden"
                                    name="include_extra_files"
                                    value={JSON.stringify(false)}
                                />
                                <input
                                    type="hidden"
                                    name="manifest_enum"
                                    value={5}
                                />
                                <button
                                    type="submit"
                                    name="Download"
                                    className="btn btn-outline-secondary mt-0"
                                    data-tip="Details for each individual selected file delivered via a TSV spreadsheet.">
                                    <i className="icon icon-fw icon-download fas me-1" />
                                    Sequencing
                                </button>
                            </form>
                        </div>
                    </div>
                )}
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
                        isAWSDownload,
                        onClick,
                    }}
                />
            </Modal.Footer>
        </Modal>
    );
};

const DataDownloadOverviewStats = React.memo(function DataDownloadOverviewStats(
    props
) {
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
        console.log('DataDownloadOverviewStats error', resp);
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
                    <div className="tsv-metadata-stat">{numSelectedFiles}</div>
                </div>
                <div>
                    <div className="tsv-metadata-stat-title text-smaller text-uppercase text-600">
                        Selected Files Size
                    </div>
                    <div className="tsv-metadata-stat">
                        {loading && loadingIndicator}
                        {error && errorIndicatorAndRetry}
                        {selectedFileSize !== null &&
                            valueTransforms.bytesToLargerUnit(selectedFileSize)}
                    </div>
                </div>
                <div>
                    <div className="tsv-metadata-stat-title text-smaller text-uppercase text-600">
                        Extra Files
                        <i
                            className="icon icon-info-circle fas ms-03"
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
                            valueTransforms.bytesToLargerUnit(extraFilesSize)}
                    </div>
                </div>
            </div>
        </div>
    );
});

const ModalCodeSnippets = React.memo(function ModalCodeSnippets(props) {
    const { filename, session, setIsAWSDownload, isAWSDownload } = props;

    // Assign html and plain values for each command
    const aws_cli = {
        htmlValue: (
            <pre className="aws_cli-command mb-15">
                cut -f 1,3 <b>{filename}</b> | tail -n +4 | grep -v ^# | xargs
                -n 2 -L 1 sh -c &#39;credentials=$&#40;curl -s -L
                {session ? (
                    <>
                        <code>
                            {' '}
                            -&#8288;-&#8288;user{' '}
                            <span className="text-danger text-600">
                                {'<access_key_id>:<access_key_secret>'}
                            </span>
                        </code>{' '}
                    </>
                ) : (
                    ''
                )}
                {''}
                &quot;$0&quot; | jq -r &quot;.download_credentials |
                &#123;AccessKeyId, SecretAccessKey, SessionToken,
                download_url&#125;&quot;&#41; && export
                AWS_ACCESS_KEY_ID=$&#40;echo $credentials | jq -r
                &quot;.AccessKeyId&quot;&#41; && export
                AWS_SECRET_ACCESS_KEY=$&#40;echo $credentials | jq -r
                &quot;.SecretAccessKey&quot;&#41; && export
                AWS_SESSION_TOKEN=$&#40;echo $credentials | jq -r
                &quot;.SessionToken&quot;&#41; && download_url=$&#40;echo
                $credentials | jq -r &quot;.download_url&quot;&#41; && aws s3 cp
                &quot;$download_url&quot; &quot;$1&quot;&#39;
            </pre>
        ),
        plainValue: `cut -f 1,3 ${filename} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'credentials=$(curl -s -L --user ${
            session ? '<access_key_id>:<access_key_secret>' : ''
        } "$0" | jq -r ".download_credentials | {AccessKeyId, SecretAccessKey, SessionToken, download_url}") && export AWS_ACCESS_KEY_ID=$(echo $credentials | jq -r ".AccessKeyId") && export AWS_SECRET_ACCESS_KEY=$(echo $credentials | jq -r ".SecretAccessKey") && export AWS_SESSION_TOKEN=$(echo $credentials | jq -r ".SessionToken") && download_url=$(echo $credentials | jq -r ".download_url") && aws s3 cp "$download_url" "$1"'`,
    };
    const curl = {
        htmlValue: (
            <pre className="mb-15 curl-command">
                cut -f 1,3 <b>~/Downloads/{filename}</b> | tail -n +4 | grep -v
                ^# | xargs -n 2 -L 1 sh -c &apos;curl -L
                {session ? (
                    <>
                        <code>
                            {' '}
                            -&#8288;-&#8288;user{' '}
                            <span className="text-danger text-600">
                                {'<access_key_id>:<access_key_secret>'}
                            </span>
                        </code>{' '}
                        $0 --output $1&apos;
                    </>
                ) : (
                    " $0 --output $1'"
                )}
            </pre>
        ),
        plainValue:
            `cut -f 1,3 ~/Downloads/${filename} | tail -n +4 | grep -v ^# | xargs -n 2 -L 1 sh -c 'curl -L` +
            (session
                ? " --user <access_key_id>:<access_key_secret> $0 --output $1'"
                : " $0 --output $1'"),
    };

    return (
        <div className="code-snippet-container">
            <Tabs
                defaultActiveKey="curl"
                variant="pills"
                onSelect={(k) => {
                    setIsAWSDownload(k === 'aws');
                }}>
                <Tab
                    eventKey="curl"
                    title={
                        <div className="radio-button-group d-flex">
                            <input
                                type="radio"
                                name="curl"
                                id="curl"
                                checked={!isAWSDownload}
                                readOnly
                            />
                            <label className="ms-1">cURL</label>
                        </div>
                    }>
                    <object.CopyWrapper
                        value={curl.plainValue}
                        className="curl-command-wrapper"
                        data-tip={'Click to copy'}
                        wrapperElement="div"
                        iconProps={{}}>
                        {curl.htmlValue}
                    </object.CopyWrapper>
                </Tab>
                <Tab
                    eventKey="aws"
                    title={
                        <>
                            <div className="radio-button-group d-flex">
                                <input
                                    type="radio"
                                    name="aws_cli"
                                    id="aws_cli"
                                    checked={isAWSDownload}
                                    onChange={() => setIsAWSDownload(true)}
                                    readOnly
                                />
                                <label className="ms-1">
                                    AWS CLI{' '}
                                    <span className="badge">faster</span>
                                </label>
                            </div>
                        </>
                    }>
                    <object.CopyWrapper
                        value={aws_cli.plainValue}
                        className="curl-command-wrapper"
                        data-tip={'Click to copy'}
                        wrapperElement="div"
                        iconProps={{}}>
                        {aws_cli.htmlValue}
                    </object.CopyWrapper>
                </Tab>
            </Tabs>
        </div>
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
            isAWSDownload,
            onClick,
        } = props;

        return (
            <>
                <form
                    method="POST"
                    action={action}
                    className="d-inline-block d-block-xs-only">
                    {isAWSDownload && (
                        <input type="hidden" name="cli" value="True" />
                    )}
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
                        className="btn btn-primary mt-0 me-1 btn-block-xs-only"
                        data-tip="Details for each individual selected file delivered via a TSV spreadsheet.">
                        <i className="icon icon-fw icon-download fas me-1" />
                        Download <b>
                            {isAWSDownload ? 'AWS CLI ' : 'cURL'}
                        </b>{' '}
                        File Manifest
                    </button>
                </form>
            </>
        );
    }
);
