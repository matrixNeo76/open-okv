# Piano di Sviluppo: Modulo "Knowledge" con Open Knowledge Format (OKF v0.2) & Knowledge Graph

Questo documento descrive l'architettura, la struttura dati, il motore di arricchimento OKF v0.2 e la visualizzazione a grafo per il nuovo modulo **Knowledge**.

---

## 1. Visione e Obiettivi del Modulo "Knowledge"

Il modulo **Knowledge** espande il Vault trasformandolo in un **Second Brain & Graph Knowledge Base** attivo:
- **Ingestion Universale**: accetta file (.md, .txt, .pdf), codice o testo incollato, oltre a link e documentazioni.
- **Standard OKF v0.2 (Open Knowledge Format)**:
  Ogni documento viene analizzato, convertito e strutturato con frontmatter YAML arricchito:
  - Entità chiave ed ontologie (`concepts`, `entities`, `technologies`).
  - Collegamenti semantici espliciti (`links`, `references`, relazioni `rel:depends_on`, `rel:implements`, `rel:extends`, `rel:references`).
  - Wikilinks automatici `[[NomeDocumento]]` o `[[Concetto]]` nel corpo Markdown.
  - Sintesi esecutiva e tassonomia gerarchica.
- **Knowledge Graph Interattivo (D3.js / WebGL / Canvas)**:
  - Visualizzazione nodi e archi con layout force-directed.
  - Nodi colorati per tipologia di entità/documento e grandezza proporzionale al numero di connessioni (PageRank/Degree).
  - Filtri per cluster tematico, ricerca nodi con zoom istantaneo e click-to-preview del documento.
- **Consultazione Bimodale**:
  - *Vista Lettore / Editor Markdown*: visualizzazione pulita del documento formattato con wikilink cliccabili che aprono le risorse collegate.
  - *Vista Grafo Interattivo*: esplorazione visiva della rete di conoscenza, isolamento di sottografi e percorsi di relazione.

---

## 2. Standard OKF v0.2 (Specifica Formato)

Ogni risorsa "Knowledge" rispetta lo standard OKF v0.2:

```markdown
---
okf_version: "0.2"
id: "doc-uuid"
title: "Architettura Microservizi e MCP"
type: "concept" # concept | specification | architecture | guide | snippet | research
domain: "ai-systems"
tags: ["mcp", "microservices", "distributed-systems", "gemini"]
created_at: 2026-08-29T12:00:00Z
updated_at: 2026-08-29T12:00:00Z
entities:
  - name: "Model Context Protocol"
    type: "protocol"
  - name: "PostgreSQL"
    type: "database"
relations:
  - target_id: "doc-postgres-mcp"
    target_title: "PostgreSQL MCP Server"
    relation_type: "implements"
    weight: 0.9
  - target_id: "doc-gemini-agent"
    target_title: "Gemini Agent Framework"
    relation_type: "references"
    weight: 0.75
---

# Architettura Microservizi e MCP

Questo documento descrive l'integrazione di [[PostgreSQL MCP Server]] all'interno del flusso degli agenti [[Gemini Agent Framework]]...
```

---

## 3. Flusso di Ingestion & Elaborazione (AI Engine con Gemini)

1. **Upload / Incolla**:
   - File drag & drop (.md, .txt, estrazione testo .pdf) o inserimento diretto via Chat/Dialog box.
2. **AI Processing (`/api/process-knowledge`)**:
   - Gemini analizza il testo grezzo e i documenti già presenti nel Vault dell'utente in Firestore.
   - **Entity Extraction**: Estrae nodi concettuali ed entità nominate.
   - **Cross-Document Linking**: Riconosce corrispondenze con gli altri documenti o risorse già salvate (articoli, repo, MCP server, skill) e genera gli archi di collegamento (`relations`) con peso di confidenza.
   - **OKF Formatting**: Produce il corpo in Markdown standard OKF v0.2 pronto per l'esportazione.
