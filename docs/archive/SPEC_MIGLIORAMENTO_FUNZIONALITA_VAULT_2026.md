---
okf_version: "0.2"
title: "Specifica Tecnica di Evoluzione Architetturale e Funzionale: Knowledge Vault 2026"
type: "specification"
domain: "Knowledge Systems & Epistemic Architecture"
tags:
  - "okf"
  - "specification"
  - "architecture-evolution"
  - "mcp-server"
  - "streaming-sse"
  - "hybrid-retrieval"
  - "knowledge-graph-d3"
  - "cekikj-epistemic"
  - "bitemporal-versioning"
entities:
  - name: "Knowledge Vault"
    type: "system"
    description: "Piattaforma autonoma di gestione della conoscenza tecnica strutturata conforme allo standard OKF v0.2 e alla Trilogia Cekikj."
  - name: "Model Context Protocol"
    type: "protocol"
    description: "Standard aperto ideato da Anthropic per connettere modelli e ambienti di sviluppo (Claude Desktop, Cursor) a fonti di contesto esterne."
  - name: "Google Gemini 3.7 Flash"
    type: "model"
    description: "Motore primario di ragionamento generativo e tool-calling rigoroso a bassissima latenza del backend del Vault."
  - name: "Google Cloud Firestore"
    type: "database"
    description: "Database NoSQL bitemporale e realtime multi-dispositivo con regole di sicurezza restrittive per tenant UID."
  - name: "D3.js Graph Visualizer"
    type: "engine"
    description: "Motore di visualizzazione topologica per l'esplorazione dei cluster di concetti e l'attraversamento di archi relazionali tipizzati."
  - name: "Server-Sent Events"
    type: "transport"
    description: "Protocollo HTTP unidirezionale persistente per il flusso in tempo reale dei passaggi di reasoning degli agenti verso il client."
  - name: "Hybrid Search Engine"
    type: "subsystem"
    description: "Modulo di indicizzazione congiunta lessicale (BM25F) e semantica (vettoriale compatto) a latenza sub-millisecondo."
  - name: "Bitemporal Versioning Engine"
    type: "governance"
    description: "Tracciamento separato di Valid Time (validità fattuale dell'asserzione) e Transaction Time (scrittura nel Vault)."
relations:
  - targetTitle: "Specifica di Conformità Architetturale: Trilogia Cekikj (Knowledge Layer, Typed Tools e Contradiction Gate)"
    relationType: "extends"
    weight: 0.98
    description: "Evolve i contratti dei Typed Tools e del Contradiction Gate integrando il trasporto SSE e l'interfaccia MCP nativa."
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "governs"
    weight: 0.95
    description: "Stabilisce i nuovi contratti di interfaccia e sicurezza per agenti esterni che interrogano il Vault via MCP o REST."
  - targetTitle: "Vault Intelligence Query Engine — Multi-Agent Orchestrator"
    relationType: "refines"
    weight: 0.92
    description: "Formalizza il protocollo di streaming a eventi incrementali e la decomposizione asincrona della trace multi-agente."
---

# Specifica Tecnica di Evoluzione Architetturale e Funzionale: Knowledge Vault 2026

> **Stato**: Proposta Esecutiva per Revisione & Conferma  
> **Autore**: AI Architecture & System Engineer Agent  
> **Standard**: OKF v0.2 & Trilogia Cekikj (Knowledge Layer, Typed Tools, Hard Bounds)  
> **Ambito**: Backend Express, Frontend React 18 / Vite, Persistenza Ibrida Firestore/Atomica, Motore Multi-Agente

---

## 1. Executive Summary & Diagnostica dello Stato Attuale

Il **Knowledge Vault** costituisce un'infrastruttura di conoscenza avanzata progettata per ingurgitare, curare, correlare topologicamente e interrogare risorse tecniche (specifiche OKF, repository GitHub, server MCP, paper accademici, guide di troubleshooting e direttive operative).

L'audit approfondito condotto sull'intera codebase (backend Express, frontend React, librerie di persistenza e orchestrazione multi-agente) ha evidenziato fondamenta eccezionalmente solide:
1. **Conformità OKF v0.2**: Parsing e serializzazione rigorosi con frontmatter YAML, entità tipizzate e archi relazionali orientati.
2. **Architettura Epistemica Cekikj**: Dual-Layer Store, 8 Typed Tools con semantica di rifiuto deterministico (`insufficient: true`), Contradiction Gate bitemporale e Grounding Verifier a passaggio singolo.
3. **Resilienza del Dato Multi-Livello**: Salvataggi atomici con safe-snapshots a rotazione su file system backend (`/data/vault-backup.json`), sincronizzazione Firestore isolata per UID con audit trail anti-stale-overwrite (`vaultSyncAudit.ts`) e cache IndexedDB offline.
4. **Orchestrazione Multi-Agente**: Pipeline dedicate per Ingestion, Query e Backup supportate da un pool dinamico di modelli Gemini (`gemini-3.7-flash`, `gemini-flash-latest`, `gemini-3.1-flash-lite`).

