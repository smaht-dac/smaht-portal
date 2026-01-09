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
 * Renders a table of schema properties for columns in Donor Metadata. Not all properties
 * in the submission schema are included in the Donor Metadata, so we use a predefined
 * list of properties to display for each item type.
 *
 * We also provide a default titles and examples and allow them to be overwritten by the
 * submission schema
 * @param {Object} data
 * @returns
 */
const DonorManifestDataDictionaryTable = ({
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
                        // If a specific property is selected, filter out the rest
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
                                        {/* If enums/suggested enums are present, display them */}
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
    // Create new Map with updated schema information
    const filteredSchemaData = new Map();
    fieldsToDisplay.forEach((schemaProperties, schemaItem) => {
        // Overwrite any existing properties with those from the schema
        filteredSchemaData.set(
            schemaItem,
            schemaProperties.map((property) => {
                return {
                    ...data[schemaItem]?.properties?.[property.title],
                    ...property, // Place default properties last to overwrite
                };
            })
        );
    });

    return filteredSchemaData;
};

// Memoized component to render all schema tables
const DonorManifestDataDictionaryTables = React.memo(
    function DonorManifestDataDictionaryTables({ schemaData }) {
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
                            <DonorManifestDataDictionaryTable
                                data={properties}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }
);

// Requests the submission schemas JSON and redners as a list of tables
export const DonorManifestDataDictionary = () => {
    const [schemaData, setSchemaData] = useState(null);
    const [selectedSchema, setSelectedSchema] = useState(null);

    useEffect(() => {
        if (!schemaData) {
            ajax.load(
                '/submission-schemas/?format=json',
                (resp) => {
                    // Handle the response data
                    setSchemaData(formatSchemaData(resp));
                },
                'GET',
                (err) => {
                    // Handle the error
                    console.error('Error fetching schema reference:', err);
                }
            );
        }
    }, []);

    // Inlclude entry for each item type and its properties
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

    // Split selected schema into item type and property
    // E.g. AlignedReads.read_length -> [AlignedReads, read_length]
    // If only item type is selected, property will be null
    const selectedSchemaItem = selectedSchema?.value?.split('.')?.[0] || null;
    const selectedSchemaProperty =
        selectedSchema?.value?.split('.')?.[1] || null;

    return schemaData ? (
        <div className="schema-reference-page">
            <div className="callout mt-2 mb-2">
                <p className="mb-2">
                    The <b>Donor Metadata Dictionary</b> is a guide that
                    explains all of the information <i>fields</i> included in
                    the Donor Metadata file. These fields are organized into{' '}
                    <i>categories</i> to make related fields easier to find. You
                    can use the dropdown below to look up any field or category
                    youre interested in.
                </p>
                <p>
                    Search by: <br />
                    <b>Category: </b> Type the name of the category in the
                    search bar (e.g. <i>familyhistory</i>).
                    <br />
                    <b>Field: </b> Type the name of the field you want to find
                    (e.g. <i>disease</i>).
                    <br />
                    <b>Specific field within a category: </b> Type it in the
                    format <i>category.field</i> (e.g.{' '}
                    <i>familyhistory.disease</i>).
                </p>

                <div className="diagram d-flex flex-column align-items-start mt-2">
                    <p className="mb-1">
                        Column Name Breakdown:{' '}
                        <span className="category p-1 fw-bold">Category</span>.
                        <span className="field p-1 fw-bold">Field</span>
                    </p>
                    <img
                        src="/static/img/docs/donor_manifest_breakdown.png"
                        alt="Donor Manifest Breakdown"
                    />
                </div>
                <p className="my-3">
                    Note: All information fields except age, sex, and Hardy
                    scale are protected data under dbGaP. No protected
                    information is shown on this page.
                </p>
            </div>
            {/* Search bar */}
            <hr className="my-4"></hr>
            <div className="d-flex flex-column gap-2 align-items-start w-100">
                <span className="fw-bold">Search:</span>
                <Select
                    className="w-100"
                    value={selectedSchema}
                    placeholder="Select a item type or property from the Donor Metadata (e.g. Demographic)..."
                    onChange={(selectedItem) => {
                        setSelectedSchema(selectedItem);
                    }}
                    options={options}
                />
            </div>
            {selectedSchema?.value && (
                <div
                    className={`selected-schema schema-item ${selectedSchema.value} table-responsive`}>
                    <h3 className="fs-4">
                        {selectedSchema.value?.split('.')?.[0]}
                    </h3>
                    {selectedSchemaItem && (
                        <>
                            <DonorManifestDataDictionaryTable
                                data={schemaData.get(selectedSchemaItem)}
                                selectedProperty={selectedSchemaProperty}
                            />
                            <hr className="my-5"></hr>
                        </>
                    )}
                </div>
            )}
            <DonorManifestDataDictionaryTables schemaData={schemaData} />
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
        'Donor',
        [
            {
                title: 'accession',
                description:
                    'A unique identifier to be used to reference the object',
                example: 'SMADOXHZ8YDJ',
            },
            {
                title: 'external_id',
                description: 'External ID for the item provided by submitter',
                example: 'SMHT005',
            },
            { title: 'age', example: '22' },
            { title: 'eligibility', example: 'Yes' },
            { title: 'hardy_scale', example: '3' },
            { title: 'sex', example: 'Male' },
            { title: 'tpc_submitted', example: 'TRUE' },
        ],
    ],
    [
        'Demographic',
        [
            { title: 'international_military_base' },
            {
                title: 'international_military_base_details',
                example: 'Asia 1960s',
            },
            { title: 'military_association' },
        ],
    ],
    [
        'DeathCircumstances',
        [
            { title: 'blood_transfusion', example: 'Packed RBCs' },
            {
                title: 'blood_transfusion_products',
                example: 'Respiratory Failure',
            },
            { title: 'cause_of_death_immediate', example: 'Cardiac arrest' },
            {
                title: 'cause_of_death_immediate_interval',
                example: '0.13',
            },
            {
                title: 'cause_of_death_initial',
                example: 'Respiratory distress',
            },
            {
                title: 'cause_of_death_last_underlying',
                example: 'Alcohol abuse',
            },
            {
                title: 'circumstances_of_death',
                description: 'The manner or context in which death occurred',
            },
            {
                title: 'death_pronounced_interval_h',
                description:
                    'Interval of time between death pronouncement and witness of death (hours)',
                example: '1.48',
            },
            { title: 'donor_stream' },
            { title: 'place_of_death' },
            { title: 'region_of_death' },
            { title: 'season_of_death' },
            { title: 'sepsis_at_death' },
            { title: 'ventilator_at_death' },
            {
                title: 'ventilator_time_h',
                description:
                    'Time the donor was on a ventilator prior to death (hours)',
                example: '90.5',
            },
        ],
    ],
    [
        'MedicalHistory',
        [
            { title: 'alcohol_use' },
            { title: 'allergens', example: 'Penicillin' },
            { title: 'allergies' },
            { title: 'autograft_transplantation' },
            {
                title: 'autograft_transplantation_details',
                example: 'Muscle from thigh for knee re-build',
            },
            { title: 'body_mass_index', example: '33.84' },
            { title: 'cancer_chemotherapy' },
            { title: 'cancer_current' },
            { title: 'cancer_history' },
            { title: 'cancer_radiation_therapy' },
            { title: 'cancer_type', example: 'Skin cancer' },
            { title: 'cmv_total_antibody' },
            { title: 'cmv_igg_antibody' },
            { title: 'cmv_igm_antibody' },
            { title: 'covid_19_pcr' },
            { title: 'ebv_igg_antibody' },
            { title: 'ebv_igm_antibody' },
            { title: 'family_breast_cancer' },
            { title: 'family_cancer_under_50' },
            { title: 'family_diabetes' },
            { title: 'family_heart_disease' },
            { title: 'family_ovarian_pancreatic_prostate_cancer' },
            {
                title: 'height_m',
                description: 'Height of the donor (meters)',
                example: '1.75',
            },
            { title: 'hepatitis_b_core_antibody' },
            { title: 'hepatitis_b_surface_antibody' },
            { title: 'hepatitis_b_surface_antigen' },
            { title: 'hepatitis_c_antibody' },
            { title: 'hepatitis_c_nat' },
            { title: 'hiv_1_2_antibody' },
            { title: 'hiv_nat' },
            { title: 'illicit_drug_use' },
            { title: 'pregnancy_count', example: '2' },
            { title: 'pregnancy_male_fetus' },
            { title: 'syphilis_rpr' },
            { title: 'tobacco_use' },
            { title: 'toxic_exposure' },
            { title: 'twin_or_multiple_birth' },
            { title: 'twin_or_multiple_birth_details' },
            {
                title: 'weight_kg',
                description: 'Weight of the donor (kg)',
                example: '59.87',
            },
            { title: 'xenograft_transplantation' },
            {
                title: 'xenograft_transplantation_details',
                example: 'Pig heart valve',
            },
        ],
    ],
    [
        'TissueCollection',
        [
            { title: 'collection_site', example: 'TPC4' },
            {
                title: 'ischemic_time_h',
                description:
                    'Time interval between death, presumed death, or cross-clamp application and beginning of tissue collection (hours)',
                example: '14.8',
            },
            { title: 'organ_transplant' },
            { title: 'organs_transplanted', example: 'Bone' },
            { title: 'recovery_datetime', example: '12/6/24' },
            {
                title: 'recovery_interval_min',
                description:
                    'Total time interval of tissue collection (minutes)',
                example: '205',
            },
            { title: 'refrigeration_prior_to_procurement' },
            {
                title: 'refrigeration_prior_to_procurement_time_h',
                description:
                    'Interval of time the donor was refrigerated prior to tissue collection (hours)',
                example: '12.07',
            },
        ],
    ],
    [
        'FamilyHistory',
        [
            { title: 'disease', example: 'Diabetes' },
            { title: 'relatives', example: 'Cousin' },
        ],
    ],
    [
        'MedicalTreatment',
        [
            { title: 'title', example: 'Cataract surgery' },
            { title: 'category', example: 'Surgery' },
            { title: 'comments', example: 'bilateral' },
            { title: 'counts', example: '1' },
            { title: 'year_end', example: '1999' },
            { title: 'year_start', example: '2012' },
        ],
    ],
    [
        'Diagnosis',
        [
            { title: 'age_at_diagnosis', example: 'NA|31' },
            { title: 'age_at_resolution', example: 'NA|NA|21' },
            {
                title: 'comments',
                example:
                    'Improved ejection fraction|Nonischemic|NA|Admission course event|NA|NA',
            },
            {
                title: 'disease',
                example:
                    'Asthma|Sleep apnea|Gastroesophageal reflux disease (GERD)',
            },
        ],
    ],
    [
        'Exposure',
        [
            { title: 'category' },
            { title: 'cessation' },
            {
                title: 'cessation_duration_y',
                description: 'Duration since exposure ceased (years)',
                example: '26',
            },
            { title: 'comments', example: 'Estimate: On and off use|NA' },
            {
                title: 'duration_y',
                description: 'Duration of the exposure (years)',
                example: '5',
            },
            { title: 'frequency_category' },
            { title: 'quantity', example: '1|12' },
            { title: 'quantity_unit' },
            { title: 'route' },
            { title: 'substance', example: 'Asbestos' },
        ],
    ],
]);
