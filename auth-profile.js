export const BIRTHDAY_SCOPE = 'https://www.googleapis.com/auth/user.birthday.read';
export const ADDRESS_SCOPE = 'https://www.googleapis.com/auth/user.addresses.read';

// Use the Google subject, not an email or a login hint, to bind both consent flows.
export function googleSubject(payload){
  try {
    const identities = typeof payload.identities === 'string' ? JSON.parse(payload.identities) : payload.identities;
    return identities?.find(identity => identity.providerName === 'Google')?.userId || null;
  } catch { return null; }
}

export function profileDetails(person){
  const primary = items => items?.find(item => item.metadata?.primary) || items?.[0];
  const date = primary(person.birthdays)?.date;
  let birthday = 'Not provided by Google';
  if(date?.month && date?.day){
    birthday = `${String(date.day).padStart(2, '0')}/${String(date.month).padStart(2, '0')}${date.year ? `/${date.year}` : ' (year not shared)'}`;
  }
  const address = primary(person.addresses);
  const country = [address?.region, address?.country || address?.countryCode].filter(Boolean).join(', ');
  return {birthday, country:country || 'Not provided by Google'};
}

export async function readGoogleProfile(accessToken, scopes, expectedSubject, fetcher = fetch){
  const headers = {Authorization:`Bearer ${accessToken}`};
  const identityResponse = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', {headers, cache:'no-store'});
  if(!identityResponse.ok) throw new Error('Could not verify the Google account. Try sharing again.');
  const identity = await identityResponse.json();
  if(!expectedSubject || identity.sub !== expectedSubject){
    throw new Error('Choose the same Google account that you used to sign in.');
  }
  const granted = new Set(scopes.split(' '));
  const fields = [];
  if(granted.has(BIRTHDAY_SCOPE)) fields.push('birthdays');
  if(granted.has(ADDRESS_SCOPE)) fields.push('addresses');
  if(!fields.length) return {birthday:'Permission not granted', country:'Permission not granted'};
  const response = await fetcher(`https://people.googleapis.com/v1/people/me?personFields=${fields.join(',')}&sources=READ_SOURCE_TYPE_PROFILE`, {headers, cache:'no-store'});
  if(!response.ok) throw new Error('Google profile details could not be retrieved. You can continue planning and try sharing again later.');
  const details = profileDetails(await response.json());
  if(!granted.has(BIRTHDAY_SCOPE)) details.birthday = 'Permission not granted';
  if(!granted.has(ADDRESS_SCOPE)) details.country = 'Permission not granted';
  return details;
}
