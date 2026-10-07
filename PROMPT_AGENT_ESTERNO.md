---
okf_version: "0.2"
id: "skill-external-agent-bootstrap"
title: "Prompt di Innesco e Protocollo di Onboarding per Agenti AI Esterni (PROMPT_AGENT_ESTERNO.md)"
type: "prompt_skill"
domain: "Autonomous Agents & Onboarding Protocols"
tags: ["okf", "prompt_skill", "agent", "prompt", "onboarding", "bootstrap", "claude-code", "cursor", "replication"]
entities:
  - name: "External AI Agent"
    type: "technology"
    description: "Modello linguistico o agente autonomo esterno (Claude Code, Cursor, Windsurf, Devin, GPT-4o, Copilot)"
  - name: "Bootstrap Prompt Contract"
    type: "specification"
    description: "Istruzione formale che impone la sequenza di lettura canonica e i vincoli architetturali del Vault"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "governs"
    weight: 1.0
    description: "Impone il rispetto della grammatica e dello schema OKF v0.2"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "references"
    weight: 1.0
    description: "Fornisce il contesto strutturale necessario per l'agente"
  - targetTitle: "Guida alla Replicazione Completa del Vault per LLM e Sviluppatori (SYSTEM_REPLICATION_GUIDE)"
    relationType: "implements"
    weight: 0.95
    description: "Guida l'agente nell'eventuale replicazione o estensione del codice"
---

# Prompt di Innesco e Protocollo di Onboarding per Agenti AI Esterni

> **Come usare questo documento**:  
> Quando apri una nuova sessione con un **Agente AI Esterno** (come *Claude Code CLI*, *Cursor Agent*, *Windsurf Cascade*, *Devin*, *Aider*, *GitHub Copilot* o *ChatGPT/Claude Web* con accesso alla repository), **copia e incolla interamente il riquadro qui sotto come PRIMO PROMPT ASSOLUTO**.

---

## 📋 IL PROMPT DA COPIARE E INCOLLARE ALL'AGENTE ESTERNO

```markdown
Sei l'Agente AI principale incaricato di operare sul repository "Knowledge Vault (OKF v0.2)".
Prima di formulare congetture, pianificare modifiche o scrivere qualsiasi riga di codice, hai il MANDATO PERENTORIO di leggere e metabolizzare la documentazione tecnica ufficiale situata nella cartella `/docs`.

Questo progetto implementa uno standard ontologico rigido (OKF v0.2) e un'architettura full-stack precisa.
Non tentare di indovinarne la struttura da convenzioni generiche o template standard.

### FASE 1 — SEQUENZA DI LETTURA OBBLIGATORIA (In questo ordine esatto):
1. `docs/OKF_v0.2_SPECIFICATION.md`
   -> Comprendi lo standard formale OKF v0.2: schema YAML obbligatorio, la tassonomia rigorosa dei 6 tipi (concept, architecture, guide, specification, tool_description, prompt_skill), le relazioni tipizzate e la normalizzazione delle entità.
2. `docs/SYSTEM_ARCHITECTURE_OKF.md`
   -> Comprendi l'architettura a 3 livelli di storage (IndexedDB -> Server JSON Ring Buffer a 20 snapshot -> Cloud Firestore), il server unificato Express + Vite su porta 3000, il grafo topologico fisico D3 a 5 forze e il modulo epistemico Cekikj (Zero-Guessing).
3. `docs/INGESTION_PIPELINE_SPEC.md`
   -> Comprendi il ciclo di cattura a 5 stadi (sending, analyzing, transforming, saving, success), l'estrazione OpenGraph, il parsing strutturato Gemini 3.7 Flash e la de-duplicazione con firma canonica in `conflictResolver.ts`.
4. `docs/SYSTEM_REPLICATION_GUIDE.md`
   -> Comprendi la configurazione di runtime, dipendenze npm, variabili d'ambiente, albero dei file e comandi di build.
5. `docs/PROJECT_STRUCTURE.md`
   -> Consulta la mappa ragionata di tutte le cartelle, sottocartelle e file di `server/` e `src/` per sapere esattamente dove risiede ogni modulo senza esplorare alla cieca.
6. `docs/SPEC_PIANO_MITIGAZIONE_CRITICITA_OKF.md`
   -> Comprendi la matrice dei rischi e le mitigazioni attive: Circuit Breaker per quote Firestore (reset PST), scritture atomiche su disco, fallback a 0ms e allineamento MCP.

### FASE 2 — REGOLE ARCHITETTURALI E VINCOLI NON NEGOZIABILI:
- **Porta Unica**: Il container espone SOLO la porta 3000. Il file `server.ts` unifica Express e il middleware Vite. Non creare dev-server o porte separate.
- **Sicurezza API**: Nessuna chiave API (es. GEMINI_API_KEY) deve mai apparire nel client o essere prefissata con VITE_. Tutte le chiamate AI transitano da `/api/*`.
- **Formato Documenti**: Qualsiasi file di documentazione o scheda generata DEVE includere il frontmatter YAML conforme a OKF v0.2 (`okf_version: "0.2"`).
- **Zero-Guessing & Grounding**: Rispetta il protocollo Cekikj: non allucinare relazioni o sintesi non presenti nei documenti; se i dati sono insufficienti, restituisci `insufficient: true`.
- **Prevenzione Duplicati**: Ogni salvataggio deve rispettare la riconciliazione basata su firma URL canonica in `conflictResolver.ts`.

### FASE 3 — CONFERMA DI AVVENUTA ACQUISIZIONE:
Rispondi confermando di aver letto i 4 documenti specificando in 4 brevi punti:
1. I 6 tipi canonici ammessi in OKF v0.2;
2. Come funziona la persistenza a 3 livelli;
3. Il ruolo del server unificato su porta 3000;
4. Quale compito o feature vuoi che affrontiamo ora.
```

---

## 🎯 Perché questo prompt funziona al 100%?

1. **Elimina le allucinazioni all'origine**: L'agente viene istruito a fermarsi e leggere i 4 contratti normativi prima di azzardare supposizioni sul codice.
2. **Inversione di controllo con Test di Conformità**: Chiedere all'agente di elencare i 6 tipi canonici e i 3 livelli di storage costringe il modello ad aprire ed elaborare realmente i file, evitando che risponda con superficiali conferme di rito.
3. **Fissa i vincoli di sistema prima di toccare il codice**: Previene gli errori tipici dei modelli esterni (come tentare di lanciare Vite sulla porta 5173, esporre chiavi API nel frontend o rompere il formato YAML del frontmatter).
