---
okf_version: "0.2"
id: "spec-ingestion-pipeline-intelligence"
title: "Specifica della Pipeline di Ingestione, Estrazione AI e De-duplicazione OKF v0.2"
type: "specification"
domain: "Ingestion Pipelines & Agentic Extraction"
tags: ["okf", "specification", "ingestion", "gemini-3.7-flash", "structured-output", "opengraph", "conflict-resolver", "cekikj"]
entities:
  - name: "CaptureBar Engine"
    type: "component"
    description: "Componente frontend reattivo con supporto drag-and-drop, inserimento URL e selezione tipologia esplicita"
  - name: "OpenGraph Ingestion Service"
    type: "service"
    description: "Modulo backend che esegue scraping e parsing rapido dei metadati HTML (og:title, og:image, autore, favicon)"
  - name: "Gemini 3.7 Flash Structured Pipeline"
    type: "toolchain"
    description: "Pipeline generativa server-side vincolata da JSON Schema rigoroso conforme allo standard OKF v0.2"
  - name: "Local Heuristic Fallback Parser"
    type: "component"
    description: "Estrattore basato su regole deterministiche a latenza 0ms che garantisce il salvataggio anche in assenza di rete o quote AI"
  - name: "Conflict & Canonical De-duplicator"
    type: "pattern"
    description: "Algoritmo di riconciliazione che fonde ID locali temporanei e record Firestore remoti prevenendo schede duplicate"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Produce documenti rigorosamente strutturati secondo lo standard OKF v0.2"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "depends_on"
    weight: 0.95
    description: "Si integra con l'architettura a 3 livelli e con il server Express unificato"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "references"
    weight: 0.85
    description: "Fornisce i dettagli implementativi per gli endpoint /api/analyze-resource"
---

# Specifica della Pipeline di Ingestione, Estrazione AI e De-duplicazione

> **Stato**: STABILE / OPERATIVO  
> **Endpoint Primario**: `POST /api/analyze-resource`  
> **Architettura**: Multi-Stadio con Fallback Euristico a Latenza Zero

---

## 1. Ciclo di Vita dell'Ingestione (Le 5 Fasi di Cattura)

Ogni risorsa catturata tramite l'interfaccia utente (`src/components/CaptureBar.tsx`) o tramite API segue un flusso a 5 stati sequenziali:

```
[1. SENDING] ---> [2. ANALYZING] ---> [3. TRANSFORMING] ---> [4. SAVING] ---> [5. SUCCESS]
Invio payload     Scraping Web +      Normalizzazione OKF    Scrittura Cloud   Notifica UI e
e triage input    Gemini 3.7 Flash    ed estrazione entità   + Backup locale   focalizzazione
```

### Dettaglio degli Stati:
1. **`sending`**: Validazione iniziale del testo, rilevamento pattern (URL standard, GitHub repository, JSON MCP, Markdown raw).
2. **`analyzing`**: Estrazione metadati OpenGraph e chiamata all'endpoint `/api/analyze-resource`.
3. **`transforming`**: Animazione e feedback contestuale differenziato per categoria (`Articolo & Guida`, `Web Link`, `GitHub Repo`, `OKF Bozza`, `OKF Documento`).
4. **`saving`**: Persistenza concorrente: scrittura Firestore (timeout 20s) con scrittura parallela sul backup locale.
5. **`success`**: Emissione del log strutturato, aggiornamento dei contatori ed evidenziazione visiva della scheda appena creata.

---

## 2. Ingestione Web & OpenGraph Extraction

Se l'input corrisponde a un URL (`http://` o `https://`), il servizio `server/services/openGraphService.ts`:
1. Esegue una richiesta HTTP `GET` con timeout di 6.000ms e intestazioni User-Agent browser standard.
2. Estrae:
   - `og:title` o tag `<title>` HTML (con sanitizzazione entità HTML).
   - `og:description` o tag `<meta name="description">`.
   - `og:image` (immagine di copertina ad alta risoluzione).
   - `author` o tag `<meta name="author">`.
   - Favicon di dominio tramite Google Favicon Service (`https://www.google.com/s2/favicons?domain=...&sz=64`).
3. Se l'utente ha selezionato un tipo esplicito (es. **Articolo**), il sistema assegna rigorosamente tale tipo, impiegando il titolo editoriale estratto come titolo primario della risorsa.

---

## 3. Schema JSON Rigoroso Gemini 3.7 Flash (Structured Output)

Il backend interroga il modello `gemini-3.7-flash` tramite il modulo `@google/genai` server-side, forzando la risposta all'interno del seguente schema JSON:

