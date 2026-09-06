import { defineBackend } from '@aws-amplify/backend';
import { CfnResource, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { fileURLToPath } from 'node:url';
import { auth } from './auth/resource';

const backend = defineBackend({ auth });

// Google federation and Cognito's native passwordless SMS flow are enabled.
// Native sign-up must remain enabled so a new mobile number can establish its
// Cognito account after completing its OTP challenge.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: false,
};
backend.auth.resources.cfnResources.cfnIdentityPool.allowUnauthenticatedIdentities = false;
backend.auth.resources.cfnResources.cfnUserPoolClient.supportedIdentityProviders = ['COGNITO', 'Google'];
backend.auth.resources.cfnResources.cfnUserPoolClient.explicitAuthFlows = [
  'ALLOW_REFRESH_TOKEN_AUTH',
  'ALLOW_USER_AUTH',
];

// The app client can reference Google only after Cognito creates the provider.
// This dependency is needed because supportedIdentityProviders is an L1 override.
const authConstruct = backend.auth.resources.userPool.node.scope;
const googleProvider = authConstruct?.node.tryFindChild('GoogleIdP')?.node.defaultChild;

if (!googleProvider || !CfnResource.isCfnResource(googleProvider)) {
  throw new Error('Amplify did not create the Google Cognito identity provider.');
}

backend.auth.resources.cfnResources.cfnUserPoolClient.addDependency(googleProvider);

const identityStack = backend.createStack('account-identity');
const identityTable = new Table(identityStack, 'AccountIdentity', {
  partitionKey:{name:'pk', type:AttributeType.STRING},
  billingMode:BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute:'expiresAt',
  pointInTimeRecoverySpecification:{pointInTimeRecoveryEnabled:true},
  removalPolicy:RemovalPolicy.RETAIN,
});
const identityFunction = new NodejsFunction(identityStack, 'AccountIdentityHandler', {
  entry:fileURLToPath(new URL('./identity/handler.mjs', import.meta.url)),
  handler:'handler', runtime:Runtime.NODEJS_22_X, timeout:Duration.seconds(15),
  bundling:{minify:true, externalModules:[]},
  environment:{
    IDENTITY_TABLE:identityTable.tableName,
    USER_POOL_ID:backend.auth.resources.userPool.userPoolId,
    USER_POOL_CLIENT_ID:backend.auth.resources.userPoolClient.userPoolClientId,
  },
});
identityTable.grantReadWriteData(identityFunction);
const identityApi = new HttpApi(identityStack, 'AccountIdentityApi', {
  corsPreflight:{
    allowOrigins:['https://finplanner.hiramyatech.com', 'http://localhost:8000'],
    allowMethods:[CorsHttpMethod.POST], allowHeaders:['Authorization', 'Content-Type'],
  },
});
// The handler verifies Cognito access-token signature, issuer, client and expiry
// before any identity reads/writes; CORS alone is never authorization.
identityApi.addRoutes({path:'/account', methods:[HttpMethod.POST],
  integration:new HttpLambdaIntegration('AccountIdentityIntegration', identityFunction)});
backend.addOutput({custom:{account_identity_url:`${identityApi.apiEndpoint}/account`}});
