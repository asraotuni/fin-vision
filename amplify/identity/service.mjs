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

  return {
    async resolve(subject){
      const account = await accountFor(subject);
      return {accountId:account.accountId, linkedIdentityCount:account.subjects.length};
    },
    async start(subject){
      const account = await accountFor(subject);
      const ticket = randomBytes(32).toString('hex');
      const startedAt = now();
      await store.commit([{put:{pk:`LINK#${digest(ticket)}`, sourceSubject:subject,
        accountId:account.accountId, startedAt, expiresAt:startedAt + 600}, absent:true}]);
      return {ticket, expiresAt:startedAt + 600};
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
        const winner = {...source, version:source.version + 1, subjects};
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
}