```json
{
  "type": "knowledge | troubleshooting | article | github_repo | mcp_server | ai_skill | paper | note | rss | document_refactor",
  "title": "Titolo descrittivo e sintetico",
  "summary": "Sintesi chiara e contestualizzata dell'argomento",
  "tags": ["tag1", "tag2", "tag3"],
  "metadata": {
    "okfVersion": "0.2",
    "domain": "Ambito applicativo",
    "docType": "concept | architecture | guide | specification | tool_description | prompt_skill",
    "mediaType": "image | audio | pdf | document",
    "imageUrl": "Data URL anteprima grafica (se immagine)",
    "affectedSystem": "Piattaforma o componente interessato (se troubleshooting)",
    "errorLog": "Trascrizione OCR letterale del messaggio d'errore (se troubleshooting)",
    "rootCause": "Analisi tecnica della causa radice (se troubleshooting)",
    "solutionSteps": ["Passo 1", "Passo 2", "Passo 3"],
    "entities": [
      {
        "name": "Nome Entità",
        "type": "technology | concept | framework | organization | toolchain | pattern",
        "description": "Ruolo dell'entità"
      }
    ],
    "relations": [
      {
        "targetTitle": "Titolo Risorsa Esistente",
        "relationType": "references | implements | depends_on | extends | documents",
        "weight": 0.85,
        "description": "Motivazione del collegamento"
      }
    ],
    "markdownContent": "Documento completo formattato in Markdown con frontmatter YAML conforme OKF v0.2",
    "useCases": ["Caso d'uso 1", "Caso d'uso 2"],
    "score": 85,
    "scoreRationale": "Valutazione dell'utilità tecnica"
  }
}
```

---

## 4. Gerarchia di Fallback a Latenza Zero

Per garantire che l'applicazione non interrompa mai l'operatività:

1. **Livello 1 (Cloud Primario)**: `gemini-3.7-flash` con Google Search Grounding attivo per l'arricchimento di URL e repo.
2. **Livello 2 (Cloud Fallback)**: `gemini-flash-latest` o `gemini-3.1-flash-lite` in caso di errori 503 temporanei o saturazione quota.
3. **Livello 3 (Local Rule-Based Parser)**: Funzione `localFallbackAnalyzeResource()` in `src/lib/ruleBasedParser.ts`.  
   - Esecuzione sincrona a **0ms** senza dipendenza da server esterni o connessione Internet.
   - Genera titolo pulito, tipo canonico, tag euristici, metadati OpenGraph e documento OKF v0.2 valido con frontmatter YAML generato deterministicamente.

---

## 5. Algoritmo di Riconciliazione e Prevenzione Duplicati (`conflictResolver.ts`)

Quando una risorsa viene salvata:
1. Viene calcolata la **Firma Canonica della Risorsa**:
   - Per risorse con URL: `url:${cleanUrl}` (URL normalizzato senza slash finale e senza parametri di tracking).
   - Per documenti interni senza URL: `title:${cleanTitle}` (se il titolo supera gli 8 caratteri e non appartiene alla lista dei titoli generici).
2. **Prevenzione Collisione Concorrente**:
   - Se durante la scrittura su Firestore il client riceve un errore di timeout ma il pacchetto era già in volo, il sistema controlla lo stato locale prima di generare un ID temporaneo `local-`.
   - Se una risorsa con la stessa firma canonica è già presente o arriva via `onSnapshot`, l'ID locale temporaneo viene fuso silenziosamente con il record remoto canonico, evitando qualsiasi duplicazione visiva a schermo.

---

## 6. Pipeline Multimodale per File, Immagini e Screenshot (`/api/convert-file-to-okf`)

Oltre al testo e agli URL, il Vault supporta l'ingestione diretta di file binari e multimodali (immagini PNG/JPG/WEBP, documenti PDF, tracce audio MP3/WAV/WebM e file di codice).

### Flusso di Elaborazione Multimodale:
1. **Ricezione Payload**: Il client converte il file in Base64 (`readFileAsBase64`) e lo invia a `POST /api/convert-file-to-okf`.
2. **Ispezione Visiva & Vision Mandate (Gemini Multimodal)**:
   - Se il file è un'immagine (`mimeType: image/*`), i bytes Base64 vengono passati nel payload multimodale (`inlineData`) a Gemini.
   - **Auto-Classificazione Visiva Deterministica**:
     * **Screenshot di Errore / Crash / Bug / Terminale**: Se l'immagine contiene un alert di errore, terminale con exit code o stack trace, Gemini classifica automaticamente la risorsa come `type: "troubleshooting"`, trascrive letteralmente l'errore in `errorLog`, ne analizza la `rootCause` e fornisce la procedura numerata in `solutionSteps`.
     * **Diagrammi di Architettura / Topologie Cloud**: Se l'immagine rappresenta un'architettura o flusso, viene classificata come `type: "knowledge"` con `docType: "architecture"`, estraendo ciascun componente come entità e i connettori come relazioni ontologiche nel grafo D3.
     * **Snippet di Codice**: Se l'immagine ritrae codice in un editor/terminale, viene classificata con `docType: "guide"` con OCR e formattazione in blocchi codice Markdown.
     * **Prompt AI / Skill**: Classificata come `type: "ai_skill"`.
