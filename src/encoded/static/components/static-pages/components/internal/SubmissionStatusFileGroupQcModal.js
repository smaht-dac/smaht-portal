'use strict';

import React from 'react';
import Modal from 'react-bootstrap/esm/Modal';
import Form from 'react-bootstrap/Form';
import Tab from 'react-bootstrap/Tab';
import Tabs from 'react-bootstrap/Tabs';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

import {
    createBadge,
    fallbackCallback,
    formatQcValue,
    getQcBagdeType,
} from './submissionStatusUtils';

class FileGroupQCModalComponent extends React.PureComponent {
    constructor(props) {
        super(props);
        this.props = props;
        this.state = {
            initialLoading: true,
            loading: false,
            currentFileSet: this.props.fileSet,
            allFileSets: {},
            visibleFileSets: [this.props.fileSet.uuid],
            isUserAdmin: this.props.isUserAdmin,
            submittedFiles: [],
            processedFiles: [],
            parentReloadNecessary: false,
        };
        console.log(this.state.currentFileSet);
    }

    componentDidMount() {
        this.getData();
    }

    getData = () => {
        const payload = {
            fileSetUuid: this.state.currentFileSet.uuid,
            fileGroup: this.state.currentFileSet.file_group,
        };

        ajax.load(
            '/get_file_group_qc/',
            (resp) => {
                if (resp.error) {
                    console.error(resp.error);
                    return;
                }
                const allFileSets = {};
                const files = resp.files_with_qcs;
                // We need to reformat the QC values so that we have fast access to
                // individual values
                files.forEach((file) => {
                    file['qc_values_dict'] = this.reformatQcValues(
                        file.quality_metric?.qc_values
                    );
                    allFileSets[file.fileset_uuid] = {
                        uuid: file.fileset_uuid,
                        tags: file.fileset_tags,
                        submitted_id: file.fileset_submitted_id,
                    };
                });

                const submittedFiles = files.filter(
                    (file) => !file.is_output_file
                );
                const processedFiles = files.filter(
                    (file) => file.is_output_file
                );

                console.log(processedFiles);
                console.log(allFileSets);
                this.setState({
                    initialLoading: false,
                    submittedFiles: submittedFiles,
                    processedFiles: processedFiles,
                    allFileSets: allFileSets,
                });
            },
            'POST',
            fallbackCallback,
            JSON.stringify(payload)
        );
    };

    // We need to index the qc values from the portal by derived_from for efficient access
    reformatQcValues = (qcValues) => {
        const result = {};
        qcValues.forEach((qcValue) => {
            result[qcValue.derived_from] = qcValue;
        });
        return result;
    };

    toggleTag = (fileSetUuid, tag) => {
        const allFileSets = JSON.parse(JSON.stringify(this.state.allFileSets));
        const currentFileSetTags = allFileSets[fileSetUuid]['tags'];
        if (currentFileSetTags.includes(tag)) {
            const index = currentFileSetTags.indexOf(tag);
            currentFileSetTags.splice(index, 1);
        } else {
            currentFileSetTags.push(tag);
        }
        const payload = {
            tags: currentFileSetTags,
        };
        this.setState(
            (prevState) => ({
                loading: true,
            }),
            function () {
                ajax.load(
                    fileSetUuid,
                    (resp) => {
                        if (resp.status !== 'success') {
                            console.error(resp);
                            return;
                        } else {
                            this.setState({
                                allFileSets: allFileSets,
                                parentReloadNecessary: true,
                                loading: false,
                            });
                        }
                    },
                    'PATCH',
                    fallbackCallback,
                    JSON.stringify(payload)
                );
            }
        );
    };

    getFileSetTags = (filesetUuid) => {
        const relevantTags = ['reviewed', 'ready_to_release'];
        const filesetStatusTags = relevantTags.map((tag) => {
            const fileSetTags = this.state.allFileSets[filesetUuid]['tags'];
            const badgeType =
                fileSetTags && fileSetTags.includes(tag) ? 'info' : 'lighter';

            const cn = 'badge clickable mx-1 badge-' + badgeType;
            return (
                <span
                    className={cn}
                    onClick={() => this.toggleTag(filesetUuid, tag)}>
                    {tag}
                </span>
            );
        });
        return filesetStatusTags;
    };

