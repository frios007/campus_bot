import { describe, expect, it } from "vitest";
import { anonymize, normalize, stem, tokenize } from "../src/server/utils/preprocessing";

describe("preprocesamiento", () => {
	it("normaliza tildes, mayúsculas y signos", () => {
		expect(normalize("¿Cuándo es la MATRÍCULA?")).toBe("cuando es la matricula");
	});

	it("elimina palabras vacías al tokenizar", () => {
		expect(tokenize("¿Cuáles son los requisitos de la matrícula?")).toEqual(["requisitos", "matricula"]);
	});

	it("reduce variantes a la misma raíz", () => {
		expect(stem("matriculas")).toBe(stem("matricula"));
		expect(stem("matricularme")).toBe(stem("matricula"));
	});

	it("anonimiza correos, carnés y teléfonos", () => {
		const out = anonymize("Soy 21-30033SU, mi correo es ana@gmail.com y mi cel 8888-1234");
		expect(out).not.toMatch(/ana@gmail|30033|8888/);
		expect(out).toContain("[correo]");
		expect(out).toContain("[carnet]");
		expect(out).toContain("[telefono]");
	});
});
