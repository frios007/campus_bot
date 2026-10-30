/**
 * Construye el índice vectorial de la base de conocimiento.
 *   1. Lee data/kb/*.md
 *   2. Divide cada documento en fragmentos por sección
 *   3. Calcula el embedding de cada fragmento con la API de Gemini
 *   4. Guarda todo en models/kb_index.json
 *
 * Uso: pnpm build-index         (requiere GEMINI_API_KEY en .env)
 *      pnpm build-index --lexical  (solo fragmentos, sin embeddings)
 */
import fs from "node:fs";
import path from "node:path";
import { config, hasLLM } from "../src/server/config";
import { GeminiProvider } from "../src/server/llm/provider";
import { chunkDocument, chunkSearchText, loadDocuments } from "../src/server/retrieval/chunker";
import type { KBIndex } from "../src/server/retrieval/retriever";

const lexicalOnly = process.argv.includes("--lexical");

async function main() {
	const docs = loadDocuments(config.paths.kbDir);
	const chunks = docs.flatMap(chunkDocument);
	console.log(`Documentos: ${docs.length} · Fragmentos: ${chunks.length}`);

	if (!lexicalOnly) {
		if (!hasLLM() || config.provider !== "gemini") {
			console.error("Falta GEMINI_API_KEY en .env (o LLM_PROVIDER no es gemini). Usa --lexical para omitir embeddings.");
			process.exit(1);
		}
		const started = Date.now();
		const vectors = await new GeminiProvider().embed(chunks.map(chunkSearchText), "RETRIEVAL_DOCUMENT");
		chunks.forEach((c, i) => {
			c.embedding = vectors[i].map((v) => Number(v.toFixed(6)));
		});
		console.log(`Embeddings calculados en ${((Date.now() - started) / 1000).toFixed(1)} s (${vectors[0].length} dimensiones)`);
	}

	const index: KBIndex = {
		embeddingModel: lexicalOnly ? "none" : config.gemini.embeddingModel,
		dimensions: lexicalOnly ? 0 : config.gemini.embeddingDimensions,
		createdAt: new Date().toISOString(),
		chunks,
	};
	fs.mkdirSync(path.dirname(config.paths.indexFile), { recursive: true });
	fs.writeFileSync(config.paths.indexFile, JSON.stringify(index));
	console.log(`Índice guardado en ${path.relative(process.cwd(), config.paths.indexFile)}`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
