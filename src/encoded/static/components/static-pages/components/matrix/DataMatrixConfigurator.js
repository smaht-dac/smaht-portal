'use strict';

import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import { Button, Form, Popover, Tabs, Tab, Card, Row, Col, Badge, CloseButton, Collapse, Modal } from 'react-bootstrap';
import { console, object } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const DataMatrixConfigurator = ({
    searchUrl: propSearchUrl,
    dimensions,
    fieldToNameMap,
    initialColumnAggField,
    initialRowAggField1,
    initialRowAggField2,
    initialColumnGroups,
    initialShowColumnGroups,
    initialColumnGroupsExtended,
    initialShowColumnGroupsExtended,
    initialRowGroups,
    initialShowRowGroups,
    initialRowGroupsExtended,
    initialShowRowGroupsExtended,
    initialSummaryBackgroundColor,
    initialXAxisLabel,
    initialYAxisLabel,
    initialShowAxisLabels,
    initialColorRangeBaseColor,
    initialColorRangeSegments,
    initialColorRangeSegmentStep,
    onApply,
    onJsxExport,
}) => {
    const [searchUrl, setSearchUrl] = useState(propSearchUrl);
    const [columnAggField, setColumnAggField] = useState(initialColumnAggField);
    const [rowAggField1, setRowAggField1] = useState(initialRowAggField1);
    const [rowAggField2, setRowAggField2] = useState(initialRowAggField2);
    const [columnGroups, setColumnGroups] = useState(initialColumnGroups);
    const [showColumnGroups, setShowColumnGroups] = useState(initialShowColumnGroups);
    const [columnGroupsExtended, setColumnGroupsExtended] = useState(initialColumnGroupsExtended);
    const [showColumnGroupsExtended, setShowColumnGroupsExtended] = useState(initialShowColumnGroupsExtended);
    const [rowGroups, setRowGroups] = useState(initialRowGroups);
    const [showRowGroups, setShowRowGroups] = useState(initialShowRowGroups);
    const [rowGroupsExtended, setRowGroupsExtended] = useState(initialRowGroupsExtended);
    const [showRowGroupsExtended, setShowRowGroupsExtended] = useState(initialShowRowGroupsExtended);
    const [summaryBackgroundColor, setSummaryBackgroundColor] = useState(initialSummaryBackgroundColor);
    const [xAxisLabel, setXAxisLabel] = useState(initialXAxisLabel);
    const [yAxisLabel, setYAxisLabel] = useState(initialYAxisLabel);
    const [showAxisLabels, setShowAxisLabels] = useState(initialShowAxisLabels);
    const [colorRangeBaseColor, setColorRangeBaseColor] = useState(initialColorRangeBaseColor);
    const [colorRangeSegments, setColorRangeSegments] = useState(initialColorRangeSegments);
    const [colorRangeSegmentStep, setColorRangeSegmentStep] = useState(initialColorRangeSegmentStep);
    const [showPopover, setShowPopover] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [jsxExportString, setJsxExportString] = useState(null);
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

    const humanize = function (input) {
        const irregularPlurals = {
            'analysis': 'Analyses',
            'category': 'Categories',
            // add more irregulars here as needed
        };

        // Replace hyphens and underscores with spaces
        const phrase = input.replace(/[_-]/g, ' ').toLowerCase();

        // Check if the full phrase matches an irregular plural
        if (irregularPlurals[phrase]) {
            return irregularPlurals[phrase];
        }

        // Capitalize each word
        const words = phrase.split(' ').map((word) =>
            word.charAt(0).toUpperCase() + word.slice(1)
        );

        // Naively pluralize the last word
        const lastWord = words[words.length - 1];
        let pluralLast;

        if (lastWord.endsWith('y') && !/[aeiou]y$/i.test(lastWord)) {
            pluralLast = lastWord.slice(0, -1) + 'ies';
        } else if (lastWord.endsWith('s') || lastWord.endsWith('x') || lastWord.endsWith('z') || lastWord.endsWith('ch') || lastWord.endsWith('sh')) {
            pluralLast = lastWord + 'es';
        } else {
            pluralLast = lastWord + 's';
        }

        words[words.length - 1] = pluralLast;

        return words.join(' ');
    };


    const handleColumnChange = function (newValues) {
        setColumnAggField(newValues);
        if (newValues.length > 0) {
            setXAxisLabel(humanize(fieldToNameMap[newValues[0]] || DataMatrixConfigurator.getNestedFieldName(newValues[0])));
        } else {
            setXAxisLabel('X');
        }
    };
    const handleRow1Change = function (newValues) {
        setRowAggField1(newValues);
        if (newValues.length > 0) {
            setYAxisLabel(humanize(fieldToNameMap[newValues[0]] || DataMatrixConfigurator.getNestedFieldName(newValues[0])));
        } else {
            setYAxisLabel('Y');
        }
    };

    const handleApply = () => {
        // Also check if any errors remain
        if (Object.keys(errors).length > 0) {
            alert('Please fix errors before applying.');
            return;
        }

        if(columnAggField.length === 0) {
            alert('Please select at least one column aggregation field.');
            return;
        }
        if(rowAggField1.length === 0) {
            alert('Please select at least one row aggregation field.');
            return;
        }
        // check if any duplicates exist in columnAggField and rowAggField1 and rowAggField2
        const allFields = [...columnAggField, ...rowAggField1, ...rowAggField2];
        const duplicates = allFields.filter((item, index) => allFields.indexOf(item) !== index);
        if (duplicates.length > 0) {
            alert(`Duplicate fields found: ${duplicates.join(', ')}`);
            return;
        }

        onApply({
            searchUrl, columnAggField, rowAggField1, rowAggField2,
            columnGroups, showColumnGroups, columnGroupsExtended, showColumnGroupsExtended,
            rowGroups, showRowGroups, rowGroupsExtended, showRowGroupsExtended,
            summaryBackgroundColor, xAxisLabel, yAxisLabel, showAxisLabels,
            colorRangeBaseColor, colorRangeSegments, colorRangeSegmentStep
        });
        setShowPopover(false);
    };

    const handleOpenExportModal = () => {
        const exportData = onJsxExport();
        setJsxExportString(exportData);
        setShowExportModal(true);
    };

    const handleCloseExportModal = () => {
        setJsxExportString(null);
        setShowExportModal(false);
    };

    const labelStyle = { minWidth: '150px', width: '150px' };

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
                <i className="icon icon-fw icon-gear fas" /> <span className="text-muted small">{`${yAxisLabel} x ${xAxisLabel} (admin-only)`}</span>
            </Button>

            {/* Button to export JSX */}
            <Button variant="link" id="export-btn" className="p-0 ms-2" onClick={handleOpenExportModal}>
                <i className="icon icon-fw icon-download fas" /> <span className="text-muted small">Export JSX</span>
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
                                        <Form.Control type="text" value={searchUrl} onChange={(e) => setSearchUrl(e.target.value)} size="sm" />
                                    </Form.Group>

                                    {/* Column Dimension */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Column Agg Field</Form.Label>
                                        <ChipsContainer
                                            chips={columnAggField}
                                            onChange={(newValues) => handleColumnChange(newValues)}
                                            suggestions={dimensions}
                                        />
                                    </Form.Group>

                                    {/* Row Dimension 1 */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Row Agg Field 1</Form.Label>
                                        <ChipsContainer
                                            chips={rowAggField1}
                                            onChange={(newValues) => handleRow1Change(newValues)}
                                            suggestions={dimensions}
                                        />
                                    </Form.Group>

                                    {/* Row Dimension 2 */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={{ ...labelStyle, textDecoration: `${rowAggField1.length === 0 ? 'line-through' : 'unset'}` }}>Row Agg Field 2</Form.Label>
                                        <ChipsContainer
                                            chips={rowAggField2}
                                            onChange={(newValues) => setRowAggField2(newValues)}
                                            suggestions={dimensions}
                                        />
                                    </Form.Group>

                                    {/* Show Axis Labels */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Show Axis Labels</Form.Label>
                                        <Form.Check type="checkbox" checked={showAxisLabels} onChange={(e) => setShowAxisLabels(!showAxisLabels)} />
                                    </Form.Group>

                                    {/* X Axis Label */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>X-Axis Label</Form.Label>
                                        <Form.Control type="text" value={xAxisLabel} onChange={(e) => setXAxisLabel(e.target.value)} size="sm" />
                                    </Form.Group>

                                    {/* Y Axis Label */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Y-Axis Label</Form.Label>
                                        <Form.Control type="text" value={yAxisLabel} onChange={(e) => setYAxisLabel(e.target.value)} size="sm" />
                                    </Form.Group>
                                </Tab>
                                <Tab eventKey="style" title={"Style"}>

                                    {/* Summary Background Color */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Summary BG Color</Form.Label>
                                        <Form.Control type="color" name="summaryBackgroundColor" value={summaryBackgroundColor} onChange={(e) => setSummaryBackgroundColor(e.target.value)} size="sm" />
                                    </Form.Group>

                                    {/* Color Range Base Color */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Colors Base</Form.Label>
                                        <Form.Control type="color" name="colorRangeBaseColor" value={colorRangeBaseColor} onChange={(e) => setColorRangeBaseColor(e.target.value)} size="sm" />
                                    </Form.Group>
                                    {/* Color Range Segments */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Colors Step #</Form.Label>
                                        <Form.Control type="number" name="colorRangeSegments" value={colorRangeSegments} onChange={(e) => setColorRangeSegments(e.target.value)} size="sm" />
                                    </Form.Group>
                                    {/* Color Range Segment Step */}
                                    <Form.Group className="d-flex align-items-center mb-05">
                                        <Form.Label className="me-2" style={labelStyle}>Colors Step Size</Form.Label>
                                        <Form.Control type="number" name="colorRangeSegmentStep" value={colorRangeSegmentStep} onChange={(e) => setColorRangeSegmentStep(e.target.value)} size="sm" />
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
                                <Tab eventKey="rowGroupsExtended" title={`Row Groups (${Object.keys(rowGroupsExtended).length})`}>
                                    <TierWizard
                                        initialData={rowGroupsExtended}
                                        onComplete={(data, show) => { setRowGroupsExtended(data); setShowRowGroupsExtended(show); }}
                                        showData={showRowGroupsExtended} />
                                </Tab>
                            </Tabs>

                            {/* Apply Button */}
                            <Button variant="primary" onClick={handleApply} className="mt-2">
                                Apply
                            </Button>
                        </div>
                    </Popover.Body>
                </Popover>
            )}

            <Modal show={showExportModal} onHide={handleCloseExportModal} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Exported JSX</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <object.CopyWrapper
                        value={jsxExportString}
                        className={"mt-2"}
                        wrapperElement="pre"
                        whitespace={false}>
                        {jsxExportString}
                    </object.CopyWrapper>
                </Modal.Body>
            </Modal>
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

const Chip = ({ label, onDelete, onDragStart, onDragOver, onDrop, onClick, variant = 'secondary' }) => (
    <div
        draggable = {onDragStart ? true : false}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onClick}
        style={{ display: 'inline-block' }}
    >
        <Badge
            bg={variant}
            pill
            className="d-inline-flex align-items-center me-1 mb-1"
            style={{ padding: '0.5em 0.75em', cursor: onDragStart ? 'move' : 'pointer' }}
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
    const [showChipInput, setShowChipInput] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);

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
                {!showChipInput && <Chip
                    key={'add-chip'}
                    label={'+ Add Value'}
                    variant={'danger'}
                    onClick={() => setShowChipInput(true)}
                />
                }
                {showChipInput &&
                    <Form.Control
                        type="text"
                        value={chipInput}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => { setShowSuggestions(true); setFilteredSuggestions(suggestions); }}
                        onBlur={() => setTimeout(function () { setShowSuggestions(false) }, 200)}
                        placeholder="Type and add..."
                        style={{ minWidth: '150px' }}
                    />
                }
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
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

const TierForm = ({ tier, onTierChange, onRemove, suggestions, defaultCollapsed=true }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onTierChange({ ...tier, [name]: value });
    };
    const labelStyle = { minWidth: '150px', width: '150px' };

    return (
        <DismissibleCard onClose={onRemove} showLabel={tier.name} defaultCollapsed={defaultCollapsed}>
            <Form.Group className="d-flex align-items-center mb-05">
                <Form.Label className="me-2" style={labelStyle}>Name</Form.Label>
                <Form.Control type="text" name="name" value={tier.name} onChange={handleChange} />
            </Form.Group>
            <Row>
                <Col>
                    <Form.Group className="d-flex align-items-center mb-05">
                        <Form.Label className="me-2" style={labelStyle}>Background</Form.Label>
                        <Form.Control type="color" name="backgroundColor" value={tier.backgroundColor} onChange={handleChange} size="sm" />
                    </Form.Group>
                </Col>
                <Col>
                    <Form.Group className="d-flex align-items-center mb-05">
                        <Form.Label className="me-2" style={labelStyle}>Text</Form.Label>
                        <Form.Control type="color" name="textColor" value={tier.textColor} onChange={handleChange} style={{ marginLeft: '5px' }} size="sm" />
                    </Form.Group>
                </Col>
            </Row>
            <Form.Group className="d-flex align-items-center mb-05">
                <Form.Label className="me-2" style={labelStyle}>Short Name</Form.Label>
                <Form.Control type="text" name="shortName" value={tier.shortName} onChange={handleChange} size="sm" />
            </Form.Group>
            <Form.Group className="d-flex align-items-center mb-05">
                <Form.Label className="me-2" style={labelStyle}>Values</Form.Label>
                <ChipsContainer
                    chips={tier.values}
                    onChange={(newValues) => onTierChange({ ...tier, values: newValues })}
                    suggestions={suggestions}
                />
            </Form.Group>
        </DismissibleCard>
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
        const updatedTiers = tiers.map((tier, idx) =>
            idx === index ? updatedTier : tier
        );
        setTiers(updatedTiers);

        notifyChange(updatedTiers);
    };

    const addTier = () => {
        const newTierNumber = tiers.length + 1;
        const newTier = {
            name: `Tier ${newTierNumber}`,
            backgroundColor: '#ffffff',
            textColor: '#000000',
            shortName: null,
            values: [],
            defaultCollapsed: false
        };
        const updatedTiers = [...tiers, newTier];
        setTiers(updatedTiers);

        notifyChange(updatedTiers);
    };

    const removeTier = (index) => {
        const updatedTiers = tiers.filter((_, idx) => idx !== index);
        setTiers(updatedTiers);

        notifyChange(updatedTiers);
    };

    const toggleShow = () => {
        const newShow = !show;
        setShow(newShow);
        notifyChange(null, newShow);
    };

    const notifyChange = (submittedTiers, submittedShow) => {
        const notifyShow = typeof submittedShow !== 'undefined' ? submittedShow : show;
        const notifyTiers = submittedTiers || tiers;
        console.log('Tiers:', notifyTiers);

        const wizardData = notifyTiers.reduce((acc, tier) => {
            acc[tier.name] = {
                values: tier.values,
                backgroundColor: tier.backgroundColor,
                textColor: tier.textColor,
                shortName: tier.shortName
            };
            return acc;
        }, {});
        console.log(wizardData, notifyShow);
        // Call the onComplete function with the wizard data
        onComplete(wizardData, notifyShow);
    };

    return (
        <React.Fragment>
            <Form.Group className="d-flex align-items-center mb-05">
                <Form.Label className="me-2" style={{ width: '150px' }}>Enable Grouping</Form.Label>
                <Form.Check type="checkbox" checked={show} onChange={(e) => toggleShow()} />
            </Form.Group>
            <Button variant="primary" onClick={addTier} size="sm" className="float-end mb-2">
                Add Tier
            </Button>
            <div className="d-flex flex-column" style={{ clear: 'both', maxHeight: '600px', overflowY: 'auto', paddingRight: '15px', paddingTop: '15px' }}>
                {tiers.map((tier, index) => (
                    <TierForm
                        key={index}
                        tier={tier}
                        onTierChange={(updatedTier) => handleTierChange(index, updatedTier)}
                        onRemove={() => removeTier(index)}
                        suggestions={suggestions}
                        defaultCollapsed={tier.defaultCollapsed}
                    />
                ))}
            </div>
        </React.Fragment>
    );
};

const DismissibleCard = ({ onClose, showLabel, defaultCollapsed = true, children }) => {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    return (
        <Card style={{ position: 'relative', overflow: 'visible', marginBottom: '20px' }}>
            {/* Close button: removes the card */}
            <CloseButton
                onClick={() => confirm('Are you sure you want to remove this card?') && onClose()}
                style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '-10px',
                    zIndex: 2,
                    backgroundColor: 'white',
                    border: '1px solid #ccc',
                    borderRadius: '50%',
                    boxShadow: '0 0 3px rgba(0,0,0,0.2)',
                }}
            />
            {/* Collapsible content */}
            <Collapse in={!collapsed}>
                <div>
                    <Card.Body>{children}</Card.Body>
                </div>
            </Collapse>
            {/* Toggle button to collapse/expand content */}
            <Card.Footer size="sm">
                <Button
                    variant="link"
                    size="sm"
                    onClick={() => setCollapsed(!collapsed)}
                    aria-expanded={!collapsed}
                >
                    {collapsed ? showLabel : 'Hide Details'}
                </Button>
            </Card.Footer>

        </Card>
    );
};

export { DataMatrixConfigurator, updateColorRanges };