// Only used by the test bundler; never imported into the production application.
const listeners = [];
export const Amplify = {configure:outputs => { window.testOutputs = outputs; }};
export const Hub = {listen:(_channel, listener) => { listeners.push(listener); }};
export const sessionStorage = {};
export const cognitoUserPoolsTokenProvider = {setKeyValueStorage:() => {}};
window.emitTestAuth = event => listeners.forEach(listener => listener({payload:{event}}));
export async function fetchAuthSession(){
  return window.testAuthPayload ? {tokens:{idToken:{payload:window.testAuthPayload}}} : {};
}
export async function signInWithRedirect(options){ window.testSignInRequest = options; }
export async function signOut(){
  window.testAuthPayload = null;
  window.emitTestAuth('signedOut');
}
