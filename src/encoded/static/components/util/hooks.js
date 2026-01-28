// Custom hook to determine if user is a member of SMaHT consortium
import { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

const defaultDownloadAccessObject = {
    open: false,
    'open-early': false,
    'open-network': false,
    protected: false,
    'protected-early': false,
    'protected-network': false,
    released: false,
    uploading: false,
    uploaded: false,
    retracted: false,
    'upload failed': false,
    'to be uploaded by workflow': false,
    'in review': false,
    obsolete: false,
    archived: false,
    deleted: false,
};
/**
 * Checks the session-properties endpoint to determine the statuses that a user
 * has access to. Ultimately used to determine whether to disable the download
 * button on file pages of certain types, and whether to transform links to
 * Browse by Donor page to Browse by ProtectedDonor page.
 *
 * @param {*} session
 * @returns {Object} An object representing downloadable access statuses
 */
export const useUserDownloadAccess = (session) => {
    const [downloadAccessObject, setDownloadAccessObject] = useState(
        defaultDownloadAccessObject
    );
    const [isAccessResolved, setIsAccessResolved] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsAccessResolved(false);

        if (session) {
            const userDownloadAccessObj = { ...defaultDownloadAccessObject };

            // If session exists, user has access to the following statuses
            userDownloadAccessObj['open'] = true;

            // Default to true when user is logged in. If it is visible, user
            // can likely download. Otherwise let backend enforce download
            // access.
            userDownloadAccessObj['released'] = true;
            userDownloadAccessObj['uploading'] = true;
            userDownloadAccessObj['uploaded'] = true;
            userDownloadAccessObj['retracted'] = true;
            userDownloadAccessObj['upload failed'] = true;
            userDownloadAccessObj['to be uploaded by workflow'] = true;
            userDownloadAccessObj['in review'] = true;
            userDownloadAccessObj['obsolete'] = true;
            userDownloadAccessObj['archived'] = true;
            userDownloadAccessObj['deleted'] = true;

            ajax.load(
                '/session-properties',
                (resp) => {
                    if (cancelled) return; // ignore stale response

                    // Get consortia associated with user
                    const userConsortia = resp?.details?.consortia || [];

                    // Check if user is a member of SMaHT consortium
                    const smaht_uuid = '358aed10-9b9d-4e26-ab84-4bd162da182b'; // SMaHT consortium UUID
                    const isMember = userConsortia?.includes(smaht_uuid);

                    // Get groups associated with user
                    const userGroups = resp?.details?.groups || [];

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
                    setIsAccessResolved(true);
                },
                'GET',
                (err) => {
                    if (
                        err?.notification !==
                        'No session property information found.'
                    ) {
                        console.error(
                            'ERROR determining session property information:',
                            err
                        );
                        setDownloadAccessObject(defaultDownloadAccessObject);
                        setIsAccessResolved(true);
                    }
                }
            );
        } else {
            setDownloadAccessObject(defaultDownloadAccessObject);
            setIsAccessResolved(true);
        }

        return () => {
            cancelled = true;
        };
    }, [session]);

    return { userDownloadAccess: downloadAccessObject, isAccessResolved };
};
