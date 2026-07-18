# Plan de implementación — Reddit Marketing Scraper

## 1. Idea en una frase
Una app web que, dado un negocio (temática, problemas que resuelve y competidores), monitorea los subreddits relevantes, detecta posts donde el negocio podría aportar valor, y **notifica al usuario por email** con los links de esos posts, ordenados de más reciente a más viejo, para que vaya a comentar manualmente.

---

## 2. Investigación: qué existe (open source + comercial)

**Comerciales / referencia de producto**
- **F5Bot** (gratis): te manda un email cuando aparecen tus keywords en Reddit/HN. Es el modelo de notificación más simple y probado → buena referencia para el MVP.
- **GummySearch, Syften, Brand24, Mention**: social listening / lead-gen sobre Reddit + otras redes. Confirman que el "matching temática ↔ subreddit" + feed + alertas es un producto validado.

**Open source (revisados en GitHub)**
| Repo | Stack | Qué reusar como referencia |
|---|---|---|
| `ivucicev/redsignal` | JS + SQLite | Listeners por subreddit + keywords regex, feed en vivo, filtro LLM opcional, pipeline de leads (New→Replied→Converted) |
| `Pirkn/Leaad` | **React 19 + Vite + Tailwind + Flask + Supabase + OpenAI** | Casi idéntico a lo que querés: onboarding de producto, descubrimiento de subreddits/leads, auth Supabase, rate limiting server-side |
| `donebyai-team/RedoraAI` | TypeScript | Sugerencia de keywords/subreddits con IA, scoring de posts con LLM, notas de "account safety" y compliance |
| `obris-dev/openmagpie` | Django + Next.js | Descripción en lenguaje natural de "qué es relevante" → LLM puntúa cada post nuevo; scan de Reddit/HN/RSS |
| `mascanho/Atalaia` | Tauri + Next + Rust | Integración Reddit + análisis de sentimiento con Gemini |

### ConvoHunter (competidor directo — analizado en detalle)
`convohunter.com` es casi exactamente este producto (aunque multi-plataforma: Reddit, X, LinkedIn, Quora). Vale la pena copiar su modelo. Aprendizajes clave:

- **Posicionamiento:** *"AI-powered social listening that finds meaningful conversations where your business can make a genuine impact. Turn conversations into customers."* Prometen: *"First leads in 24 hours"*, *"2-min setup"*, *"No auto-posting, no bans"*.
- **Onboarding por URL (clave):** el usuario **solo pega la URL de su web**. Un LLM la analiza y entiende *value, audience, y pains que resuelve* — sin listas de keywords ni configuración manual. → Esto es exactamente el LLM de descubrimiento que pediste (ver §5).
- **Detección por intención, no solo keywords:** *"Finds buyers even when they never use your keywords"* → matching semántico con LLM, no regex puro.
- **Scoring + tags de leads:** cada post trae score de intención (**High / Medium**) y etiquetas tipo `Asked Recommendation`, `Very Relevant`, `High Traffic`, `Recent`, `Competition Complaint`, `Competition Mentioned`.
- **Reply angle pre-redactado:** además de notificar, el LLM sugiere un borrador de respuesta *en la voz del usuario* (el usuario lo edita y postea a mano).
- **Descubrimiento de competidores:** detecta menciones/quejas de competidores (un testimonio: *"it even discovered competition we didn't even know existed"*).
- **Entrega:** alertas en tiempo real al **inbox (email)**; dashboard con métricas *Leads found / High intent % / Response rate*.
- **No auto-posting:** validan nuestra decisión — el humano responde en su voz, evita bans.
- **Pricing:** un solo plan **€24/mes**, prueba gratis 3 días, monitoreo ilimitado, sin tiers. Pitch: *"un cliente cerrado paga el año entero"*.

**Qué copiamos para el MVP:** onboarding por URL/descripción con LLM, scoring por intención + tags, borrador de respuesta opcional, alertas por email, y el foco en "aportar valor" (no spamear).

**Conclusión del research:** el patrón estándar es
`config del negocio → keywords + subreddits → poll periódico a la API de Reddit → (opcional) filtro de relevancia con LLM → guardar matches → feed + notificación`.
Nuestro diferencial/decisión de alcance: el usuario **comenta manualmente** (solo notificamos). Esto evita el mayor riesgo de estas herramientas (auto-posting marcado como spam).

---

## 3. Acceso a datos de Reddit (importante)

