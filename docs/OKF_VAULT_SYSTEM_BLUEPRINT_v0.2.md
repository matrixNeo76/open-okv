---
okf_version: "0.2"
id: "blueprint-vault-engine-agnostic-v0.2"
title: "Blueprint Agnostico dell'Architettura del Knowledge Vault: Ingestione, Arricchimento Ontologico e Pipeline OKF v0.2"
type: "architecture"
domain: "Knowledge Engineering & Autonomous Agent Architectures"
tags: ["okf", "v0.2", "architecture", "specification", "ingestion", "enrichment", "topology", "vectorless-rag", "agentic", "agnostic-blueprint", "cekikj", "finops", "security"]
entities:
  - name: "Agnostic Knowledge Vault Engine"
    type: "technology"
    description: "Architettura concettuale e applicativa per l'acquisizione, arricchimento ontologico e navigazione topologica della conoscenza"
  - name: "Tri-Layer Storage Model"
    type: "pattern"
    description: "Modello di persistenza resiliente a 3 livelli: Client Memory/IndexedDB -> File atomico con Ring Buffer -> Database di stato persistente"
  - name: "Two-Stage DocType Resolver"
    type: "subsystem"
    description: "Algoritmo ibrido che separa il triage pre-estrazione dalla risoluzione ontologica post-estrazione con docTypeLocked"
  - name: "Ensemble Confidence Evaluator"
    type: "service"
    description: "Valutatore calibrato di confidenza basato sul confronto tra euristica locale deterministica e inferenza generativa"
  - name: "Deterministic Pre-Flight Gate"
    type: "security_module"
    description: "Guardrail a latenza zero per magic bytes, fingerprint crittografica SHA-256 e limiti dimensionali prima delle chiamate generative"
  - name: "Streaming Archive Guardian"
    type: "security_module"
    description: "Ispezione preventiva di archivi ZIP con controllo del ratio di decompressione (>100:1), anti-traversal e de-collisione atomica"
  - name: "Modular MCP Secret Scrubber"
    type: "security_module"
    description: "Bonifica di credenziali basata su regex, entropia di Shannon (>4.5 bits/char e len>=24) e allowlist preventiva di valori innocui"
  - name: "Topological Graph & Vectorless RAG"
    type: "technology"
    description: "Motore di indicizzazione relazionale basato su entità e archi espliciti, interrogabile senza allucinazioni da embedding opachi"
  - name: "Cekikj Epistemic Core"
    type: "framework"
    description: "Guardrail epistemici formali: rifiuto delle congetture arbitrarie (insufficient: true), Contradiction Gate e limiti operativi rigidi"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Fissa il formato canonico YAML/Markdown per la serializzazione di ogni risorsa"
  - targetTitle: "Specifica Tecnica e Tassonomia delle Pipeline di Ingestione OKF v0.2 (SPEC_RESOURCE_PIPELINES_TAXONOMY_OKF)"
    relationType: "governs"
    weight: 0.95
    description: "Definisce le regole di transizione di stato, i controlli di sicurezza e le metriche di audit"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "references"
    weight: 0.9
    description: "Descrive i flussi operativi per i singoli formati sorgente"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "documents"
    weight: 0.85
    description: "Fornisce la guida passo-passo per il bootstrap operativo del sistema"
---

# Blueprint Agnostico dell'Architettura del Knowledge Vault

> **Versione Specifica**: OKF v0.2 Canonica (Release 2026.4)  
> **Destinatari Primari**: Modelli Linguistici Autonomi (LLM), Agenti di Generazione Codice, Architetti Software, Sviluppatori di Sistemi di Conoscenza.  
> **Obiettivo Fondamentale**: Spiegare nei minimi dettagli e in modo **completamente agnostico dall'infrastruttura** come funziona l'applicativo, come ingerisce ogni fonte, come la arricchisce ontologicamente, come protegge i dati, e come questo sistema può essere **replicato con qualsiasi linguaggio, database o modello AI** (es. Python, Go, Rust, PostgreSQL, SQLite, Obsidian, Claude, GPT, o modelli locali Ollama/Llama-3).

---

## 1. Principi Fondamentali del Modello OKF v0.2

