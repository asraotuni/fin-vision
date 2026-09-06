import { Amplify } from 'aws-amplify';
import { confirmSignIn, fetchAuthSession, signIn, signInWithRedirect, signOut, signUp, confirmSignUp, resendSignUpCode, autoSignIn } from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { sessionStorage as authSessionStorage } from 'aws-amplify/utils';
import { Hub } from 'aws-amplify/utils';
import 'aws-amplify/auth/enable-oauth-listener';
import { ADDRESS_SCOPE, BIRTHDAY_SCOPE, googleSubject, readGoogleProfile, plannerNameDefaults, ageFromBirthday } from './auth-profile.js';

import { createMobileConnection } from './connect-mobile.js';
import { connectGoogle } from './connect-google.js';

const byId = id => document.getElementById(id);
let config;
let currentSubject;
let isGoogleSession = false;
let otpPhoneNumber = '';
let signedIn = false;
let plannerLoaded = false;
let syncPending;
let tokenClient;
let sessionGeneration = 0;
let authenticatedSubject;
let otpMode = 'signin';
let otpBusy = false;
let linkingBusy = false;
let mobileConnection;
let secondaryToken;
let googleConnection;
let mobileSkipped = false;

async function accountRequest(action, extra = {}){
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if(!token || !config.identityUrl) throw new Error('Account service is not configured. Please sign in again after setup.');
  const response = await fetch(config.identityUrl, {
    method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'},
    body:JSON.stringify({action, ...extra}), cache:'no-store',
  });
  const result = await response.json();
  if(!response.ok) throw new Error(result.message || 'Account service is unavailable. Please retry.');
  return result;
}

function lockPlanner(message = 'Sign in with your mobile number or Google to continue.'){
  sessionGeneration += 1;
  signedIn = false;
  tokenClient = null;
  if(window.finVisionUserId){
    sessionStorage.removeItem(`hiramyatech-session-plan:${window.finVisionUserId}`);
  }
  window.finVisionUserId = null;
  window.finVisionProfile = null;
  mobileConnection = null;
  secondaryToken = null;
  googleConnection?.abort();
  currentSubject = null;
  authenticatedSubject = null;
  isGoogleSession = false;
  byId('plannerWorkspace').hidden = true;
  byId('accountPanel').hidden = true;
  byId('resetDataBtn').hidden = true;
  byId('signOutBtn').hidden = true;
  byId('loginPanel').hidden = false;
  byId('addMobilePanel').hidden = true;
  byId('accountEmail').textContent = '';
  byId('accountLinkStatus').textContent = '';
  byId('retryAccountBtn').hidden = true;
  byId('accountName').textContent = 'Not provided';
  byId('accountMethod').textContent = 'Not provided';
  byId('accountDob').textContent = 'Not shared';
  byId('accountCountry').textContent = 'Not shared';
  byId('profileStatus').textContent = '';
  byId('googleProfileDetails').hidden = true;
  byId('shareGoogleProfileBtn').disabled = true;
  byId('authStatus').textContent = message;
}

async function loadPlanner(){
  if(plannerLoaded) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('app.js', document.baseURI).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Planner failed to load. Reload the page to try again.'));
    document.body.appendChild(script);
  });
  plannerLoaded = true;
}

