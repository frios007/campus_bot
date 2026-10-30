/**
 * Implementación de BM25 (Okapi), el algoritmo clásico de recuperación léxica.
 * Se usa cuando no hay embeddings disponibles y como componente léxico de la búsqueda híbrida.
 */
import { stemTokens } from "../utils/preprocessing";

export class BM25 {
	private docs: string[][];
	private df = new Map<string, number>();
	private avgLen: number;

	constructor(
		texts: string[],
		private k1 = 1.4,
		private b = 0.75,
	) {
		this.docs = texts.map((t) => stemTokens(t));
		this.avgLen =
			this.docs.reduce((s, d) => s + d.length, 0) /
			Math.max(1, this.docs.length);
		for (const doc of this.docs) {
			for (const term of new Set(doc))
				this.df.set(term, (this.df.get(term) ?? 0) + 1);
		}
	}

	private idf(term: string) {
		const n = this.docs.length;
		const df = this.df.get(term) ?? 0;
		return Math.log(1 + (n - df + 0.5) / (df + 0.5));
	}

	/** Devuelve el puntaje BM25 de la consulta contra cada documento. */
	scores(query: string): number[] {
		const terms = stemTokens(query);
		return this.docs.map((doc) => {
			const tf = new Map<string, number>();
			for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);
			let score = 0;
			for (const term of terms) {
				const f = tf.get(term) ?? 0;
				if (!f) continue;
				score +=
					this.idf(term) *
					((f * (this.k1 + 1)) /
						(f + this.k1 * (1 - this.b + (this.b * doc.length) / this.avgLen)));
			}
			return score;
		});
	}
}

/** Lleva un puntaje BM25 (0..∞) a 0..1 con una función de saturación. */
export const normalizeBM25 = (score: number, k = 6) => score / (score + k);
