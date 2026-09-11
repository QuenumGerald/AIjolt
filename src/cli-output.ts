export function writeJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data)}\n`);
}

export function writeText(text: string): void {
  process.stdout.write(`${text.endsWith('\n') ? text : `${text}\n`}`);
}

export function emit(json: boolean, data: unknown, text?: string): void {
  if (json) writeJson(data);
  else writeText(text ?? JSON.stringify(data, null, 2));
}