async function synchronize(){
  const generation = sessionGeneration;
  const session = await fetchAuthSession();
  if(generation !== sessionGeneration) return;
  const payload = session.tokens?.idToken?.payload;
  const subject = payload && googleSubject(payload);
  if(!payload?.sub){
    lockPlanner();
    return;
  }
  if(signedIn){
    if(authenticatedSubject !== payload.sub){
      lockPlanner('Your account changed. Reload to continue with the new account.');
    }
    return;
  }
  const defaults = plannerNameDefaults(payload);
  const identity = Object.values(defaults).some(Boolean)
    ? await accountRequest('seedProfile', {profile:defaults}) : await accountRequest('resolve');
  if(generation !== sessionGeneration) return;
  if(typeof identity.accountId !== 'string' || !identity.accountId) throw new Error('Account identity could not be verified.');
  if(plannerLoaded){ window.location.replace(config.redirectUrl); return; }
  window.finVisionUserId = identity.accountId;
  authenticatedSubject = payload.sub;
  currentSubject = subject;
  isGoogleSession = Boolean(subject);
  window.finVisionProfile = identity.profile || defaults;
  await loadPlanner();
  if(generation !== sessionGeneration) return;
  signedIn = true;
  byId('accountMethod').textContent = isGoogleSession ? 'Google' : payload.phone_number ? 'Mobile number + OTP' : 'Email';
  updateConnectedMethods(identity);
  byId('accountEmail').textContent = payload.email ? `Google email: ${payload.email}` : '';
  byId('accountName').textContent = identity.profile ? [identity.profile.firstName,identity.profile.lastName].filter(Boolean).join(' ') || 'Not provided' : payload.name || [payload.given_name,payload.family_name].filter(Boolean).join(' ') || 'Not provided';
  byId('loginPanel').hidden = true;
  byId('retryAccountBtn').hidden = true;
  byId('accountPanel').hidden = false;
  byId('plannerWorkspace').hidden = false;
  byId('resetDataBtn').hidden = false;
  byId('signOutBtn').hidden = false;
  byId('googleProfileDetails').hidden = !isGoogleSession;
  if(isGoogleSession) prepareProfileConsent();
}

function syncSession(){
  if(!syncPending){
    syncPending = synchronize().catch(error => {
      lockPlanner(error.message || 'Your session could not be verified. Please sign in again.');
      byId('retryAccountBtn').hidden = false;
      byId('signOutBtn').hidden = false;
    }).finally(() => { syncPending = null; });
  }
  return syncPending;
}

byId('retryAccountBtn').addEventListener('click', () => syncSession());

byId('saveAccountNameBtn').addEventListener('click', async () => {
  if(!signedIn) return;
  const generation = sessionGeneration;
  const button = byId('saveAccountNameBtn');
  button.disabled = true;
  byId('nameSaveStatus').textContent = 'Saving your name…';
  try {
    const identity = await accountRequest('saveProfile', {profile:{firstName:byId('firstName').value,lastName:byId('lastName').value}});
    if(!signedIn || generation !== sessionGeneration) return;
    window.finVisionProfile = identity.profile;
    byId('accountName').textContent = [identity.profile.firstName,identity.profile.lastName].filter(Boolean).join(' ') || 'Not provided';
    byId('nameSaveStatus').textContent = 'Name saved for Google and mobile sign-in.';
  } catch(error){
    if(signedIn && generation === sessionGeneration) byId('nameSaveStatus').textContent = error.message || 'Could not save your name. Please retry.';
  } finally { button.disabled = false; }
});

let googleScriptPromise;
function loadGoogleLibrary(){
  if(window.google?.accounts?.oauth2) return Promise.resolve();
  if(!googleScriptPromise){
    googleScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const timeout = setTimeout(() => reject(new Error('Google did not load. Reload to retry.')), 15000);
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Google could not load. Reload to retry.')); };
      document.head.appendChild(script);
    });
  }
  return googleScriptPromise;
}

