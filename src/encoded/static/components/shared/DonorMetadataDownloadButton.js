import React, { useEffect } from 'react';
import { OverlayTrigger } from 'react-bootstrap';
import ReactTooltip from 'react-tooltip';
import { renderProtectedAccessPopover } from '../item-pages/PublicDonorView';
import { useUserDownloadAccess, useResourceFileSearch } from '../util/hooks';

/**
 * Button to download the bulk donor metadata for all SMaHT donors.
 * @param {Object} props - The component props.
 * @param {Object} props.session - The session object.
 * @returns {JSX.Element} The download button.
 *
 * Note: this component only renders for logged-in users.
 */
export const DonorMetadataDownloadButton = ({ session, className = '' }) => {
    const { userDownloadAccess } = useUserDownloadAccess(session);

    // Get the highest access level the user has
    // There will be access levels of 'open', 'protected', and 'protected-network'
    const highestUserAccess = userDownloadAccess?.['protected-network']
        ? 'protected-network'
        : userDownloadAccess?.['protected']
        ? 'protected'
        : userDownloadAccess?.['open-early']
        ? 'open-early'
        : userDownloadAccess?.['open']
        ? 'open'
        : null;

    // Use the most recently released clinical manifest
    const { files } = useResourceFileSearch(
        session && highestUserAccess
            ? `tags=clinical_manifest&sort=-file_status_tracking.release_dates.initial_release&status=${highestUserAccess}`
            : null,
        session
    );
    const downloadLink = files[0]?.href || null;

    useEffect(() => {
        // Rebuild the tooltip once the download link renders
        if (downloadLink) ReactTooltip.rebuild();
    }, [downloadLink]);

    return downloadLink ? (
        <a
            data-tip="Click to download the metadata for all SMaHT donors for both benchmarking and production studies."
            className={
                'donor-metadata btn btn-sm btn-outline-secondary ' + className
            }
            href={downloadLink}
            download>
            <span>
                <i className="icon icon-fw icon-users fas me-1" />
                Download Bulk Donor Metadata
            </span>
        </a>
    ) : (
        <OverlayTrigger
            trigger={['hover', 'focus']}
            placement="top"
            overlay={renderProtectedAccessPopover()}>
            <button
                className={
                    'donor-metadata btn btn-sm btn-outline-secondary ' +
                    className
                }
                disabled>
                <span>
                    <i className="icon icon-fw icon-users fas me-1" />
                    Download Bulk Donor Metadata
                </span>
            </button>
        </OverlayTrigger>
    );
};
