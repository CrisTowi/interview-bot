import type { Lang } from '../types';

/** Long CVs are trimmed so they fit small models (e.g. Chrome's local Gemini Nano). */
const MAX_CV_CHARS = 15_000;

/**
 * Pulls plain text out of a CV or a LinkedIn "Save to PDF" export, entirely in the browser:
 * the file itself never leaves this device.
 */
export async function extractText(file: File): Promise<string> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const text = isPdf ? await pdfText(file) : await file.text();
  const clean = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (clean.length < 80) {
    throw new Error('No encontramos texto en ese archivo. Si es un PDF escaneado (una imagen), pega el texto en su lugar.');
  }
  return clean.slice(0, MAX_CV_CHARS);
}

async function pdfText(file: File): Promise<string> {
  // pdf.js is large, so it only loads when someone actually uploads a PDF.
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join(''));
  }
  await task.destroy();
  return pages.join('\n\n');
}

const LANGUAGE: Record<Lang, string> = { es: 'Spanish', en: 'English' };
const LABELS: Record<Lang, string[]> = {
  es: ['Perfil', 'Experiencia clave', 'Liderazgo e impacto', 'Habilidades', 'Temas para preguntar'],
  en: ['Profile', 'Key experience', 'Leadership and impact', 'Skills', 'Topics to ask about'],
};

export function buildCvSummaryPrompt(lang: Lang): string {
  const [profile, experience, leadership, skills, topics] = LABELS[lang];
  return `You turn a CV or LinkedIn profile into a compact briefing for a behavioral interviewer.
Write in ${LANGUAGE[lang]}, plain text, no markdown, at most 180 words, using exactly these labeled lines:
${profile}: <current role, years of experience, industry or domain>
${experience}: <the 2-4 most relevant roles or projects, with scope and measurable results>
${leadership}: <signals of ownership, mentoring, cross-team influence>
${skills}: <main skills and technologies>
${topics}: <3 specific situations from this background worth probing with behavioral questions>
Use only facts present in the text and never invent numbers. Leave out personal contact details (email, phone, address, links).`;
}
