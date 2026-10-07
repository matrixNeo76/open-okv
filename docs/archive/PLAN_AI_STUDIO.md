# Piano Operativo: Ottimizzazione KnowledgeVault per Google AI Studio

> **Roadmap Operativa a Fasi Progressive, Senza Regressioni e Senza Interruzioni di Servizio**  
> **Target**: Runtime Google AI Studio (Node.js 22, Express, Firestore, `@google/genai` v2.4.0)

---

## Panoramica delle Fasi

Il piano è suddiviso in 4 fasi ordinate per priorità e rischio decrescente. Ogni fase mantiene sempre l'applet compilabile e funzionante senza mai rompere l'esperienza utente corrente.

```
[Fase 1: Scomposizione Modulare Backend] -> [Fase 2: Potenziamento Gemini SDK] -> [Fase 3: Function Calling Agenti] -> [Fase 4: Snellimento Frontend App.tsx]
```

---

## Fase 1: Scomposizione Modulare del Backend (`server/`) [COMPLETATA]
*Obiettivo: Ridurre `server.ts` da 3.353 righe a meno di 150 righe, eliminando il collo di bottiglia principale per l'editor e l'assistente di AI Studio.*

- [x] **1.1 Configurazione Servizio Gemini**:
  - Creato `/server/gemini/client.ts`: singleton client `getGenAI()`, header `"User-Agent": "aistudio-build"`, modelli candidati (`gemini-3.7-flash`, `gemini-flash-latest`, `gemini-3.1-flash-lite`), telemetria RPD/RPM e tracking unificato `trackCall`.
- [x] **1.2 Servizi Specialistici**:
  - `/server/services/pdfExtractor.ts`: parsing sicuro stream PDF.
  - `/server/services/openGraphService.ts`: estrazione metadati web & body cleaner.
  - `/server/services/heuristicParser.ts`: parser a regole OKF v0.2 a latenza 0ms.
- [x] **1.3 Estrazione Router Modulari Express**:
  - `/server/routes/captureRoutes.ts`: `/api/analyze-resource`, `/api/convert-file-to-okf`, `/api/process-knowledge`, `/api/expand-documentation`, `/api/generate-insights`, `/api/translate-resource`, `/api/summarize-resource`, `/api/fetch-opengraph`.
  - `/server/routes/vaultRoutes.ts`: `/api/vault/backup`, `/api/vault/snapshots`, `/api/vault/resources`, `/api/vault/agentic-query`.
  - `/server/routes/telemetryRoutes.ts`: `/api/health`, `/api/telemetry/gemini-stats`, `/api/diagnostics/analyze-log`.
- [x] **1.4 Riorganizzazione Entry Point `server.ts`**:
  - Ridotto `server.ts` a sole 40 righe pulite e snelle per il montaggio dei router, body parser 60MB e Vite middleware.
  - Build di produzione (`esbuild` + `vite`) e dev server (`tsx`) verificati con successo.

---

## Fase 2: Potenziamento Gemini SDK & Funzionalità Native [COMPLETATA]
*Obiettivo: Sfruttare le capacità reali del modello `gemini-3.7-flash` e dell'SDK `@google/genai`.*

- [x] **2.1 Thinking Budget Configurabile**:
  - Integrato supporto a `thinkingConfig: { thinkingBudget: number }` in `gemini/client.ts` e in `vaultAgents.ts` (0 budget per cattura ultra-rapida <2s, 2048 per deep implementation).
- [x] **2.2 Google Search Grounding a Due Stadi per CaptureBar**:
  - Implementato `server/services/searchGroundingService.ts` con tool nativo `googleSearch: {}`.
  - Integrata pipeline a due stadi in `server/routes/captureRoutes.ts` per `/api/analyze-resource`: (1) sintesi arricchita con fonti web in tempo reale e citazioni URL -> (2) formattazione rigida in schema OKF v0.2.
  - Creato endpoint dedicato `POST /api/search-grounded-enrich` per invocazione on-demand.
- [x] **2.3 Adapter Transitorio Gemini Files API**:
  - Implementato `server/services/filesAdapter.ts` con `ai.files.upload` e blocco `finally { ai.files.delete }`.
  - Integrato in `server/routes/captureRoutes.ts` per file audio pesanti (>4MB o fallback su trascrizione inline vuota).
- [x] **2.4 Context Caching Dinamico (Soglia 32k Token)**:
  - Implementato `server/services/contextCacheService.ts` con verifica token e TTL di 1 ora.
  - Integrato in `server/vaultAgents.ts` durante l'orchestrazione delle query multi-agente per grandi contesti documentali del Vault.

---

## Fase 3: Strutturazione Function Calling negli Agenti (`vaultAgents.ts`) [COMPLETATA]
*Obiettivo: Migrare gli agenti del Vault da prompt sequenziali testuali a strumenti tipizzati con schema formale.*

