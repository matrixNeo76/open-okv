---
okf_version: "0.2"
title: "Piano Operativo e Roadmap di Implementazione: Evoluzione Funzionale Knowledge Vault 2026"
type: "guide"
domain: "Software Engineering & Systems Architecture"
tags:
  - "okf"
  - "guide"
  - "implementation-plan"
  - "roadmap"
  - "mcp-server"
  - "refactoring"
  - "server-sent-events"
  - "knowledge-graph"
  - "bitemporal"
entities:
  - name: "Knowledge Vault"
    type: "system"
    description: "Piattaforma autonoma di gestione della conoscenza tecnica strutturata conforme allo standard OKF v0.2 e alla Trilogia Cekikj."
  - name: "Model Context Protocol"
    type: "protocol"
    description: "Standard aperto ideato da Anthropic per connettere modelli e ambienti di sviluppo (Claude Desktop, Cursor) a fonti di contesto esterne."
  - name: "Google Gemini 3.7 Flash"
    type: "model"
    description: "Modello primario per l'esecuzione di tool-use rigoroso, structured JSON output e reasoning multi-agente con latenza ultra-bassa."
  - name: "Google Cloud Firestore"
    type: "database"
    description: "Database NoSQL bitemporale e realtime multi-dispositivo con regole di sicurezza restrittive per tenant UID."
  - name: "Server-Sent Events"
    type: "transport"
    description: "Protocollo HTTP unidirezionale persistente per il flusso in tempo reale dei passaggi di reasoning degli agenti verso il client."
  - name: "D3.js Graph Visualizer"
    type: "engine"
    description: "Motore di visualizzazione topologica a forza per nodi, cluster concettuali e archi relazionali integrato nel Vault."
  - name: "IndexedDB"
    type: "storage"
    description: "Storage locale client-side ad alta capienza per cache offline e indici di embedding sintetici."
relations:
  - targetTitle: "Specifica Tecnica di Evoluzione Architetturale e Funzionale: Knowledge Vault 2026"
    relationType: "implements"
    weight: 1.0
    description: "Traduce i requisiti e i contratti architetturali in fasi esecutive ordinate per priorità e rischio."
  - targetTitle: "Specifica di Conformità Architetturale: Trilogia Cekikj (Knowledge Layer, Typed Tools e Contradiction Gate)"
    relationType: "extends"
    weight: 0.95
    description: "Applica i vincoli hard bounds alle nuove funzionalità di streaming e alle API per agenti esterni."
  - targetTitle: "Piano di Sviluppo: Modulo Knowledge con OKF v0.2"
    relationType: "rel:implements"
    weight: 0.90
    description: "Fornisce la guida operativa per la manutenzione e l'arricchimento del corpus documentale del Vault."
---

# Piano Operativo e Roadmap di Implementazione: Evoluzione Funzionale Knowledge Vault 2026

> **Stato**: In attesa di approvazione dell'Utente  
> **Obiettivo**: Pianificazione sequenziale, test di conformità e piano di rollback per le nuove funzionalità e i miglioramenti architetturali del Knowledge Vault.

---

## 1. Quadro di Priorità e Analisi Rischi / Rendimento

Per garantire stabilità operativa, zero regressioni e conformità alle regole di sicurezza, il piano è articolato in **4 Fasi Successive**:

| Fase | Iniziativa | Priorità | Complessità | Impatto Utente |
|---|---|---|---|---|
| **Fase 1** | **Refactoring Modulare `useVaultData.ts` & Streaming SSE Agenti** | Alta | Media | Feedback istantaneo, leggibilità codice, manutenibilità |
| **Fase 2** | **Server MCP Nativo (`/api/mcp`) per Cursor & Claude Desktop** | Alta | Media | Interoperabilità esterna, utilizzo del Vault come contesto IDE |
| **Fase 3** | **Potenziamento Topologico Graph D3 & Ricerca Semantica Ibrida** | Media | Media | Navigazione fluida a 60 FPS, ricerca offline a tolleranza di sinonimi |
| **Fase 4** | **Agentic Knowledge Garden, Versioning Git & Audio Overview** | Media | Elevata | Espansione autonoma del grafo, versioning collaborativo, sintesi vocale |

