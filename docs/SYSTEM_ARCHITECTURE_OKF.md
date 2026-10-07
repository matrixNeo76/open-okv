---
okf_version: "0.2"
id: "arch-vault-system-blueprint"
title: "Architettura di Sistema del Knowledge Vault: Blueprint Completo e Modello Topologico"
type: "architecture"
domain: "Full-Stack System Architecture & Knowledge Engines"
tags: ["okf", "architecture", "system-design", "react", "express", "d3", "firestore", "indexeddb", "ring-buffer", "cekikj", "vectorless-rag"]
entities:
  - name: "Knowledge Vault"
    type: "technology"
    description: "Applicazione full-stack reattiva per l'acquisizione, strutturazione ontologica e navigazione a grafo della conoscenza"
  - name: "Unified Full-Stack Express Server"
    type: "technology"
    description: "Server Node.js Express che espone le API REST protette e monta il middleware Vite per servire la SPA su porta 3000"
  - name: "Tri-Layer Storage Architecture"
    type: "pattern"
    description: "Modello di resilienza dati a 3 livelli: LocalStorage/IndexedDB -> File Backup con Ring Buffer 20 snapshot -> Cloud Firestore"
  - name: "D3 Force Topological Engine"
    type: "technology"
    description: "Motore di simulazione fisica a 5 livelli per il calcolo delle forze relazionali e degli Hub Entità dinamici"
  - name: "Cekikj Epistemic Core"
    type: "framework"
    description: "Modulo di governo cognitivo basato su Evidence Layer, Structured Knowledge Layer, Typed Tools e Contradiction Gate"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Implementa le strutture dati, le entità e le relazioni definite nello standard OKF v0.2"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "depends_on"
    weight: 0.95
    description: "Riceve i dati strutturati dalla pipeline di estrazione e li propaga attraverso i 3 livelli di storage"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "documents"
    weight: 0.9
    description: "Fornisce il modello concettuale necessario per eseguire la guida operativa di replica"
---

# Architettura di Sistema del Knowledge Vault

> **Versione Sistema**: Vault 2026.4 (OKF v0.2 Native)  
> **Stato Architetturale**: PRODUZIONE / DOCUMENTAZIONE CANONICA  
> **Finalità**: Descrivere nel dettaglio l'architettura tecnica del Vault affinché qualsiasi LLM esterno o team di ingegneria possa comprendere, estendere o ricostruire l'intero applicativo senza deviazioni.

---

## 1. Topologia di Alto Livello e Stack Tecnologico

L'applicazione adotta un'architettura **Full-Stack Monolitica Modulare** eseguita in container Cloud Run:

```
+-------------------------------------------------------------------------------+
| CONTAINER CLOUD RUN (Porta 3000 Ingress Unica)                                |
|                                                                               |
|  +---------------------------+       +-------------------------------------+  |
|  | FRONTEND (React 18 + SPA) |       | BACKEND (Node.js + Express 5)       |  |
|  | - Vite Bundler            |       | - Server entry point: server.ts     |  |
|  | - Tailwind CSS v4         | <---> | - API Routes: /api/*                |  |
|  | - D3.js v7 Topological    | (IPC/ | - Vite Dev Middleware (dev mode)    |  |
|  | - Lucide Icons            | HTTP) | - Static Serve /dist (prod mode)    |  |
|  | - Client Firebase SDK     |       | - Google GenAI SDK (Server Secret)  |  |
|  +---------------------------+       +-------------------------------------+  |
+-------------------------------------------------------------------------------+
           |                                              |
           v                                              v
+-----------------------+                      +---------------------+
| CLIENT BROWSER        |                      | CLOUD FIRESTORE     |
| - LocalStorage / IDB  |                      | - Collection:       |
| - OnSnapshot Realtime |                      |   "resources"       |
+-----------------------+                      +---------------------+
```

### Componenti Fondamentali:
1. **Frontend**: React 18, TypeScript, Tailwind CSS, animazioni `motion/react`, visualizzazione a grafo con `d3`.
2. **Backend**: Express con TypeScript eseguito tramite `tsx` in sviluppo ed `esbuild` per il bundling di produzione (`dist/server.cjs`). Router modulari dedicati:
   - `/api/vault`: Backup, snapshot ciclici e sincronizzazione atomica.
   - `/api/webhook`: Endpoint REST e cattura remota protetta con Bearer token.
   - `/api/mcp`: Server nativo Model Context Protocol (JSON-RPC 2.0).
   - `/api`: Pipeline di analisi euristica e multimodale (`analyze-resource`, `convert-file-to-okf`, `import-vault-archive`).
3. **AI Engine**: `@google/genai` (SDK ufficiale di Google DeepMind) operante **esclusivamente sul server** a tutela delle chiavi di sicurezza (`process.env.GEMINI_API_KEY`). Modello primario: `gemini-3.7-flash` con fallback su `gemini-flash-latest` e parser euristico locale.
4. **Specialized Ingestion Engines**:
   - `ipynbParser`: Parsing JSON `nbformat` di Jupyter Notebook e rimozione output binari.
   - `batchMigrationService`: Estrazione archivi ZIP Obsidian/Notion con risoluzione dei `[[wikilinks]]`.
   - `openGraphService`: Estrazione metadati web e arricchimento video YouTube HD con capitoli.

---

## 2. Modello di Persistenza a 3 Livelli (Tri-Layer Storage Engine)

