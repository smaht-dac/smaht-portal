import React, { useState, useEffect } from 'react';
import { OverlayTrigger } from 'react-bootstrap';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import ReactTooltip from 'react-tooltip';
import { renderProtectedAccessPopover } from '../item-pages/PublicDonorView';
import { useUserDownloadAccess } from '../util/hooks';

/**
 * Button to download the bulk donor metadata for all SMaHT donors.
 * @param {Object} props - The component props.
 * @param {Object} props.session - The session object.
 * @returns {JSX.Element} The download button.
 *
 * Note: this component only renders for logged-in users.
 */
export const DonorMetadataDownloadButton = ({ session, className = '' }) => {
    const [downloadLink, setDownloadLink] = useState(null);
    const userDownloadAccess = useUserDownloadAccess(session);

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

    useEffect(() => {
        if (session && highestUserAccess) {
            const searchURL = `/search/?type=ResourceFile&tags=clinical_manifest&sort=-file_status_tracking.${highestUserAccess}&status=${highestUserAccess}`;

            ajax.load(
                searchURL,
                (resp) => {
                    // Use the first item in the response
                    const latest_file = resp?.['@graph']?.[0];

                    if (latest_file?.href) {
                        // Update the download link
                        setDownloadLink(latest_file?.href);

                        // Rebuild the tooltip after the component mounts
                        ReactTooltip.rebuild();
                    }
                },
                'GET',
                () => {
                    console.log('Error loading Bulk Donor Metadata button');
                }
            );
        } else {
            setDownloadLink(null);
        }
    }, [session, highestUserAccess]);

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
