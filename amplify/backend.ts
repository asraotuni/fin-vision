import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';

const backend = defineBackend({ auth });

// Only Google federation is enabled in this iteration.
backend.auth.resources.cfnResources.cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};
backend.auth.resources.cfnResources.cfnIdentityPool.allowUnauthenticatedIdentities = false;
backend.auth.resources.cfnResources.cfnUserPoolClient.supportedIdentityProviders = ['Google'];
backend.auth.resources.cfnResources.cfnUserPoolClient.explicitAuthFlows = ['ALLOW_REFRESH_TOKEN_AUTH'];
