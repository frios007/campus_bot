/**
 * Configuración central de CampusBot.
 * Todas las credenciales se leen desde variables de entorno (.env); nunca se escriben en el código.
 */
import fs from "node:fs";
import path from "node:path";

// Carga .env (Node ≥ 20.12) si existe y aún no se cargó.
const envFile = path.join(process.cwd(), ".env");
if (!process.env.CAMPUSBOT_ENV_LOADED && fs.existsSync(envFile)) {
	try {
		process.loadEnvFile(envFile);
	} catch {
		/* se ignora: las variables pueden venir del entorno */
	}
	process.env.CAMPUSBOT_ENV_LOADED = "1";
}

const num = (value: string | undefined, fallback: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && value !== "" && value !== undefined
		? parsed
		: fallback;
};

export const config = {
	/** Proveedor del LLM: "gemini" (por defecto) u "openai" (cualquier API compatible: Groq, OpenRouter, etc.) */
	provider: (process.env.LLM_PROVIDER ?? "gemini") as "gemini" | "openai",
	gemini: {
		apiKey: process.env.GEMINI_API_KEY ?? "",
		model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
		embeddingModel:
			process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
		embeddingDimensions: num(process.env.GEMINI_EMBEDDING_DIMENSIONS, 768),
	},
	openai: {
		apiKey: process.env.OPENAI_API_KEY ?? "",
		baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.groq.com/openai/v1",
		model: process.env.OPENAI_MODEL ?? "llama-3.3-70b-versatile",
	},
	nlu: {
		/** Por debajo de este umbral de confianza se activa el fallback. */
		confidenceThreshold: num(process.env.NLU_CONFIDENCE_THRESHOLD, 0.5),
	},
	retrieval: {
		topK: num(process.env.RETRIEVAL_TOP_K, 4),
		/** Puntaje mínimo (0–1) del mejor fragmento para considerar que hay información suficiente. */
		minScore: num(process.env.RETRIEVAL_MIN_SCORE, 0.35),
	},
	paths: {
		root: process.cwd(),
		kbDir: path.join(process.cwd(), "data", "kb"),
		indexFile: path.join(process.cwd(), "models", "kb_index.json"),
		promptsDir: path.join(process.cwd(), "prompts"),
		logsDir: path.join(process.cwd(), "logs"),
	},
	/** Desactiva el registro en disco (útil en pruebas o en plataformas de solo lectura). */
	get loggingEnabled() {
		return process.env.CONVERSATION_LOGGING !== "false";
	},
} as const;

export const hasLLM = () =>
	config.provider === "gemini"
		? config.gemini.apiKey.length > 0
		: config.openai.apiKey.length > 0;
