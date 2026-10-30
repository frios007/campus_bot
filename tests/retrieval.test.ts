import { describe, expect, it } from "vitest";
import { chunkDocument, parseDocument } from "../src/server/retrieval/chunker";
import { cosineSimilarity, getRetriever } from "../src/server/retrieval/retriever";

describe("fragmentación de documentos", () => {
	it("lee los metadatos y divide por secciones", () => {
		const doc = parseDocument("x", "---\ntitle: Prueba\ncategory: becas\n---\n# Prueba\n\nIntro\n\n## A\n\nTexto A\n\n## B\n\nTexto B");
		expect(doc.title).toBe("Prueba");
		const chunks = chunkDocument(doc);
		expect(chunks.map((c) => c.section)).toEqual(["Introducción", "A", "B"]);
		expect(chunks[0].category).toBe("becas");
	});
});

describe("recuperación", () => {
	it("calcula similitud coseno", () => {
		expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
	});

	it.each([
		["requisitos para la beca de comedor", "05_becas"],
		["como recupero mi contraseña del portal", "13_plataformas_digitales"],
		["nota minima para aprobar", "10_reglamento_evaluacion"],
	])("«%s» recupera %s en el primer lugar (BM25)", async (query, docId) => {
		const r = await getRetriever().retrieve(query, { lexicalOnly: true });
		expect(r.chunks[0].docId).toBe(docId);
		expect(r.sufficient).toBe(true);
	});

	it("marca como insuficiente una consulta sin relación con la base", async () => {
		const r = await getRetriever().retrieve("receta de vigoron", { lexicalOnly: true });
		expect(r.sufficient).toBe(false);
	});
});
