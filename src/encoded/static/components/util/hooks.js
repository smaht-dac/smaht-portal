// Custom hook to determine if user is a member of SMaHT consortium
import { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

/**
 * Checks the session-properties endpoint to determine the statuses that a user
 * has access to. Ultimately used to determine whether to disable the download
 * button on file pages of certain types, and whether to transform links to
 * Browse by Donor page to Browse by ProtectedDonor page.
 *
 * @param {*} session
 * @returns {Object} An object representing downloadable access statuses
 */
export const useUserDownloadAccess = (session = false) => {
    const [downloadAccessObject, setDownloadAccessObject] = useState({
        open: session,
        'open-early': false,
        'open-network': false,
        protected: false,
        'protected-early': false,
        'protected-network': false,
    });

    useEffect(() => {
        if (session) {
            ajax.load(
                '/session-properties',
                (resp) => {
                    // Get consortia associated with user
                    const userConsortia = resp?.details?.consortia || [];

                    // Check if user is a member of SMaHT consortium
                    const smaht_uuid = '358aed10-9b9d-4e26-ab84-4bd162da182b'; // SMaHT consortium UUID
                    const isMember = userConsortia?.includes(smaht_uuid);

                    // Get groups associated with user
                    const userGroups = resp?.details?.groups || [];

                    const userDownloadAccessObj = { ...downloadAccessObject };

                    if (isMember) {
                        // User is a member of SMaHT
                        userDownloadAccessObj['open-early'] = true;
                        userDownloadAccessObj['open-network'] = true;

                        // User is either admin or dbgap member of SMaHT
                        if (
                            userGroups?.includes('admin') ||
                            userGroups?.includes('dbgap')
                        ) {
                            userDownloadAccessObj['protected'] = true;
                            userDownloadAccessObj['protected-early'] = true;
                            userDownloadAccessObj['protected-network'] = true;
                        }
                    } else {
                        // User is not a member of SMaHT
                        if (userGroups?.includes('public-dbgap')) {
                            userDownloadAccessObj['protected'] = true;
                        }
                    }

                    setDownloadAccessObject(userDownloadAccessObj);
                },
                'GET',
                (err) => {
                    if (isCancelled) return;

                    if (err?.notification !== 'No results found') {
                        console.error(
                            'ERROR determining user access statuses:',
                            err
                        );
                    }
                }
            );
        }
    }, [session]);

    return downloadAccessObject;
};
