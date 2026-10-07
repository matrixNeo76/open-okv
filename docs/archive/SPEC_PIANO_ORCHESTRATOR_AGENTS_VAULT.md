---
okf_version: "0.2"
id: "spec-vault-orchestrator-agents-v1"
title: "Specifica & Piano: Vault Intelligence Query Engine — Multi-Agent Orchestrator con Skill Specializzate & Bounded Grounding"
type: "specification"
domain: "knowledge-orchestration"
tags:
  - "multi-agent-system"
  - "orchestrator"
  - "vault-intelligence"
  - "cekikj-architecture"
  - "okf-v0.2"
  - "graph-rag"
  - "agentic-skills"
entities:
  - name: "Vault Orchestrator"
    type: "agent"
    description: "Agente coordinatore centrale responsabile della decomposizione dell'intento, pianificazione della strategia di recupero, dispatching ai sotto-agenti e composizione finale."
  - name: "Graph Navigator Agent"
    type: "agent"
    description: "Agente specializzato nell'esplorazione topologica del grafo della conoscenza OKF, calcolo delle correlazioni di secondo grado e percorsi tra entità."
  - name: "Deep Content Analyst Agent"
    type: "agent"
    description: "Agente addetto all'analisi semantica comparativa dei contenuti estesi Markdown, estratti di paper e documentazione tecnica."
  - name: "Code & Implementation Agent"
    type: "agent"
    description: "Agente verticale per il parsing, correlazione e contestualizzazione di repository GitHub, server MCP e specifiche di codice."
  - name: "Grounding Verifier Agent"
    type: "agent"
    description: "Agente di guardia epistemica conforme ai principi Cekikj (Zero-Guessing, verifica delle fonti, Contradiction Gate e refusal deterministico)."
  - name: "Open Knowledge Format"
    type: "standard"
    description: "Standard OKF v0.2 che formalizza metadati, ontologia, entità e relazioni bitemporali per tutte le risorse del Vault."
  - name: "D3.js Graph Visualizer"
    type: "engine"
    description: "Motore di visualizzazione topologica a forza per nodi, cluster concettuali e archi relazionali integrato nel Vault."
  - name: "Google Gemini 3.7 Flash"
    type: "model"
    description: "Modello primario per l'esecuzione di tool-use rigoroso, structured JSON output e reasoning multi-agente con latenza ultra-bassa."
relations:
  - targetTitle: "Architettura Cekikj (Zero-Guessing Knowledge Layer)"
    relationType: "rel:extends"
    weight: 0.95
    description: "Eredita i vincoli hard bounds (max 8 step, max 2 hop) e la validazione del Contradiction Register."
  - targetTitle: "Piano di Sviluppo: Modulo Knowledge con OKF v0.2"
    relationType: "rel:implements"
    weight: 0.90
    description: "Utilizza l'ontologia e i metadati OKF per il retrieval ibrido semantico e topologico."
---

# Specifica & Piano Operativo: Vault Intelligence Query Engine

> **Architettura Multi-Agente con Orchestrator Centrale, Agenti Verticali e Skill Epistemiche per l'Interrogazione Avanzata del Knowledge Vault**  
> **Versione**: 1.0.0 — **Data**: Settembre 2026 — **Standard di Riferimento**: OKF v0.2 & Trilogia Cekikj

---

## 1. Visione e Obiettivi di Sistema

Il **Knowledge Vault** ospita attualmente un patrimonio eterogeneo di **108+ risorse** (repository GitHub, server MCP, paper accademici, concetti architetturali OKF, guide pratiche e fix di troubleshooting).

Mentre l'Omnibar corrente è ottimizzata per il filtraggio lessicale istantaneo e la CaptureBar per l'ingestione di nuovi dati, l'utente necessita di uno strumento capace di rispondere a **interrogazioni concettuali ad alta complessità**, quali:
- *"Mostrami tutte le risorse che trattano di orchestrazione multi-modello e spiegami come interagiscono con i server MCP nel nostro archivio."*
- *"Quali architetture nel Vault offrono strategie di caching locale e quali repository contengono codice già pronto?"*
- *"Esistono discrepanze o approcci contrastanti tra le note di memoria e i paper archiviati?"*

