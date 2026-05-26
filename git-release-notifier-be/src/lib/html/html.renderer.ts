import { readFileSync } from 'fs';
import { join } from 'path';

const templateCache = new Map<string, string>();

export function renderHtml(templateName: string, variables: Record<string, string> = {}): string {
  if (!templateCache.has(templateName)) {
    templateCache.set(
      templateName,
      readFileSync(join(__dirname, '../../public', templateName), 'utf8'),
    );
  }

  const template = templateCache.get(templateName)!;

  return Object.entries(variables).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template,
  );
}
