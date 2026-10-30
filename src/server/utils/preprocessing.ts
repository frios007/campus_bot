/**
 * Preprocesamiento de texto: normalización, tokenización y anonimización.
 * Se usa en el clasificador por palabras clave (NLU de respaldo), en BM25 y en el registro de conversaciones.
 */

const STOPWORDS = new Set(
	`a al algo algun alguna algunas alguno algunos ante antes como con contra cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estas este esto estos fue ha hay la las le les lo los me mi mis mucho muy nada ni no nos o os otra otro para pero poco por porque que quien se sea ser si sin sobre son su sus tambien te tengo ti tu tus un una uno unos y ya yo quiero quisiera saber puedo puede podria favor hola necesito informacion info`.split(
		/\s+/,
	),
);

/** Minúsculas, sin tildes, sin signos de puntuación y con espacios simples. */
export function normalize(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9ñ\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Tokeniza el texto normalizado. Con `removeStopwords` descarta palabras vacías. */
export function tokenize(text: string, removeStopwords = true): string[] {
	const tokens = normalize(text).split(" ").filter(Boolean);
	return removeStopwords
		? tokens.filter((t) => !STOPWORDS.has(t) && t.length > 1)
		: tokens;
}

/**
 * Lematización ligera (stemming) para español: recorta sufijos frecuentes.
 * Suficiente para que "matriculas", "matricula" y "matricularme" coincidan.
 */
export function stem(token: string): string {
	if (token.length <= 4) return token;
	const suffixes = [
		"amientos",
		"imientos",
		"amiento",
		"imiento",
		"aciones",
		"uciones",
		"arme",
		"erme",
		"irme",
		"acion",
		"ucion",
		"mente",
		"ando",
		"iendo",
		"ados",
		"idos",
		"adas",
		"idas",
		"ado",
		"ido",
		"ada",
		"ida",
		"ar",
		"er",
		"ir",
		"es",
		"as",
		"os",
		"s",
		"a",
		"o",
		"e",
	];
	for (const suffix of suffixes) {
		if (token.endsWith(suffix) && token.length - suffix.length >= 4) {
			return token.slice(0, -suffix.length);
		}
	}
	return token;
}

export function stemTokens(text: string): string[] {
	return tokenize(text).map(stem);
}

/** Enmascara datos personales antes de guardarlos en el log (correos, teléfonos, carnés). */
export function anonymize(text: string): string {
	return text
		.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[correo]")
		.replace(
			/\b(\d{2}-\d{5}[A-Za-z]{0,2}|\d{4}-\d{4}[A-Za-z]{1,2})\b/g,
			"[carnet]",
		)
		.replace(/\b(\+?505)?\s?\d{4}[-\s]?\d{4}\b/g, "[telefono]");
}
