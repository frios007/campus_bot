/**
 * Clasificador de intenciones basado en palabras clave (reglas).
 * Cumple dos funciones:
 *  1. Respaldo cuando el LLM no está disponible (sin API key, sin red o límite de cuota).
 *  2. Línea base (baseline) para comparar contra el clasificador LLM en la evaluación.
 */
import { normalize, stem, tokenize } from "../utils/preprocessing";
import type { Entities, Intent, NLUResult } from "./intents";

type Rule = { patterns: string[]; weight?: number };

/** Patrones por intención. Se comparan contra el texto normalizado (sin tildes) y sus raíces. */
const RULES: Partial<Record<Intent, Rule[]>> = {
	saludar: [
		{
			patterns: [
				"hola",
				"buenas",
				"buenos dias",
				"buenas tardes",
				"buenas noches",
				"saludos",
				"hey",
				"que tal",
			],
			weight: 1.5,
		},
	],
	despedirse: [
		{
			patterns: [
				"adios",
				"hasta luego",
				"nos vemos",
				"chao",
				"bye",
				"hasta pronto",
				"me voy",
			],
			weight: 2,
		},
	],
	agradecer: [
		{
			patterns: ["gracias", "muchas gracias", "te agradezco", "muy amable"],
			weight: 2,
		},
	],
	consultar_matricula: [
		{
			patterns: [
				"matricula",
				"matricul",
				"inscrib",
				"inscripcion",
				"reingreso",
				"nuevo ingreso",
				"primer ingreso",
				"hoja de matricula",
			],
			weight: 2,
		},
	],
	consultar_calendario: [
		{
			patterns: [
				"calendario",
				"cuando inicia",
				"cuando empieza",
				"inicio de clases",
				"fin de semestre",
				"vacacion",
				"feriado",
				"fecha de examen",
				"fechas",
				"semana de examenes",
				"cuando terminan",
			],
			weight: 2,
		},
	],
	consultar_asignatura: [
		{
			patterns: [
				"asignatura",
				"materia",
				"clase de",
				"prerrequisito",
				"requisito de",
				"pensum",
				"plan de estudio",
				"creditos",
				"horario de clase",
				"programacion",
				"calculo",
				"fisica",
				"base de datos",
				"semestre lleva",
			],
			weight: 2,
		},
	],
	consultar_aranceles: [
		{
			patterns: [
				"arancel",
				"costo",
				"cuanto cuesta",
				"precio",
				"pagar",
				"pago",
				"cuanto vale",
				"caja",
				"deposito",
				"recargo",
				"mensualidad",
			],
			weight: 2,
		},
	],
	consultar_becas: [
		{
			patterns: ["beca", "becado", "ayuda economica", "subsidio", "becas"],
			weight: 2.5,
		},
	],
	consultar_tramite: [
		{
			patterns: [
				"constancia",
				"certificado",
				"certificacion",
				"tramite",
				"retiro de",
				"retirar",
				"convalid",
				"carne",
				"carnet",
				"practica profesional",
				"pasantia",
				"culminacion",
				"titulo",
				"egresado",
				"solvencia",
			],
			weight: 2,
		},
	],
	consultar_oficina: [
		{
			patterns: [
				"donde queda",
				"ubicacion",
				"ubicada",
				"oficina",
				"horario de atencion",
				"telefono",
				"correo",
				"contacto",
				"biblioteca",
				"registro academico",
				"bienestar",
				"como llego",
				"correo institucional",
				"contrasena",
				"aula virtual",
				"portal",
			],
			weight: 1.8,
		},
	],
	consultar_reglamento: [
		{
			patterns: [
				"reglamento",
				"normativa",
				"nota minima",
				"aprobar",
				"reprobar",
				"reprobe",
				"convocatoria",
				"suficiencia",
				"asistencia",
				"faltas",
				"evaluacion",
				"baja academica",
				"promedio",
				"examen especial",
			],
			weight: 2,
		},
	],
	solicitar_asesor_humano: [
		{
			patterns: [
				"hablar con una persona",
				"hablar con alguien",
				"asesor",
				"humano",
				"agente",
				"persona real",
				"funcionario",
				"operador",
			],
			weight: 3,
		},
	],
	fuera_de_alcance: [
		{
			patterns: [
				"clima",
				"futbol",
				"beisbol",
				"chiste",
				"pelicula",
				"receta",
				"politica",
				"presidente",
				"novia",
				"novio",
				"hazme la tarea",
				"resuelve",
				"cancion",
				"tiempo hace",
			],
			weight: 2.5,
		},
	],
};

