import { IdentityError } from './service.mjs';

export function createIdentityHandler(service, verify){
  return async event => {
    const response = (statusCode, body) => ({statusCode, headers:{'content-type':'application/json', 'cache-control':'no-store'}, body:JSON.stringify(body)});
    try {
      let payload;
      try {
        const authorization = event.headers?.authorization || event.headers?.Authorization || '';
        if(!authorization.startsWith('Bearer ')) throw new Error('Missing token');
        payload = await verify(authorization.slice(7));
      } catch { return response(401, {message:'Please sign in again.'}); }
      if(event.requestContext?.http?.method !== 'POST') return response(405, {message:'Method not allowed.'});
      if(event.isBase64Encoded || (event.body?.length || 0) > 16384) return response(400, {message:'Invalid request.'});
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch { return response(400, {message:'Invalid request.'}); }
      if(!body || typeof body !== 'object' || Array.isArray(body)) return response(400, {message:'Invalid request.'});
      // Pool replacement must never reuse an identity from a different issuer.
      const subject = `${payload.iss}#${payload.sub}`;
      if(body.action === 'resolve') return response(200, await service.resolve(subject));
      if(body.action === 'start') return response(200, await service.start(subject));
      if(body.action === 'complete') return response(200, await service.complete(subject, payload.auth_time, body.ticket));
      if(body.action === 'connect'){
        let second;
        try { second = await verify(body.accessToken); }
        catch { return response(401,{message:'The additional sign-in could not be verified. Please try again.'}); }
        if(second.iss !== payload.iss) return response(401,{message:'Invalid sign-in provider.'});
        return response(200,await service.connect(subject,`${second.iss}#${second.sub}`,second.auth_time));
      }
      return response(400, {message:'Unknown account action.'});
    } catch(error){
      if(error instanceof IdentityError) return response(error.status, {message:error.message});
      // Never log tokens, linking tickets, or request bodies.
      console.error('Identity operation failed', error.name);
      return response(503, {message:'Account service is unavailable. Please retry.'});
    }
  };
}
