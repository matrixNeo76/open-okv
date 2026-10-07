---
okf_version: "0.2"
id: "spec-specialized-sota-ingestion"
title: "Specifica Formale: Pipeline di Ingestione Specialistica SOTA e Cekikj Epistemic Gate"
type: "specification"
domain: "Knowledge Ingestion & Multimodal AI"
tags: ["okf", "specification", "ingestion", "cekikj", "gemini-3.8-flash", "papers", "mcp", "anti-hallucination", "latex"]
entities:
  - name: "Cekikj Epistemic Gate"
    type: "governance"
    description: "Cancello deterministico per il rifiuto delle congetture (Zero-Guessing), verifica proof-chains e tracciamento contraddizioni"
  - name: "Gemini 3.8 Flash Multimodal"
    type: "technology"
    description: "Modello AI multimodale di punta con Thinking Budget (1024-2048 token) per comprensione visiva e strutturata dei documenti"
  - name: "Deterministic Pre-Flight Gate"
    type: "architecture"
    description: "Filtro pre-AI per verifica integrità binaria, calcolo SHA-256 e deduplicazione nel Vault"
  - name: "Open Knowledge Format v0.2"
    type: "specification"
    description: "Standard canonico di serializzazione per tutte le risorse tecniche archiviate nel Knowledge Vault"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Definisce il formato di serializzazione finale per le risorse ingerite"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "extends"
    weight: 0.95
    description: "Estende la pipeline originaria con routing a 7 canali specializzati e Cekikj Gate"
  - targetTitle: "Protocolli Operativi per Agenti Autonomi (AGENTS.md)"
    relationType: "implements"
    weight: 0.95
    description: "Implementa i principi operativi di conformità epistemica Cekikj nell'ingestione"
---

# Specifica Formale: Pipeline di Ingestione Specialistica SOTA e Cekikj Epistemic Gate

> **Documento Canonico di Specifica Architetturale per l'Ingestione Multimodale del Knowledge Vault (OKF v0.2)**  
> *Autore: Knowledge Vault Engineering Team & Cekikj Epistemic Engine*  
> *Data di Rilascio: Settembre 2026*  

---

## 1. Visione & Obiettivi Architetturali

Il Knowledge Vault richiede che ogni risorsa ingerita — sia essa un **paper scientifico accademico (PDF)**, un **repository GitHub**, un **server MCP**, un'**AI Skill**, un **articolo tecnico**, una **nota concettuale** o una **traccia audio** — sia processata attraverso una **pipeline specialistica ontologicamente consapevole**, supportata da un **doppio cancello deterministico pre e post-generazione** per azzerare qualsiasi allucinazione (Zero-Guessing).

### Principi Fondamentali:
1. **Deterministic Pre-Flight Gate (0ms AI)**:
   Nessun dato raggiunge il modello LLM senza aver superato l'analisi dei magic bytes, il calcolo hash SHA-256 (per deduplicazione certa) e l'estrazione deterministica dei metadati di sistema (XMP, PDF Info, ID3).
2. **Specialized Multimodal Routing**:
   Routing deterministico verso 7 pipeline specializzate con prompt, schemi e parametri calibrati per ciascun dominio della sidebar.
3. **Multimodal Native SOTA Understanding**:
   Per i PDF accademici e scientifici: invio binario diretto a **Gemini 3.8 Flash** o **Gemini 3.7 Flash** con Thinking Budget attivo (2048 token per paper e codice), preservando il layout a 2 colonne, le equazioni LaTeX (`$$...$$`), tabelle e figure senza dipendere da estrattori di testo piatti.
4. **Cekikj Epistemic Grounding Gate (Post-Generation Gate)**:
   - **Zero-Guessing**: se il documento non contiene informazioni su un campo (es. venue, dataset, metriche), l'AI ha il divieto di congetturare e il campo viene marcato con `insufficient: true`.
   - **Proof-Chains Verificate**: ogni claim chiave deve essere agganciato a un estratto testuale effettivo del documento sorgente.
   - **Scanner delle Contraddizioni**: confronto automatico con le risorse già archiviate nel Vault; apertura immediata di record nel Registro delle Contraddizioni e tracciamento dell'arco `contradicts` nel Grafo D3.
   - **Integrità Referenziale del Grafo**: nessuna relazione (`references`, `extends`, `implements`) può puntare a targetId inesistenti.

---

## 2. Architettura a Triplo Cancello

