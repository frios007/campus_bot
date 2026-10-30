/**
 * Diagnóstico de la conexión con Gemini. No imprime la API key.
 * Uso: pnpm doctor   → muestra el resultado y lo guarda en logs/doctor.txt
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/server/config";
import { GeminiProvider } from "../src/server/llm/provider";

const lines: string[] = [];
const log = (s: string) => {
	console.log(s);
	lines.push(s);
};

async function main() {
	const { apiKey, model, embeddingModel } = config.gemini;
	log(`Fecha: ${new Date().toISOString()}`);
	log(`API key presente: ${apiKey ? `sí (${apiKey.length} caracteres)` : "NO"}`);
	log(`Modelo de generación: ${model} · Modelo de embeddings: ${embeddingModel}`);

	try {
		const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
			headers: { "x-goog-api-key": apiKey },
		});
		const data = (await res.json()) as {
			models?: { name: string; supportedGenerationMethods?: string[] }[];
			error?: { message: string };
		};
		if (!res.ok) {
			log(`Listar modelos: HTTP ${res.status} – ${data.error?.message ?? ""}`);
		} else {
			const gen = (data.models ?? [])
				.filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
				.map((m) => m.name.replace("models/", ""))
				.filter((n) => /flash|pro/.test(n));
			log(`Modelos con generateContent (flash/pro): ${gen.join(", ") || "(ninguno)"}`);
			log(`¿"${model}" está disponible?: ${gen.includes(model) ? "sí" : "NO"}`);
		}
	} catch (e) {
		log(`Listar modelos: error de red – ${(e as Error).message}`);
	}

	const provider = new GeminiProvider();
	try {
		const t0 = Date.now();
		const out = await provider.generate({
			system: "Responde solo con la palabra OK.",
			messages: [{ role: "user", content: "Prueba" }],
			temperature: 0,
		});
		log(`Generación: OK (${Date.now() - t0} ms) → ${out.trim().slice(0, 40)}`);
	} catch (e) {
		log(`Generación: FALLA → ${(e as Error).message}`);
	}
	try {
		const v = await provider.embed(["prueba"], "RETRIEVAL_QUERY");
		log(`Embeddings: OK (${v[0]?.length ?? 0} dimensiones)`);
	} catch (e) {
		log(`Embeddings: FALLA → ${(e as Error).message}`);
	}

	fs.mkdirSync(config.paths.logsDir, { recursive: true });
	fs.writeFileSync(path.join(config.paths.logsDir, "doctor.txt"), `${lines.join("\n")}\n`);
}

main();
