import test from 'node:test';
import assert from 'node:assert/strict';
import { ADDRESS_SCOPE, BIRTHDAY_SCOPE, googleSubject, profileDetails, readGoogleProfile, plannerNameDefaults, ageFromBirthday } from '../auth/auth-profile.js';

test('age prefill requires a valid complete birthday and respects the planner age range',() => {
  assert.equal(ageFromBirthday('07/09/1990',new Date(2026,8,6)),35);
  assert.equal(ageFromBirthday('06/09/1990',new Date(2026,8,6)),36);
  assert.equal(ageFromBirthday('31/02/1990'),null);
  assert.equal(ageFromBirthday('06/09 (year not shared)'),null);
  assert.equal(ageFromBirthday('01/01/2020',new Date(2026,8,6)),null);
});

test('name defaults use separate Google attributes without guessing how full names split',() => {
  const identities=[{providerName:'Google',userId:'subject'}];
  assert.deepEqual(plannerNameDefaults({identities,given_name:' First ',family_name:'Last'}),{firstName:'First',lastName:'Last'});
  assert.deepEqual(plannerNameDefaults({identities,name:'A compound name'}),{firstName:'',lastName:''});
  assert.deepEqual(plannerNameDefaults({given_name:'Unbound'}),{});
});

test('Google identity requires provider subject, not an email address', () => {
  assert.equal(googleSubject({identities:JSON.stringify([{providerName:'Google', userId:'123'}])}), '123');
  assert.equal(googleSubject({identities:'invalid', email:'a@example.com'}), null);
});

test('profile parsing handles absent details and a birthday without a year', () => {
  assert.deepEqual(profileDetails({}), {birthday:'Not provided by Google', country:'Not provided by Google'});
  assert.deepEqual(profileDetails({birthdays:[{date:{month:2,day:3}}],addresses:[{region:'Telangana',country:'India',streetAddress:'Never retained'}]}), {birthday:'03/02 (year not shared)',country:'Telangana, India'});
});

test('a different Google account is rejected before reading its profile', async () => {
  let calls = 0;
  await assert.rejects(readGoogleProfile('test-token', BIRTHDAY_SCOPE, 'expected', async () => {
    calls++;
    return {ok:true,json:async()=>({sub:'different'})};
  }), /same Google account/);
  assert.equal(calls,1);
});

test('partial consent fetches only the granted fields and does not invent country', async () => {
  const urls = [];
  const result = await readGoogleProfile('test-token', `openid ${BIRTHDAY_SCOPE}`, 'expected', async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.ok(!url.includes('test-token'));
    return {ok:true,json:async()=>url.includes('userinfo') ? {sub:'expected'} : {birthdays:[{date:{year:1990,month:2,day:3}}]}};
  });
  assert.ok(urls[1].includes('personFields=birthdays&'));
  assert.deepEqual(result,{birthday:'03/02/1990',country:'Permission not granted'});
});

test('declining optional scopes keeps both fields unshared without People API access', async () => {
  let calls = 0;
  const result = await readGoogleProfile('test-token', 'openid', 'expected', async () => {
    calls++;
    return {ok:true,json:async()=>({sub:'expected'})};
  });
  assert.equal(calls,1);
  assert.deepEqual(result,{birthday:'Permission not granted',country:'Permission not granted'});
});

test('Google API errors are recoverable and do not expose the token', async () => {
  await assert.rejects(readGoogleProfile('private-token', ADDRESS_SCOPE, 'expected', async url => ({
    ok:url.includes('userinfo'), json:async()=>({sub:'expected'})
  })), /could not be retrieved/);
});
