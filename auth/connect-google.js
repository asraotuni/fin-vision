const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');

// A separate PKCE authorization flow preserves the main tab's login and draft.
export function connectGoogle(auth, redirectUrl, signal){
  const popup = window.open('about:blank', '_blank', 'popup,width=500,height=650');
  if(!popup) return Promise.reject(new Error('Allow popups to connect Google.'));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return new Promise((resolve,reject) => {
    let completing = false;
    const finish = (error, token) => {
      clearInterval(timer); clearTimeout(timeout);
      window.removeEventListener('message', receive);
      signal?.removeEventListener('abort', abort);
      popup.close();
      if(error) reject(error); else resolve(token);
    };
    const abort = () => finish(new Error('Google connection cancelled.'));
    const receive = async event => {
      if(event.origin !== new URL(redirectUrl).origin || event.source !== popup ||
        event.data?.type !== 'fin-vision-connect' || event.data.state !== state || completing) return;
      completing = true;
      if(event.data.error || typeof event.data.code !== 'string') return finish(new Error('Google connection was not completed.'));
      try {
        const response = await fetch(`https://${auth.oauth.domain}/oauth2/token`, {
          method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal,
          body:new URLSearchParams({grant_type:'authorization_code',client_id:auth.user_pool_client_id,
            redirect_uri:redirectUrl,code:event.data.code,code_verifier:verifier}),
        });
        const tokens = await response.json();
        if(!response.ok || !tokens.access_token) throw new Error('Google verification failed. Please try again.');
        finish(null,tokens.access_token);
      } catch(error){ finish(error); }
    };
    const timer = setInterval(() => { if(popup.closed && !completing) abort(); },500);
    const timeout = setTimeout(abort,300000);
    window.addEventListener('message',receive);
    signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted) return abort();
    crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)).then(hash => {
      if(signal?.aborted || popup.closed) return;
      const url = new URL(`https://${auth.oauth.domain}/oauth2/authorize`);
      url.search = new URLSearchParams({response_type:'code',client_id:auth.user_pool_client_id,
        redirect_uri:redirectUrl,identity_provider:'Google',scope:'openid email profile',state,
        code_challenge:base64url(new Uint8Array(hash)),code_challenge_method:'S256',prompt:'select_account'}).toString();
      popup.location.replace(url.href);
    }).catch(error => finish(error));
  });
}
