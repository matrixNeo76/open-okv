---
okf_version: "0.2"
id: "doc-vault-readme-hub"
title: "Knowledge Vault (OKF v0.2) - Repository di Conoscenza Ontologica"
type: "architecture"
domain: "Knowledge Architecture & Ontological Systems"
tags: ["okf", "readme", "vault", "d3", "firestore", "express", "vite", "gemini-3.7-flash", "cekikj"]
entities:
  - name: "Knowledge Vault"
    type: "technology"
    description: "Repository di conoscenza ontologica, schemi di prompt, toolchain MCP e grafo topologico"
  - name: "Open Knowledge Format v0.2"
    type: "specification"
    description: "Standard aperto per la serializzazione di documentazione tecnica per LLM ed agenti"
  - name: "Cekikj Epistemic Architecture"
    type: "framework"
    description: "Architettura a doppio livello con Typed Tools deterministici e Contradiction Gate"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "documents"
    weight: 1.0
    description: "Documenta lo standard fondante del repository"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "implements"
    weight: 1.0
    description: "Espone l'architettura tecnica e i componenti dell'applicativo"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "references"
    weight: 0.95
    description: "Indica i passi operativi per replicare o clonare il sistema"
---

# Knowledge Vault (OKF v0.2)

> **Repository di Conoscenza Ontologica, Schemi di Prompt, Toolchain MCP e Grafo Topologico Semantico per Sviluppatori ed Agenti IA Autonomi**

