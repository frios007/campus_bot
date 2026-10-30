/**
 * Integración con el canal web: función de servidor (TanStack Start) que recibe el mensaje desde
 * la interfaz React y lo entrega al motor conversacional. La API key nunca llega al navegador.
 */
import { createServerFn } from "@tanstack/react-start";
import type { ChatRequest } from "../../server/chat-engine";

function validate(input: unknown): ChatRequest {
	const data = input as Partial<ChatRequest>;
	if (!data || typeof data.message !== "string" || !data.message.trim()) {
		throw new Error("El mensaje no puede estar vacío");
	}
	if (typeof data.sessionId !== "string") throw new Error("sessionId inválido");
	const history = Array.isArray(data.history)
		? data.history
				.filter(
					(t) =>
						t &&
						(t.role === "user" || t.role === "assistant") &&
						typeof t.content === "string",
				)
				.slice(-10)
		: [];
	return {
		sessionId: data.sessionId.slice(0, 64),
		message: data.message.slice(0, 1000),
		history,
		state: data.state,
	};
}

export const sendChatMessage = createServerFn({ method: "POST" })
	.validator(validate)
	.handler(async ({ data }) => {
		const { handleMessage } = await import("../../server/chat-engine");
		return handleMessage(data);
	});