---

## 2. Dettaglio Operativo delle Fasi di Implementazione

### FASE 1: Modularizzazione del Data Layer & Streaming SSE in Tempo Reale

#### Task 1.1: Decomposizione di `useVaultData.ts`
1. **Creazione Micro-Hooks** in `/src/hooks/vault/`:
   - `useVaultFirestoreSync.ts`: isola la subscription a Firestore, la gestione dell'utente attivo e la transizione a stato offline.
   - `useVaultConflictResolver.ts`: gestione automatica e manuale dei conflitti con calcolo dei diff e snapshot di sicurezza.
   - `useVaultMutations.ts`: funzioni per `handleManualAdd`, `handleUpdateResource`, `handleDeleteResource`, `handleToggleFavorite`, `handleUpdateReadingProgress`.
   - `useVaultAuditTrail.ts`: monitoraggio continuo delle chiamate a `setResources` e integrazione con `vaultSyncAudit.ts`.
2. **Aggiornamento Facade `useVaultData.ts`**:
   - Ricomposizione dell'interfaccia unica senza alterare alcun tipo esportato né causare breaking changes per `App.tsx`.
3. **Verifica e Test**:
   - Esecuzione `lint_applet` e test di mount/unmount per accertare l'assenza di loop di re-render.

#### Task 1.2: Endpoint SSE `/api/vault/agentic-query-stream`
1. **Backend Implementation (`server/routes/vaultRoutes.ts`)**:
   - Creazione della route GET/POST con impostazione header:
     ```typescript
     res.setHeader("Content-Type", "text/event-stream");
     res.setHeader("Cache-Control", "no-cache");
     res.setHeader("Connection", "keep-alive");
     ```
   - Strumentazione di `executeAgenticVaultQuery` per invocare un callback `onProgressStep(step: AgentTraceStep)` ad ogni avanzamento.
2. **Frontend Integration (`VaultIntelligenceDrawer.tsx`)**:
   - Sostituzione della chiamata `fetch` sincrona con un lettore `ReadableStream` o `EventSource`.
   - Animazione fluida della timeline degli agenti man mano che i passaggi vengono completati (Orchestrator ➔ Navigator ➔ Analyst ➔ Grounding Verifier).

---

### FASE 2: Implementazione del Server MCP (Model Context Protocol)

#### Task 2.1: Router MCP su Backend Express (`server/routes/mcpRoutes.ts`)
1. **Definizione Schema JSON-RPC 2.0**:
   - Metodo `initialize`: handshake con dichiarazione delle capabilities (`resources`, `tools`, `prompts`).
   - Metodo `resources/list`: restituzione dell'elenco completo delle risorse OKF v0.2 indicizzate nel Vault.
   - Metodo `resources/read`: restituzione del contenuto Markdown grezzo con frontmatter YAML per una risorsa specifica `uri: "vault://resource/{id}"`.
   - Metodo `tools/list`: esposizione degli 8 Typed Tools Cekikj (`search_vault`, `traverse_graph`, `verify_grounding`, `check_contradictions`, ecc.).
   - Metodo `tools/call`: esecuzione controllata del tool sul backend e restituzione del risultato formattato.
2. **Configurazione Endpoint**:
   - Montaggio in `server.ts` su `/api/mcp` per chiamate standard e `/api/mcp/sse` per connessioni persistenti.
3. **Generazione File di Configurazione per Client Esterni**:
   - Creazione di un endpoint helper `/api/mcp/config` che genera automaticamente la configurazione pronta per il file `claude_desktop_config.json` o `.cursor/mcp.json`.

---