3. **Persistenza Asset e Anteprima Visiva**:
   - Viene sempre valorizzato `mediaType: "image"` nei metadati.
   - Per immagini di dimensioni adeguate (<500KB), il Data URI viene conservato in `metadata.imageUrl` e `metadata.ogImage`, consentendo l'anteprima visiva immediata nelle schede (`ResourceCard`), nel modale di dettaglio (`ResourceModal`) e nel lettore a schermo intero (`KnowledgeReader`).
4. **Validazione OKF v0.2**: Il Markdown risultante contiene sempre il frontmatter YAML completo con `okf_version: "0.2"`, garantendo conformità e integrazione nel grafo relazionale.

---

## 7. Pipeline Specialistica per Jupyter Notebook (`.ipynb`)

I notebook computazionali (`.ipynb`) costituiscono una delle fonti primarie di conoscenza empirica in Data Science e Machine Learning:
1. **Modulo di Parsing Pre-AI (`server/services/ipynbParser.ts`)**:
   - Decomprime ed analizza la struttura JSON `nbformat`.
   - Estrae ordinatamente le celle Markdown (mantenendo formule LaTeX e sezioni esplicative) e le celle di codice Python.
   - **Filtro Output Binari**: Elimina grafici raster in base64 e lunghi output numerici per preservare la leggibilità e l'efficienza di archiviazione, conservando solo messaggi di errore o output testuali significativi.
2. **Standardizzazione OKF v0.2**:
   - La risorsa viene tipizzata deterministicamente come `type: "knowledge"`, `docType: "guide"`, `domain: "Data Science & Machine Learning"`.
   - Viene generato un documento didattico conforme contenente blocchi codice riproducibili e YAML frontmatter nativo.

---

## 8. Inbound Webhook & Remote Capture API (`POST /api/webhook/capture`)

Per consentire la cattura fluida da estensioni browser, script CI/CD (es. GitHub Actions su fallimento test) o automazioni da terminale:
1. **Autenticazione Sicura**: L'endpoint richiede un token Bearer univoco generato dal Vault (`Authorization: Bearer <VAULT_WEBHOOK_SECRET>`).
2. **Triage Automatico**: L'endpoint analizza il payload (URL o testo grezzo), individua il tipo di risorsa ed esegue il routing verso il motore di estrazione appropriato.
3. **Persistenza Disaccoppiata**: I dati vengono registrati istantaneamente nel Vault ed emessi in tempo reale al client tramite il flusso Firestore `onSnapshot`.
4. **Strumenti Utente**: L'interfaccia mette a disposizione un modale (`WebhookModal.tsx`) con token rigenerabile, comandi `curl` pronti all'uso e codice JavaScript per Bookmarklet da trascinare nella barra dei preferiti.

---

## 9. Batch Migration Engine per Archivi ZIP (Obsidian / Notion `.zip`)

Per facilitare la transizione da strumenti terzi (Obsidian, Notion, archivi Markdown locali):
1. **Decompressione & Indicizzazione in Memoria (`server/services/batchMigrationService.ts`)**:
   - Sfrutta `adm-zip` per scansionare ricorsivamente tutti i file `.md` dell'archivio, ignorando cartelle di sistema (`.obsidian/`, `.git/`, `.trash/`).
2. **Risoluzione Topologica dei `[[wikilinks]]`**:
   - Individua tutte le occorrenze della sintassi `[[Nome Documento]]` o `[[Nome Documento|Testo Alternativo]]`.
   - Mappa ogni wikilink a una relazione ontologica esplicita OKF v0.2:
     ```yaml
     relations:
       - targetTitle: "Nome Documento"
         relationType: "references"
         weight: 0.85
         description: "Collegamento topologico migrato da wikilink [[Nome Documento]]"
     ```
3. **Endpoint Dedicato & Upload Diretto**:
   - Disponibile sia tramite `POST /api/import-vault-archive` che caricando direttamente un file `.zip` nella barra di cattura (`CaptureBar`).
   - Restituisce l'elenco completo dei documenti convertiti pronti per la sincronizzazione nel Vault.

---

## 10. Intelligence Video Tech Talks & YouTube Playback

I video tecnici, webinar e talk accademici sono trattati come cittadini di prima classe nel Vault:
1. **Rilevamento e Ingestione YouTube**:
   - Il servizio `openGraphService.ts` intercetta URL di YouTube (`youtube.com/watch?v=...`, `youtu.be/...`), estraendo il video ID a 11 caratteri.
   - Recupera automaticamente la thumbnail HD (`maxresdefault.jpg` con fallback su `hqdefault.jpg`).
   - Assegna `mediaType: "video"` e badge tematico `Video Talk` nelle card.
2. **Player Embedded Responsive**:
   - `KnowledgeReader.tsx` e `ResourceModal.tsx` incorporano un player protetto tramite `youtube-nocookie.com`, consentendo la consultazione del talk senza abbandonare l'ambiente di studio del Vault.

