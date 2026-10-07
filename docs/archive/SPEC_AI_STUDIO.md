# Specifica Tecnica: Ottimizzazione KnowledgeVault nel Runtime Google AI Studio

> **Documento di Analisi Critica, Valutazione di Fattibilità e Specifica di Integrazione**  
> **Target**: Google AI Studio Container (Cloud Run / Node.js 22 / Express / Firestore / `@google/genai` v2.4.0)  
> **Standard di Progetto**: OKF v0.2, Zero-Guessing Architettura Cekikj, Regole di Sicurezza Cloud.

---

## 1. Analisi Critica e Valutazione del Piano Proposto

Il piano proposto individua con precisione i due problemi più gravi per l'efficienza e la manutenibilità del progetto dentro l'editor di AI Studio:
1. **La presenza di file sorgente monolitici enormi**: `server.ts` (~140 KB, 3.353 righe) e `src/App.tsx` (~120 KB, 2.972 righe). In Google AI Studio, file di questa mole saturano la context window dell'assistente di codice, rallentano i tool di editing e aumentano il rischio di regressioni o troncamento dei file.
2. **Il sottoutilizzo delle capacità avanzate dell'SDK `@google/genai`**: attualmente molte invocazioni utilizzano prompt monolitici con serializzazione JSON manuale, invece di sfruttare Thinking Budget dinamico, Search Grounding e Function Calling nativo.

Tuttavia, un'analisi approfondita del runtime reale di Google AI Studio rivela **alcune inesattezze tecniche e vincoli architetturali** che richiedono una ricalibrazione del piano prima dell'implementazione:

| Elemento Proposto | Valutazione Tecnica nel Runtime Reale | Decisione Architetturale & Correzione |
| :--- | :--- | :--- |
| **Runtime "Bun"** | ❌ **Errato**: Il container Cloud Run di AI Studio usa **Node.js v22** nativo (`"dev": "tsx server.ts"`, build CommonJS per `dist/server.cjs`). Bun non è presente nell'ambiente. | Mantenere il runtime Node 22 + Express + tsx/esbuild senza alterare il toolchain di avvio. |
| **Scomposizione Modulare (`server.ts` & `App.tsx`)** |  **Critico & Prioritario**: `server.ts` e `App.tsx` superano le dimensioni raccomandate dalle linee guida del framework (<20-30 KB per file). | **APPROVATO AL 100%**: Suddividere `server.ts` in router modulari (`server/routes/`) e servizi (`server/services/`), estraendo da `App.tsx` i modali e i controller logici. |
| **Gemini 3.7 Thinking Budget (`thinkingConfig`)** |  **Pienamente Compatibile**: L'SDK `@google/genai` supporta `thinkingConfig: { thinkingBudget: number }` su `gemini-3.7-flash`. | **APPROVATO**: Budget a 0 token per cattura rapida a bassa latenza; budget controllato (1024-2048 token) per sintesi ontologiche complesse, grafi e audit epistemico Cekikj. |
| **Context Caching Nativo** | ⚠️ **Attenzione ai Vincoli API**: Il Context Caching di Gemini richiede una **dimensione minima di token** (soglia minima standard di 32.768 token). Un prompt di sistema da solo (2.000 token) riceve errore `INVALID_ARGUMENT: minimum token count not met`. | **RIADATTATO**: Attivare la cache di contesto solo quando il corpus testuale delle risorse del Vault inviate supera la soglia minima di token (32k+ token), con fallback trasparente a richiesta standard. |
| **Gemini Files API (`ai.files.upload`)** | ⚠️ **Non sostituisce la persistenza**: I file caricati con `ai.files.upload` hanno un TTL rigido di 48 ore nel cloud di Google, mentre il Vault necessita di persistenza perenne (Firestore/Storage/IndexedDB). | **RIADATTATO**: Usare la Files API come canale di trasporto ottimizzato per file pesanti (>10MB audio/PDF) verso Gemini, implementando il pattern "upload su Files API -> inferenza Gemini -> cancellazione immediata (`ai.files.delete`)" per non saturare quota storage. |
| **Google Search Grounding per CaptureBar** | ⚠️ **Vincolo di Conflitto Schema**: Nell'SDK `@google/genai`, combinare `tools: [{ googleSearch: {} }]` e `responseSchema: schema` in una sola chiamata genera frequentemente conflitti di validazione o errori 400. | **RIADATTATO**: Implementare una pipeline a due passi quando è richiesto Search Grounding: Step 1: estrazione grounded via Google Search; Step 2: formattazione rigorosa nello schema JSON OKF v0.2. |
| **Function Calling Nativo per Agenti** |  **Pienamente Valido**: Dichiarare formalmente i tool con `functionDeclarations` nell'orchestratore di `server/vaultAgents.ts`. | **APPROVATO**: I 5 sotto-agenti (Graph Navigator, Deep Content Analyst, Code Specialist, Grounding Verifier) diventano tool formali invocabili dinamicamente da Gemini. |
| **Fallback su `gemini-2.5-flash`** | ❌ **Non Conforme**: Le linee guida ufficiali di Google AI Studio impongono l'uso della famiglia Gemini 3 (`gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-flash-latest`, `gemini-3.1-flash-lite`). | **CORRETTO**: Usare solo la gerarchia approvata: `gemini-3.7-flash` (primario) -> `gemini-flash-latest` -> `gemini-3.1-flash-lite`. |

