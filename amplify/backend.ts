import { defineBackend } from '@aws-amplify/backend';
import { CfnResource } from 'aws-cdk-lib';
import { auth } from './auth/resource';

const backend = defineBackend({ auth });

// Only Google federation is enabled in this iteration.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};
backend.auth.resources.cfnResources.cfnIdentityPool.allowUnauthenticatedIdentities = false;
backend.auth.resources.cfnResources.cfnUserPoolClient.supportedIdentityProviders = ['Google'];
backend.auth.resources.cfnResources.cfnUserPoolClient.explicitAuthFlows = ['ALLOW_REFRESH_TOKEN_AUTH'];

// The app client can reference Google only after Cognito creates the provider.
// This dependency is needed because supportedIdentityProviders is an L1 override.
const authConstruct = backend.auth.resources.userPool.node.scope;
const googleProvider = authConstruct?.node.tryFindChild('GoogleIdP')?.node.defaultChild;

if (!googleProvider || !CfnResource.isCfnResource(googleProvider)) {
  throw new Error('Amplify did not create the Google Cognito identity provider.');
}

backend.auth.resources.cfnResources.cfnUserPoolClient.addDependency(googleProvider);
