---
okf_version: "0.2"
id: "arch-vault-root-summary"
title: "Architettura di Sistema - Knowledge Vault (ARCHITECTURE.md)"
type: "architecture"
domain: "Full-Stack System Architecture & Topological Engines"
tags: ["okf", "architecture", "d3", "firestore", "express", "vite", "gemini-3.7-flash", "cekikj", "indexeddb"]
entities:
  - name: "Knowledge Vault"
    type: "technology"
    description: "Applicazione full-stack per la gestione della conoscenza ontologica conforme a OKF v0.2"
  - name: "D3 Force Engine"
    type: "technology"
    description: "Motore fisico di simulazione delle relazioni e calcolo degli hub tematici"
  - name: "Tri-Layer Storage Engine"
    type: "pattern"
    description: "Architettura resiliente a 3 livelli: LocalStorage -> Server JSON Ring Buffer -> Cloud Firestore"
  - name: "Gemini Structured Ingestion"
    type: "toolchain"
    description: "Pipeline di analisi ed estrazione metadati su server Express con fallback locale a latenza zero"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Implementa lo standard normativo dei documenti OKF v0.2"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "extends"
    weight: 1.0
    description: "Fornisce il compendio ad alto livello del documento di dettaglio in docs/SYSTEM_ARCHITECTURE_OKF.md"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "depends_on"
    weight: 0.95
    description: "Specifica la pipeline di ingestione e de-duplicazione"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "documents"
    weight: 0.9
    description: "Indica i requisiti tecnici per la replicazione completa del repository"
---

# Architettura di Sistema - Knowledge Vault (ARCHITECTURE.md)

> **Documento di Architettura di Riferimento per Knowledge Vault, D3 Topology Engine, Cloud Firestore e OKF v0.2**  
> *Per la documentazione tecnica canonica e i contratti formali dettagliati, consultare i documenti nella cartella `/docs`:*  
> 1. [`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md) — *Specifica Formale Ufficiale OKF v0.2*  
> 2. [`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md) — *Blueprint Architetturale Dettagliato a 3 Livelli*  
> 3. [`docs/INGESTION_PIPELINE_SPEC.md`](docs/INGESTION_PIPELINE_SPEC.md) — *Specifica della Pipeline di Ingestione e De-duplicazione*  
> 4. [`docs/SYSTEM_REPLICATION_GUIDE.md`](docs/SYSTEM_REPLICATION_GUIDE.md) — *Guida Operativa alla Replicazione per LLM ed Ingegneri*  

---

## 1. Schema Architetturale Generale

```
+-------------------------------------------------------------------------+
|                              CLIENT (React 18 + SPA)                    |
|                                                                         |
|  +---------------------+   +---------------------+   +---------------+  |
|  |   KnowledgeGraph    |   |   KnowledgeReader   |   |   QuickBar    |  |
|  |  (D3 Force Network) |   |  (Markdown + OKF)   |   | & Diagnostics |  |
|  +----------^----------+   +----------^----------+   +-------^-------+  |
|             |                         |                      |          |
|             +-------------------------+----------------------+          |
|                                       |                                 |
|                           [ React State & Context ]                     |
+---------------------------------------|---------------------------------+
                                        |
           +----------------------------+----------------------------+
           | (Auth & Firestore Sync)                                 | (REST API)
           v                                                         v
+-----------------------+                         +-----------------------+
|  Cloud Firestore &    |                         |     Express Server    |
|  Firebase Auth        |                         |       (server.ts)     |
|                       |                         |                       |
| - collection("resources")                       | - /api/analyze-resource
| - Security rules per UID                        | - /api/ai-chat        |
| - Realtime onSnapshot                           | - Google GenAI SDK    |
+-----------------------+                         +-----------^-----------+
                                                              |
                                                              v
                                                  +-----------------------+
                                                  | Gemini 3.7 / 2.5 Flash|
                                                  |  (Structured Output)  |
                                                  +-----------------------+
```

---

## 2. Componenti Core

### 2.1 KnowledgeGraph (`src/components/KnowledgeGraph.tsx`)
- Motore di layout fisico a forze (`d3.forceSimulation`) con cariche repulsive dinamiche, prevenzione collisioni e centratura reattiva.
- Risoluzione relazionale a 5 livelli:
  1. *Relazioni OKF v0.2 esplicite* (oro champagne con marcatori a freccia).
  2. *Entità ontologiche condivise* (ciano brillante).
  3. *Menzioni testuali incrociate* (viola).
  4. *Tag condivisi normalizzati* (ambra tratteggiata).
  5. *Dominio e categoria comune* (smeraldo).
- Supporto per **Hub Entità**, zoom continuo, drag & drop e selezione dettagliata con navigazione al lettore.

### 2.2 KnowledgeReader (`src/components/KnowledgeReader.tsx`)
- Renderizzatore Markdown con evidenziazione sintassi del codice, gestione tabelle, badge di dominio e schede informative.
- Scheda dedicata **"Grafo & Relazioni"** che mostra sia le relazioni dichiarate, sia la matrice di affinità calcolata con tutte le altre risorse salvate nel Vault.
- Funzionalità di esportazione rapida in `.md` conforme ad OKF v0.2.

### 2.3 Sistema di Diagnostica & Tracing
- Log unificato con identificatori univoci, timestamp e categorizzazione (`AUTH`, `FIRESTORE`, `CAPTURE`, `GEMINI_AI`).
- Interceptor degli eventi WebSocket di Vite per prevenire falsi allarmi nella sandbox.
