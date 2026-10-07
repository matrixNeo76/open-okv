---
okf_version: "0.2"
id: "spec-advanced-ingestion-workflows"
title: "Specifica Formale: Pipeline di Ingestione Avanzata, Fonti Eterogenee e Workflow Remoti"
type: "specification"
domain: "Knowledge Ingestion & Multimodal Workflows"
tags: ["okf", "specification", "ingestion", "jupyter", "webhook", "batch-migration", "youtube", "obsidian", "cekikj"]
entities:
  - name: "Jupyter Notebook Ingestion Engine"
    type: "component"
    description: "Parser specializzato per notebook .ipynb che estrae e separa celle Markdown e codice Python ripulito da output binari"
  - name: "Remote Webhook Capture Service"
    type: "service"
    description: "Endpoint REST autenticato per l'ingestione remota da browser extension, script CI/CD e scorciatoie di sistema"
  - name: "Vault Batch Migration Engine"
    type: "toolchain"
    description: "Servizio di importazione massiva di archivi ZIP da Obsidian, Notion e Markdown grezzo con risoluzione automatica dei wikilink in archi OKF"
  - name: "Video Tech Talk Intelligence Pipeline"
    type: "pipeline"
    description: "Analizzatore di talk tecnici e video YouTube con estrazione thumbnail HD, capitoli concettuali e sintesi architetturale"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Impone i vincoli di serializzazione e topologia ontologica ai nuovi formati"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "extends"
    weight: 0.95
    description: "Estende la pipeline di acquisizione con 4 nuovi canali specializzati"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "integrates"
    weight: 0.9
    description: "Si integra con il server Express e il modello di persistenza a 3 livelli del Vault"
---

# Specifica Formale: Pipeline di Ingestione Avanzata, Fonti Eterogenee e Workflow Remoti

> **Documento Tecnico Normativo del Knowledge Vault (OKF v0.2 Native)**  
> *Modulo: Advanced Ingestion Engines & Remote Workflows*  
> *Stato: PROPOSTA / IN ATTESA DI CONFERMA*  

---

## 1. Visione e Obiettivi del Modulo

Il Knowledge Vault mira a costituire il repository centrale ed esaustivo della conoscenza tecnica di sviluppatori, ricercatori e team AI. Per completare il panorama di acquisizione dopo l'integrazione di testi, PDF, tracce audio, repository GitHub, feed RSS e screenshot visivi, il modulo introduce quattro workflow specialistici:

1. **Jupyter Notebook (`.ipynb`) Ingestion**: Trasformazione nativa di notebook computazionali in guide tecniche OKF v0.2 rigorose, preservando spiegazioni teoriche e codice essenziale.
2. **Inbound Webhook & Remote Capture API (`POST /api/webhook/capture`)**: Ingestione istantanea e disaccoppiata dall'interfaccia, utilizzabile da estensioni browser (Chrome/Firefox), bookmarklet, automazioni raycast/alfred e workflow CI/CD (GitHub Actions su fallimento build).
3. **Batch Import & Vault Migration Engine**: Importazione massiva di interi archivi compressi (`.zip`) esportati da Obsidian o Notion, con traduzione automatica dei `[[wikilinks]]` interni in relazioni ontologiche formalizzate.
4. **Video Tech Talk Intelligence (YouTube / Talk Scientifici)**: Comprensione strutturata di conferenze, tutorial video e presentazioni con estrazione di capitoli semantici e timeline dei concetti chiave.

---

## 2. Specifiche Tecniche per Singolo Workflow

### 2.1. Pipeline Jupyter Notebook (`.ipynb`)

#### Contratto di Ingestione:
- **Estensioni ammesse**: `.ipynb`
- **MIME type**: `application/x-ipynb+json` o `application/json`
- **Logica di Parsing (Pre-AI)**:
  1. Decodifica JSON della struttura standard Jupyter (formato `nbformat v4`).
  2. Iterazione ordinata sull'array `cells`:
     - **Celle `markdown`**: Conservazione integrale del testo esplicativo, formule LaTeX e titoli.
     - **Celle `code`**: Estrazione del sorgente Python (`source`), scartando gli output binari pesanti (immagini base64 di matplotlib, array numerici numpy grezzi) e mantenendo solo brevi stringhe di output testuale o errori di esecuzione.
     - **Celle `raw`**: Normalizzazione in testo semplice.
  3. Composizione di un documento intermedio pulito strutturato in sezioni logiche.