---

## 2. Architettura Tecnica Revisionata

### 2.1 Architettura Modulare del Backend (`server/`)
```text
server/
├── index.ts / server.ts            # Entry point snello (<150 righe): middleware, routing, Vite SPA fallback
├── gemini/
│   ├── client.ts                   # Client singleton @google/genai con User-Agent e retry logic
│   ├── thinking.ts                 # Helper per budget di ragionamento (0 vs 2048 token)
│   ├── grounding.ts                # Wrapper per Google Search Grounding a due stadi
│   └── filesAdapter.ts             # Gestore transitorio Files API (upload -> inferenza -> delete)
├── routes/
│   ├── captureRoutes.ts            # /api/analyze-resource, /api/convert-file-to-okf, /api/bulk-analyze
│   ├── vaultRoutes.ts              # /api/vault/agentic-query, /api/vault/search
│   ├── fileRoutes.ts               # /api/raw-files, staging e chunking
│   ├── telemetryRoutes.ts         # /api/quota-status, telemetria consumi
│   └── exportRoutes.ts            # /api/export-google-doc, export Google Drive
└── services/
    ├── okfParser.ts                # Parsing ed estrazione euristica OKF v0.2 di riserva
    ├── cekikjVerifier.ts           # Gate epistemico, contradiction detection e metriche zero-guessing
    └── pdfExtractor.ts             # Parsing buffer PDF con pdf-parse
```

### 2.2 Architettura Modulare Frontend (`src/`)
Estrarre da `src/App.tsx` i blocchi autonomi:
- `src/features/modals/`: `ResourceModalController.tsx`, `KnowledgeUploadController.tsx`, `DiagnosticController.tsx`.
- `src/features/vault/`: `VaultMainView.tsx` (gestione delle categorie e filtri).
- `src/hooks/useVaultResources.ts`: logica Firestore e cache IndexedDB disaccoppiata dall'albero di rendering.

### 2.3 Gestione Resilienza e Quota Telemetry
- Mantenimento rigoroso della telemetria delle quote (`quotaTelemetry.ts`) integrata con le metriche reali restituite dagli header di risposta di Gemini e Firestore.
- Backoff esponenziale con jitter per errori 429 / 503 con fallback trasparente al generatore euristico a latenza 0ms.

---

## 3. Audit di Criticità dei Percorsi Operativi (Critical Paths Audit)

A valle del completamento della Fase 4, è stato condotto un audit sistematico su tutti i percorsi critici del sistema per verificare l'assenza di regressioni, deadlock, race conditions o perdita di dati:

### 3.1 Percorso di Cattura e Ingestione Risorse (`useVaultCapture.ts` -> `captureRoutes.ts`)
- **Staging & Chunking Buffer**: Supporto a file di grandi dimensioni (fino a 50MB) frammentati in chunk Firestore da 750KB. Se offline, storage locale immediato.
- **Due Stadi per Google Search Grounding**: La ricerca in tempo reale sul web (`performSearchGroundedSynthesis`) è isolata dallo stadio di formattazione JSON (`generateWithGeminiFallback`). Ciò previene il bug noto dell'SDK `@google/genai` (conflitto `tools: [googleSearch]` e `responseSchema`).
- **Timeout & AbortController**: Configurato timeout di 35s lato fetch con AbortController e safety margin di 45s lato UI, evitando blocchi della CaptureBar in caso di picchi di latenza di rete o sleep del container.
- **Risoluzione Edge Case IDs Locali**: Risolta la criticità per cui file marcati con prefisso `local-` tentavano una `updateDoc` remota su `raw_files`; è ora presente un guard condizionale che impedisce eccezioni Firestore in assenza di ID remoto.

