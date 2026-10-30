/**
 * Registro de conversaciones (logging) en formato JSON Lines: logs/conversations.jsonl.
 * Los mensajes se anonimizan (correos, teléfonos, carnés) antes de guardarse.
 * Sirve para depuración y para el análisis de resultados (casos de fallo, escalamientos).
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config";
import { anonymize } from "../utils/preprocessing";

export type LogEntry = {
	timestamp: string;
	sessionId: string;
	turn: number;
	userMessage: string;
	botMessage: string;
	intent: string;
	confidence: number;
	nluSource: string;
	action: string;
	sources: string[];
	retrievalMode?: string;
	topScore?: number;
	latencyMs: number;
};

export function logTurn(entry: Omit<LogEntry, "timestamp">) {
	if (!config.loggingEnabled) return;
	try {
		fs.mkdirSync(config.paths.logsDir, { recursive: true });
		const line: LogEntry = {
			timestamp: new Date().toISOString(),
			...entry,
			userMessage: anonymize(entry.userMessage),
		};
		fs.appendFileSync(
			path.join(config.paths.logsDir, "conversations.jsonl"),
			`${JSON.stringify(line)}\n`,
		);
	} catch (error) {
		// En plataformas de solo lectura (p. ej. serverless) el registro se omite sin interrumpir el chat.
		console.warn(
			"[log] No se pudo registrar la conversación:",
			(error as Error).message,
		);
	}
}
