import React from 'react';

export const VcfAnalysisOverview = ({ context }) => {
    let {
        comparator_description = '',
        software = [],
        external_databases = [],
        filtering_methods = [],
        mode = '',
    } = context;

    console.log('context', context);

    return (
        <div className="vcf-analysis-overview">
            <div className="data-group">
                <div className="datum mode">
                    <span className="datum-title">Mode</span>
                    <span className="datum-value">
                        {mode ? mode + ' Sample' : 'N/A'}
                    </span>
                </div>
                <div className="datum comparator">
                    <span
                        className="datum-title"
                        data-tip="Reference sample used to call variants against">
                        Comparator
                    </span>
                    {mode === 'Paired' ? (
                        <span className="datum-value">
                            {comparator_description}
                        </span>
                    ) : (
                        <span className="datum-value text-gray">N/A</span>
                    )}
                </div>
                {software.length > 0 && (
                    <div className="datum software">
                        <span className="datum-title">Software</span>
                        <div className="datum-value">
                            {software.length > 0
                                ? software.map(
                                      ({ title = '', version = '' }, i) => {
                                          return title && version ? (
                                              <div className="software-group">
                                                  <div className="title">
                                                      <span>{title}</span>
                                                  </div>
                                                  <div className="version">
                                                      <span>
                                                          {'v' + version}
                                                      </span>
                                                  </div>
                                              </div>
                                          ) : null;
                                      }
                                  )
                                : 'N/A'}
                        </div>
                    </div>
                )}
            </div>
            {(external_databases.length > 0 ||
                filtering_methods.length > 0) && (
                <div className="data-group notes">
                    <div className="datum">
                        <span className="datum-title">Notes</span>
                        <div className="datum-value">
                            {external_databases.length > 0 && (
                                <p>
                                    <b>External Databases: </b>
                                    {external_databases?.join(', ')}
                                </p>
                            )}
                            {filtering_methods.length > 0 && (
                                <p>
                                    <b>Filtering Methods: </b>
                                    {filtering_methods?.join(', ')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
