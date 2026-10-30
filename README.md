# CampusBot

Asistente conversacional para consultas académicas y administrativas de estudiantes de la Universidad Nacional de Ingeniería (UNI). Es el proyecto final de la asignatura Inteligencia Artificial (Ingeniería de Sistemas).

CampusBot combina tres piezas:

- **NLU:** clasificación de intenciones con un LLM (Gemini) y salida JSON.
- **Gestor de diálogo:** una máquina de estados con fallback gradual y escalamiento a un asesor humano.
- **RAG:** recuperación híbrida (embeddings + BM25) sobre una base de conocimiento en markdown.

> ⚠️ La base de conocimiento (`data/kb/`) es **contenido de demostración** redactado para el prototipo. Las fechas, montos y contactos son ficticios.

## Requisitos

- Node.js 22 o superior
- pnpm 10 (`npm i -g pnpm`)
- Una API key gratuita de Google AI Studio: <https://aistudio.google.com/apikey>

## Instalación

```bash
pnpm install
cp .env.example .env       # y escribe tu GEMINI_API_KEY en .env
pnpm build-index           # calcula los embeddings → models/kb_index.json
pnpm dev                   # http://localhost:3000
```

Sin API key la aplicación también funciona, en modo degradado: usa el clasificador por palabras clave, BM25 y respuestas extractivas. Si no puedes calcular embeddings, ejecuta `pnpm build-index --lexical`.

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` / `pnpm preview` | Compilación de producción |
| `pnpm build-index` | Construye el índice vectorial de la base de conocimiento |
| `pnpm test` | Pruebas unitarias (Vitest) |
| `pnpm eval` | Evaluación completa con el LLM → `evaluation/metrics_report.md` |
| `pnpm eval:offline` | Evaluación sin API (palabras clave + BM25) → `evaluation/metrics_report_offline.md` |
| `pnpm typecheck` | Verificación de tipos de TypeScript |

## Estructura del proyecto

```
campus_bot/
├── data/kb/                     # Base de conocimiento (15 documentos .md con metadatos)
├── models/kb_index.json         # Índice vectorial generado (fragmentos + embeddings)
├── prompts/
│   ├── system_prompt.md         # Prompt de generación (NLG + RAG), versionado
│   └── nlu_prompt.md            # Prompt del clasificador de intenciones, versionado
├── evaluation/
│   ├── test_conversations.json  # 92 frases etiquetadas, 35 consultas y 6 diálogos de prueba
│   └── metrics_report*.md       # Reportes generados por pnpm eval
├── scripts/
│   ├── build-index.ts           # Fragmentación + embeddings
│   └── evaluate.ts              # Cálculo de métricas
├── src/
│   ├── server/
│   │   ├── nlu/                 # intents.ts · intent-classifier.ts · keyword-classifier.ts
│   │   ├── dialogue/            # dialogue-manager.ts (estados, fallback, slot filling)
│   │   ├── nlg/                 # response-generator.ts (plantillas + LLM)
│   │   ├── retrieval/           # chunker.ts · bm25.ts · retriever.ts
│   │   ├── llm/                 # provider.ts (Gemini / API compatible con OpenAI)
│   │   ├── logging/             # conversation-logger.ts (JSONL anonimizado)
│   │   ├── utils/               # preprocessing.ts · prompts.ts
│   │   ├── config.ts            # Configuración desde variables de entorno
│   │   └── chat-engine.ts       # Orquestador del flujo conversacional
│   ├── integrations/web/        # chat-server-fn.ts (canal web: función de servidor)
│   ├── components/chat/         # Interfaz de chat (React)
│   └── routes/                  # Rutas de TanStack Start
├── tests/                       # Pruebas unitarias
└── logs/                        # Historial de conversaciones (no se versiona)
```

## Flujo de un mensaje

1. **Canal web:** la interfaz React envía el mensaje, el historial y el estado del diálogo a la función de servidor.
2. **NLU:** se identifican la intención, la confianza y las entidades.
3. **Gestor de diálogo:** decide la siguiente acción. Puede responder con una plantilla, pedir un dato faltante, hacer una consulta RAG, aplicar el fallback de nivel 1 o 2, escalar a un asesor o indicar que la consulta está fuera de alcance.
4. **Recuperación:** se obtienen los k fragmentos más relevantes. El puntaje combina 0,75 × coseno + 0,25 × BM25, con una bonificación por categoría.
5. **NLG:** el LLM redacta la respuesta usando solo el contexto recuperado. Si no hay información suficiente, el modelo devuelve `SIN_INFORMACION` y se activa el fallback.
6. **Registro:** el turno se guarda anonimizado en `logs/conversations.jsonl`.

## Seguridad

- Las claves se leen solo desde `.env`, que está excluido en `.gitignore`. La API key nunca llega al navegador.
- Los mensajes se anonimizan (correos, teléfonos, carnés) antes de guardarse.
- El bot responde únicamente con información de la base documental. Si no la encuentra, lo reconoce y ofrece escalamiento.

## Licencia

MIT. Ver [LICENSE](LICENSE).
