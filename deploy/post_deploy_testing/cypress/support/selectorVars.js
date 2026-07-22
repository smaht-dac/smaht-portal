/**
 * Store strings for commonly used selectors here, so we don't have to continuously re-define them
 */

// Navbar and Authentication
export const navBrowseByFileBtnSelector =
    '#overlays-container .big-dropdown-menu .container .col-12:first-child a.big-link:first-of-type';
export const navBrowseByDonorBtnSelector =
    '#overlays-container .big-dropdown-menu .container .col-12:first-child a.big-link:nth-of-type(2)';
export const navUserAcctDropdownBtnSelector =
    '#top-nav .navbar-collapse .navbar-acct.navbar-nav .user-account-item';
export const navUserAcctLoginBtnSelector =
    '#top-nav .navbar-collapse .navbar-acct.navbar-nav > a.user-account-item';
// Both the logged-out login button and the logged-in account menu carry the
// `.user-account-item` class, so `navUserAcctDropdownBtnSelector` alone cannot
// tell them apart. Use this selector whenever a check must only ever match the
// authenticated account menu (e.g. confirming login/logout actually applied).
export const navUserAcctLoggedInMenuSelector =
    '#top-nav .navbar-collapse .navbar-acct.navbar-nav a#account-menu-item.user-account-item';
export const dataNavBarItemSelectorStr =
    '#top-nav div.navbar-collapse .navbar-nav a.id-data-menu-item';
