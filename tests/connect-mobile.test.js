import test from 'node:test';
import assert from 'node:assert/strict';
import { createMobileConnection } from '../auth/connect-mobile.js';

const auth = {aws_region:'ap-south-1',user_pool_client_id:'client'};
function flow(replies){
  const calls = [];
  const connection = createMobileConnection(auth,async (url,options) => {
    calls.push({operation:options.headers['X-Amz-Target'].split('.').pop(),body:JSON.parse(options.body)});
    const reply = replies.shift();
    assert.ok(reply,'Unexpected Cognito call');
    return {ok:!reply.__type,json:async () => reply};
  });
  return {connection,calls};
}
test('new mobile signup reuses the confirmed OTP without changing the primary session',async () => {
  const {connection,calls} = flow([{UserConfirmed:false},{Session:'confirmed-otp'},{AuthenticationResult:{AccessToken:'proof'}}]);
  assert.deepEqual(await connection.start('+919876543210'),{needsCode:true});
  assert.deepEqual(await connection.confirm('123456'),{accessToken:'proof'});
  assert.equal(calls[2].body.Session,'confirmed-otp');
  assert.equal(calls[2].body.AuthFlow,'USER_AUTH');
  assert.ok(!('Password' in calls[0].body));
});
test('existing mobile users prove ownership through SMS OTP with Cognito challenge username',async () => {
  const {connection,calls} = flow([{__type:'UsernameExistsException'},
    {ChallengeName:'SMS_OTP',Session:'challenge',ChallengeParameters:{USERNAME:'canonical-username'}},
    {AuthenticationResult:{AccessToken:'proof'}}]);
  await connection.start('+919876543210');
  await connection.confirm('123456');
  assert.deepEqual(calls[2].body.ChallengeResponses,{USERNAME:'canonical-username',SMS_OTP_CODE:'123456'});
  assert.equal(calls[2].body.Session,'challenge');
});
test('unconfirmed accounts resend registration codes and invalid OTP never returns proof',async () => {
  const {connection,calls} = flow([{__type:'UsernameExistsException'},{__type:'UserNotConfirmedException'}, {},
    {__type:'CodeMismatchException',message:'Incorrect verification code'}, {}, {Session:'confirmed'}, {AuthenticationResult:{AccessToken:'proof'}}]);
  await connection.start('+919876543210');
  await assert.rejects(connection.confirm('999999'),{name:'CodeMismatchException'});
  await connection.resend();
  assert.deepEqual(await connection.confirm('123456'),{accessToken:'proof'});
  assert.equal(calls[2].operation,'ResendConfirmationCode');
});
test('unsupported challenges fail closed',async () => {
  const {connection} = flow([{__type:'UsernameExistsException'},{ChallengeName:'PASSWORD',Session:'challenge'}]);
  await assert.rejects(connection.start('+919876543210'),/could not continue/);
});
