import React, { useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import _ from 'underscore';
import { Modal } from 'react-bootstrap';

import {
    ajax,
    analytics,
    memoizedUrlParse,
    object,
    logger,
    JWT,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { display as dateTimeDisplay } from '@hms-dbmi-bgm/shared-portal-components/es/components/ui/LocalizedTime';
import { SelectedItemsController } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/SelectedItemsController';

import { EmbeddedItemSearchTable } from '../../../item-pages/components/EmbeddedItemSearchTable';

export const BenchmarkingTableController = (props) => {
    // Mostly serves as an intermediary/wrapper HOC to make selectedItemsController methods
    // and props available in BenchmarkingTable's aboveTableComponent
    const { searchHref, schemas, facets, session, href, context } = props;

    // TODO: maybe create benchmarking-specific columnExtensionMap/columns in future...
    const columnExtensionMap =
        EmbeddedItemSearchTable.defaultProps.columnExtensionMap;

    return (
        <SelectedItemsController
            {...{ context, href, columnExtensionMap }}
            currentAction={'multiselect'}>
            <BenchmarkingTable
                {...{
                    session,
                    searchHref,
                    schemas,
                    href,
                    context,
                    facets,
                    columnExtensionMap,
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
        children,
        href,
        context,
        columnExtensionMap,
        selectedItems, // From SelectedItemsController
        onSelectItem, // From SelectedItemsController
        onResetSelectedItems, // From SelectedItemsController
    } = props;
    return (
        <EmbeddedItemSearchTable
            aboveTableComponent={
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
                columnExtensionMap,
            }}
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
                        {...{ searchHref, href, context }}
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
        const { totalFilesCount } = this.props;
        if (!totalFilesCount) return true;
        if (totalFilesCount > SELECT_ALL_LIMIT) return false;
        return true;
    }

    isAllSelected() {
        const { totalFilesCount, selectedItems } = this.props;
        if (!totalFilesCount) return false;
        // totalFilesCount as returned from bar plot aggs at moment is unique.
        if (totalFilesCount === selectedItems.size) {
            return true;
        }
        return false;
    }

    handleSelectAll(evt) {
        const {
            href,
            searchHref,
            onSelectItem,
            selected,
            onResetSelectedItems,
            context,
            totalFilesCount,
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
                console.log('searchHref', searchHref);
                console.log('href', href);

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

                    // //analytics: TODO: maybe adjust and re-add in future
                    // const extData = {
                    //     item_list_name: analytics.hrefToListName(
                    //         window && window.location.href
                    //     ),
                    // };
                    // const products = analytics.transformItemsToProducts(
                    //     allExtendedFiles,
                    //     extData
                    // );
                    // const productsLength = Array.isArray(products)
                    //     ? products.length
                    //     : allExtendedFiles.length;
                    // analytics.event(
                    //     'add_to_cart',
                    //     'SelectAllFilesButton',
                    //     'Select All',
                    //     function () {
                    //         console.info(
                    //             `Adding ${productsLength} items from cart.`
                    //         );
                    //     },
                    //     {
                    //         items: Array.isArray(products) ? products : null,
                    //         list_name: extData.item_list_name,
                    //         value: productsLength,
                    //         filters: analytics.getStringifiedCurrentFilters(
                    //             (context && context.filters) || null
                    //         ),
                    //     }
                    // );
                });
            } else {
                onResetSelectedItems();
                this.setState({ selecting: false });
            }
        });
    }

    render() {
        const { selecting } = this.state;
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
            (isAllSelected ? 'btn-outline-secondary' : 'btn-secondary');
        const tooltip =
            !isAllSelected && !isEnabled
                ? `"Select All" is disabled since the total file count exceeds the upper limit: ${SELECT_ALL_LIMIT}`
                : null;

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
        filenamePrefix: 'smaht_metadata_',
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
        const { analyticsAddItemsToCart = false, itemCountUnique, selectedItems = {}, context } = props;
        if (!analyticsAddItemsToCart){
            return;
        }

        // const itemList = _.keys(selectedItems).map(function(accessionTripleString){
        //     return selectedItems[accessionTripleString];
        // });
        const itemList = Array.from(selectedItems.values());
        //analytics
        const extData = { item_list_name: analytics.hrefToListName(window && window.location.href) };
        const products = analytics.transformItemsToProducts(itemList, extData);
        const productsLength = Array.isArray(products) ? products.length : itemList.length;
        analytics.event(
            "begin_checkout",
            "SelectedFilesDownloadModal",
            "Mounted",
            function() { console.info(`Will download ${productsLength} items in the cart.`); },
            {
                items: Array.isArray(products) ? products : null,
                list_name: extData.item_list_name,
                value: itemCountUnique || itemList.length || 0,
                filters: analytics.getStringifiedCurrentFilters((context && context.filters) || null)
            }
        );
    }, []);

    const suggestedFilename =
        filenamePrefix +
        dateTimeDisplay(new Date(), 'date-time-file', '-', false) +
        '.tsv';
    const userInfo = JWT.getUserInfo();
    const profileHref =
        (session &&
            userInfo.user_actions &&
            _.findWhere(userInfo.user_actions, { id: 'profile' }).href) ||
        '/me';

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

    return (
        <Modal
            show
            className="batch-files-download-modal"
            onHide={onHide}
            bsSize="large">
            <Modal.Header closeButton>
                <Modal.Title>
                    <span className="text-400">
                        Download{' '}
                        <span className="text-600">{selectedItems.length}</span>{' '}
                        Files
                    </span>
                </Modal.Title>
            </Modal.Header>

            <Modal.Body>
                <div className="important-notes-section">
                    <h4 className="mb-07 text-500">Important</h4>
                    <ul>
                        <li className="mb-05">
                            <span className="text-danger">
                                You must include an <b>access key</b> in your
                                cURL command for bulk downloads.
                            </span>
                        </li>
                        <li className="mb-05">
                            You can configure the access key in{' '}
                            {session ? (
                                <a
                                    href={profileHref}
                                    target="_blank"
                                    rel="noopener noreferrer">
                                    your profile
                                </a>
                            ) : (
                                'your profile'
                            )}
                            , then use it in place of{' '}
                            <em>{'<access_key_id>:<access_key_secret>'}</em>,
                            below.
                        </li>
                        {!session ? (
                            <li>
                                {
                                    "If you don't already have an account, you can "
                                }
                                <a
                                    onClick={onLoginNavItemClick}
                                    href="#loginbtn">
                                    log in
                                </a>
                                {' with your Google or GitHub credentials.'}
                            </li>
                        ) : null}
                    </ul>
                </div>
                <p>
                    Please press the &quot;Download&quot; button below to save
                    the metadata TSV file which contains download URLs and other
                    information for the selected files.
                </p>
                <p>
                    Once you have saved the metadata TSV, you may download the
                    files on any machine or server with the following cURL
                    command:
                </p>
                <ModalCodeSnippet
                    filename={suggestedFilename}
                    session={session}
                />

                <SelectedItemsDownloadStartButton
                    {...{
                        selectedItems,
                        suggestedFilename,
                        action,
                    }}
                />

                <button
                    type="reset"
                    onClick={onHide}
                    className="btn btn-outline-dark mt-1 btn-block-xs-only">
                    Cancel
                </button>
            </Modal.Body>
        </Modal>
    );
};

