/**
 * Evaluación automática de CampusBot con el conjunto evaluation/test_conversations.json.
 *
 * Métricas:
 *   - NLU: exactitud (accuracy), precisión/recall/F1 por intención y F1 macro. Se compara el
 *     clasificador LLM contra la línea base por palabras clave.
 *   - Recuperación: Hit@1, Hit@3 y MRR (rango recíproco medio) del documento esperado.
 *   - Diálogo: tasa de éxito de tarea (diálogos cuyos turnos ejecutan la acción esperada).
 *   - Latencia: promedio y percentil 90 por turno.
 *
 * Uso: pnpm eval            (con LLM y embeddings; requiere GEMINI_API_KEY)
 *      pnpm eval:offline    (solo palabras clave + BM25, sin llamadas a la API)
 * Resultado: evaluation/metrics_report.md y evaluation/results.json
 */
import fs from "node:fs";
import path from "node:path";
import { handleMessage } from "../src/server/chat-engine";
import { config, hasLLM } from "../src/server/config";
import type { DialogueState } from "../src/server/dialogue/dialogue-manager";
import type { ChatTurn } from "../src/server/llm/provider";
import { classifyIntent } from "../src/server/nlu/intent-classifier";
import { INTENTS, type Intent } from "../src/server/nlu/intents";
import { classifyByKeywords } from "../src/server/nlu/keyword-classifier";
import { getRetriever } from "../src/server/retrieval/retriever";

process.env.CONVERSATION_LOGGING = "false";
const offline = process.argv.includes("--offline") || !hasLLM();
/** Pausa entre llamadas para respetar el límite de solicitudes por minuto del plan gratuito. */
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? (offline ? 0 : 4500));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Dataset = {
	nlu_cases: { text: string; intent: Intent }[];
	retrieval_cases: { query: string; expected_doc: string }[];
	dialogues: { id: string; description: string; turns: { user: string; expected_action: string }[] }[];
};

const dataset: Dataset = JSON.parse(fs.readFileSync(path.join("evaluation", "test_conversations.json"), "utf8"));

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.9) - 1)] ?? 0;

function classificationMetrics(pairs: { expected: Intent; predicted: Intent }[]) {
	const accuracy = pairs.filter((p) => p.expected === p.predicted).length / pairs.length;
	const perIntent = INTENTS.map((intent) => {
		const tp = pairs.filter((p) => p.expected === intent && p.predicted === intent).length;
		const fp = pairs.filter((p) => p.expected !== intent && p.predicted === intent).length;
		const fn = pairs.filter((p) => p.expected === intent && p.predicted !== intent).length;
		const precision = tp + fp ? tp / (tp + fp) : 0;
		const recall = tp + fn ? tp / (tp + fn) : 0;
		const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
		return { intent, precision, recall, f1, support: tp + fn };
	});
	const macroF1 = mean(perIntent.filter((r) => r.support > 0).map((r) => r.f1));
	return { accuracy, macroF1, perIntent };
}

async function evaluateNLU() {
	const keyword = dataset.nlu_cases.map((c) => ({ text: c.text, expected: c.intent, predicted: classifyByKeywords(c.text).intent }));
	const llm: typeof keyword = [];
	const latencies: number[] = [];
	if (!offline) {
		for (const c of dataset.nlu_cases) {
			const t0 = performance.now();
			const r = await classifyIntent(c.text);
			latencies.push(performance.now() - t0);
			llm.push({ text: c.text, expected: c.intent, predicted: r.intent });
			process.stdout.write(".");
			await sleep(DELAY_MS);
		}
		process.stdout.write("\n");
	}
	return { keyword: { ...classificationMetrics(keyword), errors: keyword.filter((p) => p.expected !== p.predicted) }, llm: llm.length ? { ...classificationMetrics(llm), errors: llm.filter((p) => p.expected !== p.predicted), latencyMs: mean(latencies) } : null };
}

async function evaluateRetrieval() {
	const retriever = getRetriever();
	const run = async (lexicalOnly: boolean) => {
		const rows: { query: string; expected: string; rank: number; top: string }[] = [];
		for (const c of dataset.retrieval_cases) {
			const r = await retriever.retrieve(c.query, { lexicalOnly });
			const docs = [...new Set(r.chunks.map((ch) => ch.docId))];
			const rank = docs.indexOf(c.expected_doc) + 1;
			rows.push({ query: c.query, expected: c.expected_doc, rank, top: docs[0] ?? "-" });
			if (!lexicalOnly) await sleep(Math.min(DELAY_MS, 1000));
		}
		return {
			hit1: rows.filter((r) => r.rank === 1).length / rows.length,
			hit3: rows.filter((r) => r.rank > 0 && r.rank <= 3).length / rows.length,
			mrr: mean(rows.map((r) => (r.rank ? 1 / r.rank : 0))),
			misses: rows.filter((r) => r.rank !== 1),
		};
	};
	const lexical = await run(true);
	const hybrid = !offline && retriever.hasEmbeddings ? await run(false) : null;
	return { lexical, hybrid, chunks: retriever.size };
}