Il **Knowledge Vault** è un sistema di ingegneria della conoscenza (*Knowledge Engineering*) basato sul principio che la conoscenza documentata deve essere:
1. **Human-Readable & Machine-Deterministic**: Ogni documento è un file di testo UTF-8 contenente un blocco frontmatter YAML rigoroso ed un corpo in Markdown. Nessun formato proprietario o database opaco binario.
2. **Topologica & Esplicita (Vectorless RAG)**: Al posto degli embedding vettoriali opachi (che spesso creano allucinazioni e correlazioni prive di significato causale), la conoscenza è strutturata come un **Grafo Topologico Diretto Pesato** con **Entità Canoniche** e **Relazioni Tipizzate** (`governs`, `implements`, `constrains`, `references`, `resolves`, `extends`, `depends_on`).
3. **Resiliente (Principio "Never Lose User Data")**: L'ingestione non deve mai scartare input dell'utente valido per discrepanze formali minori. I controlli rigidi bloccanti (*hard fail*) sono confinati alla sicurezza (es. zip bomb, malware, segreti non protetti).
4. **Epistemicamente Controllata (Architettura Cekikj)**: I modelli AI non sono autorizzati ad inventare relazioni non documentate. Se le evidenze non sono sufficienti, il sistema emette `insufficient: true`; se un'asserzione tocca contraddizioni aperte, scatta il *Contradiction Gate*.

---

## 2. Anatomia di una Risorsa OKF v0.2

Ogni informazione acquisita dal Vault viene normalizzata in un oggetto `ResourceItem` che include due livelli di tassonomia:

```
+---------------------------------------------------------------------------------------+
| RESOURCE ITEM (Entità Universale del Vault)                                          |
+---------------------------------------------------------------------------------------+
| - id: Identificativo univoco (UUID / hash)                                            |
| - title: Titolo canonico e descrittivo                                                |
| - type: Tipologia operativa della risorsa (knowledge, troubleshooting, procedure...)  |
| - summary: Sintesi esecutiva ad alta densità informativa                             |
| - tags: Array di etichette tecniche normalizzate                                      |
| - url / rawInput: Fonte originaria (URL web, repository, percorso file)               |
| - metadata:                                                                           |
|     * okfVersion: "0.2"                                                               |
|     * domain: Dominio concettuale (es. "Cloud Infrastructure", "System Diagnostics")  |
|     * docType: Ontologia OKF (concept, architecture, guide, specification...)         |
|     * docTypeLocked: Booleano che indica se la tipizzazione è definitiva o modificabile|
|     * entities: Array di entità estratte [{ name, type, description }]                |
|     * relations: Array di archi relazionali [{ targetTitle, relationType, weight... }] |
|     * provenance: Record immutabile di audit (modello, token, costi FinOps, sha256)   |
|     * markdownContent: Documento formattato completo con frontmatter YAML             |
+---------------------------------------------------------------------------------------+
```

### Differenza Netta tra `type` (Risorsa) e `docType` (Ontologia OKF):
- **`type` (Tassonomia di Archiviazione & UI)**: Definisce *cosa è* la risorsa nel flusso di lavoro operativo:
  - `knowledge` (documentazione di sistema, concetti, architetture)
  - `troubleshooting` (schede di diagnostica guasti, bug e crash)
  - `procedure` (playbook operativi, SOP, checklist e runbook)
  - `article` (guide e articoli di blog/web)
  - `github_repo` (repository di codice sorgente)
  - `mcp_server` (configurazioni e server Model Context Protocol)
  - `ai_skill` (prompt di sistema e skill per agenti)
  - `paper` (articoli scientifici e preprint arXiv/DOI)
  - `note` (note rapide, bozze e scratchpad a latenza zero)
  - `rss` (canali e feed informativi monitorati)
  - `link` (segnalibri e web tools)
- **`docType` (Grammatica Formale OKF v0.2)**: I 6 archetipi ontologici ammessi dallo standard:
  - `concept`: Modelli teorici, definizioni, ontologie, timeline cronologiche.
  - `architecture`: Topologie di sistema, flussi di dati, diagrammi e infrastrutture.
  - `guide`: Procedure sequenziali passo-passo, tutorial, how-to.
  - `specification`: Contratti formali di interfaccia, requisiti, bug report, schede diagnostiche.
  - `tool_description`: Specifiche di connettori, CLI, server MCP, utility esterne.
  - `prompt_skill`: Istruzioni di sistema, vincoli operativi e skill per LLM.

---

## 3. Trattamento e Pipeline per Ogni Singola Fonte

Il sistema accetta 10 macro-categorie di fonti, ciascuna trattata da una pipeline specialistica ma normalizzata secondo lo stesso contratto.

