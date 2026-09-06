import { randomUUID, randomBytes, createHash } from 'node:crypto';

export class IdentityError extends Error {
  constructor(status, message){ super(message); this.status = status; }
}
const fail = (status, message) => { throw new IdentityError(status, message); };
const digest = ticket => createHash('sha256').update(ticket).digest('hex');

// The store exposes consistent reads and atomic conditional writes. Account aliases
// are permanent: future data APIs must resolve them before authorizing data access.
export function createIdentityService(store, now = () => Math.floor(Date.now() / 1000)){
  async function root(accountId){
    for(let depth = 0; depth < 32; depth++){
      const account = await store.get(`ACCOUNT#${accountId}`);
      if(!account) return fail(503, 'Account identity is unavailable. Please retry.');
      if(!account.parent) return account;
      accountId = account.parent;
    }
    return fail(503, 'Account identity requires support.');
  }

  async function accountFor(subject){
    const key = `IDENTITY#${subject}`;
    for(let attempt = 0; attempt < 5; attempt++){
      const identity = await store.get(key);
      if(identity) return root(identity.accountId);
      const accountId = randomUUID();
      const account = {pk:`ACCOUNT#${accountId}`, accountId, version:0, subjects:[subject]};
      if(await store.commit([
        {put:{pk:key, accountId}, absent:true},
        {put:account, absent:true},
      ])) return account;
    }
    return fail(409, 'Account changed. Please retry.');
  }

  const service = {
    async resolve(subject){
      const account = await accountFor(subject);
      return {accountId:account.accountId, linkedIdentityCount:account.subjects.length, ...(account.profile ? {profile:account.profile} : {})};
    },
    async profile(subject, values, defaultsOnly = false){
      if(!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(key => !['firstName','lastName'].includes(key))) return fail(400, 'Invalid name fields.');
      const names = {};
      for(const [key,value] of Object.entries(values)){
        if(typeof value !== 'string' || value.length > 100 || /[\u0000-\u001f\u007f]/.test(value)) return fail(400, 'Names must be text of at most 100 characters.');
        if(!defaultsOnly || value.trim()) names[key] = value.trim();
      }
      for(let attempt = 0; attempt < 5; attempt++){
        const account = await accountFor(subject);
        const profile = defaultsOnly ? {...names,...account.profile} : {...account.profile,...names};
        if(await store.commit([{put:{...account,profile,version:account.version+1},version:account.version}])) return service.resolve(subject);
      }
      return fail(409, 'Account changed. Please save your name again.');
    },
    async start(subject, startedAt = now()){
      const account = await accountFor(subject);
      const ticket = randomBytes(32).toString('hex');
      await store.commit([{put:{pk:`LINK#${digest(ticket)}`, sourceSubject:subject,
        accountId:account.accountId, startedAt, expiresAt:now() + 600}, absent:true}]);
      return {ticket, expiresAt:now() + 600};
    },
    async connect(sourceSubject, targetSubject, authTime){
      if(!Number.isFinite(authTime) || authTime < now() - 600 || authTime > now() + 5) return fail(401, 'Verify the sign-in method again.');
      if(sourceSubject === targetSubject) return service.resolve(sourceSubject);
      const {ticket} = await service.start(sourceSubject, authTime);
      return service.complete(targetSubject, authTime, ticket);
    },
    async complete(subject, authTime, ticket){
      if(typeof ticket !== 'string' || !/^[a-f0-9]{64}$/.test(ticket)) return fail(400, 'Invalid linking request.');
      const key = `LINK#${digest(ticket)}`;
      for(let attempt = 0; attempt < 5; attempt++){
        const link = await store.get(key);
        if(!link || link.expiresAt <= now()) return fail(410, 'Linking expired or was already completed. Start again.');
        if(subject === link.sourceSubject) return fail(400, 'Sign in with the other method to link it.');
        if(!Number.isFinite(authTime) || authTime < link.startedAt - 5) return fail(401, 'Sign in again with the method you want to link.');
        const source = await root(link.accountId);
        const target = await accountFor(subject);
        const consume = {delete:key, expiresAt:link.expiresAt};
        if(source.accountId === target.accountId){
          if(await store.commit([consume])) return {accountId:source.accountId, linkedIdentityCount:source.subjects.length};
          continue;
        }
        const subjects = [...new Set([...source.subjects, ...target.subjects])];
        if(subjects.length > 10) return fail(409, 'An account can have at most 10 linked identities.');
        // Keep the current account's choices, including intentional empty names.
        const profile = {...target.profile,...source.profile};
        const winner = {...source, version:source.version + 1, subjects, ...(Object.keys(profile).length ? {profile} : {})};
        // Both roots must still be roots at these versions, preventing cycles and
        // lost links when requests race. The ticket is consumed in the same write.
        if(await store.commit([
          consume,
          {put:winner, version:source.version},
          {put:{...target, parent:source.accountId, version:target.version + 1}, version:target.version},
        ])) return {accountId:winner.accountId, linkedIdentityCount:subjects.length};
      }
      return fail(409, 'Account changed while linking. Please retry.');
    },
  };
  return service;
}
