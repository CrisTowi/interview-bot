import type { ChatMessage, Company, Dimension, Evaluation, Focus, Lang, Profile, SessionSummary } from '../types';

const LANGUAGE: Record<Lang, string> = { es: 'Spanish', en: 'English' };

/** Lowercase so they read naturally inside the home sentence ("…sobre liderazgo"). */
export const FOCUS_LABELS: Record<Focus, string> = {
  mixed: 'temas variados',
  leadership: 'liderazgo',
  conflict: 'conflictos',
  failure: 'errores y aprendizaje',
  impact: 'impacto y resultados',
  ambiguity: 'ambigüedad',
};

export function focusTitle(focus: Focus | undefined): string {
  const label = FOCUS_LABELS[focus ?? 'mixed'] ?? FOCUS_LABELS.mixed;
  return label[0].toUpperCase() + label.slice(1);
}

const FOCUS_GUIDE: Record<Focus, string> = {
  mixed: 'Cover a mix of competencies: leadership, conflict, failure, impact and ambiguity.',
  leadership: 'Focus on leadership and influence: leading without authority, mentoring, driving decisions, raising the bar.',
  conflict: 'Focus on conflict: disagreements with peers or managers, pushing back, difficult stakeholders, resolving tension.',
  failure: 'Focus on failure and growth: mistakes, missed deadlines, negative feedback, what they learned and changed.',
  impact: 'Focus on impact: their most significant achievements, how they measured results, prioritization and trade-offs.',
  ambiguity: 'Focus on ambiguity: unclear requirements, shifting priorities, making decisions with incomplete information.',
};

const COMPANY_GUIDE: Record<Company, string> = {
  Google: 'Follow the Google style: assess "Googleyness and Leadership": collaboration, humility, comfort with ambiguity, doing the right thing.',
  Meta: 'Follow the Meta style: assess drive, conflict resolution, growth mindset and impact at scale; expect fast-paced, direct follow-ups.',
  Amazon:
    'Follow the Amazon style: map every question to a Leadership Principle (Ownership, Dive Deep, Bias for Action, Customer Obsession, Earn Trust, Have Backbone; Disagree and Commit…) and dig deep with follow-ups.',
  Startup: 'Follow a startup style: assess ownership, scrappiness, working with little structure and wearing many hats.',
};

export function buildSystemPrompt(p: Profile, history: SessionSummary[]): string {
  const lines: (string | null)[] = [
    `You are a senior interviewer at ${p.company} running a realistic behavioral interview for a ${p.seniority} ${p.role} position.`,
    COMPANY_GUIDE[p.company],
    FOCUS_GUIDE[p.focus],
    p.background.trim() ? `What the candidate shared about themselves: ${p.background.trim()}` : null,
    p.salary.trim() ? `Candidate's salary expectation: ${p.salary}. Expect the scope of impact that compensation implies.` : null,
    '',
    'Rules:',
    `- Speak only in ${LANGUAGE[p.lang]}.`,
    '- Your replies are read aloud by text-to-speech: keep them short (1-3 sentences) and conversational. No markdown, lists or emojis.',
    '- Every main question asks for a specific past situation ("Tell me about a time…"). Ask one question at a time.',
    '- Follow up to fill in whatever STAR element is missing (Situation, Task, Action, Result). Push for what the candidate personally did ("I", not "we") and for measurable results.',
    `- Probe whether the scope of their stories matches what is expected of a ${p.seniority} engineer.`,
    '- If an answer is vague or hypothetical, politely ask for a concrete example.',
    '- Never give feedback or evaluate during the interview. Never break character or mention that you are an AI.',
    '- Open by greeting the candidate briefly, introducing yourself with a first name, and asking the first question.',
    '- Cover about 4-5 main questions with their follow-ups, then wrap up and invite the candidate to ask you a question.',
  ];

  const past = history.slice(0, 3);
  if (past.length) {
    lines.push('', 'Previous sessions with this candidate (most recent first). Probe the areas they need to improve:');
    for (const s of past) {
      lines.push(`- ${s.date.slice(0, 10)} · ${s.score}/10 · to improve: ${s.improvements.join('; ')}`);
    }
  }
  return lines.filter((l) => l !== null).join('\n');
}

export function kickoffMessage(lang: Lang): ChatMessage {
  const content =
    lang === 'es' ? '(El candidato se ha conectado. Comienza la entrevista.)' : '(The candidate has joined. Start the interview.)';
  return { role: 'user', content, hidden: true };
}

export const DIMENSIONS: Dimension[] = ['structure', 'specificity', 'ownership', 'impact', 'scope', 'communication'];

export function buildSummaryPrompt(p: Profile): string {
  return `You are a member of a ${p.company} hiring committee. Evaluate the candidate in the following behavioral interview for a ${p.seniority} ${p.role} position.
Be honest and specific: quote or paraphrase what the candidate actually said. Address the candidate directly as "you".
Reply ONLY with a JSON object, no other text. Write all text fields in ${LANGUAGE[p.lang]}. Shape:
{
  "score": <integer 1-10>,
  "verdict": "<Strong Hire | Hire | Lean Hire | Lean No Hire | No Hire>",
  "headline": "<one punchy sentence with the single most important takeaway, max 15 words>",
  "summary": "<2-3 sentences explaining the verdict>",
  "dimensions": {
    "structure": {"score": <1-5>, "note": "<one sentence: did answers follow Situation, Task, Action, Result?>"},
    "specificity": {"score": <1-5>, "note": "<one sentence: concrete real examples vs vague or hypothetical>"},
    "ownership": {"score": <1-5>, "note": "<one sentence: what they personally did, 'I' vs 'we'>"},
    "impact": {"score": <1-5>, "note": "<one sentence: measurable results and business impact>"},
    "scope": {"score": <1-5>, "note": "<one sentence: does the scope of their stories match a ${p.seniority} level?>"},
    "communication": {"score": <1-5>, "note": "<one sentence: clarity, concision, structure of delivery>"}
  },
  "strengths": ["<short point>", ...],
  "improvements": ["<short, actionable point>", ...],
  "nextStep": "<one concrete exercise to practice before the next interview>"
}`;
}

export function transcriptText(messages: ChatMessage[]): string {
  return messages
    .filter((m) => !m.hidden)
    .map((m) => `${m.role === 'assistant' ? 'Interviewer' : 'Candidate'}: ${m.content}`)
    .join('\n\n');
}

export function parseEvaluation(raw: string): Evaluation {
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    const data = JSON.parse(match?.[0] ?? '');
    const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    const clamp = (v: unknown, max: number) => Math.min(max, Math.max(1, Math.round(Number(v)) || 1));
    const dimensions = DIMENSIONS.filter((key) => data.dimensions?.[key]).map((key) => ({
      key,
      score: clamp(data.dimensions[key].score, 5),
      note: String(data.dimensions[key].note ?? ''),
    }));
    return {
      score: clamp(data.score, 10),
      verdict: String(data.verdict ?? ''),
      summary: String(data.summary ?? ''),
      strengths: list(data.strengths),
      improvements: list(data.improvements),
      headline: data.headline ? String(data.headline) : undefined,
      dimensions: dimensions.length ? dimensions : undefined,
      nextStep: data.nextStep ? String(data.nextStep) : undefined,
    };
  } catch {
    // Model didn't return valid JSON: keep its text so the feedback isn't lost.
    return { score: 0, verdict: '', summary: raw.trim(), strengths: [], improvements: [] };
  }
}
