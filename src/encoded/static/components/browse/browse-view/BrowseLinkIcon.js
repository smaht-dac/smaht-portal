import React from 'react';

export const BrowseLinkIcon = React.memo(function BrowseLinkIcon(props) {
    const { type, cls = '' } = props;

    let iconCls;
    let dataAttribute;

    switch (type) {
        case 'File':
            iconCls = 'file';
            dataAttribute = 'file';
            break;
        case 'Donor':
            iconCls = 'users';
            dataAttribute = 'donor';
            break;
        case 'Tissue':
            iconCls = 'lungs';
            dataAttribute = 'tissue';
            break;
        case 'Assay':
            iconCls = 'dna';
            dataAttribute = 'assay';
            break;
        case 'File Size':
            iconCls = 'download';
            dataAttribute = 'file-size';
            break;
        default:
            throw new Error(
                'Error in BrowseLinkIcon - Must provide a valid type.'
            );
    }

    return (
        <div
            className={'browse-link-icon ' + cls}
            data-icon-type={dataAttribute}>
            <i className={`icon fas icon-${iconCls}`} />
        </div>
    );
});
