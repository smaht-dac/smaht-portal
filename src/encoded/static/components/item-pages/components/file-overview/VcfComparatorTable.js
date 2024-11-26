import React from 'react';

export const VcfComparatorTable = ({ context }) => {
    console.log('VCF context', context);
    return (
        <div className="vcf-comparator-table-container">
            <div className="content">
                {context?.comparator?.length > 0 && (
                    <div className="comparator-information mb-2">
                        <div className="data-group data-row">
                            <div className="datum description">
                                <span className="datum-title">Comparator</span>
                                <span className="vertical-divider">|</span>
                                {context?.mode === '' && (
                                    <div className="data-group data-row">
                                        <div className="datum description">
                                            <span className="datum-title">
                                                Mode{' '}
                                            </span>
                                            <span className="vertical-divider">
                                                |
                                            </span>
                                            <span className="datum-value">
                                                Analysis ran using{' '}
                                                <b>{context?.mode}</b> mode
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <span
                                    className={
                                        'datum-value' +
                                        (comparator?.length > 0
                                            ? ''
                                            : ' text-gray')
                                    }>
                                    {comparator?.join(', ') || 'Coming Soon'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
                {context?.software && (
                    <>
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
                                </tr>
                            </thead>
                            <tbody>
                                {context.software.map((software, i) => {
                                    return (
                                        <tr key={i}>
                                            <td>{software.display_title}</td>
                                            <td>{software.version}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </>
                )}
            </div>
        </div>
    );
};
