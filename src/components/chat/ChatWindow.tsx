import {
	Bot,
	CalendarDays,
	ClipboardList,
	GraduationCap,
	Headset,
	Landmark,
	MapPin,
	RotateCcw,
	Scale,
	SendHorizontal,
	SlidersHorizontal,
	UserRound,
	Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "#/integrations/web/chat-server-fn";
import { cn } from "#/lib/utils";
import type { ChatResponse } from "#/server/chat-engine";
import type { DialogueState } from "#/server/dialogue/dialogue-manager";

type Message = {
	id: string;
	role: "user" | "assistant";
	content: string;
	debug?: ChatResponse["debug"];
	error?: boolean;
};

/** Temas frecuentes: atajos que envían una pregunta de ejemplo. */
const TOPICS = [
	{
		icon: ClipboardList,
		label: "Matrícula",
		question: "¿Cuándo es la matrícula del I semestre?",
	},
	{
		icon: CalendarDays,
		label: "Calendario",
		question: "¿Cuándo inician las clases?",
	},
	{
		icon: GraduationCap,
		label: "Asignaturas",
		question: "¿Qué requisitos tiene Programación II?",
	},
	{
		icon: Wallet,
		label: "Aranceles",
		question: "¿Cuánto cuesta una constancia de notas?",
	},
	{
		icon: Landmark,
		label: "Becas",
		question: "¿Qué becas ofrece la universidad?",
	},
	{
		icon: Scale,
		label: "Reglamento",
		question: "¿Cuál es la nota mínima para aprobar?",
	},
	{
		icon: MapPin,
		label: "Oficinas",
		question: "¿Dónde queda Registro Académico?",
	},
	{
		icon: Headset,
		label: "Hablar con un asesor",
		question: "Quiero hablar con un asesor",
	},
];

const WELCOME: Message = {
	id: "welcome",
	role: "assistant",
	content:
		"¡Hola! Soy CampusBot, el asistente virtual de la UNI. Puedo orientarte sobre matrícula, calendario académico, asignaturas, aranceles, becas, trámites, oficinas y reglamento. ¿En qué te ayudo?",
};

/** Logo opcional: si existe public/brand/logo-uni.png se muestra; si no, se usa un ícono genérico. */
const LOGO_SRC = "/brand/logo-uni.png";

const newSessionId = () =>
	typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: String(Date.now());

export function ChatWindow() {
	const [messages, setMessages] = useState<Message[]>([WELCOME]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [showDebug, setShowDebug] = useState(false);
	const [state, setState] = useState<DialogueState | undefined>();
	const [sessionId, setSessionId] = useState(newSessionId);
	const endRef = useRef<HTMLDivElement>(null);

	// Desplaza la vista al último mensaje cada vez que cambia la conversación.
	// biome-ignore lint/correctness/useExhaustiveDependencies: el efecto debe ejecutarse al cambiar los mensajes
	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages, loading]);

	async function send(text: string) {
		const content = text.trim();
		if (!content || loading) return;
		const history = messages
			.filter((m) => m.id !== "welcome" && !m.error)
			.map((m) => ({ role: m.role, content: m.content }));
		setMessages((prev) => [
			...prev,
			{ id: `u-${Date.now()}`, role: "user", content },
		]);
		setInput("");
		setLoading(true);
		try {
			const res = await sendChatMessage({
				data: { sessionId, message: content, history, state },
			});
			setState(res.state);
			setMessages((prev) => [
				...prev,
				{
					id: `a-${Date.now()}`,
					role: "assistant",
					content: res.reply,
					debug: res.debug,
				},
			]);
		} catch {
			setMessages((prev) => [
				...prev,
				{
					id: `e-${Date.now()}`,
					role: "assistant",
					content:
						"Tuve un problema técnico al procesar tu mensaje. Intenta de nuevo en unos segundos.",
					error: true,
				},
			]);
		} finally {
			setLoading(false);
		}
	}

	function reset() {
		setMessages([WELCOME]);
		setState(undefined);
		setSessionId(newSessionId());
	}

	return (
		<div className="flex h-dvh flex-col">
			{/* Encabezado institucional */}
			<header className="bg-white">
				<div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
					<BrandMark />
					<div className="font-serif text-[13px] leading-[1.15] text-uni-blue">
						Universidad
						<br />
						Nacional de
						<br />
						Ingeniería
					</div>
				</div>
			</header>
			<nav className="bg-uni-blue text-white">
				<div className="mx-auto flex h-12 max-w-6xl items-center gap-2 px-4">
					<span className="flex-1 truncate text-sm font-semibold uppercase tracking-wide">
						CampusBot{" "}
						<span className="font-normal text-uni-blue-soft">
							· Asistente virtual
						</span>
					</span>
					<button
						type="button"
						onClick={() => setShowDebug((v) => !v)}
						className={cn(
							"flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide transition",
							showDebug
								? "bg-uni-gold text-uni-blue-dark"
								: "hover:bg-white/10",
						)}
						title="Muestra la intención, la confianza, la acción y las fuentes de cada respuesta"
					>
						<SlidersHorizontal className="size-3.5" />
						<span className="hidden sm:inline">Modo técnico</span>
					</button>
					<button
						type="button"
						onClick={reset}
						className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-white/10"
						title="Nueva conversación"
					>
						<RotateCcw className="size-3.5" />
						<span className="hidden sm:inline">Nueva</span>
					</button>
				</div>
			</nav>

			{/* Contenido */}
			<main className="min-h-0 flex-1">
				<div className="mx-auto flex h-full max-w-6xl gap-5 px-3 py-4 sm:px-4 lg:py-6">
					{/* Panel lateral de temas (escritorio) */}
					<aside className="hidden w-64 shrink-0 flex-col lg:flex">
						<h1 className="text-3xl font-extrabold leading-tight text-uni-ink">
							Asistente Virtual
						</h1>
						<p className="mt-1 text-sm text-uni-muted">
							Consultas académicas y administrativas, disponible las 24 horas.
						</p>
						<div className="mt-5 overflow-hidden rounded bg-white shadow-md">
							<div className="bg-uni-blue px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white">
								Temas frecuentes
							</div>
							<ul className="divide-y divide-uni-line">
								{TOPICS.map(({ icon: Icon, label, question }) => (
									<li key={label}>
										<button
											type="button"
											disabled={loading}
											onClick={() => send(question)}
											className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-uni-ink transition hover:bg-uni-blue-50 hover:text-uni-blue disabled:opacity-50"
										>
											<Icon className="size-4 text-uni-blue" />
											{label}
										</button>
									</li>
								))}
							</ul>
						</div>
					</aside>

					{/* Ventana de chat */}
					<section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded bg-white shadow-md">
						<div className="flex items-center gap-3 border-b border-uni-line px-4 py-3">
							<div className="flex size-9 items-center justify-center rounded-full border-2 border-uni-blue text-uni-blue">
								<Bot className="size-5" />
							</div>
							<div className="min-w-0">
								<p className="text-sm font-bold">CampusBot</p>
								<p className="flex items-center gap-1.5 text-xs text-uni-muted">
									<span className="size-2 rounded-full bg-emerald-500" /> En
									línea
								</p>
							</div>
						</div>

						<div className="uni-scroll min-h-0 flex-1 space-y-4 overflow-y-auto bg-[#fafafa] p-4">
							{messages.map((m) => (
								<MessageBubble key={m.id} message={m} showDebug={showDebug} />
							))}
							{loading && (
								<div className="flex items-center gap-2 pl-1 text-uni-blue">
									<Bot className="size-4" />
									<span className="flex gap-1">
										<span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
										<span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
										<span className="size-1.5 animate-bounce rounded-full bg-current" />
									</span>
								</div>
							)}
							<div ref={endRef} />
						</div>

						{/* Atajos (móvil y tableta) */}
						<div className="flex gap-2 overflow-x-auto border-t border-uni-line px-3 pt-3 lg:hidden">
							{TOPICS.map(({ label, question }) => (
								<button
									key={label}
									type="button"
									disabled={loading}
									onClick={() => send(question)}
									className="shrink-0 rounded-full border border-uni-blue-soft px-3 py-1 text-xs font-medium text-uni-blue disabled:opacity-50"
								>
									{label}
								</button>
							))}
						</div>

						<form
							onSubmit={(e) => {
								e.preventDefault();
								send(input);
							}}
							className="flex items-center gap-2 p-3"
						>
							<input
								value={input}
								onChange={(e) => setInput(e.target.value)}
								placeholder="Escribe tu consulta…"
								maxLength={1000}
								className="flex-1 rounded border border-uni-line bg-white px-3 py-2.5 text-sm outline-none transition focus:border-uni-blue focus:ring-2 focus:ring-uni-blue/15"
								aria-label="Mensaje"
							/>
							<button
								type="submit"
								disabled={loading || !input.trim()}
								className="flex h-10 items-center gap-2 rounded bg-uni-blue px-4 text-sm font-semibold text-white transition hover:bg-uni-blue-dark disabled:opacity-40"
								aria-label="Enviar"
							>
								<SendHorizontal className="size-4" />
								<span className="hidden sm:inline">Enviar</span>
							</button>
						</form>
					</section>
				</div>
			</main>

			<footer className="bg-uni-blue-dark px-4 py-2 text-center text-[11px] text-white/80">
				Prototipo académico — Proyecto de Inteligencia Artificial, Ingeniería de
				Sistemas. No es un servicio oficial de la universidad; la información es
				de demostración.
			</footer>
		</div>
	);
}