```
                      +-----------------------------+
                      |   INPUT UTENTE MULTIFONTE   |
                      +-----------------------------+
                                     |
    +--------------+-----------------+-----------------+--------------+
    |              |                 |                 |              |
    v              v                 v                 v              v
[ URL / Web ]  [ File / PDF ]  [ Screenshot ]   [ Note Rapide ]  [ ZIP Vault ]
    |              |                 |                 |              |
    v              v                 v                 v              v
Pipeline Web   Pipeline PDF   Pipeline Vision   Pipeline 0ms   Pipeline ZIP
(Scraping/OG)  (Text/OCR/DOI) (Multimodal OCR)  (Euristica)    (Streaming)
    |              |                 |                 |              |
    +--------------+-----------------+-----------------+--------------+
                                     |
                                     v
                  +--------------------------------------+
                  | PRE-FLIGHT GATE (0ms Deterministico) |
                  | - SHA-256 Dedup                      |
                  | - Controllo Magic Bytes & Bounds     |
                  +--------------------------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | TWO-STAGE DOCTYPE RESOLVER           |
                  | 1. Triage Provvisorio (Pre)          |
                  | 2. Estrazione Semantica / AST        |
                  | 3. Risoluzione Definitiva (Post)     |
                  +--------------------------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | ENSEMBLE CONFIDENCE EVALUATOR        |
                  | Euristica Locale vs Modello AI       |
                  | Baseline 0.90 / Soglia Elastica 0.75 |
                  +--------------------------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | SECURITY & HARDENING                 |
                  | - MCP Secret Scrubber (Entropy/Keys) |
                  | - Sanitizzazione Path Traversal      |
                  +--------------------------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | AUDIT & FINOPS PROVENANCE            |
                  | Hash SHA-256 + Token + Calcolo Costi |
                  +--------------------------------------+
                                     |
                                     v
                  +--------------------------------------+
                  | TRI-LAYER PERSISTENCE & TOPOLOGY     |
                  | IndexedDB <-> Backup Disk <-> Cloud  |
                  +--------------------------------------+
```

