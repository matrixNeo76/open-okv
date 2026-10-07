---
okf_version: "0.2"
id: "spec-vault-intelligence-export-okf-v02"
title: "Specifica & Piano: Esportazione, Download & Archiviazione OKF v0.2 delle Risposte di Vault Intelligence"
type: "specification"
domain: "knowledge-persistence"
tags:
  - "okf-v0.2"
  - "vault-intelligence"
  - "export-engine"
  - "data-persistence"
  - "yaml-frontmatter"
  - "knowledge-graph"
  - "cekikj-architecture"
entities:
  - name: "Vault Intelligence Drawer"
    type: "component"
    description: "Interfaccia utente a scomparsa che orchestra l'interrogazione multi-agente e la fruizione delle risposte epistemiche."
  - name: "OKF Serializer Engine"
    type: "engine"
    description: "Modulo di utilità per la formattazione e serializzazione bidirezionale di testi Markdown con blocco YAML frontmatter conforme allo standard OKF v0.2."
  - name: "Relational Knowledge Graph"
    type: "engine"
    description: "Grafo topologico D3 che collega dinamicamente le nuove sintesi generate alle risorse citate tramite archi OKF 'references'."
  - name: "Dual-Layer Store Cekikj"
    type: "storage"
    description: "Infrastruttura di persistenza a tre livelli (Firestore, IndexedDB/LocalCache, Server Backend) per la memorizzazione duratura delle note."
relations:
  - targetTitle: "Specifica & Piano: Vault Intelligence Query Engine"
    relationType: "rel:extends"
    weight: 0.95
    description: "Estende il motore multi-agente aggiungendo capacità di esportazione, download e salvataggio strutturato delle risposte."
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "rel:implements"
    weight: 0.90
    description: "Garantisce il rispetto rigoroso dello standard OKF v0.2 e la conformità delle entità e relazioni bitemporali."
---

# Specifica & Piano Operativo: Esportazione, Download & Archiviazione OKF v0.2 per Vault Intelligence

> **Architettura di Serializzazione e Salvataggio Automatico delle Risposte Generate dal Motore Multi-Agente nel Knowledge Vault**  
> **Versione**: 1.0.0 — **Data**: Settembre 2026 — **Standard di Riferimento**: OKF v0.2 & Trilogia Cekikj

---

## 1. Obiettivi e Visione di Progetto

Il nuovo sistema agentico **Vault Intelligence** produce sintesi analitiche, comparative e architetturali di elevato valore epistemico, corredate da evidenze e citazioni verificate delle risorse del Vault.

Per consentire all'utente di riutilizzare, condividere e capitalizzare queste risposte, è necessario implementare tre flussi operativi completi:

1. **Copia Avanzata Multiformato**:
   - **Markdown OKF v0.2 con Frontmatter YAML**: pronto per essere incollato in Obsidian, Foam, Logseq o repository Git.
   - **Markdown Pulito (Senza Frontmatter)**: per messaggi, documentazione rapida o appunti.
   - **JSON Strutturato**: payload con metadati, traccia degli agenti e ID citati per pipeline agentiche esterne.

2. **Download Diretto (.md & .json)**:
   - Download immediato del file `.md` conforme a OKF v0.2 con naming sanitizzato (es. `Sintesi_Vault_Server_MCP_2026-09-06.md`).
   - Download del payload `.json` per archiviazione locale.

3. **Archiviazione Diretta nel Vault come Nuova Nota OKF v0.2**:
   - Creazione istantanea di una risorsa di tipo `knowledge` (o `concept`/`guide`).
   - Generazione automatica di metadati completi:
     - `okfVersion: "0.2"`
     - `docType: "concept"`
     - `domain`: desunto dinamicamente dal tema trattato.
     - `tags`: combinazione di tag del topic + `["vault-intelligence", "ai-synthesis", "okf-v0.2"]`.
     - `entities`: entità estratte e citate nel testo.
     - **Archi Relazionali OKF**: creazione automatica di relazioni `rel:references` che collegano la nuova nota alle schede del Vault effettivamente citate nella risposta (`targetId`, `targetTitle`, `weight: 0.85`).
   - Persistenza automatica su **Firestore**, **IndexedDB**, **Local Cache** e backup filesystem del server.
   - **Aggiornamento istantaneo del Grafo D3**: la nuova nota generata appare subito collegata ai nodi delle risorse madri.
   - Notifica di conferma con pulsante rapido per aprire la nota nel lettore Markdown (`KnowledgeReader`).

