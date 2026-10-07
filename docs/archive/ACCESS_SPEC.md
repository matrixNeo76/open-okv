---
okf_version: "0.2"
title: "Protocolli di Consultazione Documentale Interna ed Esterna per Agenti Autonomi"
type: "specification"
domain: "AI Agents & Autonomous Workflows"
tags:
  - "okf-v0.2"
  - "agents"
  - "mcp"
  - "rest-api"
  - "knowledge-access"
  - "claude-code"
  - "prompt-engineering"
entities:
  - name: "Knowledge Vault"
    type: "system"
    description: "Piattaforma ontologica e hub di documentazione tecnica OKF v0.2"
  - name: "Claude Code"
    type: "agent"
    description: "Agente autonomo CLI per terminale sviluppato da Anthropic"
  - name: "Model Context Protocol"
    type: "protocol"
    description: "Standard aperto per la connessione contestuale tra modelli AI e sorgenti esterne"
  - name: "Google Gemini"
    type: "model"
    description: "Motore multimodale per parsing strutturato e arricchimento semantico"
  - name: "REST API"
    type: "interface"
    description: "Endpoint HTTP Express per il recupero dati grezzi e filtrati"
  - name: "Cloud Firestore"
    type: "database"
    description: "Document store NoSQL in tempo reale per la persistenza cloud"
relations:
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "implements"
    weight: 0.95
    description: "Fornisce i canali tecnici di fruizione ed attuazione dei protocolli operativi"
  - targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relationType: "documents"
    weight: 0.92
    description: "Approfondisce le modalità di consultazione interna ed esterna del Vault"
  - targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)"
    relationType: "relates_to"
    weight: 0.88
    description: "Delinea i flussi di accesso CLI e integrazione MCP per Claude Code"
  - targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
    relationType: "documents"
    weight: 0.85
    description: "Descrive i flussi di rete e gli endpoint API di distribuzione"
created_at: "2026-09-04T10:00:00Z"
---

# Protocolli di Consultazione Documentale Interna ed Esterna per Agenti Autonomi (OKF v0.2)

> **Specifica Tecnica di Architettura e Standard di Interoperabilità per la Fruizione del Knowledge Vault da parte di Sviluppatori, Prompt Engineer ed Agenti IA Esterni**

---

## 1. Premessa e Obiettivi Operativi

Il **Knowledge Vault** è strutturato attorno a un principio cardine: *la documentazione tecnica non deve essere un archivio passivo di testi statici, ma un'infrastruttura viva, semantizzata e accessibile a macchina con latenza minima*.

Per colmare il divario tra la documentazione tecnica tradizionale e le esigenze operative degli **Agenti Autonomi** (quali *Claude Code, Cursor, GitHub Copilot, Gemini CLI*) e degli **Ingegneri del Prompt**, la piattaforma espone una duplice interfaccia di consultazione:
1. **Interfaccia Interna**: progettata per l'esplorazione ontologica umana, la visualizzazione a grafo e il consumo da parte degli agenti residenti nell'ambiente container/workspace.
2. **Interfaccia Esterna**: progettata per l'interoperabilità machine-to-machine, tramite API REST dedicate, protocollo MCP (*Model Context Protocol*), esportazioni raw Markdown e sincronizzazione cloud multi-device.

---

## 2. Consultazione Interna (All'interno della Piattaforma e del Workspace)

### 2.1 Per l'Utente Umano e il Prompt Engineer (UI/UX)
All'interno della Web App interattiva, la conoscenza è consultabile attraverso tre vettori complementari:

1. **Knowledge Reader & Ispettore Ontologico**:
   - **Rendering Markdown Completo**: visualizzazione tipografica ad alto contrasto con supporto a blocchi di codice, evidenziazione sintattica, tabelle e formattazione tecnica.
   - **Scheda Metadati & Frontmatter YAML Puro**: ispezione trasparente dello schema OKF v0.2, consentendo di verificare `domain`, `docType`, `entities` e `relations`.
   - **Navigazione Iper-Relazionale ad 1 Clic**: nella scheda *"Grafo & Relazioni"*, ciascun legame semantico dichiarato (`governs`, `implements`, `documents`, `powers`, `relates_to`) è un pulsante interattivo che conduce direttamente al documento bersaglio.
   - **Matrice di Affinità Semantica**: calcolo in tempo reale dell'indice di similarità e dei tag co-occorrenti con gli altri nodi del Vault.

