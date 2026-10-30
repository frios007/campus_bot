/** Carga las plantillas de prompts versionadas en la carpeta prompts/. */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
	const cached = cache.get(name);
	if (cached) return cached;
	const raw = fs.readFileSync(
		path.join(config.paths.promptsDir, `${name}.md`),
		"utf8",
	);
	// Se omite el encabezado de metadatos (líneas iniciales que empiezan con "<!--").
	const content = raw.replace(/^<!--[\s\S]*?-->\s*/, "");
	cache.set(name, content);
	return content;
}

/** Sustituye {{variables}} en una plantilla. */
export function fill(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}