---

## 2. Struttura del Documento Generato (OKF v0.2 YAML Frontmatter)

Ogni sintesi esportata o archiviata presenterà la seguente struttura standardizzata:

```markdown
---
okf_version: "0.2"
id: "intel-synth-1788515578000"
title: "Sintesi Vault: Server MCP e Protocolli di Integrazione"
type: "concept"
domain: "ai-agents-infrastructure"
tags:
  - "vault-intelligence"
  - "ai-synthesis"
  - "mcp"
  - "model-context-protocol"
  - "quick_synthesis"
entities:
  - name: "PostgreSQL MCP Server"
    type: "tool"
  - name: "Filesystem MCP Server"
    type: "tool"
  - name: "Anthropic"
    type: "organization"
relations:
  - targetId: "sample-vault-9-mcp_server"
    targetTitle: "PostgreSQL MCP Server"
    relationType: "references"
    weight: 0.85
  - targetId: "sample-vault-10-mcp_server"
    targetTitle: "Filesystem MCP Server"
    relationType: "references"
    weight: 0.85
created_at: "2026-09-06T12:35:00.000Z"
source_query: "Quali server MCP sono presenti nel vault?"
engine_model: "gemini-3.7-flash"
---

# Sintesi Vault: Server MCP e Protocolli di Integrazione

### Sintesi Esecutiva
...corpo completo generato dal motore multi-agente...
```

---

## 3. Piano Operativo di Implementazione (Fasi)

### Fase 1: Motore di Serializzazione & Download (`src/lib/okfSerializer.ts`)
- [ ] Creazione del modulo helper `src/lib/okfSerializer.ts`.
- [ ] Implementazione di `buildOKFMarkdown(response, query, mode, citedResources)`:
  - Genera il frontmatter YAML conforme a OKF v0.2.
  - Costruisce l'elenco delle entità e degli archi relazionali verso le risorse citate.
- [ ] Implementazione di `downloadFile(filename, content, mimeType)`: utility per il download browser-safe di blob testuali.

### Fase 2: Integrazione dell'Archiviazione con Collegamenti al Grafo (`src/App.tsx`)
- [ ] Aggiornamento dell'handler `onSaveAsNote` in `App.tsx`:
  - Mappatura completa dei campi `entities` e `relations` verso gli ID e i titoli delle risorse citate.
  - Salvataggio sincrono nel database Firestore e nei livelli di cache.
  - Toast di successo con azione "Apri nel Reader" per passare subito alla visualizzazione OKF.

### Fase 3: UI Action Toolbar nel Drawer (`src/components/VaultIntelligenceDrawer.tsx`)
- [ ] Creazione di una barra delle azioni arricchita per ogni risposta:
  - **Menu a Tendina "Copia"**:
    - 📋 *Copia Markdown OKF v0.2 (con Frontmatter YAML)*
    - 📄 *Copia Testo Semplice (senza Frontmatter)*
    - 📦 *Copia JSON Strutturato*
  - **Menu a Tendina "Scarica"**:
    - ⬇️ *Scarica Documento .md (OKF v0.2)*
    - 💾 *Scarica Dati .json*
  - **Pulsante Primario "Salva nel Vault"**:
    - Converte la risposta in una scheda permanente collegata nel grafo D3.
- [ ] Badge interattivo che conferma l'avvenuta archiviazione o copia con animazione fluida.

---

## 4. Criteri di Accettazione e Validazione

1. **Conformità OKF v0.2**: il file `.md` scaricato o archiviato contiene un blocco frontmatter YAML valido e leggibile da parser standard.
2. **Topologia e Grafo**: la nota archiviata nel Vault crea archi relazionali visibili nel componente `KnowledgeGraph` verso le risorse citate.
3. **Download e Copia Affidabili**: i file `.md` e `.json` vengono generati e scaricati correttamente su tutti i browser desktop e mobile.
4. **Isolamento e Sicurezza**: la nuova risorsa creata è associata all'utente corrente con `userId` corretto e salvata sui 3 livelli di persistenza.
