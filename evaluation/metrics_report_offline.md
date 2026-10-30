# Reporte de métricas de CampusBot

- Fecha: 2026-10-30 01:35 UTC
- Modo: offline (palabras clave + BM25, sin LLM)
- Casos NLU: 92 · Consultas de recuperación: 35 · Diálogos: 6 · Fragmentos indexados: 90

## 1. Clasificación de intenciones (NLU)

| Clasificador | Exactitud | F1 macro |
|---|---|---|
| Palabras clave (línea base) | 87.0 % | 0.874 |

### Detalle por intención (palabras clave)

| Intención | Precisión | Recall | F1 | Casos |
|---|---|---|---|---|
| saludar | 1.00 | 0.86 | 0.92 | 7 |
| despedirse | 1.00 | 1.00 | 1.00 | 7 |
| agradecer | 1.00 | 0.86 | 0.92 | 7 |
| consultar_matricula | 0.89 | 1.00 | 0.94 | 8 |
| consultar_calendario | 1.00 | 0.71 | 0.83 | 7 |
| consultar_asignatura | 0.75 | 0.86 | 0.80 | 7 |
| consultar_aranceles | 0.86 | 0.86 | 0.86 | 7 |
| consultar_becas | 1.00 | 1.00 | 1.00 | 7 |
| consultar_tramite | 1.00 | 0.57 | 0.73 | 7 |
| consultar_oficina | 1.00 | 0.86 | 0.92 | 7 |
| consultar_reglamento | 0.83 | 0.71 | 0.77 | 7 |
| solicitar_asesor_humano | 1.00 | 1.00 | 1.00 | 7 |
| fuera_de_alcance | 0.50 | 1.00 | 0.67 | 7 |

### Errores de clasificación

| Frase | Esperada | Predicha |
|---|---|---|
| ola q tal | saludar | fuera_de_alcance |
| grax | agradecer | fuera_de_alcance |
| cuando es la segunda convocatoria | consultar_calendario | consultar_reglamento |
| hay clases en semana santa? | consultar_calendario | fuera_de_alcance |
| que clases veo en primer año | consultar_asignatura | fuera_de_alcance |
| cuanto cuesta la matricula | consultar_aranceles | consultar_matricula |
| como retiro una asignatura | consultar_tramite | consultar_asignatura |
| quiero convalidar materias de otra universidad | consultar_tramite | consultar_asignatura |
| requisitos para practicas profesionales | consultar_tramite | fuera_de_alcance |
| horario de atencion de caja | consultar_oficina | consultar_aranceles |
| que pasa si repruebo tres veces | consultar_reglamento | fuera_de_alcance |
| puedo pedir revision de nota | consultar_reglamento | fuera_de_alcance |

## 2. Recuperación de información

| Método | Hit@1 | Hit@3 | MRR |
|---|---|---|---|
| BM25 (léxico) | 82.9 % | 97.1 % | 0.898 |

Consultas donde el documento esperado no quedó en primer lugar:

| Consulta | Esperado | Primer resultado | Posición |
|---|---|---|---|
| fechas de examenes de primera convocatoria del segundo semestre | 01_calendario_academico_2027 | 10_reglamento_evaluacion | 2 |
| cuanto cuesta la matricula de reingreso | 04_aranceles_y_pagos | 02_matricula_reingreso | 3 |
| donde puedo pagar los aranceles | 04_aranceles_y_pagos | 02_matricula_reingreso | 3 |
| cuanto tarda el certificado de notas | 06_constancias_y_certificados | 04_aranceles_y_pagos | 2 |
| donde queda registro academico | 11_oficinas_y_contactos | 15_preguntas_frecuentes | 4 |
| puedo estudiar dos carreras a la vez | 15_preguntas_frecuentes | 07_tramites_academicos | 2 |

## 3. Diálogos de referencia (éxito de tarea)

Tasa de éxito de tarea: **100.0 %**

| Diálogo | Descripción | Resultado | Acciones (esperada → obtenida) |
|---|---|---|---|
| D1 | Saludo y consulta de matrícula (Flujo A) | ✔ éxito | template→template; answer→answer; template→template |
| D2 | Requisitos de asignatura con dato faltante (Flujo B, slot filling) | ✔ éxito | ask_slot→ask_slot; answer→answer |
| D3 | Fallback gradual hasta escalamiento (Flujo C) | ✔ éxito | fallback_1→fallback_1; fallback_2→fallback_2; handoff_repeated_failure→handoff_repeated_failure |
| D4 | Solicitud explícita de asesor humano | ✔ éxito | handoff_user_request→handoff_user_request |
| D5 | Consulta fuera de alcance y retorno al dominio | ✔ éxito | out_of_scope→out_of_scope; answer→answer |
| D6 | Trámite y luego oficina | ✔ éxito | answer→answer; answer→answer; template→template |

## 4. Latencia

- Latencia promedio por turno: 0 ms
- Percentil 90: 1 ms

> Nota: la latencia se mide en el equipo de pruebas e incluye la llamada a la API del modelo. En modo offline no incluye llamadas de red.
