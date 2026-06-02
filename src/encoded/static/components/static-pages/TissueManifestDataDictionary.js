import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import Select from 'react-select';
import {
    OverlayTrigger,
    Popover,
    PopoverHeader,
    PopoverBody,
} from 'react-bootstrap';

/**
 * Renders a table of schema properties for columns in Tissue Metadata. Not all properties
 * in the submission schema are included in the Tissue Metadata, so we use a predefined
 * list of properties to display for each item type.
 *
 * We also provide default titles and examples and allow them to be overwritten by the
 * submission schema.
 * @param {Object} data
 * @returns
 */
const TissueManifestDataDictionaryTable = ({
    selectedProperty = null,
    data = {},
}) => {
    return Object.keys(data).length > 0 ? (
        <table className="table table-bordered table-striped">
            <thead className="thead-smaht">
                <tr>
                    <th className="text-left">Metadata Property</th>
                    <th className="text-left">Description</th>
                    <th className="text-left">
                        Values
                        <OverlayTrigger
                            trigger={['hover', 'focus']}
                            overlay={
                                <Popover className="description-definitions-popover">
                                    <PopoverHeader>Values</PopoverHeader>
                                    <PopoverBody className="p-3">
                                        <p>
                                            <b>Options:</b> Accepted values for
                                            this property.
                                        </p>
                                        <p>
                                            <b>Ex:</b> Example values for this
                                            property.
                                        </p>
                                    </PopoverBody>
                                </Popover>
                            }
                            placement="top"
                            flip={true}
                            popperConfig={{
                                modifiers: [
                                    {
                                        name: 'flip',
                                        options: {
                                            fallbackPlacements: [
                                                'right',
                                                'bottom',
                                                'left',
                                            ],
                                        },
                                    },
                                ],
                            }}>
                            <i className="icon icon-info-circle fas ms-1"></i>
                        </OverlayTrigger>
                    </th>
                </tr>
            </thead>
            <tbody>
                {Object.keys(data)
                    .filter((property) =>
                        selectedProperty
                            ? data[property]?.title === selectedProperty
                            : true
                    )
                    .map((propertyKey, i) => {
                        const item = data[propertyKey];

                        return (
                            <tr
                                key={i}
                                className={`${
                                    item?.title === selectedProperty
                                        ? 'selected-property'
                                        : ''
                                }`}>
                                {/* Title */}
                                {item?.title ? (
                                    <td className="text-left">{item.title}</td>
                                ) : (
                                    <td className="text-left text-secondary">
                                        -
                                    </td>
                                )}
                                {/* Description */}
                                {item?.description ? (
                                    <td className="text-left">
                                        {item.description}
                                    </td>
                                ) : (
                                    <td className="text-left text-secondary">
                                        -
                                    </td>
                                )}
                                {/* Values */}
                                {item?.enum?.length || item?.suggested_enum ? (
                                    <td className="text-left">
                                        {item?.enum?.length > 0 && (
                                            <p>
                                                <b>Options:</b>{' '}
                                                {item.enum.join(', ')}
                                            </p>
                                        )}
                                        {item?.suggested_enum?.length > 0 && (
                                            <p>
                                                <b>Examples:</b>{' '}
                                                {item.suggested_enum.join(', ')}
                                            </p>
                                        )}
                                    </td>
                                ) : item?.example ? (
                                    <td className="text-left example">
                                        <b>Ex:</b> {item.example}
                                    </td>
                                ) : (
                                    <td className="text-left text-secondary">
                                        -
                                    </td>
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

// Updates the `fieldsToDisplay` Map with information from the schema
const formatSchemaData = (data) => {
    const filteredSchemaData = new Map();
    fieldsToDisplay.forEach((schemaProperties, schemaItem) => {
        filteredSchemaData.set(
            schemaItem,
            schemaProperties.map((property) => {
                return {
                    ...data[schemaItem]?.properties?.[property.title],
                    ...property,
                };
            })
        );
    });

    return filteredSchemaData;
};

// Memoized component to render all schema tables
const TissueManifestDataDictionaryTables = React.memo(
    function TissueManifestDataDictionaryTables({ schemaData }) {
        return (
            <div className="schemas-container">
                {[...schemaData].map((schemaItem, i) => {
                    const [schemaKey, properties] = schemaItem;

                    return (
                        <div
                            id={schemaKey}
                            className={`schema-item ${schemaKey} mb-5 table-responsive`}
                            key={i}>
                            <h3 className="fs-4">{schemaKey}</h3>
                            <TissueManifestDataDictionaryTable
                                data={properties}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }
);

// Requests the submission schemas JSON and renders as a list of tables
export const TissueManifestDataDictionary = () => {
    const [schemaData, setSchemaData] = useState(null);
    const [selectedSchema, setSelectedSchema] = useState(null);

    useEffect(() => {
        if (!schemaData) {
            ajax.load(
                '/submission-schemas/?format=json',
                (resp) => {
                    setSchemaData(formatSchemaData(resp));
                },
                'GET',
                (err) => {
                    console.error('Error fetching schema reference:', err);
                }
            );
        }
    }, []);

    const options = ([...fieldsToDisplay] || []).flatMap((schemaItem) => {
        const [schemaKey, properties] = schemaItem;

        return [
            { value: schemaKey, label: schemaKey },
            ...properties?.map((property) => {
                const value = `${schemaKey}.${property.title}`;
                return { value: value, label: value?.toLowerCase() };
            }),
        ];
    });

    const selectedSchemaItem = selectedSchema?.value?.split('.')?.[0] || null;
    const selectedSchemaProperty =
        selectedSchema?.value?.split('.')?.[1] || null;

    return schemaData ? (
        <div className="schema-reference-page">
            <div className="callout mt-2 mb-2">
                <p className="mb-2">
                    The <b>Tissue Metadata Dictionary</b> is a guide that
                    explains all of the information <i>fields</i> included in
                    the Tissue Metadata file. These fields are organized into{' '}
                    <i>categories</i> to make related fields easier to find. You
                    can use the dropdown below to look up any field or category
                    you&apos;re interested in.
                </p>
                <p>
                    Search by: <br />
                    <b>Category: </b> Type the name of the category in the
                    search bar (e.g. <i>Tissue</i>).
                    <br />
                    <b>Field: </b> Type the name of the field you want to find
                    (e.g. <i>anatomical_location</i>).
                    <br />
                    <b>Specific field within a category: </b> Type it in the
                    format <i>category.field</i> (e.g.{' '}
                    <i>Tissue.anatomical_location</i>).
                </p>
                <div className="diagram d-flex flex-column align-items-start mt-2">
                    <p className="mb-1">
                        Column Name Breakdown:{' '}
                        <span className="category p-1 fw-bold">Category</span>.
                        <span className="field p-1 fw-bold">Field</span>
                    </p>
                </div>
            </div>
            {/* Search bar */}
            <hr className="my-4"></hr>
            <div className="search-bar d-flex flex-column gap-2 align-items-start w-100">
                <span className="fw-bold">Search:</span>
                <Select
                    className="w-100"
                    value={selectedSchema}
                    placeholder="Select a item type or property from the Tissue Metadata (e.g. Tissue)..."
                    onChange={(selectedItem) => {
                        setSelectedSchema(selectedItem);
                    }}
                    options={options}
                />
            </div>
            <hr className="my-4"></hr>
            {selectedSchema?.value && (
                <div
                    className={`selected-schema schema-item ${selectedSchema.value} table-responsive`}>
                    <h3 className="fs-4">
                        {selectedSchema.value?.split('.')?.[0]}
                    </h3>
                    {selectedSchemaItem && (
                        <>
                            <TissueManifestDataDictionaryTable
                                data={schemaData.get(selectedSchemaItem)}
                                selectedProperty={selectedSchemaProperty}
                            />
                            <hr className="my-5"></hr>
                        </>
                    )}
                </div>
            )}
            <TissueManifestDataDictionaryTables schemaData={schemaData} />
        </div>
    ) : (
        <div>
            <i className="icon icon-spin icon-spinner"></i>
        </div>
    );
};

// Putting into a Map to preserve order
// Note: For descriptions, only include if not provided by submission schema
const fieldsToDisplay = new Map([
    [
        'Tissue',
        [
            {
                title: 'accession',
                description:
                    'A unique identifier to be used to reference the object',
                example: 'SMATI0HZ8YDJ',
            },
            {
                title: 'external_id',
                description: 'External ID for the item provided by submitter',
                example: 'ST001-1A',
            },
            { title: 'anatomical_location', example: 'Left frontal lobe' },
            { title: 'ischemic_time', example: '14.8' },
            { title: 'pathology_notes', example: 'No abnormalities observed' },
            { title: 'ph', example: '6.8' },
            { title: 'preservation_medium', example: 'OCT' },
            { title: 'preservation_type' },
            {
                title: 'prosector_notes',
                example: 'Collected under sterile conditions',
            },
            { title: 'sample_count', example: '12' },
            { title: 'size', example: '2.5' },
            { title: 'size_unit' },
            {
                title: 'uberon_id',
                description: 'Uberon Ontology identifier for the tissue',
                example: 'UBERON:0001870',
            },
            {
                title: 'volume',
                description: 'Volume of the tissue (mL)',
                example: '1.2',
            },
            {
                title: 'weight',
                description: 'Weight of the tissue (g)',
                example: '0.85',
            },
        ],
    ],
    [
        'TissueSample',
        [
            {
                title: 'accession',
                description:
                    'A unique identifier to be used to reference the object',
                example: 'SMATS0HZ8YDJ',
            },
            {
                title: 'external_id',
                description: 'External ID for the item provided by submitter',
                example: 'ST001-1A-S1',
            },
            { title: 'category' },
            { title: 'core_size' },
            { title: 'processing_date', example: '2024-03-15' },
            {
                title: 'processing_notes',
                example: 'Snap frozen within 30 min of collection',
            },
            { title: 'preservation_medium', example: 'OCT' },
            { title: 'preservation_type' },
            {
                title: 'weight',
                description: 'Weight of the sample (mg)',
                example: '25.4',
            },
        ],
    ],
]);
