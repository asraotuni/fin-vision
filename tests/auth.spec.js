import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

let authBundle;
test.beforeAll(async () => {
  const result = await build({entryPoints:['auth/auth.js'],bundle:true,write:false,format:'esm',plugins:[{
    name:'mock-auth-sdk',setup(build){
      build.onResolve({filter:/^aws-amplify(?:\/.*)?$/}, () => ({path:new URL('./auth-sdk.fixture.js',import.meta.url).pathname}));
    }
  }]});
  authBundle=result.outputFiles[0].text;
});

async function setup(page, signedIn = false){
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/auth/auth.js', route => route.fulfill({contentType:'text/javascript',body:authBundle}));
  await page.route('**/amplify_outputs.json', route => route.fulfill({json:{custom:{account_identity_url:'http://localhost:8765/account'},auth:{user_pool_id:'test-pool',oauth:{redirect_sign_in_uri:['http://localhost:8765/'],redirect_sign_out_uri:['http://localhost:8765/']}}}}));
  let linked = false;
  await page.route('**/account', route => {
    const body = route.request().postDataJSON();
    if(body.action === 'start') return route.fulfill({json:{ticket:'a'.repeat(64), expiresAt:Math.floor(Date.now()/1000)+600}});
    if(body.action === 'complete') linked = true;
    return route.fulfill({json:{accountId:linked ? 'account-a' : route.request().headers().authorization === 'Bearer user-a' ? 'account-a' : 'account-mobile', linkedIdentityCount:linked ? 2 : 1}});
  });
  await page.route('**/auth/auth-config.json', route => route.fulfill({json:{googleClientId:'test-client'}}));
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(options){window.testConsent=options;return {requestAccessToken(){window.consentOpened=true;}};}}}};`}));
  await page.addInitScript(({signedIn}) => {
    let payload = sessionStorage.getItem('test-auth') === null ? (signedIn ? {sub:'user-a',name:'Test Person',identities:[{providerName:'Google',userId:'google-a'}]} : null) : JSON.parse(sessionStorage.getItem('test-auth'));
    Object.defineProperty(window, 'testAuthPayload', {get:() => payload, set:value => {payload=value; sessionStorage.setItem('test-auth',JSON.stringify(value));}});
    localStorage.setItem('hiramyatech-test-data-v1',JSON.stringify({fields:{firstName:'Previous anonymous user'}}));
  }, {signedIn});
  await page.goto('/');
}

test('Google and mobile OTP are available while the planner stays locked until a session exists', async ({page}) => {
  await setup(page);
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  await expect(page.locator('#signOutBtn')).toBeHidden();
  await expect(page.getByRole('button',{name:'Mobile number + OTP'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Email + OTP Coming soon'})).toBeDisabled();
  await page.locator('#googleSignInBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.testSignInRequest)).toEqual({provider:'Google'});
  await page.evaluate(()=>window.emitTestAuth('signInWithRedirect_failure'));
  await expect(page.locator('#authStatus')).toContainText('cancelled');
  await expect(page.locator('#googleSignInBtn')).toBeEnabled();
});

test('mobile OTP normalizes an Indian number and signs the user in after code verification', async ({page}) => {
  await setup(page);
  await page.locator('#mobileOtpStartBtn').click();
  await page.locator('#mobileNumber').fill('98765 43210');
  await page.locator('#mobileOtpForm').getByRole('button',{name:'Send OTP'}).click();
  await expect.poll(()=>page.evaluate(()=>window.testMobileSignInRequest)).toEqual({username:'+919876543210',options:{authFlowType:'USER_AUTH',preferredChallenge:'SMS_OTP'}});
  await expect(page.locator('#verifyOtpForm')).toBeVisible();
  await page.locator('#otpCode').fill('123456');
  await page.locator('#verifyOtpForm').getByRole('button',{name:'Verify OTP'}).click();
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  await expect(page.locator('#accountMethod')).toHaveText('Mobile number + OTP');
  await expect(page.locator('#accountName')).toHaveText('+919876543210');
  await expect(page.locator('#googleProfileDetails')).toBeHidden();
});

test('signed-in planner isolates old drafts and sign-out hides and clears the current draft', async ({page}) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await setup(page,true);
  await expect(page.locator('#accountName')).toHaveText('Test Person');
  await expect(page.locator('#firstName')).toHaveValue('');
  await page.locator('#firstName').fill('Current user');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hiramyatech-session-plan:account-a')).fields.firstName)).toBe('Current user');
  await page.locator('#signOutBtn').click();
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  await expect(page.locator('#signOutBtn')).toBeHidden();
  expect(await page.evaluate(()=>sessionStorage.getItem('hiramyatech-session-plan:account-a'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('hiramyatech-test-data-v1'))).toContain('Previous anonymous user');
  expect(errors).toEqual([]);
});

test('optional consent supports missing details and never persists Google profile data', async ({page}) => {
  await setup(page,true);
  await page.route('https://openidconnect.googleapis.com/v1/userinfo', route=>route.fulfill({json:{sub:'google-a'}}));
  await page.route('https://people.googleapis.com/**', route=>route.fulfill({json:{birthdays:[{date:{year:1987,month:4,day:12}}]}}));
  await page.locator('#shareGoogleProfileBtn').click();
  await page.evaluate(()=>window.testConsent.callback({access_token:'test-only-token',scope:'openid https://www.googleapis.com/auth/user.birthday.read https://www.googleapis.com/auth/user.addresses.read'}));
  await expect(page.locator('#accountDob')).toHaveText('12/04/1987');
  await expect(page.locator('#accountCountry')).toHaveText('Not provided by Google');
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
  expect(stored).not.toContain('test-only-token');
  expect(stored).not.toContain('12/04/1987');
  await page.reload();
  await expect(page.locator('#accountDob')).toHaveText('Not shared');
});

test('expired session locks the planner and mobile sign-out stays visible', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await setup(page,true);
  await expect(page.locator('#signOutBtn')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.evaluate(()=>window.emitTestAuth('tokenRefresh_failure'));
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  await expect(page.locator('#authStatus')).toContainText('expired');
});

test('missing deployed auth configuration fails closed', async ({page}) => {
  await setup(page);
  await page.route('**/amplify_outputs.json',route=>route.fulfill({status:404,body:''}));
  await page.reload();
  await expect(page.locator('#authStatus')).toContainText('not available yet');
  await expect(page.locator('#googleSignInBtn')).toBeDisabled();
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
});

test('first-time mobile users verify registration and automatically sign in', async ({page}) => {
  await setup(page);
  await page.locator('#mobileOtpStartBtn').click();
  await page.locator('#mobileNumber').fill('9876543210');
  await page.locator('#mobileSignupBtn').click();
  await expect(page.locator('#verifyOtpForm')).toBeVisible();
  expect(await page.evaluate(() => window.testSignUpRequest)).toEqual({username:'+919876543210', options:{userAttributes:{phone_number:'+919876543210'},autoSignIn:{authFlowType:'USER_AUTH'}}});
  await page.locator('#resendOtpBtn').click();
  await expect.poll(() => page.evaluate(() => window.testResendSignUpRequest)).toEqual({username:'+919876543210'});
  await page.locator('#otpCode').fill('123456');
  await page.locator('#verifyOtpForm').getByRole('button',{name:'Verify OTP'}).click();
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  expect(await page.evaluate(() => window.testConfirmSignUpRequest)).toEqual({username:'+919876543210',confirmationCode:'123456'});
});

test('Google-first linking requires mobile proof and explicit confirmation before sharing an account', async ({page}) => {
  await setup(page, true);
  await page.locator('#firstName').fill('Draft cleared when linking');
  await page.locator('#startLinkBtn').click();
  await expect(page.locator('#linkInstructions')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hiramyatech-session-plan:account-a'))).toBeNull();
  await page.locator('#mobileOtpStartBtn').click();
  await page.locator('#mobileNumber').fill('9876543210');
  await page.locator('#mobileOtpForm').getByRole('button',{name:'Send OTP'}).click();
  await page.locator('#otpCode').fill('123456');
  await page.locator('#verifyOtpForm').getByRole('button',{name:'Verify OTP'}).click();
  await expect(page.locator('#linkConfirmPanel')).toBeVisible();
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  await expect(page.locator('#linkConfirmDescription')).toContainText('+919876543210');
  await page.locator('#confirmLinkBtn').click();
  await expect(page.locator('#accountIdentitySummary')).toContainText('2 verified');
  expect(await page.evaluate(() => window.finVisionUserId)).toBe('account-a');
  expect(await page.evaluate(() => sessionStorage.getItem('hiramyatech-pending-account-link'))).toBeNull();
});

test('mobile-first linking supports Google and cancellation does not join accounts', async ({page}) => {
  await setup(page);
  await page.evaluate(() => {window.testAuthPayload={sub:'mobile-user-a',phone_number:'+919876543210'}; window.emitTestAuth('signedIn');});
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  await page.locator('#startLinkBtn').click();
  await expect(page.locator('#linkInstructions')).toBeVisible();
  await page.locator('#googleSignInBtn').click();
  await page.evaluate(() => {window.testAuthPayload={sub:'user-a',name:'Test Person',identities:[{providerName:'Google',userId:'google-a'}]}; window.emitTestAuth('signedIn');});
  await expect(page.locator('#linkConfirmPanel')).toBeVisible();
  await page.locator('#rejectLinkBtn').click();
  await expect(page.locator('#loginPanel')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('hiramyatech-pending-account-link'))).toBeNull();
});

test('account API failure never opens a planner under the raw Cognito subject', async ({page}) => {
  await setup(page);
  await page.route('**/account', route => route.fulfill({status:503,json:{message:'Account service is unavailable. Please retry.'}}));
  await page.evaluate(() => {window.testAuthPayload={sub:'mobile-user-a',phone_number:'+919876543210'}; window.emitTestAuth('signedIn');});
  await expect(page.locator('#authStatus')).toContainText('Account service is unavailable');
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  expect(await page.evaluate(() => window.finVisionUserId)).toBeNull();
});
