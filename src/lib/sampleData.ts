import { ResourceItem } from "../types";

export const initialSampleResources: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">[] = [
  // 1. README / Panoramica Sistema
  {
    type: "knowledge",
    title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)",
    url: "https://github.com/knowledge-vault/system-readme",
    summary: "Documento centrale di visione, caratteristiche del Knowledge Vault, architettura a grafo topologico D3 e standard di interoperabilità per agenti autonomi.",
    tags: ["knowledge", "readme", "okf-v0.2", "architecture", "overview", "ai-agents"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      version: "1.2.0",
      author: "Core Architecture Team & adlibros",
      status: "stable",
      license: "MIT",
      domain: "Knowledge Systems & AI Architecture",
      docType: "specification",
      dependencies: ["Node.js >= 18", "Cloud Firestore", "D3.js v7", "@google/genai", "Vite & React 18"],
      prerequisites: ["Node.js 18+", "Firebase Firestore Project", "Google Gemini API Key"],
      entities: [
        { name: "Knowledge Vault", type: "system", description: "Piattaforma centrale per documentazione e ontologia AI" },
        { name: "OKF v0.2", type: "standard", description: "Open Knowledge Format specification" },
        { name: "KnowledgeGraph Engine", type: "component", description: "Motore di visualizzazione topologica a forze D3" },
        { name: "Cloud Firestore", type: "database", description: "Database NoSQL realtime e persistente" },
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Motore di elaborazione e strutturazione semantica" }
      ],
      relations: [
        { targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)", relationType: "governs", weight: 0.95, description: "Definisce il quadro di riferimento per le operazioni degli agenti" },
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "implements", weight: 0.9, description: "Fornisce le linee guida di interazione per Claude" },
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "integrates", weight: 0.9, description: "Utilizza Gemini come motore di inferenza principale" },
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "documents", weight: 1.0, description: "Espone l'architettura tecnica dettagliata" }
      ],
      markdownContent: `---
okf_version: "0.2"
version: "1.2.0"
author: "Core Architecture Team & adlibros"
status: "stable"
license: "MIT"
title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
type: "specification"
domain: "Knowledge Systems & AI Architecture"
tags: ["knowledge", "readme", "okf-v0.2", "architecture", "overview", "ai-agents"]
created_at: "2026-08-29T10:00:00Z"
dependencies:
  - "Node.js >= 18"
  - "Cloud Firestore"
  - "D3.js v7"
  - "@google/genai"
  - "Vite & React 18"
prerequisites:
  - "Node.js 18+"
  - "Firebase Firestore Project"
  - "Google Gemini API Key"
entities:
  - name: "Knowledge Vault"
    type: "system"
    description: "Piattaforma centrale per documentazione e ontologia AI"
  - name: "OKF v0.2"
    type: "standard"
    description: "Open Knowledge Format specification"
  - name: "KnowledgeGraph Engine"
    type: "component"
    description: "Motore di visualizzazione topologica a forze D3"
  - name: "Cloud Firestore"
    type: "database"
    description: "Database NoSQL realtime e persistente"
  - name: "Gemini 3.7 Flash"
    type: "ai_model"
    description: "Motore di elaborazione e strutturazione semantica"
relations:
  - target_title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relation_type: "governs"
    weight: 0.95
    description: "Definisce il quadro di riferimento per le operazioni degli agenti"
  - target_title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)"
    relation_type: "implements"
    weight: 0.9
    description: "Fornisce le linee guida di interazione per Claude"
  - target_title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)"
    relation_type: "integrates"
    weight: 0.9
    description: "Utilizza Gemini come motore di inferenza principale"
  - target_title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
    relation_type: "documents"
    weight: 1.0
    description: "Espone l'architettura tecnica dettagliata"
---

# Knowledge Vault (OKF v0.2)

> **Repository di Conoscenza Ontologica, Schemi di Prompt e Toolchain per Agenti Autonomi ed Ingegneri IA**

---

## 1. Visione del Progetto & Obiettivi
Il **[[Knowledge Vault]]** è un hub avanzato per sviluppatori, ingegneri del prompt e agenti IA (Claude Code, Gemini, Copilot) che trasforma la documentazione tecnica eterogenea in un **grafo topologico di conoscenza interconnessa**.

L'obiettivo primario è superare la frammentazione dei formati tecnici attraverso lo standard **[[OKF v0.2]]** (Open Knowledge Format), che arricchisce ogni frammento documentale con un frontmatter YAML rigoroso contenente entità canoniche, tag semantici, relazioni pesate e collegamenti al grafo di conoscenza.

\`\`\`
+-------------------------------------------------------------------------+
|                           KNOWLEDGE VAULT                               |
|                                                                         |
|   +-------------------+   +--------------------+   +----------------+   |
|   |  Capture Bar &    |   |  Gemini 3.7 Flash  |   |  OKF v0.2      |   |
|   |  Multi-Format In  |-->|  Structured Engine |-->|  Serializer    |   |
|   +-------------------+   +--------------------+   +----------------+   |
|                                                            |            |
|                                                            v            |
|   +-------------------+   +--------------------+   +----------------+   |
|   |  KnowledgeGraph   |<--|  Cloud Firestore   |<--|  User & Agent  |   |
|   |  D3.js Topology   |   |  Realtime Sync     |   |  Security Rules|   |
|   +-------------------+   +--------------------+   +----------------+   |
+-------------------------------------------------------------------------+
\`\`\`

---

## 2. Funzionalità Chiave dell'Applicativo

### A. Grafo Topologico D3 Force Simulation
- **Simulazione a Forze Fisiche**: Disposizione automatica dei nodi con repulsione elettrostatica (\`d3.forceManyBody\`), collisione anticompenetrazione (\`d3.forceCollide\`) e vincolo di centratura.
- **Risoluzione Relazionale Multilivello**: 
  1. *Relazioni OKF v0.2 Esplicite*: Archi direzionali color Oro Champagne con freccia (\`marker-end\`) e peso 1.0.
  2. *Entità Ontologiche Condivise*: Archi Ciano (\`weight: 0.85-1.0\`).
  3. *Menzioni nel Testo (Wikilinks)*: Archi Viola (\`weight: 0.80\`).
  4. *Tag Comuni & Domini*: Archi Ambra Tratteggiati e Smeraldo.
- **Nodi Hub Concetto**: Raggruppamento dinamico dei nodi per entità o per dominio di appartenenza.
- **Interattività**: Zoom continuo (0.2x - 5x), drag & drop dei nodi con fissaggio coordinate (\`fx\`, \`fy\`), evidenziazione di vicinato al passaggio del mouse.

### B. Motore di Cattura Intelligente & Gemini AI
- **Analisi Eterogenea Istantanea**: Inserimento tramite prompt di testo, link web, repository GitHub, server MCP o file Markdown.
- **Structured Output Rigoroso**: Generazione di JSON conforme a schema tramite \`gemini-3.7-flash\` con fallback resiliente a \`gemini-flash-latest\` e parser euristico locale a 0ms di latenza.
- **Traduzione & Localizzazione Tecnica**: Traduzione istantanea in italiano con mantenimento rigoroso di frammenti di codice, comandi bash e schemi JSON.
- **Sintesi Esecutiva & Valutazione AI**: Calcolo del punteggio di utilità (1-100), casi d'uso concreti, pro, contro e action items.

### C. Standard OKF v0.2 (Open Knowledge Format)
Ogni risorsa possiede un'identità ontologica precisa:
- **Tipi di Documento Supportati**: \`concept\`, \`specification\`, \`architecture\`, \`guide\`, \`snippet\`, \`troubleshooting\`.
- **Compatibilità Portatile**: Esportazione in file \`.okf.md\` standardizzati, compatibili con Obsidian, Logseq e qualsiasi parser CommonMark.

### D. Persistenza Realtime Cloud Firestore
- **Sincronizzazione Reattiva**: Utilizzo di \`onSnapshot\` per aggiornamenti istantanei in tempo reale.
- **Isolamento Multi-Utente**: Autenticazione con Google Popup o sessione Ospite (Anonymous Auth), con regole Firestore che proteggono i dati dell'utente (\`where("userId", "==", uid)\`).

---

## 3. Guida Rapida all'Uso del Vault

### Inserire una Nuova Risorsa
1. Cliccare sulla **Barra di Cattura** in alto o premere il pulsante **"+ Aggiungi Risorsa"**.
2. Digitare un URL (es. \`https://github.com/anthropics/anthropic-quickstarts\`), una stringa di configurazione MCP o incollare un testo descrittivo.
3. Il sistema estrae automaticamente i metadati, genera la scheda tecnica e collega il nodo al grafo topologico.

### Esplorare il Grafo delle Connessioni
1. Cliccare su **"Grafo Topologico"** nella barra laterale sinistra.
2. Usare la rotella del mouse per zoomare e trascinare i nodi per riorganizzare la vista.
3. Cliccare su un nodo per aprire il **[[KnowledgeReader]]** o il dettaglio della risorsa.
`
    }
  },

  // 2. AGENTS.md
  {
    type: "knowledge",
    title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)",
    url: "https://github.com/knowledge-vault/agents-protocol",
    summary: "Linee guida di ingaggio, vincoli architetturali, protocolli di esecuzione e standard di persistenza per agenti intelligenti che operano sul Knowledge Vault.",
    tags: ["knowledge", "agents", "protocol", "okf-v0.2", "governance"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      version: "1.1.0",
      author: "Autonomous Governance Committee",
      status: "stable",
      license: "Apache-2.0",
      domain: "Autonomous Agents & Governance",
      docType: "guide",
      dependencies: ["OKF v0.2 Specification", "Cloud Firestore Rules", "Express Security Middleware"],
      prerequisites: ["AI Studio Container Environment", "Authentication Token"],
      entities: [
        { name: "Autonomous Agent", type: "concept", description: "Agente IA in grado di eseguire compiti e aggiornare il vault" },
        { name: "OKF v0.2", type: "standard", description: "Specifiche del formato dati accettato" },
        { name: "Cloud Firestore", type: "database", description: "Storage autoritativo per la conoscenza" },
        { name: "KnowledgeGraph Engine", type: "component", description: "Grafo semantico per la navigazione delle relazioni" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "references", weight: 0.9, description: "Fa riferimento alle specifiche generali" },
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "coordinates_with", weight: 0.85, description: "Allineamento operativo con i comandi di Claude" },
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "uses_engine", weight: 0.9, description: "Utilizza Gemini per la strutturazione dei metadati" }
      ],
      markdownContent: `---
okf_version: "0.2"
version: "1.1.0"
author: "Autonomous Governance Committee"
status: "stable"
license: "Apache-2.0"
title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
type: "guide"
domain: "Autonomous Agents & Governance"
tags: ["knowledge", "agents", "protocol", "okf-v0.2", "governance"]
created_at: "2026-08-29T10:15:00Z"
dependencies:
  - "OKF v0.2 Specification"
  - "Cloud Firestore Rules"
  - "Express Security Middleware"
prerequisites:
  - "AI Studio Container Environment"
  - "Authentication Token"
entities:
  - name: "Autonomous Agent"
    type: "concept"
    description: "Agente IA in grado di eseguire compiti e aggiornare il vault"
  - name: "OKF v0.2"
    type: "standard"
    description: "Specifiche del formato dati accettato"
  - name: "Cloud Firestore"
    type: "database"
    description: "Storage autoritativo per la conoscenza"
  - name: "KnowledgeGraph Engine"
    type: "component"
    description: "Grafo semantico per la navigazione delle relazioni"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "references"
    weight: 0.9
  - target_title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)"
    relation_type: "coordinates_with"
    weight: 0.85
  - target_title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)"
    relation_type: "uses_engine"
    weight: 0.9
---

# Protocolli Operativi per Agenti Autonomi (AGENTS.md)

> **Regole di Ingaggio, Vincoli di Sviluppo e Standard di Esecuzione per Agenti AI nel Knowledge Vault**

---

## 1. Principi Fondamentali di Governance

Tutti gli agenti autonomi (compresi Claude Code, Gemini Agent, Cursor e sub-agenti di ingestione) che interagiscono con il Vault devono rispettare rigorosamente i seguenti protocolli operativi:

### A. Conformità Rigorosa allo Standard OKF v0.2
Ogni documento generato, modificato o importato nel Vault deve includere il blocco frontmatter YAML valido con le seguenti proprietà minime obbligatorie:
- \`okf_version: "0.2"\`
- \`title\`: Titolo chiaro, canonico e privo di prefissi ridondanti
- \`type\`: Uno tra \`concept\`, \`specification\`, \`architecture\`, \`guide\`, \`tool_description\`, \`prompt_skill\`
- \`domain\`: Ambito di applicazione (es. \`Knowledge Systems & AI Architecture\`, \`Data Engineering\`, \`Security\`)
- \`tags\`: Almeno 3-7 etichette in lettere minuscole
- \`entities\`: Array di oggetti con \`name\`, \`type\` e \`description\`
- \`relations\`: Array di relazioni pesate con \`target_title\`, \`relation_type\` e \`weight\`

### B. Isolamento e Sicurezza Cloud
- **Zero API Key nel Bundle Client**: Nessuna chiave privata o credenziale deve transitare nel codice frontend. Tutte le richieste AI devono passare per le rotte Express sicure \`/api/*\`.
- **Filtro Utente Firestore**: Qualsiasi operazione di lettura o scrittura su Firestore deve verificare il parametro \`where("userId", "==", uid)\` per rispettare le regole di sicurezza \`firestore.rules\`.

---

## 2. Flusso di Ingestione Risorse (Pipeline in 4 Fasi)

\`\`\`
  [Raw Input / URL / File]
             |
             v
   (Fase 1: Parsing) --------> Invia payload a /api/analyze-resource o /api/process-knowledge
             |
             v
   (Fase 2: Validazione) ----> Verifica presenza di title, summary, tags, entities, relations
             |
             v
   (Fase 3: Persistenza) ----> Scrittura Firestore con userId, createdAt e updatedAt
             |
             v
   (Fase 4: Telemetria) -----> Emissione evento strutturato nel log di diagnostica
\`\`\`

1. **Fase 1 (Parsing Semantico)**: Inviare il payload grezzo a \`/api/analyze-resource\` o \`/api/process-knowledge\`.
2. **Fase 2 (Validazione Strutturale)**: Verificare che l'output contenga un riassunto esaustivo, entità nominate e relazioni topologiche coerenti.
3. **Fase 3 (Persistenza Atomica)**: Scrivere il documento su Firestore allegando \`userId\`, \`createdAt: serverTimestamp()\` e \`updatedAt: serverTimestamp()\`.
4. **Fase 4 (Notifica & Logging)**: Emettere un log strutturato con categoria \`CAPTURE\` o \`FIRESTORE\` per mantenere tracciabilità nella console di diagnostica.

---

## 3. Gestione dei Nomi Canonici delle Entità
Per consentire al motore D3 di tracciare correttamente gli archi nel grafo senza creare nodi duplicati o frammentati, gli agenti devono utilizzare nomi canonici internazionalmente riconosciuti:

| Entità Raw / Sinonimo | Denominazione Canonica Obbligatoria |
| :--- | :--- |
| \`mcp\`, \`model context proto\` | \`Model Context Protocol\` |
| \`claude-cli\`, \`claude terminal\` | \`Claude Code\` |
| \`gemini-flash\`, \`gemini 3.7\` | \`Gemini 3.7 Flash\` |
| \`ts\`, \`typescript lang\` | \`TypeScript\` |
| \`firestore db\`, \`google firestore\` | \`Cloud Firestore\` |
| \`d3\`, \`d3js\` | \`D3.js\` |
`
    }
  },

  // 3. CLAUDE.md
  {
    type: "knowledge",
    title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)",
    url: "https://github.com/knowledge-vault/claude-spec",
    summary: "Specifiche per l'integrazione di Claude Code nel workflow di sviluppo del Vault: comandi di build, linter, gestione dello stack e pattern di codifica React/TypeScript.",
    tags: ["knowledge", "claude", "anthropic", "cli", "workflow", "typescript"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      version: "1.0.4",
      author: "Anthropic Tooling & Engineering",
      status: "stable",
      license: "MIT",
      domain: "Developer Tooling & CLI",
      docType: "guide",
      dependencies: ["@anthropic-ai/claude-code", "TypeScript 5.x", "Node.js 18+", "Vite 6.x"],
      prerequisites: ["Claude Terminal CLI installed", "Anthropic Account / API Access"],
      entities: [
        { name: "Claude Code", type: "tool", description: "Agente CLI per terminale sviluppato da Anthropic" },
        { name: "Anthropic", type: "organization", description: "Sviluppatore di Claude e specifiche MCP" },
        { name: "TypeScript", type: "language", description: "Linguaggio di implementazione del progetto" },
        { name: "KnowledgeGraph Engine", type: "component", description: "Componente interattivo di rendering del grafo" }
      ],
      relations: [
        { targetTitle: "Claude Code: Guida al Terminale Agentico", relationType: "documents", weight: 0.95, description: "Approfondimento sul tool Claude Code" },
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "relates_to", weight: 0.88, description: "Descrizione dell'architettura implementata" },
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "uses_protocol", weight: 0.92, description: "Integrazione con server e tool MCP" }
      ],
      markdownContent: `---
okf_version: "0.2"
version: "1.0.4"
author: "Anthropic Tooling & Engineering"
status: "stable"
license: "MIT"
title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)"
type: "guide"
domain: "Developer Tooling & CLI"
tags: ["knowledge", "claude", "anthropic", "cli", "workflow", "typescript"]
created_at: "2026-08-29T10:20:00Z"
dependencies:
  - "@anthropic-ai/claude-code"
  - "TypeScript 5.x"
  - "Node.js 18+"
  - "Vite 6.x"
prerequisites:
  - "Claude Terminal CLI installed"
  - "Anthropic Account / API Access"
entities:
  - name: "Claude Code"
    type: "tool"
    description: "Agente CLI per terminale sviluppato da Anthropic"
  - name: "Anthropic"
    type: "organization"
    description: "Sviluppatore di Claude e specifiche MCP"
  - name: "TypeScript"
    type: "language"
    description: "Linguaggio di implementazione del progetto"
  - name: "KnowledgeGraph Engine"
    type: "component"
    description: "Componente interattivo di rendering del grafo"
relations:
  - target_title: "Claude Code: Guida al Terminale Agentico"
    relation_type: "documents"
    weight: 0.95
  - target_title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
    relation_type: "relates_to"
    weight: 0.88
  - target_title: "Guida Completa al Model Context Protocol (MCP)"
    relation_type: "uses_protocol"
    weight: 0.92
---

# Specifiche Operative Claude Code e Toolchain (CLAUDE.md)

> **Manuale Operativo di Sviluppo, Standard di Codifica e Comandi Toolchain per Claude Code**

---

## 1. Comandi di Esecuzione & Verifica

Per mantenere la build sempre verde e validare le modifiche al codice:

\`\`\`bash
# 1. Avvio Server di Sviluppo Full-Stack (Express + Vite Middleware su porta 3000)
npm run dev

# 2. Controllo di Sintassi & TypeScript Type-Checking
npm run lint

# 3. Compilazione Produzione (Bundle Vite SPA + Esbuild Node CJS per server.ts)
npm run build

# 4. Avvio Produzione
npm run start
\`\`\`

---

## 2. Standard di Codifica & Linee Guida Architetturali

### A. TypeScript & Rigore dei Tipi
- Mantenere tutti i tipi e le interfacce condivise in \`src/types.ts\`.
- Non usare \`any\` per strutture dati centrali (come \`ResourceItem\`, \`OKFEntity\`, \`GraphNode\`, \`GraphLink\`).
- Utilizzare enums standard ed evitare destructuring di namespace.

### B. Gestione dello Stato & Ottimizzazione React
- **Prevenzione Infinite Re-render**: Non passare mai oggetti o array instabili come dipendenze dei \`useEffect\`.
- **Memoizzazione Grafo D3**: La simulazione fisica di D3 deve essere isolata in un \`useRef\` e montata solo all'apertura o al cambio di dataset.
- **Sanitizzazione Firestore**: Tutti i payload diretti a Firestore devono passare attraverso \`sanitizeForFirestore\` per rimuovere campi \`undefined\` ed evitare crash di scrittura.

### C. Pattern di Presentazione Modal & Reader
- I modali e le finestre di dialogo devono supportare la chiusura con tasto **Escape**, click sul backdrop e pulsanti di chiusura evidenti con contrasto cromatico elevato.
- Le sezioni Markdown devono essere completamente formattate con stili \`prose prose-invert\`, font leggibile e syntax highlighting per i blocchi di codice.
`
    }
  },

  // 4. GEMINI.md
  {
    type: "knowledge",
    title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)",
    url: "https://github.com/knowledge-vault/gemini-engine",
    summary: "Configurazione del motore analitico Gemini 3.7 / 2.5 Flash: prompt di sistema, schemi JSON di risposta, gestione dei timeout e fallback euristico locale.",
    tags: ["knowledge", "gemini", "ai-engine", "json-schema", "prompt-engineering"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      version: "2.1.0",
      author: "Google Cloud & AI Engineering",
      status: "stable",
      license: "Apache-2.0",
      domain: "AI Model Engineering & Inference",
      docType: "specification",
      dependencies: ["@google/genai", "express", "zod", "Node.js 18+"],
      prerequisites: ["GEMINI_API_KEY environment variable", "Google Cloud Project"],
      entities: [
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Modello primario per generazione di schemi JSON strutturati" },
        { name: "Gemini 2.5 Flash", type: "ai_model", description: "Modello secondario ad alta velocità e resilienza" },
        { name: "Google GenAI SDK", type: "sdk", description: "Libreria ufficiale per comunicazioni server-side sicure" },
        { name: "OKF v0.2", type: "standard", description: "Struttura di destinazione per le estrazioni del modello" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "powers", weight: 0.95, description: "Fornisce l'infrastruttura AI per l'intero vault" },
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "integrates_into", weight: 0.9, description: "Integrato nel server Express backend" },
        { targetTitle: "Gemini 2.5 Structured Extractor", relationType: "implements_skill", weight: 0.95, description: "Skill specialistica per il parsing dei dati" }
      ],
      markdownContent: `---
okf_version: "0.2"
version: "2.1.0"
author: "Google Cloud & AI Engineering"
status: "stable"
license: "Apache-2.0"
title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)"
type: "specification"
domain: "AI Model Engineering & Inference"
tags: ["knowledge", "gemini", "ai-engine", "json-schema", "prompt-engineering"]
created_at: "2026-08-29T10:25:00Z"
dependencies:
  - "@google/genai"
  - "express"
  - "zod"
  - "Node.js 18+"
prerequisites:
  - "GEMINI_API_KEY environment variable"
  - "Google Cloud Project"
entities:
  - name: "Gemini 3.7 Flash"
    type: "ai_model"
    description: "Modello primario per generazione di schemi JSON strutturati"
  - name: "Gemini 2.5 Flash"
    type: "ai_model"
    description: "Modello secondario ad alta velocità e resilienza"
  - name: "Google GenAI SDK"
    type: "sdk"
    description: "Libreria ufficiale per comunicazioni server-side sicure"
  - name: "OKF v0.2"
    type: "standard"
    description: "Struttura di destinazione per le estrazioni del modello"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "powers"
    weight: 0.95
  - target_title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
    relation_type: "integrates_into"
    weight: 0.9
  - target_title: "Gemini 2.5 Structured Extractor"
    relation_type: "implements_skill"
    weight: 0.95
---

# Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)

> **Linee Guida per l'Orchestrazione del Modello Gemini, Parsing Strutturato e Gestione Resiliente del Fallback**

---

## 1. Modelli Supportati & Gerarchia di Esecuzione

Il backend di Knowledge Vault orchestra le chiamate di inferenza tramite l'SDK ufficiale \`@google/genai\` rispettando la seguente pipeline di fallback in caso di rate-limiting (429) o indisponibilità temporanea (503):

\`\`\`
[Richiesta Client /api/*]
          |
          v
+-----------------------+   Successo
| 1. gemini-3.7-flash   |-------------> JSON Validato (Latenza ~800ms)
+-----------------------+
          | Errore / Quota
          v
+-----------------------+   Successo
| 2. gemini-flash-latest|-------------> JSON Validato
+-----------------------+
          | Errore / Quota
          v
+-----------------------+   Successo
| 3. gemini-3.1-flash-l |-------------> JSON Validato
+-----------------------+
          | Timeout (>20s) o indisponibilità
          v
+-----------------------+
| 4. Fallback Euristico |-------------> Parser Locale a Regole (0ms Latenza)
+-----------------------+
\`\`\`

---

## 2. Schema di Risposta JSON Structured Output

L'endpoint principale \`/api/analyze-resource\` e il nuovo generatore approfondito \`/api/expand-documentation\` utilizzano JSON schema rigorosi con validazione dei tipi:

\`\`\`typescript
const okfAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING }, // 'knowledge' | 'github_repo' | 'mcp_server' | 'ai_skill' | 'article'
    title: { type: Type.STRING },
    summary: { type: Type.STRING }, // Sintesi esecutiva in italiano
    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
    metadata: {
      type: Type.OBJECT,
      properties: {
        okfVersion: { type: Type.STRING }, // "0.2"
        domain: { type: Type.STRING },
        docType: { type: Type.STRING },
        entities: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING },
              description: { type: Type.STRING }
            }
          }
        },
        relations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetTitle: { type: Type.STRING },
              relationType: { type: Type.STRING },
              weight: { type: Type.NUMBER },
              description: { type: Type.STRING }
            }
          }
        },
        markdownContent: { type: Type.STRING } // Documentazione tecnica integrale OKF
      }
    }
  }
};
\`\`\`
`
    }
  },

  // 5. ARCHITECTURE.md
  {
    type: "knowledge",
    title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)",
    url: "https://github.com/knowledge-vault/system-architecture",
    summary: "Descrizione dettagliata dell'architettura client-server: React 18, Express, motore di simulazione D3.js, sincronizzazione realtime con Cloud Firestore e sicurezza.",
    tags: ["knowledge", "architecture", "full-stack", "d3-graph", "firestore", "express"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      version: "2.0.0",
      author: "System Architect & adlibros",
      status: "stable",
      license: "MIT",
      domain: "Software Architecture & Distributed Systems",
      docType: "architecture",
      dependencies: ["React 18", "Express 4.x", "Firebase JS SDK 10+", "D3.js v7", "Tailwind CSS"],
      prerequisites: ["Node.js 18+", "Firebase Firestore Security Rules"],
      entities: [
        { name: "KnowledgeGraph Engine", type: "component", description: "Motore di simulazione a forze D3" },
        { name: "Cloud Firestore", type: "database", description: "Database NoSQL scalabile per memorizzazione persistente" },
        { name: "Express Server", type: "backend", description: "Backend proxy per API protette e inferenza AI" },
        { name: "Knowledge Vault", type: "system", description: "Applicazione complessiva" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "detailed_in", weight: 1.0, description: "Documentazione architetturale completa" },
        { targetTitle: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)", relationType: "contains", weight: 0.95, description: "Dettaglio del sottosistema di rendering grafico" },
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "communicates_with", weight: 0.9, description: "Interfaccia con le API generative di backend" }
      ],
      markdownContent: `---
okf_version: "0.2"
version: "2.0.0"
author: "System Architect & adlibros"
status: "stable"
license: "MIT"
title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
type: "architecture"
domain: "Software Architecture & Distributed Systems"
tags: ["knowledge", "architecture", "full-stack", "d3-graph", "firestore", "express"]
created_at: "2026-08-29T10:30:00Z"
dependencies:
  - "React 18"
  - "Express 4.x"
  - "Firebase JS SDK 10+"
  - "D3.js v7"
  - "Tailwind CSS"
prerequisites:
  - "Node.js 18+"
  - "Firebase Firestore Security Rules"
entities:
  - name: "KnowledgeGraph Engine"
    type: "component"
    description: "Motore di simulazione a forze D3"
  - name: "Cloud Firestore"
    type: "database"
    description: "Database NoSQL scalabile per memorizzazione persistente"
  - name: "Express Server"
    type: "backend"
    description: "Backend proxy per API protette e inferenza AI"
  - name: "Knowledge Vault"
    type: "system"
    description: "Applicazione complessiva"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "detailed_in"
    weight: 1.0
  - target_title: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)"
    relation_type: "contains"
    weight: 0.95
  - target_title: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)"
    relation_type: "communicates_with"
    weight: 0.9
---

# Architettura di Sistema Full-Stack (ARCHITECTURE.md)

> **Specifiche Architetturali Dettagliate, Schema dei Moduli e Topologia del Flusso Dati**

---

## 1. Topologia dei Componenti di Sistema

Il Knowledge Vault adotta un'architettura **Full-Stack reattiva e modulare** progettata per combinare la velocità di un client React 18 con la sicurezza e l'isolamento di un backend Express:

\`\`\`
+-------------------------------------------------------------------------------+
|                            CLIENT BROWSER (SPA)                               |
|                                                                               |
|  +---------------------+   +---------------------+   +---------------------+  |
|  | Header & CaptureBar |   |  ResourceCard/Table |   |  KnowledgeGraph     |  |
|  | (Ingestione Rapida) |   |  (Esplorazione)     |   |  (D3 Force Engine)  |  |
|  +---------------------+   +---------------------+   +---------------------+  |
|             |                         |                         |             |
|  +-------------------------------------------------------------------------+  |
|  |                     ResourceModal & KnowledgeReader                     |  |
|  |        (Viewer Markdown, OKF Spec, Insights AI, Traduzione)             |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
       | (Sottoscrizione Realtime onSnapshot)               | (Chiamate API Proxy)
       v                                                    v
+------------------------------+             +----------------------------------+
|   CLOUD FIRESTORE & AUTH     |             |      EXPRESS BACKEND SERVER      |
|                              |             |                                  |
| - Collezione: /resources     |             | - POST /api/analyze-resource     |
| - Autenticazione: Google/Anon|             | - POST /api/process-knowledge    |
| - Regole per utente (RBAC)   |             | - POST /api/expand-documentation |
| - Query indicizzate          |             | - POST /api/translate-resource   |
+------------------------------+             | - POST /api/generate-insights    |
                                             +----------------------------------+
                                                            | (SDK Google GenAI)
                                                            v
                                             +----------------------------------+
                                             |       GOOGLE GEMINI API          |
                                             | - gemini-3.7-flash (Primario)    |
                                             | - gemini-flash-latest            |
                                             +----------------------------------+
\`\`\`

---

## 2. Strato di Storage & Persistenza Cloud Firestore

### Struttura del Documento Firestore (\`/resources/{docId}\`)
- \`userId\`: String (Identificativo univoco dell'utente autenticato)
- \`type\`: String (\`knowledge\`, \`github_repo\`, \`mcp_server\`, \`ai_skill\`, \`article\`, \`troubleshooting\`, \`link\`)
- \`title\`: String (Titolo della risorsa)
- \`summary\`: String (Sintesi esecutiva in italiano)
- \`tags\`: Array<String>
- \`isFavorite\`: Boolean
- \`metadata\`: Map (Metadati verticali, \`entities\`, \`relations\`, \`markdownContent\`, \`configSnippet\`, \`systemPrompt\`)
- \`createdAt\`: Timestamp
- \`updatedAt\`: Timestamp

---

## 3. Gestione della Sicurezza e Isolamento
1. **Protezione Credenziali**: Le chiavi segrete come \`GEMINI_API_KEY\` sono memorizzate esclusivamente nelle variabili d'ambiente del server e non vengono mai inoltrate al client.
2. **Access Control**: Le regole di sicurezza \`firestore.rules\` impediscono a qualsiasi utente di leggere o manipolare le risorse di altri utenti.
`
    }
  },

  // 6. KnowledgeGraph Component Deep-Dive
  {
    type: "knowledge",
    title: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)",
    url: "https://github.com/knowledge-vault/knowledge-graph-engine",
    summary: "Specifiche tecniche dell'algoritmo di simulazione a forze fisiche, calcolo del peso degli archi, rilevamento entità condivise e filtri topologici interattivi.",
    tags: ["knowledge", "d3", "graph", "topology", "algorithms", "physics-simulation"],
    isFavorite: false,
    metadata: {
      okfVersion: "0.2",
      version: "1.4.2",
      author: "Graph & Visualization Lab",
      status: "stable",
      license: "MIT",
      domain: "Data Visualization & Graph Theory",
      docType: "guide",
      dependencies: ["d3 ^7.9.0", "@types/d3 ^7.4.3", "lucide-react", "React 18"],
      prerequisites: ["SVG Canvas DOM context", "Normalized OKF Resource Dataset"],
      entities: [
        { name: "KnowledgeGraph Engine", type: "component", description: "Engine basato su D3 v7 force simulation" },
        { name: "D3.js", type: "library", description: "Libreria per visualizzazioni dati guidate da documenti" },
        { name: "OKF v0.2", type: "standard", description: "Specifica ontologica che alimenta i nodi del grafo" }
      ],
      relations: [
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "part_of", weight: 0.95, description: "Modulo grafico centrale dell'architettura" },
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "features_in", weight: 0.9, description: "Esposto come vista principale nella navbar" }
      ],
      markdownContent: `---
okf_version: "0.2"
version: "1.4.2"
author: "Graph & Visualization Lab"
status: "stable"
license: "MIT"
title: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)"
type: "guide"
domain: "Data Visualization & Graph Theory"
tags: ["knowledge", "d3", "graph", "topology", "algorithms", "physics-simulation"]
created_at: "2026-08-29T10:35:00Z"
dependencies:
  - "d3 ^7.9.0"
  - "@types/d3 ^7.4.3"
  - "lucide-react"
  - "React 18"
prerequisites:
  - "SVG Canvas DOM context"
  - "Normalized OKF Resource Dataset"
entities:
  - name: "KnowledgeGraph Engine"
    type: "component"
    description: "Engine basato su D3 v7 force simulation"
  - name: "D3.js"
    type: "library"
    description: "Libreria per visualizzazioni dati guidate da documenti"
  - name: "OKF v0.2"
    type: "standard"
    description: "Specifica ontologica che alimenta i nodi del grafo"
relations:
  - target_title: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)"
    relation_type: "part_of"
    weight: 0.95
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "features_in"
    weight: 0.9
---

# Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)

> **Specifiche dell'Algoritmo di Simulazione a Forze Fisiche, Calcolo Pesi e Rendering Interattivo SVG**

---

## 1. Algoritmo di Risoluzione Relazionale su 5 Livelli

Il motore topologico analizza l'intero dataset di risorse calcolando la matrice di affinità tra tutte le coppie di documenti:

\`\`\`
LIVELLO 1: Relazioni OKF v0.2 Dirette (Colore: #C5A059 Oro Champagne)
           -> Peso: 1.0 (Freccia direzionale attiva)

LIVELLO 2: Entità Ontologiche Condivise (Colore: #06B6D4 Ciano Elettrico)
           -> Peso: 0.85 - 1.0 (In base al numero di entità comuni)

LIVELLO 3: Citazioni Semantiche & Wikilinks (Colore: #A855F7 Viola Ametista)
           -> Peso: 0.80 (Rilevamento [[Nome Documento]])

LIVELLO 4: Tag Semantici Comuni (Colore: #F59E0B Ambra Tratteggiata)
           -> Peso: 0.60 - 0.95 (Formula: min(0.95, 0.5 + tagCount * 0.15))

LIVELLO 5: Dominio di Conoscenza Congiunto (Colore: #10B981 Smeraldo)
           -> Peso: 0.55
\`\`\`

---

## 2. Configurazione della Simulazione Fisica D3

La simulazione è configurata per garantire stabilità visiva ed evitare oscillazioni infinite:

\`\`\`typescript
const simulation = d3.forceSimulation<GraphNode>(nodes)
  // 1. Vincolo di connessione tra nodi collegati da archi
  .force("link", d3.forceLink<GraphNode, GraphLink>(links)
    .id((d) => d.id)
    .distance((d) => 120 / (d.weight || 0.7))
    .strength((d) => Math.min(1.0, (d.weight || 0.5) * 0.8))
  )
  // 2. Repulsione elettrostatica tra tutti i nodi
  .force("charge", d3.forceManyBody().strength(-380).distanceMax(600))
  // 3. Collisione fisica per evitare sovrapposizione visiva
  .force("collide", d3.forceCollide<GraphNode>().radius((d) => (d.isEntityNode ? 22 : 36)).iterations(3))
  // 4. Centratura nel canvas
  .force("center", d3.forceCenter(width / 2, height / 2).strength(0.08))
  // 5. Smorzamento velocità (Alpha decay)
  .alphaDecay(0.022);
\`\`\`

---

## 3. Gestione del Drag & Drop e Zoom

- **Drag Handler**: Quando l'utente trascina un nodo, le coordinate \`fx\` e \`fy\` vengono fissate. All'evento \`dragEnd\`, le coordinate rimangono bloccate per consentire la riorganizzazione manuale del layout.
- **Zoom & Pan**: Supporto completo per zoom da 0.2x a 5x con preservazione della matrice di trasformazione SVG.
`
    }
  },

  // 7. Claude Code Guide
  {
    type: "knowledge",
    title: "Claude Code: Guida al Terminale Agentico",
    url: "https://anthropic.com/claude-code",
    summary: "Guida completa allo strumento da riga di comando sviluppato da Anthropic per assistere gli sviluppatori direttamente nel terminale con loop agentico e integrazione Git.",
    tags: ["knowledge", "claude", "anthropic", "cli", "agentic-ai", "git"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "AI Development Tools",
      docType: "concept",
      entities: [
        { name: "Claude Code", type: "tool", description: "Agentic CLI tool" },
        { name: "Anthropic", type: "organization", description: "Creatore di Claude e del Model Context Protocol" },
        { name: "Git", type: "tool", description: "Sistema di controllo versione integrato nel loop agentico" }
      ],
      relations: [
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "documented_by", weight: 0.95, description: "Configurazione e comandi operativi" },
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "leverages", weight: 0.9, description: "Utilizzo di tool ed estensioni MCP" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Claude Code: Guida al Terminale Agentico"
type: "concept"
domain: "AI Development Tools"
tags: ["knowledge", "claude", "anthropic", "cli", "agentic-ai", "git"]
created_at: "2026-08-29T10:40:00Z"
entities:
  - name: "Claude Code"
    type: "tool"
    description: "Agentic CLI tool"
  - name: "Anthropic"
    type: "organization"
    description: "Creatore di Claude e del Model Context Protocol"
  - name: "Git"
    type: "tool"
    description: "Sistema di controllo versione integrato nel loop agentico"
relations:
  - target_title: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)"
    relation_type: "documented_by"
    weight: 0.95
  - target_title: "Guida Completa al Model Context Protocol (MCP)"
    relation_type: "leverages"
    weight: 0.9
---

# Claude Code: Guida al Terminale Agentico

> **Guida Completa all'Utilizzo di Claude Code nel Workflow Quotidiano di Ingegneria del Software**

---

## 1. Panoramica dello Strumento

**Claude Code** è un tool agentico a riga di comando (CLI) sviluppato da **Anthropic** che si integra direttamente nel terminale di sviluppo. A differenza dei plugin di completamento codice tradizionali, Claude Code opera con un ciclo iterativo (Agentic Loop) in grado di:
1. Analizzare la struttura dell'intero repository.
2. Identificare i file rilevanti per un determinato bug o task.
3. Proporre ed eseguire modifiche multi-file coordinate.
4. Eseguire test automatici e compilatori per verificare la correttezza della soluzione prima di completare il turno.

---

## 2. Comandi Principali & Workflow

\`\`\`bash
# Avvio sessione interattiva nella cartella del progetto
claude

# Esecuzione di un task specifico senza entrare in shell interattiva
claude "Risolvi l'errore di tipo TypeScript in src/components/KnowledgeGraph.tsx"

# Revisione dei file modificati e generazione commit semantico Git
claude "Esamina i file modificati e crea un commit con messaggio convenzionale"
\`\`\`

---

## 3. Best Practice per l'Interazione con il Vault

- **Fornire Contesto Chiaro**: Specificare i file rilevanti (\`src/types.ts\`, \`server.ts\`, \`ResourceModal.tsx\`) per restringere il raggio di ricerca dell'agente.
- **Integrazione con MCP**: Utilizzare i server MCP (es. PostgreSQL MCP Server o Filesystem MCP) per consentire a Claude Code di interagire con database e tool esterni.
`
    }
  },

  // 8. Model Context Protocol Guide
  {
    type: "article",
    title: "Guida Completa al Model Context Protocol (MCP)",
    url: "https://modelcontextprotocol.io/introduction",
    summary: "Panoramica dettagliata sullo standard aperto MCP per connettere in modo sicuro assistenti e agenti intelligenti a fonti dati, IDE e strumenti esterni.",
    tags: ["article", "mcp", "architecture", "ai-agents", "standards"],
    isFavorite: false,
    metadata: {
      author: "Anthropic Engineering",
      readingTimeMin: "8 min",
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Standard aperto per l'interoperabilità dei tool IA" },
        { name: "Anthropic", type: "organization", description: "Autore della specifica MCP" }
      ],
      relations: [
        { targetTitle: "Claude Code: Guida al Terminale Agentico", relationType: "supported_by", weight: 0.9, description: "Supportato nativamente da Claude Code" },
        { targetTitle: "PostgreSQL MCP Server", relationType: "implements", weight: 0.95, description: "Esempio pratico di server MCP per database" },
        { targetTitle: "Filesystem MCP Server", relationType: "implements", weight: 0.95, description: "Server MCP per operazioni su filesystem" }
      ],
      keyTakeaways: [
        "Standard aperto per interoperabilità tool/dati",
        "Supporto trasporti stdio per locale e SSE per server remoti",
        "Separazione netta tra Client, Server e Host"
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Guida Completa al Model Context Protocol (MCP)"
type: "guide"
domain: "AI Protocols & Agentic Tooling"
tags: ["article", "mcp", "architecture", "ai-agents", "standards"]
created_at: "2026-08-29T10:45:00Z"
---

# Guida Completa al Model Context Protocol (MCP)

> **Lo Standard Aperto per Connettere Modelli di Linguaggio e Agenti a Strumenti e Basi di Dati Esterne**

---

## 1. Cos'è il Model Context Protocol?

Il **Model Context Protocol (MCP)** è uno standard aperto promosso da Anthropic che stabilisce un protocollo comune di comunicazione tra:
- **Host / Client MCP**: L'applicazione che esegue o orchestra l'LLM (es. Claude Desktop, Claude Code, Cursor, Knowledge Vault).
- **Server MCP**: Moduli indipendenti e leggeri che espongono dati e capacità operative specifiche (es. query a database SQL, operazioni su disco, chiamate a API REST).

\`\`\`
+---------------------+              +-----------------------+
|  Host (Client LLM)  | <--- JSON --->|  MCP Server (Postgres)|
|  - Claude Desktop   |      RPC     |  - Tool: query_sql    |
|  - Agentic Runtime  |      2.0     |  - Resource: schemas  |
+---------------------+              +-----------------------+
\`\`\`

---

## 2. Tipologie di Capacità Esposte dai Server MCP

1. **Tools (Chiamate a Funzione)**: Azioni eseguibili dal modello con parametri tipizzati (es. \`execute_sql\`, \`read_file\`, \`git_status\`).
2. **Resources (Documenti & Dati)**: Contenuti leggibili che possono essere iniettati nel contesto del prompt tramite URI dedicate (\`postgres://schemas/public\`).
3. **Prompts (Template Predefiniti)**: Pattern di conversazione e prompt strutturati pronti all'uso.
`
    }
  },

  // 9. Specifica di Conformità Architetturale: Trilogia Cekikj
  {
    type: "knowledge",
    title: "Specifica di Conformità Architetturale: Trilogia Cekikj (Knowledge Layer, Typed Tools e Contradiction Gate)",
    url: "https://towardsdatascience.com/designing-a-persistent-knowledge-layer-that-refuses-to-guess",
    summary: "Specifica di ingegneria della conoscenza ed epistemic architecture per agenti autonomi basata sulla trilogia di Miodrag Cekikj. Introduce la separazione tra Evidence e Structured Knowledge Layer, 8 Typed Tools read-only, Contradiction Gate esterno al loop, Hard Bounds e Grounding Check.",
    tags: ["knowledge", "specification", "okf-v0.2", "cekikj", "epistemic-layer", "typed-tools", "contradiction-gate", "hard-bounds"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      version: "1.0.0",
      author: "Miodrag Cekikj & Knowledge Vault Team",
      status: "stable",
      license: "MIT",
      domain: "Agentic Systems & Epistemic Architecture",
      docType: "specification",
      entities: [
        { name: "Evidence Layer", type: "layer", description: "Livello di memorizzazione dei chunk testuali grezzi e vettori" },
        { name: "Structured Knowledge Layer", type: "layer", description: "Livello ontologico esplicito di entità canoniche, concetti risolti e relazioni tipizzate" },
        { name: "Typed Tools", type: "toolchain", description: "Suite di 8 strumenti deterministici con envelope standard e flag insufficient" },
        { name: "Contradiction Gate", type: "governance", description: "Compositore a valle indipendente dall'agente che blocca la sintesi in caso di collisione di fonti" },
        { name: "Bounded Loop Engine", type: "orchestration", description: "Macchina a stati finiti con limiti invalicabili su round (max 8), token, timeout e hop nel grafo" },
        { name: "Grounding Verifier", type: "verification", description: "Passata singola di validazione post-sintesi che mappa ogni claim a un edge o citazione della trace" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "extends", weight: 1.0, description: "Eleva il Knowledge Vault a motore epistemico affidabile con garanzie zero-guessing" },
        { targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)", relationType: "governs", weight: 0.95, description: "Stabilisce le regole di ingaggio per agenti esterni che interrogano il Vault" },
        { targetTitle: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)", relationType: "constrains", weight: 0.9, description: "Vincola la navigazione a grafo con traversal tipizzato e limiti di hop" },
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "interfaces", weight: 0.85, description: "Fornisce il protocollo di trasporto per esporre gli 8 Typed Tools agli agenti" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Specifica di Conformità Architetturale: Trilogia Cekikj (Knowledge Layer, Typed Tools e Contradiction Gate)"
type: "specification"
domain: "Agentic Systems & Epistemic Architecture"
tags: ["knowledge", "specification", "okf-v0.2", "cekikj", "epistemic-layer", "typed-tools", "contradiction-gate", "hard-bounds"]
created_at: "2026-09-06T10:00:00Z"
entities:
  - name: "Evidence Layer"
    type: "layer"
    description: "Livello di memorizzazione dei chunk testuali grezzi e vettori"
  - name: "Structured Knowledge Layer"
    type: "layer"
    description: "Livello ontologico esplicito di entità canoniche, concetti risolti e relazioni tipizzate"
  - name: "Typed Tools"
    type: "toolchain"
    description: "Suite di 8 strumenti deterministici con envelope standard e flag insufficient"
  - name: "Contradiction Gate"
    type: "governance"
    description: "Compositore a valle indipendente dall'agente che blocca la sintesi in caso di collisione di fonti"
  - name: "Bounded Loop Engine"
    type: "orchestration"
    description: "Macchina a stati finiti con limiti invalicabili su round (max 8), token, timeout e hop nel grafo"
  - name: "Grounding Verifier"
    type: "verification"
    description: "Passata singola di validazione post-sintesi che mappa ogni claim a un edge o citazione della trace"
relations:
  - target_title: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)"
    relation_type: "extends"
    weight: 1.0
  - target_title: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relation_type: "governs"
    weight: 0.95
  - target_title: "Motore Topologico D3 e Calcolo Relazioni (KnowledgeGraph.tsx)"
    relation_type: "constrains"
    weight: 0.9
  - target_title: "Guida Completa al Model Context Protocol (MCP)"
    relation_type: "interfaces"
    weight: 0.85
---

# Specifica di Conformità Architetturale: Trilogia Cekikj
### *Knowledge Layer, Typed Tools, Hard Bounds e Contradiction Gate*

> **Riferimento accademico/tecnico**: Miodrag Cekikj, *"Designing a Persistent Knowledge Layer That Refuses to Guess"* (Parte 1), *"Making the Knowledge Layer a Graph You Actually Traverse"* (Parte 2), *"Stop Giving Your AI Agent a Search Box and Start Giving It Typed Tools, Hard Bounds, and a Gate It Cannot Talk Past"* (Parte 3) — Towards Data Science / AI Advances.

---

## 1. Tesi Centrali dell'Architettura

1. **Vocabolario degli Strumenti**: *"An agent's reasoning is bounded by the vocabulary of its tools"*. Il ragionamento dell'agente è strettamente vincolato al modello mentale fornitogli dai suoi strumenti.
2. **La Trappola del Search Box**: Uno strumento generico \`vector_search(query)\` con budget di tentativi produce solo *iterated guessing* (congetture riformulate ad ogni iterazione), e non conoscenza verificabile e deterministica.
3. **Il Mondo (Dual-Layer Knowledge)**: L'agente non deve navigare solo frammenti di testo non strutturato (*Evidence Layer*), ma un livello ontologico esplicito di concetti canonici, entità risolte, relazioni tipizzate ed evoluzione temporale (*Structured Knowledge Layer*).
4. **Typed Tools (8 Strumenti Read-Only)**: L'implementazione reale espone 8 contratti fissi con flag esplicito \`insufficient: boolean\`:
   - \`search_evidence(query, filters?)\`: ricerca sui chunk grezzi (evidence).
   - \`search_knowledge(query, filters?)\`: ricerca sulla conoscenza curata/canonica.
   - \`resolve_entity(query_label)\`: da etichetta ambigua a ID canonico o candidati.
   - \`traverse(entity_id, relationship_type, depth=1..2)\`: esplorazione di archi tipizzati con vincolo di hop.
   - \`timeline(entity_id)\`: vista temporale degli stati di un'entità.
   - \`diff(entity_id, date_a, date_b)\`: differenziale tra versioni/stati nel tempo.
   - \`list_contradictions(concept_id)\`: interrogazione del registro delle contraddizioni.
   - \`get_source(chunk_id | edge_id)\`: recupero della fonte puntuale.
5. **Hard Bounds**: Loop compatto (~80 righe), limiti invalicabili (max 8 round, token budget, timeout, max 2 hop). Se un limite scatta, il sistema non collassa: forza la composizione parziale da quanto raccolto e lo dichiara apertamente.
6. **The Contradiction Gate**: Governance fuori dal loop. *"Governance che vive dentro il loop è consultiva; governance che sopravvive all'agenzia deve vivere fuori di esso"*. Un composer a valle verifica indipendentemente le entità toccate e blocca la sintesi forzata se esistono contraddizioni aperte.
7. **Grounding Check**: Passata singola di revisione in cui ogni affermazione deve avere una citazione precisa nella trace o un percorso di archi realmente attraversato.

---

## 2. I 6 Pilastri di Conformità (Criteri Pass / Fail)

| Pilastro | Requisito Fondamentale | Criterio di Superamento (Pass/Fail) |
| :--- | :--- | :--- |
| **1. Dual-Layer Knowledge** | Separazione netta tra Evidence Layer (chunk testuali/vettori) e Structured Knowledge Layer (entità, concetti, relazioni). | **Pass**: Ogni evidenza testuale mappa a ID canonici nel grafo. Nessun retrieval opera solo su chunk isolati privi di semantica. |
| **2. Typed Tooling** | Contratti tipizzati con envelope standard (\`data\`, \`insufficient: boolean\`, \`source_trace\`), non una casella di testo generica. | **Pass**: Nessuna chiamata a testo libero senza schema. Tutti gli 8 tool esposti con schema rigido e flag \`insufficient\`. |
| **3. Bitemporal & State** | Gestione della dimensione temporale esplicita (\`valid_from\`, \`valid_to\` vs data di registrazione a sistema). | **Pass**: L'agente risponde a *"quale regola valeva il giorno X?"* filtrando per intervalli di vigenza temporale reale. |
| **4. Contradiction Register & Gate** | Registro esplicito delle incongruenze verificato da un compositore indipendente dal loop dell'agente. | **Pass**: In presenza di conflitti aperti, il gate blocca la sintesi arbitraria ed espone le fonti contrastanti con owner e date. |
| **5. Bounded Loop Engine** | Loop snello, deterministico (~80 righe) con vincoli rigidi (max 8 round, budget, timeout, 2 hop) e fallback trasparente. | **Pass**: Impossibilità per l'LLM di bypassare i limiti o forzare allucinazioni; segnalazione esplicita del troncamento. |
| **6. Grounding Check** | Ogni claim della risposta finale è riconducibile a una citazione della trace o a un edge realmente percorso. | **Pass**: Claim non supportati rimossi o segnalati con revisione deterministica a singola passata (no loop all'infinito). |

---

## 3. Piano di Allineamento & Roadmap Operativa (Fasi 0 - 5)

- **Fase 0 — Baseline & Audit**: Mappatura tool attuali, audit ontologico, definizione test suite *"refusal test"* (domande con conflitti noti).
- **Fase 1 — Audit del Tool Surface & Refactoring**: Implementazione degli 8 Typed Tools con envelope comune (\`data\`, \`insufficient\`, \`trace\`).
- **Fase 2 — Strutturazione Dati (Grafo + Bitemporalità)**: Associazione di ancoraggi bi-direzionali tra chunk e nodi ontologici; inserimento di \`valid_from\` e \`valid_to\` sugli archi e stati.
- **Fase 3 — Contradiction Register & Out-of-Loop Gate**: Tabella/collezione dedicata alle contraddizioni; compositore a valle disaccoppiato dall'agente.
- **Fase 4 — Bounded Orchestration Engine**: Macchina a stati finiti con hard bounds rigidi e fallback sicuro su trace parziale.
- **Fase 5 — Test di Regressione & Validazione**: Esecuzione dei refusal test, verifica bitemporale e grounding score.
`
    }
  },

  // 10. PostgreSQL MCP Server
  {
    type: "mcp_server",
    title: "PostgreSQL MCP Server",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    summary: "Server MCP standard per consentire a modelli LLM ed agenti di esplorare schemi di database PostgreSQL, eseguire query in sola lettura e analizzare tabelle.",
    tags: ["mcp", "postgresql", "database", "agents", "tools"],
    isFavorite: true,
    metadata: {
      protocol: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Specifica implementata dal server" },
        { name: "PostgreSQL", type: "database", description: "Database relazionale di destinazione" }
      ],
      relations: [
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "implements_spec", weight: 0.95, description: "Implementazione ufficiale della specifica MCP" },
        { targetTitle: "Filesystem MCP Server", relationType: "sibling_tool", weight: 0.8, description: "Altro server MCP standard" }
      ],
      configSnippet: JSON.stringify({
        mcpServers: {
          postgres: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
          }
        }
      }, null, 2),
      toolsProvided: ["query", "list_tables", "describe_table"],
      markdownContent: `---
okf_version: "0.2"
title: "PostgreSQL MCP Server"
type: "tool_description"
domain: "Database Tooling & MCP"
tags: ["mcp", "postgresql", "database", "agents", "tools"]
created_at: "2026-08-29T10:50:00Z"
---

# PostgreSQL MCP Server

> **Integrazione Database Relazionale Sicura per Agenti e Assistenti LLM tramite Protocollo MCP**

---

## 1. Configurazione Rapida (JSON Snippet)

Aggiungere al file di configurazione del client MCP (\`claude_desktop_config.json\`):

\`\`\`json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://username:password@localhost:5432/my_database"
      ]
    }
  }
}
\`\`\`

---

## 2. Tool Forniti al Modello

- \`query\`: Esegue query SQL (consigliata modalità read-only con transazione in sola lettura).
- \`list_tables\`: Restituisce l'elenco delle tabelle e viste disponibili nel database.
- \`describe_table\`: Ispeziona colonne, tipi di dato, vincoli e chiavi esterne di una tabella.
`
    }
  },

  // 10. Filesystem MCP Server
  {
    type: "mcp_server",
    title: "Filesystem MCP Server",
    url: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    summary: "Abilita lettura, scrittura, ricerca e manipolazione sicura dei file locali per agenti IA all'interno di directory consentite.",
    tags: ["mcp", "filesystem", "node", "local-dev"],
    isFavorite: false,
    metadata: {
      protocol: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Specifica implementata" },
        { name: "Filesystem", type: "concept", description: "Accesso sicuro al disco per agenti" }
      ],
      relations: [
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "implements_spec", weight: 0.95, description: "Implementazione ufficiale della specifica MCP" },
        { targetTitle: "PostgreSQL MCP Server", relationType: "sibling_tool", weight: 0.8, description: "Altro server MCP standard" }
      ],
      configSnippet: JSON.stringify({
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
          }
        }
      }, null, 2),
      toolsProvided: ["read_file", "write_file", "list_directory", "search_files"],
      markdownContent: `---
okf_version: "0.2"
title: "Filesystem MCP Server"
type: "tool_description"
domain: "Local Development & File Operations"
tags: ["mcp", "filesystem", "node", "local-dev"]
created_at: "2026-08-29T10:55:00Z"
---

# Filesystem MCP Server

> **Accesso Sandboxed e Sicuro al Filesystem Locale per Assistenti AI**

---

## 1. Configurazione del Server

\`\`\`json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/developer/Projects"
      ]
    }
  }
}
\`\`\`

---

## 2. Capacità Operative

- \`read_file\`: Lettura del contenuto completo o parziale di un file.
- \`write_file\`: Creazione o sovrascrittura di file all'interno delle cartelle autorizzate.
- \`list_directory\`: Esplorazione ricorsiva o a singolo livello delle directory.
- \`search_files\`: Ricerca con pattern glob e keyword.
`
    }
  },

  // 11. Senior Code Reviewer & Architect Skill
  {
    type: "ai_skill",
    title: "Senior Code Reviewer & Architect",
    url: "https://github.com/google/ai-studio-skills",
    summary: "Skill AI specializzata per effettuare code review approfondite, individuare memory leak, vulnerabilità di sicurezza e ottimizzare architetture TypeScript/React.",
    tags: ["skill", "prompt", "code-review", "architecture", "typescript"],
    isFavorite: false,
    metadata: {
      skillType: "System Persona & Evaluation",
      recommendedModel: "gemini-2.5-pro",
      entities: [
        { name: "TypeScript", type: "language", description: "Linguaggio oggetto di revisione" },
        { name: "React", type: "framework", description: "Framework UI esaminato per re-render e performance" }
      ],
      relations: [
        { targetTitle: "Architettura di Sistema Full-Stack (ARCHITECTURE.md)", relationType: "audits", weight: 0.85, description: "Valuta le scelte architetturali" },
        { targetTitle: "Specifiche Operative Claude Code e Toolchain (CLAUDE.md)", relationType: "guides", weight: 0.88, description: "Fornisce criteri di qualità per Claude" }
      ],
      systemPrompt: "Sei un Principal Software Architect. Analizza il codice fornito valutando:\n1. Robustezza e type-safety in TypeScript\n2. Performance e re-render avoidance in React\n3. Principi SOLID e pulizia del design architetturale\n4. Copertura dei casi limite e gestione errori",
      triggerKeywords: ["review", "refactor", "audit", "optimize"],
      markdownContent: `---
okf_version: "0.2"
title: "Senior Code Reviewer & Architect"
type: "prompt_skill"
domain: "AI Skills & Code Quality"
tags: ["skill", "prompt", "code-review", "architecture", "typescript"]
created_at: "2026-08-29T11:00:00Z"
---

# Senior Code Reviewer & Architect

> **System Prompt e Linee Guida di Revisione per Architetti del Software e Ingegneri Principali**

\`\`\`markdown
Sei un Principal Software Architect & Senior Code Reviewer.
Analizza il codice sorgente fornito esaminando i seguenti pilastri:
1. Type Safety & Rigore TypeScript: eliminazione di \`any\`, corretta tipizzazione di generici e unioni discriminate.
2. React Lifecycle & Performance: stabilità dei puntatori di funzione (\`useCallback\`), memoizzazione calcoli pesanti (\`useMemo\`), prevenzione re-render inutili.
3. Clean Code & Principi SOLID: separazione netta delle responsabilità, modularità e leggibilità.
4. Resilienza & Edge Cases: gestione di timeout, risposte nulle o parziali, gestione errori asincroni.
\`\`\`
`
    }
  },

  // 12. Gemini Structured Extractor Skill
  {
    type: "ai_skill",
    title: "Gemini 2.5 Structured Extractor",
    url: "https://ai.google.dev/docs",
    summary: "Istruzioni di sistema per estrarre schemi JSON rigorosi da testo non strutturato con validazione dei campi e parsing resiliente.",
    tags: ["skill", "gemini", "json-schema", "prompt"],
    isFavorite: true,
    metadata: {
      skillType: "Data Extraction",
      recommendedModel: "gemini-2.5-flash",
      entities: [
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Modello generativo per JSON strutturato" },
        { name: "OKF v0.2", type: "standard", description: "Formato dati target per l'estrazione" }
      ],
      relations: [
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "implements", weight: 0.95, description: "Implementazione diretta dei prompt di sistema" },
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "powers_extraction", weight: 0.9, description: "Alimenta la barra di cattura rapida del vault" }
      ],
      systemPrompt: "Estrai esclusivamente oggetti JSON conformi allo schema specificato. Non includere blocchi markdown ```json o testo di accompagnamento. Valida tutti i tipi prima dell'emissione.",
      triggerKeywords: ["json", "extract", "parse", "schema"],
      markdownContent: `---
okf_version: "0.2"
title: "Gemini 2.5 Structured Extractor"
type: "prompt_skill"
domain: "Structured Output & Data Parsing"
tags: ["skill", "gemini", "json-schema", "prompt"]
created_at: "2026-08-29T11:05:00Z"
---

# Gemini Structured Extractor

> **Pattern Operativo per Estrazione Dati Strutturati con Gemini Flash e Response Schema Rigido**

\`\`\`markdown
Estrai esclusivamente oggetti JSON validi conformi allo schema fornito.
Non includere spiegazioni conversazionali o blocchi di markdown.
Sanitizza tutti i campi stringa e converti date in formato ISO 8601 UTC.
\`\`\`
`
    }
  },

  // 13. GitHub Repo: Model Context Protocol Servers
  {
    type: "github_repo",
    title: "modelcontextprotocol/servers",
    url: "https://github.com/modelcontextprotocol/servers",
    summary: "Repository ufficiale Anthropic con la collezione di server di riferimento per Model Context Protocol (PostgreSQL, Filesystem, Git, SQLite, Slack, Brave Search).",
    tags: ["github", "mcp", "open-source", "servers", "tools", "anthropic"],
    isFavorite: true,
    metadata: {
      owner: "modelcontextprotocol",
      repoName: "servers",
      language: "TypeScript",
      installCommand: "git clone https://github.com/modelcontextprotocol/servers.git",
      entities: [
        { name: "Model Context Protocol", type: "standard", description: "Specifica MCP implementata dai server" },
        { name: "Anthropic", type: "organization", description: "Organizzazione promotrice dello standard" }
      ],
      relations: [
        { targetTitle: "Guida Completa al Model Context Protocol (MCP)", relationType: "implements", weight: 0.95, description: "Implementazione ufficiale dei server di riferimento" },
        { targetTitle: "PostgreSQL MCP Server", relationType: "contains", weight: 0.9, description: "Modulo server PostgreSQL contenuto nella repo" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "modelcontextprotocol/servers"
type: "specification"
domain: "Open Source Tooling"
tags: ["github", "mcp", "open-source", "servers", "tools", "anthropic"]
created_at: "2026-08-29T11:10:00Z"
---

# modelcontextprotocol/servers

> **Collezione Ufficiale di Server MCP di Riferimento Sviluppati da Anthropic e dalla Community Open Source**

---

## 1. Server Inclusi nella Repository
- \`src/postgres\`: Interrogazione e analisi database PostgreSQL.
- \`src/filesystem\`: Accesso controllato a cartelle e file locali.
- \`src/git\`: Esecuzione di comandi \`git diff\`, \`log\`, \`branch\`.
- \`src/sqlite\`: Gestione di database leggeri serverless.
- \`src/fetch\`: Download e conversione in Markdown di pagine web.
`
    }
  },

  // 14. GitHub Repo: Anthropic Quickstarts
  {
    type: "github_repo",
    title: "anthropics/anthropic-quickstarts",
    url: "https://github.com/anthropics/anthropic-quickstarts",
    summary: "Progetti di avvio rapido e architetture di riferimento per la creazione di applicazioni, agenti autonomi e toolchain con l'API di Claude.",
    tags: ["github", "claude", "anthropic", "quickstart", "agents", "python", "typescript"],
    isFavorite: false,
    metadata: {
      owner: "anthropics",
      repoName: "anthropic-quickstarts",
      language: "Python / TypeScript",
      installCommand: "git clone https://github.com/anthropics/anthropic-quickstarts.git",
      entities: [
        { name: "Claude Code", type: "tool", description: "Strumenti CLI e API Anthropic" },
        { name: "Anthropic", type: "organization", description: "Creatore dei framework" }
      ],
      relations: [
        { targetTitle: "Claude Code: Guida al Terminale Agentico", relationType: "references", weight: 0.85, description: "Esempi di orchestrazione e workflow agentico" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "anthropics/anthropic-quickstarts"
type: "guide"
domain: "Agentic AI & Reference Implementations"
tags: ["github", "claude", "anthropic", "quickstart", "agents", "python", "typescript"]
created_at: "2026-08-29T11:15:00Z"
---

# anthropics/anthropic-quickstarts

> **Architetture di Riferimento e Template Pronti all'Uso per Applicazioni Basate su Claude**

---

## Modelli e Progetti Inclusi
- **Computer Use Demo**: Guida all'interazione autonoma di Claude con il desktop.
- **Customer Support Agent**: Agente conversazionale con tool routing e database lookup.
- **Financial Analysis Orchestrator**: Estrazione di dati e generazione di report finanziari.
`
    }
  },

  // 15. GitHub Repo: Google Gemini Cookbook
  {
    type: "github_repo",
    title: "google-gemini/cookbook",
    url: "https://github.com/google-gemini/cookbook",
    summary: "Collezione ufficiale di guide, notebook e ricette di codice per l'utilizzo avanzato dei modelli Gemini 2.5 e Gemini 3.7 Flash con il Google GenAI SDK.",
    tags: ["github", "gemini", "google", "cookbook", "python", "ai-engine"],
    isFavorite: true,
    metadata: {
      owner: "google-gemini",
      repoName: "cookbook",
      language: "Python / Jupyter",
      installCommand: "git clone https://github.com/google-gemini/cookbook.git",
      entities: [
        { name: "Gemini 3.7 Flash", type: "ai_model", description: "Modello generativo di riferimento" },
        { name: "Google GenAI SDK", type: "sdk", description: "SDK per chiamate di inferenza" }
      ],
      relations: [
        { targetTitle: "Google Gemini AI Engine: Linee Guida e Prompt (GEMINI.md)", relationType: "complements", weight: 0.9, description: "Esempi pratici e pattern di implementazione" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "google-gemini/cookbook"
type: "guide"
domain: "Google Gemini AI & SDK Tutorials"
tags: ["github", "gemini", "google", "cookbook", "python", "ai-engine"]
created_at: "2026-08-29T11:20:00Z"
---

# google-gemini/cookbook

> **Raccolta di Esempi di Codice, Notebook e Pattern Avanzati per l'Utilizzo dell'API Google Gemini**

---

## Argomenti Trattati
1. **Structured Outputs**: Come vincolare le risposte con schemi JSON rigorosi.
2. **Multimodal Analysis**: Elaborazione congiunta di testo, immagini, audio e video.
3. **Function Calling & Tool Use**: Connessione sicura tra modelli Gemini e backend esterni.
4. **Embeddings & Semantic Search**: Generazione di vettori di embedding per sistemi RAG.
`
    }
  },
  // 17. Troubleshooting: Errore Scansione Kyocera 1102 (SMB Authentication)
  {
    type: "troubleshooting",
    title: "Risoluzione Errore Scansione Kyocera 1102: Autenticazione SMB Fallita",
    url: "https://support.kyoceradocumentsolutions.com/faq/error-1102-smb",
    summary: "Diagnostica e risoluzione per l'errore di invio cartella di rete (SMB) codice 1102 su multifunzione Kyocera, causato dalla deprecazione di SMBv1 in Windows 11 o da mancata configurazione NTLMv2.",
    tags: ["troubleshooting", "kyocera", "smb", "scansione", "errore-1102", "windows", "multifunzione"],
    isFavorite: false,
    metadata: {
      okfVersion: "0.2",
      domain: "Hardware & Multifunction Printers",
      docType: "specification",
      affectedSystem: "Kyocera TASKalfa 3253ci / Windows SMB Share",
      errorLog: "Send Error: 1102 - Authentication failed / Access denied to \\\\SERVER-FILE\\Scansioni",
      problemDescription: "La fotocopiatrice fallisce la scansione verso la cartella condivisa di rete su PC Windows 11 restituendo a display il codice errore 1102.",
      rootCause: "Disattivazione predefinita di SMBv1 e NTLMv1 su Windows 11 / Server 2022. La stampante tentava l'autenticazione con dialetto obsoleto non consentito dalle policy di sicurezza.",
      attemptedFixes: [
        "Disattivazione temporanea di Windows Defender Firewall (errore invariato)",
        "Creazione di una cartella senza password (bloccata dalle policy di sicurezza Windows)"
      ],
      solutionSteps: [
        "Accedere al Command Center RX della Kyocera tramite IP",
        "Navigare su Impostazioni di Rete > Protocolli > SMB",
        "Abilitare SMBv2 e SMBv3 impostando la sicurezza su NTLMv2",
        "Verificare che l'utente Windows inserito nella rubrica abbia permessi NTFS di Modifica sulla cartella di scansione",
        "Eseguire un test di invio"
      ],
      entities: [
        { name: "Kyocera TASKalfa 3253ci", type: "hardware", description: "Multifunzione dipartimentale A3" },
        { name: "Protocollo SMBv3", type: "protocol", description: "Protocollo di condivisione cartelle sicuro" }
      ],
      relations: [
        { targetTitle: "Procedura di Configurazione Scansione Cartella SMB su Multifunzione Kyocera TASKalfa", relationType: "requires_procedure", weight: 0.95, description: "La procedura preventiva risolve e standardizza la configurazione per evitare l'errore 1102" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Risoluzione Errore Scansione Kyocera 1102: Autenticazione SMB Fallita"
type: "troubleshooting"
domain: "Hardware & Multifunction Printers"
docType: "specification"
tags: ["troubleshooting", "kyocera", "smb", "scansione", "errore-1102", "windows"]
---

# Risoluzione Errore Scansione Kyocera 1102

> **Diagnostica Ufficiale e Soluzione Errore Invio Cartella SMB**

### Causa Radice
Disallineamento dei protocolli di rete: Windows 11 rifiuta l'autenticazione NTLMv1 o dialetti SMBv1 non crittografati.

### Passaggi Risolutivi
1. Accedere al pannello web **Command Center RX** come \`Admin\`.
2. Verificare che il protocollo SMB sia impostato su **SMBv2/v3 On**.
3. Modificare il metodo di autenticazione da Auto/NTLMv1 a **NTLMv2**.
4. Salvare e riavviare il sottosistema di rete della multifunzione.
`
    }
  },
  // 18. Procedura: Configurazione Scansione SMB su Kyocera TASKalfa
  {
    type: "procedure",
    title: "Procedura di Configurazione Scansione Cartella SMB su Multifunzione Kyocera TASKalfa",
    url: "https://kb.internal-it.vault/sop/kyocera-smb-config",
    summary: "Playbook operativo standardizzato per configurare la scansione cartella (Scan-to-Folder SMBv3) su stampanti multifunzione Kyocera con autenticazione sicura NTLMv2.",
    tags: ["procedure", "playbook", "sop", "kyocera", "smb", "scansione", "assistenza", "onboarding"],
    isFavorite: true,
    metadata: {
      okfVersion: "0.2",
      domain: "Hardware & Multifunction Printers",
      docType: "guide",
      procedureType: "installation",
      targetSystem: "Kyocera TASKalfa 3253ci",
      estimatedDuration: "20 min",
      riskLevel: "low",
      prerequisites: [
        "Indirizzo IP statico assegnato alla multifunzione",
        "Account utente Windows dedicato (es. 'scanner') con password non a scadenza",
        "Cartella condivisa sul PC/Server con permessi NTFS di Modifica per l'utente scanner"
      ],
      requiredTools: [
        "Browser Web (Chrome / Firefox / Edge)",
        "Cavo LAN RJ45 per test locale",
        "Credenziali admin del Command Center RX"
      ],
      safetyWarnings: [
        "Non effettuare il reboot della multifunzione durante la scrittura della rubrica per evitare la corruzione dei record di memoria flash."
      ],
      solutionSteps: [
        "Accedere al Command Center RX digitando l'indirizzo IP della stampante nella barra degli indirizzi del browser.",
        "Effettuare il login come 'Admin' (credenziali predefinite: Admin / Admin con maiuscole).",
        "Navigare nel menu laterale su 'Impostazioni Funzione' > 'Invio' > 'Configurazione SMB'.",
        "Verificare che 'SMB' sia impostato su 'On' e selezionare come protocollo client 'SMBv2/SMBv3' con autenticazione 'NTLMv2'.",
        "Selezionare nel menu 'Rubrica' > 'Rubrica Macchina' > 'Aggiungi Contatto'.",
        "Compilare: Nome Visualizzato, Nome Host (indirizzo IP del PC di destinazione), Percorso (nome della condivisione, es. 'Scansioni'), Nome Utente di Login e Password.",
        "Cliccare 'Verifica Connessione' per validare i permessi di scrittura SMB.",
        "Salvare il contatto e testare la scansione diretta dal display LCD della macchina posizionando un foglio nell'alimentatore ADF."
      ],
      rollbackPlan: "Se l'invio non va a buon fine, verificare il firewall locale del computer di destinazione (apertura porta TCP 445 in ingresso) e controllare che il tipo di rete Windows sia impostato su 'Privata' e non 'Pubblica'.",
      entities: [
        { name: "Kyocera TASKalfa 3253ci", type: "hardware", description: "Multifunzione A3 a colori dipartimentale" },
        { name: "Command Center RX", type: "toolchain", description: "Interfaccia web di gestione della stampante" },
        { name: "Protocollo SMBv3", type: "protocol", description: "Protocollo di condivisione di rete crittografato" }
      ],
      relations: [
        { targetTitle: "Risoluzione Errore Scansione Kyocera 1102: Autenticazione SMB Fallita", relationType: "prevents", weight: 0.95, description: "La corretta configurazione preventiva NTLMv2 evita l'errore 1102" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Procedura di Configurazione Scansione Cartella SMB su Multifunzione Kyocera TASKalfa"
type: "procedure"
domain: "Hardware & Multifunction Printers"
docType: "guide"
tags: ["procedure", "playbook", "sop", "kyocera", "smb", "scansione", "assistenza"]
---

# Procedura di Configurazione Scansione SMB Kyocera TASKalfa

> **Playbook Operativo Ufficiale di Configurazione Rete & Invio Documenti**

## 1. Obiettivo dell'Intervento
Configurare in modo standardizzato la scansione documentale da fotocopiatrice dipartimentale verso una cartella condivisa su server o client Windows 10/11, assicurando la piena compatibilità con il protocollo SMBv3 e l'autenticazione NTLMv2.

## 2. Prerequisiti Tecnici
- Indirizzo IP fisso configurato sulla multifunzione.
- Cartella creata e condivisa (es. \`C:\\Scansioni\` condivisa come \`Scansioni\`).
- Utente Windows locale con password impostata su "Nessuna scadenza".

## 3. Checklist Operativa Sequenziale
- [ ] 1. Accedere a Command Center RX tramite browser.
- [ ] 2. Login come Amministratore (Admin/Admin).
- [ ] 3. Abilitare SMBv2/v3 e sicurezza NTLMv2 in Funzioni > Invio.
- [ ] 4. Aggiungere il contatto in Rubrica con percorso IP e credenziali.
- [ ] 5. Eseguire test di scansione da alimentatore ADF.

## 4. Piano di Rollback
Qualora il test fallisca con codice 1102, verificare la porta 445 nel Windows Firewall e ripristinare il gruppo di lavoro predefinito WORKGROUP.
`
    }
  },
  // 19. Procedura: Manutenzione Preventiva e Sostituzione Gruppo Fusore
  {
    type: "procedure",
    title: "Procedura di Manutenzione Preventiva e Sostituzione Unità Tamburo / Fusore Stampanti Multifunzione",
    url: "https://kb.internal-it.vault/sop/maintenance-drum-fuser",
    summary: "Playbook per l'intervento tecnico programmato di sostituzione dell'unità fusore e tamburo ottico su fotocopiatrici multifunzione al superamento di 200.000 copie.",
    tags: ["procedure", "playbook", "sop", "manutenzione", "hardware", "stampanti", "sicurezza"],
    isFavorite: false,
    metadata: {
      okfVersion: "0.2",
      domain: "Hardware & Multifunction Printers",
      docType: "guide",
      procedureType: "maintenance",
      targetSystem: "Kyocera TASKalfa / Stampanti Multifunzione A3",
      estimatedDuration: "45 min",
      riskLevel: "high",
      safetyWarnings: [
        "PERICOLO ALTA TEMPERATURA: Il gruppo fusore opera a oltre 180°C. Attendere almeno 20 minuti dal disinserimento dell'alimentazione prima di toccare i rulli.",
        "PERICOLO ELETTROSTATICO: Indossare braccialetto antistatico ESD per non danneggiare i sensori di potenziale superficie tamburo.",
        "Non esporre il tamburo fotoconduttore OPC alla luce diretta del sole o a luce ambiente intensa per più di 2 minuti."
      ],
      prerequisites: [
        "Stampa del foglio di stato macchina (Status Page) con contatori correnti",
        "Disponibilità del Maintenance Kit originale compatibile (es. MK-8335A)",
        "Alimentazione scollegata dalla presa di corrente a muro"
      ],
      requiredTools: [
        "Cacciavite a stella Philips PH2 con impugnatura isolata",
        "Panno antistatico in microfibra",
        "Aspiratore toner per polveri sottili con filtro HEPA",
        "Guanti protettivi in nitrile monouso"
      ],
      solutionSteps: [
        "Stampare il rapporto di stato per annotare i contatori parziali dei tamburi (C, M, Y, K) e del fusore.",
        "Spegnere l'interruttore principale e staccare il cavo di alimentazione elettrica. Attendere 20 minuti per il raffreddamento.",
        "Aprire lo sportello laterale destro ed estrarre con cautela la vaschetta di recupero toner esausto.",
        "Rimuovere le due viti di fissaggio dell'unità fusore, sbloccare le leve verdi di rilascio ed estrarre il modulo tenendolo dalle maniglie di presa dedicate.",
        "Pulire con aspiratore toner l'alloggiamento interno e i rulli di registrazione.",
        "Inserire la nuova unità fusore accertandosi dello scatto completo dei connettori posteriori.",
        "Sostituire l'unità tamburo estraendo la cartuccia e allineando le guide del nuovo tamburo ottico.",
        "Reinserire la vaschetta di recupero toner, chiudere gli sportelli e ricollegare l'alimentazione.",
        "Accedere al menu di servizio tecnico (Maintenance Mode U110 / U111) e reimpostare i contatori di manutenzione.",
        "Eseguire una stampa di prova fronte/retro a colori per verificare uniformità e planarità del foglio."
      ],
      rollbackPlan: "Se la macchina genera codice errore C4000 o rumori di ingranaggi all'accensione, spegnere subito la macchina, sfilare il fusore e verificare che la leva di blocco sinistra sia agganciata a fondo corsa e che non vi siano frammenti di nastro adesivo di protezione rimasti nel modulo.",
      entities: [
        { name: "Unità Fusore", type: "hardware", description: "Gruppo di fissaggio termico del toner su carta" },
        { name: "Tamburo OPC", type: "hardware", description: "Cilindro fotoconduttore sensibile alla carica" }
      ],
      relations: [
        { targetTitle: "Knowledge Vault: Panoramica e Architettura OKF v0.2 (README)", relationType: "references", weight: 0.8, description: "Playbook standard del catalogo operativo aziendale" }
      ],
      markdownContent: `---
okf_version: "0.2"
title: "Procedura di Manutenzione Preventiva e Sostituzione Unità Tamburo / Fusore"
type: "procedure"
domain: "Hardware & Multifunction Printers"
docType: "guide"
tags: ["procedure", "playbook", "sop", "manutenzione", "hardware", "stampanti"]
---

# Procedura di Manutenzione Preventiva Stampanti Multifunzione A3

> **Playbook di Servizio Tecnico: Sostituzione Maintenance Kit (MK)**

## Avvertenze di Sicurezza Critiche
- ⚠️ **Superficie Scottante**: Il fusore raggiunge temperature ustionanti.
- ⚡ **Isolamento Elettrico**: Staccare sempre la spina prima dell'apertura del telaio.

## Checklist di Intervento
- [ ] 1. Verifica contatori e stampa foglio di stato.
- [ ] 2. Spegnimento e raffreddamento per 20 minuti.
- [ ] 3. Rimozione vaschetta recupero toner.
- [ ] 4. Sostituzione gruppo fusore e serraggio leve verdi.
- [ ] 5. Sostituzione tamburi e pulizia filo corona.
- [ ] 6. Reset contatori dal Service Mode U110.
- [ ] 7. Stampa di collaudo e verifica assenza righe.
`
    }
  }
];

export const getInitialSampleResourcesWithIds = (): ResourceItem[] => {
  return initialSampleResources.map((item, idx) => ({
    id: `sample-vault-${idx + 1}-${item.type}`,
    userId: "local-vault-user",
    createdAt: new Date(Date.now() - (idx * 3600000)),
    updatedAt: new Date(Date.now() - (idx * 3600000)),
    ...item,
  }));
};

