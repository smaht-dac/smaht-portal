// Custom hook to determine if user is a member of SMaHT consortium
import { useState, useEffect } from 'react';
import { ajax } from '@hms-dbmi-bgm/shared-portal-components/es/components/util';

/**
 * Custom hook to determine if user is a member of SMaHT consortium by
 * requesting user permissions from /session-properties endpoint.
 *
 * Note: If session is false, will always return false.
 *
 * @param {*} session
 * @returns {boolean} isConsortiumMember
 */
export const useIsConsortiumMember = (session = false) => {
    const [isConsortiumMember, setIsConsortiumMember] = useState(false);

    useEffect(() => {
        let isCancelled = false;

        if (session) {
            ajax.load(
                '/session-properties',
                (resp) => {
                    if (isCancelled) return;

                    const smaht_uuid = '358aed10-9b9d-4e26-ab84-4bd162da182b'; // SMaHT consortium UUID

                    const isMember =
                        resp?.details?.consortia?.includes(smaht_uuid);
                    setIsConsortiumMember(Boolean(isMember));
                },
                'GET',
                (err) => {
                    if (isCancelled) return;

                    if (err?.notification !== 'No results found') {
                        console.error(
                            'ERROR determining user consortium membership:',
                            err
                        );
                    }
                    setIsConsortiumMember(false);
                }
            );
        } else {
            // If no session, user can't be a member
            setIsConsortiumMember(false);
        }

        return () => {
            isCancelled = true; // Prevent setting state if unmounted or session changes
        };
    }, [session]);

    return isConsortiumMember;
};
