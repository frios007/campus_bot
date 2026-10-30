/**
 * Generación de lenguaje natural (NLG).
 * - Plantillas fijas para saludos, despedidas, fallback y escalamiento (respuestas controladas).
 * - Generación con LLM condicionada al contexto recuperado (RAG) para consultas informativas.
 * - Respuesta extractiva (fragmento literal) si el LLM no está disponible.
 */
import { hasLLM } from "../config";
import { type ChatTurn, getProvider } from "../llm/provider";
import type { Entities } from "../nlu/intents";
import type { RetrievedChunk } from "../retrieval/retriever";
import { fill, loadPrompt } from "../utils/prompts";

export const NO_INFO_MARKER = "SIN_INFORMACION";

const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export const TEMPLATES = {
	saludar: () =>
		pick([
			"¡Hola! Soy CampusBot, el asistente virtual de la UNI. Puedo ayudarte con matrícula, calendario, asignaturas, aranceles, becas, trámites y oficinas. ¿Qué necesitas?",
			"¡Hola! Soy CampusBot. Pregúntame sobre matrícula, fechas del calendario, trámites, becas u oficinas de la UNI.",
		]),
	despedirse: () =>
		pick([
			"¡Hasta luego! Si tienes otra duda, aquí estaré. Éxitos en tu semestre.",
			"¡Que te vaya bien! Vuelve cuando necesites información de la UNI.",
		]),
	agradecer: () =>
		pick([
			"¡Con gusto! ¿Hay algo más en lo que pueda ayudarte?",
			"¡Para eso estoy! ¿Te ayudo con algo más?",
		]),
	fallback1: () =>
		"No comprendí del todo tu solicitud. ¿Podrías reformularla con otras palabras? Puedo ayudarte con matrícula, calendario académico, asignaturas, aranceles, becas, trámites, oficinas y reglamento.",
	fallback2: () =>
		'Sigo sin encontrar esa información. Puedes elegir uno de los temas sugeridos o escribir "hablar con un asesor" para que una persona de Atención Estudiantil te ayude.',
	noInfo: () =>
		"No encontré información sobre eso en los documentos oficiales que tengo disponibles. ¿Quieres preguntarlo de otra forma o prefieres que te comunique con un asesor?",
	outOfScope: () =>
		"Esa consulta está fuera de lo que puedo responder. Solo atiendo temas académicos y administrativos de la UNI (matrícula, calendario, trámites, becas, oficinas). ¿Te ayudo con alguno de ellos?",
	handoff: () =>
		"Te comunico con un asesor de Atención Estudiantil. Ya registré tu consulta y el historial de esta conversación para que tengan el contexto.\n\n• Horario: lunes a viernes, 8:00 a. m. – 5:00 p. m.\n• Correo: atencion.estudiantil@uni-demo.edu.ni\n• Teléfono: 2250-0000, ext. 120\n\nSi es fuera de horario, te responderán el siguiente día hábil.",
	askSlot: (slot: string) =>
		({
			asignatura:
				"¿De qué asignatura necesitas la información? Por ejemplo: Programación II o Cálculo I.",
			carrera: "¿De qué carrera eres? Por ejemplo: Ingeniería de Sistemas.",
		})[slot] ?? `¿Me indicas ${slot}?`,
};

const formatEntities = (entities: Entities) =>
	Object.entries(entities)
		.map(([k, v]) => `${k}=${v}`)
		.join(", ") || "ninguna";

export function buildContext(chunks: RetrievedChunk[]): string {
	return chunks
		.map((c, i) => `[${i + 1}] ${c.title} › ${c.section}\n${c.text}`)
		.join("\n\n");
}

/** Respuesta extractiva: se muestra el fragmento más relevante tal cual (modo sin LLM). */
export function extractiveAnswer(chunks: RetrievedChunk[]): string {
	const best = chunks[0];
	const text =
		best.text.length > 700
			? `${best.text.slice(0, 700).trimEnd()}…`
			: best.text;
	return `Esto es lo que encontré en «${best.title}» (${best.section}):\n\n${text}\n\nFuente: ${best.title}`;
}

export type GenerateAnswerInput = {
	question: string;
	intent: string;
	entities: Entities;
	chunks: RetrievedChunk[];
	history: ChatTurn[];
};

/** Devuelve la respuesta generada o null si el modelo indicó que no hay información suficiente. */
export async function generateAnswer(
	input: GenerateAnswerInput,
): Promise<{ text: string | null; mode: "llm" | "extractive" }> {
	if (!hasLLM())
		return { text: extractiveAnswer(input.chunks), mode: "extractive" };
	try {
		const system = fill(loadPrompt("system_prompt"), {
			intent: input.intent,
			entities: formatEntities(input.entities),
			context: buildContext(input.chunks),
		});
		const text = await getProvider().generate({
			system,
			messages: [
				...input.history.slice(-6),
				{ role: "user", content: input.question },
			],
			temperature: 0.2,
		});
		if (text.includes(NO_INFO_MARKER)) return { text: null, mode: "llm" };
		return { text: text.trim(), mode: "llm" };
	} catch (error) {
		console.warn(
			"[nlg] Error del LLM, se usa respuesta extractiva:",
			(error as Error).message,
		);
		return { text: extractiveAnswer(input.chunks), mode: "extractive" };
	}
}
