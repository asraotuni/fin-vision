import { defineAuth, secret } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    externalProviders: {
      google: {
        clientId: secret('GOOGLE_CLIENT_ID'),
        clientSecret: secret('GOOGLE_CLIENT_SECRET'),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: 'email',
          fullname: 'name',
          givenName: 'given_name',
          familyName: 'family_name',
        },
      },
      callbackUrls: [
        'https://finplanner.hiramyatech.com/',
        'http://localhost:8000/',
      ],
      logoutUrls: [
        'https://finplanner.hiramyatech.com/',
        'http://localhost:8000/',
      ],
    },
  },
});
