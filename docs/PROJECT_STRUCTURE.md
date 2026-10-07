---
okf_version: "0.2"
id: "spec-project-structure-map"
title: "Mappa Strutturale di Progetto, Cartelle e File (PROJECT_STRUCTURE.md)"
type: "specification"
domain: "System Architecture & Codebase Navigation"
tags: ["okf", "specification", "architecture", "file-tree", "codebase-map", "agents", "navigation"]
entities:
  - name: "Knowledge Vault Codebase"
    type: "system"
    description: "Albero dei sorgenti full-stack TypeScript (Express + React Vite)"
  - name: "Navigation Index"
    type: "schema"
    description: "Mappa ragionata di cartelle, sottocartelle, moduli e file con relative responsabilità"
relations:
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "documents"
    weight: 1.0
    description: "Documenta la collocazione fisica dei componenti architetturali nel filesystem"
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "references"
    weight: 0.95
    description: "Descrive dove risiedono i parser e serializzatori OKF"
  - targetTitle: "Prompt di Innesco e Protocollo di Onboarding per Agenti AI Esterni (PROMPT_AGENT_ESTERNO)"
    relationType: "governs"
    weight: 0.9
    description: "Fornisce all'agente esterno le coordinate esatte dei file da esaminare o modificare"
---

# Mappa Strutturale di Progetto, Cartelle e File (PROJECT_STRUCTURE.md)

> **Scopo di questo documento per Agenti AI e Sviluppatori**:  
> Questa guida mappa l'intero filesystem del repository, spiegando **dove si trova ciascuna funzionalità**, la responsabilità di ogni sottocartella e il ruolo esatto dei singoli file.  
> Consulta questo indice per individuare istantaneamente il file target senza dover scansionare ricorsivamente l'intero albero dei sorgenti.

---

## 1. Panoramica ad Alto Livello

```
.
├── docs/                     # 📜 Documentazione canonica OKF v0.2 e archivio storico
│   └── archive/              # 🗄️ Specifiche e piani di sviluppo completati al 100%
├── server/                   # ⚙️ Backend Express (Node.js 22, API REST, MCP, Gemini SDK)
│   ├── gemini/               # Client e configurazione SDK @google/genai
│   ├── routes/               # Router Express modulari (/api/*)
│   └── services/             # Servizi di scraping, parsing euristico, PDF e ground tools
├── src/                      # 🎨 Frontend React 18 + TypeScript + Vite + Tailwind CSS
│   ├── components/           # Componenti React atomici e modali del Vault
│   │   └── cekikj/           # Componenti della suite epistemica Cekikj (Zero-Guessing)
│   ├── hooks/                # Custom React Hooks (cattura, dati, audit, conflitti)
│   │   └── vault/            # Micro-hooks specializzati per le mutazioni del Vault
│   └── lib/                  # Motori logici, parsing OKF, Firestore, IndexedDB, D3 helpers
│       └── cekikj/           # Motore logico Cekikj (Typed Tools, Contradiction Gate)
├── data/                     # 💾 Storage locale: Ring Buffer (vault-backup.json) e snapshot
└── Root Configs              # 🛠️ server.ts, vite.config.ts, package.json, firestore.rules
```

---

## 2. Directory Root (Configurazioni di Sistema)

| Percorso File | Ruolo & Responsabilità |
| :--- | :--- |
| `server.ts` | **Entry-point unificato del server**: monta i router Express `/api/*`, avvia il middleware Vite per la SPA e apre la porta 3000 (`0.0.0.0:3000`). |
| `package.json` | Dipendenze npm (Express, `@google/genai`, Firebase, Lucide, Tailwind, D3, etc.) e script di build. |
| `vite.config.ts` | Configurazione Vite 6 con plugin React e Tailwind CSS v4. |
| `tsconfig.json` | Configurazione TypeScript (target ES2022, bundler module resolution, strict mode). |
| `firestore.rules` | Regole di sicurezza Cloud Firestore per isolamento multi-tenant (`userId`). |
| `firebase-blueprint.json` | Schema descrittivo della collezione `resources`. |
| `firebase-applet-config.json` | Credenziali client Firebase per auth e firestore. |
| `PROMPT_AGENT_ESTERNO.md` | **Prompt di innesco pronto all'uso** per LLM esterni (Claude Code, Cursor, Gem). |
| `README.md` | Guida principale del progetto con panoramica e quickstart. |
| `AGENTS.md` | Protocolli di comportamento e vincoli formali per agenti autonomi. |
| `CLAUDE.md` | Guida operativa per agenti Anthropic e Claude CLI. |
| `GEMINI.md` | Linee guida per l'integrazione di modelli Google Gemini 3.7 Flash. |

