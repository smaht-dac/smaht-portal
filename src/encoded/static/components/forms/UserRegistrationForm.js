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

        this.formRef = React.createRef();
        this.recaptchaContainerRef = React.createRef();

        this.state = {
            captchaResponseToken: null,
            captchaErrorMsg: null,
            registrationStatus: 'form',
            isConsortiumMember: null,

            // These fields are required, so we store in state
            // to be able to do some as-you-type validation
            "value_for_first_name": null,
            "value_for_last_name": null,
            "value_for_affiliation_institution": null,
        };
    }

    onConsortiumMemberYes() {
        this.setState({ isConsortiumMember: true });
    }

    onConsortiumMemberNo() {
        this.setState({ isConsortiumMember: false });
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
    }

    componentDidUpdate(prevProps, prevState) {
        const { isConsortiumMember } = this.state;
        if (isConsortiumMember === false && prevState.isConsortiumMember !== false && !this.captchaJSTag && this.recaptchaContainerRef.current) {
            window.onRecaptchaLoaded = this.onRecaptchaLibLoaded;
            this.captchaJSTag = document.createElement('script');
            this.captchaJSTag.setAttribute(
                'src',
                'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit'
            );
            this.captchaJSTag.setAttribute('async', true);
            document.head.appendChild(this.captchaJSTag);
        }
        if (isConsortiumMember !== false && prevState.isConsortiumMember === false) {
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
        const { captchaSiteKey } = this.props;
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

    render() {
        const { schemas, heading, unverifiedUserEmail, onExitLinkClick } = this.props;
        const {
            registrationStatus, value_for_first_name, value_for_last_name, value_for_affiliation_institution,
            captchaErrorMsg: captchaError, isConsortiumMember
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
                <div
                    style={{
                        position: 'absolute',
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '3em',
                        color: 'rgba(0,0,0,0.8)',
                        backgroundColor: 'rgba(255,255,255,0.85)',
                        left: 0,
                        right: 0,
                        bottom: 0,
                        top: 0,
                    }}>
                    <div className="text-center" style={{ width: '100%' }}>
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

        return (
            <div
                className="user-registration-form-container"
                style={{ position: 'relative' }}>
                {errorIndicator}

                {heading}

                <div className="mb-1">
                    <div className="text-300 mb-2 mt-05 info-panel">
                        You have never logged in as <span className="text-600">{unverifiedUserEmail}</span> before.
                    </div>
                    <div className="mt-1 text-60 ps-1 text-500" style={{ paddingLeft: '10px' }}>Are you a member of the SMaHT Consortium?</div>
                    <div className="d-flex gap-3 mt-2 option-panel">
                        <Checkbox
                            checked={isConsortiumMember === true}
                            onChange={this.onConsortiumMemberYes}>
                            Yes, I am a member of SMaHT
                        </Checkbox>
                        <Checkbox
                            checked={isConsortiumMember === false}
                            onChange={this.onConsortiumMemberNo}>
                            No, I am&nbsp;<strong>not</strong>&nbsp;a member of SMaHT
                        </Checkbox>
                    </div>
                </div>

                {isConsortiumMember === true ? <SMaHTNetworkMember onExitLinkClick={onExitLinkClick} /> : isConsortiumMember === false ? (
                    <form
                        method="POST"
                        name="user-registration-form was-validated"
                        ref={this.formRef}
                        onSubmit={this.onFormSubmit}
                        style={{ fontSize: '0.9rem' }}>

                        <div className="form-group d-flex align-items-center gap-3 mt-2">
                            <label htmlFor="email-address" className="mb-1 text-500">
                                Primary Email:
                            </label>
                            <span id="email-address" className="text-300 fs-5">
                                {object.itemUtil.User.gravatar(unverifiedUserEmail, 36, { 'style': { 'borderRadius': '50%', 'marginRight': 20 } }, 'mm')}
                                {unverifiedUserEmail}
                            </span>
                        </div>

                        <div className="row mt-2">
                            <div className="col-12 col-md-6">
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
                            <div className="col-12 col-md-6">
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
                                    <label htmlFor="affiliation_institution" className="form-label mb-1 text-500">Affiliation/Institution{' '}
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
                                    By signing up, you are agreeing to our{' '}
                                    <a
                                        href="/privacy-policy"
                                        className="link-underline-hover"
                                        target="_blank"
                                        rel="noreferrer noopener">
                                        Privacy Policy
                                    </a>
                                    .
                                    <br />
                                    We may track your usage of the portal to help
                                    improve the quality of user experience and/or
                                    security assurance purposes.
                                </p>
                            </div>
                        </div>

                        <div className="mt-1 py-1" style={{ backgroundColor: '#f8f8f8' }}>
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

function SMaHTNetworkMember({
    onExitLinkClick,
    className = "",
}) {
    return (
        <section className={`container py-4 ${className}`}>
            <div className="row g-5">
                <div className="col-12">
                    <div className="d-flex align-items-center gap-2 mb-15 section-header">
                        <i className="icon icon-fw icon-users fas text-secondary" aria-hidden="true" />
                        <h3 className="h3 m-0 text-500" style={{ fontSize: '1.1rem' }}>SMaHT Members</h3>
                    </div>

                    <p className="fs-6">
                        If you have an account with a different email address, please{" "}
                        <a href="#" className="link-underline-hover" onClick={onExitLinkClick}>sign in here</a>.
                    </p>

                    <p className="fs-6 mt-3">
                        To create an account with full SMaHT consortium membership
                        permission you need to:
                    </p>

                    <ol className="fs-6 ps-15 mt-2">
                        <li>
                            <strong>Register with the OC</strong> with your institutional email address
                        </li>
                        <li>
                            <strong>Contact the DAC</strong> to create an account. Documentation on how to do
                            this can be found <a href="/docs/access/creating-an-account" target="_blank">here</a>.
                        </li>
                    </ol>
                </div>
            </div>
        </section>
    );
}