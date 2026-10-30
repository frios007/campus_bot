/**
 * Recuperador de información (componente "R" de RAG).
 * - Modo semántico/híbrido: similitud coseno entre el embedding de la consulta y los embeddings
 *   precalculados (models/kb_index.json), combinada con BM25.
 * - Modo léxico: solo BM25, cuando no existe el índice vectorial o no hay acceso al proveedor.
 */
import fs from "node:fs";
import { config, hasLLM } from "../config";
import { getProvider } from "../llm/provider";
import { BM25, normalizeBM25 } from "./bm25";
import {
	type Chunk,
	chunkDocument,
	chunkSearchText,
	loadDocuments,
} from "./chunker";

export type RetrievedChunk = Chunk & {
	score: number;
	semantic?: number;
	lexical: number;
};

export type RetrievalResult = {
	mode: "hybrid" | "lexical";
	chunks: RetrievedChunk[];
	topScore: number;
	/** true si el mejor fragmento supera el umbral mínimo de relevancia. */
	sufficient: boolean;
};

export type KBIndex = {
	embeddingModel: string;
	dimensions: number;
	createdAt: string;
	chunks: Chunk[];
};

const SEMANTIC_WEIGHT = 0.75;

/** Categoría documental asociada a cada intención (filtrado suave por metadatos). */
const INTENT_CATEGORY: Record<string, string> = {
	consultar_matricula: "matricula",
	consultar_calendario: "calendario",
	consultar_asignatura: "asignaturas",
	consultar_aranceles: "aranceles",
	consultar_becas: "becas",
	consultar_tramite: "tramites",
	consultar_oficina: "oficinas",
	consultar_reglamento: "reglamento",
};
/** Bonificación al puntaje de los fragmentos cuya categoría coincide con la intención detectada. */
const CATEGORY_BOOST = 0.08;

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export class Retriever {
	private bm25: BM25;

	constructor(private chunks: Chunk[]) {
		this.bm25 = new BM25(chunks.map(chunkSearchText));
	}

	get hasEmbeddings() {
		return (
			this.chunks.length > 0 && this.chunks.every((c) => c.embedding?.length)
		);
	}

	get size() {
		return this.chunks.length;
	}

	/** Combina los puntajes y devuelve los k fragmentos más relevantes (máximo 2 por documento). */
	rank(
		query: string,
		queryEmbedding: number[] | null,
		intent?: string,
		topK = config.retrieval.topK,
	): RetrievalResult {
		const preferred = intent ? INTENT_CATEGORY[intent] : undefined;
		const lexical = this.bm25.scores(query).map((s) => normalizeBM25(s));
		const useSemantic = Boolean(queryEmbedding && this.hasEmbeddings);
		const scored: RetrievedChunk[] = this.chunks.map((chunk, i) => {
			const semantic = useSemantic
				? cosineSimilarity(
						queryEmbedding as number[],
						chunk.embedding as number[],
					)
				: undefined;
			const base =
				semantic !== undefined
					? SEMANTIC_WEIGHT * semantic + (1 - SEMANTIC_WEIGHT) * lexical[i]
					: lexical[i];
			const score =
				base +
				(preferred && chunk.category === preferred && lexical[i] > 0
					? CATEGORY_BOOST
					: 0);
			const { embedding: _omit, ...rest } = chunk;
			return { ...rest, score, semantic, lexical: lexical[i] };
		});
		scored.sort((a, b) => b.score - a.score);

		const perDoc = new Map<string, number>();
		const selected: RetrievedChunk[] = [];
		for (const c of scored) {
			const count = perDoc.get(c.docId) ?? 0;
			if (count >= 2) continue;
			perDoc.set(c.docId, count + 1);
			selected.push(c);
			if (selected.length >= topK) break;
		}
		const topScore = selected[0]?.score ?? 0;
		const threshold = useSemantic
			? config.retrieval.minScore
			: config.retrieval.minScore * 0.85;
		return {
			mode: useSemantic ? "hybrid" : "lexical",
			chunks: selected,
			topScore,
			sufficient: topScore >= threshold,
		};
	}

	async retrieve(
		query: string,
		options: { lexicalOnly?: boolean; intent?: string } = {},
	): Promise<RetrievalResult> {
		let queryEmbedding: number[] | null = null;
		if (!options.lexicalOnly && this.hasEmbeddings && hasLLM()) {
			try {
				queryEmbedding =
					(await getProvider().embed([query], "RETRIEVAL_QUERY"))?.[0] ?? null;
			} catch (error) {
				console.warn(
					"[retrieval] Sin embeddings de consulta, se usa BM25:",
					(error as Error).message,
				);
			}
		}
		return this.rank(query, queryEmbedding, options.intent);
	}
}

let retriever: Retriever | null = null;

/** Carga el índice vectorial si existe; si no, fragmenta los documentos y usa solo BM25. */
export function getRetriever(): Retriever {
	if (retriever) return retriever;
	let chunks: Chunk[];
	if (fs.existsSync(config.paths.indexFile)) {
		const index = JSON.parse(
			fs.readFileSync(config.paths.indexFile, "utf8"),
		) as KBIndex;
		chunks = index.chunks;
	} else {
		chunks = loadDocuments(config.paths.kbDir).flatMap(chunkDocument);
	}
	retriever = new Retriever(chunks);
	return retriever;
}
