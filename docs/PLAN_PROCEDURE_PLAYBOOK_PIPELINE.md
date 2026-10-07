---
okf_version: "0.2"
id: "plan-procedure-playbook-pipeline"
title: "Piano Operativo: Implementazione Pipeline Procedure & Playbook (SOP Engine)"
type: "guide"
domain: "Engineering Roadmaps & Implementation Plans"
tags: ["okf", "plan", "roadmap", "procedure", "playbook", "sop", "sidebar", "checklist"]
entities:
  - name: "Knowledge Vault Core"
    type: "technology"
    description: "Applicazione full-stack Knowledge Vault"
  - name: "SOP Pipeline Roadmap"
    type: "framework"
    description: "Sequenza operativa di sviluppo e collaudo del sottosistema procedure"
relations:
  - targetTitle: "Specifica Formale: Pipeline di Ingestione Procedure & Playbook Operativi (SPEC_PROCEDURE_PLAYBOOK_PIPELINE)"
    relationType: "implements"
    weight: 1.0
    description: "Guida l'esecuzione operativa delle funzionalità previste dalla specifica tecnica"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "extends"
    weight: 0.95
    description: "Aggiunge il tipo di risorsa procedurale e il nodo dedicato nel grafo D3"
---

# Piano Operativo: Implementazione Pipeline Procedure & Playbook (SOP Engine)

> **Documento di Pianificazione per il Team di Ingegneria**  
> *Riferimento Tecnico: [`docs/SPEC_PROCEDURE_PLAYBOOK_PIPELINE.md`](docs/SPEC_PROCEDURE_PLAYBOOK_PIPELINE.md)*  
> *Stato: IN ATTESA DI CONFERMA DA PARTE DELL'UTENTE*  

---

## Panoramica delle Fasi di Esecuzione

```
[FASE 1: Tipi & Modello Dati] ---> [FASE 2: Backend & Gemini Mandate] ---> [FASE 3: Sidebar & CaptureBar] ---> [FASE 4: Schede & Checklist UI] ---> [FASE 5: Mesh Grafo & Collaudo]
src/types.ts                      captureRoutes.ts + Schemi JSON           Sidebar.tsx + CaptureBar.tsx        ResourceCard + Reader Modal         KnowledgeGraph + Test
```

---

## FASE 1: Estensione Tipi TypeScript e Contratti Dati
**Obiettivo**: Riconoscere `procedure` come tipologia canonica nativa nel sistema.

- [ ] **1.1 Estensione `ResourceType` e `NavCategory` (`src/types.ts`)**:
  - Aggiungere `'procedure'` a `ResourceType`.
  - Verificare la corretta propagazione automatica a `NavCategory`.
- [ ] **1.2 Definizione Metadati Procedura in `ResourceMetadata` (`src/types.ts`)**:
  - Introdurre i campi: `procedureType`, `targetSystem`, `estimatedDuration`, `riskLevel`, `requiredTools`, `safetyWarnings`, `prerequisites`, `stepsCount`, `rollbackPlan`, `relatedTroubleshootingIds`.
- [ ] **1.3 Aggiornamento Contatori di Navigazione**:
  - Aggiungere `procedure?: number` nei conteggi di `SidebarProps.counts` e in `useVaultData.ts`.

---

## FASE 2: Backend Gemini SOP Mandate & Ingestione Specializzata
**Obiettivo**: Generare playbook procedurali rigorosi sia tramite prompt generativo che tramite fallback locale deterministico.

- [ ] **2.1 Definizione Prompt Mandate (`server/routes/captureRoutes.ts`)**:
  - Creare il `PROCEDURE & PLAYBOOK ENGINE MANDATE` per `/api/analyze-resource` e `/api/convert-file-to-okf`.
  - Istruire Gemini a strutturare:
    1. **Obiettivo e Ambito Operativo**
    2. **Prerequisiti & Strumenti Necessari**
    3. **Passaggi Sequenziali Numerati con Criteri di Accettazione**
    4. **Piano di Rollback / Fallback**
    5. **Sezione Errori Correlati (con collegamenti a nodi di troubleshooting esistenti nel Vault)**.
- [ ] **2.2 Aggiornamento Schema JSON Structured Output**:
  - Includere i campi procedurali nella risposta JSON di Gemini (`estimatedDuration`, `riskLevel`, `requiredTools`, `rollbackPlan`).
- [ ] **2.3 Fallback Euristico Locale (`src/lib/ruleBasedParser.ts` e `server/services/heuristicParser.ts`)**:
  - Riconoscere keyword procedurali (`playbook`, `procedura`, `come fare`, `guida installazione`, `manutenzione`, `onboarding`) per classificare deterministicamente come `procedure` a latenza 0ms.

---

## FASE 3: Integrazione Frontend (Sidebar Sinistra & CaptureBar)
**Obiettivo**: Rendere accessibile la creazione e il filtraggio delle procedure in tutti i punti di ingresso dell'app.

- [ ] **3.1 Sidebar Sinistra (`src/components/Sidebar.tsx`)**:
  - Aggiungere il pulsante di filtro:
    - **Icona**: `Workflow` (o `ClipboardList`).
    - **Etichetta**: `Procedure & Playbook`.
    - **Badge contatore**: `{counts.procedure || 0}`.
    - **Categoria attiva**: `onSelectCategory("procedure")`.
- [ ] **3.2 Selettore Tipo nella CaptureBar (`src/components/CaptureBar.tsx`)**:
  - Aggiungere l'opzione nel dropdown delle categorie:
    - `id: "procedure"`, `label: "Procedura / Playbook"`, icona `Workflow`.
  - Configurare il placeholder dinamico quando `procedure` è selezionato:
    *"Descrivi la procedura, incolla appunti di assistenza o trascina foto/manuale..."*.
- [ ] **3.3 Sincronizzazione Contatori in `src/hooks/useVaultData.ts`**:
  - Calcolare `procedure: resources.filter((r) => r.type === "procedure").length`.

---

## FASE 4: Visualizzazione Schede e Checklist Eseguibile Interattiva
**Obiettivo**: Fornire ai tecnici uno strumento di lavoro operativo sul campo.

- [ ] **4.1 Badge e Pillole Informative in `ResourceCard.tsx`**:
  - Badge distintivo `Procedura` / `Playbook` con colore ciano/ambra.
  - Mostrare tempo stimato (`⏱️ 20 min`), livello di rischio (`Rischio Alto`) e target di sistema.
- [ ] **4.2 Modalità Checklist Eseguibile in `ResourceModal.tsx` e `KnowledgeReader.tsx`**:
  - Rilevare se la risorsa è di tipo `procedure` e formattare i passaggi con checkbox interattive per spuntare i progressi durante l'intervento.
  - Visualizzare il box di attenzione **"Piano di Rollback"** in caso di imprevisti.
  - Mostrare la card di collegamento **"Errori Noti Correlati"** per aprire direttamente la scheda di troubleshooting pertinente.

---

## FASE 5: Integrazione Grafo Ontologico D3 e Collaudo
**Obiettivo**: Verificare la visualizzazione dei collegamenti nel grafo e testare la compilazione.

- [ ] **5.1 Grafo D3 (`src/components/KnowledgeGraph.tsx`)**:
  - Aggiungere il colore dedicato per i nodi `procedure` (Ciano `#06B6D4` o Ambra `#C5A059`).
  - Renderizzare gli archi `prevents`, `requires_procedure` e `mitigates` che collegano procedure ed errori.
- [ ] **5.2 Verifica e Compilazione**:
  - Eseguire `lint_applet` e `compile_applet`.
  - Verificare l'assenza di regressioni.
