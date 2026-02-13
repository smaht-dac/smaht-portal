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
    const [isAccessResolved, setIsAccessResolved] = useState(false);

    useEffect(() => {
        let cancelled = false;

        // If no session, return default access object
        if (!session) {
            setDownloadAccessObject(defaultDownloadAccessObject);
            setIsAccessResolved(true);
        }

        setIsAccessResolved(false);

        const baseAccessPerms = {
            ...defaultDownloadAccessObject,
            open: true, // Logged in users have access to open files
        };

        ajax.load(
            '/session-properties',
            (resp) => {
                // ignore stale response
                if (cancelled) return;

                const mergedAccessPerms = {
                    ...baseAccessPerms,
                    ...(resp?.download_perms || {}),
                };
                console.log('Download Access Object', mergedAccessPerms);

                setDownloadAccessObject(mergedAccessPerms);
                setIsAccessResolved(true);
            },
            'GET',
            (err) => {
                if (cancelled) return;
                if (
                    err?.notification !==
                    'No session property information found.'
                ) {
                    console.error(
                        'ERROR determining session property information:',
                        err
                    );
                }
                setDownloadAccessObject(defaultDownloadAccessObject);
                setIsAccessResolved(true);
            }
        );

        return () => {
            cancelled = true;
        };
    }, [session]);

    return { userDownloadAccess: downloadAccessObject, isAccessResolved };
};
