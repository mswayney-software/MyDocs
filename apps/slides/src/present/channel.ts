import type { ShowState } from './state'

/**
 * Presenter view's two windows talk over a BroadcastChannel: same origin, same device, no
 * network (spec, Architecture). Each presentation gets its own channel, named in the audience
 * window's address, so two decks presenting at once never mix.
 *
 *   audience -> presenter  hello              "I'm open; where's the deck?"
 *   presenter -> audience  ready {deckId, show}  the deck is backed up under deckId
 *   either way             show {show}         moved (a key, a click, a button)
 *   either way             end                 this window is closing: the session is over
 */
export type ShowMessage =
  | { type: 'hello' }
  | { type: 'ready'; deckId: string; show: ShowState }
  | { type: 'show'; show: ShowState }
  | { type: 'end' }

/** Address parameter that turns a page into an audience window. */
export const AUDIENCE_PARAM = 'audience'

export const channelName = (token: string) => `myslides-present:${token}`

export function openChannel(token: string, onMessage: (m: ShowMessage) => void) {
  const channel = new BroadcastChannel(channelName(token))
  channel.onmessage = (e: MessageEvent<ShowMessage>) => onMessage(e.data)
  return {
    send: (m: ShowMessage) => channel.postMessage(m),
    close: () => channel.close(),
  }
}

export type ShowChannel = ReturnType<typeof openChannel>

/** The audience window's address: this app, with the presentation's channel. */
export function audienceUrl(token: string) {
  const url = new URL(window.location.href)
  url.search = `?${AUDIENCE_PARAM}=${encodeURIComponent(token)}`
  url.hash = ''
  return url.toString()
}

/** The audience window's channel token, or null in an ordinary window. */
export const audienceToken = () => new URLSearchParams(window.location.search).get(AUDIENCE_PARAM)
