/**
 * Orquestador del motor conversacional. Une los módulos en el flujo:
 *   mensaje → NLU → gestor de diálogo → (recuperación → generación) → respuesta → registro
 */
import {
	afterRetrieval,
	type DialogueState,
	decide,
	initialState,
} from "./dialogue/dialogue-manager";
import type { ChatTurn } from "./llm/provider";
import { logTurn } from "./logging/conversation-logger";
import {
	extractiveAnswer,
	generateAnswer,
	TEMPLATES,
} from "./nlg/response-generator";
import { classifyIntent } from "./nlu/intent-classifier";
import type { Entities, Intent } from "./nlu/intents";
import { getRetriever } from "./retrieval/retriever";

export type ChatRequest = {
	sessionId: string;
	message: string;
	history: ChatTurn[];
	state?: DialogueState;
	/** Opciones para evaluación: forzar NLU por palabras clave y/o recuperación léxica. */
	offline?: boolean;
};

export type ChatResponse = {
	reply: string;
	state: DialogueState;
	debug: {
		intent: Intent;
		confidence: number;
		nluSource: "llm" | "keywords";
		entities: Entities;
		action: string;
		sources: { title: string; section: string; score: number }[];
		retrievalMode?: "hybrid" | "lexical";
		generation?: "template" | "llm" | "extractive";
		latencyMs: number;
	};
};

export async function handleMessage(req: ChatRequest): Promise<ChatResponse> {
	const started = performance.now();
	const message = req.message.trim().slice(0, 1000);
	const previous = req.state ?? initialState();

	const nlu = await classifyIntent(message, {
		history: req.history,
		forceKeywords: req.offline,
	});
	let decision = decide(message, nlu, previous);

	let reply = "";
	let generation: ChatResponse["debug"]["generation"] = "template";
	let sources: ChatResponse["debug"]["sources"] = [];
	let retrievalMode: "hybrid" | "lexical" | undefined;
	let actionName: string = decision.action.type;

	const { action } = decision;
	switch (action.type) {
		case "template":
			reply = TEMPLATES[action.template]();
			break;
		case "ask_slot":
			reply = TEMPLATES.askSlot(action.slot);
			break;
		case "fallback":
			reply =
				action.level === 1 ? TEMPLATES.fallback1() : TEMPLATES.fallback2();
			actionName = `fallback_${action.level}`;
			break;
		case "handoff":
			reply = TEMPLATES.handoff();
			actionName = `handoff_${action.reason}`;
			break;
		case "out_of_scope":
			reply = TEMPLATES.outOfScope();
			break;
		case "retrieve": {
			const retrieval = await getRetriever().retrieve(action.query, {
				lexicalOnly: req.offline,
				intent: decision.intent,
			});
			retrievalMode = retrieval.mode;
			let answer: string | null = null;
			if (retrieval.sufficient) {
				const generated = req.offline
					? {
							text: extractiveAnswer(retrieval.chunks),
							mode: "extractive" as const,
						}
					: await generateAnswer({
							question: message,
							intent: decision.intent,
							entities: decision.entities,
							chunks: retrieval.chunks,
							history: req.history,
						});
				answer = generated.text;
				generation = generated.mode;
				sources = retrieval.chunks.slice(0, 3).map((c) => ({
					title: c.title,
					section: c.section,
					score: Number(c.score.toFixed(3)),
				}));
			}
			decision = afterRetrieval(decision, answer !== null);
			if (answer) {
				reply = answer;
				actionName = "answer";
			} else if (decision.action.type === "handoff") {
				reply = TEMPLATES.handoff();
				actionName = "handoff_repeated_failure";
				generation = "template";
			} else {
				reply =
					decision.action.type === "fallback" && decision.action.level === 2
						? TEMPLATES.fallback2()
						: TEMPLATES.noInfo();
				actionName = "no_info";
				generation = "template";
			}
			break;
		}
	}

	const latencyMs = Math.round(performance.now() - started);
	logTurn({
		sessionId: req.sessionId,
		turn: decision.state.turn,
		userMessage: message,
		botMessage: reply,
		intent: decision.intent,
		confidence: nlu.confidence,
		nluSource: nlu.source,
		action: actionName,
		sources: sources.map((s) => s.title),
		retrievalMode,
		topScore: sources[0]?.score,
		latencyMs,
	});

	return {
		reply,
		state: decision.state,
		debug: {
			intent: decision.intent,
			confidence: nlu.confidence,
			nluSource: nlu.source,
			entities: decision.entities,
			action: actionName,
			sources,
			retrievalMode,
			generation,
			latencyMs,
		},
	};
}
