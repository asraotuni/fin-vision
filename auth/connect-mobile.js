// Public Cognito APIs in an isolated flow. These tokens never replace the
// planner's Amplify session and are never written to browser storage.
export function createMobileConnection(auth, fetcher = fetch){
  let phone, username, session, mode;
  async function call(operation, values){
    const response = await fetcher(`https://cognito-idp.${auth.aws_region}.amazonaws.com/`, {
      method:'POST', headers:{'Content-Type':'application/x-amz-json-1.1',
        'X-Amz-Target':`AWSCognitoIdentityProviderService.${operation}`},
      body:JSON.stringify({ClientId:auth.user_pool_client_id, ...values}),
    });
    const result = await response.json();
    if(!response.ok){
      const error = new Error(result.message || result.Message || 'Mobile verification failed. Please try again.');
      error.name = (result.__type || '').split('#').pop();
      throw error;
    }
    return result;
  }
  async function step(result){
    if(result.AuthenticationResult?.AccessToken) return {accessToken:result.AuthenticationResult.AccessToken};
    session = result.Session;
    username = result.ChallengeParameters?.USERNAME || username || phone;
    if(result.ChallengeName === 'SELECT_CHALLENGE'){
      return step(await call('RespondToAuthChallenge', {ChallengeName:'SELECT_CHALLENGE',Session:session,
        ChallengeResponses:{USERNAME:username,ANSWER:'SMS_OTP'}}));
    }
    if(result.ChallengeName !== 'SMS_OTP' || !session) throw new Error('Mobile verification could not continue. Request a new code.');
    mode = 'signin';
    return {needsCode:true};
  }
  async function initiate(signUpSession){
    return step(await call('InitiateAuth', {AuthFlow:'USER_AUTH',
      AuthParameters:{USERNAME:phone,PREFERRED_CHALLENGE:'SMS_OTP'},
      ...(signUpSession ? {Session:signUpSession} : {})}));
  }
  return {
    async start(number){
      phone = number; username = number; session = undefined;
      try {
        await call('SignUp',{Username:phone,UserAttributes:[{Name:'phone_number',Value:phone}]});
        mode = 'signup';
        return {needsCode:true};
      } catch(error){
        if(error.name !== 'UsernameExistsException') throw error;
      }
      try { return await initiate(); }
      catch(error){
        if(error.name !== 'UserNotConfirmedException') throw error;
        mode = 'signup';
        await call('ResendConfirmationCode',{Username:phone});
        return {needsCode:true};
      }
    },
    async confirm(code){
      if(!phone || !mode) throw new Error('Request a code first.');
      if(mode === 'signup'){
        const confirmed = await call('ConfirmSignUp',{Username:phone,ConfirmationCode:code});
        mode = 'signin';
        return initiate(confirmed.Session);
      }
      return step(await call('RespondToAuthChallenge',{ChallengeName:'SMS_OTP',Session:session,
        ChallengeResponses:{USERNAME:username,SMS_OTP_CODE:code}}));
    },
    async resend(){
      if(!phone) throw new Error('Enter your mobile number first.');
      if(mode === 'signup'){
        await call('ResendConfirmationCode',{Username:phone});
        return {needsCode:true};
      }
      return initiate();
    },
  };
}
