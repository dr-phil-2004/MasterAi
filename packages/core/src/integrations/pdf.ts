import { extractText, getDocumentProxy } from 'unpdf';

/** Extrait le texte d'un cahier des charges PDF. */
export async function pdfToText(data: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdf = await getDocumentProxy(data);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), pages: totalPages };
}