- **Output OKF v0.2**:
  - `type`: `"knowledge"`
  - `metadata.docType`: `"guide"`
  - `metadata.domain`: `"Data Science & Machine Learning"` (o ambito specifico rilevato)
  - `metadata.sourceFileType`: `"ipynb"`
  - `markdownContent`: Guida didattica riproducibile conforme OKF v0.2 con blocchi codice ````python ... ```` e frontmatter YAML.

---

### 2.2. Inbound Webhook & Remote Capture API (`POST /api/webhook/capture`)

#### Contratto di Interfaccia:
- **Metodo HTTP**: `POST`
- **Rotta**: `/api/webhook/capture`
- **Autenticazione**: Bearer Token impostato nelle impostazioni utente del Vault (`Authorization: Bearer <VAULT_WEBHOOK_SECRET>`) o parametro query sicuro `?token=...`.
- **Payload Request (JSON)**:
  ```json
  {
    "url": "https://example.com/tech-article",
    "text": "Snippet di testo opzionale o appunti",
    "source": "chrome_extension | github_action | raycast | api",
    "explicitType": "auto | article | troubleshooting | knowledge | note",
    "tags": ["ci-cd", "build-error"],
    "title": "Titolo opzionale pre-impostato"
  }
  ```
- **Flusso Operativo**:
  1. Validazione token e associazione all'account utente (`userId`).
  2. Routing automatico verso la pipeline di analisi appropriata (`/api/analyze-resource`).
  3. Scrittura concorrente sul database (Firestore + Local Backup snapshot).
  4. Risposta rapida (`201 Created`) con payload `{ success: true, resourceId: "...", title: "..." }`.

---

### 2.3. Batch Import & Vault Migration Engine (Obsidian / Notion `.zip`)

#### Contratto di Importazione Massiva:
- **Formato accettato**: Archivio `.zip` contenente gerarchie di file `.md`.
- **Endpoint di Upload**: `POST /api/import-vault-archive` (multipart o base64).
- **Pipeline a 3 Fasi**:
  1. **Unzip & Scanning**: Decompressione in memoria o storage temporaneo sandbox, scansione ricorsiva di tutti i file `.md` e identificazione dei titoli.
  2. **Wikilink Resolution & Topologia**:
     - Parsing dei link in formato Obsidian: `[[Nome Documento]]` o `[[Nome Documento|Testo Alternativo]]`.
     - Creazione automatica di un grafo delle dipendenze: ogni `[[Target]]` viene convertito nel frontmatter OKF v0.2:
       ```yaml
       relations:
         - targetTitle: "Nome Documento"
           relationType: "references"
           weight: 0.8
           description: "Collegamento bidirezionale migrato da wikilink"
       ```
  3. **Batch Firestore Persistence**: Scrittura a lotti (`writeBatch`, massimo 500 documenti per batch) per garantire efficienza e rispetto dei limiti di rete.

---

### 2.4. Video Tech Talk Intelligence (YouTube / Talk Scientifici)

#### Contratto di Arricchimento Video:
- **Trigger**: URL corrispondente a pattern `youtube.com/watch?v=...` o `youtu.be/...`.
- **Estrazione Metadati**:
  - `videoId`: Identificativo univoco a 11 caratteri.
  - `ogImage`: Thumbnail ad altissima definizione `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` (con fallback su `hqdefault.jpg`).
  - `siteName`: `"YouTube"`.
  - `mediaType`: `"video"`.
- **Prompt Specialistico di Comprensione Video**:
  - Sfrutta Gemini con Search Grounding per recuperare l'abstract del talk, il relatore e i capitoli temporali (`00:00 - Introduzione`, `12:45 - Nuova Architettura`, `28:10 - Benchmark`).
  - Struttura la risorsa con badge `Video Talk`, consentendo l'incorporamento del player YouTube (`iframe` responsive) direttamente nel lettore `KnowledgeReader` e nel modale di dettaglio.

---

## 3. Matrice di Retrocompatibilità

Tutti i nuovi flussi rispettano rigorosamente lo standard **OKF v0.2**:
- I campi metadati rispettano la struttura `ResourceMetadata` in `src/types.ts`.
- Non viene alterato il comportamento esistente per URL web, file di testo, PDF e immagini.
- Nessuna dipendenza esterna binaria pesante: l'estrazione `.ipynb` sfrutta il parser JSON nativo, e la gestione `.zip` impiega librerie standard Node.js.
