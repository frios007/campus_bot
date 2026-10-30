import { describe, expect, it } from "vitest";
import { afterRetrieval, decide, initialState } from "../src/server/dialogue/dialogue-manager";
import type { Intent, NLUResult } from "../src/server/nlu/intents";

const nlu = (intent: Intent, confidence = 0.9, entities = {}): NLUResult => ({ intent, confidence, entities, source: "keywords" });

describe("gestor de diálogo", () => {
	it("responde con plantilla a un saludo", () => {
		const d = decide("hola", nlu("saludar"), initialState());
		expect(d.action).toEqual({ type: "template", template: "saludar" });
	});

	it("aplica fallback gradual y escala al tercer fallo consecutivo", () => {
		let state = initialState();
		const levels: string[] = [];
		for (let i = 0; i < 3; i++) {
			const d = decide("xx", nlu("fuera_de_alcance", 0.2), state);
			levels.push(d.action.type === "fallback" ? `fallback_${d.action.level}` : d.action.type);
			state = d.state;
		}
		expect(levels).toEqual(["fallback_1", "fallback_2", "handoff"]);
		expect(state.handedOff).toBe(true);
	});

	it("escala de inmediato si el usuario pide un asesor", () => {
		const d = decide("quiero hablar con alguien", nlu("solicitar_asesor_humano"), initialState());
		expect(d.action).toEqual({ type: "handoff", reason: "user_request" });
	});

	it("pide la asignatura faltante y luego completa la consulta (slot filling)", () => {
		const first = decide("que requisitos tiene la asignatura?", nlu("consultar_asignatura"), initialState());
		expect(first.action).toEqual({ type: "ask_slot", slot: "asignatura" });
		const second = decide("Programación II", nlu("consultar_asignatura", 0.6, { asignatura: "Programación II" }), first.state);
		expect(second.action.type).toBe("retrieve");
		expect(second.intent).toBe("consultar_asignatura");
		expect(second.entities.asignatura).toBe("Programación II");
	});

	it("recuerda la carrera entre turnos", () => {
		const first = decide("soy de sistemas, cuando es la matricula", nlu("consultar_matricula", 0.9, { carrera: "Ingeniería de Sistemas" }), initialState());
		const second = decide("y las becas?", nlu("consultar_becas"), first.state);
		expect(second.entities.carrera).toBe("Ingeniería de Sistemas");
	});

	it("una respuesta exitosa reinicia el contador de fallos", () => {
		const failed = decide("xx", nlu("fuera_de_alcance", 0.1), initialState());
		const ok = decide("que becas hay", nlu("consultar_becas"), failed.state);
		expect(afterRetrieval(ok, true).state.consecutiveFallbacks).toBe(0);
	});
});