### 3.1. Articoli Web e Link (`article`, `link`)
- **Fase 1 (Acquisizione)**: Normalizzazione e purificazione dell'URL (rimozione di query di tracking `utm_*`, fragment e trailing slash). Se l'URL non ha metadati Open Graph, viene estratto il testo principale tramite parser HTML che isola `article`, `main` o rimuove script, nav e footer.
- **Fase 2 (Arricchimento)**: Estrazione del titolo autentico (o dal tag `<title>`, o da `og:title`, o generato dallo slug semantico dell'URL).
- **Fase 3 (Ontologia)**: Mappato di default su `docType: guide` (se contiene codice o istruzioni operative) o `concept` (se panoramica teorica).

### 3.2. Note Rapide e Scratchpad (`note`)
- **Pipeline Istantanea (0ms AI)**: Quando l'utente inserisce una nota veloce, l'elaborazione non attende chiamate AI esterne.
- **Formattazione Deterministica**: Un parser locale estrae la prima riga come titolo, deduce i tag tramite parole precedute da `#` o frequenza lessicale, e genera il frontmatter YAML con `type: "note"` e `docType: "concept"`. L'arricchimento semantico profondo avviene in background o su richiesta.

### 3.3. Paper Scientifici (`paper`)
- **Estrazione Strutturata**: Estrazione del testo da container PDF (o testo nativo o OCR).
- **Riconoscimento Identificativi Canonici**: Rilevamento automatico di identificativi arXiv (`arxiv.org/abs/YYMM.NNNNN`) o DOI (`10.xxxx/...`).
- **Metadati Specialistici**: Estrazione di autori, affiliazioni, abstract strutturato, metodologia, risultati chiave, collegamenti bibliografici e URL diretto al PDF originale.
- **Ontologia**: Mappato rigorosamente su `docType: specification`.

### 3.4. Problemi e Soluzioni (`troubleshooting`)
- **Vision Mandate per Screenshot di Bug**: Quando l'input è un'immagine con log d'errore, stack trace di terminale o finestre di crash, il classificatore visivo lo categorizza determinististicamente come `troubleshooting`.
- **Campi Specialistici Estratti**:
  - `affectedSystem`: Componente, OS o libreria coinvolta (es. "Docker Engine", "PostgreSQL", "Node.js").
  - `errorLog`: Trascrizione OCR letterale ed esatta del messaggio d'errore o dell'eccezione.
  - `rootCause`: Spiegazione causale dell'errore (evitando allucinazioni non verificate).
  - `solutionSteps`: Sequenza ordinata di passaggi esecutivi e comandi di ripristino.
  - `attemptedFixes`: Registro di eventuali soluzioni tentate senza successo.
- **Ontologia**: Mappato su `docType: specification`.

### 3.5. Procedure Operative e Playbook (`procedure`)
- **Trattamento SOP**: Acquisizione di runbook sistemistici, checklist di manutenzione o procedure di disaster recovery.
- **Campi Specialistici Estratti**:
  - `requiredTools`: Strumenti e CLI necessari (es. `kubectl`, `aws-cli`, `systemctl`).
  - `safetyWarnings`: Avvisi di sicurezza critici per prevenire perdite di dati.
  - `prerequisites`: Condizioni preliminari obbligatorie prima dell'esecuzione.
  - `stepsCount`: Numero di passaggi validati.
  - `rollbackPlan`: Procedura di annullamento e ripristino in caso di fallimento operativo.
  - `riskLevel`: Livello di rischio calcolato (`low`, `medium`, `high`, `critical`). Se `high` o `critical`, il sistema impone conferma esplicita dell'operatore.
- **Ontologia**: Mappato su `docType: guide`.

### 3.6. Server e Strumenti MCP (`mcp_server`)
- **Ispezione Configurazioni JSON/YAML**: Analisi di specifiche Model Context Protocol (tool, prompt, risorse esposte e comandi di avvio).
- **Modular Secret Scrubber (Sicurezza Proattiva)**: Prima del salvataggio, qualsiasi payload viene passato al modulo di sanitizzazione per impedire la memorizzazione di token di accesso, chiavi API o password di database (vedi Sezione 5).
- **Ontologia**: Mappato categoricamente su `docType: tool_description`.

### 3.7. Repository GitHub (`github_repo`)
- **Parsing Topologico di Repository**: Analisi dell'albero di directory, file `README.md`, configurazioni di packaging (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`).
- **Estrazione Architetturale**: Mappatura dei linguaggi primari, framework utilizzati, comandi di installazione e licenza d'uso.
- **Ontologia**: Mappato su `docType: architecture`.

### 3.8. Notebook Jupyter (`.ipynb`)
- **Decomposizione delle Celle**: Separazione ordinata delle celle Markdown esplicative dalle celle di codice Python e relativi output testuali/grafici.
- **Normalizzazione OKF**: Riassemblaggio del notebook in un documento continuo Markdown con blocchi di codice indentati e documentazione del flusso computazionale.

### 3.9. Archivi Compressi ZIP (Obsidian, Notion, Markdown Vault)
- **Streaming Archive Guardian**: Decompressione flussata e protetta da zip bomb, limiti di 20MB per file, 80MB totali, 300 file massimi, rifiuto assoluto di directory traversal (`../`).
- **Risoluzione Automatica dei Wikilink**: Rilevamento di tutti i link interni nel formato `[[Nome File]]` o `[[Nome File|Alias]]`. Il motore mappa ogni wikilink in un arco relazionale formale OKF (`targetTitle: "Nome File"`, `relationType: "references"`, `weight: 0.85`), ricostruendo istantaneamente il grafo topologico della conoscenza.

### 3.10. Feed RSS e Notizie Canoniche (`rss`)
- **Discovery Automatico**: Rilevamento dei link a feed RSS/Atom dall'HTML di un sito.
- **Deduplicazione Cronologica**: Memorizzazione guidata dall'identificativo univoco `guid` o dal timestamp `pubDate`.

---

## 4. Pipeline di Elaborazione e Workflow End-to-End

### Fase 0: Deterministic Pre-Flight Gate (Latenza 0ms)
Prima di consumare token o invocare modelli linguistici:
1. **Verifica Dimensione**: Rifiuto di payload a 0 byte o che superano il limite rigido (75 MB).
2. **Impronta SHA-256**: Calcolo dell'hash crittografico del contenuto grezzo. Se l'impronta coincide con una risorsa già presente, l'ingestione viene interrotta restituendo l'ID esistente (*Deduplicazione deterministica a zero costi*).
3. **Controllo Magic Bytes**: Ispezione dell'header binario per verificare la coerenza con il MIME type dichiarato (es. `%PDF` per PDF, `PK\x03\x04` per ZIP, `ID3` per audio MP3).

### Fase 1: Risolutore Ibrido Two-Stage (`resolveDocType`)
Risolve il problema della dipendenza circolare tra classificazione e contenuto:
1. **Stadio 1 (Pre-estrazione)**: Con solo l'input grezzo a disposizione (URL, nome file o prime righe), assegna un `docType` provvisorio (`concept` o `guide`) con flag `docTypeLocked: false`.
2. **Stadio 2 (Post-estrazione)**: Dopo che l'OCR o il parser ha estratto il testo completo:
   - Se il contenuto contiene diagrammi Mermaid o nodi architetturali $\to$ `docType: "architecture"`.
   - Se contiene blocchi di codice, step numerati o tutorial $\to$ `docType: "guide"`.
   - Se contiene date storiche, cronologie o timeline didattiche $\to$ `docType: "concept"`.
   - Se contiene stack trace di errore o diagnostica crash $\to$ `docType: "specification"`.
   - Assegna `docTypeLocked: true` (modificabile solo tramite override esplicito dell'utente).

### Fase 2: Ensemble Confidence Evaluator (Anti-Overconfidence)
I modelli linguistici tendono a dichiarare confidenze numeriche non calibrate. Il Vault adotta un ensemble ibrido:
- **Heuristic Classifier Locale**: Valuta indicatori formali (presenza di stack trace, comandi CLI, strutture di playbook).
- **AI Classifier**: Il modello suggerisce il suo tipo.
- **Calcolo della Confidenza**:
  - Concordanza piena (`heuristic === ai`): Confidenza baseline documentata a **`0.90`**.
  - Discordanza parziale: Confidenza ridotta a **`0.60`**.
  - Input ambiguo o brevissimo: Confidenza a **`0.50`**.
- **Soglia di Segnalazione Elastica (0.75)**: Se la confidenza è $< 0.75$, il documento viene comunque salvato (*Zero Data Loss*), ma la card UI mostra un badge informativo non bloccante con invito alla conferma dell'utente.

### Fase 3: Arricchimento Ontologico e Collegamento Topologico
1. **Estrazione Entità**: Identificazione di persone, organizzazioni, concetti, software, protocolli e linguaggi citati nel testo.
2. **Generazione Archi Topologici**:
   - Collegamento deterministico all'entità genitore o dominio di appartenenza.
   - Esame incrociato con le altre risorse già presenti nel Vault: se due schede condividono tag specialistici o citano le stesse entità, viene creato un arco relazionale con peso proporzionale alla co-occorrenza ($0.75 - 0.95$).

### Fase 4: Provenance e FinOps Immutabile
Ogni documento arricchito include in `metadata.provenance`:
```json
{
  "modelUsed": "gemini-3.7-flash",
  "pipelineId": "universal-multimodal-ocr",
  "pipelineVersion": "1.2.0",
  "promptVersion": "0.2.2",
  "tokensIn": 1420,
  "tokensOut": 530,
  "estimatedCostUsd": 0.000354,
  "durationMs": 1450,
  "ingestedAt": "2026-10-05T08:00:00.000Z",
  "sha256": "0a3666a0710c08aa6d0de92ce72beeb5b93124cce1bf3701c9d6cdeb543cb73e"
}
```

---

## 5. Specifiche di Sicurezza Proattiva

### 5.1. Modular MCP Secret Scrubber
Protegge da perdite accidentali di chiavi e credenziali nei payload degli agenti.
1. **Redazione per Nome Chiave**: Se il nome del parametro soddisfa la regex:
   ```regex
   /(secret|token|key|pass|credential|auth|bearer|private|cert|jwt|signature|webhook)/i
   ```
   il valore viene sostituito letteralmente con `"[REDACTED_SECRET]"`.
2. **Doppia Condizione per Entropia di Shannon**: Per parametri con nomi generici, il valore viene redatto solo se soddisfa contemporaneamente:
   $$\text{Entropia di Shannon} > 4.5\text{ bits/carattere} \quad \text{E} \quad \text{Lunghezza} \ge 24\text{ caratteri}$$
   Questo evita falsi positivi su stringhe brevi (es. `password123`) e intercetta hash casuali e token lunghi.
3. **Allowlist Preventiva di Valori Innocui**: Valori standard come `production`, `development`, `localhost`, `127.0.0.1`, `staging`, `utf-8` **non vengono mai oscurati**, anche se associati a chiavi generiche.

### 5.2. Streaming Archive Guardian (Protezione ZIP)
- **Rapporto di Compressione**: $\text{Dimensione Scompattata} / \text{Dimensione Compressa} \le 100:1$. Rapporti superiori vengono rifiutati istantaneamente come *Zip Bomb*.
- **Limiti Rigidi**: Max 20MB per file, max 80MB decompressi totali, max 300 file per archivio.
- **Divieto Assoluto di Path Traversal**: Blocco immediato di qualsiasi percorso contenente `..`, `/` iniziale o byte nulli (`\0`).

---

## 6. Il Modello di Persistenza Tri-Layer

Il sistema non dipende da un singolo database, ma orchestra tre livelli di memorizzazione concorrente:

```
+-------------------------------------------------------------------------------+
| LIVELLO 1: Client In-Memory & Local Database (IndexedDB / LocalStorage)       |
| - Latenza: 0ms (UI ultra-reattiva a 60fps)                                    |
| - Disponibilità: Piena operatività offline anche senza connessione internet   |
+-------------------------------------------------------------------------------+
                                      |
                                      v (Sincronizzazione Atomica / Backup API)
+-------------------------------------------------------------------------------+
| LIVELLO 2: Server Local Disk Snapshot (File JSON Atomico con Ring Buffer)      |
| - File principale: data/vault-backup.json (scrittura atomica temp -> rename)  |
| - Ring Buffer: Ultimi 20 snapshot storici salvati in data/snapshots/          |
| - Auto-Recovery: Ripristino automatico dell'ultimo snapshot integro su crash  |
+-------------------------------------------------------------------------------+
                                      |
                                      v (Persistenza Globale & Multi-Dispositivo)
+-------------------------------------------------------------------------------+
| LIVELLO 3: Cloud Database (Google Firestore / PostgreSQL / SQLite)           |
| - Persistenza remota multi-utente e multi-dispositivo                         |
| - Circuit Breaker con reset temporizzato (protezione da quote 429)            |
+-------------------------------------------------------------------------------+
```

---

## 7. Matrice di Replicazione Agnostica (Alternative Stacks)

Il Knowledge Vault è architettato per essere implementato con **qualsiasi stack tecnologico moderno**. Questa tabella illustra come mappare ciascun componente in ambienti alternativi:

| Componente Vault | Implementazione Attuale (AI Studio) | Alternativa Python (FastAPI) | Alternativa Rust / Go | Alternativa 100% Locale / File-Based |
| :--- | :--- | :--- | :--- | :--- |
| **Runtime & API** | Node.js + Express 5 (TypeScript) | Python 3.12 + FastAPI + Uvicorn | Go (Gin / Fiber) o Rust (Axum) | Python CLI o Script locale da terminale |
| **Livello Storage 1** | IndexedDB / React State | SQLite in-memory o DuckDB | SQLite locale | Cache in RAM (Dict / HashMap) |
| **Livello Storage 2** | `data/vault-backup.json` + snapshot | `vault_backup.json` con `tempfile` | File JSON atomico con rename OS | Cartella di file `.md` (Stile Obsidian) |
| **Livello Storage 3** | Cloud Firestore (`firestore.rules`) | PostgreSQL (con colonne `JSONB`) | PostgreSQL o SQLite | Repository Git con commit automatici |
| **AI Extraction Engine** | Google Gemini (`@google/genai`) | Anthropic Claude SDK o OpenAI SDK | Ollama Client API (Go/Rust) | Modello locale (Llama 3 / Mistral / Ollama) |
| **Grafo Topologico** | D3.js Force Simulation v7 | NetworkX / PyVis / Graphviz | Neo4j / Kùzu DB | Relazioni `[[wikilink]]` native in Markdown |
| **Calcolo Entropia** | Shannon Entropy in TypeScript | `scipy.stats.entropy` o Python puro | Funzione matematica nativa in Go/Rust | Funzione regex + calcolo logaritmico |
| **Ispezione ZIP** | `adm-zip` con header validation | Modulo standard `zipfile.ZipFile` | Crate `zip` (Rust) o `archive/zip` (Go) | Utility di sistema `unzip -t` con sandbox |

---

## 8. Contratti Dati Formali e Pseudocodice per la Replicazione

### 8.1. Algoritmo di Risoluzione Two-Stage (`resolveDocType`)

```typescript
function resolveDocType(type: string, extractedData?: { markdownContent?: string; tags?: string[] }) {
  // 1. Tipi deterministici
  if (type === "mcp_server") return { docType: "tool_description", isLocked: true };
  if (type === "ai_skill") return { docType: "prompt_skill", isLocked: true };
  if (type === "troubleshooting") return { docType: "specification", isLocked: true };
  if (type === "procedure") return { docType: "guide", isLocked: true };
  if (type === "paper") return { docType: "specification", isLocked: true };

  // 2. Triage pre-estrazione (senza contenuto)
  if (!extractedData || !extractedData.markdownContent) {
    return { docType: type === "article" ? "guide" : "concept", isLocked: false };
  }

  // 3. Risoluzione post-estrazione basata sull'AST reale
  const content = extractedData.markdownContent;
  if (/```mermaid|graph (?:TD|LR)/i.test(content)) return { docType: "architecture", isLocked: true };
  if (/```[a-z0-9_-]+\n[\s\S]+?```/i.test(content)) return { docType: "guide", isLocked: true };
  if (/cronologia|secolo|\b\d{3,4}\s*(?:a\.c\.|d\.c\.)\b/i.test(content)) return { docType: "concept", isLocked: true };
  if (/error:|exception:|stack trace/i.test(content)) return { docType: "specification", isLocked: true };

  return { docType: "concept", isLocked: true };
}
```

### 8.2. Algoritmo di Calcolo dell'Entropia di Shannon

$$\text{Entropy}(S) = - \sum_{i=1}^{n} P(c_i) \log_2 P(c_i)$$

```python
import math
from collections import Counter

