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
  await page.route('**/amplify_outputs.json', route => route.fulfill({json:{custom:{account_identity_url:'http://localhost:8765/account'},auth:{aws_region:'ap-south-1',user_pool_client_id:'test-client',user_pool_id:'test-pool',oauth:{domain:'test.auth.ap-south-1.amazoncognito.com',redirect_sign_in_uri:['http://localhost:8765/'],redirect_sign_out_uri:['http://localhost:8765/']}}}}));
  let linked = false;
  await page.route('**/account', route => {
    const body = route.request().postDataJSON();
    if(body.action === 'start') return route.fulfill({json:{ticket:'a'.repeat(64), expiresAt:Math.floor(Date.now()/1000)+600}});
    if(body.action === 'connect') linked = true;
    return route.fulfill({json:{accountId:route.request().headers().authorization === 'Bearer user-a' ? 'account-a' : 'account-mobile', linkedIdentityCount:linked ? 2 : 1}});
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
  await page.locator('#otpCode').fill('12345678');
  await expect(page.locator('#otpCode')).toHaveValue('12345678');
  await page.locator('#verifyOtpForm').getByRole('button',{name:'Verify OTP'}).click();
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  await expect(page.locator('#accountMethod')).toHaveText('Mobile number + OTP');
  expect(await page.evaluate(() => window.testConfirmSignInRequest)).toEqual({challengeResponse:'12345678'});
  await expect(page.locator('#accountName')).toHaveText('Not provided');
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
  await expect(page.locator('#shareGoogleProfileBtn')).toBeEnabled();
  expect(await page.evaluate(() => window.testConsent.scope.split(' '))).toEqual([
    'openid','profile','https://www.googleapis.com/auth/user.birthday.read','https://www.googleapis.com/auth/user.addresses.read'
  ]);
  await page.route('https://openidconnect.googleapis.com/v1/userinfo', route=>route.fulfill({json:{sub:'google-a'}}));
  await page.route('https://people.googleapis.com/**', route=>route.fulfill({json:{birthdays:[{date:{year:1987,month:4,day:12}}]}}));
  await page.locator('#shareGoogleProfileBtn').click();
  await page.evaluate(()=>window.testConsent.callback({access_token:'test-only-token',scope:'openid https://www.googleapis.com/auth/user.birthday.read https://www.googleapis.com/auth/user.addresses.read'}));
  await expect(page.locator('#accountDob')).toHaveText('12/04/1987');
  await expect(page.locator('#accountCountry')).toHaveText('Not provided by Google');
  const today = new Date();
  const expectedAge = today.getFullYear()-1987-Number(today.getMonth()<3 || (today.getMonth()===3 && today.getDate()<12));
  await expect(page.locator('#age')).toHaveValue(String(expectedAge));
  await page.locator('#age').fill('42');
  await page.evaluate(()=>window.testConsent.callback({access_token:'test-only-token',scope:'openid https://www.googleapis.com/auth/user.birthday.read'}));
  await expect(page.locator('#age')).toHaveValue('42');
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

test('Google users verify mobile in place without losing their session or draft', async ({page}) => {
  await setup(page, true);
  await page.route('https://cognito-idp.ap-south-1.amazonaws.com/',route => {
    const operation = route.request().headers()['x-amz-target'].split('.').pop();
    if(operation === 'SignUp') return route.fulfill({json:{UserConfirmed:false}});
    if(operation === 'ConfirmSignUp') return route.fulfill({json:{Session:'signup-session'}});
    return route.fulfill({json:{AuthenticationResult:{AccessToken:'mobile-proof'}}});
  });
  await page.locator('#firstName').fill('Keep my draft');
  await page.locator('#connectMobileNumber').fill('9876543210');
  await page.locator('#connectMobileForm').getByRole('button',{name:'Send verification code'}).click();
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  await page.locator('#connectMobileCode').fill('123456');
  await page.locator('#connectMobileCodeForm').getByRole('button',{name:'Verify mobile number'}).click();
  await expect(page.locator('#accountLinkStatus')).toContainText('Connected.');
  await expect(page.locator('#firstName')).toHaveValue('Keep my draft');
  await expect(page.locator('#accountMethod')).toHaveText('Google');
  expect(await page.evaluate(() => window.finVisionUserId)).toBe('account-a');
  expect(await page.evaluate(() => sessionStorage.getItem('hiramyatech-session-plan:account-a'))).toContain('Keep my draft');
  expect(await page.evaluate(() => JSON.stringify({...sessionStorage}))).not.toContain('mobile-proof');
});

test('mobile users connect Google through a PKCE popup without leaving their draft', async ({page,context}) => {
  await setup(page);
  await context.route('https://test.auth.ap-south-1.amazoncognito.com/oauth2/authorize**', route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = new URL(url.searchParams.get('redirect_uri'));
    callback.searchParams.set('code','test-code');
    callback.searchParams.set('state',url.searchParams.get('state'));
    return route.fulfill({status:302,headers:{location:callback.href}});
  });
  await page.route('https://test.auth.ap-south-1.amazoncognito.com/oauth2/token', route => {
    expect(route.request().postData()).toContain('code_verifier=');
    return route.fulfill({json:{access_token:'google-proof'}});
  });
  await page.evaluate(() => {window.testAuthPayload={sub:'mobile-user-a',phone_number:'+919876543210'}; window.emitTestAuth('signedIn');});
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  await page.locator('#firstName').fill('Mobile draft');
  await page.locator('#connectGoogleBtn').click();
  await expect(page.locator('#accountLinkStatus')).toContainText('Connected.');
  await expect(page.locator('#firstName')).toHaveValue('Mobile draft');
  await expect(page.locator('#accountMethod')).toHaveText('Mobile number + OTP');
  expect(await page.evaluate(() => window.finVisionUserId)).toBe('account-mobile');
});

test('Google names prefill editable planner fields and preserve saved edits and cleared fields', async ({page}) => {
  await setup(page);
  await page.evaluate(() => {window.testAuthPayload={sub:'user-a',given_name:'First',family_name:'Last',email:'test@example.com',identities:[{providerName:'Google',userId:'google-a'}]}; window.emitTestAuth('signedIn');});
  await expect(page.locator('#firstName')).toHaveValue('First');
  await expect(page.locator('#lastName')).toHaveValue('Last');
  await expect(page.locator('#accountEmail')).toContainText('test@example.com');
  await page.locator('#firstName').fill('Preferred name');
  await page.locator('#lastName').fill('');
  await page.reload();
  await expect(page.locator('#firstName')).toHaveValue('Preferred name');
  await expect(page.locator('#lastName')).toHaveValue('');
});

test('mobile addition can be skipped and resumed without clearing the planner', async ({page}) => {
  await setup(page,true);
  await page.locator('#firstName').fill('Still here');
  await page.locator('#skipMobileBtn').click();
  await expect(page.locator('#addMobilePanel')).toBeHidden();
  await expect(page.locator('#plannerWorkspace')).toBeVisible();
  await page.locator('#showMobileBtn').click();
  await expect(page.locator('#connectMobileForm')).toBeVisible();
  await expect(page.locator('#firstName')).toHaveValue('Still here');
});

test('saved Google name loads after sign-out and mobile login, including an intentionally empty surname', async ({page}) => {
  await setup(page);
  let profile;
  await page.route('**/account', route => {
    const body = route.request().postDataJSON();
    if(body.action === 'seedProfile') profile = {...body.profile,...profile};
    if(body.action === 'saveProfile') profile = {...body.profile};
    return route.fulfill({json:{accountId:'shared-account',linkedIdentityCount:2,profile}});
  });
  await page.evaluate(() => {
    window.testAuthPayload={sub:'user-a',given_name:'Google',family_name:'Name',identities:[{providerName:'Google',userId:'google-a'}]};
    window.emitTestAuth('signedIn');
  });
  await expect(page.locator('#firstName')).toHaveValue('Google');
  await page.locator('#firstName').fill('Preferred');
  await page.locator('#lastName').fill('');
  await page.locator('#saveAccountNameBtn').click();
  await expect(page.locator('#nameSaveStatus')).toContainText('Name saved');
  await page.locator('#signOutBtn').click();
  await page.reload();
  await page.locator('#mobileOtpStartBtn').click();
  await page.locator('#mobileNumber').fill('9876543210');
  await page.locator('#mobileOtpForm').getByRole('button',{name:'Send OTP'}).click();
  await page.locator('#otpCode').fill('12345678');
  await page.locator('#verifyOtpForm').getByRole('button',{name:'Verify OTP'}).click();
  await expect(page.locator('#firstName')).toHaveValue('Preferred');
  await expect(page.locator('#lastName')).toHaveValue('');
  await expect(page.locator('#accountName')).toHaveText('Preferred');
});

test('Google fills blank names from an older draft without replacing an existing name', async ({page}) => {
  await setup(page);
  await page.evaluate(() => {
    sessionStorage.setItem('hiramyatech-session-plan:account-a',JSON.stringify({fields:{firstName:'',lastName:'Preferred'},cashFlowBreakdownVersion:3}));
    window.testAuthPayload={sub:'user-a',given_name:'First',family_name:'Last',identities:[{providerName:'Google',userId:'google-a'}]};
    window.emitTestAuth('signedIn');
  });
  await expect(page.locator('#firstName')).toHaveValue('First');
  await expect(page.locator('#lastName')).toHaveValue('Preferred');
});

test('incorrect mobile verification keeps the Google session and draft intact', async ({page}) => {
  await setup(page,true);
  await page.route('https://cognito-idp.ap-south-1.amazonaws.com/',route => route.request().headers()['x-amz-target'].endsWith('.SignUp')
    ? route.fulfill({json:{UserConfirmed:false}})
    : route.fulfill({status:400,json:{__type:'CodeMismatchException',message:'Incorrect verification code'}}));
  await page.locator('#firstName').fill('Keep this');
  await page.locator('#connectMobileNumber').fill('9876543210');
  await page.locator('#connectMobileForm').getByRole('button',{name:'Send verification code'}).click();
  await page.locator('#connectMobileCode').fill('999999');
  await page.locator('#connectMobileCodeForm').getByRole('button',{name:'Verify mobile number'}).click();
  await expect(page.locator('#accountLinkStatus')).toContainText('Incorrect verification code');
  await expect(page.locator('#accountMethod')).toHaveText('Google');
  await expect(page.locator('#firstName')).toHaveValue('Keep this');
});

test('account API failure never opens a planner under the raw Cognito subject', async ({page}) => {
  await setup(page);
  await page.route('**/account', route => route.fulfill({status:503,json:{message:'Account service is unavailable. Please retry.'}}));
  await page.evaluate(() => {window.testAuthPayload={sub:'mobile-user-a',phone_number:'+919876543210'}; window.emitTestAuth('signedIn');});
  await expect(page.locator('#authStatus')).toContainText('Account service is unavailable');
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  expect(await page.evaluate(() => window.finVisionUserId)).toBeNull();
});
