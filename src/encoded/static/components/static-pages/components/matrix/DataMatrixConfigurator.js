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
    colorRanges = [],
    selectedColumnValue,
    selectedRow1Value,
    selectedRow2Value,
    initialColumnGroups,
    onApply
}) => {
    const [searchUrl, setSearchUrl] = useState(propSearchUrl);
    const [selectedColumn, setSelectedColumn] = useState(selectedColumnValue);
    const [selectedRow1, setSelectedRow1] = useState(selectedRow1Value);
    const [selectedRow2, setSelectedRow2] = useState(selectedRow2Value);
    const [ranges, setRanges] = useState(colorRanges.length > 0 ? colorRanges : [{ min: 0, max: '', color: '' }]);
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

    useEffect(() => {
        // Ensure at least one range row exists
        if (ranges.length === 0) {
            setRanges([{ min: 0, max: '', color: '' }]);
        }
    }, [ranges]);

    // Update max in state as user types
    const handleMaxChange = (index, maxValue) => {
        const newRanges = [...ranges];
        newRanges[index].max = maxValue;
        // Continuity: if not the last range, update the next row's min
        if (index < newRanges.length - 1) {
            newRanges[index + 1].min = maxValue;
        }
        setRanges(newRanges);
    };

    // Validate max once user finishes editing (onBlur)
    const validateMaxValue = (index) => {
        const newRanges = [...ranges];
        const minValue = parseFloat(newRanges[index].min);
        const maxValue = parseFloat(newRanges[index].max);

        // If max <= min, error
        if (!isNaN(maxValue) && maxValue <= minValue) {
            setErrors((prevErrors) => ({
                ...prevErrors,
                [index]: 'Max value must be greater than Min value',
            }));
            return;
        }

        // If no error, remove from errors
        setErrors((prevErrors) => {
            const newErrors = { ...prevErrors };
            delete newErrors[index];
            return newErrors;
        });

        // Continuity: Update the next row's min
        if (index < newRanges.length - 1) {
            newRanges[index + 1].min = newRanges[index].max;
        }

        // If this is the last row and user entered a max, auto-add a new row
        if (newRanges[index].max !== '' && index === newRanges.length - 1) {
            newRanges.push({ min: newRanges[index].max, max: '', color: null });
        }

        setRanges(newRanges);
    };

    const handleColorChange = (index, color) => {
        let newRanges = [...ranges];
        if (index === 0) {
            newRanges = updateColorRanges(newRanges, color, -100);
        } else {
            newRanges[index].color = color;
        }
        setRanges(newRanges);
    };

    const removeRange = (index) => {
        // Don't remove if it's the only row
        if (ranges.length === 1) return;

        const newRanges = ranges.filter((_, i) => i !== index);

        // After removing, fix continuity
        // If we removed row i, then row i in the new array was row i+1 in the old array
        // So newRanges[i].min should match newRanges[i-1].max (if i>0)
        if (index > 0 && index < newRanges.length) {
            newRanges[index].min = newRanges[index - 1].max;
        }

        setRanges(newRanges);
    };

    const handleApply = () => {
        // All ranges except the last one must have max defined
        const filledMax = ranges.slice(0, -1).every((r) => r.max !== '');
        if (!filledMax) {
            alert('All ranges except the last one must have a max value.');
            return;
        }

        // Also check if any errors remain
        if (Object.keys(errors).length > 0) {
            alert('Please fix errors before applying.');
            return;
        }

        onApply(searchUrl, selectedColumn, selectedRow1, selectedRow2, ranges);
        setShowPopover(false);
    };

    const labelStyle = { width: '110px' };

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
                <i className="icon icon-fw icon-gear fas" /> <span className='text-muted small'>{DataMatrixConfigurator.getNestedFieldName(selectedRow1Value) + ' x ' + DataMatrixConfigurator.getNestedFieldName(selectedColumnValue)}</span>
            </Button>

            {/* Popover content */}
            {showPopover && (
                <Popover id="config-popover" ref={popoverRef} style={{ maxWidth: '600px', width: '100%', zIndex: 1050, position: 'absolute' }}>
                    <Popover.Body>
                        <div className="d-flex flex-column">
                            <h5 className='mt-0 mb-1'>Data Matrix Configurator</h5>

                            <Tabs defaultActiveKey="home" id="uncontrolled-tab-example" className="mb-3">
                                <Tab eventKey="home" title="Home">
                                    {/* Search Url */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Search URL</Form.Label>
                                        <Form.Control type="text" value={searchUrl} onChange={(e) => setSearchUrl(e.target.value)} />
                                    </Form.Group>

                                    {/* Column Dimension */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Column Field</Form.Label>
                                        <Form.Control as="select" value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)}>
                                            <option key={0} value={null}>{'-- Select --'}</option>
                                            {columnDimensions.map((dim, idx) => (
                                                <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>

                                    {/* Row Dimension 1 */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Row Field 1</Form.Label>
                                        <Form.Control as="select" value={selectedRow1} onChange={(e) => setSelectedRow1(e.target.value)}>
                                            <option key={0} value={null}>{'-- Select --'}</option>
                                            {rowDimensions.map((dim, idx) => (
                                                <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>

                                    {/* Row Dimension 2 */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Row Field 2</Form.Label>
                                        <Form.Control as="select" value={selectedRow2} onChange={(e) => setSelectedRow2(e.target.value)} disabled>
                                            <option key={0} value={null}>{'-- Select --'}</option>
                                            {rowDimensions.map((dim, idx) => (
                                                <option key={idx + 1} value={dim}>{dim}</option>
                                            ))}
                                        </Form.Control>
                                    </Form.Group>

                                    {/* Ranges */}
                                    {ranges.map((range, index) => {
                                        const errorMsg = errors[index] || '';
                                        return (
                                            <Form.Group key={index} className="d-flex align-items-center mb-05">
                                                <Form.Label className="me-2" style={labelStyle}>Range {index + 1}</Form.Label>
                                                <Form.Control type="number" value={range.min} disabled className="me-2" style={{ width: '80px' }} />
                                                <Form.Control
                                                    type="number" placeholder="Max" value={range.max}
                                                    onChange={(e) => handleMaxChange(index, e.target.value)}
                                                    onBlur={() => validateMaxValue(index)}
                                                    className="me-2" style={{ width: '80px' }} isInvalid={!!errorMsg}
                                                />
                                                <Form.Control type="color" value={range.color}
                                                    onChange={(e) => handleColorChange(index, e.target.value)} style={{ width: '40px' }} />
                                                <Button variant="link" disabled={index === 0} onClick={() => removeRange(index)}>
                                                    <i className="icon icon-fw icon-trash fas" />
                                                </Button>
                                                {errorMsg && (
                                                    <Form.Control.Feedback type="invalid">{errorMsg}</Form.Control.Feedback>
                                                )}
                                            </Form.Group>
                                        );
                                    })}
                                </Tab>
                                <Tab eventKey="columnGrouping" title="Column Grouping">
                                    <TierWizard initialData={initialColumnGroups} />
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
}

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

    return (
        <Card className="mb-3">
            <Card.Body>
                <Form.Group className="mb-3">
                    <Form.Label>Tier Name</Form.Label>
                    <Form.Control
                        type="text"
                        name="name"
                        value={tier.name}
                        onChange={handleChange}
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Background Color</Form.Label>
                    <Form.Control
                        type="color"
                        name="backgroundColor"
                        value={tier.backgroundColor}
                        onChange={handleChange}
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Text Color</Form.Label>
                    <Form.Control
                        type="color"
                        name="textColor"
                        value={tier.textColor}
                        onChange={handleChange}
                    />
                </Form.Group>
                <Form.Group className="mb-3">
                    <Form.Label>Values</Form.Label>
                    <ChipsContainer
                        chips={tier.values}
                        onChange={(newValues) =>
                            onTierChange({ ...tier, values: newValues })
                        }
                        suggestions={suggestions}
                    />
                </Form.Group>
                {onRemove && (
                    <Button variant="danger" onClick={onRemove}>
                        Remove Tier
                    </Button>
                )}
            </Card.Body>
        </Card>
    );
};

const TierWizard = ({ initialData, suggestions = [], onComplete }) => {
    // initialData obje formatında geliyor, örneğin:
    // {
    //   "Tier 1": {
    //       "values": [...],
    //       "backgroundColor": "#FFB5C2",
    //       "textColor": "#ffffff"
    //   },
    //   "Tier 2": { ... }
    // }
    // Bu objeyi array yapısına dönüştürüyoruz.
    const initialTiers = () => Object.keys(initialData).map((tierName) => ({
      name: tierName,
      ...initialData[tierName],
    }));
  
    const [tiers, setTiers] = useState(initialTiers);
  
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
      // Wizard verisini istenen object formatına dönüştürüyoruz.
      const wizardData = tiers.reduce((acc, tier) => {
        acc[tier.name] = {
          values: tier.values,
          backgroundColor: tier.backgroundColor,
          textColor: tier.textColor,
        };
        return acc;
      }, {});
      console.log(wizardData);
      // wizardData'yı API'ye gönderebilir veya başka işlemlerde kullanabilirsiniz.
      onComplete(wizardData);
    };
  
    return (
      <Form onSubmit={handleSubmit}>
        {tiers.map((tier, index) => (
          <TierForm
            key={index}
            tier={tier}
            onTierChange={(updatedTier) => handleTierChange(index, updatedTier)}
            onRemove={() => removeTier(index)}
            suggestions={suggestions}
          />
        ))}
        <Button variant="primary" onClick={addTier}>
          Add Tier
        </Button>
        <Button variant="success" type="submit" className="ms-2">
          Submit
        </Button>
      </Form>
    );
  };

export { DataMatrixConfigurator, updateColorRanges };