Per rendere questa funzionalità realmente potente ed evitare risposte generiche, allucinate o superficiali, la soluzione si basa su:
1. **Riutilizzo e Amplificazione delle Infrastrutture Esistenti**: sfruttare i metadati OKF v0.2, il grafo relazionale D3, l'indice testuale multi-campo e i 3 livelli di storage.
2. **Architettura a 5 Agenti Diretti da un Orchestrator**: separazione dei compiti cognitivi tra specialisti di grafo, analisti di contenuto, esperti di codice e controllori di consistenza logica.
3. **Skill Formalizzate (Tool-Calling Typed)**: micro-capacità computazionali invocate deterministicamente.
4. **Interfaccia Utente Non Invasiva (Floating Intelligence Drawer)**: un pulsante volatile discreto e una finestra slide-over che consentono la consultazione multi-turno senza perdere il contesto visivo del Vault.

---

## 2. Architettura Multi-Agente & Orchestrator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      UTENTE (Floating Intelligence Drawer)                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Prompt / Query Complessa
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CENTRAL VAULT ORCHESTRATOR AGENT                         │
│  - Decomposizione dell'Intento & Query Routing                              │
│  - Pianificazione Strategica della Ricerca (Graph vs. Content vs. Code)     │
│  - Coordinamento Esecutivo dei Sotto-Agenti                                 │
└───────┬───────────────────┬───────────────────┬───────────────────┬─────────┘
        │                   │                   │                   │
        ▼                   ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    GRAPH     │    │     DEEP     │    │    CODE &    │    │  GROUNDING   │
│  NAVIGATOR   │    │   CONTENT    │    │ IMPLEMENTAT. │    │   VERIFIER   │
│    AGENT     │    │   ANALYST    │    │    AGENT     │    │    AGENT     │
├──────────────┤    ├──────────────┤    ├──────────────┤    ├──────────────┤
│ Skill:       │    │ Skill:       │    │ Skill:       │    │ Skill:       │
│ - HopSearch  │    │ - ChunkMatch │    │ - RepoProbe  │    │ - ZeroGuess  │
│ - ClustRoute │    │ - CrossSynth │    │ - McpSchema  │    │ - ContraGate │
│ - DegreeRank │    │ - Bitemporal │    │ - ScriptEval │    │ - ClaimAudit │
└───────┬──────┘    └───────┬──────┘    └───────┬──────┘    └───────┬──────┘
        │                   │                   │                   │
        └───────────────────┴─────────┬─────────┴───────────────────┘
                                      │ Raccolta Evidenze Verificate
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│             CONTRADICTION GATE & GROUNDING AUDIT (Cekikj Engine)            │
│  - Verifica rigida delle citazioni sulle 108 risorse reali                  │
│  - Rifiuto deterministico (insufficient: true) se i dati mancano             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Sintesi Finale con Citazioni Cliccabili
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              RISPOSTA STRUTTURATA NEL CASSETTO DI CONSULTAZIONE             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Ruoli degli Agenti e Matrice delle Competenze

### A. Central Vault Orchestrator
- **Obiettivo**: Analizzare il bisogno dell'utente, stabilire se la richiesta è tassonomica (dominio/argomento), comparativa (differenze tra framework), tecnica (implementazione di codice) o epistemica (verità/contraddizioni).
- **Strategia**: Attiva parallelamente solo i sotto-agenti rilevanti, imponendo un limite di **massimo 8 round di tool-call complessivi** e un timeout rigido di 15 secondi.
- **Output**: Sintetizza le risultanze parziali in un testo fluido, organizzato in sezioni logiche e arricchito da badge interattivi che rimandano alle schede delle risorse.

### B. Graph Navigator Agent
- **Obiettivo**: Esplorare le relazioni topologiche della rete di conoscenza OKF.
- **Skill Chiave**:
  1. `traverse_graph_hops(startEntity: string, maxHops: number)`: attraversa gli archi `rel:depends_on`, `rel:implements`, `rel:references` entro il limite di 2 hop.
  2. `find_cluster_by_domain(domain: string)`: individua tutte le risorse afferenti a un dominio concettuale (es. `ai-systems`, `distributed-systems`).
  3. `calculate_centrality(entities: string[])`: valuta i nodi più autorevoli o maggiormente connessi rispetto al tema indagato.

### C. Deep Content Analyst Agent
- **Obiettivo**: Analizzare in dettaglio il corpo Markdown (`metadata.markdownContent`), i paper scientifici e le specifiche OKF.
- **Skill Chiave**:
  1. `scan_markdown_chunks(resourceIds: string[], queryPattern: string)`: estrae i paragrafi pertinenti e i capitoli tecnici rilevanti.
  2. `cross_document_comparison(docA: string, docB: string)`: confronta asserzioni teoriche o metodologiche tra due o più guide del Vault.
  3. `extract_bitemporal_state(docId: string)`: distingue tra versione originaria (`created_at`) e aggiornamenti tecnici (`updated_at`).