Tuttavia, l'espansione del corpus informativo e l'esigenza di interoperabilità con IDE moderni (Cursor, Windsurf, Claude Desktop) richiedono un salto qualitativo. La presente specifica definisce i requisiti, i contratti di interfaccia e le architetture per **4 Macro-Evoluzioni delle Funzionalità Esistenti** e **4 Nuove Funzionalità ad Alto Valore Strategico**.

---

## 2. Ottimizzazione e Potenziamento delle Funzionalità Esistenti

### 2.1 Streaming Server-Sent Events (SSE) per la Pipeline Multi-Agente
- **Problema Attuale**: L'endpoint `/api/vault/agentic-query` opera in modalità batch sincrona (request-response). Quando l'Orchestrator invoca i sotto-agenti (*Graph Navigator*, *Deep Analyst*, *Grounding Verifier*), l'utente nel client attende fino a 4-8 secondi prima di ricevere l'intero blocco di risposta.
- **Specifica di Miglioramento**:
  - Implementazione dell'endpoint `/api/vault/agentic-query-stream` basato su protocollo standard **Server-Sent Events (`text/event-stream`)**.
  - Flusso di eventi tipizzati emessi in tempo reale:
    1. `event: plan_generated`: emette il piano di decomposizione dell'intento dell'Orchestrator (<400ms).
    2. `event: agent_trace_step`: emette ogni singolo passaggio di navigazione topologica, lettura chunk o tool call appena completato.
    3. `event: grounding_check`: notifica lo stato del Contradiction Gate e della verifica di groundedness.
    4. `event: token_stream`: streaming incrementale del markdown finale di risposta.
    5. `event: completed`: metadati finali (risorse citate, cluster grafo D3, metriche di latenza e token).
  - Gestione automatica del fallback: se il browser o la rete interrompe la connessione SSE, il client riconnette con l'header `Last-Event-ID` o ricade elegantemente sulla REST call classica.

### 2.2 Modularizzazione Architetturale del Monolito `useVaultData.ts`
- **Problema Attuale**: Il file `/src/hooks/useVaultData.ts` ha raggiunto oltre 1740 righe, aggregando responsabilità eterogenee (listener Firestore realtime, calcolo del diff a 3 vie, storage locale, preferiti, avanzamento lettura, audit log e recupero emergenza).
- **Specifica di Miglioramento**:
  - Decomposizione architetturale secondo il pattern **Facade & Specialized Micro-Hooks**:
    - `useVaultFirestoreSync.ts`: gestione esclusiva della subscription `onSnapshot`, gestione permessi/quota e fallback offline.
    - `useVaultConflictResolver.ts`: logica di merge a 3 vie, calcolo discrepance report e gestione snapshot di sicurezza.
    - `useVaultResourceMutations.ts`: mutazioni atomiche ottimistiche (add, update, delete, favorite, reading progress).
    - `useVaultAuditTrail.ts`: monitoraggio in tempo reale di stale overwrites e metriche di coerenza locale-remoto.
    - `useVaultData.ts`: facciata snella (<180 righe) che espone la medesima API contrattuale per garantire compatibilità al 100% con tutti i componenti React consumatori.

### 2.3 Evoluzione del Motore Topologico Graph D3 (`KnowledgeGraph.tsx`)
- **Problema Attuale**: La simulazione fisica di D3 su grafi con oltre 100 nodi e numerosi archi genera calcoli O(N²) su ogni tick, con rischio di calo di framerate su dispositivi mobili e affollamento visivo dei cluster.
- **Specifica di Miglioramento**:
  - **Filtro ad Anelli Concentrici (Ego-Graph)**: modalità "Vista Focalizzata" che, dato un nodo selezionato, mostra unicamente il suo vicinato di raggio 1 o 2 hop, sfumando il resto del grafo (Hard Bound Cekikj).
  - **Quadtree Collision & Spatial Hashing**: ottimizzazione del tick di collisione per garantire 60 FPS costanti.
  - **Minimappa Radar Interattiva**: visualizzatore panoramico in basso a destra con viewport box trascinabile.
  - **Edge Bundling per Relazioni Tipizzate**: raggruppamento visivo degli archi con colori semantici differenziati (verde per `extends`/`implements`, ambra per `governs`/`constrains`, rosso tratteggiato per `conflicts_with`).

### 2.4 Motore di Ricerca Semantica Ibrida Locale (Client-Side Vector + BM25F)
- **Problema Attuale**: La ricerca testuale attuale combina filtri lessicali e punteggi per parole chiave. Se l'utente digita un sinonimo o un concetto formulato diversamente, la risorsa non viene trovata a meno di non invocare l'agente Gemini Cloud.
- **Specifica di Miglioramento**:
  - Implementazione di un motore di embedding ultraleggero in-browser tramite Web Worker:
    - Pre-calcolo o salvataggio in IndexedDB di vettori sintetici di 384/256 dimensioni per ogni scheda OKF.
    - Calcolo istantaneo di similarità coseno congiunto a BM25F lessicale.
    - Latenza di ricerca: **<15ms**, completamente offline, a costo computazionale zero per le quote cloud.