---

## 3. Directory `docs/` (Specifiche Canoniche e Archivio)

La documentazione è rigorosamente suddivisa tra **standard attivo** e **archivio storico**:

### 3.1 Specifiche Canoniche Attive (`docs/`)
- `docs/OKF_v0.2_SPECIFICATION.md`: **Specifica formale standard OKF v0.2** (schema YAML, 6 tipi canonici, relazioni pesate, regole di validazione).
- `docs/SYSTEM_ARCHITECTURE_OKF.md`: **Blueprint architetturale** del Vault a 3 livelli (Client IDB $\leftrightarrow$ Ring Buffer JSON $\leftrightarrow$ Cloud Firestore), motore D3 e framework Cekikj.
- `docs/INGESTION_PIPELINE_SPEC.md`: **Pipeline di ingestione ed estrazione AI** (scraping OpenGraph, schema JSON Gemini 3.7 Flash, de-duplicazione con `conflictResolver.ts`).
- `docs/SYSTEM_REPLICATION_GUIDE.md`: **Guida di replicazione passo-passo** con elenco dipendenze, albero critico e comandi di bootstrap.
- `docs/SPEC_PIANO_MITIGAZIONE_CRITICITA_OKF.md`: **Specifica e piano di mitigazione delle criticità** (matrice dei rischi, circuit breaker, resilienza Tri-Layer e guardrail anti-rottura).
- `docs/PROJECT_STRUCTURE.md`: *Questo documento* (mappa geografica dei file).

### 3.2 Archivio Storico dei Piani Completati (`docs/archive/`)
- `docs/archive/README.md`: Indice storico certificato delle roadmap completate.
- `docs/archive/PIANO_IMPLEMENTAZIONE_CEKIKJ.md`: Piano di implementazione dei 5 pilastri Cekikj.
- `docs/archive/SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md`: Specifica dei contratti Cekikj (Zero-Guessing).
- `docs/archive/SPEC_PIANO_CAPTUREBAR_INTELLIGENCE.md`: Specifica dell'interfaccia elastica di CaptureBar.
- `docs/archive/SPEC_PIANO_ORCHESTRATOR_AGENTS_VAULT.md`: Specifica dei 5 agenti specializzati del Vault.
- `docs/archive/SPEC_PIANO_ESPORTAZIONE_OKF_VAULT_INTELLIGENCE.md`: Specifica dei formati di export.
- `docs/archive/PIANO_MIGLIORAMENTO_FUNZIONALITA_VAULT_2026.md`: Piano di modularizzazione hook e server MCP.
- `docs/archive/SPEC_MIGLIORAMENTO_FUNZIONALITA_VAULT_2026.md`: Specifica tecnica MCP, D3 minimap e stream.
- `docs/archive/PLAN_AI_STUDIO.md` & `SPEC_AI_STUDIO.md`: Disaccoppiamento architetturale e vincoli container.
- `docs/archive/PIANO_PROGETTO.md` & `PIANO_KNOWLEDGE_OKF.md`: Piani storici di fondazione del Vault.
- `docs/archive/UI_SPEC_2026_OKF.md`: Specifica UI/UX dell'header moderno e dell'omnibar.
- `docs/archive/ACCESS_SPEC.md`: Specifiche storiche di accesso per agenti.

---

## 4. Directory `server/` (Backend Express & AI Services)

Tutti i percorsi backend sono compilati con TypeScript via `tsx` (in dev) ed `esbuild` (in produzione).

