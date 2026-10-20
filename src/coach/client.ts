import type { CoachError, CoachReply, CoachRequest } from '../lib/coachSchema'
import { webOrigin } from '../native'
import { accessToken } from '../sync'

/** Thrown with a message that can be shown as is. */
export class CoachFailure extends Error {}

/** One turn with the coach. The only part of the app that needs signal; everything else stays local. */
export async function askCoach(request: CoachRequest, signal?: AbortSignal): Promise<CoachReply> {
  if (!navigator.onLine) throw new CoachFailure('You’re offline. The coach needs signal.')
  const token = await accessToken()
  if (!token) throw new CoachFailure('Your login needs refreshing: connect to the internet, or sign out and back in.')
  let res: Response
  try {
    res = await fetch(`${webOrigin()}/api/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new CoachFailure('Couldn’t reach the coach. Check your signal and try again.')
  }
  const body = (await res.json().catch(() => null)) as CoachReply | CoachError | null
  if (!res.ok || !body || 'error' in body) throw new CoachFailure((body && 'error' in body && body.error) || `The coach isn’t available (${res.status}).`)
  return body
}
