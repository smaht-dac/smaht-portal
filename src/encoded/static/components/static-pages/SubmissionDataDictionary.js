import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import Select from 'react-select';

// Renders a table of schema properties
const SchemaPropertiesTable = ({ data = {} }) => {
    // sort the keys based on requirement
    const sortedPropertyKeys = Object.keys(data).sort((a, b) => {
        return data[a]?.is_required ? -1 : 1;
    });

    return sortedPropertyKeys.length > 0 ? (
        <table className="table table-bordered table-striped">
            <thead className="thead-smaht">
                <tr>
                    <th className="text-left">Metadata Property</th>
                    <th className="text-left">Description</th>
                    <th className="text-left">Type</th>
                    <th className="text-left">Pattern</th>
                    <th className="text-left">Also Requires</th>
                    <th className="text-left">LinkTo</th>
                    <th className="text-left">Note</th>
                </tr>
            </thead>
            <tbody>
                {sortedPropertyKeys.map((propertyKey, i) => {
                    const item = data[propertyKey];
                    return (
                        <tr key={i}>
                            {/* Title */}
                            {item?.title ? (
                                <td
                                    className={`text-left ${
                                        item.is_required
                                            ? 'text-danger fw-bold'
                                            : ''
                                    }`}>
                                    {item.title}
                                </td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                            {/* Description */}
                            {item?.description ? (
                                <td className="text-left">
                                    {item.description}
                                </td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                            {/* Type */}
                            {item?.type ? (
                                <td className="text-left">
                                    <code>{item.type}</code>
                                </td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                            {/* Pattern */}
                            {item?.pattern ? (
                                <td className="text-left">{item.pattern}</td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                            {/* Also Requires */}
                            {item?.also_requires ? (
                                <td className="text-left">
                                    {item.also_requires.join(', ')}
                                </td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                            {/* LinkTo */}
                            {item?.items?.linkTo ? (
                                <td className="text-left">
                                    {item?.items?.linkTo}
                                </td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                            {/* Note */}
                            {item?.submissionComment ? (
                                <td className="text-left">
                                    {' '}
                                    {item.submissionComment}
                                </td>
                            ) : (
                                <td className="text-left text-secondary">-</td>
                            )}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    ) : (
        'No Schema properties available.'
    );
};

// Requests the submission schemas JSON and redners as a list of tables
export const SubmissionDataDictionary = () => {
    const [schemaData, setSchemaData] = React.useState(null);
    const [selectedSchema, setSelectedSchema] = React.useState(null);

    console.log(schemaData);

    useEffect(() => {
        ajax.load(
            '/submission-schemas/?format=json',
            (resp) => {
                // Handle the response data
                setSchemaData(resp);
            },
            'GET',
            (err) => {
                // Handle the error
                console.error('Error fetching schema reference:', err);
            }
        );
    }, []);

    const options = Object.keys(schemaData || {}).map((schemaKey) => ({
        value: schemaKey,
        label: schemaKey,
    }));

    return schemaData ? (
        <div className="schema-reference-page">
            <Select
                value={selectedSchema}
                placeholder="Select an Item..."
                onChange={(selectedItem) => {
                    setSelectedSchema(selectedItem);
                }}
                options={options}
            />
            <div className="callout mt-2">
                <p>
                    <b>Note:</b> Metadata Property names in{' '}
                    <span className="text-danger fw-bold">RED</span> are
                    required for all items of that item type.
                </p>
            </div>
            {selectedSchema?.value && (
                <div
                    className={`selected-schema schema-item ${selectedSchema.value} table-responsive`}>
                    <h3 className="fs-4">{selectedSchema.value}</h3>
                    {selectedSchema.value && (
                        <>
                            <SchemaPropertiesTable
                                data={
                                    schemaData[selectedSchema.value]?.properties
                                }
                            />
                            <hr className="my-5"></hr>
                        </>
                    )}
                </div>
            )}
            <div className="schemas-container">
                {Object.keys(schemaData).map((schemaKey, i) => {
                    return (
                        <div
                            id={schemaKey}
                            className={`schema-item ${schemaKey} mb-5 table-responsive`}
                            key={i}>
                            <h3 className="fs-4">{schemaKey}</h3>
                            <SchemaPropertiesTable
                                data={schemaData[schemaKey]?.properties}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    ) : (
        <div>
            <i className="icon icon-spin icon-spinner"></i>
        </div>
    );
};