### D. Code & Implementation Specialist Agent
- **Obiettivo**: Interrogare il patrimonio applicativo (57 repository GitHub archiviati, 2 server MCP e guide di configurazione).
- **Skill Chiave**:
  1. `inspect_github_repo_metadata(repoId: string)`: esamina dipendenze, stack tecnologico e architettura del repository.
  2. `query_mcp_capabilities(serverId: string)`: verifica gli schemi dei tool esposti dai server MCP documentati nel Vault.
  3. `extract_code_recipes(resourceIds: string[])`: estrae snippet di codice funzionanti archiviati nelle note e nei file allegati.

### E. Grounding Verifier Agent (Cekikj Epistemic Guard)
- **Obiettivo**: Garantire l'aderenza assoluta alla conoscenza reale dell'archivio (**Zero-Guessing**).
- **Skill Chiave**:
  1. `audit_claims_against_vault(claims: string[], sourceIds: string[])`: controlla che ogni affermazione trovi corrispondenza esatta in un testo del Vault.
  2. `evaluate_contradiction_register(concepts: string[])`: blocca la formulazione di risposte positive se i concetti coinvolti presentano conflitti aperti nel registro delle contraddizioni.
  3. `issue_refusal(missingAspect: string)`: produce una risposta controllata con `insufficient: true` spiegando esattamente cosa è presente e cosa manca nel Vault.

---

## 4. Specifiche di Integrazione delle Funzionalità Esistenti

Il nuovo modulo non reinventa la logica di base, ma fa leva su componenti già collaudati:

| Funzionalità Esistente | Riutilizzo nel Nuovo Motore Multi-Agente |
| :--- | :--- |
| **Indice Multi-Campo (App.tsx)** | Utilizzato dal Content Analyst come primo livello di candidate generation a latenza 0ms. |
| **Grafo D3.js (KnowledgeGraphModal)** | Fornisce la topologia di nodi e archi consultata in tempo reale dal Graph Navigator. |
| **Frontmatter OKF v0.2** | Struttura uniforme per estrarre istantaneamente `domain`, `docType`, `entities` e `relations`. |
| **3-Layer Persistence** | I dati interrogati provengono dalla replica locale ad alta velocità (IndexedDB), garantendo zero chiamate a pagamento verso Firestore per la fase di lettura. |
| **Backend Express (`/api/*`)** | L'endpoint `/api/vault/agentic-query` centralizza le chiamate generative Gemini 3.7 Flash mantenendo isolate le chiavi di sicurezza. |

---

## 5. Specifiche dell'Interfaccia Utente (CaptureBar Unificata & Intelligence Drawer)

### 5.1 Punto di Accesso Unificato nella CaptureBar (Sostituzione del FAB)
- **Posizionamento Ergonomico**: Integrato direttamente nell'angolo destro della **CaptureBar** (`id="capturebar-vault-intelligence-btn"`), eliminando pulsanti duplicati fluttuanti a schermo e unificando il flusso di cattura e consultazione.
- **Aspetto Visivo & Feedback**: Bottone con styling coordinato `#18130B`, bordo dorato `#C5A059`/60, icona `BrainCircuit`, etichetta *"Intelligence"* e pillola per la scorciatoia da tastiera (`⌘K / Ctrl+K`). Quando il drawer è attivo, il pulsante assume fondo dorato `#C5A059` con testo nero a contrasto e glow.
- **Sinergia Operativa Completa**: Specifiche dettagliate, comandi slash (`/ask`, `/note`, `/mcp`, `/paper`, `/fix`) e registrazione vocale push-to-talk sono documentate in `/SPEC_PIANO_CAPTUREBAR_INTELLIGENCE.md`.

