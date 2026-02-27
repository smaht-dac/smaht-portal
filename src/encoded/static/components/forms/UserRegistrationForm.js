'use strict';

import React from 'react';
import PropTypes from 'prop-types';
import _ from 'underscore';
import serialize from 'form-serialize';
import memoize from 'memoize-one';

import {
    console,
    object,
    ajax,
    JWT,
    analytics,
    logger,
} from '@hms-dbmi-bgm/shared-portal-components/es/components/util';
import { Checkbox } from '@hms-dbmi-bgm/shared-portal-components/es/components/forms/components/Checkbox';

export default class UserRegistrationForm extends React.PureComponent {
    static propTypes = {
        unverifiedUserEmail: PropTypes.string.isRequired,
        onComplete: PropTypes.func.isRequired,
        endpoint: PropTypes.string.isRequired,
        captchaSiteKey: PropTypes.string,
        onExitLinkClick: PropTypes.func.isRequired,
    };

    static defaultProps = {
        captchaSiteKey: '6Lf6dZYUAAAAAEq46tu1mNp0BTCyl0-_wuJAu3nj', // XXX: this needs to be resolved another way
        endpoint: '/create-unauthorized-user',
    };

    constructor(props) {
        super(props);
        this.onRecaptchaLibLoaded = this.onRecaptchaLibLoaded.bind(this);
        this.onReCaptchaResponse = this.onReCaptchaResponse.bind(this);
        this.onReCaptchaError = this.onReCaptchaError.bind(this);
        this.onReCaptchaExpiration = this.onReCaptchaExpiration.bind(this);

        this.onFirstNameChange = this.onFirstNameChange.bind(this);
        this.onLastNameChange = this.onLastNameChange.bind(this);
        this.onAffiliationInstitutionChange = this.onAffiliationInstitutionChange.bind(this);

        this.maySubmitForm = this.maySubmitForm.bind(this);
        this.onFormSubmit = this.onFormSubmit.bind(this);

        this.onConsortiumMemberYes = this.onConsortiumMemberYes.bind(this);
        this.onConsortiumMemberNo = this.onConsortiumMemberNo.bind(this);
        this.onGoToSelfRegistration = this.onGoToSelfRegistration.bind(this);

        this.formRef = React.createRef();
        this.recaptchaContainerRef = React.createRef();

        this.isInstitutionalEmail = this.isInstitutionalEmail.bind(this);

        this.state = {
            captchaSiteKey: this.props.captchaSiteKey,
            captchaResponseToken: null,
            captchaErrorMsg: null,
            registrationStatus: 'form',
            isConsortiumMember: null,
            showSelfRegistration: false,

            // These fields are required, so we store in state
            // to be able to do some as-you-type validation
            "value_for_first_name": null,
            "value_for_last_name": null,
            "value_for_affiliation_institution": null,
        };
    }

    onConsortiumMemberYes() {
        this.setState({ isConsortiumMember: true, showSelfRegistration: false });
    }

    onConsortiumMemberNo() {
        this.setState({ isConsortiumMember: false, showSelfRegistration: true });
    }

    onGoToSelfRegistration() {
        this.setState({ isConsortiumMember: false, showSelfRegistration: true }, () => {
            if (this.formRef.current && this.formRef.current.scrollIntoView) {
                this.formRef.current.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
            }
        });
    }

    componentDidMount() {
        // window.onRecaptchaLoaded = this.onRecaptchaLibLoaded;
        // this.captchaJSTag = document.createElement('script');
        // this.captchaJSTag.setAttribute(
        //     'src',
        //     'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit'
        // );
        // this.captchaJSTag.setAttribute('async', true);
        // document.head.appendChild(this.captchaJSTag);
        ajax.load(
            '/recaptcha_config?format=json',
            (resp) => {
                if (resp.RecaptchaKey) {
                    // set captchaSiteKey provided by /recaptcha_config
                    this.setState({
                        captchaSiteKey: resp.RecaptchaKey
                    });
                } else {
                    console.warn('No RecaptchaKey found in /recaptcha_config response -- cannot render reCaptcha!');
                }
            },
            'GET',
            (resp) => {
                console.error('Error loading reCaptcha config:', resp.error || resp.message);
            }
        );
    }