async function prepareProfileConsent(){
  if(!isGoogleSession || !currentSubject) return;
  const generation = sessionGeneration;
  try {
    if(!config.googleClientId) throw new Error('Profile sharing is not available yet. You can continue planning.');
    await loadGoogleLibrary();
    if(!signedIn || generation !== sessionGeneration) return;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id:config.googleClientId,
      // This token is separate from Cognito sign-in: people/me also needs profile.
      scope:`openid profile ${BIRTHDAY_SCOPE} ${ADDRESS_SCOPE}`,
      include_granted_scopes:false,
      login_hint:currentSubject,
      callback:async response => {
        if(!signedIn || generation !== sessionGeneration) return;
        try {
          if(response.error || !response.access_token) throw new Error('Details were not shared. You can continue planning or try again.');
          byId('profileStatus').textContent = 'Reading the details shared by Google…';
          const details = await readGoogleProfile(response.access_token, response.scope || '', currentSubject);
          if(!signedIn || generation !== sessionGeneration) return;
          byId('accountDob').textContent = details.birthday;
          byId('accountCountry').textContent = details.country;
          const age = ageFromBirthday(details.birthday);
          if(age !== null) window.finVisionApplyGoogleAge?.(age);
          byId('profileStatus').textContent = 'Shared details are displayed here. If available, your age fills an untouched planner field and remains editable. Your planner draft stays only in this tab.';
        } catch(error){
          if(signedIn && generation === sessionGeneration) byId('profileStatus').textContent = error.message;
        } finally {
          // Never store Google's People API access token in browser storage.
          response.access_token = '';
          byId('shareGoogleProfileBtn').disabled = !signedIn;
        }
      },
      error_callback:() => {
        if(!signedIn) return;
        byId('profileStatus').textContent = 'The Google consent window was closed or blocked. Allow popups and try again, or continue without sharing.';
        byId('shareGoogleProfileBtn').disabled = false;
      },
    });
    byId('shareGoogleProfileBtn').disabled = false;
  } catch(error){
    if(signedIn) byId('profileStatus').textContent = error.message;
  }
}

byId('shareGoogleProfileBtn').addEventListener('click', () => {
  if(!signedIn || !isGoogleSession || !tokenClient) return;
  byId('shareGoogleProfileBtn').disabled = true;
  byId('profileStatus').textContent = 'Choose which details to share in the Google consent window.';
  try { tokenClient.requestAccessToken({prompt:'consent'}); }
  catch {
    byId('shareGoogleProfileBtn').disabled = false;
    byId('profileStatus').textContent = 'Google consent could not open. Please try again.';
  }
});

