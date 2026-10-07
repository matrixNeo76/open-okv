---
okf_version: "0.2"
id: "spec-gemini-ai-engine"
title: "Google Gemini AI Engine Guidelines (GEMINI.md)"
type: "specification"
domain: "AI Engineering & Structured Generation"
tags: ["okf", "specification", "gemini", "gemini-3.7-flash", "structured-output", "fallback", "json-schema"]
entities:
  - name: "Gemini 3.7 Flash"
    type: "technology"
    description: "Modello primario per l'estrazione analitica strutturata e sintesi topologica"
  - name: "Structured JSON Schema"
    type: "schema"
    description: "Definizione formale del payload JSON restituito dalla pipeline di analisi"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Definisce il formato di serializzazione prodotto da Gemini"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "implements"
    weight: 0.95
    description: "Specifica l'orchestrazione dei modelli e dei fallback"
---

# Google Gemini AI Engine Guidelines (GEMINI.md)

> **Linee Guida per l'Orchestrazione del Modello Gemini, Parsing Strutturato e Gestione Fallback**  
> *Per la documentazione tecnica canonica e i contratti formali dettagliati, consultare i documenti nella cartella `/docs`:*  
> 1. [`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md) — *Specifica Formale Ufficiale OKF v0.2*  
> 2. [`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md) — *Blueprint Architetturale Dettagliato*  
> 3. [`docs/INGESTION_PIPELINE_SPEC.md`](docs/INGESTION_PIPELINE_SPEC.md) — *Pipeline di Ingestione e Fallback Euristico*  
> 4. [`docs/SYSTEM_REPLICATION_GUIDE.md`](docs/SYSTEM_REPLICATION_GUIDE.md) — *Guida Operativa alla Replicazione Completa*  

---

## 1. Modelli e Priorità di Esecuzione

- **Modello Primario**: `gemini-3.7-flash` (massima velocità, precisione analitica e supporto a JSON Schema rigoroso).
- **Modelli di Fallback Cloud**: `gemini-flash-latest`, `gemini-3.1-flash-lite` (attivati automaticamente in caso di picchi di carico 503, degradazione temporanea o quote).
- **Fallback Euristico Locale**: Nel caso di indisponibilità di tutti i modelli o timeout (>15s), l'estrattore a regole locale estrae titolo, tag, frontmatter e valutazioni con latenza 0ms.

---

## 2. Schema di Risposta JSON Structured Output

Gli endpoint di backend (`/api/analyze-resource` per testo/URL e `/api/convert-file-to-okf` per file e media) producono un oggetto JSON rigoroso conforme a:
- `type`: `knowledge` | `troubleshooting` | `article` | `github_repo` | `mcp_server` | `ai_skill` | `paper` | `note` | `rss` | `document_refactor`
- `title`: Stringa descrittiva e canonica
- `summary`: Sintesi chiara in lingua italiana o inglese
- `tags`: Array di etichette tecniche in minuscolo
- `metadata`:
  - `okfVersion`: `"0.2"`
  - `domain`: Ambito di applicazione (es. "System Diagnostics & OS", "Cloud Architecture", "Developer Tooling")
  - `docType`: `"concept"` | `"architecture"` | `"guide"` | `"specification"` | `"tool_description"` | `"prompt_skill"`
  - `mediaType`: `"image"` | `"audio"` | `"pdf"` | `"document"` (presente per asset grafici o multimediali)
  - `imageUrl`: Data URI dell'anteprima grafica (per immagini/screenshot <500KB)
  - `affectedSystem`: Piattaforma, framework o libreria affetta (obbligatorio per `troubleshooting`)
  - `errorLog`: Trascrizione OCR letterale dell'errore o stack trace visibile
  - `rootCause`: Spiegazione tecnica della causa radice
  - `solutionSteps`: Array ordinato di passaggi operativi di risoluzione
  - `entities`: Array di oggetti con `{ name, type, description }`
  - `relations`: Array di oggetti con `{ targetTitle, relationType, weight, description }`
  - `markdownContent`: Testo formattato completo con frontmatter YAML conforme OKF v0.2

---

## 3. Direttive Multimodali per Immagini e Screenshot (Vision Mandate)

Quando viene elaborato un file grafico o screenshot su `/api/convert-file-to-okf`:
1. **Auto-Classificazione Visiva Deterministica**:
   - Se l'immagine contiene un alert di errore, crash, stack trace o bug -> Classificare categoricamente come `type: "troubleshooting"` (docType: `specification`).
   - Se l'immagine è un diagramma di architettura, flusso o schema cloud -> Classificare come `type: "knowledge"` (docType: `architecture`), estraendo ciascun componente come entità e ogni connessione come relazione.
   - Se l'immagine è uno snippet di codice da IDE/terminale -> Classificare come `type: "knowledge"` (docType: `guide`) con blocco codice formattato.
   - Se l'immagine è un prompt o configurazione di agente -> Classificare come `type: "ai_skill"`.
2. **Divieto di Tipi Allucinati**:
   - Il modello **NON deve mai** restituire stringhe inventate nel campo `type` (es. `ColorSpecification`, `Screenshot`, `GraphicAsset`); deve sempre mappare rigorosamente a uno dei tipi canonici di risorsa.
3. **Persistenza Asset Visivo**:
   - Assegnare sempre `mediaType: "image"` e valorizzare `imageUrl` per consentire l'anteprima istantanea nei visualizzatori del Vault.
