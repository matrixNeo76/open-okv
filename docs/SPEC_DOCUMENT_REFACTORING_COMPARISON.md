---
okf_version: "0.2"
id: "spec-document-refactoring-comparison"
title: "Specifica Tecnica: Refactoring Intelligente di Documenti con Comparazione Side-by-Side (SPEC_DOCUMENT_REFACTORING_COMPARISON.md)"
type: "specification"
domain: "Knowledge Engineering & Document Refactoring"
tags: ["okf", "specification", "document-refactoring", "diff-viewer", "epistemic-audit", "side-by-side", "gemini-3.7-flash"]
entities:
  - name: "Document Refactoring Engine"
    type: "technology"
    description: "Motore neurale per la comprensione profonda, ristrutturazione ed espansione di documenti grezzi in OKF v0.2"
  - name: "Side-by-Side Diff Inspector"
    type: "component"
    description: "Componente visuale per il confronto split-view tra fonte grezza originale e specifica normalizzata"
  - name: "Dual-Layer Document Model"
    type: "architecture"
    description: "Modello di persistenza che conserva immutata la fonte originale e genera la versione raffinata collegata al grafo"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "implements"
    weight: 1.0
    description: "Normalizza il documento rielaborato secondo lo schema formale OKF v0.2"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "extends"
    weight: 0.95
    description: "Estende la pipeline di ingestione con il gate di comparazione ed approvazione utente"
  - targetTitle: "Google Gemini AI Engine Guidelines (GEMINI.md)"
    relationType: "references"
    weight: 0.9
    description: "Impiega Gemini 3.7 Flash con prompt specializzato a Zero-Guessing"
---

# Specifica Tecnica: Refactoring Intelligente di Documenti con Comparazione Side-by-Side

> **Documento di Specifica Formale — Knowledge Vault OKF v0.2**  
> *Rielaborazione Profonda di Documenti Mal Scritti, Conservazione Fonte Grezza e Comparazione Visuale*

---

## 1. Obiettivo e Visione Architetturale

La presente specifica definisce l'architettura, i contratti dati e le interfacce per la funzionalità di **Refactoring & Miglioramento Documentale**.

### 1.1 Il Problema
Quando un utente inserisce o allega (tramite la graffetta della `CaptureBar`) un documento non rifinito — bozze disorganizzate, appunti informali, trascrizioni vocali, note tecniche frammentarie o documentazione legacy:
1. Il documento manca di una gerarchia logica e di conformità allo standard OKF v0.2.
2. Mancano le entità canoniche e le relazioni per l'inserimento nel grafo topologico D3.
3. Se l'AI sovrascrive interamente il testo senza un'ispezione comparativa, l'utente rischia di perdere dettagli specifici della bozza originale (*epistemic opacity*).

### 1.2 La Soluzione
Un flusso specializzato che:
1. **Comprende a fondo** il documento preservando ogni fatto, dato e istruzione tecnica (*Zero-Guessing*).
2. **Ristruttura ed espande** il documento secondo la grammatica formale **OKF v0.2** (Frontmatter YAML, titoli gerarchici, sommario esecutivo, callout e diagrammi testuali).
3. **Mantiene la fonte originale** immutata come metadato di audit storico (`metadata.rawSourceDocument`).
4. **Presenta una modale di comparazione Side-by-Side (Diff)**: visualizza affiancati la fonte originale e il nuovo documento, calcola il delta di leggibilità e qualità, e consente all'utente di ispezionare, ritoccare o approvare la modifica prima del salvataggio nel Vault o dell'esportazione su Google Docs.

---

## 2. Definizione del Flusso Operativo

```
[Utente seleziona "Rielabora & Migliora" nella CaptureBar]
                         │
                         ▼
[Caricamento File tramite Graffetta (o testo incollato)]
                         │
                         ▼
      [POST /api/refactor-document (Express/Gemini)]
                         │
       ┌─────────────────┴─────────────────┐
       ▼                                   ▼
 [Analisi Semantica Profonda]      [Preservazione Fonte Grezza]
       │                                   │
       ▼                                   │
 [Rielaborazione Strutturata OKF v0.2]      │
       │                                   │
       └─────────────────┬─────────────────┘
                         │
                         ▼
        [Apertura Modale Side-by-Side Diff]
      ┌──────────────────┬──────────────────┐
      │  Fonte Originale │  Versione OKF    │
      │  (Testo Intonso) │  (Rielaborata)   │
      └──────────────────┴──────────────────┘
                         │
         [Utente approva / ritocca / salva]
                         │
                         ▼
   [Persistenza Firestore con metadati completi]
                         │
                         ▼
[Navigazione nel KnowledgeReader con Toggle Originale / Rielaborato]
```

