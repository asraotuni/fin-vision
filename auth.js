import { Amplify } from 'aws-amplify';
import { confirmSignIn, fetchAuthSession, signIn, signInWithRedirect, signOut } from 'aws-amplify/auth';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { sessionStorage as authSessionStorage } from 'aws-amplify/utils';
import { Hub } from 'aws-amplify/utils';
import 'aws-amplify/auth/enable-oauth-listener';
import { ADDRESS_SCOPE, BIRTHDAY_SCOPE, googleSubject, readGoogleProfile } from './auth-profile.js';

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

function lockPlanner(message = 'Sign in with your mobile number or Google to continue.'){
  sessionGeneration += 1;
  signedIn = false;
  tokenClient = null;
  if(window.finVisionUserId){
    sessionStorage.removeItem(`hiramyatech-session-plan:${window.finVisionUserId}`);
  }
  window.finVisionUserId = null;
  currentSubject = null;
  isGoogleSession = false;
  byId('plannerWorkspace').hidden = true;
  byId('accountPanel').hidden = true;
  byId('resetDataBtn').hidden = true;
  byId('signOutBtn').hidden = true;
  byId('loginPanel').hidden = false;
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
    if(window.finVisionUserId !== payload.sub){
      lockPlanner('Your account changed. Reload to continue with the new account.');
    }
    return;
  }
  window.finVisionUserId = payload.sub;
  currentSubject = subject;
  isGoogleSession = Boolean(subject);
  await loadPlanner();
  if(generation !== sessionGeneration) return;
  signedIn = true;
  byId('accountMethod').textContent = isGoogleSession ? 'Google' : 'Mobile number + OTP';
  byId('accountName').textContent = payload.name || [payload.given_name, payload.family_name].filter(Boolean).join(' ') || payload.phone_number || (isGoogleSession ? 'Not provided by Google' : 'Mobile user');
  byId('loginPanel').hidden = true;
  byId('accountPanel').hidden = false;
  byId('plannerWorkspace').hidden = false;
  byId('resetDataBtn').hidden = false;
  byId('signOutBtn').hidden = false;
  byId('googleProfileDetails').hidden = !isGoogleSession;
  if(isGoogleSession) prepareProfileConsent();
}

function syncSession(){
  if(!syncPending){
    syncPending = synchronize().catch(() => {
      lockPlanner('Your session could not be verified. Please sign in again.');
    }).finally(() => { syncPending = null; });
  }
  return syncPending;
}

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
      scope:`openid ${BIRTHDAY_SCOPE} ${ADDRESS_SCOPE}`,
      include_granted_scopes:false,
      login_hint:currentSubject,
      callback:async response => {
        if(!signedIn || generation !== sessionGeneration) return;
        try {
          if(response.error || !response.access_token) throw new Error('Details were not shared. You can continue planning or try again.');
          const details = await readGoogleProfile(response.access_token, response.scope || '', currentSubject);
          if(!signedIn || generation !== sessionGeneration) return;
          byId('accountDob').textContent = details.birthday;
          byId('accountCountry').textContent = details.country;
          byId('profileStatus').textContent = 'Only the details you permitted and Google provided are displayed. Nothing from this request is saved.';
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

async function requestOtp(){
  const mobileNumber = normalizeIndianPhoneNumber(byId('mobileNumber').value);
  if(!mobileNumber){
    byId('authStatus').textContent = 'Enter a valid 10-digit Indian mobile number.';
    byId('mobileNumber').focus();
    return;
  }
  otpPhoneNumber = mobileNumber;
  const submitButton = byId('mobileOtpForm').querySelector('button[type="submit"]');
  submitButton.disabled = true;
  byId('authStatus').textContent = 'Sending OTP…';
  try {
    const result = await signIn({
      username: mobileNumber,
      options: {authFlowType:'USER_AUTH', preferredChallenge:'SMS_OTP'},
    });
    await handleOtpStep(result.nextStep);
  } catch(error){
    byId('authStatus').textContent = error.message || 'The OTP could not be sent. Please try again.';
  } finally {
    submitButton.disabled = false;
  }
}

byId('mobileOtpStartBtn').addEventListener('click', () => {
  setOtpForm('phone');
  byId('mobileNumber').focus();
  byId('authStatus').textContent = 'Enter your Indian mobile number to receive a one-time password.';
});

byId('mobileOtpForm').addEventListener('submit', event => {
  event.preventDefault();
  requestOtp();
});

byId('verifyOtpForm').addEventListener('submit', async event => {
  event.preventDefault();
  const code = byId('otpCode').value.replace(/\D/g, '');
  if(code.length !== 6){
    byId('authStatus').textContent = 'Enter the 6-digit OTP from your SMS.';
    return;
  }
  const submitButton = byId('verifyOtpForm').querySelector('button[type="submit"]');
  submitButton.disabled = true;
  byId('authStatus').textContent = 'Verifying OTP…';
  try {
    const result = await confirmSignIn({challengeResponse:code});
    await handleOtpStep(result.nextStep);
  } catch(error){
    byId('authStatus').textContent = error.message || 'The OTP could not be verified. Check it and try again.';
  } finally {
    submitButton.disabled = false;
  }
});

byId('resendOtpBtn').addEventListener('click', () => requestOtp());
byId('changeMobileBtn').addEventListener('click', () => {
  setOtpForm('phone');
  byId('mobileNumber').focus();
  byId('authStatus').textContent = 'Update your mobile number and request a new OTP.';
});

byId('googleSignInBtn').addEventListener('click', async () => {
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

async function initialize(){
  try {
    const response = await fetch('amplify_outputs.json', {cache:'no-store'});
    if(!response.ok) throw new Error('Missing auth configuration');
    const outputs = await response.json();
    if(!outputs.auth?.user_pool_id) throw new Error('Missing auth configuration');
    const configResponse = await fetch('auth-config.json', {cache:'no-store'});
    config = configResponse.ok ? await configResponse.json() : {};
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
