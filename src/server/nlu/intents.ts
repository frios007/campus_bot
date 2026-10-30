/**
 * Catálogo de intenciones y entidades de CampusBot.
 * Es la "fuente de verdad" del diseño conversacional: lo usan el clasificador LLM, el
 * clasificador por palabras clave, el gestor de diálogo y la evaluación.
 * Versión del catálogo: 1.0
 */

export const INTENTS = [
	"saludar",
	"despedirse",
	"agradecer",
	"consultar_matricula",
	"consultar_calendario",
	"consultar_asignatura",
	"consultar_aranceles",
	"consultar_becas",
	"consultar_tramite",
	"consultar_oficina",
	"consultar_reglamento",
	"solicitar_asesor_humano",
	"fuera_de_alcance",
] as const;

export type Intent = (typeof INTENTS)[number];

/** Intenciones que requieren buscar en la base de conocimiento (RAG). */
export const INFORMATIONAL_INTENTS: ReadonlySet<Intent> = new Set([
	"consultar_matricula",
	"consultar_calendario",
	"consultar_asignatura",
	"consultar_aranceles",
	"consultar_becas",
	"consultar_tramite",
	"consultar_oficina",
	"consultar_reglamento",
]);

export const ENTITY_NAMES = [
	"carrera",
	"asignatura",
	"periodo",
	"tipo_tramite",
	"oficina",
] as const;

export type EntityName = (typeof ENTITY_NAMES)[number];
export type Entities = Partial<Record<EntityName, string>>;

export type NLUResult = {
	intent: Intent;
	confidence: number;
	entities: Entities;
	/** Qué clasificador produjo el resultado. */
	source: "llm" | "keywords";
};

export const INTENT_DESCRIPTIONS: Record<Intent, string> = {
	saludar: "El usuario saluda o inicia la conversación.",
	despedirse: "El usuario se despide o termina la conversación.",
	agradecer: "El usuario agradece la ayuda.",
	consultar_matricula:
		"Fechas, pasos, requisitos o documentos para matricularse (reingreso o nuevo ingreso), matrícula en línea, inscripción de asignaturas.",
	consultar_calendario:
		"Fechas del calendario académico: inicio y fin de semestre, exámenes, convocatorias, vacaciones, feriados.",
	consultar_asignatura:
		"Plan de estudios, asignaturas de un semestre, prerrequisitos, créditos u horarios de clases de una asignatura o carrera.",
	consultar_aranceles: "Costos, aranceles, formas y lugares de pago, recargos.",
	consultar_becas:
		"Tipos de becas, requisitos, convocatoria y renovación de becas.",
	consultar_tramite:
		"Constancias, certificados de notas, retiro o adición de asignaturas, convalidaciones, reposición de carné, culminación de estudios, prácticas profesionales.",
	consultar_oficina:
		"Ubicación, horario de atención, teléfono o correo de una oficina o servicio (biblioteca, registro, caja, bienestar estudiantil), plataformas digitales y correo institucional.",
	consultar_reglamento:
		"Normativa académica: sistema de evaluación, nota mínima, asistencia, exámenes de convocatoria y suficiencia, bajas académicas.",
	solicitar_asesor_humano:
		"El usuario pide hablar con una persona, un asesor o un funcionario.",
	fuera_de_alcance:
		"Mensajes ajenos a la vida académica o administrativa de la universidad (clima, deportes, tareas, chistes, política, etc.).",
};

export const ENTITY_DESCRIPTIONS: Record<EntityName, string> = {
	carrera: "Carrera mencionada, p. ej. Ingeniería de Sistemas.",
	asignatura: "Asignatura mencionada, p. ej. Programación II, Cálculo I.",
	periodo: "Semestre o período, p. ej. I semestre 2027, segundo semestre.",
	tipo_tramite:
		"Trámite mencionado, p. ej. constancia de estudios, retiro de asignatura.",
	oficina: "Oficina o servicio, p. ej. Registro Académico, Biblioteca, Caja.",
};
