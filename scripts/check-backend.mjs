import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Synthesize locally with a fictitious environment. This never deploys resources.
const resetAuth = process.argv.includes('--reset-auth');
const base = new URL(`../.amplify/backend-check-${resetAuth ? 'reset' : 'branch'}/`, import.meta.url);
await mkdir(base, {recursive:true});
const output = pathToFileURL(`${await mkdtemp(fileURLToPath(new URL('run-', base)))}/`);
process.env.CDK_OUTDIR = fileURLToPath(new URL('assembly/', output));
process.env.CDK_CONTEXT_JSON = JSON.stringify({
  'amplify-backend-name':'dev',
  'amplify-backend-namespace':'fin-vision-check',
  'amplify-backend-type':'branch',
});
process.env.AWS_APP_ID = 'fin-vision-check';
process.env.AWS_BRANCH = 'dev';
if(resetAuth) process.env.FIN_VISION_AUTH_RESET = 'fin-vision-check/dev';
else delete process.env.FIN_VISION_AUTH_RESET;
const backendUrl = new URL('../amplify/backend.ts', import.meta.url);
process.setSourceMapsEnabled(true);
await build({entryPoints:[fileURLToPath(backendUrl)],outfile:fileURLToPath(new URL('backend.mjs',output)),
  bundle:true,platform:'node',format:'esm',packages:'external',sourcemap:'inline',define:{'import.meta.url':JSON.stringify(backendUrl.href)}});
await import(new URL('backend.mjs',output));
process.emit('message','amplifySynth');
const templates = [];
for(const name of await readdir(process.env.CDK_OUTDIR)){
  if(name.endsWith('.template.json')) templates.push(JSON.parse(await readFile(new URL(`assembly/${name}`,output),'utf8')));
}
const resources = templates.flatMap(template => Object.values(template.Resources || {}));
const pool = resources.find(resource => resource.Type === 'AWS::Cognito::UserPool');
assert.ok(resources.some(resource => resource.Type === 'AWS::DynamoDB::Table' && resource.DeletionPolicy === 'Retain'));
if(resetAuth){
  assert.ok(!resources.some(resource => resource.Type.startsWith('AWS::Cognito::')), 'Reset stage must remove Cognito resources');
  assert.ok(!resources.some(resource => resource.Type.startsWith('AWS::ApiGatewayV2::')), 'Reset stage must remove the Auth-dependent API');
  console.log('Auth reset synthesis passed: Cognito and account API removed; identity table retained.');
  process.exit(0);
}
assert.ok(pool, 'User pool must be synthesized');
assert.deepEqual([...pool.Properties.UsernameAttributes].sort(), ['email','phone_number']);
assert.ok(pool.Properties.Schema.every(attribute => !attribute.Required), 'Neither email nor phone may be required');
assert.ok(pool.Properties.Policies.SignInPolicy.AllowedFirstAuthFactors.includes('SMS_OTP'));
const client = resources.find(resource => resource.Type === 'AWS::Cognito::UserPoolClient');
assert.ok(client.Properties.ExplicitAuthFlows.includes('ALLOW_USER_AUTH'));
assert.deepEqual([...client.Properties.SupportedIdentityProviders].sort(), ['COGNITO','Google']);
assert.ok(resources.some(resource => resource.Type === 'AWS::ApiGatewayV2::Route' && resource.Properties.RouteKey === 'POST /account'));
console.log('Backend synthesis passed: independent Google/mobile Auth, retained identity registry, and account API.');