```
server/
├── server.ts                  # Entry point del server (in root)
├── mcpServer.ts               # Server MCP (Model Context Protocol) per query esterne
├── vaultAgents.ts             # Orchestratore multi-agente per query agentiche (/api/vault/agentic-query)
├── ingestionAgents.ts         # Agenti di ingestione specializzati per schede e documenti
├── backupAgents.ts            # Agenti per audit e recovery degli snapshot
├── gemini/
│   └── client.ts              # Inizializzazione lazy di @google/genai con GEMINI_API_KEY
├── routes/
│   ├── captureRoutes.ts       # Router /api/analyze-resource, scraping URL, Gemini 3.7 Flash
│   ├── vaultRoutes.ts         # Router /api/vault/* (CRUD locale, backup, snapshot, ripristino)
│   ├── mcpRoutes.ts           # Router /api/mcp/* (esposizione risorse e tools MCP per Claude/Cursor)
│   └── telemetryRoutes.ts     # Router /api/telemetry/* (tracciamento quote, latenze ed errori)
└── services/
    ├── heuristicParser.ts     # Parser locale a regole (fallback 0ms quando le API cloud sono off)
    ├── openGraphService.ts    # Scraper HTML per metadati OpenGraph e Twitter Card
    ├── githubOkfService.ts    # Ingestione e conversione automatica di repository GitHub
    ├── pdfExtractor.ts        # Estrazione testo e metadati da file PDF allegati
    ├── contextCacheService.ts # Gestione della cache semantica dei prompt lunghi
    ├── searchGroundingService.ts # Grounding con Google Search per contenuti esterni
    ├── tagMlService.ts        # Calcolo di similarità semantica e categorizzazione tag
    └── vaultTools.ts          # Gli 8 strumenti tipizzati (Typed Tools) usati dagli agenti
```

---

## 5. Directory `src/` (Frontend React SPA)

### 5.1 Root di `src/`
- `src/main.tsx`: Entry point React (monta `<App />` nel DOM).
- `src/App.tsx`: Layout principale dell'applicazione, tab di navigazione, filtri globali e provider.
- `src/types.ts`: **Contratto TypeScript centrale**: definisce `ResourceItem`, `OKFMetadata`, `Entity`, `Relation`, `FilterState`, `ViewMode` e `CekikjTypes`.
- `src/index.css`: Import Tailwind CSS `@import "tailwindcss";` e direttive grafiche personalizzate.

### 5.2 Sottocartella `src/components/` (Componenti UI)

#### Header, Barre e Navigazione
- `Header.tsx`: Intestazione con Omnibar di ricerca rapida (Cmd+K), selettore ordinamento e cambio tema.
- `CaptureBar.tsx`: Barra di cattura espandibile (1-4 righe), dropdown ontologico a 11 tipi e tasto microfono.
- `Sidebar.tsx`: Pannello laterale per filtrare per tag, tipi di risorsa, preferiti e cartelle ontologiche.
- `StatsBanner.tsx`: Dashboard sintetica collassabile con metriche e conteggio nodi del Vault.
- `StatusCapsule.tsx`: Indicatore di stato di sincronizzazione a capsula (Local / Firestore / Offline).
- `SyncStatusBanner.tsx`: Banner di notifica sullo stato della sincronizzazione dati e backup.
- `BulkActionsToolbar.tsx`: Barra per azioni di massa (eliminazione multipla, export, taggare risorse).

#### Viste Principali e Visualizzazione Dati
- `ResourceCard.tsx`: Card standard per visualizzare una risorsa, con chip entità e relazioni.
- `ResourceTable.tsx`: Vista tabellare per grandi moli di dati con ordinamento per colonna.
- `KnowledgeGraph.tsx`: **Grafo topologico interattivo D3.js** a 5 forze con nodi entità/risorse e archi relazionali.
- `KnowledgeReader.tsx`: Lettore e renderer Markdown formattato per schede di conoscenza e note.
- `ReadItLaterQueue.tsx`: Coda di lettura differita per articoli e documentazione salvata.

#### Drawer e Terminali Intelligenti
- `VaultIntelligenceDrawer.tsx`: **Terminale agentico multi-turno** per interrogare il Vault con agenti AI.
- `DiagnosticDrawer.tsx`: Strumento di autodiagnosi per rilevare discrepanze tra cache e cloud.
- `VaultHealthCheckDrawer.tsx`: Pannello per verificare l'integrità dei dati e la conformità OKF.