[![Standard OKF](https://img.shields.io/badge/Standard-OKF%20v0.2-C5A059.svg)](https://github.com)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205.8-3178C6.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/Framework-React%2019-61DAFB.svg)](https://react.dev/)
[![D3.js](https://img.shields.io/badge/Visualization-D3.js%20v7-F9A03C.svg)](https://d3js.org/)
[![Google Gemini](https://img.shields.io/badge/AI%20Engine-Gemini%203.7%20%2F%202.5%20Flash-8E75B2.svg)](https://ai.google.dev/)
[![Firebase](https://img.shields.io/badge/Database-Cloud%20Firestore-FFCA28.svg)](https://firebase.google.com/)
[![Persistenza Multi-Livello](https://img.shields.io/badge/Storage-3--Layer%20Resilient-2E7D32.svg)](#6--architettura-di-persistenza-continua-a-3-livelli)

---

## 🤖 Guida di Riferimento per LLM ed Agenti Autonomi Esterni

> ⚡ **Prompt di Avvio Rapido**: Per innescare qualsiasi agente o LLM esterno con le istruzioni perfette di lettura e vincoli non negoziabili, copia il prompt pronto all'uso in **[`PROMPT_AGENT_ESTERNO.md`](PROMPT_AGENT_ESTERNO.md)**.

Se sei un modello linguistico (Claude, GPT, Gemini, DeepSeek o agente autonomo) che sta analizzando questo repository per **comprenderlo al 100%, estenderlo o replicarlo**, consulta direttamente i 6 documenti canonici redatti secondo lo standard **OKF v0.2**:

1. 📜 **[`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md)**: La specifica formale, lo schema YAML normativo, la tassonomia dei 6 tipi e le regole di normalizzazione.
2. 🏛️ **[`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md)**: Il blueprint completo: architettura a 3 livelli di storage, motore fisico D3.js a 5 forze e layer epistemico Cekikj.
3. ⚡ **[`docs/INGESTION_PIPELINE_SPEC.md`](docs/INGESTION_PIPELINE_SPEC.md)**: Pipeline di cattura a 5 stadi, estrazione OpenGraph, Gemini 3.7 Flash Structured Output e de-duplicazione con `conflictResolver`.
4. 🛠️ **[`docs/SYSTEM_REPLICATION_GUIDE.md`](docs/SYSTEM_REPLICATION_GUIDE.md)**: Guida passo-passo per il bootstrap, dipendenze, variabili d'ambiente e comandi di build.
5. 🗺️ **[`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)**: Mappa strutturale ragionata di tutte le cartelle, sottocartelle e file di backend e frontend con relative responsabilità.
6. 🛡️ **[`docs/SPEC_PIANO_MITIGAZIONE_CRITICITA_OKF.md`](docs/SPEC_PIANO_MITIGAZIONE_CRITICITA_OKF.md)**: Specifica tecnica e piano di mitigazione di tutte le criticità operative ed architetturali (Circuit Breaker, atomicità e tolleranza guasti).

---

## 🌟 Panoramica & Visione

**Knowledge Vault** è una piattaforma avanzata full-stack concepita per colmare il divario tra la documentazione tecnica tradizionale e le esigenze operative degli **Agenti Autonomi (come Claude Code, Gemini, Copilot)** e degli **Ingegneri del Prompt**.

A differenza dei comuni wiki o bookmark manager statici, Knowledge Vault trasforma ogni informazione (file markdown, repository GitHub, server MCP, prompt di sistema o articoli tecnici) in un **nodo ontologico interconnesso** governato dallo standard aperto **OKF v0.2 (Open Knowledge Format)**. 

Attraverso un **motore fisico a grafo in D3.js**, un'**architettura di persistenza continua a 3 livelli** (Browser, Server locale e Cloud) e l'orchestrazione di **Google Gemini 3.7 / 2.5 Flash**, la piattaforma analizza, categorizza, correla e rende immediatamente interrogabile, resiliente ed esportabile l'intero corpus di conoscenza tecnica.

---

## 🚀 Tutte le Funzionalità dell'Applicativo

### 1. 🧠 Topologia a Grafo Interattiva (D3 Force Simulation)
- **Motore di Layout Fisico a Forze**: Simulazione continua con cariche repulsive dinamiche, prevenzione delle collisioni basata sul grado di connessione e centratura dinamica.
- **Risoluzione Relazionale Multilivello**:
  - 🟡 **Relazioni Ontologiche OKF v0.2 Dirette** (Oro Champagne con freccia direzionale orientata): collegamenti formalmente dichiarati nei frontmatter YAML (es. `governs`, `implements`, `documents`, `powers`, `relates_to`).
  - 🔵 **Entità e Concetti Condivisi** (Ciano Elettrico): riconoscimento automatico di entità ontologiche comuni presenti nei metadati (es. *Anthropic, Claude, Model Context Protocol, TypeScript, React, Firestore*).
  - 🟣 **Citazioni e Menzioni nel Testo** (Viola): scansione semantica del corpo del testo e dei summary per individuare riferimenti incrociati ad altri documenti.
  - 🟠 **Tag Semantici Condivisi** (Ambra con linea tratteggiata): aggregazione per co-occorrenza di etichette tematiche.
  - 🟢 **Dominio & Ambito Comune** (Smeraldo): raggruppamento per settore tecnologico.
- **Modalità Hub Entità (Concept Nodes)**: Pulsante per generare nodi-ponte intermedi che raggruppano visualmente tutti i documenti attorno a un concetto chiave.
- **Etichette Semantiche sulle Linee**: Badge leggibili in tempo reale lungo gli archi con indicazione del tipo di legame.
- **Strumenti di Navigazione**: Zoom progressivo (`+` / `-`), reset vista, centratura automatica, modalità **Schermo Intero (Fullscreen)** e ricerca con filtraggio istantaneo del grafo.

---

### 2. ⚡ Cattura Intelligente & Gemini 3.7 / 2.5 Flash Engine
- **Quick Capture Bar Globale**: Input rapido con ridimensionamento automatico per catturare:
  - *URL generici ed articoli web* (estrazione testo e sintesi automatica).
  - *Repository GitHub* (estrazione owner, repo, comando clone e dipendenze).
  - *Configurazioni e Server MCP* (creazione istantanea di snippet JSON `mcpServers` compatibili con Claude Desktop e Claude Code).
  - *AI Prompts & Skills* (identificazione del ruolo di sistema, modello consigliato e parole chiave di trigger).
  - *Documenti Tecnici OKF v0.2*.
- **Structured JSON Schema via Gemini**: Output rigorosamente tipizzato e validato tramite `@google/genai` TypeScript SDK con latenza minima.
- **Fallback Euristico Locale a Latenza Zero**: Se la connessione o le API esterne sono temporaneamente degradate o limitate da quote, interviene un motore di parsing a regole per garantire continuità di servizio al 100% con latenza 0ms.

---

### 3. 📖 Knowledge Reader & Visualizzatore OKF v0.2
- **Visualizzazione Markdown ad Alta Leggibilità**: Rendering fluido del corpo del documento con formattazione codice, tabelle e badge di stato.
- **Ispezione Metadati & Frontmatter YAML**: Scheda dedicata per visualizzare ed esaminare lo schema YAML puro conforme a OKF v0.2.
- **Scheda "Grafo & Relazioni" nel Reader**:
  - Elenco interattivo di tutte le relazioni ontologiche dichiarate con navigazione diretta al documento collegato con 1 clic.
  - Calcolo automatico della **Matrice di Affinità Semantica** con tutti gli altri documenti presenti nel Vault.
- **Esportazione Istantanea**: Download in formato `.md` standard con frontmatter YAML precompilato o copia del prompt di sistema negli appunti.

---

### 4. 🗂️ Gestione Risorse Multicanale & Visualizzazioni
- **Vista a Griglia (Card)** & **Vista a Tabella Densa**: Visualizzazione ordinabile e filtrabile per tipo di risorsa, data o preferiti.
- **Badge e Dati Specifici per Categoria**:
  - *MCP Server*: Visualizzazione dei tool forniti, protocollo (`stdio`/`sse`), comando eseguibile e snippet di configurazione con pulsante copia rapida.
  - *GitHub Repo*: Metadati su owner, repository e comando di installazione Git.
  - *AI Skill*: Visualizzazione prompt di sistema, modello consigliato (`gemini-2.5-pro`, `claude-3-7-sonnet`) e trigger keywords.
  - *Knowledge Document*: Versione OKF, tipo di documento (`concept`, `architecture`, `guide`, `specification`), entità e relazioni.
- **Filtri Rapidi**: Filtraggio per categoria (*Tutti, OKF Knowledge, MCP Server, GitHub Repo, AI Skills, Articoli*), preferiti (⭐) e per singolo Tag cliccabile.
- **Barra Statistiche di Sistema**: Metriche aggregate in tempo reale con conteggio documenti, server MCP, skill e densità dei collegamenti ontologici.

---

### 5. 📥 Importazione / Upload Documenti OKF
- **Upload Dialog Dedicato**: Supporto per drag & drop di file `.md`, `.txt` o incollamento diretto di testo grezzo.
- **Pipeline di Parsing e Sanitizzazione**: Validazione dei metadati, estrazione automatica dei tag e conversione nello standard OKF prima del salvataggio.

---

### 6. 🛡️ Architettura di Persistenza Continua a 3 Livelli
Per garantire che **nessun dato venga mai perso** (anche in assenza di connessione, con cache del browser svuotata o in caso di esaurimento quote giornaliere del cloud), il Vault implementa un'architettura resiliente a tre livelli:

```
[ Livello 1: Client ]   IndexedDB + LocalStorage (Latenza 0ms, cache persistente nel browser)
         ▲
         │ Sincronizzazione automatica
         ▼
[ Livello 2: Server ]   File locale 'data/vault-backup.json' + 20 Snapshot Storici di rotazione
         ▲
         │ Background Auto-Sync
         ▼
[ Livello 3: Cloud ]    Google Cloud Firestore (Sincronizzazione realtime & sicurezza multi-utente)
```

1. **Livello 1 (Client / Browser)**:
   - Archiviazione immediata in memoria e in **IndexedDB** (`localforage`) con fallback in **LocalStorage**.
   - Avvio istantaneo con latenza di caricamento 0ms.
   - **Safety Shield**: se una query remota restituisce 0 record (es. utente non ancora loggato o sessione provvisoria), lo scudo blocca qualsiasi sovrascrittura distruttiva, preservando i dati locali.
2. **Livello 2 (Server Backend Resiliente)**:
   - Scrittura continua su disco nel file server `data/vault-backup.json` tramite API `/api/vault/backup`.
   - **Sistema di Snapshot Storici**: archiviazione a rotazione delle ultime 20 revisioni con timestamp per consentire il ripristino istantaneo in caso di emergenza.
   - API dedicate: `/api/vault/backup-status`, `/api/vault/snapshots`, `/api/vault/restore-snapshot`.
3. **Livello 3 (Google Cloud Firestore)**:
   - Sincronizzazione reattiva in tempo reale tramite `onSnapshot`.
   - **Auto-Sync in Background**: le nuove risorse acquisite offline o in locale vengono caricate automaticamente su Firestore non appena disponibile la connessione, senza richiedere interventi manuali o finestre bloccanti.
   - **Deduplicazione Intelligente per Firma**: accoppiamento automatico tra ID locali e remoti per URL e Titolo, evitando la creazione di duplicati fittizi.
4. **Pannello di Controllo "Stato Persistenza a 3 Livelli" (`PersistenceStatusModal`)**:
   - Cruscotto interattivo per monitorare in tempo reale lo stato dei 3 livelli, le dimensioni su disco, l'ora dell'ultimo backup e le azioni di sincronizzazione/esportazione.

---

### 7. 📊 Monitoraggio Quote & Telemetria AI/Database (`QuotaMonitorView`)
- **Dashboard Dedicata di Diagnostica Quote**:
  - **Google Cloud Firestore Tracker**: monitoraggio in tempo reale delle operazioni di lettura (`reads`), scrittura (`writes`) ed eliminazione rispetto alle soglie del Free Tier (50.000 letture/giorno).
  - **Conto alla Rovescia Reset Quota**: calcolo preciso del countdown fino alla mezzanotte del fuso orario di riferimento di Google Cloud.
  - **Gemini AI Engine Telemetria**: monitoraggio chiamate API, RPM (Requests Per Minute), RPD (Requests Per Day), TPM (Tokens Per Minute stimati) e latenza media delle risposte.
  - **Registro Eventi & Errori**: storico dettagliato di tutte le operazioni e degli eventuali codici di errore (es. `RESOURCE_EXHAUSTED`, timeout di rete).

---

### 8. 🛠️ Console di Diagnostica & Gestione Account
- **Drawer di Diagnostica Realtime**: Monitoraggio continuo e cronologia degli eventi di sistema con categorie dedicate:
  - `AUTH` (login Google, sessione ospite anonima, UID).
  - `FIRESTORE` (operazioni di read, write, snapshot e sync).
  - `CAPTURE` (analisi input, parsing, estrazione metadati).
  - `GEMINI_AI` (chiamate al modello, token, fallback).
- **Esportazione Completa del Vault**: Download dell'intero archivio in formato JSON conforme OKF v0.2 per backup e migrazione.
- **Inizializzazione Suite Documentale**: Pulsante per pre-caricare l'intera suite documentale di sistema (*README, AGENTS, CLAUDE, GEMINI, ARCHITECTURE, ecc.*) con le relazioni ontologiche predefinite.

---

## 🏛️ Specifiche dello Standard OKF v0.2 (Open Knowledge Format)

Ogni risorsa catalogata nel Vault adotta la seguente struttura di frontmatter YAML:

```yaml
---
okf_version: "0.2"
title: "Titolo Univoco del Documento"
type: "concept" # concept | architecture | guide | specification | tool_description | prompt_skill
domain: "Software Architecture & AI"
tags:
  - "knowledge"
  - "architecture"
  - "d3-graph"
entities:
  - name: "Claude Code"
    type: "tool"
    description: "Agentic CLI tool sviluppato da Anthropic"
  - name: "Cloud Firestore"
    type: "database"
    description: "NoSQL document store reattivo"
relations:
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "governs"
    weight: 0.95
    description: "Definisce il quadro di riferimento per le operazioni"
created_at: "2026-08-29T10:00:00Z"
---

# Titolo Documento

Corpo della documentazione formattato in Markdown con tabelle, blocchi di codice e specifiche tecniche.
```

---

## 🏗️ Architettura & Stack Tecnologico

```
+-----------------------------------------------------------------------------------------+
|                                CLIENT (React 19 + Vite SPA)                             |
|                                                                                         |
|  +---------------------+   +---------------------+   +-------------------------------+  |
|  |   KnowledgeGraph    |   |   KnowledgeReader   |   | QuotaMonitor & Telemetry View |  |
|  |  (D3 Force Network) |   |  (Markdown + OKF)   |   | (Firestore & Gemini Realtime) |  |
|  +----------^----------+   +----------^----------+   +---------------^---------------+  |
|             |                         |                              |                  |
|             +-------------------------+------------------------------+                  |
|                                       |                                                 |
|                   [ React State + IndexedDB Local Cache (Level 1) ]                     |
+---------------------------------------|-------------------------------------------------+
                                        |
           +----------------------------+----------------------------+
           | (Auth & Firestore Sync)                                 | (REST API & Server Backup)
           v                                                         v
+-----------------------+                         +---------------------------------------+
|  Cloud Firestore      |                         |     Express Server (Level 2 Backup)   |
|  (Level 3 Cloud)      |                         |               (server.ts)             |
|                       |                         |                                       |
| - collection("res")   |                         | - /api/vault/backup (data/backup.json)|
| - Security rules UID  |                         | - /api/vault/snapshots (20 revisions) |
| - Realtime onSnapshot |                         | - /api/analyze-resource (Gemini SDK)  |
+-----------------------+                         +-------------------^-------------------+
                                                                      |
                                                                      v
                                                          +-----------------------+
                                                          | Gemini 3.7 / 2.5 Flash|
                                                          |  (Structured Output)  |
                                                          +-----------------------+
```

| Layer | Tecnologie e Librerie |
|---|---|
| **Frontend Framework** | React 19 / 18, TypeScript 5.8, Vite 6 |
| **Data Visualization** | D3.js v7 (`d3-force`, `d3-zoom`, `d3-selection`) |
| **Styling & UI** | Tailwind CSS v4, Lucide React, Framer Motion |
| **Content Rendering** | React Markdown, JetBrains Mono & Instrument Serif |
| **Client Storage (L1)** | IndexedDB (`localforage`), LocalStorage, In-Memory State |
| **Backend & Server (L2)**| Node.js, Express, `vault-backup.json`, rotazione snapshot, `esbuild` |
| **Cloud Storage (L3)** | Google Cloud Firestore (NoSQL realtime) & Firebase Auth |
| **AI Inference** | `@google/genai` TypeScript SDK (Gemini 3.7 Flash & 2.5 Flash) |

---

## 📦 Struttura del Progetto

```
├── .env.example                       # Documentazione variabili d'ambiente (GEMINI_API_KEY)
├── README.md                          # Panoramica completa e documentazione di riferimento
├── AGENTS.md                          # Regole e protocolli operativi per agenti autonomi
├── ACCESS_SPEC.md                     # Specifica di accesso documentale e interoperabilità agenti
├── CLAUDE.md                          # Specifiche per Claude Code e workflow CLI
├── GEMINI.md                          # Linee guida prompt engineering e schema Gemini
├── ARCHITECTURE.md                    # Dettaglio architetturale completo del sistema
├── firestore.rules                    # Regole di sicurezza per Google Cloud Firestore
├── firebase-blueprint.json            # Schema e indici del database Firestore
├── server.ts                          # Server Express con backup endpoints e Vite middleware
├── data/
│   └── vault-backup.json              # File di backup persistente del server (Livello 2)
├── src/
│   ├── main.tsx                       # Entry point React
│   ├── App.tsx                        # Controller applicativo e sincronizzazione a 3 livelli
│   ├── types.ts                       # Interfacce TypeScript e schemi dati OKF v0.2
│   ├── lib/
│   │   ├── firebase.ts                # Inizializzazione Firebase Auth e Firestore
│   │   ├── quotaTelemetry.ts          # Motore di telemetria quote Firestore e Gemini
│   │   ├── conflictResolver.ts        # Algoritmo di riconciliazione e unione sicura
│   │   ├── dateUtils.ts               # Utility per parsing e normalizzazione timestamp
│   │   ├── sampleData.ts              # Suite documentale predefinita OKF v0.2
│   │   └── utils.ts                   # Utility di formattazione e parsing
│   └── components/
│       ├── KnowledgeGraph.tsx         # Motore visualizzazione a grafo topologico D3
│       ├── KnowledgeReader.tsx        # Lettore Markdown & ispettore ontologico
│       ├── CaptureBar.tsx             # Barra di cattura rapida intelligente
│       ├── KnowledgeUploadDialog.tsx  # Modale di upload e parsing documenti OKF
│       ├── ResourceCard.tsx           # Card interattiva con badge per categoria
│       ├── ResourceTable.tsx          # Vista tabellare avanzata
│       ├── ResourceModal.tsx          # Modale dettaglio e modifica risorsa
│       ├── Sidebar.tsx                # Barra laterale di navigazione, filtri e account
│       ├── Header.tsx                 # Intestazione con ricerca, auth e controlli vista
│       ├── StatsBanner.tsx            # Metriche aggregate e KPI della knowledge
│       ├── SyncStatusBanner.tsx       # Banner real-time di stato persistenza e quote
│       ├── PersistenceStatusModal.tsx # Cruscotto di controllo persistenza a 3 livelli
│       ├── QuotaMonitorView.tsx       # Vista analitica monitoraggio quote e telemetria
│       ├── ConflictResolutionModal.tsx# Modale per la verifica e allineamento versioni
│       └── DiagnosticDrawer.tsx       # Console di telemetria e log di sistema
```

---

## ⚡ Guida Rapida di Avvio

### 1. Installazione Dipendenze
```bash
npm install
```

### 2. Configurazione Variabili d'Ambiente
Crea un file `.env` basandoti su `.env.example`:
```env
GEMINI_API_KEY=tuo_api_key_google_gemini
```

### 3. Avvio in Modalità Sviluppo
```bash
npm run dev
```
L'applicazione sarà disponibile su `http://localhost:3000`.

### 4. Controllo Tipi & Build di Produzione
```bash
# Type check con TypeScript
npm run lint

# Build unificata frontend + backend CJS bundle
npm run build

# Avvio del server di produzione
npm run start
```

---

## 🗺️ Roadmap & Evoluzione Epistemica: Architettura Cekikj

Il Knowledge Vault sta evolvendo verso un **Persistent Knowledge Layer Zero-Guessing**, allineandosi ai 5 pilastri della trilogia di Miodrag Cekikj (*Towards Data Science / AI Advances*).

- 📘 **Specifica OKF v0.2 di Riferimento**: [`docs/archive/SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md`](docs/archive/SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md)
- 📋 **Piano Esecutivo e Checklist Dettagliata**: [`docs/archive/PIANO_IMPLEMENTAZIONE_CEKIKJ.md`](docs/archive/PIANO_IMPLEMENTAZIONE_CEKIKJ.md)

### Sintesi delle 8 Fasi Operative:
1. **M1 (Contratti & Tipi)**: Definizione di `EvidenceChunk`, `ContradictionRecord`, `TypedToolEnvelope` (`insufficient: boolean`).
2. **M2 (8 Typed Tools)**: Suite read-only (`search_evidence`, `search_knowledge`, `resolve_entity`, `traverse`, `timeline`, `diff`, `list_contradictions`, `get_source`).
3. **M3 (Dual-Layer & Bitemporalità)**: Ancoraggi bi-direzionali chunk ◄► ontologia e filtri `valid_from` / `valid_to`.
4. **M4 (Contradiction Gate)**: Blocco out-of-loop della sintesi arbitraria su concetti in conflitto aperto.
5. **M5 (Bounded Loop Engine)**: Macchina a stati finiti compatta (~80 righe) con vincoli rigidi (max 8 round, max 2 hop) e degradazione sicura.
6. **M6 (Grounding Verifier)**: Passata singola di potatura claim privi di evidenza tracciata.
7. **M7 (UI Epistemica)**: Trace inspector interattivo e cruscotto delle contraddizioni nel Vault.
8. **M8 (Refusal Tests)**: Suite di certificazione Pass/Fail sui casi di collisione e assenza di evidenza.

---

## 📄 Licenza

Distribuito sotto licenza **MIT**. Realizzato per la community open-source di sviluppatori ed ingegneri AI.

