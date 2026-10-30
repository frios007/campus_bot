/**
 * Carga los documentos de la base de conocimiento (data/kb/*.md) y los divide en fragmentos (chunks)
 * por sección "## ". Cada fragmento conserva el título del documento para dar contexto al LLM.
 */
import fs from "node:fs";
import path from "node:path";

export type KBDocument = {
	id: string;
	title: string;
	category: string;
	version: string;
	updated: string;
	body: string;
};

export type Chunk = {
	id: string;
	docId: string;
	title: string;
	category: string;
	section: string;
	text: string;
	embedding?: number[];
};

/** Lee el encabezado YAML simple (clave: valor) entre líneas "---". */
export function parseDocument(id: string, raw: string): KBDocument {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
	const meta: Record<string, string> = {};
	if (match) {
		for (const line of match[1].split("\n")) {
			const [key, ...rest] = line.split(":");
			if (key && rest.length) meta[key.trim()] = rest.join(":").trim();
		}
	}
	const body = match ? raw.slice(match[0].length) : raw;
	return {
		id,
		title: meta.title ?? id,
		category: meta.category ?? "general",
		version: meta.version ?? "1.0",
		updated: meta.updated ?? "",
		body: body.trim(),
	};
}

export function loadDocuments(kbDir: string): KBDocument[] {
	return fs
		.readdirSync(kbDir)
		.filter((f) => f.endsWith(".md"))
		.sort()
		.map((file) =>
			parseDocument(
				file.replace(/\.md$/, ""),
				fs.readFileSync(path.join(kbDir, file), "utf8"),
			),
		);
}

const MAX_CHARS = 1200;

export function chunkDocument(doc: KBDocument): Chunk[] {
	const chunks: Chunk[] = [];
	// Se separa por títulos de segundo nivel; el texto previo al primer "## " es la introducción.
	const parts = doc.body.split(/\n(?=## )/);
	for (const part of parts) {
		const heading = part.match(/^## (.+)/)?.[1]?.trim() ?? "Introducción";
		const text = part.replace(/^#{1,2} .+\n?/, "").trim();
		if (!text) continue;
		// Secciones muy largas se subdividen por párrafos.
		const paragraphs = text.split(/\n{2,}/);
		let buffer = "";
		const flush = () => {
			if (!buffer.trim()) return;
			chunks.push({
				id: `${doc.id}#${chunks.length + 1}`,
				docId: doc.id,
				title: doc.title,
				category: doc.category,
				section: heading,
				text: buffer.trim(),
			});
			buffer = "";
		};
		for (const p of paragraphs) {
			if (buffer.length + p.length > MAX_CHARS) flush();
			buffer += `${p}\n\n`;
		}
		flush();
	}
	return chunks;
}

/** Texto que se vectoriza/indexa: incluye título y sección para mejorar la recuperación. */
export const chunkSearchText = (c: Chunk) =>
	`${c.title} — ${c.section}\n${c.text}`;