def calculate_shannon_entropy(s: str) -> float:
    if not s:
        return 0.0
    length = len(s)
    counts = Counter(s)
    entropy = 0.0
    for count in counts.values():
        p = count / length
        entropy -= p * math.log2(p)
    return entropy
```

### 8.3. Serializzazione Frontmatter OKF v0.2 Standard

Ogni file generato dal sistema segue rigorosamente questo template:

```markdown
---
okf_version: "0.2"
id: "doc-1791118000"
title: "Titolo Chiaro e Canonico"
type: "knowledge"
domain: "Software Architecture & Distributed Systems"
docType: "architecture"
tags: ["cloud", "k8s", "resilience", "okf-v0.2"]
created_at: "2026-10-05T08:00:00.000Z"
entities:
  - name: "Kubernetes Cluster"
    type: "technology"
    description: "Infrastruttura di orchestrazione container"
relations:
  - targetTitle: "Knowledge Vault: Architettura Generale"
    relationType: "implements"
    weight: 0.95
    description: "Integrazione con il runtime di elaborazione"
---

# Titolo Chiaro e Canonico

> **Sintesi Esecutiva**: Sintesi chiara e priva di congetture.

---

## 1. Contenuto e Specifiche
Dettaglio documentale verificato...
```

---

## 9. Dove e Come Scaricare Questa Specifica

Questo documento è salvato e accessibile direttamente all'interno dell'applicativo:

1. **Percorso File Locale**:
   `/app/applet/docs/OKF_VAULT_SYSTEM_BLUEPRINT_v0.2.md`
2. **Download Diretto via API Backend**:
   - **Download Diretto (Attachment con intestazione di salvataggio)**:
     `GET /api/vault/docs/download/OKF_VAULT_SYSTEM_BLUEPRINT_v0.2.md`
   - **Visualizzazione Testo / Markdown Grezzo nel Browser**:
     `GET /api/vault/docs/view/OKF_VAULT_SYSTEM_BLUEPRINT_v0.2.md`
   - **Indice dei Documenti di Sistema Disponibili**:
     `GET /api/vault/docs/list`
3. **URL Pubblico dell'Applicazione**:
   È possibile scaricare il file in qualsiasi momento aprendo nel browser l'URL della propria istanza dell'app, concatenato al percorso di download:
   - **Dev App**: `https://ais-dev-7dnrjxf35cozap7hrhymq6-342088760232.europe-west2.run.app/api/vault/docs/download/OKF_VAULT_SYSTEM_BLUEPRINT_v0.2.md`
   - **Shared App**: `https://ais-pre-7dnrjxf35cozap7hrhymq6-342088760232.europe-west2.run.app/api/vault/docs/download/OKF_VAULT_SYSTEM_BLUEPRINT_v0.2.md`