const CARRERAS = [
	"ingenieria de sistemas",
	"ingenieria en computacion",
	"ingenieria civil",
	"ingenieria industrial",
	"ingenieria electrica",
	"ingenieria electronica",
	"ingenieria mecanica",
	"ingenieria quimica",
	"ingenieria agricola",
	"arquitectura",
];
const ASIGNATURAS = [
	"programacion i",
	"programacion ii",
	"programacion iii",
	"calculo i",
	"calculo ii",
	"fisica i",
	"fisica ii",
	"algebra lineal",
	"base de datos i",
	"base de datos ii",
	"estructura de datos",
	"inteligencia artificial",
	"redes de computadoras",
	"ingenieria de software",
	"sistemas operativos",
	"matematica discreta",
	"administracion informatica",
	"administracion de proyectos",
];
const OFICINAS = [
	"registro academico",
	"atencion estudiantil",
	"bienestar estudiantil",
	"biblioteca",
	"caja",
	"secretaria academica",
	"oficina de becas",
	"vicerrectoria academica",
	"tecnologia",
];
const TRAMITES = [
	"constancia de estudios",
	"constancia de notas",
	"certificado de notas",
	"retiro de asignatura",
	"convalidacion",
	"reposicion de carnet",
	"carta de egresado",
	"practicas profesionales",
	"solvencia",
];

const ROMAN: Record<string, string> = { "1": "i", "2": "ii", "3": "iii" };

function findLongest(text: string, list: string[]): string | undefined {
	return list
		.filter((item) => new RegExp(`(^|\\s)${item}(\\s|$)`).test(text))
		.sort((a, b) => b.length - a.length)[0];
}

const titleCase = (s: string) =>
	s
		.split(" ")
		.map((w) =>
			/^i{1,3}$/.test(w)
				? w.toUpperCase()
				: ["de", "en", "y"].includes(w)
					? w
					: w[0].toUpperCase() + w.slice(1),
		)
		.join(" ")
		.replace("Ingenieria", "Ingeniería");

/** Extracción de entidades por diccionario (gazetteer) y expresiones regulares. */
export function extractEntities(text: string): Entities {
	// "programacion 2" -> "programacion ii"
	const t = normalize(text).replace(
		/\b([a-z]+) ([123])\b/g,
		(_, w, n) => `${w} ${ROMAN[n]}`,
	);
	const entities: Entities = {};
	const carrera =
		findLongest(t, CARRERAS) ??
		(/\bsistemas\b/.test(t) ? "ingenieria de sistemas" : undefined);
	if (carrera) entities.carrera = titleCase(carrera);
	const asignatura = findLongest(t, ASIGNATURAS);
	if (asignatura) entities.asignatura = titleCase(asignatura);
	const oficina = findLongest(t, OFICINAS);
	if (oficina) entities.oficina = titleCase(oficina);
	const tramite = findLongest(t, TRAMITES);
	if (tramite) entities.tipo_tramite = tramite;
	const periodo = t.match(
		/\b(primer|segundo|i|ii|1er|2do)\s+semestre(\s+\d{4})?\b/,
	);
	if (periodo) entities.periodo = periodo[0];
	return entities;
}

/** Clasifica la intención sumando los pesos de los patrones encontrados. */
export function classifyByKeywords(text: string): NLUResult {
	const norm = normalize(text);
	const stems = new Set(tokenize(text, false).map(stem));
	const scores = new Map<Intent, number>();

	for (const [intent, rules] of Object.entries(RULES) as [Intent, Rule[]][]) {
		let score = 0;
		for (const rule of rules) {
			for (const pattern of rule.patterns) {
				const isPhrase = pattern.includes(" ");
				const hit = isPhrase
					? norm.includes(pattern)
					: new RegExp(`(^|\\s)${pattern}`).test(norm) ||
						stems.has(stem(pattern));
				if (hit) score += rule.weight ?? 1;
			}
		}
		if (score > 0) scores.set(intent, score);
	}

	const entities = extractEntities(text);
	// Una asignatura reconocida es una pista fuerte de consultar_asignatura.
	if (entities.asignatura)
		scores.set(
			"consultar_asignatura",
			(scores.get("consultar_asignatura") ?? 0) + 1.5,
		);

	const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
	if (ranked.length === 0) {
		return {
			intent: "fuera_de_alcance",
			confidence: 0.2,
			entities,
			source: "keywords",
		};
	}
	// Los saludos combinados con una pregunta ("hola, ¿cuándo es la matrícula?") ceden ante la consulta.
	const [best, bestScore] =
		ranked[0][0] === "saludar" && ranked.length > 1 ? ranked[1] : ranked[0];
	const total = ranked.reduce((sum, [, s]) => sum + s, 0);
	const confidence = Math.min(
		0.95,
		0.35 + 0.6 * (bestScore / total) * Math.min(1, bestScore / 2),
	);
	return {
		intent: best,
		confidence: Number(confidence.toFixed(2)),
		entities,
		source: "keywords",
	};
}
