// Sound, vibration and screen wake lock for the gym floor. All best-effort: unsupported browsers just skip them.

let audio: AudioContext | null = null

/** Browsers only allow sound after a user gesture, so call this from a tap (e.g. "Start workout", ticking a set). */
export function unlockAudio() {
  try {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
  } catch {
    audio = null
  }
}

/** Three short beeps, loud enough to hear over gym music with the phone on a bench. */
export function restOverAlert() {
  navigator.vibrate?.([300, 150, 300, 150, 300])
  if (!audio) return
  const t0 = audio.currentTime
  for (let i = 0; i < 3; i++) {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'square'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.3 + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.3 + 0.18)
    osc.connect(gain).connect(audio.destination)
    osc.start(t0 + i * 0.3)
    osc.stop(t0 + i * 0.3 + 0.2)
  }
}

export function tapFeedback() {
  navigator.vibrate?.(15)
}
