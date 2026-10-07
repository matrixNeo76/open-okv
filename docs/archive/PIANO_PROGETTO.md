# Piano Architetturale e di Sviluppo: Knowledge Vault (AI & Dev Resources)

Questo documento definisce il piano completo, l'architettura tecnica e le funzionalità dell'applicativo web per la cattura rapida, categorizzazione intelligente, archiviazione in **Google Cloud Firestore** e consultazione performante di risorse per sviluppatori e professionisti AI.

---

## 1. Obiettivo dell'Applicativo

Fornire uno spazio unificato, veloce e affidabile dove salvare e organizzare in modo immediato:
1. 📄 **Articoli & Guide Tecniche** (blog post, documentazione, approfondimenti)
2. 🐙 **Repository GitHub** (tool, librerie, progetti open source)
3. 🔌 **MCP Servers** (Model Context Protocol: server di tool, risorse e context per agenti AI)
4. 🧠 **Skills AI & Prompts** (istruzioni di sistema, skill definitions, workflow e prompt specializzati)

---

## 2. Modalità di Inserimento (Cattura Rapida)

L'utente potrà aggiungere risorse in due modalità fluide e complementari:

### A. Modalità Chat Conversazionale / AI Ingestion
- **Input unificato**: inserimento di URL, testo grezzo, snippet di codice o comandi.
- **Parsing e Riconoscimento Automatico (AI-Powered con Gemini)**:
  - Riconosce automaticamente il tipo di risorsa: *Articolo*, *Repo GitHub*, *MCP Server* o *Skill AI*.
  - Estrae automaticamente **Titolo**, **Descrizione/Sommario**, **Autore/Owner**, **Tag tematici**, e **Metadati specifici**.
  - Per i server MCP: estrae parametri di esecuzione (`command`, `args`, `env`, protocollo `stdio`/`sse`).
  - Per i repository GitHub: identifica repository, owner, tech stack principale e comandi di installazione.
  - Per le Skills AI: identifica prompt di sistema, use case e tool richiesti.
- **Conferma rapida**: l'interfaccia mostra un'anteprima della scheda arricchita prima o subito dopo il salvataggio su Firestore, con possibilità di modifica in tempo reale.

### B. Modalità Quick Dialog / Form Diretto
- Modal rapida attivabile con scorciatoia tastiera (es. `Cmd/Ctrl + K` o pulsante dedicato "+ Nuova Risorsa").
- Possibilità di inserimento manuale o "Auto-Fill da Link/Testo": incollando un link, l'app analizza e pre-compila tutti i campi con un solo clic.

---

## 3. Database & Architettura Dati (Firestore)

### Schema Dati Principale (`resources`)
Ogni documento salvato nella collezione `resources` (o sottocollezione utente) presenterà la seguente struttura:

| Campo | Tipo | Descrizione |
|---|---|---|
| `id` | `string` | ID univoco del documento |
| `userId` | `string` | UID dell'utente autenticato (proprietario del dato) |
| `type` | `enum` | `'article' \| 'github_repo' \| 'mcp_server' \| 'ai_skill'` |
| `title` | `string` | Titolo chiaro e leggibile |
| `url` | `string?` | Link alla risorsa originale (se presente) |
| `rawInput` | `string?` | Testo o prompt originale inserito |
| `summary` | `string` | Sintesi/descrizione dettagliata del contenuto |
| `tags` | `string[]` | Array di etichette per filtro e ricerca rapida |
| `isFavorite` | `boolean` | Flag per salvataggio nei preferiti |
| `rating` | `number?` | Valutazione opzionale (1-5 stelle) |
| `metadata` | `map` | Campi specifici per tipo: |
| &nbsp;&nbsp;↳ *GitHub* | `map` | `owner`, `repoName`, `stars`, `language`, `installCommand` |
| &nbsp;&nbsp;↳ *MCP Server* | `map` | `protocol`, `command`, `args`, `env`, `configSnippet` |
| &nbsp;&nbsp;↳ *AI Skill* | `map` | `skillType`, `recommendedModel`, `systemPrompt`, `triggerKeywords` |
| &nbsp;&nbsp;↳ *Article* | `map` | `author`, `readingTimeMin`, `keyTakeaways` |
| `createdAt` | `timestamp` | Timestamp di creazione (server timestamp) |
| `updatedAt` | `timestamp` | Timestamp di ultima modifica |

---

## 4. Consultazione, Ricerca e Filtri

L'interfaccia di consultazione è progettata per essere pulita, immediata e ad altissime prestazioni:

1. **Dashboard a Tab / Filtri Categoria**:
   - *Tutti*, *Articoli*, *GitHub Repos*, *MCP Servers*, *Skills AI*, *Preferiti*.
2. **Ricerca Realtime Potente**:
   - Ricerca istantanea su titolo, sommario, tag, comandi e URL con highlight dei termini.
3. **Filtro Avanzato per Tag**:
   - Tag cloud interattiva per isolare rapidamente categorie tecnologiche (es. `typescript`, `react`, `claude`, `gemini`, `database`).
4. **Viste Multiple**:
   - **Vista a Card / Griglia Bento**: con badge colorati per tipo di risorsa, anteprima rapida, snippet copiabili in 1-click (es. comandi `git clone`, configurazioni JSON per MCP, prompt per le skill).
   - **Vista a Tabella / Lista Compatta**: per consultazione densa e gestione rapida di volumi elevati di risorse.
