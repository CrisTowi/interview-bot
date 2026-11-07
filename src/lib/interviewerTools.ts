import type { AgentTool } from '../engines/agent';
import type { Dimension, InterviewNote, Lang } from '../types';
import { DIMENSIONS } from './prompts';

const LANGUAGE: Record<Lang, string> = { es: 'Spanish', en: 'English' };

interface Options {
  lang: Lang;
  /** Notes live here for the whole call; the evaluation and the results screen read them afterwards. */
  notes: InterviewNote[];
  startedAt: number;
  onEnd: () => void;
}

const minutesSince = (start: number) => Math.max(0, Math.round((Date.now() - start) / 60_000));

/**
 * The interviewer's tools. take_note acts, review_notes lets it observe (what's missing, how long it's been)
 * and decide the next question, and end_interview lets it hang up. All run in the browser.
 */
export function createInterviewerTools({ lang, notes, startedAt, onEnd }: Options): AgentTool[] {
  return [
    {
      name: 'take_note',
      description:
        "Silently record one piece of evidence about the candidate's last answer, like a real interviewer's notes. Call it after substantive answers, for strengths and for gaps. Never mention it to the candidate.",
      parameters: {
        type: 'object',
        properties: {
          dimension: { type: 'string', enum: DIMENSIONS, description: 'Evaluation dimension this evidence is about.' },
          signal: {
            type: 'string',
            enum: ['strength', 'gap'],
            description: 'Whether it counts for or against the candidate.',
          },
          observation: { type: 'string', description: `One short sentence, written in ${LANGUAGE[lang]}.` },
          quote: { type: 'string', description: "The candidate's exact words that support it, if any." },
        },
        required: ['dimension', 'signal', 'observation'],
      },
      run(args) {
        const dimension = (DIMENSIONS as string[]).includes(String(args.dimension))
          ? (args.dimension as Dimension)
          : 'structure';
        const observation = String(args.observation ?? '').trim();
        if (!observation) return 'Nothing recorded: the observation was empty.';
        notes.push({
          dimension,
          signal: args.signal === 'strength' ? 'strength' : 'gap',
          observation,
          quote: args.quote ? String(args.quote).trim() : undefined,
          minute: minutesSince(startedAt),
        });
        return `Noted (${notes.length} so far).`;
      },
    },
    {
      name: 'review_notes',
      description:
        'Review your notes before choosing the next main question: see the evidence so far, which dimensions still have none, and how much time has passed.',
      parameters: {
        type: 'object',
        properties: { purpose: { type: 'string', description: 'Optional: what you want to check.' } },
      },
      run() {
        const covered = new Set(notes.map((n) => n.dimension));
        const missing = DIMENSIONS.filter((d) => !covered.has(d));
        const lines = notes.map(
          (n) => `- [${n.dimension}, ${n.signal}] ${n.observation}${n.quote ? ` ("${n.quote}")` : ''}`,
        );
        return [
          `Elapsed: ${minutesSince(startedAt)} min (aim for about 30).`,
          notes.length ? `Notes (${notes.length}):\n${lines.join('\n')}` : 'No notes yet.',
          missing.length ? `No evidence yet for: ${missing.join(', ')}.` : 'Every dimension has some evidence.',
        ].join('\n');
      },
    },
    {
      name: 'end_interview',
      description:
        "Hang up the call. Only once you've wrapped up, answered the candidate's questions and said goodbye in this same turn.",
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', description: 'Optional: why the interview is complete.' } },
      },
      endsTurn: true,
      run() {
        onEnd();
        return 'Call ended.';
      },
    },
  ];
}