    getQcTable = (files) => {
        if (files.length === 0) {
            return (
                <div className="text-center m-4">
                    There are no files to display.
                </div>
            );
        }

        // Get list of all occuring qc values
        const qc_value_derived_from_list = [];
        const qc_value_derived_from_to_key = {};
        files.forEach((file) => {
            const qc_values = file.quality_metric?.qc_values;
            qc_values.forEach((qc_value) => {
                const df = qc_value.derived_from;
                qc_value_derived_from_list.push(df);
                qc_value_derived_from_to_key[df] = qc_value.key;
            });
        });
        const qc_value_derived_from_list_unique = [
            ...new Set(qc_value_derived_from_list),
        ];

        const loadingSymbol = this.state.loading ? (
            <i className="icon icon-fw fas icon-spinner icon-spin mr-1"></i>
        ) : (
            ''
        );

        // Table header construction
        const header = [
            <th>
                <div className="d-flex justify-content-between">
                    <div>QC value</div>
                    <div>{loadingSymbol}</div>
                </div>
            </th>,
        ];
        let numTableColumns = 1;
        files.forEach((file) => {
            if(!this.state.visibleFileSets.includes(file.fileset_uuid)){
                return;
            }
            const tags = this.state.isUserAdmin
                ? this.getFileSetTags(file.fileset_uuid)
                : '';
            header.push(
                <th>
                    {file.display_title}
                    <br />
                    <small className="text-wrap">
                        {file.fileset_submitted_id}
                    </small>
                    <br />
                    <span className="text-wrap">{tags}</span>
                </th>
            );
            numTableColumns++;
        });

        // Table body construction
        const body = [];
        qc_value_derived_from_list_unique.forEach((qc_derived_from) => {
            const qc_key = qc_value_derived_from_to_key[qc_derived_from];
            const row = [<td className="text-left">{qc_key}</td>];
            files.forEach((file) => {
                if(!this.state.visibleFileSets.includes(file.fileset_uuid)){
                    return;
                }
                if (!file.qc_values_dict.hasOwnProperty(qc_derived_from)) {
                    row.push(<td></td>);
                    return;
                }
                const qc_value = file.qc_values_dict[qc_derived_from];
                let badge = '';
                if (qc_value.hasOwnProperty('flag')) {
                    const flag = qc_value['flag'];
                    const badgeType = getQcBagdeType(flag);
                    badge = createBadge(badgeType, flag);
                }

                row.push(
                    <td>
                        <span className="px-1">
                            {formatQcValue(qc_value.value)}
                        </span>
                        {badge}
                    </td>
                );
            });
            body.push(<tr>{row}</tr>);
        });

        // We prefer the sticky table header, but that does not allow for a responsive table
        // Switch to a responsive table when there are too many columns
        if (numTableColumns < 5) {
            return (
                <table className="table table-hover table-striped table-bordered table-sm">
                    <thead className="sticky-top ss-qc-review-fixed-thead">
                        <tr>{header}</tr>
                    </thead>
                    <tbody>{body}</tbody>
                </table>
            );
        } else {
            return (
                <div class="table-responsive">
                    <table className="table table-hover table-striped table-bordered table-sm">
                        <thead>
                            <tr>{header}</tr>
                        </thead>
                        <tbody>{body}</tbody>
                    </table>
                </div>
            );
        }
    };

    toggleFileset = (e, uuid) => {
        const visibleFileSets = JSON.parse(JSON.stringify(this.state.visibleFileSets));
        const index = visibleFileSets.indexOf(uuid);
        if (index === -1) {
            visibleFileSets.push(uuid);
        } else {
            visibleFileSets.splice(index, 1);
        }
        this.setState({
            visibleFileSets: visibleFileSets
        });
    }

    hideModal = () => {
        this.props.closeModal(null, this.state.parentReloadNecessary);
    };

    getModal(modelBody) {
        return (
            <Modal show size="xl" onHide={this.hideModal}>
                <Modal.Header closeButton>
                    <Modal.Title>Review File Group QC</Modal.Title>
                </Modal.Header>
                <Modal.Body>{modelBody}</Modal.Body>
            </Modal>
        );
    }

    render() {
        const { currentFileSet, submittedFiles, processedFiles } = this.state;
        const submittedFilesTable = this.getQcTable(submittedFiles);
        const processedFilesTable = this.getQcTable(processedFiles);

        if (this.state.initialLoading) {
            const modalBody = (
                <div className="p-5 text-center">
                    <i className="icon icon-fw fas icon-spinner icon-spin mr-1"></i>
                    Loading
                </div>
            );
            return this.getModal(modalBody);
        }

        const targeCoverage =
            currentFileSet.sequencing?.target_coverage || 'NA';

        const assays = currentFileSet.libraries?.map((lib) => {
            const assay = lib.assay?.display_title;
            return <span key={assay}>{assay}</span>;
        });

        const filesetList = Object.keys(this.state.allFileSets).map((uuid) => {
            const fs = this.state.allFileSets[uuid];
            const isChecked = fs["uuid"] === this.state.currentFileSet.uuid;
            return (
                <li key={fs["uuid"]}>
                    <Form.Check
                        defaultChecked={isChecked}
                        type="checkbox"
                        id={fs["submitted_id"]}
                        label={fs["submitted_id"]}
                        onChange={(e) => this.toggleFileset(e, uuid)}
                    />
                </li>
            );
        });

        const modalBody = (
            <div>
                <ul>
                    <li key="ssfgm-fg">
                        <strong>File group:</strong>{' '}
                        {currentFileSet.file_group_str}
                    </li>
                    <li key="ssfgm-seq">
                        <strong>Sequencer:</strong>{' '}
                        {currentFileSet.sequencing?.sequencer?.display_title}{' '}
                        (Target coverage: <strong>{targeCoverage}x</strong>)
                    </li>
                    <li key="ssfgm-assay">
                        <strong>Assay:</strong> {assays}
                    </li>
                    <li key="ssfgm-filesets">
                        <strong>Filesets:</strong>
                        <ul className="ss-fileset-list list-unstyled font-weight-normal">
                            {filesetList}
                        </ul>
                    </li>
                </ul>
                <Tabs
                    defaultActiveKey="processed-files"
                    id="uncontrolled-tab-example"
                    className="my-3">
                    <Tab eventKey="processed-files" title="Processed files">
                        {processedFilesTable}
                    </Tab>
                    <Tab eventKey="submitted-files" title="Submitted files">
                        {submittedFilesTable}
                    </Tab>
                </Tabs>
            </div>
        );
        return this.getModal(modalBody);
    }
}

export const FileGroupQCModal = React.memo(function FileGroupQCModal(props) {
    return <FileGroupQCModalComponent {...props} />;
});