2. **Topologia a Grafo Interattivo (D3 Force Directed Graph)**:
   - Visualizzazione macroscopica e clusterizzazione delle conoscenze.
   - Nodi-ponte intermedi (*Concept Hub Nodes*) che raggruppano i documenti attorno a tecnologie chiave (es. *TypeScript, Claude, Firestore*).
   - Archi colorati per tipologia di legame (oro champagne per relazioni dirette, ciano per entità condivise, viola per citazioni nel testo).

3. **Strumenti di Esportazione & Dossier**:
   - Download istantaneo del singolo file in `.md` standard conforme a OKF v0.2.
   - Sincronizzazione automatica con **Google Drive** nella cartella dedicata `knowledge`.
   - Generazione di **Dossier Completo** per stampa o PDF, aggregando l'intero corpus ordinato per capitoli e relazioni.

### 2.2 Per gli Agenti Autonomi Interni (nel Workspace / Contesto di Esecuzione)
Gli agenti che operano direttamente all'interno dell'ambiente di lavoro (come il Coding Agent di AI Studio o processi server Node.js):
- Consultano direttamente i file di specifica nella root del progetto:
  - `README.md`: visione d'insieme e stack.
  - `AGENTS.md`: regole di ingaggio operative e vincoli di scrittura.
  - `GEMINI.md`: schemi di parsing JSON e priorità modelli.
  - `CLAUDE.md`: regole per l'agente CLI.
  - `ARCHITECTURE.md`: topologia di rete e pipeline dati.
- Accedono a latenza zero al file persistente del server: `data/vault-backup.json` e agli snapshot storici in rotazione.

---

## 3. Consultazione Esterna (Machine-to-Machine per Agenti Autonomi Esterni)

Per consentire ad agenti che risiedono all'esterno dell'applicazione (es. su macchine locali, server remoti o toolchain esterne) di interrogare la documentazione, il Vault espone protocolli standardizzati:

### 3.1 Endpoint REST API del Server Backend

Il server Express espone endpoint dedicati all'interrogazione da parte di agenti esterni:

#### A. Interrogazione e Filtraggio Risorse (`GET /api/vault/resources`)
Restituisce una vista indicizzata e filtrabile dell'intero catalogo documentale:
- **Parametri Query opzionali**:
  - `type`: filtra per tipo di risorsa (`knowledge`, `github_repo`, `mcp_server`, `ai_skill`, `article`).
  - `tag`: filtra per etichetta specifica (es. `tag=agents`).
  - `q`: ricerca testuale libera su titolo, abstract e dominio.
- **Formato di Risposta**:
```json
{
  "success": true,
  "totalAvailable": 106,
  "matchedCount": 1,
  "resources": [
    {
      "id": "res-1725441234",
      "title": "Protocolli Operativi per Agenti Autonomi (AGENTS.md)",
      "type": "knowledge",
      "summary": "Regole di ingaggio e protocolli di esecuzione per agenti AI...",
      "tags": ["agents", "okf-v0.2", "rules"],
      "domain": "Software Architecture & AI",
      "docType": "specification",
      "entities": [...],
      "relations": [...],
      "rawUrl": "/api/vault/resources/res-1725441234/raw"
    }
  ]
}
```

#### B. Download Diretto del Markdown Puro OKF v0.2 (`GET /api/vault/resources/:id/raw`)
Restituisce il documento in formato testuale nativo `text/markdown; charset=utf-8`, corredato del frontmatter YAML completo:
```bash
# Esempio di interrogazione via cURL da parte di un agente CLI
curl -s "https://[APP_URL]/api/vault/resources/res-1725441234/raw" > context.md
```
Questo consente a qualsiasi script di automatizzazione di alimentare direttamente la finestra di contesto (*context window*) di un modello linguistico con documentazione tecnica validata e priva di sovrastrutture HTML.

