import { readSetting, writeSetting } from '@mysuite/core/appearance'

export { applyTheme, loadTheme, saveTheme, type Theme } from '@mysuite/core/appearance'

/** The typewriter light that follows the line being written. Screen only. */
const LAMP_KEY = 'mydocs:lamp'
export const loadLamp = () => readSetting(LAMP_KEY) === 'on'
export const saveLamp = (on: boolean) => writeSetting(LAMP_KEY, on ? 'on' : 'off')
