import { describe, expect, it } from 'vitest';
import type { Profile, SessionSummary } from '../types';
import {
  buildSummaryPrompt,
  buildSystemPrompt,
  kickoffMessage,
  parseEvaluation,
  plannedDuration,
  timeCheck,
  transcriptText,
} from './prompts';

const profile: Profile = {
  role: 'Software Engineer',
  seniority: 'Senior',
  company: 'Amazon',
  focus: 'conflict',
  duration: 'full',
  background: '',
  cvSummary: '',
  salary: '',
  lang: 'es',
};

const past = (i: number): SessionSummary => ({
  id: `s${i}`,
  date: `2026-11-0${i}T10:00:00Z`,
  role: 'Software Engineer',
  seniority: 'Senior',
  company: 'Amazon',
  focus: 'mixed',
  score: i,
  verdict: 'Hire',
  summary: '',
  strengths: [],
  improvements: [`improve-${i}`],
});

describe('buildSystemPrompt', () => {
  it('introduces the interviewer with the company style, the focus and the interview language', () => {
    const prompt = buildSystemPrompt(profile, [], 'Laura', 'female');
    expect(prompt).toContain('You are Laura, a senior interviewer at Amazon');
    expect(prompt).toContain('Leadership Principle');
    expect(prompt).toContain('Focus on conflict');
    expect(prompt).toContain('Speak only in Spanish');
    expect(prompt).toContain('introducing yourself as Laura');
  });

  it('plans the number of questions around the chosen length', () => {
    const full = buildSystemPrompt(profile, [], 'Laura', 'female', true);
    expect(full).toContain('lasts about 30 minutes: cover about 5 main questions');
    expect(full).toContain('about 30 minutes or 5 main questions');
    expect(full).not.toContain('Time is short');

    const quick = buildSystemPrompt({ ...profile, duration: 'quick', chooseLength: true }, [], 'Laura', 'female', true);
    expect(quick).toContain('lasts about 10 minutes: cover about 2 main questions');
    expect(quick).toContain('about 10 minutes or 2 main questions');
    expect(quick).toContain('Time is short');
  });

  it('ignores the chosen length while the length switch is off', () => {
    expect(plannedDuration({ duration: 'quick', chooseLength: false })).toBe('full');
    expect(plannedDuration({ duration: 'quick' })).toBe('full');
    expect(plannedDuration({ duration: 'quick', chooseLength: true })).toBe('quick');
    expect(buildSystemPrompt({ ...profile, duration: 'quick' }, [], 'Laura', null)).toContain('lasts about 30 minutes');
  });

  it('falls back to the full length for a profile saved before lengths existed', () => {
    const { duration: _, ...old } = profile;
    expect(buildSystemPrompt(old as typeof profile, [], 'Laura', null)).toContain('lasts about 30 minutes');
  });

  it('tells the interviewer that time checks come from the clock', () => {
    expect(buildSystemPrompt(profile, [], 'Laura', null)).toContain('time check in parentheses');
  });

  it('tells the interviewer their gender only when it is known', () => {
    expect(buildSystemPrompt(profile, [], 'Laura', 'female')).toContain('You are a woman');
    expect(buildSystemPrompt(profile, [], 'Daniel', 'male')).toContain('You are a man');
    expect(buildSystemPrompt(profile, [], 'Alex', null)).not.toMatch(/You are a (wo)?man/);
  });

  it('describes the tools only in agent mode', () => {
    expect(buildSystemPrompt(profile, [], 'Laura', 'female', true)).toContain('end_interview');
    expect(buildSystemPrompt(profile, [], 'Laura', 'female', false)).not.toContain('take_note');
  });

  it('includes the CV briefing, notes and salary when present', () => {
    const prompt = buildSystemPrompt(
      { ...profile, cvSummary: 'Led payments', background: 'Wants Staff', salary: '150k' },
      [],
      'Laura',
      null,
    );
    expect(prompt).toContain('Led payments');
    expect(prompt).toContain('Wants Staff');
    expect(prompt).toContain('150k');
  });

  it('feeds back only the three most recent sessions', () => {
    const prompt = buildSystemPrompt(profile, [past(4), past(3), past(2), past(1)], 'Laura', null);
    expect(prompt).toContain('improve-4');
    expect(prompt).toContain('improve-2');
    expect(prompt).not.toContain('improve-1');
  });
});