#### C. Esportazione Massiva Completa (`GET /api/vault/backup`)
Restituisce l'intero database ontologico in formato JSON con metadati, entità, relazioni e testi Markdown, utile per sincronizzazioni massive, backup offline e pipeline RAG esterne.

---

### 3.2 Integrazione con Model Context Protocol (MCP)

Il Knowledge Vault include il supporto nativo per l'ecosistema **Model Context Protocol (MCP)**:
- Il Vault cataloga configurazioni e definizioni di server MCP (`mcp_server`), fornendo comandi di avvio (`stdio`/`sse`) e snippet pronti per `claude_desktop_config.json` o `.mcp.json`.
- Qualsiasi agente conforme a MCP (come Claude Desktop o Claude Code) può registrare un tool bridge che interroga l'endpoint `/api/vault/resources`, esponendo strumenti nativi nel reasoning loop dell'agente:
  - `vault_search(query: string, tag?: string)`
  - `vault_get_document(id: string)`
  - `vault_list_relations(id: string)`

---

### 3.3 Context Injection Diretto nei Prompt degli Agenti

Poiché ogni documento esportato o recuperato dal Vault adotta la sintassi standard **OKF v0.2**, i modelli linguistici (Claude 3.7 Sonnet, Gemini 3.7 Flash, GPT-4o) riconoscono immediatamente:
1. **I confini semantici**: delimitati dal blocco YAML iniziale.
2. **Il ruolo e il tipo del documento**: grazie al campo `type` (`guide`, `specification`, `architecture`, `prompt_skill`).
3. **Le dipendenze ontologiche**: grazie alla sezione `relations`, che indica chiaramente al modello quali altri concetti governano o completano la specifica in esame.

---

### 3.4 Sincronizzazione con Google Drive e NotebookLM

Attraverso l'integrazione Google Drive, i documenti del Vault possono essere esportati e mantenuti allineati all'interno della cartella cloud `knowledge`:
- Strumenti come **Google NotebookLM** possono caricare l'intera cartella Drive come fonte primaria, fornendo una chat interattiva con citazioni di pagina su tutto il corpus documentale.
- Agenti provvisti di connettori Google Workspace (tramite OAuth) possono effettuare ricerche e citazioni in tempo reale senza accedere direttamente all'infrastruttura del server.

---

## 4. Matrice Riassuntiva di Accesso

| Metodo di Consultazione | Destinatario Principale | Formato Dati | Latenza | Meccanismo |
|---|---|---|---|---|
| **Knowledge Reader & Graph** | Utente umano, Prompt Engineer | HTML5 / D3 Canvas | 0ms (client) | Web UI Interattiva |
| **Endpoint REST Raw (`/raw`)** | Agenti CLI, cURL, Script Python | Markdown + YAML | ~50ms | HTTP GET `text/markdown` |
| **Endpoint REST List (`/resources`)** | Toolchain, Agentic Workflows | JSON OKF v0.2 | ~30ms | HTTP GET `application/json` |
| **Model Context Protocol (MCP)** | Claude Desktop, Claude Code | JSON-RPC / MCP Tools | Sub-second | Tool calling nativo |
| **Google Drive / NotebookLM** | Modelli multimodali, RAG | Google Docs / PDF | Asincrono | Sincronizzazione Cloud |
| **Filesystem Locale (`data/`)** | Agenti container interni | JSON / Snapshot | 0ms | I/O su filesystem disco |

---

## 5. Linee Guida per gli Ingegneri del Prompt

Quando si prepara un prompt per un agente autonomo basandosi sui documenti del Vault:
1. **Preferire il recupero mirato**: utilizzare `/api/vault/resources?type=specification` per estrarre solo le specifiche pertinenti al task, riducendo l'inquinamento del contesto.
2. **Conservare il Frontmatter YAML**: non eliminare il blocco `--- okf_version: "0.2" ... ---`, poiché fornisce all'agente indicazioni deterministiche sulla gerarchia concettuale.
3. **Seguire le Relazioni Ontologiche**: se un documento ha una relazione `governs` verso un altro file, è buona prassi allegare entrambi i documenti nel prompt dell'agente.