function BrandMark() {
	// Se muestra el ícono genérico y, si el archivo del logo existe, se reemplaza al cargarse.
	const [hasLogo, setHasLogo] = useState(false);
	useEffect(() => {
		const img = new Image();
		img.onload = () => setHasLogo(true);
		img.src = LOGO_SRC;
	}, []);
	if (hasLogo) return <img src={LOGO_SRC} alt="" className="h-11 w-auto" />;
	return (
		<div className="flex size-11 items-center justify-center bg-uni-blue text-white">
			<GraduationCap className="size-6" />
		</div>
	);
}

function MessageBubble({
	message,
	showDebug,
}: {
	message: Message;
	showDebug: boolean;
}) {
	const isUser = message.role === "user";
	return (
		<div className={cn("flex gap-2.5", isUser && "flex-row-reverse")}>
			<div
				className={cn(
					"mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
					isUser ? "bg-uni-gold text-uni-blue-dark" : "bg-uni-blue text-white",
				)}
			>
				{isUser ? <UserRound className="size-4" /> : <Bot className="size-4" />}
			</div>
			<div
				className={cn(
					"flex max-w-[85%] flex-col gap-1.5",
					isUser && "items-end",
				)}
			>
				<div
					className={cn(
						"whitespace-pre-line px-4 py-2.5 text-sm leading-relaxed shadow-sm",
						isUser
							? "rounded-2xl rounded-tr-sm bg-uni-blue text-white"
							: "rounded-2xl rounded-tl-sm border border-uni-line bg-white",
						message.error && "border-red-300 text-red-700",
					)}
				>
					{message.content}
				</div>
				{showDebug && message.debug && <DebugPanel debug={message.debug} />}
			</div>
		</div>
	);
}

function DebugPanel({ debug }: { debug: ChatResponse["debug"] }) {
	const entities = Object.entries(debug.entities);
	return (
		<div className="rounded border-l-4 border-uni-gold bg-uni-blue-50 px-3 py-2 font-mono text-[11px] leading-5 text-uni-muted">
			<div>
				intención: <b className="text-uni-blue">{debug.intent}</b> · confianza{" "}
				{debug.confidence.toFixed(2)} · NLU {debug.nluSource}
			</div>
			<div>
				acción: <b className="text-uni-blue">{debug.action}</b>
				{debug.generation && ` · generación ${debug.generation}`}
				{debug.retrievalMode && ` · recuperación ${debug.retrievalMode}`} ·{" "}
				{debug.latencyMs} ms
			</div>
			{entities.length > 0 && (
				<div>entidades: {entities.map(([k, v]) => `${k}=${v}`).join(", ")}</div>
			)}
			{debug.sources.length > 0 && (
				<div>
					fuentes:{" "}
					{debug.sources
						.map((s) => `${s.title} › ${s.section} (${s.score})`)
						.join(" | ")}
				</div>
			)}
		</div>
	);
}
