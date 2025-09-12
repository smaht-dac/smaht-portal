import React, { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import Select from 'react-select';
import {
    OverlayTrigger,
    Popover,
    PopoverHeader,
    PopoverBody,
} from 'react-bootstrap';

// Renders a table of schema properties
const DonorManifestDataDictionaryTable = ({ data = {} }) => {
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
                                            <b>Examples:</b> Suggested values
                                            for this property. Other values
                                            accepted.
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
                    <th className="text-left">Note</th>
                </tr>
            </thead>
            <tbody>
                {Object.keys(data).map((propertyKey, i) => {
                    // console.log(propertyKey, data[propertyKey]);
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
export const DonorManifestDataDictionary = () => {
    const [schemaData, setSchemaData] = React.useState(null);
    const [selectedSchema, setSelectedSchema] = React.useState(null);

    useEffect(() => {
        // console.log('fetch', fieldsToDisplay);
        if (!schemaData) {
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
        }
    }, []);

    const options = ([...fieldsToDisplay] || []).flatMap((schemaItem) => {
        const [schemaKey, properties] = schemaItem;

        return properties?.map((property) => {
            const value = `${schemaKey}.${property.title}`;
            return { value: value, label: value?.toLowerCase() };
        });
    });

    return schemaData ? (
        <div className="schema-reference-page">
            <Select
                value={selectedSchema}
                placeholder="Select a tab/item type from the Submission Spreadsheet (e.g. AlignedReads or Analyte)..."
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
                    <h3 className="fs-4">
                        {selectedSchema.value?.split('.')?.[0]}
                    </h3>
                    {selectedSchema.value && (
                        <>
                            <DonorManifestDataDictionaryTable
                                data={
                                    schemaData[
                                        selectedSchema.value?.split('.')?.[0]
                                    ]?.properties
                                }
                            />
                            <hr className="my-5"></hr>
                        </>
                    )}
                </div>
            )}
            <div className="schemas-container">
                {[...fieldsToDisplay].map((schemaItem, i) => {
                    const [schemaKey, properties] = schemaItem;

                    // Pull out relevant properties from item type
                    const propertiesToDisplay = properties.reduce(
                        (acc, property) => {
                            const title = property.title;

                            // Overwrite the existing property with any default fields
                            acc[title] = {
                                ...schemaData[schemaKey]?.properties?.[title],
                                ...property,
                            };
                            return acc;
                        },
                        {}
                    );

                    return (
                        <div
                            id={schemaKey}
                            className={`schema-item ${schemaKey} mb-5 table-responsive`}
                            key={i}>
                            <h3 className="fs-4">{schemaKey}</h3>
                            <DonorManifestDataDictionaryTable
                                data={propertiesToDisplay}
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
            },
            {
                title: 'external_id',
                description: 'External ID for the item provided by submitter',
            },
            { title: 'age' },
            { title: 'eligibility' },
            { title: 'hardy_scale' },
            { title: 'sex' },
            { title: 'tpc_submitted' },
        ],
    ],
    [
        'Demographic',
        [
            { title: 'international_military_base' },
            { title: 'international_military_base_details' },
            { title: 'military_association' },
        ],
    ],
    [
        'DeathCircumstances',
        [
            { title: 'blood_transfusion' },
            { title: 'blood_transfusion_products' },
            { title: 'cause_of_death_immediate' },
            { title: 'cause_of_death_immediate_interval' },
            { title: 'cause_of_death_initial' },
            { title: 'cause_of_death_last_underlying' },
            { title: 'circumstances_of_death' },
            { title: 'death_pronounced_interval_h' },
            { title: 'donor_stream' },
            { title: 'place_of_death' },
            { title: 'region_of_death' },
            { title: 'season_of_death' },
            { title: 'sepsis_at_death' },
            { title: 'ventilator_at_death' },
            { title: 'ventilator_time_h' },
        ],
    ],
    [
        'MedicalHistory',
        [
            { title: 'alcohol_use' },
            { title: 'allergens' },
            { title: 'allergies' },
            { title: 'autograft_transplantation' },
            { title: 'autograft_transplantation_details' },
            { title: 'body_mass_index' },
            { title: 'cancer_chemotherapy' },
            { title: 'cancer_current' },
            { title: 'cancer_history' },
            { title: 'cancer_radiation_therapy' },
            { title: 'cancer_type' },
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
            { title: 'height_m' },
            { title: 'hepatitis_b_core_antibody' },
            { title: 'hepatitis_b_surface_antibody' },
            { title: 'hepatitis_b_surface_antigen' },
            { title: 'hepatitis_c_antibody' },
            { title: 'hepatitis_c_nat' },
            { title: 'hiv_1_2_antibody' },
            { title: 'hiv_nat' },
            { title: 'illicit_drug_use' },
            { title: 'pregnancy_count' },
            { title: 'pregnancy_male_fetus' },
            { title: 'syphilis_rpr' },
            { title: 'tobacco_use' },
            { title: 'toxic_exposure' },
            { title: 'twin_or_multiple_birth' },
            { title: 'twin_or_multiple_birth_details' },
            { title: 'weight_kg' },
            { title: 'xenograft_transplantation' },
            { title: 'xenograft_transplantation_details' },
        ],
    ],
    [
        'TissueCollection',
        [
            { title: 'collection_site' },
            { title: 'ischemic_time_h' },
            { title: 'organ_transplant' },
            { title: 'organs_transplanted' },
            { title: 'recovery_datetime' },
            { title: 'recovery_interval_min' },
            { title: 'refrigeration_prior_to_procurement' },
            { title: 'refrigeration_prior_to_procurement_time_h' },
        ],
    ],
    ['FamilyHistory', [{ title: 'disease' }, { title: 'relatives' }]],
    [
        'MedicalTreatment',
        [
            { title: 'title' },
            { title: 'category' },
            { title: 'comments' },
            { title: 'counts' },
            { title: 'year_end' },
            { title: 'year_start' },
        ],
    ],
    [
        'Diagnosis',
        [
            { title: 'age_at_diagnosis' },
            { title: 'age_at_resolution' },
            { title: 'comments' },
            { title: 'disease' },
        ],
    ],
    [
        'Exposure',
        [
            { title: 'category' },
            { title: 'cessation' },
            { title: 'cessation_duration_y' },
            { title: 'comments' },
            { title: 'duration_y' },
            { title: 'frequency_category' },
            { title: 'quantity' },
            { title: 'quantity_unit' },
            { title: 'route' },
            { title: 'substance' },
        ],
    ],
]);