Per garantire la **continuità operativa a tolleranza zero** contro interruzioni di rete o limiti di quota cloud, il Vault implementa un'architettura di storage a tre livelli gerarchici:

```
[Livello 1: Client Storage]  <--->  [Livello 2: Server Backup]  <--->  [Livello 3: Cloud Firestore]
   LocalStorage / IDB                   data/vault-backup.json              Collezione "resources"
   Latenza: < 1ms                       Latenza: 5-15ms                     Latenza: 100-300ms
   Zero-Network Resilience             Ring Buffer (20 Snapshot)           Multi-Device Realtime
```

### 1. Livello 1: Client-Side Local State & Cache
- Gestito dal modulo `src/hooks/useVaultData.ts` e `src/lib/conflictResolver.ts`.
- Mantiene lo stato reattivo istantaneo. All'avvio dell'applicazione, le risorse vengono caricate immediatamente dalla memoria locale eliminando qualsiasi schermata bianca o stato di caricamento bloccante.

### 2. Livello 2: Server Backup File con Ring Buffer a 20 Snapshot
- Endpoint: `POST /api/backup-sync`, `GET /api/backup-data`.
- File primario: `data/vault-backup.json`.
- Ad ogni operazione di scrittura o riconciliazione riuscita, il server crea una copia nel buffer circolare `data/snapshots/snapshot-YYYY-MM-DDTHH-mm-ss.json`, mantenendo rigorosamente gli ultimi 20 stati con rotazione automatica FIFO.
- Se Firestore non è configurato o supera le quote, il livello 2 garantisce che i dati dell'utente persistano sul disco del container.

### 3. Livello 3: Google Cloud Firestore (Cloud Sync Primario)
- Collezione principale: `resources`.
- Ogni documento è vincolato a `userId` per il rigoroso rispetto delle regole `firestore.rules`.
- Sincronizzazione tramite listener in tempo reale `onSnapshot(query(collection(db, "resources"), where("userId", "==", uid)))`.
- **Protezione Concorrenza**: Il modulo `withFirestoreTimeout` applica un timeout di sicurezza di 20.000ms. In caso di latenza anomala o cold-start, il sistema preserva il dato localmente ed esegue la de-duplicazione non appena la scrittura cloud si completa.

---

## 3. Motore Topologico D3 e Calcolo delle Relazioni Fisiche

Il componente `src/components/KnowledgeGraph.tsx` costituisce l'interfaccia di navigazione ontologica del Vault. A differenza dei visualizzatori generici a matrice o a griglia, il grafo fisico D3 implementa un **algoritmo di attrazione a 5 forze**:

1. **Forza 1: Relazioni Esplicite OKF v0.2 (`relations`)**:
   - Gli archi dichiarati nel frontmatter YAML (es. `implements`, `governs`, `depends_on`) hanno priorità massima e determinano una distanza di riposo corta e rigida (`weight` da 0.5 a 1.0).
2. **Forza 2: Entità Condivise (`entities`)**:
   - I nodi che citano le medesime entità canoniche (es. entrambi citano `TypeScript` e `Anthropic`) vengono attratti reciprocamente formando cluster organici.
3. **Forza 3: Hub Entità Dinamici**:
   - Il grafo sintetizza nodi virtuali speciali ("Hub Entità") che fungono da baricentri gravitazionali per i documenti correlati a grandi temi tecnologici.
4. **Forza 4: Tag Comuni e Domini Affini**:
   - I documenti appartenenti allo stesso `domain` o con sovrapposizione di `tags` subiscono una forza di coesione di intensità secondaria.
5. **Forza 5: Repulsione Elettrostatica di Carica (Many-Body Force)**:
   - Evita la sovrapposizione dei testi e dei nodi, garantendo leggibilità e distanziamento ottico secondo le regole anti-slop.

---

## 4. Architettura Epistemica Cekikj (Zero-Guessing Knowledge Layer)

Integrata nel cuore del Vault secondo le specifiche definite in `docs/archive/SPEC_CEKIKJ_KNOWLEDGE_LAYER_OKF.md`:

```
+-------------------------------------------------------------------------------+
| TRILOGIA CEKIKJ: ARCHITETTURA DI GOVERNO COGNITIVO                            |
|                                                                               |
|  [Evidence Layer]                 [Structured Knowledge Layer]                |
|  Chunk grezzi, citazioni web,     Entità canoniche, concetti risolti,         |
|  snippet di codice non elaborati  relazioni tipizzate OKF v0.2                |
|               ^                                   ^                           |
|               |                                   |                           |
|               +-----------------+-----------------+                           |
|                                 |                                             |
|                     [Typed Tools Engine]                                      |
|                     8 contratti fissi in sola lettura                         |
|                     Output rigorosi con flag: insufficient = true             |
|                                 |                                             |
|                     [Contradiction Gate]                                      |
|                     Blocco sintesi se status: "open" nel registro              |
|                                 |                                             |
|                     [Grounding Verifier]                                      |
|                     Verifica 1:1 tra asserzioni e nodi del grafo              |
+-------------------------------------------------------------------------------+
```

- **Rifiuto dell'Iterated Guessing**: Se le evidenze nel Vault non sono sufficienti per rispondere a una domanda analitica, il motore restituisce `insufficient: true` invece di allucinare concetti non verificati.
- **Limiti Operativi Stringenti (Hard Bounds)**:
  - Max 8 round di tool-call per sessione analitica.
  - Max 2 hop di profondità nell'esplorazione delle relazioni del grafo.
  - Timeout perentorio per ogni ciclo cognitivo.
