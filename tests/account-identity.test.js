import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createIdentityService } from '../amplify/identity/service.mjs';
import { createIdentityHandler } from '../amplify/identity/http.mjs';

function fixture(){
  let time = 1000;
  const records = new Map();
  const store = {
    async get(key){ return structuredClone(records.get(key)); },
    async commit(operations){
      for(const op of operations){
        const current = records.get(op.delete || op.put.pk);
        if(op.delete && (!current || current.expiresAt !== op.expiresAt || current.expiresAt <= time)) return false;
        if(op.absent && current) return false;
        if(op.version !== undefined && (!current || current.parent || current.version !== op.version)) return false;
      }
      for(const op of operations){
        if(op.delete) records.delete(op.delete);
        else records.set(op.put.pk, structuredClone(op.put));
      }
      return true;
    },
  };
  return {service:createIdentityService(store, () => time), records, advance:seconds => {time += seconds;}};
}

for(const [first, second] of [['google', 'mobile'], ['mobile', 'google'], ['mobile', 'future-email']]){
  test(`${first}-first accounts resolve to the same ID after verified ${second} linking`, async () => {
    const {service} = fixture();
    const before = await service.resolve(first);
    const other = await service.resolve(second);
    assert.notEqual(before.accountId, other.accountId);
    const {ticket} = await service.start(first);
    const linked = await service.complete(second, 1000, ticket);
    assert.equal(linked.accountId, before.accountId);
    assert.deepEqual(await service.resolve(first), await service.resolve(second));
    assert.equal(linked.linkedIdentityCount, 2);
    assert.notEqual((await service.resolve('unrelated')).accountId, linked.accountId);
  });
}

test('unlinked methods never get merged implicitly', async () => {
  const {service} = fixture();
  const [a,b] = await Promise.all([service.resolve('google'),service.resolve('mobile')]);
  assert.notEqual(a.accountId, b.accountId);
});

test('in-session connection preserves the source account and requires fresh secondary proof',async () => {
  const {service} = fixture();
  const original = await service.resolve('google');
  await assert.rejects(service.connect('google','mobile',300),{status:401});
  await assert.rejects(service.connect('google','mobile',1100),{status:401});
  const linked = await service.connect('google','mobile',990);
  assert.equal(linked.accountId,original.accountId);
  assert.deepEqual(await service.resolve('google'),await service.resolve('mobile'));
  assert.deepEqual(await service.connect('google','mobile',990),linked);
});

test('concurrent initial requests create only one account per identity', async () => {
  const {service, records} = fixture();
  const results = await Promise.all(Array.from({length:8}, () => service.resolve('google')));
  assert.equal(new Set(results.map(r => r.accountId)).size, 1);
  assert.equal(records.size, 2);
});

test('expired, malformed, replayed, and stale-auth requests cannot link', async () => {
  const {service, advance} = fixture();
  await assert.rejects(service.complete('mobile',1000,'made-up'), {status:400});
  const {ticket} = await service.start('google');
  await assert.rejects(service.complete('google',1000,ticket), {status:400});
  await assert.rejects(service.complete('mobile',900,ticket), {status:401});
  await assert.rejects(service.complete('mobile',undefined,ticket), {status:401});
  await service.complete('mobile',1000,ticket);
  await assert.rejects(service.complete('attacker',1000,ticket), {status:410});
  const expired = await service.start('google');
  advance(600);
  await assert.rejects(service.complete('attacker',1600,expired.ticket), {status:410});
});

test('concurrent opposite links cannot create cycles or lose identities', async () => {
  const {service} = fixture();
  const [a,b] = await Promise.all([service.start('google'),service.start('mobile')]);
  await Promise.all([service.complete('mobile',1000,a.ticket),service.complete('google',1000,b.ticket)]);
  assert.deepEqual(await service.resolve('google'), await service.resolve('mobile'));
});

test('a ticket can be redeemed only once even when different identities race', async () => {
  const {service} = fixture();
  const {ticket} = await service.start('google');
  const results = await Promise.allSettled([service.complete('mobile',1000,ticket),service.complete('other',1000,ticket)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await service.resolve('google')).linkedIdentityCount, 2);
});

