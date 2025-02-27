'use strict';

import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Button, Form, Popover } from 'react-bootstrap';
import { console } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

export const DataMatrixConfigurator = ({
    searchUrl: propSearchUrl,
    columnDimensions,
    rowDimensions,
    colorRanges = [],
    selectedColumnValue,
    selectedRow1Value,
    selectedRow2Value,
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
            newRanges.push({ min: newRanges[index].max, max: '', color: getScaledColor(newRanges[index].color, minValue, maxValue, (min + maxValue) / 2) });
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
                <Popover id="config-popover" ref={popoverRef} style={{ maxWidth: '450px', width: '100%', zIndex: 1050, position: 'absolute' }}>
                    <Popover.Body>
                        <div className="d-flex flex-column">
                            <h5 className='mt-0 mb-1'>Data Matrix Configurator</h5>
                            {/* Column Dimension */}
                            <Form.Group className="d-flex align-items-center mb-05">
                                <Form.Label className="me-2" style={{ width: '150px' }}>Search URL</Form.Label>
                                <Form.Control type="text" value={searchUrl} onChange={(e) => setSearchUrl(e.target.value)} />
                            </Form.Group>

                            {/* Column Dimension */}
                            <Form.Group className="d-flex align-items-center mb-05">
                                <Form.Label className="me-2" style={{ width: '150px' }}>Column Field</Form.Label>
                                <Form.Control as="select" value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)}>
                                    <option key={0} value={null}>{'-- Select --'}</option>
                                    {columnDimensions.map((dim, idx) => (
                                        <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                    ))}
                                </Form.Control>
                            </Form.Group>

                            {/* Row Dimension 1 */}
                            <Form.Group className="d-flex align-items-center mb-05">
                                <Form.Label className="me-2" style={{ width: '150px' }}>Row Field 1</Form.Label>
                                <Form.Control as="select" value={selectedRow1} onChange={(e) => setSelectedRow1(e.target.value)}>
                                    <option key={0} value={null}>{'-- Select --'}</option>
                                    {rowDimensions.map((dim, idx) => (
                                        <option key={idx + 1} value={dim}>{DataMatrixConfigurator.getNestedFieldName(dim)}</option>
                                    ))}
                                </Form.Control>
                            </Form.Group>

                            {/* Row Dimension 2 */}
                            <Form.Group className="d-flex align-items-center mb-05">
                                <Form.Label className="me-2" style={{ width: '150px' }}>Row Field 2</Form.Label>
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
                                        <Form.Label className="me-2" style={{ width: '100px' }}>Range {index + 1}</Form.Label>
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
  function updateColorRanges(colorRanges, newBaseColor, darkestShift = -100) {
    // Number of "steps" between first and last
    const steps = colorRanges.length - 1;
    if (steps < 1) return colorRanges; // If there's only one color or empty
  
    // For each index, we’ll compute a ratio from 0 to 1.
    // index = 0 => ratio = 0 => no shift (base color)
    // index = steps => ratio = 1 => darkestShift
    colorRanges.forEach((range, i) => {
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
  
    return colorRanges;
  }
  
// ---- Example usage ----
//   const colorRanges = [
//     { min: 0, max: 20, color: '#ff0000' },
//     { min: 20, max: 50, color: '#00ff00' },
//     { min: 50, color: '#0000ff' }
//   ];
  
// Suppose we want to change the first color to cyan (#00ffff)
// and have the last color be 100 units darker.
// updateColorRanges(colorRanges, '#00ffff', -100);
  
// console.log(colorRanges);
// [
//   { min: 0, max: 20, color: '#00ffff' }, // base
//   { min: 20, max: 50, color: '...' },    // slightly darker
//   { min: 50, color: '...' }             // darkest among them
// ]
  

export default DataMatrixConfigurator;