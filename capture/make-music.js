// Synthesise an original ambient bed for the walkthrough.
//
// Written from scratch rather than sourced, so there is no licence attached and
// nothing for a platform to flag. Additive synthesis: a few sine partials per
// note with a slow attack, a soft arpeggio on top, and a little detune between
// channels for width.
const fs = require('fs');
const path = require('path');

const SR = 44100;
const DUR = 66;                 // a touch over the 65s clip so the fade lands clean
const N = SR * DUR;

// A minor, i - VI - III - VII. Calm, resolves, does not demand attention.
const CHORDS = [
  [110.00, 164.81, 261.63, 329.63],   // Am   A2 E3 C4 E4
  [ 87.31, 174.61, 261.63, 349.23],   // F    F2 F3 C4 F4
  [130.81, 196.00, 261.63, 392.00],   // C    C3 G3 C4 G4
  [ 98.00, 196.00, 293.66, 392.00],   // G    G2 G3 D4 G4
];
const BAR = 4.0;                       // seconds per chord

// Partial weights: fundamental plus a gentle roll-off. Anything sharper than
// this starts to sound like a test tone rather than a pad.
const PARTIALS = [
  { mult: 1, gain: 1.00 },
  { mult: 2, gain: 0.30 },
  { mult: 3, gain: 0.12 },
  { mult: 4, gain: 0.05 },
];

const left = new Float64Array(N);
const right = new Float64Array(N);

// Slow attack and release so chords bleed into each other instead of stepping.
function env(t, len) {
  const atk = 1.1, rel = 1.6;
  if (t < atk) return Math.pow(t / atk, 1.6);
  if (t > len - rel) return Math.pow(Math.max(0, (len - t) / rel), 1.4);
  return 1;
}

const totalBars = Math.ceil(DUR / BAR);
for (let b = 0; b < totalBars; b++) {
  const chord = CHORDS[b % CHORDS.length];
  const t0 = b * BAR;
  const len = BAR + 1.4;                       // overlap the next chord
  for (let i = 0; i < len * SR; i++) {
    const idx = Math.floor(t0 * SR) + i;
    if (idx >= N) break;
    const t = i / SR;
    const e = env(t, len);
    if (e <= 0) continue;
    for (const f of chord) {
      for (const p of PARTIALS) {
        // A few cents apart per channel gives width without sounding out of tune.
        const fl = f * p.mult * 0.9993;
        const fr = f * p.mult * 1.0007;
        const a = e * p.gain * 0.055;
        left[idx] += Math.sin(2 * Math.PI * fl * (t0 + t)) * a;
        right[idx] += Math.sin(2 * Math.PI * fr * (t0 + t)) * a;
      }
    }
  }
}

// A sparse arpeggio riding on top, quiet enough to read as texture.
const ARP = [523.25, 659.26, 783.99, 659.26];   // C5 E5 G5 E5
const STEP = 0.5;
for (let s = 0; s * STEP < DUR; s++) {
  const t0 = s * STEP;
  const f = ARP[s % ARP.length] * (s % 8 < 4 ? 1 : 0.75);
  const len = 1.1;
  for (let i = 0; i < len * SR; i++) {
    const idx = Math.floor(t0 * SR) + i;
    if (idx >= N) break;
    const t = i / SR;
    const e = Math.exp(-t * 3.2) * 0.045;       // plucked decay
    const v = Math.sin(2 * Math.PI * f * t) * e
            + Math.sin(2 * Math.PI * f * 2 * t) * e * 0.18;
    left[idx] += v * 0.85;
    right[idx] += v;
  }
}

// One-pole low pass to take the edge off the partials.
let pl = 0, pr = 0;
const k = 0.30;
for (let i = 0; i < N; i++) {
  pl += (left[i] - pl) * k;  left[i] = pl;
  pr += (right[i] - pr) * k; right[i] = pr;
}

// Master fades.
const fadeIn = 2.5 * SR, fadeOut = 4.0 * SR;
for (let i = 0; i < N; i++) {
  let g = 1;
  if (i < fadeIn) g *= i / fadeIn;
  if (i > N - fadeOut) g *= (N - i) / fadeOut;
  left[i] *= g; right[i] *= g;
}

// Normalise to about -16 dBFS. Loud enough to hear, quiet enough to sit under.
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const target = Math.pow(10, -16 / 20) * 4;
const norm = peak > 0 ? Math.min(1, target / peak) : 1;

const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
const clamp = (v) => Math.max(-32767, Math.min(32767, Math.round(v * norm * 32767)));
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(clamp(left[i]), 44 + i * 4);
  buf.writeInt16LE(clamp(right[i]), 46 + i * 4);
}

const out = path.join(__dirname, 'out', 'video', 'bed.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buf);
console.log(`wrote ${out}  ${DUR}s stereo ${SR}Hz  ${(buf.length / 1048576).toFixed(1)} MB`);
console.log(`peak before normalise ${peak.toFixed(3)}, gain ${norm.toFixed(3)}`);
