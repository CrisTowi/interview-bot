import { describe, expect, it, vi } from 'vitest';
import type { InterviewNote } from '../types';
import { createInterviewerTools } from './interviewerTools';

function setup(minutesAgo = 0) {
  const notes: InterviewNote[] = [];
  const onEnd = vi.fn();
  const tools = createInterviewerTools({ lang: 'es', notes, startedAt: Date.now() - minutesAgo * 60_000, onEnd });
  const byName = (name: string) => tools.find((t) => t.name === name)!;
  return { notes, onEnd, takeNote: byName('take_note'), review: byName('review_notes'), end: byName('end_interview') };
}

describe('take_note', () => {
  it('records the evidence with the minute it was taken', () => {
    const { notes, takeNote } = setup(5);
    const result = takeNote.run({
      dimension: 'ownership',
      signal: 'gap',
      observation: ' Said we ',
      quote: 'we did it',
    });
    expect(result).toBe('Noted (1 so far).');
    expect(notes).toEqual([
      { dimension: 'ownership', signal: 'gap', observation: 'Said we', quote: 'we did it', minute: 5 },
    ]);
  });

  it('defaults unknown dimensions and signals instead of storing garbage', () => {
    const { notes, takeNote } = setup();
    takeNote.run({ dimension: 'charisma', signal: 'amazing', observation: 'x' });
    expect(notes[0]).toMatchObject({ dimension: 'structure', signal: 'gap', quote: undefined });
  });

  it('refuses an empty observation', () => {
    const { notes, takeNote } = setup();
    expect(takeNote.run({ dimension: 'impact', signal: 'strength', observation: '   ' })).toMatch(/Nothing recorded/);
    expect(notes).toHaveLength(0);
  });

  it('asks for observations in the interview language', () => {
    const { takeNote } = setup();
    expect(JSON.stringify(takeNote.parameters)).toContain('Spanish');
  });
});

describe('review_notes', () => {
  it('reports elapsed time and that there are no notes yet', () => {
    const { review } = setup(12);
    const text = review.run({});
    expect(text).toContain('Elapsed: 12 min');
    expect(text).toContain('No notes yet.');
    expect(text).toContain('No evidence yet for: structure, specificity, ownership, impact, scope, communication.');
  });

  it('lists the notes and only the dimensions still missing', () => {
    const { takeNote, review } = setup();
    takeNote.run({ dimension: 'impact', signal: 'strength', observation: 'Cut latency', quote: '900 to 250 ms' });
    const text = review.run({});
    expect(text).toContain('- [impact, strength] Cut latency ("900 to 250 ms")');
    expect(text).not.toMatch(/No evidence yet for:.*impact/);
  });
});

describe('end_interview', () => {
  it('hangs up and ends the turn', () => {
    const { end, onEnd } = setup();
    expect(end.endsTurn).toBe(true);
    expect(end.run({})).toBe('Call ended.');
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
