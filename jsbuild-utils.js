const path = require('path');
const fs = require('fs');

/**
 * Checks for active symlink and returns an object with link status and path to child repo
 * @returns Object {
 *      isLinked: boolean,
 *      sharedComponentPath: string || null
 * }
 */
function getLinkedSharedComponentsPath() {
    let sharedComponentPath = path.resolve(
        __dirname,
        'node_modules/@hms-dbmi-bgm/shared-portal-components'
    );
    const origPath = sharedComponentPath;

    // Follow any symlinks to get to real path.
    sharedComponentPath = fs.realpathSync(sharedComponentPath);

    const isLinked = origPath !== sharedComponentPath;

    console.log(
        '`@hms-dbmi-bgm/shared-portal-components` directory is',
        isLinked
            ? 'sym-linked to `' + sharedComponentPath + '`.'
            : 'NOT sym-linked.'
    );

    return {
        isLinked,
        sharedComponentPath: isLinked ? sharedComponentPath : null,
    };
}

module.exports = {
    getLinkedSharedComponentsPath,
};
