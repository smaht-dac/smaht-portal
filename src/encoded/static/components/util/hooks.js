// Custom hook to determine if user is a member of SMaHT consortium
import { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

// Default download access object for non-logged in users
export const defaultDownloadAccessObject = {
    open: false,
    'open-early': false,
    'open-network': false,
    protected: false,
    'protected-early': false,
    'protected-network': false,
    released: false,
    uploading: true,
    uploaded: true,
    retracted: true,
    'upload failed': true,
    'to be uploaded by workflow': true,
    'in review': true,
    obsolete: true,
    archived: true,
    deleted: true,
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

    useEffect(() => {
        if (session) {
            const userDownloadAccessObj = {
                ...defaultDownloadAccessObject,
            };

            // If session exists, user has access to the following statuses
            userDownloadAccessObj['open'] = true;

            // Default to true when user is logged in. If it is visible, user
            // can likely download. Otherwise let backend enforce download
            // access.
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
                    const downloadPerms = {
                        ...userDownloadAccessObj,
                        ...(resp?.download_perms || {}),
                    };

                    console.log('User download permissions:', downloadPerms); // DEBUG

                    if (Object.keys(downloadPerms).length > 0) {
                        setDownloadAccessObject(downloadPerms);
                    }
                },
                'GET',
                (err) => {
                    if (err?.notification !== 'No results found') {
                        console.error(
                            'ERROR determining user access statuses:',
                            err
                        );
                    }
                }
            );
        } else {
            setDownloadAccessObject(defaultDownloadAccessObject);
        }
    }, [session]);

    return downloadAccessObject;
};
