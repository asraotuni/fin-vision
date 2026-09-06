// Only used by the test bundler; never imported into the production application.
const listeners = [];
export const Amplify = {configure:outputs => { window.testOutputs = outputs; }};
export const Hub = {listen:(_channel, listener) => { listeners.push(listener); }};
export const sessionStorage = {};
export const cognitoUserPoolsTokenProvider = {setKeyValueStorage:() => {}};
window.emitTestAuth = event => listeners.forEach(listener => listener({payload:{event}}));
export async function fetchAuthSession(){
  return window.testAuthPayload ? {tokens:{idToken:{payload:window.testAuthPayload}, accessToken:{toString:() => window.testAuthPayload.sub}}} : {};
}
export async function signInWithRedirect(options){ window.testSignInRequest = options; }
export async function signIn(options){
  window.testMobileSignInRequest = options;
  return window.testMobileSignInResponse || {nextStep:{signInStep:'CONFIRM_SIGN_IN_WITH_SMS_CODE'}};
}
export async function confirmSignIn(options){
  window.sessionStorage.setItem('test-confirm-signin',JSON.stringify(options));
  window.testConfirmSignInRequest = options;
  const result = window.testConfirmSignInResponse || {nextStep:{signInStep:'DONE'}};
  if(result.nextStep?.signInStep === 'DONE') {
    window.testAuthPayload = {sub:'mobile-user-a',phone_number:'+919876543210'};
    window.emitTestAuth('signedIn');
  }
  return result;
}
export async function signOut(){
  window.testAuthPayload = null;
  window.emitTestAuth('signedOut');
}
export async function signUp(options){
  window.testSignUpRequest = options;
  return {nextStep:{signUpStep:'CONFIRM_SIGN_UP'}};
}
export async function confirmSignUp(options){
  window.sessionStorage.setItem('test-confirm-signup',JSON.stringify(options));
  window.testConfirmSignUpRequest = options;
  return {nextStep:{signUpStep:'COMPLETE_AUTO_SIGN_IN'}};
}
export async function resendSignUpCode(options){ window.testResendSignUpRequest = options; }
export async function autoSignIn(){ return confirmSignIn({}); }