test('existing account aliases keep resolving after subsequent links', async () => {
  const {service} = fixture();
  const a = await service.start('a');
  await service.complete('b',1000,a.ticket);
  const c = await service.start('c');
  await service.complete('b',1000,c.ticket);
  assert.deepEqual(await service.resolve('a'), await service.resolve('c'));
  assert.deepEqual(await service.resolve('b'), await service.resolve('c'));
});

test('pool issuer is part of an identity, so replacement pools cannot inherit old accounts', async () => {
  const {service} = fixture();
  assert.notEqual((await service.resolve('old-pool#sub')).accountId, (await service.resolve('new-pool#sub')).accountId);
});

const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength:2048});
const userPoolId = 'ap-south-1_TestPool';
const issuer = `https://cognito-idp.ap-south-1.amazonaws.com/${userPoolId}`;
const verifier = CognitoJwtVerifier.create({userPoolId, clientId:'test-client', tokenUse:'access'});
verifier.cacheJwks({keys:[{...publicKey.export({format:'jwk'}),kid:'test-key',use:'sig',alg:'RS256'}]});
function token(overrides = {}){
  const seconds = Math.floor(Date.now()/1000);
  const encode = object => Buffer.from(JSON.stringify(object)).toString('base64url');
  const unsigned = `${encode({alg:'RS256',kid:'test-key'})}.${encode({iss:issuer,sub:'google',client_id:'test-client',token_use:'access',iat:seconds,auth_time:seconds,exp:seconds+600,...overrides})}`;
  return `${unsigned}.${sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url')}`;
}
function event(jwt, body = {action:'resolve'}){
  return {headers:{authorization:`Bearer ${jwt}`},requestContext:{http:{method:'POST'}},body:JSON.stringify(body)};
}

test('HTTP boundary verifies signatures, expiry, issuer, client and token type before touching accounts', async () => {
  let calls = 0;
  const handler = createIdentityHandler({resolve:async subject => {calls++; return {accountId:subject};}}, jwt => verifier.verify(jwt));
  const valid = token();
  for(const invalid of ['garbage',`${valid.slice(0,-8)}tampered`,token({exp:1}),token({iss:'https://other.example'}),token({client_id:'another-client'}),token({token_use:'id',aud:'test-client'})]){
    assert.equal((await handler(event(invalid))).statusCode,401);
  }
  assert.equal(calls,0);
  const result = await handler(event(valid));
  assert.equal(result.statusCode,200);
  assert.equal(JSON.parse(result.body).accountId,`${issuer}#google`);
  assert.equal(result.headers['cache-control'],'no-store');
});

test('HTTP rejects malformed and oversized input without exposing internals', async () => {
  const {service} = fixture();
  const handler = createIdentityHandler(service,jwt => verifier.verify(jwt));
  assert.equal((await handler({...event(token()),body:'{'})).statusCode,400);
  assert.equal((await handler(event(token(),null))).statusCode,400);
  assert.equal((await handler(event(token(),{action:'other'}))).statusCode,400);
  assert.equal((await handler(event(token(),{action:'complete',ticket:'a'.repeat(3000)}))).statusCode,400);
  assert.equal((await handler(event(token(),{action:'complete',ticket:'a'.repeat(64)}))).statusCode,410);
});

test('HTTP connection verifies both tokens before linking and ignores supplied account IDs',async () => {
  const {service} = fixture();
  const handler = createIdentityHandler(service,jwt => verifier.verify(jwt));
  const source = token();
  assert.equal((await handler(event(source,{action:'connect',accessToken:'forged'}))).statusCode,401);
  const result = await handler(event(source,{action:'connect',accessToken:token({sub:'mobile',auth_time:1000}),accountId:'attacker-chosen'}));
  assert.equal(result.statusCode,200);
  assert.notEqual(JSON.parse(result.body).accountId,'attacker-chosen');
  assert.deepEqual(await service.resolve(`${issuer}#google`),await service.resolve(`${issuer}#mobile`));
});