```
                             [INPUT UTENTE / FILE BUFFER]
                                          │
                                          ▼
             ┌─────────────────────────────────────────────────────────┐
             │       GANCIO 1: DETERMINISTIC PRE-FLIGHT GATE           │
             │ - Magic bytes (PDF, ZIP, Audio, Markdown)               │
             │ - Calcolo Hash SHA-256 (Deduplicazione certa)          │
             │ - Estrazione Metadati Nativi (XMP, PDF Info, ID3)       │
             │ - Test Integrità e Lunghezza Minima Contenuto           │
             └────────────────────────────┬────────────────────────────┘
                                          │ [Verifica Superata]
                                          ▼
             ┌─────────────────────────────────────────────────────────┐
             │    GANCIO 2: SPECIALIZED PIPELINE + GEMINI 3.8 SOTA     │
             │ - Routing specialistico (7 Pipeline Dedicate)           │
             │ - Multimodal Native Processing (LaTeX $$..$$, bicolonna)│
             │ - Generazione vincolata con Thinking Budget (2048 tok)  │
             └────────────────────────────┬────────────────────────────┘
                                          │ [Output Generato]
                                          ▼
             ┌─────────────────────────────────────────────────────────┐
             │       GANCIO 3: CEKIKJ EPISTEMIC GROUNDING GATE         │
             │ 1. Zero-Guessing Audit: verifica Proof-Chains sorgente  │
             │ 2. Contradiction Scanner: confronto vs risorse Vault    │
             │ 3. Lexical N-Gram Anchor Check (Evidenza >= 0.80)       │
             │ 4. Graph Referential Integrity (TargetId esistenti)     │
             └────────────────────────────┬────────────────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
          [Grounding >= 0.85]     [Dati Parziali]       [Contraddizione Rilevata]
                  │                       │                       │
                  ▼                       ▼                       ▼
          [STATO: CERTIFIED]      [STATO: INSUFFICIENT]   [STATO: CONTRADICTION]
          - OKF v0.2 Valido       - Segnalazione Campi    - Apertura Record nel
          - Grafo D3 Collegato      Omessi (Zero Guess)     Registro Epistemico
          - Scrittura Atomica     - Bozza Trasparente     - Arco "contradicts" D3
```

---

## 3. Matrice Funzionale delle 7 Pipeline Specializzate

| Pipeline | Target e Tipi MIME | Pre-Flight Gate | Estrazione Gemini 3.8 SOTA | Cekikj Epistemic Gate |
| :--- | :--- | :--- | :--- | :--- |
| **1. Paper Scientifici** | `application/pdf`, `.pdf`, URL ArXiv/DOI | Magic bytes `%PDF`, estrazione XMP nativa, DOI match, SHA-256. | Invio binario diretto multimodale (2-colonne, equazioni LaTeX `$$...$$`, venue, dataset). Thinking budget: 2048 token. | **Proof-chain obbligatoria per formule e benchmark**. Rigetto di metriche senza riscontro nella sorgente. Rilevazione contraddizioni con paper già nel Vault. |
| **2. GitHub Repo** | URL GitHub, archivi `.zip`, `tar.gz` | Regex URL GitHub, ispezione manifesti (`package.json`, `Cargo.toml`, `go.mod`), HTTP HEAD. | Architettura, stack tecnologico, diagramma di flusso Mermaid, istruzioni di build. | **Verifica esistenza comandi nei manifesti**. Se mancano file di configurazione, segnala `insufficient: true` senza ipotizzare stack. |
| **3. Server MCP** | `package.json`, config JSON, snippet TS/Python | Verifica formale JSON Schema Draft 7, individuazione costrutti MCP (`tools`, `resources`). | Mappa dei permessi, comandi di avvio (`npx/uvx`), configurazione client MCP pronta all'uso. | **Validazione sintassi Tool Calling**. Rifiuto di parametri arbitrari non inclusi nello schema JSON dei tool. |
| **4. AI Skills** | `SKILL.md`, System Prompts | Frontmatter YAML, test lunghezza minima prompt, identificazione parametri `{{VAR}}`. | Guardrails epistemici, contratti I/O, failure modes, banco di test con esempi. | **Contratto di Invoking rigoroso**. Verifica che tutti i parametri abbiano un tipo esplicito e vincoli definiti. |
| **5. Articoli & Web** | URL `http/https`, file HTML | Scraping OpenGraph deterministico, download ripulito da tag script/style, calcolo tempo di lettura. | Executive TL;DR, punti chiave per sviluppatori, citazioni dirette autorevoli. | **Quote Verification**: le citazioni "virgolettate" devono essere sottostringhe identiche del testo HTML originale. |
| **6. Specifiche & Note** | `.md`, `.markdown`, `.txt` | Parsing nativo frontmatter YAML, calcolo checksum, estrazione link `[[wiki]]`. | Normalizzazione OKF v0.2, arricchimento ontologico entità canoniche, pesi relazionali. | **Schema Validator OKF v0.2**. Blocco di tag o campi non conformi; verifica corrispondenza nodi nel grafo D3. |
| **7. Tracce Audio & Voice** | `audio/*` (`.mp3, .wav, .m4a`) | Verifica durata (>3s, <4h), formato audio e integrità stream. | Gemini Audio Multimodale: timestamping, diarizzazione speaker, estrazione decisioni e action items. | **Temporal Grounding**: ogni punto decisionale deve essere ancorato a un timestamp `[mm:ss]` valido e verificabile nella traccia. |

---

## 4. Contratto dei Dati Epistemici Cekikj

Ogni risorsa ingerita arricchisce i propri metadati con il blocco `cekikjEvaluation`:

```json
{
  "metadata": {
    "okfVersion": "0.2",
    "domain": "Academic Research & LLM Architectures",
    "docType": "specification",
    "cekikjEvaluation": {
      "status": "certified_grounded",
      "groundingScore": 0.94,
      "insufficient": false,
      "insufficientFields": [],
      "contradictions": [],
      "verifiedProofChains": [
        {
          "claim": "Superamento del benchmark MMLU con punteggio del 88.7%",
          "sourceExcerpt": "Table 2: MMLU evaluation shows 88.7% accuracy across 57 tasks",
          "confidence": 0.98
        }
      ],
      "sha256": "8a4f91b...",
      "pipelineUsed": "academic_paper"
    }
  }
}
```