#### Dialoghi e Modali di Sistema
- `AddResourceDialog.tsx`: Dialogo modale per l'inserimento manuale di una risorsa.
- `ResourceModal.tsx`: Visualizzatore dettagliato a schermo intero con editor del frontmatter OKF.
- `KnowledgeUploadDialog.tsx`: Upload drag-and-drop di file `.md`, `.json` o PDF con parsing immediato.
- `ExportBackupDialog.tsx`: Esportazione del Vault in formato OKF Zip, Markdown o JSON.
- `RecoveryModal.tsx`: Ripristino rapido del Vault da snapshot locali archiviati in `data/snapshots/`.
- `ConflictResolutionModal.tsx`: Risoluzione visiva guidata dei conflitti di sincronizzazione.
- `DiscrepancyInspectorModal.tsx`: Ispezione e correzione di inconsistenze tra indici locali e remoti.
- `McpConnectionModal.tsx`: Istruzioni e configurazione per collegare client MCP esterni (Claude Desktop, etc.).
- `AudioOverviewModal.tsx`: Generatore e riproduttore di panoramiche audio sintetiche delle schede.
- `GoogleDriveModal.tsx`: Connessione opzionale con Google Drive per sincronizzazione documentale.
- `OkfSyncModal.tsx`: Sincronizzazione ontologica bidirezionale.
- `PersistenceStatusModal.tsx`: Stato dettagliato della memorizzazione (IndexedDB, Server, Cloud).
- `PrintPreviewModal.tsx`: Layout ottimizzato per la stampa o l'esportazione PDF pulita.
- `RawFileManager.tsx`: Gestore file per ispezionare direttamente i backup JSON su disco.
- `TagSuggestionEngine.tsx`: Suggeritore visivo di tag correlati basato sulle entità del grafo.
- `VaultModalsContainer.tsx`: Contenitore unificato che raggruppa tutti i modali per evitare duplicazioni.
- `ErrorBoundary.tsx`: Componente React per intercettare e gestire con eleganza eventuali crash di rendering.

#### Sottocartella `src/components/cekikj/` (Suite Epistemica)
- `CekikjInspectorModal.tsx`: Finestra di ispezione generale delle asserzioni e claim Cekikj.
- `cekikj/CekikjClaimInspector.tsx`: Ispezione delle singole asserzioni estratte dai documenti.
- `cekikj/CekikjDecisionDag.tsx`: Grafo aciclico delle decisioni di routing epistemico.
- `cekikj/CekikjNewContradictionModal.tsx`: Modale per dichiarare una nuova contraddizione epistemica.
- `cekikj/CekikjResourceScannerModal.tsx`: Scansione automatica delle risorse per individuare asserzioni non verificate.
- `cekikj/CekikjSplitViewConflict.tsx`: Vista comparata affiancata tra due asserzioni contrastanti.

---

### 5.3 Sottocartella `src/hooks/` (Stato e Sincronizzazione)

- `useVaultCapture.ts`: Hook per la gestione del ciclo di cattura delle risorse (invio, parsing AI, salvataggio, feedback).
- `useVaultData.ts`: **Hook principale di orchestrazione dati**: coordina lo stato locale, le mutazioni e il caricamento iniziale.
- `src/hooks/vault/`: Micro-hooks specializzati estratti per mantenere il codice pulito e modulare:
  - `vaultCommon.ts`: Funzioni di utilità e tipi condivisi tra gli hook del Vault.
  - `useVaultMutations.ts`: Operazioni di creazione, aggiornamento, cancellazione e preferiti.
  - `useVaultConflictResolver.ts`: Logica di de-duplicazione e risoluzione automatica delle collisioni.
  - `useVaultAuditTrail.ts`: Tracciamento cronologico di tutte le operazioni di modifica effettuate.

---

### 5.4 Sottocartella `src/lib/` (Librerie Logiche e Motori)

