// The motion command: reading the setting the store holds, turning the words into a new setting or a refusal,
// and describing it. Pure; register.tsx does the storing and tells the activity.
//
// The setting is one global boolean for every project. Ambient motion is on unless it was turned off,
// so a store that holds nothing, or something unreadable, means on.

/** The store key the setting is saved under. */
export const MOTION = 'motion'

/** Reads the setting back from the store: only an explicit `false` is off. */
export const parseMotion = (raw: unknown): boolean => raw !== false

const describe = (isOn: boolean): string => `Ambient motion is ${isOn ? 'on' : 'off'}.`

/** The reply to the command with no arguments. */
export const motionReport = (isOn: boolean): string => [describe(isOn), 'Turn it off or on with /sidekick-motion off or /sidekick-motion on.'].join('\n')

export type MotionChange = { readonly isSaved: true; readonly isOn: boolean; readonly text: string } | { readonly isSaved: false; readonly text: string }

/** The words `off` or `on` (any case) become the setting to save; anything else is refused and changes nothing. */
export const changeMotion = (args: string): MotionChange => {
  const word = args.trim().toLowerCase()
  if (word === 'on' || word === 'off') {
    const isOn = word === 'on'

    return { isSaved: true, isOn, text: describe(isOn) }
  }

  return { isSaved: false, text: `Say on or off, e.g. /sidekick-motion off; "${args.trim()}" is neither.\nNothing was changed.` }
}
