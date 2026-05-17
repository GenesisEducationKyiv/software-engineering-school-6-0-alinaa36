import { readFileSync } from 'fs';
import { join } from 'path';

export function renderHtml(templateName: string, variables: Record<string, string> = {}): string {
  const template = readFileSync(join(__dirname, '../../public', templateName), 'utf8');

  return Object.entries(variables).reduce(
    (html, [key, value]) => html.replace(`{{${key}}}`, value),
    template,
  );
}