### FASE 3: Potenziamento del Knowledge Graph D3 & Ricerca Ibrida

#### Task 3.1: Ottimizzazione e Nuove Viste per `KnowledgeGraph.tsx`
1. **Modalità Ego-Graph (Vicinato Focalizzato)**:
   - Aggiunta di un toggle "Visualizza Solo Connessioni Dirette (1-2 Hop)".
   - Quando un nodo viene selezionato, i nodi esterni al raggio 2 vengono nascosti o resi semitrasparenti con transizione CSS D3 fluida.
2. **Spatial Hashing & Collision Quadtree**:
   - Riscrittura del loop di collisione con Quadtree D3 per abbattere il costo computazionale da O(N²) a O(N log N).
3. **Radar Minimap**:
   - Componente SVG miniaturizzato in sovrimpressione nell'angolo inferiore destro con riquadro di navigazione interattivo.

#### Task 3.2: Ricerca Ibrida Locale (Client-Side Vector + BM25F)
1. **Generatore di Hash Vettoriali Leggeri**:
   - Modulo client `src/lib/vectorSearch.ts` con tokenizer semantico e calcolo compatto di vettori per ogni scheda OKF salvato in IndexedDB.
2. **Fusione dei Risultati (Reciprocal Rank Fusion - RRF)**:
   - Aggiornamento di `filterAndRankResources` in `searchEngine.ts` per combinare il punteggio lessicale BM25F e la similarità coseno vettoriale.
   - Risultato: tolleranza ai sinonimi e ricerca istantanea a latenza <15ms offline.

---

### FASE 4: Autonomous Knowledge Garden, Versioning Git & Audio Overview

#### Task 4.1: Agentic Knowledge Garden (Link Discovery Continuo)
1. **Background Analyzer**:
   - Endpoint `/api/vault/discover-links` che analizza le entità canoniche condivise tra nodi privi di relazioni reciproche.
2. **UI di Revisione dei Suggerimenti**:
   - Drawer o banner dedicato nello StatsBanner: *"Identificate 4 potenziali relazioni tra schede non connesse. Esamina e Approva"*.

#### Task 4.2: Git-Like Versioning & Sincronizzazione con GitHub
1. **Diff Semantico Visuale**:
   - Integrazione nel `KnowledgeReader.tsx` di una scheda "Cronologia Versioni / Snapshot Diff" con evidenziazione grafica a colori (linee aggiunte in verde, rimosse in rosso).
2. **GitHub Repository Sync**:
   - Sincronizzazione atomica opzionale della cartella `.okf` con un branch GitHub tramite GitHub REST API.

#### Task 4.3: Interactive Audio Overview (Gemini Speech/TTS)
1. **Endpoint Sintesi Dialogica `/api/vault/audio-overview`**:
   - Generazione dello script e streaming audio per un dossier o per una singola risorsa complessa.
2. **Player Audio Minimale Integrato**:
   - Controlli di riproduzione nel `KnowledgeReader` con visualizzazione sincronizzata dei takeaway testuali.

---

## 3. Protocollo di Convalida, Verifica e Rollback

1. **Step di Verifica Continua**:
   - Ad ogni passaggio, eseguire `lint_applet` per verificare l'assenza di errori TypeScript (`tsc --noEmit`).
   - Eseguire `compile_applet` prima di considerare completata ogni fase.
2. **Strategia di Rollback**:
   - Ogni nuovo modulo viene introdotto con un feature flag o con architettura additiva (nessuna modifica distruttiva alle route o alle API correnti).
   - In caso di anomalie impreviste, il fallback alle implementazioni precedenti è istantaneo commutando i flag o le rotte di default.

---

## 4. Richiesta di Conferma dell'Utente

I documenti specificativi sono stati formalizzati e persistiti nel Vault in aderenza rigorosa allo standard OKF v0.2.  
**Nessuna modifica funzionale al codice sorgente verrà apportata fino alla ricezione della conferma esplicita dell'utente.**
