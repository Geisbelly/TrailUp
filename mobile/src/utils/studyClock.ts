import type { StudyBlockSnapshot } from '../hooks/trilha/types';

type Block = Omit<StudyBlockSnapshot, 'startedAtMs'>;
export type StudyInterval = { block: Block; startedAtMs: number; endedAtMs: number; minutes: number };

/**
 * Os dois relógios fecham o intervalo a cada 60 s. Passou muito disso, o JS
 * dormiu com a tela desligada antes de o `AppState` avisar. Não dá para saber
 * quanto do trecho foi estudo, e o que não pode é contar tela desligada: o
 * intervalo inteiro é descartado.
 */
export const INTERVALO_MAXIMO_MS = 90_000;

/** Consumes each foreground interval once, before any asynchronous write. */
export class StudyClock {
  private block: Block | null = null;
  private startedAt: number | null = null;
  constructor(private foreground = true) {}

  setBlock(block: Block | null, now: number): StudyInterval | null {
    if (block?.key === this.block?.key) { this.block = block; return null; }
    const interval = this.flush(now);
    this.block = block;
    this.startedAt = block && this.foreground ? now : null;
    return interval;
  }

  setForeground(foreground: boolean, now: number): StudyInterval | null {
    if (foreground === this.foreground) return null;
    const interval = this.flush(now);
    this.foreground = foreground;
    this.startedAt = foreground && this.block ? now : null;
    return interval;
  }

  flush(now: number): StudyInterval | null {
    if (!this.foreground || !this.block || this.startedAt == null) return null;
    const start = this.startedAt;
    const end = Math.max(start, now);
    this.startedAt = end;
    if (end === start || end - start > INTERVALO_MAXIMO_MS) return null;
    return { block: this.block, startedAtMs: start, endedAtMs: end, minutes: (end - start) / 60_000 };
  }
}
