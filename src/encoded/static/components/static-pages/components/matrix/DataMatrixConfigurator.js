'use strict';

import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Button, Form, Popover, Tabs, Tab, Card } from 'react-bootstrap';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import Badge from 'react-bootstrap/Badge';
import CloseButton from 'react-bootstrap/CloseButton';

const DataMatrixConfigurator = ({
    searchUrl: propSearchUrl,
    columnDimensions,
    rowDimensions,
    initialColumnAggField,
    initialRowAggField1,
    initialRowAggField2,
    initialColumnGroups,
    initialShowColumnGroups,
    initialColumnGroupsExtended,
    initialShowColumnGroupsExtended,
    initialRowGroupsExtended,
    initialShowRowGroupsExtended,
    initialTotalBackgroundColor,
    initialXAxisLabel,
    initialYAxisLabel,
    initialShowAxisLabels,
    onApply
}) => {
    const [searchUrl, setSearchUrl] = useState(propSearchUrl);
    const [columnAggField, setColumnAggField] = useState(initialColumnAggField);
    const [rowAggField1, setRowAggField1] = useState(initialRowAggField1);
    const [rowAggField2, setRowAggField2] = useState(initialRowAggField2);
    const [columnGroups, setColumnGroups] = useState(initialColumnGroups);
    const [showColumnGroups, setShowColumnGroups] = useState(initialShowColumnGroups);
    const [columnGroupsExtended, setColumnGroupsExtended] = useState(initialColumnGroupsExtended);
    const [showColumnGroupsExtended, setShowColumnGroupsExtended] = useState(initialShowColumnGroupsExtended);
    const [rowGroupsExtended, setRowGroupsExtended] = useState(initialRowGroupsExtended);
    const [showRowGroupsExtended, setShowRowGroupsExtended] = useState(initialShowRowGroupsExtended);
    const [totalBackgroundColor, setTotalBackgroundColor] = useState(initialTotalBackgroundColor);
    const [xAxisLabel, setXAxisLabel] = useState(initialXAxisLabel);
    const [yAxisLabel, setYAxisLabel] = useState(initialYAxisLabel);
    const [showAxisLabels, setShowAxisLabels] = useState(initialShowAxisLabels);
    const [showPopover, setShowPopover] = useState(false);
    const [errors, setErrors] = useState({});
    const popoverRef = useRef();

    useEffect(() => {
        // Click outside to close popover
        const handleClickOutside = (event) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                setShowPopover(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleApply = () => {
        // Also check if any errors remain
        if (Object.keys(errors).length > 0) {
            alert('Please fix errors before applying.');
            return;
        }

        onApply({
            searchUrl, columnAggField, rowAggField1, rowAggField2,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended, rowGroupsExtended, showRowGroupsExtended,
            totalBackgroundColor, xAxisLabel, yAxisLabel, showAxisLabels
        });
        setShowPopover(false);
    };

    const labelStyle = { width: '150px' };

    return (
        <div>
            {/* Overlay for the popover */}
            {showPopover && (
                <div
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.3)', zIndex: 1000,
                    }}
                    onClick={() => setShowPopover(false)}
                />
            )}

            {/* Button to toggle popover */}
            <Button variant="link" id="config-btn" className="p-0" onClick={() => setShowPopover(!showPopover)}>
                <i className="icon icon-fw icon-gear fas" /> <span className="text-muted small">{yAxisLabel + ' x ' + xAxisLabel}</span>
            </Button>

            {/* Popover content */}
            {showPopover && (
                <Popover id="config-popover" ref={popoverRef} style={{ maxWidth: '800px', width: '100%', zIndex: 1050, position: 'absolute' }}>
                    <Popover.Body>
                        <div className="d-flex flex-column">
                            <h5 className="mt-0 mb-1">Data Matrix Configurator</h5>

                            <Tabs defaultActiveKey="home" id="uncontrolled-tab-example" className="mb-3">
                                <Tab eventKey="home" title="Home">
                                    {/* Search Url */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Search URL</Form.Label>
                                        <Form.Control type="text" value={searchUrl} onChange={(e) => setSearchUrl(e.target.value)} />
                                    </Form.Group>

                                    {/* X Axis Label */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>X-Axis Label</Form.Label>
                                        <Form.Control type="text" value={xAxisLabel} onChange={(e) => setXAxisLabel(e.target.value)} />
                                    </Form.Group>

                                    {/* Y Axis Label */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Y-Axis Label</Form.Label>
                                        <Form.Control type="text" value={yAxisLabel} onChange={(e) => setYAxisLabel(e.target.value)} />
                                    </Form.Group>

                                    {/* Show Axis Labels */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Show Axis Labels</Form.Label>
                                        <Form.Check type="checkbox" checked={showAxisLabels} onChange={(e) => setShowAxisLabels(!showAxisLabels)} />
                                    </Form.Group>

                                    {/* Column Dimension */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Column Agg Field</Form.Label>
                                        <Form.Control as="select" value={columnAggField || ''} onChange={(e) => setColumnAggField(e.target.value)}>
                                            <option key={0} value={null}>{'-- Select --'}</option>
                                            {columnDimensions.map((dim, idx) => (
                                                <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>

                                    {/* Row Dimension 1 */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Row Agg Field 1</Form.Label>
                                        <Form.Control as="select" value={rowAggField1 || ''} onChange={(e) => setRowAggField1(e.target.value)}>
                                            <option key={0} value={null}>{'-- Select --'}</option>
                                            {rowDimensions.map((dim, idx) => (
                                                <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>

                                    {/* Row Dimension 2 */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Row Agg Field 2</Form.Label>
                                        <Form.Control as="select" value={rowAggField2 || ''} onChange={(e) => setRowAggField2(e.target.value)}>
                                            <option key={0} value={null}>{'-- Select --'}</option>
                                            {rowDimensions.map((dim, idx) => (
                                                <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Summary BG Color</Form.Label>
                                        <Form.Control type="color" name="totalBackgroundColor" value={totalBackgroundColor} onChange={(e) => setTotalBackgroundColor(e.target.value)} />
                                    </Form.Group>
                                </Tab>
                                <Tab eventKey="columnGroups" title={`Column Groups Primary (${Object.keys(columnGroups).length})`}>
                                    <TierWizard
                                        initialData={columnGroups}
                                        onComplete={(data, show) => { setColumnGroups(data); setShowColumnGroups(show); }}
                                        showData={showColumnGroups} />
                                </Tab>
                                <Tab eventKey="columnGroupsExtended" title={`Column Groups Secondary (${Object.keys(columnGroupsExtended).length})`}>
                                    <TierWizard
                                        initialData={columnGroupsExtended}
                                        onComplete={(data, show) => { setColumnGroupsExtended(data); setShowColumnGroupsExtended(show); }}
                                        showData={showColumnGroupsExtended} />
                                </Tab>
                                <Tab eventKey="rowGroupsExtended" title="Row Groups">
                                    <TierWizard
                                        initialData={rowGroupsExtended}
                                        onComplete={(data, show) => { setRowGroupsExtended(data); setShowRowGroupsExtended(show); }}
                                        showData={showRowGroupsExtended} />
                                </Tab>
                            </Tabs>

                            {/* Apply Button */}
                            <Button variant="link" onClick={handleApply}>
                                Apply
                            </Button>
                        </div>
                    </Popover.Body>
                </Popover>
            )}
        </div>
    );
};

DataMatrixConfigurator.getNestedFieldName = (field = '') => {
    const fieldParts = field.split('.');
    if (fieldParts.length >= 1) {
        // return the last part of the field unless it is display_title
        return fieldParts[fieldParts.length - 1] !== 'display_title' ?
            fieldParts[fieldParts.length - 1] :
            (fieldParts.length >= 2 ? fieldParts[fieldParts.length - 2] : field);
    }
    return field;
};

/**
 * Helper function to lighten or darken a given hex color (e.g., "#ff0000").
 * If `amount` is positive, it lightens the color; if negative, it darkens it.
 */
function shadeColor(color, amount) {
    // Remove the "#" if present
    let col = color.replace(/^#/, '');

    // If it's a 3-character hex, expand it (e.g., "#f00" => "#ff0000")
    if (col.length === 3) {
        col = col[0] + col[0] + col[1] + col[1] + col[2] + col[2];
    }

    // Convert R, G, B from hex to integer
    let r = parseInt(col.substring(0, 2), 16);
    let g = parseInt(col.substring(2, 4), 16);
    let b = parseInt(col.substring(4, 6), 16);

    // Clamp each channel to [0, 255]
    r = Math.max(Math.min(r + amount, 255), 0);
    g = Math.max(Math.min(g + amount, 255), 0);
    b = Math.max(Math.min(b + amount, 255), 0);

    // Convert back to hex
    return (
        '#' +
        ((1 << 24) + (r << 16) + (g << 8) + b)
            .toString(16)
            .slice(1)
    );
}

/**
 * Updates the colorRanges array so that when you change the FIRST color,
 * all subsequent colors become gradually darker (or lighter) versions
 * of the new base color.
 *
 * @param {Array} colorRanges - The array of color objects, each with { min, max, color }
 * @param {string} newBaseColor - New base color in hex format (e.g. "#ff0000")
 * @param {number} darkestShift - How much darker the final color should be compared to the base.
 *                                This should be a negative number for darkening (e.g., -100).
 *                                If you want it lighter, pass a positive number (e.g., 100).
 * @returns {Array} Updated colorRanges array with adjusted colors.
 *
 * Example usage:
 *   const cr = [
 *     { min: 0,   max: 20, color: '#ff0000' },
 *     { min: 20,  max: 50, color: '#00ff00' },
 *     { min: 50,           color: '#0000ff' }
 *   ];
 *   updateColorRanges(cr, '#00ffff', -100);
 *   // Now cr[0].color = '#00ffff'
 *   //     cr[1].color = (somewhere between #00ffff and darkest shade)
 *   //     cr[2].color = darkest shade
 */
const updateColorRanges = function (colorRanges, newBaseColor, darkestShift = -100) {
    // Number of "steps" between first and last
    const steps = colorRanges.length - 1;
    if (steps < 1) return colorRanges; // If there's only one color or empty

    const clonedColorRanges = JSON.parse(JSON.stringify(colorRanges));

    // For each index, we’ll compute a ratio from 0 to 1.
    // index = 0 => ratio = 0 => no shift (base color)
    // index = steps => ratio = 1 => darkestShift
    clonedColorRanges.forEach((range, i) => {
        if (i === 0) {
            // First color is exactly the new base color
            range.color = newBaseColor;
        } else {
            // Calculate how far along this entry is in the list
            const ratio = i / steps;
            // Apply that ratio to the darkestShift
            const amount = Math.round(darkestShift * ratio);
            // Use shadeColor to adjust from the base color
            range.color = shadeColor(newBaseColor, amount);
        }
    });

    return clonedColorRanges;
};

const Chip = ({ label, onDelete, onDragStart, onDragOver, onDrop }) => (
    <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{ display: 'inline-block' }}
    >
        <Badge
            bg="secondary"
            pill
            className="d-inline-flex align-items-center me-1 mb-1"
            style={{ padding: '0.5em 0.75em', cursor: 'move' }}
        >
            {label}
            {onDelete && (
                <CloseButton
                    onClick={onDelete}
                    variant="white"
                    style={{ marginLeft: '5px' }}
                    aria-label="Close"
                />
            )}
        </Badge>
    </div>
);

const ChipsContainer = ({ chips: propChips, onChange, suggestions = [] }) => {
    const [chips, setChips] = useState(propChips || []);
    const [chipInput, setChipInput] = useState('');
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            addChip(chipInput);
        }
    };

    const addChip = (input) => {
        const newChip = input.trim();
        if (newChip && !chips.includes(newChip)) {
            const updatedChips = [...chips, newChip];
            setChips(updatedChips);
            setChipInput('');
            onChange(updatedChips);
            setFilteredSuggestions([]);
        }
    };

    const handleDelete = (chipToDelete) => {
        const updatedChips = chips.filter((chip) => chip !== chipToDelete);
        setChips(updatedChips);
        onChange(updatedChips);
    };

    const handleChange = (e) => {
        const value = e.target.value;
        setChipInput(value);
        if (value) {
            const filtered = suggestions.filter((suggestion) =>
                suggestion.toLowerCase().includes(value.toLowerCase())
            );
            setFilteredSuggestions(filtered);
        } else {
            setFilteredSuggestions(suggestions);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        addChip(suggestion);
    };

    // Drag & Drop işlemleri için event handler'lar (HTML5 drag & drop)
    const handleDragStart = (e, index) => {
        e.dataTransfer.setData('text/plain', index);
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Drop yapılabilmesi için gereklidir.
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (dragIndex === dropIndex) return;

        const reorderedChips = [...chips];
        const [removed] = reorderedChips.splice(dragIndex, 1);
        reorderedChips.splice(dropIndex, 0, removed);
        setChips(reorderedChips);
        onChange(reorderedChips);
    };

    return (
        <div>
            <div
                className="d-flex flex-grow-1"
                style={{ flexWrap: 'wrap', alignItems: 'center' }}
            >
                {chips.map((chip, index) => (
                    <Chip
                        key={chip}
                        label={chip}
                        onDelete={() => handleDelete(chip)}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, index)}
                    />
                ))}
                <Form.Control
                    type="text"
                    value={chipInput}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFilteredSuggestions(suggestions)}
                    placeholder="Type and add..."
                    style={{ minWidth: '150px' }}
                />
            </div>
            {filteredSuggestions.length > 0 && (
                <div
                    className="suggestions-list"
                    style={{
                        border: '1px solid #ddd',
                        padding: '0.5em',
                        marginTop: '0.5em'
                    }}
                >
                    {filteredSuggestions.map((suggestion, idx) => (
                        <div
                            key={idx}
                            onClick={() => handleSuggestionClick(suggestion)}
                            style={{ cursor: 'pointer', padding: '0.25em 0' }}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const TierForm = ({ tier, onTierChange, onRemove, suggestions }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onTierChange({ ...tier, [name]: value });
    };
    const labelStyle = { width: '180px' };

    return (
        <Card className="mb-3">
            <Card.Body>
                <Form.Group className="d-flex align-items-center mb-05">
                    <Form.Label className="me-2" style={labelStyle}>Name</Form.Label>
                    <Form.Control type="text" name="name" value={tier.name} onChange={handleChange} />
                </Form.Group>
                <Form.Group className="d-flex align-items-center mb-05">
                    <Form.Label className="me-2" style={labelStyle}>Background/Text Color</Form.Label>
                    <Form.Control type="color" name="backgroundColor" value={tier.backgroundColor} onChange={handleChange} />
                    <Form.Control type="color" name="textColor" value={tier.textColor} onChange={handleChange} style={{ marginLeft: '5px' }} />
                </Form.Group>
                {/* <Form.Group className="d-flex align-items-center mb-05">
                    <Form.Label className="me-2" style={labelStyle}>Text Color</Form.Label>
                </Form.Group> */}
                <Form.Group className="d-flex align-items-center mb-05">
                    <Form.Label className="me-2" style={labelStyle}>Short Name</Form.Label>
                    <Form.Control type="text" name="shortName" value={tier.shortName} onChange={handleChange} />
                </Form.Group>
                <Form.Group className="d-flex align-items-center mb-05">
                    <Form.Label className="me-2" style={labelStyle}>Values</Form.Label>
                    <ChipsContainer
                        chips={tier.values}
                        onChange={(newValues) => onTierChange({ ...tier, values: newValues })}
                        suggestions={suggestions}
                    />
                </Form.Group>
                {onRemove && (
                    <Button variant="danger" onClick={onRemove}>
                        Remove
                    </Button>
                )}
            </Card.Body>
        </Card>
    );
};

const TierWizard = ({ initialData, showData, suggestions = [], onComplete }) => {
    // {
    //   "Tier 1": {
    //       "values": [...],
    //       "backgroundColor": "#FFB5C2",
    //       "textColor": "#ffffff"
    //   },
    //   "Tier 2": { ... }
    // }
    const initialTiers = () => Object.keys(initialData).map((tierName) => ({
        name: tierName,
        ...initialData[tierName],
    }));

    const [tiers, setTiers] = useState(initialTiers);
    const [show, setShow] = useState(showData);

    const handleTierChange = (index, updatedTier) => {
        const newTiers = tiers.map((tier, idx) =>
            idx === index ? updatedTier : tier
        );
        setTiers(newTiers);
    };

    const addTier = () => {
        const newTierNumber = tiers.length + 1;
        const newTier = {
            name: `Tier ${newTierNumber}`,
            backgroundColor: '#ffffff',
            textColor: '#000000',
            shortName: null,
            values: [],
        };
        setTiers([...tiers, newTier]);
    };

    const removeTier = (index) => {
        const newTiers = tiers.filter((_, idx) => idx !== index);
        setTiers(newTiers);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const wizardData = tiers.reduce((acc, tier) => {
            acc[tier.name] = {
                values: tier.values,
                backgroundColor: tier.backgroundColor,
                textColor: tier.textColor,
                shortName: tier.shortName
            };
            return acc;
        }, {});
        console.log(wizardData, show);
        // Call the onComplete function with the wizard data
        onComplete(wizardData, show);
    };

    return (
        <Form onSubmit={handleSubmit}>
            <Form.Group className="d-flex align-items-center mb-05">
                <Form.Label className="me-2" style={{width: '150px'}}>Visible</Form.Label>
                <Form.Check type="checkbox" checked={show} onChange={(e) => setShow(!show)} />
            </Form.Group>
            <div className="d-flex flex-column" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {tiers.map((tier, index) => (
                    <TierForm
                        key={index}
                        tier={tier}
                        onTierChange={(updatedTier) => handleTierChange(index, updatedTier)}
                        onRemove={() => removeTier(index)}
                        suggestions={suggestions}
                    />
                ))}
            </div>
            <Button variant="primary" onClick={addTier}>
                Add Tier
            </Button>
            <Button variant="success" className="ms-2" onClick={handleSubmit}>
                Submit
            </Button>
        </Form>
    );
};

export { DataMatrixConfigurator, updateColorRanges };