---

## 3. Nuove Funzionalità ad Alto Valore Aggiunto

### 3.1 Server MCP Nativo (Model Context Protocol) su `/api/mcp`
- **Descrizione**: Esposizione di un endpoint JSON-RPC 2.0 conforme allo standard **Model Context Protocol (MCP)** di Anthropic per trasformare il Knowledge Vault in un server di contesto interrogabile direttamente da **Cursor**, **Windsurf** o **Claude Desktop**.
- **Risorse e Strumenti Esposti dal Server MCP**:
  1. `mcp/resources/list`: elenca tutte le specifiche, concetti e guide OKF v0.2 del Vault con metadati, entità e tag.
  2. `mcp/resources/read`: restituisce il documento Markdown integrale con frontmatter YAML validato.
  3. `mcp/tools/search_vault`: esecuzione della ricerca semantica ibrida sulle risorse indicizzate.
  4. `mcp/tools/traverse_graph`: navigazione degli archi relazionali fino a depth 2.
  5. `mcp/tools/verify_grounding`: validazione formale di un claim tecnico rispetto ai chunk della conoscenza archiviata.
  6. `mcp/tools/check_contradictions`: interrogazione del Contradiction Register prima di generare codice contrastante.
- **Modalità di Trasporto**: Endpoint HTTP POST con supporto a stream SSE `/api/mcp/sse`, protetto da header `X-Vault-Auth` o token di sessione locale.

### 3.2 Generatore di Audio Overview & Briefing Vocale Sintetico (Stile NotebookLM)
- **Descrizione**: Creazione di briefing audio compatti e conversazionali a partire da una o più risorse del Vault o dall'intero Knowledge Dossier.
- **Architettura**:
  - L'Orchestrator sintetizza uno script a due voci: "Host Guida" (approccio concettuale e sistemico) e "Tech Specialist" (dettagli di implementazione, codice e vincoli).
  - Backend integration con Gemini Speech/TTS (`gemini-2.0-flash` o Google Cloud TTS API) per generare lo stream audio AAC/MP3.
  - Interfaccia nel Knowledge Reader con player audio miniaturizzato: timeline interattiva, regolatore di velocità (1x, 1.25x, 1.5x) e visualizzazione dinamica dei paragrafi trattati in tempo reale.

### 3.3 Agentic Knowledge Garden & Continuous Link Discovery
- **Descrizione**: Modulo di intelligenza background che individua i "nodi orfani" (schede con meno di 2 relazioni ontologiche) e suggerisce proattivamente archi logici validati.
- **Funzionamento**:
  - Scansione notturna o su richiesta dell'utente delle entità condivise tra documenti diversi.
  - Proposta automatica di nuove triple relazionali con grado di confidenza:
    - *Es: La scheda "Architecture Cekikj" e "Vault Sync Audit" condividono l'entità "Bitemporal Store" -> suggerito arco `rel:implements` con confidenza 0.94*.
  - Dialogo interattivo per l'utente ("Accetta suggerimento", "Rifiuta", "Modifica peso").

### 3.4 Git-Like Versioning & Sincronizzazione Bidirezionale con GitHub
- **Descrizione**: Possibilità di sincronizzare la cartella delle risorse del Vault direttamente con una repository GitHub remota (es. cartella `/vault-docs/` in un branch dedicato).
- **Funzionalità Chiave**:
  - **Commit Automatico o Manuale**: salvataggio di ogni risorsa come file `.md` fisico con frontmatter OKF v0.2.
  - **Diff Semantico Visuale nel Reader**: comparatore side-by-side che evidenzia entità aggiunte, tag rimossi o modifiche al corpo del testo rispetto al commit o snapshot precedente.
  - **Pull Remoto**: importazione automatica di modifiche apportate esternamente via editor Markdown standard (es. Obsidian, VS Code).

---

## 4. Requisiti Non Funzionali & Vincoli di Sistema

1. **Sicurezza e Isolamento Cloud**:
   - Nessuna chiave privata o segreto esposto al client; tutte le credenziali risiedono sul server Express (`process.env`).
   - Rispetto ferreo delle regole di sicurezza Firestore: query filtrate con `where("userId", "==", uid)`.
2. **Performance e Latenza**:
   - Time-to-First-Token (TTFT) via SSE < 800ms.
   - Overhead di memoria del server Express per l'indicizzazione locale < 80MB.
3. **Porta e Networking**:
   - Mantenimento vincolante della porta `3000` bindata su `0.0.0.0` (requisito invalicabile dell'infrastruttura Cloud Run).
4. **Compatibilità Backward Totale**:
   - Nessuna rottura dello standard OKF v0.2 né dei contratti esistenti utilizzati da componenti come `Header`, `CaptureBar`, `ResourceTable` o `KnowledgeReader`.