- **API oficial (recomendada):** crear una app tipo *script* en https://www.reddit.com/prefs/apps → obtenés `client_id` + `client_secret`. Auth OAuth2 (client credentials). Requiere `User-Agent` descriptivo.
- **Rate limits:** ~100 requests/minuto por client OAuth (promedio en ventana de 10 min). Suficiente para pollear varios subreddits cada X minutos.
- **Uso comercial:** el tier gratuito es para uso no comercial / bajo volumen. Uso comercial a escala requiere el tier pago de Reddit (~$0.24 / 1000 llamadas). Para MVP entramos holgados en el free tier.
- **Endpoints clave:**
  - `GET /r/{sub}/search?q=...&restrict_sr=1&sort=new&t=day` → posts recientes por keyword en un subreddit.
  - `GET /r/{sub}/new` → últimos posts del subreddit (filtramos keywords nosotros).
  - `GET /subreddits/search?q=...` → descubrir subreddits por temática.
- **Sin auth (fallback rápido):** endpoints públicos `.../search.json` y RSS (`.../search.rss?q=...`). Más frágiles y con más rate-limit; sirven solo para prototipo.
- **Legal/ToS:** cumplir la Data API Terms de Reddit; respetar reglas de autopromoción de cada subreddit (nuestra app no autocomenta, mitiga el riesgo). Guardar solo lo necesario (link, título, autor, fecha).

---

## 4. Arquitectura propuesta

```
                 ┌──────────────────────────┐
                 │   Frontend (React + TS)   │
                 │  - Landing + captura email│
                 │  - Onboarding de negocio  │
                 │  - Dashboard feed de posts│
                 └────────────┬─────────────┘
                              │ REST/JSON
                 ┌────────────▼─────────────┐
                 │   Backend API (TS)        │
                 │  - /businesses /matches   │
                 │  - deriva keywords+subs   │
                 └──────┬───────────┬────────┘
                        │           │
        ┌───────────────▼──┐   ┌────▼──────────────┐
        │ Worker/Cron       │   │ Postgres (DB)     │
        │ - poll Reddit API │   │ users, businesses,│
        │ - match keywords  │   │ keywords, subs,   │
        │ - (opc) score LLM │   │ matches, notifs   │
        │ - dispara emails  │   └───────────────────┘
        └─────────┬─────────┘
                  │
        ┌─────────▼─────────┐   ┌───────────────────┐
        │ Reddit OAuth API  │   │ Email (Resend/etc)│
        └───────────────────┘   └───────────────────┘
```

**Modelo de datos (borrador)**
- `users`: id, email, created_at
- `businesses`: id, user_id, nombre, website_url, temática, problemas_que_resuelve, competidores[], perfil_llm (value/audience/pains)
- `keywords`: id, business_id, term
- `subreddits`: id, business_id, name
- `matches`: id, business_id, reddit_post_id (único), subreddit, title, url, author, permalink, created_utc, intent (high/medium/low), tags[], reply_draft, motivo, notified_at
- `notifications`: id, business_id, sent_at, match_ids[]

**Lógica de matching**
1. Del negocio (URL + temática + problemas + competidores) un **LLM deriva el perfil, keywords y subreddits candidatos** (validados contra la API de Reddit). Ver §5.1.
2. Worker pollea cada subreddit (`sort=new`) + búsquedas por keyword cada N minutos.
3. Filtro nivel 1: match de keyword/regex en título+cuerpo.
4. Filtro nivel 2 (opcional): LLM puntúa "¿este post es alguien con el problema que resuelve el negocio?" (sí/no + score) para bajar falsos positivos.
5. Dedup por `reddit_post_id`, guardar match.

**Notificaciones**
- Email vía Resend/Postmark/SendGrid. Modo **digest** (ej. cada X horas junta los nuevos) o **instantáneo**. Cada email lista los posts con link directo al permalink de Reddit.

**Dashboard (página principal)**
- Onboarding: el usuario pega la **URL de su web** (o describe el negocio) → LLM sugiere subreddits/keywords para revisar.
- Feed de posts relevantes ordenado **reciente → viejo**, con título, subreddit, fecha, **badge de intención + tags**, borrador de respuesta sugerido, y botón "Ir a comentar" (abre el permalink). Filtros por subreddit/negocio.

---

## 5. LLM: descubrimiento inicial, API key genérica e intención

**5.1 LLM de onboarding / descubrimiento (como ConvoHunter)**
En vez de pedirle al usuario que arme listas de subreddits, tomamos los **primeros datos del negocio** (URL de la web y/o temática + problemas + competidores) y un LLM genera automáticamente:
1. Un **perfil del negocio** (propuesta de valor, audiencia, dolores que resuelve).
2. Los **primeros subreddits relevantes** (validados contra `GET /subreddits/search` para descartar los que no existen).
3. **Keywords y frases** de intención (incluye nombres de competidores).