function normalizeIndianPhoneNumber(value){
  const digits = value.replace(/\D/g, '');
  if(digits.length === 10 && /^[6-9]/.test(digits)) return `+91${digits}`;
  if(digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return `+${digits}`;
  return '';
}

function setOtpForm(step){
  byId('mobileOtpForm').hidden = step !== 'phone';
  byId('verifyOtpForm').hidden = step !== 'code';
}

async function handleOtpStep(nextStep){
  if(nextStep?.signInStep === 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION'){
    const result = await confirmSignIn({challengeResponse:'SMS_OTP'});
    return handleOtpStep(result.nextStep);
  }
  if(nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_SMS_CODE'){
    byId('otpDestination').textContent = otpPhoneNumber;
    byId('otpCode').value = '';
    setOtpForm('code');
    byId('otpCode').focus();
    byId('authStatus').textContent = `We sent a one-time password to ${otpPhoneNumber}.`;
    return;
  }
  if(nextStep?.signInStep === 'DONE'){
    byId('authStatus').textContent = 'Signing you in…';
    await syncSession();
    return;
  }
  throw new Error('Mobile sign-in could not continue. Please request a new OTP.');
}

async function requestOtp(createAccount = false){
  if(otpBusy) return;
  const mobileNumber = normalizeIndianPhoneNumber(byId('mobileNumber').value);
  if(!mobileNumber){
    byId('authStatus').textContent = 'Enter a valid 10-digit Indian mobile number.';
    byId('mobileNumber').focus();
    return;
  }
  otpPhoneNumber = mobileNumber;
  otpBusy = true;
  const submitButton = byId('mobileOtpForm').querySelector('button[type="submit"]');
  submitButton.disabled = true;
  byId('mobileSignupBtn').disabled = true;
  byId('authStatus').textContent = 'Sending OTP…';
  try {
    if(createAccount){
      otpMode = 'signup';
      const result = await signUp({username:mobileNumber, options:{userAttributes:{phone_number:mobileNumber}, autoSignIn:{authFlowType:'USER_AUTH'}}});
      await handleSignUpStep(result.nextStep);
      return;
    }
    otpMode = 'signin';
    const result = await signIn({
      username: mobileNumber,
      options: {authFlowType:'USER_AUTH', preferredChallenge:'SMS_OTP'},
    });
    await handleOtpStep(result.nextStep);
  } catch(error){
    if(error.name === 'UserNotConfirmedException'){
      otpMode = 'signup';
      try {
        await resendSignUpCode({username:mobileNumber});
        await handleOtpStep({signInStep:'CONFIRM_SIGN_IN_WITH_SMS_CODE'});
        return;
      } catch(resendError){ error = resendError; }
    }
    byId('authStatus').textContent = error.message || 'The OTP could not be sent. Please try again.';
  } finally {
    submitButton.disabled = false;
    byId('mobileSignupBtn').disabled = false;
    otpBusy = false;
  }
}

async function handleSignUpStep(nextStep){
  if(nextStep?.signUpStep === 'CONFIRM_SIGN_UP'){
    await handleOtpStep({signInStep:'CONFIRM_SIGN_IN_WITH_SMS_CODE'});
  } else if(nextStep?.signUpStep === 'COMPLETE_AUTO_SIGN_IN'){
    otpMode = 'signin';
    await handleOtpStep((await autoSignIn()).nextStep);
  } else if(nextStep?.signUpStep === 'DONE'){
    otpMode = 'signin';
    await handleOtpStep((await signIn({username:otpPhoneNumber, options:{authFlowType:'USER_AUTH', preferredChallenge:'SMS_OTP'}})).nextStep);
  } else {
    throw new Error('Mobile registration could not continue. Please try again.');
  }
}

byId('mobileSignupBtn').addEventListener('click', () => requestOtp(true));

byId('mobileOtpStartBtn').addEventListener('click', () => {
  if(otpBusy) return;
  setOtpForm('phone');
  byId('mobileNumber').focus();
  byId('authStatus').textContent = 'Enter your Indian mobile number to receive a one-time password.';
});

byId('mobileOtpForm').addEventListener('submit', event => {
  event.preventDefault();
  if(otpBusy) return;
  requestOtp();
});

byId('verifyOtpForm').addEventListener('submit', async event => {
  event.preventDefault();
  if(otpBusy) return;
  const code = byId('otpCode').value.trim();
  if(!/^(?:[0-9]{6}|[0-9]{8})$/.test(code)){
    byId('authStatus').textContent = 'Enter the complete 6- or 8-digit code from your SMS.';
    return;
  }
  const submitButton = byId('verifyOtpForm').querySelector('button[type="submit"]');
  otpBusy = true;
  submitButton.disabled = true;
  byId('authStatus').textContent = 'Verifying OTP…';
  try {
    if(otpMode === 'signup'){
      await handleSignUpStep((await confirmSignUp({username:otpPhoneNumber, confirmationCode:code})).nextStep);
      return;
    }
    const result = await confirmSignIn({challengeResponse:code});
    await handleOtpStep(result.nextStep);
  } catch(error){
    byId('authStatus').textContent = error.message || 'The OTP could not be verified. Check it and try again.';
  } finally {
    submitButton.disabled = false;
    otpBusy = false;
  }
});

byId('resendOtpBtn').addEventListener('click', async () => {
  if(otpBusy) return;
  if(otpMode !== 'signup') return requestOtp();
  otpBusy = true;
  try { await resendSignUpCode({username:otpPhoneNumber}); byId('authStatus').textContent = 'A new verification code was requested.'; }
  catch(error){ byId('authStatus').textContent = error.message || 'Could not resend the code.'; }
  finally { otpBusy = false; }
});
byId('changeMobileBtn').addEventListener('click', () => {
  if(otpBusy) return;
  setOtpForm('phone');
  byId('mobileNumber').focus();
  byId('authStatus').textContent = 'Update your mobile number and request a new OTP.';
});

byId('googleSignInBtn').addEventListener('click', async () => {
  if(otpBusy) return;
  // Recreate the planner on the next login rather than reusing another session's form.
  if(plannerLoaded){ window.location.replace(config.redirectUrl); return; }
  byId('googleSignInBtn').disabled = true;
  byId('authStatus').textContent = 'Opening Google sign-in…';
  try { await signInWithRedirect({provider:'Google'}); }
  catch {
    byId('authStatus').textContent = 'Google sign-in could not start. Please try again.';
    byId('googleSignInBtn').disabled = false;
  }
});

byId('signOutBtn').addEventListener('click', async () => {
  byId('signOutBtn').disabled = true;
  lockPlanner('Signing out…');
  try { await signOut(); }
  catch {
    byId('authStatus').textContent = 'Sign-out could not finish. Reload and try again.';
  } finally { byId('signOutBtn').disabled = false; }
});

function updateConnectedMethods(identity){
  byId('accountIdentitySummary').textContent = identity.linkedIdentityCount > 1
    ? 'Google and mobile sign-in are connected to your account.' : 'Add another way to sign in whenever you like.';
  byId('addMobilePanel').hidden = !isGoogleSession || identity.linkedIdentityCount > 1 || mobileSkipped;
  byId('showMobileBtn').hidden = !isGoogleSession || identity.linkedIdentityCount > 1 || !mobileSkipped;
  byId('connectGooglePanel').hidden = isGoogleSession || identity.linkedIdentityCount > 1;
}

async function finishConnection(accessToken, generation){
  if(!signedIn || generation !== sessionGeneration) return;
  secondaryToken = accessToken;
  const identity = await accountRequest('connect',{accessToken});
  if(!signedIn || generation !== sessionGeneration) return;
  if(identity.accountId !== window.finVisionUserId) throw new Error('Your account changed. Reload before continuing.');
  secondaryToken = null;
  mobileConnection = null;
  updateConnectedMethods(identity);
  byId('accountLinkStatus').textContent = 'Connected. You can now sign in with Google or your mobile number.';
  byId('connectMobileCode').value = '';
}

async function connectionTask(work){
  if(!signedIn || linkingBusy) return;
  const generation = sessionGeneration;
  linkingBusy = true;
  document.querySelectorAll('#addMobilePanel button, #connectGoogleBtn').forEach(button => {button.disabled=true;});
  byId('accountLinkStatus').textContent = 'Verifying…';
  try { await work(generation); }
  catch(error){ if(signedIn && generation === sessionGeneration) byId('accountLinkStatus').textContent = error.message; }
  finally {
    linkingBusy = false;
    document.querySelectorAll('#addMobilePanel button, #connectGoogleBtn').forEach(button => {button.disabled=false;});
  }
}

async function mobileConnectionStep(result, generation){
  if(!signedIn || generation !== sessionGeneration) return;
  if(result.accessToken) return finishConnection(result.accessToken,generation);
  byId('connectMobileForm').hidden = true;
  byId('connectMobileCodeForm').hidden = false;
  byId('connectMobileCode').value = '';
  byId('connectMobileCode').focus();
  byId('accountLinkStatus').textContent = 'Enter the code from your SMS to connect this number.';
}
byId('connectMobileForm').addEventListener('submit', event => {
  event.preventDefault();
  const phone = normalizeIndianPhoneNumber(byId('connectMobileNumber').value);
  if(!phone){ byId('accountLinkStatus').textContent = 'Enter a valid 10-digit Indian mobile number.'; return; }
  connectionTask(async generation => {
    secondaryToken = null;
    mobileConnection = createMobileConnection(config.auth);
    byId('connectMobileDestination').textContent = phone;
    await mobileConnectionStep(await mobileConnection.start(phone),generation);
  });
});
byId('connectMobileCodeForm').addEventListener('submit', event => {
  event.preventDefault();
  const code = byId('connectMobileCode').value.trim();
  if(!/^(?:[0-9]{6}|[0-9]{8})$/.test(code)){ byId('accountLinkStatus').textContent = 'Enter the complete 6- or 8-digit code from your SMS.'; return; }
  connectionTask(async generation => {
    if(secondaryToken) return finishConnection(secondaryToken,generation);
    if(!mobileConnection) throw new Error('Request a new verification code.');
    await mobileConnectionStep(await mobileConnection.confirm(code),generation);
  });
});
byId('resendConnectMobileBtn').addEventListener('click', () => connectionTask(async generation => {
  secondaryToken = null;
  await mobileConnectionStep(await mobileConnection.resend(),generation);
}));
byId('changeConnectMobileBtn').addEventListener('click', () => {
  if(linkingBusy) return;
  mobileConnection = null; secondaryToken = null;
  byId('connectMobileForm').hidden = false;
  byId('connectMobileCodeForm').hidden = true;
  byId('connectMobileNumber').focus();
});
byId('skipMobileBtn').addEventListener('click', () => {
  if(linkingBusy) return;
  mobileSkipped = true; mobileConnection = null; secondaryToken = null;
  byId('addMobilePanel').hidden = true;
  byId('showMobileBtn').hidden = false;
  byId('accountLinkStatus').textContent = 'You can add your mobile number later.';
});
byId('showMobileBtn').addEventListener('click', () => {
  mobileSkipped = false;
  byId('addMobilePanel').hidden = false;
  byId('showMobileBtn').hidden = true;
  byId('connectMobileForm').hidden = false;
  byId('connectMobileCodeForm').hidden = true;
  byId('connectMobileNumber').focus();
});
byId('connectGoogleBtn').addEventListener('click', () => connectionTask(async generation => {
  googleConnection = new AbortController();
  const token = await connectGoogle(config.auth,new URL('auth/connect.html',config.redirectUrl).href,googleConnection.signal);
  await finishConnection(token,generation);
}));

async function initialize(){
  try {
    const response = await fetch('amplify_outputs.json', {cache:'no-store'});
    if(!response.ok) throw new Error('Missing auth configuration');
    const outputs = await response.json();
    if(!outputs.auth?.user_pool_id) throw new Error('Missing auth configuration');
    const configResponse = await fetch(new URL('./auth-config.json', import.meta.url), {cache:'no-store'});
    config = configResponse.ok ? await configResponse.json() : {};
    config.auth = outputs.auth;
    config.identityUrl = outputs.custom?.account_identity_url;
    sessionStorage.removeItem('hiramyatech-pending-account-link');
    if(!config.identityUrl) throw new Error('Missing account identity configuration');
    const redirectUrl = new URL('./', window.location.href).href;
    if(!outputs.auth.oauth.redirect_sign_in_uri.includes(redirectUrl) || !outputs.auth.oauth.redirect_sign_out_uri.includes(redirectUrl)){
      throw new Error('Unregistered application URL');
    }
    config.redirectUrl = redirectUrl;
    // Select this exact registered origin, including its path and trailing slash.
    outputs.auth.oauth.redirect_sign_in_uri = [redirectUrl];
    outputs.auth.oauth.redirect_sign_out_uri = [redirectUrl];
    cognitoUserPoolsTokenProvider.setKeyValueStorage(authSessionStorage);
    Hub.listen('auth', ({payload}) => {
      if(payload.event === 'signedIn') syncSession();
      if(payload.event === 'signedOut') lockPlanner('You are signed out.');
      if(payload.event === 'signInWithRedirect_failure'){
        lockPlanner('Google sign-in was cancelled or could not complete. Please try again.');
        byId('googleSignInBtn').disabled = false;
      }
      if(payload.event === 'tokenRefresh_failure') lockPlanner('Your session expired. Please sign in again.');
    });
    Amplify.configure(outputs);
    byId('googleSignInBtn').disabled = false;
    byId('mobileOtpStartBtn').disabled = false;
    await syncSession();
    window.addEventListener('focus', () => { if(signedIn) syncSession(); });
    setInterval(() => { if(signedIn) syncSession(); }, 60000);
  } catch {
    lockPlanner('Sign-in is not available yet. Please try again once setup is complete.');
    byId('googleSignInBtn').disabled = true;
    byId('mobileOtpStartBtn').disabled = true;
  }
}

initialize();
