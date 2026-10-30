import { describe, expect, it } from "vitest";
import { parseNLUResponse } from "../src/server/nlu/intent-classifier";
import { classifyByKeywords, extractEntities } from "../src/server/nlu/keyword-classifier";

describe("clasificador por palabras clave (NLU de respaldo)", () => {
	it.each([
		["hola", "saludar"],
		["cuando es la matricula?", "consultar_matricula"],
		["que becas hay", "consultar_becas"],
		["quiero hablar con un asesor", "solicitar_asesor_humano"],
		["cuentame un chiste", "fuera_de_alcance"],
		["hola, cuando inician las clases?", "consultar_calendario"],
	])("«%s» → %s", (text, intent) => {
		expect(classifyByKeywords(text).intent).toBe(intent);
	});

	it("asigna baja confianza a mensajes incomprensibles", () => {
		expect(classifyByKeywords("asdkj qwe").confidence).toBeLessThan(0.5);
	});
});

describe("extracción de entidades", () => {
	it("reconoce asignatura con número arábigo y carrera abreviada", () => {
		const e = extractEntities("requisitos de programacion 2 en sistemas");
		expect(e.asignatura).toBe("Programacion II");
		expect(e.carrera).toBe("Ingeniería de Sistemas");
	});

	it("reconoce oficinas", () => {
		expect(extractEntities("donde queda registro academico").oficina).toBe("Registro Academico");
	});
});

describe("validación de la salida del LLM", () => {
	it("acepta un JSON válido y descarta entidades nulas", () => {
		const r = parseNLUResponse('{"intent":"consultar_becas","confidence":0.92,"entities":{"carrera":"null","periodo":"II semestre"}}');
		expect(r).toEqual({ intent: "consultar_becas", confidence: 0.92, entities: { periodo: "II semestre" } });
	});

	it("rechaza intenciones que no están en el catálogo", () => {
		expect(parseNLUResponse('{"intent":"pedir_pizza","confidence":0.9}')).toBeNull();
	});

	it("rechaza texto que no es JSON", () => {
		expect(parseNLUResponse("no sé")).toBeNull();
	});
});
