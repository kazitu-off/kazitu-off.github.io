let muted = JSON.parse(localStorage.getItem("shprotplay:muted") || "false");
let context;
export function isMuted() { return muted; }
export function setMuted(value) { muted = Boolean(value); localStorage.setItem("shprotplay:muted", JSON.stringify(muted)); }
export function playTone(kind = "click") { if (muted) return; try { context ||= new AudioContext(); const osc = context.createOscillator(); const gain = context.createGain(); const frequencies = { click: 440, coin: 660, error: 140, success: 880 }; osc.frequency.value = frequencies[kind] || frequencies.click; osc.type = kind === "error" ? "sawtooth" : "sine"; gain.gain.setValueAtTime(.045, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .11); osc.connect(gain).connect(context.destination); osc.start(); osc.stop(context.currentTime + .12); } catch { /* audio is an enhancement */ } }