async function evaluateDialogues() {
	const results: { id: string; description: string; success: boolean; turns: { user: string; expected: string; got: string; reply: string }[] }[] = [];
	const latencies: number[] = [];
	for (const d of dataset.dialogues) {
		let state: DialogueState | undefined;
		const history: ChatTurn[] = [];
		const turns = [];
		for (const t of d.turns) {
			const res = await handleMessage({ sessionId: `eval-${d.id}`, message: t.user, history, state, offline });
			latencies.push(res.debug.latencyMs);
			state = res.state;
			history.push({ role: "user", content: t.user }, { role: "assistant", content: res.reply });
			turns.push({ user: t.user, expected: t.expected_action, got: res.debug.action, reply: res.reply });
			await sleep(DELAY_MS);
		}
		results.push({ id: d.id, description: d.description, success: turns.every((t) => t.got === t.expected), turns });
	}
	return { taskSuccess: results.filter((r) => r.success).length / results.length, results, latencyAvg: mean(latencies), latencyP90: p90(latencies) };
}

function report(nlu: Awaited<ReturnType<typeof evaluateNLU>>, ret: Awaited<ReturnType<typeof evaluateRetrieval>>, dlg: Awaited<ReturnType<typeof evaluateDialogues>>) {
	const mode = offline ? "offline (palabras clave + BM25, sin LLM)" : `en línea (${config.provider}: ${config.gemini.model})`;
	const L: string[] = [];
	L.push("# Reporte de métricas de CampusBot", "");
	L.push(`- Fecha: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
	L.push(`- Modo: ${mode}`);
	L.push(`- Casos NLU: ${dataset.nlu_cases.length} · Consultas de recuperación: ${dataset.retrieval_cases.length} · Diálogos: ${dataset.dialogues.length} · Fragmentos indexados: ${ret.chunks}`, "");
	L.push("## 1. Clasificación de intenciones (NLU)", "");
	L.push("| Clasificador | Exactitud | F1 macro |", "|---|---|---|");
	L.push(`| Palabras clave (línea base) | ${pct(nlu.keyword.accuracy)} | ${nlu.keyword.macroF1.toFixed(3)} |`);
	if (nlu.llm) L.push(`| LLM zero-shot | ${pct(nlu.llm.accuracy)} | ${nlu.llm.macroF1.toFixed(3)} |`);
	L.push("");
	const main = nlu.llm ?? nlu.keyword;
	L.push(`### Detalle por intención (${nlu.llm ? "LLM" : "palabras clave"})`, "", "| Intención | Precisión | Recall | F1 | Casos |", "|---|---|---|---|---|");
	for (const r of main.perIntent) L.push(`| ${r.intent} | ${r.precision.toFixed(2)} | ${r.recall.toFixed(2)} | ${r.f1.toFixed(2)} | ${r.support} |`);
	L.push("", "### Errores de clasificación", "", "| Frase | Esperada | Predicha |", "|---|---|---|");
	for (const e of main.errors) L.push(`| ${e.text} | ${e.expected} | ${e.predicted} |`);
	if (!main.errors.length) L.push("| (ninguno) | | |");
	L.push("", "## 2. Recuperación de información", "", "| Método | Hit@1 | Hit@3 | MRR |", "|---|---|---|---|");
	L.push(`| BM25 (léxico) | ${pct(ret.lexical.hit1)} | ${pct(ret.lexical.hit3)} | ${ret.lexical.mrr.toFixed(3)} |`);
	if (ret.hybrid) L.push(`| Híbrido (embeddings + BM25) | ${pct(ret.hybrid.hit1)} | ${pct(ret.hybrid.hit3)} | ${ret.hybrid.mrr.toFixed(3)} |`);
	const misses = (ret.hybrid ?? ret.lexical).misses;
	L.push("", "Consultas donde el documento esperado no quedó en primer lugar:", "", "| Consulta | Esperado | Primer resultado | Posición |", "|---|---|---|---|");
	for (const m of misses) L.push(`| ${m.query} | ${m.expected} | ${m.top} | ${m.rank || "no recuperado"} |`);
	if (!misses.length) L.push("| (ninguna) | | | |");
	L.push("", "## 3. Diálogos de referencia (éxito de tarea)", "", `Tasa de éxito de tarea: **${pct(dlg.taskSuccess)}**`, "", "| Diálogo | Descripción | Resultado | Acciones (esperada → obtenida) |", "|---|---|---|---|");
	for (const r of dlg.results) L.push(`| ${r.id} | ${r.description} | ${r.success ? "✔ éxito" : "✘ falla"} | ${r.turns.map((t) => `${t.expected}→${t.got}`).join("; ")} |`);
	L.push("", "## 4. Latencia", "", `- Latencia promedio por turno: ${dlg.latencyAvg.toFixed(0)} ms`, `- Percentil 90: ${dlg.latencyP90.toFixed(0)} ms`);
	if (nlu.llm) L.push(`- Latencia promedio de clasificación LLM: ${nlu.llm.latencyMs.toFixed(0)} ms`);
	L.push("", "> Nota: la latencia se mide en el equipo de pruebas e incluye la llamada a la API del modelo. En modo offline no incluye llamadas de red.", "");
	return L.join("\n");
}

async function main() {
	console.log(`Evaluando CampusBot en modo ${offline ? "offline" : "en línea"}…`);
	const nlu = await evaluateNLU();
	const ret = await evaluateRetrieval();
	const dlg = await evaluateDialogues();
	const md = report(nlu, ret, dlg);
	const suffix = offline ? "_offline" : "";
	fs.writeFileSync(path.join("evaluation", `metrics_report${suffix}.md`), md);
	fs.writeFileSync(path.join("evaluation", `results${suffix}.json`), JSON.stringify({ offline, nlu, retrieval: ret, dialogues: dlg }, null, 2));
	console.log(md);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