3. **Persistenza su Firestore**:
   - Salvataggio nella collezione `resources` (con `type: 'knowledge'`) con metadati arricchiti:
     - `okfVersion: "0.2"`
     - `entities: string[]`
     - `relations: Array<{ targetId, targetTitle, relationType, weight }>`
     - `markdownContent: string`
     - `domain: string`
     - `docType: string`

---

## 4. Architettura del Grafo di Conoscenza (Performance & Robustezza)

- **Calcolo Real-time del Grafo**:
  - Un hook reattivo (`useKnowledgeGraph`) indicizza i nodi (tutti i documenti + entità) e calcola gli archi diretti e indiretti (basati su relazioni OKF, tag condivisi e citazioni `[[wikilink]]`).
- **Motore di Rendering D3 Force-Directed**:
  - Calcolo della fisica con `d3-force` fluido a 60 FPS.
  - Supporto per:
    - Zoom, Pan, Drag dei nodi.
    - Evidenziazione di vicinato (hover su un nodo illumina i nodi connessi e attenua il resto del grafo).
    - Clustering per dominio tecnologico (es. *AI & Prompts*, *MCP & Tools*, *Architecture*, *Database*).
    - Mini-mappa di navigazione e ricerca nodi in tempo reale.
- **Navigazione Ipertestuale a 2 Vie**:
  - Cliccando su un nodo del grafo si apre il lettore del documento.
  - Cliccando su un wikilink `[[Titolo]]` all'interno del Markdown, la vista salta direttamente al nodo correlato o apre la risorsa corrispondente.

---

## 5. Nuove Componenti UI & Integrazioni

1. **Sidebar Navigation**:
   - Aggiunta voce **"Knowledge (OKF v0.2 & Grafo)"** con icona a rete neurale (`Network` / `BrainCircuit`) e contatore documenti.
2. **Knowledge Graph Explorer View**:
   - Split view o fullscreen toggle tra:
     - **Grafo 2D interattivo** ad alte prestazioni (tema *Sophisticated Dark* con nodi luminescenti oro/ambra/cianite).
     - **Knowledge Reader / Markdown Studio**: con rendering LaTeX/Math, blocchi di codice evidenziati, copia rapida e inspector OKF frontmatter.
3. **Dropzone Multi-Formato**:
   - Supporto per file `.md`, `.txt`, `.pdf` (con estrazione client-side rapida e fallback sicuro).
4. **Esportazione Bundle OKF**:
   - Download singolo file `.md` con frontmatter OKF v0.2.
   - Export dell'intero Vault in archivio ZIP di file Markdown collegati o export JSON del grafo per Obsidian, Logseq o Neo4j.

---

## 6. Piano di Implementazione a Fasi

- **Fase 1**: Aggiornamento tipi TypeScript (`src/types.ts`) e schema Firestore (`firebase-blueprint.json` e `firestore.rules`) per includere il tipo `knowledge` e i campi OKF v0.2 (`entities`, `relations`, `markdownContent`).
- **Fase 2**: Implementazione backend `/api/process-knowledge` con Gemini 2.5 per l'estrazione semantica, linking incrociato e generazione automatica di metadati OKF v0.2.
- **Fase 3**: Costruzione del motore di visualizzazione del grafo (`src/components/KnowledgeGraph.tsx`) con D3.js, fisica dei nodi, clustering, ricerca e filtri.
- **Fase 4**: Creazione del lettore/editor Markdown (`src/components/KnowledgeReader.tsx`) con supporto per wikilinks interattivi `[[Link]]` e ispezione metadati OKF.
- **Fase 5**: Estensione della Capture Bar e del Dialog di caricamento con supporto drag & drop file (.md, .txt, .pdf) e auto-collegamento.
- **Fase 6**: Verifica build e linting (`compile_applet` & `lint_applet`).

---

*Piano salvato con successo in `PIANO_KNOWLEDGE_OKF.md`. In attesa di conferma per avviare lo sviluppo.*