Flujo: `URL/descripción → LLM extrae perfil → LLM propone subreddits+keywords → validación contra API de Reddit → el usuario revisa/edita → se guarda`. Así el setup es de ~2 minutos.

**5.2 API key genérica del LLM (compartida)**
La app usa **una API key propia/genérica** (server-side, en env `LLM_API_KEY`) para que el usuario **no tenga que traer la suya**. Consideraciones:
- La key vive solo en el backend, nunca se expone al frontend.
- Sumar **límites de uso por usuario** (rate limit + cuota de tokens) para controlar costos del free tier.
- Diseñar el proveedor como *pluggable* (interfaz `LLMProvider`) para poder cambiar OpenAI ↔ otro, o permitir que un usuario avanzado ponga su propia key más adelante (opcional).

**5.3 Scoring por intención (no solo keyword)**
Para cada post candidato, el LLM devuelve `{ relevante: bool, intent: high|medium|low, tags: [...], motivo }` usando el perfil del negocio como contexto. Esto reduce falsos positivos y habilita las etiquetas tipo `Asked Recommendation` / `Competition Complaint`.

---

## 6. Cómo aportar valor sin ser spam (guía integrada en el producto)

El producto debe empujar activamente al usuario a comentar de forma genuina — no spamear — porque el spam quema la cuenta y la marca. Se implementa así:

**Reglas que el producto sugiere / enforce:**
- **Aportar primero, vender después:** el comentario debe responder la pregunta o resolver el problema del post; mencionar el producto solo si suma y de forma transparente ("disclosure": aclarar que sos el fundador/estás afiliado).
- **Regla ~90/10:** la mayoría de la actividad debe ser aporte genuino; solo una fracción menor menciona el producto.
- **Respetar reglas del subreddit:** el LLM lee/resume las reglas del subreddit y avisa si prohíbe autopromoción antes de sugerir comentar.
- **Nada de copy-paste masivo:** el borrador que genera el LLM es personalizado por post y en la voz del usuario; se recomienda editarlo.
- **Priorizar posts de alta intención y recientes** (donde el aporte es bienvenido) por sobre spamear cualquier match.
- **Sin auto-posting:** la app nunca postea sola; solo notifica y sugiere. El humano decide y publica.

**En la UI:** cada lead muestra un checklist de "buenas prácticas", las reglas del subreddit resumidas, y el borrador etiquetado como *sugerencia a editar*.

---

## 7. Decisiones de stack a confirmar

| Tema | Opción A (recomendada MVP) | Opción B |
|---|---|---|
| Lenguaje backend | **Node.js + TypeScript** (Fastify/Express, cliente `snoowrap`) → un solo lenguaje con el front | Python (FastAPI + PRAW), ecosistema de scraping más maduro |
| Base de datos | **Supabase (Postgres)** → auth + DB + hosting fácil | SQLite local (más simple para prototipo self-host) |
| Email | **Resend** (DX simple, free tier) | SendGrid / Postmark |
| Filtro de relevancia LLM | Empezar **sin LLM** (solo keywords), agregar después | OpenAI desde el día 1 |
| Scheduler | Cron del backend / worker | Servicio dedicado (ej. cron de Supabase / GitHub Actions) |

---

## 8. Plan por fases

- **Fase 0 — Setup:** repo React+TS (Vite), backend, crear app *script* en Reddit, cargar secrets (`REDDIT_CLIENT_ID/SECRET`, email API key).
- **Fase 1 — Núcleo de scraping:** cliente Reddit + búsqueda por keyword/subreddit + guardar matches en DB (script CLI probable).
- **Fase 2 — Config de negocio + LLM de descubrimiento:** modelo + endpoint para crear negocio; onboarding por URL/descripción; LLM (API key genérica) genera perfil + primeros subreddits + keywords, validados contra la API de Reddit.
- **Fase 3 — Frontend:** landing con captura de email + onboarding del negocio + dashboard feed (reciente→viejo, links a Reddit).
- **Fase 4 — Worker periódico:** cron que pollea, matchea, deduplica y (opcional) puntúa con LLM.
- **Fase 5 — Notificaciones email:** envío de digest/instantáneo con los links.
- **Fase 6 — Pulido:** dedup robusto, rate limiting, manejo de errores/quotas, deploy.

---

## 9. Riesgos / consideraciones
- **Spam / reglas de subreddits:** notificar (no autocomentar) reduce el riesgo, pero conviene sumar guía de "cómo aportar valor sin ser spam".
- **Rate limits / uso comercial de Reddit:** monitorear consumo; escalar al tier pago solo si crece.
- **Falsos positivos:** el filtro LLM es la mejor palanca de calidad (fase posterior).
- **Deliverability de emails:** verificar dominio (SPF/DKIM) con el proveedor elegido.
