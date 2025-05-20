import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

// Renders a table of schema properties
const SchemaPropertiesTable = ({ data = {} }) => {
    // sort the keys based on requirement
    const sortedPropertyKeys = Object.keys(data).sort((a, b) => {
        return data[a]?.is_required ? -1 : 1;
    });

    return sortedPropertyKeys.length > 0 ? (
        <table className="table table-bordered table-striped">
            <thead>
                <tr>
                    <th className="text-left">Metadata Property</th>
                    <th className="text-left">Description</th>
                    <th className="text-left">Type</th>
                    <th className="text-left">Pattern</th>
                    <th className="text-left">Note</th>
                </tr>
            </thead>
            <tbody>
                {sortedPropertyKeys.map((propertyKey, i) => {
                    const item = data[propertyKey];
                    return (
                        <tr key={i}>
                            <td
                                className={`text-left ${
                                    item.is_required
                                        ? 'text-danger fw-bold'
                                        : ''
                                }`}>
                                <span>{item.title ?? '-'}</span>
                            </td>
                            <td className="text-left">
                                {item.description ?? '-'}
                            </td>
                            <td className="text-left">
                                <code>{item.type ?? '-'}</code>
                            </td>
                            <td className="text-left">{item.pattern ?? '-'}</td>
                            <td className="text-left">
                                {item.submissionComment ?? '-'}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    ) : (
        'No Schema properties available.'
    );
};

// Renders a list of schema items
export const SchemaReferencePage = () => {
    const [schemaData, setSchemaData] = React.useState(null);

    useEffect(() => {
        ajax.load(
            '/submission-schemas/?format=json',
            (resp) => {
                // Handle the response data
                console.log(resp);
                setSchemaData(resp);
            },
            'GET',
            (err) => {
                // Handle the error
                console.error('Error fetching schema reference:', error);
            }
        );
    }, []);

    return schemaData ? (
        <div className="schema-reference-page">
            {Object.keys(schemaData).map((schemaKey, i) => {
                return (
                    <div
                        id={schemaKey}
                        className={`schema-item ${schemaKey} mb-5`}
                        key={i}>
                        <h2>{schemaKey}</h2>
                        <SchemaPropertiesTable
                            data={schemaData[schemaKey]?.properties}
                        />
                    </div>
                );
            })}
        </div>
    ) : (
        <div>SchemaReferencePage</div>
    );
};