5. **Modal di Dettaglio & Modifica**:
   - Visualizzazione completa con renderer Markdown per note e prompt.
   - Possibilità di testare o copiare configurazioni MCP direttamente negli appunti.
   - Modifica rapida dei dati e cancellazione sicura con conferma.
6. **Esportazione & Backup**:
   - Export in formato JSON e Markdown (per backup locale o integrazione in altre app).

---

## 5. Sicurezza e Regole Firestore (Zero-Trust)

- **Firebase Authentication**: Login sicuro tramite account Google (popup).
- **Hardened Security Rules (`firestore.rules`)**:
  - Accesso strictly isolato: ogni utente può leggere, creare, modificare ed eliminare solo ed esclusivamente le proprie risorse (`request.auth.uid == resource.data.userId`).
  - Validazione rigida dei tipi, dimensioni delle stringhe e campi ammessi su ogni operazione di scrittura.
  - Immutabilità verificata per `userId` e `createdAt`.

---

## 6. Stack Tecnologico & Prestazioni

- **Frontend**: React 19 + TypeScript + Vite.
- **Styling & UI**: Tailwind CSS v4 + Lucide Icons + Motion (animazioni fluide e reattive).
- **Backend / API**: Express integrato per proxy sicuro delle chiamate AI Gemini (senza esporre chiavi API al browser).
- **Database & Auth**: Firebase Firestore + Firebase Auth.
- **Performance**:
  - Aggiornamenti real-time con listener Firestore (`onSnapshot`) indicizzati e pulizia automatica delle risorse.
  - Caricamento ottimizzato con stati di skeleton loading ed empty state curati.

---

## 7. Fasi di Implementazione Proposte (Stato di Avanzamento)

1. **Fase 1**: Configurazione e provisioning di Firebase (Firestore + Auth con `set_up_firebase`) — ✅ *Completata*.
2. **Fase 2**: Definizione del blueprint Firestore (`firebase-blueprint.json`), `firestore.rules` hardened e test di sicurezza — ✅ *Completata*.
3. **Fase 3**: Implementazione del backend API (`/api/analyze-resource`) per il parsing intelligente con Gemini — ✅ *Completata*.
4. **Fase 4**: Creazione dell'interfaccia utente (Vault, Bento Grid, Table, Knowledge Graph D3, Quick Capture, Telemetria) — ✅ *Completata*.
5. **Fase 5**: Supporto formati estesi (Paper arXiv, Feed RSS, Note & Scratchpad) — ✅ *Completata*.

---

## 8. Roadmap di Evoluzione Epistemica: Architettura Cekikj (Zero-Guessing Knowledge Layer)

> **Piano Esecutivo Dettagliato**: consultare `/PIANO_IMPLEMENTAZIONE_CEKIKJ.md`  
> **Specifica OKF v0.2 di Riferimento**: `/src/docs/SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md`  
> **Tesi Guida**: *"An agent's reasoning is bounded by the vocabulary of its tools"* — Miodrag Cekikj.

Per superare la trappola del "Search Box" e delle congetture iterate (*iterated guessing*), la roadmap integra il motore epistemico rigoroso strutturato nelle seguenti 8 Milestone operative:

| Milestone | Ambito | Deliverable e Obiettivi Chiave | Stato |
|---|---|---|---|
| **M1: Contratti & Tipi** | `src/types.ts` | Schema tipizzato per `EvidenceChunk`, `StructuredKnowledgeEntity`, `TypedRelationship`, `ContradictionRecord`, `TypedToolEnvelope<T>`, `ExecutionTrace`. | 📋 *Pianificata* |
| **M2: 8 Typed Tools** | `src/lib/cekikj/typedTools.ts` | Implementazione suite 8 tool in sola lettura con flag `insufficient: boolean`: `search_evidence`, `search_knowledge`, `resolve_entity`, `traverse`, `timeline`, `diff`, `list_contradictions`, `get_source`. | 📋 *Pianificata* |
| **M3: Storage Dual-Layer & Bitemporalità** | `src/lib/cekikj/dualLayerStore.ts` | Ancoraggio bi-direzionale chunk ◄► entità ontologiche; intervalli di vigenza temporale reale (`valid_from` / `valid_to`). | 📋 *Pianificata* |
| **M4: Contradiction Gate Out-of-Loop** | `src/lib/cekikj/contradictionGate.ts` | Compositore a valle disaccoppiato dall'agente che ispeziona indipendentemente la trace e blocca la sintesi in caso di collisione tra fonti aperte. | 📋 *Pianificata* |
| **M5: Bounded Loop Engine** | `src/lib/cekikj/boundedEngine.ts` | Motore FSM compatto (~80 righe) con vincoli rigidi (max 8 round, max 2 hop, timeout e token guard) e fallback trasparente. | 📋 *Pianificata* |
| **M6: Grounding Verifier** | `src/lib/cekikj/groundingVerifier.ts` | Passata singola di validazione che verifica ogni claim su chunk/archi tracciati, potando affermazioni prive di evidenza. | 📋 *Pianificata* |
| **M7: UI Epistemica & Trace Inspector** | `src/components/CekikjInspectorModal.tsx` | Visualizzatore interattivo della trace agentica (round x/8, hop, token, status gate) e registro visivo delle contraddizioni. | 📋 *Pianificata* |
| **M8: Collaudo & Refusal Tests** | `src/lib/cekikj/__tests__/` | Suite di regressione con refusal tests per certificare l'assoluta conformità ai 5 pilastri della specifica Cekikj. | 📋 *Pianificata* |