### 5.2 Il Cassetto di Consultazione (Slide-Over Drawer)
- **Comportamento**: Si apre da destra con transizione fluida (larghezza 440px su desktop, a schermo intero su mobile), senza oscurare completamente la navigazione retrostante.
- **Componenti Interni**:
  1. **Header del Cassetto**: Titolo *"Vault Intelligence"*, indicatore dei 5 agenti attivi, pulsante di espansione a schermo intero e tasto di chiusura.
  2. **Selettore Modalità di Interrogazione**:
     - *Sintesi Rapida*: risponde estraendo la panoramica concettuale.
     - *Analisi Topologica*: mappa percorsi e correlazioni sul grafo.
     - *Focus Implementativo*: evidenzia codice, repository GitHub e server MCP.
  3. **Feed di Risposta Multi-Turno**:
     - Visualizzazione del ragionamento degli agenti (a scomparsa/accordion: *"Graph Navigator ha esplorato 4 archi... Deep Analyst ha scansionato 3 paper..."*).
     - Testo Markdown arricchito con citazioni numerate o pillole interattive `[ID: Titolo Risorsa]`.
     - Cliccando su una citazione, si apre istantaneamente la scheda dettagliata della risorsa nel Vault.
  4. **Pannello Azioni Rapide a Fine Risposta**:
     - *"Mostra nel Grafo"*: evidenzia nel visualizzatore D3 il cluster estratto dagli agenti.
     - *"Salva come nuova Nota OKF"*: archivia la sintesi direttamente tra le risorse del Vault.
     - *"Scarica Dossier PDF/Doc"*: genera il documento stampabile tramite l'infrastruttura PDF esistente.
  5. **Input Bar Intelligente**:
     - Campo testo per richieste complesse con suggerimenti automatici basati sulla categoria o tag attualmente selezionati nella sidebar.

---

## 6. Piano Operativo di Sviluppo a Fasi (Milestones)

### Fase 1: Backend Agent Engine & Typed Skills
- [ ] Creazione del modulo backend `server/vaultAgents.ts` con implementazione delle skill typed.
- [ ] Creazione dell'endpoint Express `POST /api/vault/agentic-query`.
- [ ] Integrazione del modello `gemini-3.7-flash` con system prompt specializzato per l'Orchestrator e i 4 sotto-agenti.
- [ ] Implementazione del fallback resiliente su `gemini-flash-latest` e gestione timeout rigido a 15s.

### Fase 2: Motore di Grounding Cekikj & Zero-Guessing
- [ ] Implementazione del modulo di audit delle citazioni: ogni affermazione deve fare riferimento a un ID risorsa valido tra le 108 presenti.
- [ ] Controllo del Contradiction Register prima della restituzione della risposta.
- [ ] Validazione del flag `insufficient: true` per quesiti privi di riscontro nell'archivio.

### Fase 3: Componenti UI (FAB & Intelligence Drawer)
- [ ] Creazione del componente `src/components/VaultIntelligenceFab.tsx` per il pulsante volatile.
- [ ] Creazione del componente `src/components/VaultIntelligenceDrawer.tsx` per la slide-over interattiva.
- [ ] Supporto alla scorciatoia globale da tastiera `Cmd/Ctrl + K`.
- [ ] Rendering Markdown delle risposte con pillole interattive cliccabili per aprire il modal della risorsa (`ResourceModal`).

### Fase 4: Integrazione Bi-Direzionale con Grafo e Storage
- [ ] Azione *"Mostra nel Grafo"*: invio del set di nodi correlati alla vista D3 per isolamento visivo del cluster.
- [ ] Azione *"Archivia come Nota OKF"*: generazione automatica del frontmatter YAML conforme per salvare la sintesi come risorsa interna.
- [ ] Azione *"Esporta Dossier"*: conversione della sintesi multi-agente nel formato stampabile PDF/Google Doc.

### Fase 5: Collaudo, Stress Test & Certificazione DoD
- [ ] Esecuzione di 5 test di interrogazione tematica (orchestrazione AI, protocolli MCP, caching, distributed systems, guide OKF).
- [ ] Esecuzione di 2 refusal test deterministici con argomenti non presenti nel Vault per certificare l'assenza di allucinazioni.
- [ ] Verifica del consumo di quote e misurazione della latenza media (< 4 secondi).

---

## 7. Criteri di Rilascio e Definizione di Fatto (DoD)

1. **Zero Exposure delle API Key**: Tutte le elaborazioni generative rimangono confinate nel backend server.
2. **Nessun Impatto Negativo sulla UI Principale**: Il pulsante volatile non interferisce con la griglia, la tabella o il grafo.
3. **Grounding Verificato al 100%**: Ogni risposta complessa elenca almeno una fonte verificata tra le risorse del Vault o dichiara l'insufficienza dei dati.
4. **Piena Conformità OKF v0.2**: Qualsiasi nuova risorsa prodotta o manipolata rispetta rigorosamente lo schema ontologico e topologico.
