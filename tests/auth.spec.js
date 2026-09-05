import { test, expect } from '@playwright/test';
import { build } from 'esbuild';

let authBundle;
test.beforeAll(async () => {
  const result = await build({entryPoints:['auth.js'],bundle:true,write:false,format:'esm',plugins:[{
    name:'mock-auth-sdk',setup(build){
      build.onResolve({filter:/^aws-amplify(?:\/.*)?$/}, () => ({path:new URL('./auth-sdk.fixture.js',import.meta.url).pathname}));
    }
  }]});
  authBundle=result.outputFiles[0].text;
});

async function setup(page, signedIn = false){
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/auth.js', route => route.fulfill({contentType:'text/javascript',body:authBundle}));
  await page.route('**/amplify_outputs.json', route => route.fulfill({json:{auth:{oauth:{redirect_sign_in_uri:['http://localhost:8765/'],redirect_sign_out_uri:['http://localhost:8765/']}}}}));
  await page.route('**/auth-config.json', route => route.fulfill({json:{googleClientId:'test-client'}}));
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{initTokenClient(options){window.testConsent=options;return {requestAccessToken(){window.consentOpened=true;}};}}}};`}));
  await page.addInitScript(({signedIn}) => {
    window.testAuthPayload = signedIn ? {sub:'user-a',name:'Test Person',identities:[{providerName:'Google',userId:'google-a'}]} : null;
    localStorage.setItem('hiramyatech-test-data-v1',JSON.stringify({fields:{firstName:'Previous anonymous user'}}));
  }, {signedIn});
  await page.goto('/');
}

test('only Google is enabled and planner stays locked until a session exists', async ({page}) => {
  await setup(page);
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  await expect(page.locator('#signOutBtn')).toBeHidden();
  await expect(page.getByRole('button',{name:'Mobile number + OTP Coming soon'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Email + OTP Coming soon'})).toBeDisabled();
  await page.locator('#googleSignInBtn').click();
  await expect.poll(()=>page.evaluate(()=>window.testSignInRequest)).toEqual({provider:'Google'});
  await page.evaluate(()=>window.emitTestAuth('signInWithRedirect_failure'));
  await expect(page.locator('#authStatus')).toContainText('cancelled');
  await expect(page.locator('#googleSignInBtn')).toBeEnabled();
});

test('signed-in planner isolates old drafts and sign-out hides and clears the current draft', async ({page}) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await setup(page,true);
  await expect(page.locator('#accountName')).toHaveText('Test Person');
  await expect(page.locator('#firstName')).toHaveValue('');
  await page.locator('#firstName').fill('Current user');
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hiramyatech-session-plan:user-a')).fields.firstName)).toBe('Current user');
  await page.locator('#signOutBtn').click();
  await expect(page.locator('#plannerWorkspace')).toBeHidden();
  await expect(page.locator('#signOutBtn')).toBeHidden();
  expect(await page.evaluate(()=>sessionStorage.getItem('hiramyatech-session-plan:user-a'))).toBeNull();
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
