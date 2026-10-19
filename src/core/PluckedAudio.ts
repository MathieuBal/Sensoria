/** Opt-in pentatonic instrument. No context is created before a button gesture. */
export class PluckedAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private voices: { oscillators: OscillatorNode[]; gain: GainNode }[] = [];
  private enabled = false;
  private readonly visibility = (): void => {
    if (document.hidden) { this.clear(); void this.context?.suspend().catch(() => {}); }
  };
  constructor() { document.addEventListener('visibilitychange', this.visibility); }
  async enable(on: boolean): Promise<boolean> {
    this.enabled = on;
    if (!on) { this.clear(); return false; }
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain(); this.output.gain.value = .18;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -18; limiter.ratio.value = 6;
        this.output.connect(limiter); limiter.connect(this.context.destination);
      }
      await this.context.resume();
      return this.enabled && this.context.state === 'running';
    } catch { this.enabled = false; return false; }
  }
  play(index: number, register: number, strength: number): void {
    if (!this.enabled || !this.context || document.hidden || !this.output) return;
    if (this.context.state !== 'running') { void this.context.resume().catch(() => {}); return; }
    const context = this.context, now = context.currentTime;
    const semitone = [0,2,4,7,9][index%5] + 12*Math.floor(index/5);
    const frequency = 130.8128 * Math.pow(2,(semitone+(register-1)*12)/12);
    if (this.voices.length >= 10) this.release(this.voices[0]);
    const gain = context.createGain(); gain.connect(this.output);
    const level = .12 + Math.min(1,strength)*.18;
    gain.gain.setValueAtTime(0,now); gain.gain.linearRampToValueAtTime(level,now+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,now+1.8);
    const oscillator = context.createOscillator(); oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
    oscillator.connect(gain); const voice = { oscillators: [oscillator], gain };
    this.voices.push(voice); oscillator.onended = () => this.release(voice);
    oscillator.start(now); oscillator.stop(now+1.85);
  }
  private release(voice: { oscillators: OscillatorNode[]; gain: GainNode }): void {
    const index = this.voices.indexOf(voice); if (index < 0) return;
    this.voices.splice(index,1);
    for (const oscillator of voice.oscillators) { oscillator.onended = null; try { oscillator.stop(); } catch { /* already ended */ } oscillator.disconnect(); }
    voice.gain.disconnect();
  }
  clear(): void { for (const voice of [...this.voices]) this.release(voice); }
  dispose(): void {
    this.enabled = false; this.clear(); document.removeEventListener('visibilitychange',this.visibility);
    void this.context?.close().catch(() => {}); this.context = null; this.output = null;
  }
}
