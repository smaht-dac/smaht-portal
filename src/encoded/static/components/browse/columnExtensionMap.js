'use strict';

import React from 'react';
import _ from 'underscore';

import { basicColumnExtensionMap } from '@hms-dbmi-bgm/shared-portal-components/es/components/browse/components/table-commons';

export const DEFAULT_WIDTH_MAP = { lg: 200, md: 180, sm: 120, xs: 120 };

export const columnExtensionMap = {
    ...basicColumnExtensionMap,
    // Extend as needed for smaht search tables
};