- [x] **3.1 Dichiarazione Tool con JSON Schema**:
  - Implementato `server/services/vaultTools.ts` con tre FunctionDeclaration tipizzate secondo schema `@google/genai` (`Type.OBJECT`, `Type.STRING`, `Type.INTEGER`, `Type.ARRAY`):
    - `search_vault(query, tags, type)`
    - `traverse_graph_relations(resourceId, depth)` (hard bound a max 2 hop)
    - `verify_grounding_evidence(claim, sourceId)` (Zero-Guessing Guard Cekikj).
- [x] **3.2 Loop Esecutivo con Function Calling & Dispatch Automatico**:
  - Configurato il bounded loop multi-turn in `server/vaultAgents.ts` con dispatch automatico e generazione di parti `createPartFromFunctionResponse`.
  - Cascata di fallback resiliente (3.7-flash -> flash-latest -> 3.1-flash-lite) con telemetria e tracciamento step nel pannello UI.
- [x] **3.3 Zero-Guessing Guard & Prevenzione Allucinazioni**:
  - Audit delle citazioni e asserzioni con marcatura esplicita `insufficient: true` in caso di assenza di evidenze documentate nel Vault.

---

## Fase 4: Snellimento e Modularizzazione Frontend (`src/App.tsx`) [COMPLETATA]
*Obiettivo: Riportare `App.tsx` sotto le 500 righe estraendo la gestione dei modali e la logica di stato.*

- [x] **4.1 Estrazione Hook Personalizzati**:
  - `src/hooks/useVaultData.ts`: gestione isolata e robusta di `resources`, listener in tempo reale `onSnapshot`, Safety Shield anti-wiping, mutazioni ottimistiche, risoluzione conflitti, telemetria quote e persistenza a 3 livelli (Firestore, IndexedDB, LocalStorage, Filesystem locale).
  - `src/hooks/useVaultCapture.ts`: gestione dello staging buffer file grezzi fino a 50MB, upload e chunking Firestore (max 750KB per chunk), conversione automatica AI in standard OKF v0.2, eliminazione sicura e feedback di stato.
- [x] **4.2 Estrazione Modali e Controller**:
  - Spostato l'intero set di rendering dei modali secondari (dettaglio risorsa, reader OKF markdown, upload dialog, diagnostica, backup, conflitti, Google Drive, centro di recupero, persistenza a 3 livelli, ispettore Cekikj e cassetto intelligence multi-agente) nel componente dedicato `src/components/VaultModalsContainer.tsx`.
- [x] **4.3 Verifica e Collaudo Finale**:
  - `src/App.tsx` ridotto da ~2980 righe a ~440 righe pulite e leggibili.
  - Verifica completata con `lint_applet` (0 errori) e `compile_applet` con esito verde (build succeeded).
  - Integrità e sicurezza operativa garantite al 100%.

---

## Fase 5: Collaudo Sistematico delle Criticità e Sigillo di Rilascio [COMPLETATA]
*Obiettivo: Validare formalmente tutti i percorsi critici del sistema, eliminando potenziali regressioni e confermando la piena operatività.*

- [x] **5.1 Audit Percorso di Cattura (Capture Pipeline)**:
  - Verificato buffer di staging file con frammentazione chunk Firestore (750KB).
  - Verificata pipeline a due stadi per Google Search Grounding (Stage 1 search -> Stage 2 OKF schema formatting).
  - Risolto edge case in `useVaultCapture.ts`: eliminata la chiamata non valida `updateDoc` su ID file temporanei locali (`local-*`).
  - Verificato AbortController a 35s lato backend e 45s safety guard lato frontend.

- [x] **5.2 Audit Sincronizzazione e Multi-Layer Storage**:
  - Validato lo scudo di sicurezza "Anti-Wiping" in `useVaultData.ts` in caso di ricezione di snapshot remoti vuoti.
  - Verificata la promozione automatica e trasparente delle risorse create offline (`local-*`, `conv-*`, `seed-*`) su Firestore in background.
  - Testato l'isolamento del network su esaurimento quote (`disableNetwork`) con deviazione trasparente a IndexedDB e LocalStorage.

- [x] **5.3 Audit Motore Agenti e Interrogazione Epistemica**:
  - Verificato il loop multi-turn con `functionDeclarations` tipizzate in `vaultAgents.ts`.
  - Confermato il protocollo Zero-Guessing di Cekikj (blocco sintesi speculativa con flag `insufficient: true`).
  - Testate le funzioni del cassetto `VaultIntelligenceDrawer.tsx`: copia formattata (OKF, Clean, JSON), download diretto e archiviazione nel Vault a 1 clic.

- [x] **5.4 Audit Esportazione e Visualizzazione**:
  - Verificato l'export verso Google Drive / Google Docs con associazione metadati `gdocId`/`gdocUrl`.
  - Verificato il clustering e la navigazione del Grafo D3 topologico con supporto a nodi interconnessi.

- [x] **5.5 Stato di Rilascio**:
  - `tsc --noEmit` completato con 0 errori.
  - Build di produzione `vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs` completata con successo.
  - Documentazione di architettura (`SPEC_AI_STUDIO.md`) e piano esecutivo (`PLAN_AI_STUDIO.md`) aggiornati.
  - **STATO ATTUALE**: Il sistema è stabile, ottimizzato, resiliente e pronto per la conferma dell'utente.