    componentDidUpdate(prevProps, prevState) {
        const { isConsortiumMember, showSelfRegistration } = this.state;
        const shouldShowSelfRegistration = isConsortiumMember === false || showSelfRegistration;
        const shouldHaveShownSelfRegistration =
            prevState.isConsortiumMember === false || prevState.showSelfRegistration;
        if (shouldShowSelfRegistration && !shouldHaveShownSelfRegistration && !this.captchaJSTag && this.recaptchaContainerRef.current) {
            window.onRecaptchaLoaded = this.onRecaptchaLibLoaded;
            this.captchaJSTag = document.createElement('script');
            this.captchaJSTag.setAttribute(
                'src',
                'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit'
            );
            this.captchaJSTag.setAttribute('async', true);
            document.head.appendChild(this.captchaJSTag);
        }
        if (!shouldShowSelfRegistration && shouldHaveShownSelfRegistration) {
            if (this.captchaJSTag) {
                document.head.removeChild(this.captchaJSTag);
                delete this.captchaJSTag;
            }
        }
    }

    componentWillUnmount() {
        if (this.captchaJSTag) {
            document.head.removeChild(this.captchaJSTag);
            delete this.captchaJSTag;
        }
    }

    onRecaptchaLibLoaded() {
        const { captchaSiteKey } = this.state;
        const { onReCaptchaResponse, onReCaptchaExpiration } = this;
        console.info('Loaded Google reCaptcha library..');
        grecaptcha.render(this.recaptchaContainerRef.current, {
            sitekey: captchaSiteKey,
            callback: onReCaptchaResponse,
            'error-callback': onReCaptchaExpiration,
            'expired-callback': onReCaptchaExpiration,
        });
    }

    /** We deliver token received here with POSTed form data for server-side validation. */
    onReCaptchaResponse(captchaResponseToken) {
        this.setState({ captchaResponseToken, captchaErrorMsg: null });
    }

    onReCaptchaError() {
        this.setState({
            captchaResponseToken: null,
            captchaErrorMsg: 'Please retry - likely network error encountered.',
        });
    }

    onReCaptchaExpiration() {
        this.setState({
            captchaResponseToken: null,
            captchaErrorMsg: 'Please retry - reCaptcha validation expired.',
        });
    }

    onFirstNameChange(e) {
        this.setState({ value_for_first_name: e.target.value });
    }

    onLastNameChange(e) {
        this.setState({ value_for_last_name: e.target.value });
    }

    onAffiliationInstitutionChange(e) {
        this.setState({ value_for_affiliation_institution: e.target.value });
    }

    onFormSubmit(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        const { endpoint, onComplete, unverifiedUserEmail } = this.props;
        const { value_for_affiliation_institution } = this.state;
        const maySubmit = this.maySubmitForm();
        const formData = serialize(this.formRef.current, { hash: true });

        if (!maySubmit) {
            return;
        }

        // Add data which is held in state but not form fields -- email & lab.
        formData.email = unverifiedUserEmail;
        if (value_for_affiliation_institution) { // Add affiliation_institution, if any.
            formData.institution = value_for_affiliation_institution;
            delete formData.affiliation_institution;
        }

        console.log('Full data being sent - ', formData);

        this.setState({ registrationStatus: 'loading' }, () => {
            // We may have lost our JWT, e.g. by opening a new 4DN window which unsets the cookie.
            // So we reset our cached JWT token to our cookies/localStorage prior to making request
            // so that it is delivered/authenticated as part of registration (required by backend/security).
            // var existingToken = JWT.get();
            // if (!existingToken){
            //     if (!jwtToken){
            //         this.setState({ 'registrationStatus' : 'network-failure' });
            //         return;
            //     }
            //     JWT.save(jwtToken);
            // }

            ajax.load(
                endpoint,
                (resp) => {
                    onComplete(); // <- Do request to login, then hide/unmount this component.
                },
                'POST',
                (err) => {
                    // TODO
                    // If validation failure, set / show status message, return;
                    // Else If unknown failure:
                    this.setState({ registrationStatus: 'network-failure' });
                    logger.error(
                        'Registration Error - Error on post to /create-unauthorized-user.'
                    );
                },
                JSON.stringify(formData)
            );
        });
    }

