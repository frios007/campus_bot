/**
 * Clasificador de intenciones y extractor de entidades (NLU).
 * Enfoque: clasificación zero-shot con un LLM y salida JSON estructurada (sin entrenamiento propio).
 * Si el LLM no está disponible o falla, se usa el clasificador por palabras clave.
 */
import { hasLLM } from "../config";
import { type ChatTurn, getProvider } from "../llm/provider";
import { fill, loadPrompt } from "../utils/prompts";
import {
	ENTITY_DESCRIPTIONS,
	ENTITY_NAMES,
	type Entities,
	INTENT_DESCRIPTIONS,
	INTENTS,
	type Intent,
	type NLUResult,
} from "./intents";
import { classifyByKeywords, extractEntities } from "./keyword-classifier";

const RESPONSE_SCHEMA = {
	type: "OBJECT",
	properties: {
		intent: { type: "STRING", enum: [...INTENTS] },
		confidence: { type: "NUMBER" },
		entities: {
			type: "OBJECT",
			properties: Object.fromEntries(
				ENTITY_NAMES.map((e) => [e, { type: "STRING" }]),
			),
		},
	},
	required: ["intent", "confidence"],
};

function buildSystemPrompt(history: ChatTurn[]): string {
	const intents = INTENTS.map((i) => `- ${i}: ${INTENT_DESCRIPTIONS[i]}`).join(
		"\n",
	);
	const entities = ENTITY_NAMES.map(
		(e) => `- ${e}: ${ENTITY_DESCRIPTIONS[e]}`,
	).join("\n");
	const hist = history
		.slice(-4)
		.map(
			(t) => `${t.role === "user" ? "Estudiante" : "CampusBot"}: ${t.content}`,
		)
		.join("\n");
	return fill(loadPrompt("nlu_prompt"), {
		intents,
		entities,
		history: hist || "(vacío)",
	});
}

/** Valida y limpia la salida del LLM para que siempre cumpla el contrato NLUResult. */
export function parseNLUResponse(
	raw: string,
): Omit<NLUResult, "source"> | null {
	try {
		const data = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim());
		if (!INTENTS.includes(data.intent)) return null;
		const confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
		const entities: Entities = {};
		for (const name of ENTITY_NAMES) {
			const value = data.entities?.[name];
			if (
				typeof value === "string" &&
				value.trim() &&
				value.toLowerCase() !== "null"
			) {
				entities[name] = value.trim();
			}
		}
		return { intent: data.intent as Intent, confidence, entities };
	} catch {
		return null;
	}
}

export type ClassifyOptions = { history?: ChatTurn[]; forceKeywords?: boolean };

export async function classifyIntent(
	message: string,
	{ history = [], forceKeywords = false }: ClassifyOptions = {},
): Promise<NLUResult> {
	if (forceKeywords || !hasLLM()) return classifyByKeywords(message);

	try {
		const raw = await getProvider().generate({
			system: buildSystemPrompt(history),
			messages: [{ role: "user", content: message }],
			temperature: 0,
			jsonSchema: RESPONSE_SCHEMA,
		});
		const parsed = parseNLUResponse(raw);
		if (!parsed) return classifyByKeywords(message);
		// Las entidades del diccionario complementan a las del LLM (el LLM tiene prioridad).
		return {
			...parsed,
			entities: { ...extractEntities(message), ...parsed.entities },
			source: "llm",
		};
	} catch (error) {
		console.warn(
			"[nlu] LLM no disponible, se usa el clasificador por palabras clave:",
			(error as Error).message,
		);
		return classifyByKeywords(message);
	}
}