---

## 3. Contratti Dati e Schema dei Metadati

### 3.1 Estensione di `ResourceMetadata`
In `src/types.ts`, il metadato della risorsa viene arricchito con:

```typescript
export interface RefactoringAudit {
  originalCharCount: number;
  enhancedCharCount: number;
  readabilityBefore: number; // 0 - 100
  readabilityAfter: number;  // 0 - 100
  improvementsApplied: string[]; // es. ["Aggiunto Frontmatter OKF v0.2", "Riorganizzate 4 sezioni logiche"]
  keyDifferencesSummary: string; // Sintesi testuale delle modifiche
  refactoredAt: string; // ISO date
  modelUsed: string;
}

export interface ResourceMetadata {
  // Campi esistenti...
  isRefactored?: boolean;
  rawSourceDocument?: string; // Il testo originale intonso caricato dall'utente
  refactoringAudit?: RefactoringAudit;
}
```

### 3.2 Endpoint Backend: `POST /api/refactor-document`
- **Request Body**:
  ```json
  {
    "textContent": "string (bozza grezza)",
    "base64Data": "string (opzionale per file binari)",
    "fileName": "string",
    "mimeType": "string",
    "userInstructions": "string (opzionale)",
    "existingResources": [{ "id": "...", "title": "...", "type": "...", "tags": [...] }],
    "preferredModel": "gemini-3.7-flash"
  }
  ```

- **Response Body**:
  ```json
  {
    "success": true,
    "originalContent": "...",
    "enhancedResource": {
      "type": "knowledge",
      "title": "...",
      "summary": "...",
      "tags": ["..."],
      "metadata": {
        "okfVersion": "0.2",
        "domain": "...",
        "docType": "specification",
        "score": 95,
        "markdownContent": "--- ... --- \n\n# ...",
        "rawSourceDocument": "...",
        "refactoringAudit": { ... },
        "entities": [ ... ],
        "relations": [ ... ]
      }
    }
  }
  ```

---

## 4. Regole di Refactoring Epistemico (Prompt Governance)

Il modello LLM viene vincolato dai seguenti principi inderogabili:
1. **Conservazione della Verità Fattuale (Zero-Guessing)**: Nessun dato numerico, parametro di configurazione, credenziale o formula deve essere alterato, omesso o inventato.
2. **Strutturazione Gerarchica OKF v0.2**:
   - Titolo esplicito e sintetico.
   - Frontmatter YAML valido in testa.
   - Sommario esecutivo (*Executive Summary*) con focus sul valore tecnico.
   - Punti salienti (*Executive Takeaways*) con spunte semantiche.
   - Corpo documentale suddiviso in paragrafi logici con sottotitoli H2/H3 e tabelle comparative se presenti dati tabellari.
   - Esempi di codice racchiusi in blocchi con specificatore di linguaggio.
3. **Estrazione di Entità e Relazioni per il Grafo**: Individuare le tecnologie e i concetti chiave menzionati ed agganciarli semanticamente alle risorse già archiviate nel Vault.

---

## 5. Componenti Utente (UI/UX)

1. **Opzione nella CaptureBar**:
   - Voce `document_refactor` (o modalità attiva "Rielabora & Migliora Bozza").
   - Quando attiva, il drag-and-drop o l'uso della graffetta indirizzano la richiesta al flusso di refactoring anziché al salvataggio cieco.
2. **`DocumentComparisonModal.tsx`**:
   - Vista affiancata split-screen (su schermi larghi) o tabellare (su mobile).
   - Evidenziazione metrica (*Score Delta*: da 40 a 94, +54%).
   - Lista delle migliorie applicate in chip colorati.
   - Tab "Anteprima Renderizzata" vs "Codice Markdown".
   - Pulsanti di azione: "Conferma e Salva nel Vault", "Esporta in Google Doc", "Modifica", "Annulla".
3. **`KnowledgeReader.tsx`**:
   - Riconoscimento delle risorse con `metadata.rawSourceDocument`.
   - Tab switcher superiore: `📄 Specifica OKF v0.2` | `📜 Fonte Originale Grezza` | `⚖️ Confronta (Diff)`.