    maySubmitForm() {
        var {
            captchaResponseToken,
            value_for_first_name,
            value_for_last_name,
            value_for_affiliation_institution,
            registrationStatus,
        } = this.state;
        return (
            captchaResponseToken &&
            value_for_first_name &&
            value_for_last_name &&
            value_for_affiliation_institution &&
            registrationStatus === 'form'
        );
    }

    onGoogleLinkClick(e) {
        e.preventDefault();
        analytics.event('registration', 'UserRegistrationModal', 'CreateGoogleAccountLinkClick');
        window.open(e.target.href);
    }

    isInstitutionalEmail(email) {
        const lower = email.toLowerCase();

        const genericProviders = [
            "gmail.com",
            "yahoo.com",
            "outlook.com",
            "hotmail.com",
            "protonmail.com",
            "icloud.com",
            "aol.com",
            "yandex.com",
        ];

        const domain = lower.split("@")[1];

        const isEdu = domain.endsWith(".edu") || domain.includes(".edu.");
        const isOrg = domain.endsWith(".org") || domain.includes(".org.");

        const isGeneric = genericProviders.includes(domain);

        return (isEdu || isOrg) && !isGeneric;
    }

    render() {
        const { schemas, heading, unverifiedUserEmail, onExitLinkClick } = this.props;
        const {
            registrationStatus, value_for_first_name, value_for_last_name, value_for_affiliation_institution,
            captchaErrorMsg: captchaError, isConsortiumMember, showSelfRegistration
        } = this.state;

        const maySubmit = this.maySubmitForm();
        let errorIndicator = null;
        let loadingIndicator = null;

        if (registrationStatus === 'network-failure') {
            // TODO: Hide form in this case?
            errorIndicator = (
                <div className="alert alert-danger" role="alert">
                    <span className="text-500">
                        Failed to register new account. Please try again later.
                    </span>
                </div>
            );
        } else if (
            registrationStatus === 'loading' ||
            registrationStatus === 'success-loading'
        ) {
            loadingIndicator = (
                <div className="loading-indicator">
                    <div className="text-center w-100">
                        <i className="icon icon-spin icon-circle-notch fas" />
                    </div>
                </div>
            );
        } else if (
            registrationStatus === 'success' ||
            registrationStatus === 'success-loading'
        ) {
            errorIndicator = (
                <div className="alert alert-success" role="alert">
                    <span className="text-500">
                        <i className="icon icon-fw fas icon-circle-notch" />
                        &nbsp;&nbsp; Registered account, logging in...
                    </span>
                </div>
            );
        }

        const isInstitutional = this.isInstitutionalEmail(unverifiedUserEmail);
        const shouldShowSelfRegistration =
            isConsortiumMember === false || showSelfRegistration;

        return (
            <div className="user-registration-form-container position-relative">
                {errorIndicator}

                {heading}

                <div className={isConsortiumMember === true ? null : "mb-3"}>
                    <div className="text-300 mb-2 mt-05 info-panel">
                        You have never logged in as <span className="text-600">{unverifiedUserEmail}</span> before.
                    </div>
                    <div className="my-2 text-500">Are you a SMaHT Network member?</div>
                    <div className="d-flex gap-3 option-panel flex-column flex-lg-row">
                        <Checkbox
                            checked={isConsortiumMember === true}
                            onChange={this.onConsortiumMemberYes}
                            className="col-12 col-lg-auto">
                            Yes, I am a member of the SMaHT network
                        </Checkbox>
                        <Checkbox
                            checked={isConsortiumMember === false}
                            onChange={this.onConsortiumMemberNo}
                            className="col-12 col-lg-auto">
                            No, I am&nbsp;<strong>not</strong>&nbsp;a member of the SMaHT network
                        </Checkbox>
                    </div>
                </div>

                {isConsortiumMember === true ? (
                    <SMaHTNetworkMember onGoToSelfRegistration={this.onGoToSelfRegistration} />
                ) : null}
                {shouldShowSelfRegistration ? (
                    <form
                        className="user-registration-form"
                        method="POST"
                        name="user-registration-form was-validated"
                        ref={this.formRef}
                        onSubmit={this.onFormSubmit}
                        style={{ fontSize: '0.9rem' }}>

                        <div className="d-flex align-items-center gap-2 mb-15 mt-3 section-header">
                            <i className="icon icon-fw icon-user fas text-secondary fs-4 opacity-50" aria-hidden="true" />
                            <h3 className="section-title m-0">Self Registration</h3>
                        </div>

                        <div className="form-group d-flex flex-column flex-lg-row align-items-lg-center gap-0 gap-lg-3 mt-2">
                            <label htmlFor="email-address" className="text-500">
                                Email:
                            </label>

                            <span id="email-address" className="text-300 fs-5">
                                {object.itemUtil.User.gravatar(unverifiedUserEmail, 36, { 'style': { 'borderRadius': '50%', 'marginRight': 20 } }, 'mm')}
                                {unverifiedUserEmail}
                            </span>

                            <button type="button" className="btn btn-link btn-sm ms-1 p-0 change-email-link d-none" onClick={onExitLinkClick}>
                                Change
                            </button>
                        </div>

                        {!isInstitutional && (
                            <div className="email-warning-message mt-1 mb-1 d-none">
                                <strong>Please use your institutional or organizational email address.</strong><br />
                                Free email providers may reduce verification options and access levels.
                            </div>
                        )}

                        <div className="row mt-2">
                            <div className="col-12 col-lg-6">
                                <div className="form-group">
                                    <label htmlFor="firstName" className="mb-1 text-500">
                                        First Name{' '}
                                        <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        name="first_name"
                                        type="text"
                                        onChange={this.onFirstNameChange}
                                        className={
                                            'form-control' +
                                            (value_for_first_name === ''
                                                ? ' is-invalid'
                                                : '')
                                        }
                                    />
                                    <div className="invalid-feedback">
                                        First name cannot be blank
                                    </div>
                                </div>
                            </div>
                            <div className="col-12 col-lg-6 mt-3 mt-lg-0">
                                <div className="form-group">
                                    <label htmlFor="lastName" className="mb-1 text-500">
                                        Last Name{' '}
                                        <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        name="last_name"
                                        type="text"
                                        onChange={this.onLastNameChange}
                                        className={
                                            'form-control' +
                                            (value_for_last_name === ''
                                                ? ' is-invalid'
                                                : '')
                                        }
                                    />
                                    <div className="invalid-feedback">
                                        Last name cannot be blank
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="row mt-3">
                            <div className="col-12">
                                <div className="form-group">
                                    <label htmlFor="affiliation_institution" className="form-label mb-1 text-500">Affiliation / Institution{' '}
                                        <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        name="affiliation_institution"
                                        type="text"
                                        onChange={this.onAffiliationInstitutionChange}
                                        className={
                                            'form-control' +
                                            (value_for_affiliation_institution === ''
                                                ? ' is-invalid'
                                                : '')
                                        }
                                    />
                                    <div className="invalid-feedback">
                                        Affiliation/Institution cannot be blank
                                    </div>
                                    <div className="text-end text-danger mt-05" style={{ fontSize: '0.75rem' }}>
                                        *Required
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="row mt-3">
                            <div className="col-12">
                                <div className="alert alert-danger d-flex align-items-center" role="alert">
                                    <i className="fas icon icon-file-shield me-2 fs-2"></i>
                                    <div>
                                        <p className="mb-2">
                                            <strong>Self-registration as a non-SMaHT-Network member</strong> will give you access to open-access data <em>only</em>.
                                        </p>
                                        <p className="mb-0">
                                            <strong>If you want protected-access data:</strong> You are <strong>required</strong> to self-register using your institutional email address linked to the NIH/eRA or Login.gov and obtain dbGaP approval for protected-access SMaHT data. Learn how to obtain dbGaP approval <a href="/docs/access/getting-dbgap-access" target="_blank" rel="noreferrer noopener">here</a>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="row mt-3">
                            <div className="col-12 col-lg-5">
                                <div
                                    className={
                                        'recaptcha-container' +
                                        (captchaError ? ' has-error' : '')
                                    }>
                                    <div
                                        className="g-recaptcha"
                                        ref={this.recaptchaContainerRef}
                                    />
                                    {captchaError ? (
                                        <span className="help-block">
                                            {captchaError}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className="col-12 col-lg-7">
                                <p className="fs-6 lh-lg ps-05">
                                    By registering, you are agreeing to the{' '}
                                    <a
                                        href="/privacy-policy"
                                        className="link-underline-hover"
                                        target="_blank"
                                        rel="noreferrer noopener">
                                        SMaHT Portal User Privacy Policy
                                    </a>
                                    . We may track your usage of the portal to help
                                    improve the quality of user experience and/or
                                    security assurance purposes.
                                </p>
                            </div>
                        </div>

                        <div className="footer-button-container mt-1 py-1">
                            <div className="d-grid gap-1 my-3">
                                <button type="submit"
                                    disabled={!maySubmit}
                                    className="btn btn-lg btn-primary text-300">
                                    Sign Up
                                </button>
                            </div>
                        </div>
                    </form>
                ) : null}

                {loadingIndicator}
            </div>
        );
    }
}

function SMaHTNetworkMember({ onGoToSelfRegistration, className = "" }) {
    const emailOC = "smahtsupport@gowustl.onmicrosoft.com";
    const emailDAC = "smhelp@hms-dbmi.atlassian.net";
    return (
        <React.Fragment>
            <section className={`mt-3 mb-3 ${className}`}>
                <div className="network-member-panel">
                    <div className="d-flex align-items-center gap-2 mb-2 section-header">
                        <i className="icon icon-fw icon-users fas text-secondary fs-4" aria-hidden="true" />
                        <h3 className="section-title m-0">SMaHT Network Members</h3>
                    </div>

                    <p className="fs-6 mb-25">
                        Network members have early access to the SMaHT data, and their accounts have
                        different privileges than those who self-register at the portal. To register as
                        a network member you must follow these steps:
                    </p>

                    <div className="row g-3">
                        <div className="col-12 col-lg-6">
                            <div className="network-member-step">
                                <h4 className="network-member-step-title">Step 1: Get Verified by the OC</h4>
                                <p className="mb-2">
                                    Email the OC <a href={`mailto:${emailOC}`} target="_blank" rel="noreferrer noopener">here</a> to get verified and added to the SMaHT Network Directory.
                                </p>
                                <ul className="mb-0">
                                    <li>
                                        When contacting OC, the new Network members should cc their PIs and provide
                                        their institutional email address.
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <div className="col-12 col-lg-6">
                            <div className="network-member-step">
                                <h4 className="network-member-step-title">Step 2: Contact DAC</h4>
                                <p className="mb-2">
                                    Contact the DAC <a href={`mailto:${emailDAC}`} target="_blank" rel="noreferrer noopener">here</a> to be added to the list of approved members.
                                </p>
                                <ul className="mb-0">
                                    <li>
                                        Provide your full name and institutional email address in the SMaHT Network Directory (<em>very important!</em>).
                                    </li>
                                    <li>
                                        Indicate the name of your PI and institution and your membership verification with the OC.
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <p className="fs-6 mt-25 mb-2">
                        After you follow the steps above, you will be notified when your full access network account is ready for login.
                    </p>
                    <p className="fs-6 mb-0">
                        To access open data on the SMaHT portal today, you can self register below with the same institutional email and name you plan to provide to the OC and DAC.
                    </p>
                </div>
            </section>
            <div className="footer-button-container network-member-footer py-1">
                <div className="d-flex flex-column flex-lg-row justify-content-end gap-2 py-2">
                    <button
                        type="button"
                        className="btn btn-md btn-outline-primary text-500"
                        onClick={onGoToSelfRegistration}>
                        Go to Self Registration
                    </button>
                    <a
                        href={`mailto:${emailOC}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="btn btn-md btn-primary text-500">
                        Email OC
                    </a>
                </div>
            </div>
        </React.Fragment>
    );
}
