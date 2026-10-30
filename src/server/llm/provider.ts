/**
 * Capa de acceso al modelo de lenguaje.
 * Se implementa con fetch (sin SDK) para mantener pocas dependencias y poder cambiar de proveedor
 * mediante la variable LLM_PROVIDER, sin tocar el resto del código.
 */
import { config } from "../config";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type GenerateOptions = {
	system: string;
	messages: ChatTurn[];
	temperature?: number;
	/** Esquema JSON (formato OpenAPI simplificado) para forzar salida estructurada. */
	jsonSchema?: Record<string, unknown>;
};

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface LLMProvider {
	readonly name: string;
	generate(options: GenerateOptions): Promise<string>;
	/** Devuelve null si el proveedor no ofrece embeddings. */
	embed(texts: string[], task: EmbedTask): Promise<number[][] | null>;
}

export class LLMError extends Error {}

const TIMEOUT_MS = 20_000;

async function postJSON(
	url: string,
	body: unknown,
	headers: Record<string, string>,
) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
			signal: controller.signal,
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => "");
			throw new LLMError(`HTTP ${res.status}: ${detail.slice(0, 300)}`);
		}
		return (await res.json()) as any;
	} finally {
		clearTimeout(timer);
	}
}

/** Proveedor Google Gemini (API REST v1beta de Google AI Studio). */
export class GeminiProvider implements LLMProvider {
	readonly name = "gemini";
	private base = "https://generativelanguage.googleapis.com/v1beta";

	async generate({
		system,
		messages,
		temperature = 0.2,
		jsonSchema,
	}: GenerateOptions) {
		const { apiKey, model } = config.gemini;
		const data = await postJSON(
			`${this.base}/models/${model}:generateContent`,
			{
				systemInstruction: { parts: [{ text: system }] },
				contents: messages.map((m) => ({
					role: m.role === "assistant" ? "model" : "user",
					parts: [{ text: m.content }],
				})),
				generationConfig: {
					temperature,
					...(jsonSchema
						? {
								responseMimeType: "application/json",
								responseSchema: jsonSchema,
							}
						: {}),
				},
			},
			{ "x-goog-api-key": apiKey },
		);
		const text: string | undefined = data?.candidates?.[0]?.content?.parts
			?.map((p: { text?: string }) => p.text ?? "")
			.join("");
		if (!text) throw new LLMError("Respuesta vacía del modelo");
		return text;
	}

	async embed(texts: string[], task: EmbedTask) {
		const { apiKey, embeddingModel, embeddingDimensions } = config.gemini;
		const vectors: number[][] = [];
		// La API acepta lotes; se envían de 50 en 50 para no exceder límites.
		for (let i = 0; i < texts.length; i += 50) {
			const batch = texts.slice(i, i + 50);
			const data = await postJSON(
				`${this.base}/models/${embeddingModel}:batchEmbedContents`,
				{
					requests: batch.map((text) => ({
						model: `models/${embeddingModel}`,
						content: { parts: [{ text }] },
						taskType: task,
						outputDimensionality: embeddingDimensions,
					})),
				},
				{ "x-goog-api-key": apiKey },
			);
			for (const e of data.embeddings ?? []) vectors.push(e.values);
		}
		return vectors;
	}
}

/** Proveedor alternativo con API compatible con OpenAI (Groq, OpenRouter, Ollama local, etc.). */
export class OpenAICompatibleProvider implements LLMProvider {
	readonly name = "openai-compatible";

	async generate({
		system,
		messages,
		temperature = 0.2,
		jsonSchema,
	}: GenerateOptions) {
		const { apiKey, baseUrl, model } = config.openai;
		const data = await postJSON(
			`${baseUrl}/chat/completions`,
			{
				model,
				temperature,
				messages: [
					{
						role: "system",
						content: jsonSchema
							? `${system}\n\nResponde ÚNICAMENTE con un objeto JSON válido que cumpla este esquema: ${JSON.stringify(jsonSchema)}`
							: system,
					},
					...messages,
				],
				...(jsonSchema ? { response_format: { type: "json_object" } } : {}),
			},
			{ Authorization: `Bearer ${apiKey}` },
		);
		const text: string | undefined = data?.choices?.[0]?.message?.content;
		if (!text) throw new LLMError("Respuesta vacía del modelo");
		return text;
	}

	async embed() {
		return null; // Se usa recuperación léxica (BM25) como alternativa.
	}
}

let instance: LLMProvider | null = null;

export function getProvider(): LLMProvider {
	if (!instance) {
		instance =
			config.provider === "openai"
				? new OpenAICompatibleProvider()
				: new GeminiProvider();
	}
	return instance;
}

/** Permite inyectar un proveedor simulado en las pruebas. */
export function setProvider(provider: LLMProvider | null) {
	instance = provider;
}