const ModalCodeSnippet = React.memo(function ModalCodeSnippet(props) {
    const { filename, session } = props;
    const htmlValue = (
        <pre className="mb-15 curl-command">
            cut -f 1 <b>{filename}</b> | tail -n +3 | grep -v ^# | xargs -n 1
            curl -O -L
            {session ? (
                <code style={{ opacity: 0.5 }}>
                    {' '}
                    --user <em>{'<access_key_id>:<access_key_secret>'}</em>
                </code>
            ) : null}
        </pre>
    );
    const plainValue =
        `cut -f 1 ${filename} | tail -n +3 | grep -v ^# | xargs -n 1 curl -O -L` +
        (session ? ' --user <access_key_id>:<access_key_secret>' : '');
    return (
        <object.CopyWrapper
            value={plainValue}
            className="curl-command-wrapper"
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
        const { suggestedFilename, selectedItems, action } = props;

        const { accessionArray, onClick } = useMemo(
            function () {
                // Flatten selected items into an array (currently a set, I believe)
                console.log('selectedItems', selectedItems);

                const itemAtIds = Array.from(selectedItems.keys());
                console.log('itemAtIds', itemAtIds);

                const accessionArray = [];

                itemAtIds.forEach((atId) => {
                    const value = selectedItems.get(atId);

                    if (value?.accession) {
                        accessionArray.push(value.accession);
                    } else {
                        throw new Error('File Item without accession found!');
                    }
                });

                /**
                 * We're going to consider download of metadata.tsv file to be akin to one step before the purchasing.
                 * Something they might download later...
                 */
                function onClick(evt) {
                    setTimeout(function () {
                        //analytics
                        const itemList = Array.from(selectedItems.values());
                        const extData = {
                            item_list_name: analytics.hrefToListName(window && window.location.href)
                        };
                        const products = analytics.transformItemsToProducts(itemList, extData);
                        const productsLength = Array.isArray(products) ? products.length : 0;
                        analytics.event(
                            "add_payment_info",
                            "SelectedFilesDownloadModal",
                            "Download metadata.tsv Button Pressed",
                            function () { console.info(`Will download metadata.tsv having ${productsLength} items in the cart.`); },
                            {
                                items: Array.isArray(products) ? products : null,
                                payment_type: "Metadata.tsv Download",
                                list_name: extData.item_list_name,
                                value: products && products.length || 0,
                                // filters: analytics.getStringifiedCurrentFilters((context && context.filters) || null)
                            }
                        );
                    }, 0);
                }

                return { accessionArray, onClick };
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
                <button
                    type="submit"
                    name="Download"
                    onClick={onClick}
                    className="btn btn-primary mt-1 mr-1 btn-block-xs-only"
                    // onClick={onClick} // TODO: re-add onclick to handle analytics move-to-cart
                    data-tip="Details for each individual selected file delivered via a TSV spreadsheet.">
                    <i className="icon icon-fw icon-file-alt fas mr-1" />
                    Download metadata for files
                </button>
            </form>
        );
    }
);
