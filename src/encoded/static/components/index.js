'use strict';

// Require all components to ensure javascript load ordering

/**
 * Here we import all of our Content Views (Page Views) and register them
 * to `globals.content_views` so that they may be picked up and routed to in
 * the root `App` component.
 *
 * Individual item-type-view files might themselves register a PageTitle panel view.
 */

import { content_views } from './globals';

import StaticPage from './static-pages/StaticPage';
import DirectoryPage from './static-pages/DirectoryPage';

import HomePage from './static-pages/HomePage';
import StatisticsPageView from './static-pages/StatisticsPageView';

import DefaultItemView from './item-pages/DefaultItemView';
import HealthView from './item-pages/HealthView';
import UserView, { ImpersonateUserForm } from './item-pages/UserView';
import SchemaView from './item-pages/SchemaView';
import FallbackView from './item-pages/FallbackView';
import DocumentView from './item-pages/DocumentView';
import StaticSectionView from './item-pages/StaticSectionView';
import SMaHTSubmissionView from './forms/SMaHTSubmissionView';
import SearchView from './browse/SearchView';
import BrowseView from './browse/BrowseView';
import FileSearchView from './browse/FileSearchView';
import FileView from './item-pages/FileView';
import DonorView from './item-pages/DonorView';

/**
 * These content_view.register actions occur in this index.js as otherwise
 * the item-type-view files might not be included in the compiled build.js
 * due to webpack/babel tree-shaking config/plugins.
 */
content_views.register(StaticPage, 'StaticPage');
content_views.register(DirectoryPage, 'DirectoryPage');

content_views.register(HomePage, 'HomePage');
content_views.register(StatisticsPageView, 'StatisticsPage');

content_views.register(DefaultItemView, 'Item');
content_views.register(HealthView, 'Health');
content_views.register(DocumentView, 'Document');
content_views.register(DocumentView, 'Image');
content_views.register(SchemaView, 'JSONSchema');
content_views.register(UserView, 'User');
content_views.register(ImpersonateUserForm, 'User', 'impersonate-user');
content_views.register(StaticSectionView, 'StaticSection');
content_views.register(FileView, 'File');
content_views.register(DonorView, 'ProtectedDonor');

content_views.register(SMaHTSubmissionView, 'Item', 'edit');
content_views.register(SMaHTSubmissionView, 'Item', 'create');
content_views.register(SMaHTSubmissionView, 'Item', 'clone');
content_views.register(SMaHTSubmissionView, 'Search', 'add');

content_views.register(SearchView, 'Search');
content_views.register(SearchView, 'Search', 'selection');
content_views.register(SearchView, 'Search', 'multiselect');

content_views.register(BrowseView, 'Browse');
content_views.register(BrowseView, 'Browse', 'selection');
content_views.register(BrowseView, 'Browse', 'multiselect');

content_views.register(FileSearchView, 'FileSearchResults');
content_views.register(FileSearchView, 'SubmittedFileSearchResults');

// Fallback for anything we haven't registered
content_views.fallback = function () {
    return FallbackView;
};

import App from './app';

export default App;
