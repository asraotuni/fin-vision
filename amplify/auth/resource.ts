import { defineAuth, secret } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    // Retained for Cognito's native user-pool configuration. The UI currently
    // offers passwordless mobile OTP, not email/password sign-in.
    email: true,
    phone: {
      otpLogin: true,
    },
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
  // Lets Amplify create Cognito's SNS publishing role for SMS OTP delivery.
  senders: {
    sms: {},
  },
});