- `okfParser.ts`: **Parser per documenti OKF v0.2**: estrae frontmatter YAML, convalida i 6 tipi, estrae entità e relazioni.
- `okfSerializer.ts`: **Serializzatore conforme OKF v0.2**: converte un oggetto TypeScript in Markdown formattato con YAML frontmatter.
- `indexedDb.ts`: Wrapper per il database locale del browser (IndexedDB) con supporto a query e storage persistente.
- `conflictResolver.ts`: **Motore di de-duplicazione**: genera firme uniche da URL o titoli normalizzati per prevenire duplicati.
- `firebase.ts`: Inizializzazione dell'SDK Firebase client (Firestore e Authentication).
- `searchEngine.ts`: Motore di ricerca testuale locale veloce e fuzzy per filtrare tra titoli, note e tag.
- `tagSuggestionEngine.ts`: Algoritmo di estrazione e associazione tag basato sul contenuto.
- `relatedResourcesEngine.ts`: Calcolo dei collegamenti topologici tra nodi del grafo tramite entità condivise.
- `exportUtils.ts`: Funzioni di download ed esportazione (JSON, Markdown, ZIP).
- `pdfExport.ts`: Generazione di report PDF stampabili.
- `cacheManager.ts`: Gestore della cache locale su LocalStorage e sessione.
- `dateUtils.ts`: Formattazione temporale relativa e assoluta in lingua italiana.
- `diagnosticActions.ts`: Suite di test e diagnostica sullo stato dei dati in memoria.
- `recoveryManager.ts`: Routine di ripristino di emergenza da dump JSON.
- `resourceLifecycleTracker.ts`: Tracciamento dello stato di maturità delle risorse (bozza, verificato, archiviato).
- `vaultHealthChecker.ts`: Verificatore di integrità e completezza dei metadati OKF.
- `vaultSyncAudit.ts`: Registro delle sincronizzazioni effettuate tra client e cloud.
- `quotaTelemetry.ts`: Monitoraggio dei token consumati e delle quote delle API generative.
- `readLaterUtils.ts`: Gestione della coda "Read It Later".
- `sampleData.ts`: Dati iniziali di seed per l'avvio a freddo della piattaforma.
- `fallbackParser.ts`: Parser di emergenza per estrarre informazioni da frammenti di testo malformati.
- `ogUtils.ts`: Utility di normalizzazione e pulizia dei metadati OpenGraph.
- `googleDriveDocs.ts`: Integrazione opzionale per l'esportazione verso Google Docs.

#### Sottocartella `src/lib/cekikj/` (Motore Epistemico Cekikj)
- `typedTools.ts`: Implementazione dei contratti rigorosi dei Typed Tools (`insufficient: boolean`).
- `contradictionGate.ts`: Registro delle contraddizioni epistemiche (`status: "open" | "resolved"`).
- `dualLayerStore.ts`: Separazione netta tra fatti asseriti e chunk di evidenza verificata.
- `boundedEngine.ts`: Limiti rigidi di esecuzione (max 8 passi di tool-call, max 2 hop sul grafo).
- `groundingVerifier.ts`: Verificatore di grounding tra sintesi generata e chunk documentali.
- `auditExporter.ts`: Esportazione forense dei log decisionali epistemici.
- `testRunner.ts` & `__tests__/cekikjSuite.test.ts`: Test suite automatizzata per la validazione delle regole Cekikj.

---

## 6. Directory `data/` (Persistenza Locale su Disco)

| Percorso | Descrizione |
| :--- | :--- |
| `data/vault-backup.json` | Snapshot corrente del Vault memorizzato sul filesystem del server. |
| `data/snapshots/` | Ring buffer rotativo che conserva gli **ultimi 20 snapshot temporali** del database per prevenire qualsiasi perdita di dati. |

---

## 7. Guida Rapida alla Modifica per Casi d'Uso

Se devi effettuare una modifica specifica, ecco dove intervenire:

- **Modificare o aggiungere un tipo di risorsa**:  
  `src/types.ts` $\rightarrow$ `src/lib/okfParser.ts` $\rightarrow$ `src/components/CaptureBar.tsx` $\rightarrow$ `src/components/ResourceCard.tsx`.
- **Modificare il prompt o la pipeline di estrazione AI**:  
  `server/routes/captureRoutes.ts` $\rightarrow$ `server/services/heuristicParser.ts`.
- **Modificare il comportamento del Knowledge Graph D3**:  
  `src/components/KnowledgeGraph.tsx` $\rightarrow$ `src/lib/relatedResourcesEngine.ts`.
- **Aggiungere un nuovo endpoint API o MCP tool**:  
  `server/routes/` $\rightarrow$ `server/mcpServer.ts` $\rightarrow$ `server/services/vaultTools.ts`.
- **Modificare il layout generale della pagina**:  
  `src/App.tsx` $\rightarrow$ `src/components/Header.tsx` $\rightarrow$ `src/components/Sidebar.tsx`.