### 3.2 Percorso di Sincronizzazione e Multi-Layer Storage (`useVaultData.ts`)
- **Safety Shield Anti-Wiping**: Se la query Firestore ritorna vuota (es. nuovo dispositivo o switch di rete), le risorse presenti nel local state/cache non vengono sovrascritte, proteggendo l'utente da cancellazioni accidentali.
- **Idratazione Multi-Layer al Boot**: Sequenza di ripristino ordinata: Backend Filesystem (`loadFromServerFilesystem`) -> IndexedDB (`loadResourcesFromIndexedDB`) -> Firestore Realtime (`onSnapshot`).
- **Auto-Promozione Risorse Locali/Conversione**: Le risorse generate offline con prefissi `local-`, `conv-` o `seed-` vengono automaticamente promosse su Firestore in background appena la connessione e la quota lo consentono.
- **Gestione Esaurimento Quota (429 / Resource Exhausted)**: Switch trasparente a `disableNetwork(db)` e deviazione immediata a IndexedDB/LocalStorage per garantire l'operatività continua a latenza zero.

### 3.3 Motore di Intelligenza Multi-Agente (`VaultIntelligenceDrawer.tsx` -> `vaultRoutes.ts` -> `vaultAgents.ts`)
- **Function Calling Tipizzato & Bounded Loop**: L'orchestratore dispone di 3 tool tipizzati (`search_vault`, `traverse_graph_relations`, `verify_grounding_evidence`) limitati a massimo 8 iterazioni e 2 hop nel grafo relazionale.
- **Gate Epistemico Cekikj (Zero-Guessing)**: In caso di assenza di documenti nel Vault o contraddizioni aperte nel registro, il modello attiva il flag `insufficient: true` ed evita allucinazioni.
- **Azioni di Esportazione e Archiviazione**: Il cassetto consente il download diretto (.md, .json), copia formattata (OKF, Clean, JSON) e l'archiviazione con 1 clic (`handleSaveAsVaultNote` -> `handleManualAdd`) completa di metadati OKF v0.2 ed entità collegate.

### 3.4 Percorso di Esportazione e Integrazione Esterna (`GoogleDriveModal.tsx` & `ExportBackupDialog.tsx`)
- **Google Docs & Drive**: Esportazione sicura delle specifiche con salvataggio ID e URL nei metadati della risorsa (`gdocId`, `gdocUrl`).
- **Backup Completo**: Generazione istantanea di snapshot JSON e archivi CSV con download client-side privo di dipendenze esterne.

---

## 4. Matrice dei Rischi e Contromisure Attive

| Rischio Identificato | Probabilità | Impatto | Contromisura Architetturale Attiva |
| :--- | :--- | :--- | :--- |
| **Saturazione Quota Firestore (Free Tier)** | Alta | Bassa | Cache IndexedDB + LocalStorage + disabilitazione proattiva della rete (`disableNetwork`). Auto-riconnessione automatica al reset giornaliero. |
| **Timeout Chiamata Gemini su File Pesanti** | Media | Media | File Adapter transitorio con Files API (`ai.files.upload`), estrazione PDF in streaming e fallback su parser euristico locale a 0ms. |
| **Conflitto Dati Locale vs Cloud** | Media | Bassa | Modale di riconciliazione conflitti (`ConflictResolutionModal.tsx`) con unione a livello di campo timestamped. |
| **Blocco dev server per memory leak o HMR** | Bassa | Alta | HMR disabilitato da infrastruttura (`DISABLE_HMR=true`), de-duplicazione promesse OpenGraph (`ogUtils.ts`) e chiusura listener Firestore su unmount. |

---

## 5. Stato di Conformità Operativa

- **Linting (`tsc --noEmit`)**: Superato con 0 errori.
- **Compilazione Produzione (`vite build` + `esbuild`)**: Superato con successo (`dist/server.cjs` autocontenuto).
- **Dimensioni Moduli**:
  - `server.ts`: 40 righe (<150 righe target).
  - `src/App.tsx`: 440 righe (<500 righe target).
- **Conformità Standard**: OKF v0.2 e Protocollo Epistemico Cekikj pienamente rispettati.
