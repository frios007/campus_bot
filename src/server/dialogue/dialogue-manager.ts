/**
 * Gestor de diálogo: máquina de estados que decide la siguiente acción del bot a partir del
 * resultado del NLU y del estado de la conversación.
 *
 * Estados/acciones: responder con plantilla · pedir dato faltante (slot filling) · recuperar y
 * generar (RAG) · fallback nivel 1 · fallback nivel 2 · escalamiento a humano · fuera de alcance.
 *
 * Es una función pura (sin E/S), lo que permite probarla con pruebas unitarias.
 */
import { config } from "../config";
import {
	type Entities,
	INFORMATIONAL_INTENTS,
	type Intent,
	type NLUResult,
} from "../nlu/intents";
import { normalize } from "../utils/preprocessing";

export type DialogueState = {
	turn: number;
	consecutiveFallbacks: number;
	lastIntent?: Intent;
	/** Memoria de entidades de la conversación (contexto). */
	entities: Entities;
	/** Pregunta pendiente a la espera de un dato (slot). */
	pending?: {
		intent: Intent;
		slot: "asignatura" | "carrera";
		question: string;
	};
	handedOff: boolean;
};

export type Action =
	| { type: "template"; template: "saludar" | "despedirse" | "agradecer" }
	| { type: "ask_slot"; slot: "asignatura" | "carrera" }
	| { type: "retrieve"; query: string }
	| { type: "fallback"; level: 1 | 2 }
	| { type: "handoff"; reason: "user_request" | "repeated_failure" }
	| { type: "out_of_scope" };

export type Decision = {
	action: Action;
	intent: Intent;
	entities: Entities;
	state: DialogueState;
};

export const initialState = (): DialogueState => ({
	turn: 0,
	consecutiveFallbacks: 0,
	entities: {},
	handedOff: false,
});

/** Número de fallos consecutivos tras el cual se ofrece/ejecuta el escalamiento a humano. */
export const MAX_FALLBACKS = 3;

const SMALL_TALK = new Set<Intent>(["saludar", "despedirse", "agradecer"]);

/** Entidades que se conservan entre turnos (la carrera del estudiante no cambia en la conversación). */
const PERSISTENT_ENTITIES: (keyof Entities)[] = ["carrera"];

function needsSubject(intent: Intent, message: string, entities: Entities) {
	return (
		intent === "consultar_asignatura" &&
		!entities.asignatura &&
		/requisito|prerrequisito|creditos/.test(normalize(message))
	);
}

function registerFailure(
	state: DialogueState,
	intent: Intent,
	entities: Entities,
): Decision {
	const failures = state.consecutiveFallbacks + 1;
	const next = { ...state, consecutiveFallbacks: failures };
	if (failures >= MAX_FALLBACKS) {
		return {
			action: { type: "handoff", reason: "repeated_failure" },
			intent,
			entities,
			state: { ...next, handedOff: true, consecutiveFallbacks: 0 },
		};
	}
	return {
		action: { type: "fallback", level: failures === 1 ? 1 : 2 },
		intent,
		entities,
		state: next,
	};
}

export function decide(
	message: string,
	nlu: NLUResult,
	previous: DialogueState,
): Decision {
	const state: DialogueState = {
		...previous,
		turn: previous.turn + 1,
		pending: undefined,
	};
	let { intent } = nlu;
	let query = message;

	// 1. Completar un dato pendiente (slot filling): "¿De qué asignatura?" → "Programación II".
	const p = previous.pending;
	if (p && !SMALL_TALK.has(intent) && intent !== "solicitar_asesor_humano") {
		const value = nlu.entities[p.slot] ?? message.trim();
		if (
			nlu.entities[p.slot] ||
			nlu.confidence < config.nlu.confidenceThreshold ||
			intent === p.intent ||
			intent === "fuera_de_alcance"
		) {
			intent = p.intent;
			nlu = {
				...nlu,
				intent,
				confidence: 1,
				entities: { ...nlu.entities, [p.slot]: value },
			};
			query = `${p.question} ${value}`;
		}
	}

	const remembered = Object.fromEntries(
		PERSISTENT_ENTITIES.filter((k) => previous.entities[k]).map((k) => [
			k,
			previous.entities[k],
		]),
	) as Entities;
	const entities: Entities = { ...remembered, ...nlu.entities };
	state.entities = entities;

	// 2. Conversación social.
	if (
		SMALL_TALK.has(intent) &&
		nlu.confidence >= config.nlu.confidenceThreshold
	) {
		return {
			action: {
				type: "template",
				template: intent as "saludar" | "despedirse" | "agradecer",
			},
			intent,
			entities,
			state: { ...state, lastIntent: intent, consecutiveFallbacks: 0 },
		};
	}

	// 3. Escalamiento explícito.
	if (
		intent === "solicitar_asesor_humano" &&
		nlu.confidence >= config.nlu.confidenceThreshold
	) {
		return {
			action: { type: "handoff", reason: "user_request" },
			intent,
			entities,
			state: {
				...state,
				lastIntent: intent,
				handedOff: true,
				consecutiveFallbacks: 0,
			},
		};
	}

	// 4. Baja confianza → fallback gradual.
	if (nlu.confidence < config.nlu.confidenceThreshold) {
		return registerFailure(state, intent, entities);
	}

	// 5. Fuera de dominio.
	if (intent === "fuera_de_alcance") {
		return {
			action: { type: "out_of_scope" },
			intent,
			entities,
			state: { ...state, lastIntent: intent },
		};
	}

	// 6. Consulta informativa → pedir dato faltante o recuperar información.
	if (INFORMATIONAL_INTENTS.has(intent)) {
		if (needsSubject(intent, message, entities)) {
			return {
				action: { type: "ask_slot", slot: "asignatura" },
				intent,
				entities,
				state: {
					...state,
					lastIntent: intent,
					pending: { intent, slot: "asignatura", question: message },
				},
			};
		}
		const extra = [
			entities.asignatura,
			entities.carrera,
			entities.tipo_tramite,
			entities.oficina,
		]
			.filter((v) => v && !normalize(query).includes(normalize(v)))
			.join(" ");
		return {
			action: { type: "retrieve", query: extra ? `${query} ${extra}` : query },
			intent,
			entities,
			state: { ...state, lastIntent: intent },
		};
	}

	return registerFailure(state, intent, entities);
}

/** Actualiza el estado según el resultado de la recuperación: éxito reinicia el contador de fallos. */
export function afterRetrieval(
	decision: Decision,
	answered: boolean,
): Decision {
	if (answered)
		return {
			...decision,
			state: { ...decision.state, consecutiveFallbacks: 0 },
		};
	const failure = registerFailure(
		decision.state,
		decision.intent,
		decision.entities,
	);
	return failure;
}
