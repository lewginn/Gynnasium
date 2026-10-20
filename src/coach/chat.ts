// The coach chats, kept in sessionStorage so leaving the page (to look at a plan, say) doesn't lose them.
// One chat per screen: 'new' (build a plan), a plan's id (change it), or 'goal'.

const storageKey = (key: string | undefined) => `gynnasium.coach.${key ?? 'new'}`

export function loadChat<T>(key: string | undefined): T[] {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(key)) ?? '[]') as T[]
  } catch {
    return []
  }
}

export function saveChat(key: string | undefined, entries: unknown[]) {
  try {
    if (entries.length) sessionStorage.setItem(storageKey(key), JSON.stringify(entries))
    else sessionStorage.removeItem(storageKey(key))
  } catch {
    // Storage unavailable: the chat just isn't kept if you leave the page.
  }
}

/** A deleted plan takes its chats with it: the one that changed it, and the one that built it. */
export function forgetPlanChats(planId: string) {
  saveChat(planId, [])
  if (loadChat<{ planId?: string }>(undefined).some((e) => e.planId === planId)) saveChat(undefined, [])
}

/** A deleted goal takes its chat with it, so the next goal starts fresh. */
export const forgetGoalChat = () => saveChat('goal', [])
