import React from 'react';

export const VcfComparatorTable = ({ context }) => {
    console.log('VCF context', context);
    return (
        <div className="vcf-comparator-table-container">
            <div className="content">
                <div className="comparator-information mb-2">
                    <h3 className="header">Comparator</h3>
                    <span>{context?.comparator?.join(', ') ?? '-'}</span>
                </div>
                <h3 className="header">Software</h3>
                <table className="vcf-comparator-table-container table table-responsive">
                    <thead>
                        <tr>
                            <th className="name">
                                <span>Name</span>
                            </th>
                            <th className="version">
                                <span>Version</span>
                            </th>
                            <th className="notes">
                                <span>Notes</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {context.software.map((software, i) => {
                            return (
                                <tr key={i}>
                                    <td>{software.display_title}</td>
                                    <td>{software.version}</td>
                                    <td>{software?.notes ?? '-'}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