describe('kickoffMessage', () => {
  it('is a hidden user message in the interview language', () => {
    expect(kickoffMessage('es')).toMatchObject({
      role: 'user',
      hidden: true,
      content: expect.stringContaining('candidato'),
    });
    expect(kickoffMessage('en').content).toContain('candidate');
  });
});

describe('buildSummaryPrompt', () => {
  it('passes the interviewer notes as evidence only when there are some', () => {
    const withNotes = buildSummaryPrompt(profile, [
      { dimension: 'ownership', signal: 'gap', observation: 'Said we', quote: 'we did', minute: 3 },
    ]);
    expect(withNotes).toContain('took these notes');
    expect(withNotes).toContain('min 3 [ownership, gap] Said we ("we did")');
    expect(buildSummaryPrompt(profile)).not.toContain('took these notes');
  });
});

describe('transcriptText', () => {
  it('labels speakers and skips hidden messages', () => {
    const text = transcriptText([
      { role: 'user', content: '(kickoff)', hidden: true },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(text).toBe('Interviewer: Hi\n\nCandidate: Hello');
  });
});

describe('parseEvaluation', () => {
  it('reads the JSON even when the model wraps it in prose', () => {
    const evaluation = parseEvaluation(
      'Sure! {"score": 7, "verdict": "Hire", "summary": "Good", "strengths": ["a"], "improvements": ["b"], "headline": "H", "nextStep": "N"} Hope it helps.',
    );
    expect(evaluation).toMatchObject({ score: 7, verdict: 'Hire', strengths: ['a'], headline: 'H', nextStep: 'N' });
  });

  it('clamps scores into range', () => {
    expect(parseEvaluation('{"score": 15}').score).toBe(10);
    expect(parseEvaluation('{"score": 0}').score).toBe(1);
    expect(parseEvaluation('{"score": "nope"}').score).toBe(1);
  });

  it('keeps known dimensions in a fixed order and clamps them to 1–5', () => {
    const { dimensions } = parseEvaluation(
      '{"score": 5, "dimensions": {"impact": {"score": 9, "note": "x"}, "structure": {"score": 2, "note": "y"}, "made_up": {"score": 3}}}',
    );
    expect(dimensions).toEqual([
      { key: 'structure', score: 2, note: 'y' },
      { key: 'impact', score: 5, note: 'x' },
    ]);
  });

  it('falls back to the raw text when the model does not return JSON', () => {
    expect(parseEvaluation('  The candidate did well.  ')).toEqual({
      score: 0,
      verdict: '',
      summary: 'The candidate did well.',
      strengths: [],
      improvements: [],
    });
  });
});

describe('timeCheck', () => {
  it('says nothing early in the interview', () => {
    expect(timeCheck(5, 'standard', 0)).toBeNull();
  });

  it('warns once at three quarters of the planned length, with the minutes left', () => {
    const check = timeCheck(15, 'standard', 0);
    expect(check?.stage).toBe(1);
    expect(check?.note).toContain('about 5 of 20 minutes left');
    expect(timeCheck(16, 'standard', 1)).toBeNull();
  });

  it('asks to wrap up once the time is up, even if the first warning was skipped', () => {
    expect(timeCheck(21, 'standard', 1)).toMatchObject({ stage: 2 });
    expect(timeCheck(31, 'full', 0)?.note).toContain('planned 30 minutes are up');
    expect(timeCheck(40, 'full', 2)).toBeNull();
  });

  it('scales with the chosen length', () => {
    expect(timeCheck(8, 'quick', 0)?.stage).toBe(1);
    expect(timeCheck(8, 'full', 0)).toBeNull();
  });
});
