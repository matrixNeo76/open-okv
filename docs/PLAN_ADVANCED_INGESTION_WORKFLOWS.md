---
okf_version: "0.2"
id: "plan-advanced-ingestion-workflows"
title: "Piano Operativo: Implementazione Pipeline di Ingestione Avanzata e Workflow Remoti"
type: "guide"
domain: "Engineering Roadmaps & Implementation Plans"
tags: ["okf", "plan", "roadmap", "ingestion", "jupyter", "webhook", "youtube", "batch-migration"]
entities:
  - name: "Knowledge Vault Core"
    type: "technology"
    description: "Applicazione full-stack Knowledge Vault"
  - name: "Cekikj Ingestion Framework"
    type: "framework"
    description: "Quadro metodologico per l'ingestione e la validazione rigorosa dei contenuti"
relations:
  - targetTitle: "Specifica Formale: Pipeline di Ingestione Avanzata, Fonti Eterogenee e Workflow Remoti (SPEC_ADVANCED_INGESTION_WORKFLOWS)"
    relationType: "implements"
    weight: 1.0
    description: "Pianifica l'esecuzione operativa delle funzionalità descritte nella specifica tecnica"
  - targetTitle: "Pipeline di Ingestione e Intelligenza Estrattiva OKF v0.2 (INGESTION_PIPELINE_SPEC)"
    relationType: "extends"
    weight: 0.95
    description: "Estende operativamente la pipeline con nuovi moduli specializzati"
---

# Piano Operativo: Implementazione Pipeline di Ingestione Avanzata e Workflow Remoti

> **Documento di Pianificazione per il Team di Ingegneria**  
> *Riferimento Tecnico: [`docs/SPEC_ADVANCED_INGESTION_WORKFLOWS.md`](docs/SPEC_ADVANCED_INGESTION_WORKFLOWS.md)*  
> *Stato: IN ATTESA DI CONFERMA DA PARTE DELL'UTENTE*  

---

## Panoramica delle 4 Fasi di Esecuzione

```
[FASE 1: Jupyter .ipynb] ---> [FASE 2: Inbound Webhook] ---> [FASE 3: Video Intelligence] ---> [FASE 4: Batch ZIP Migration]
Parsing celle & output       Endpoint REST + Token Auth     YouTube Player & Timeline       Decompressione & Wikilinks OKF
```

---

## FASE 1: Pipeline di Ingestione Nativa Jupyter Notebook (`.ipynb`)
**Obiettivo**: Consentire l'upload e il drag-and-drop di notebook di Data Science / Machine Learning (`.ipynb`), ripulendo gli output binari e producendo guide OKF v0.2 riproducibili.

- [ ] **1.1 Modulo di Parsing Backend (`server/services/ipynbParser.ts`)**:
  - Creare la funzione `parseJupyterNotebookBuffer(buffer: Buffer)`:
    - Parsare il formato JSON `nbformat`.
    - Iterare sulle celle Markdown e Code.
    - Filtrare gli stream di testo e scartare le immagini raster e mime non testuali.
    - Generare una trascrizione ordinata e coerente.
- [ ] **1.2 Integrazione nell'Endpoint Multimodale (`server/routes/captureRoutes.ts`)**:
  - Aggiungere il riconoscimento di `ext === "ipynb"` in `/api/convert-file-to-okf`.
  - Configurare il prompt specializzato per classificare il documento come `type: "knowledge"`, `docType: "guide"` con tag `["jupyter", "python", "data-science"]`.
- [ ] **1.3 Aggiornamento Filtri Frontend (`src/components/CaptureBar.tsx`)**:
  - Aggiungere `.ipynb` tra le estensioni accettate nell'input file nativo.
- [ ] **1.4 Test di Verifica**:
  - Testare l'ingestione di un notebook contenente equazioni, codice e testo esplicativo, verificando l'assenza di payload binari corrotti nel frontmatter OKF v0.2.

---

## FASE 2: Inbound Webhook & Remote Capture API (`POST /api/webhook/capture`)
**Obiettivo**: Consentire l'archiviazione di link, appunti o log diagnostici dall'esterno del browser tramite estensioni, bookmarklet o script CI/CD.

- [ ] **2.1 Definizione Rotta Backend (`server/routes/webhookRoutes.ts`)**:
  - Implementare l'endpoint `POST /api/webhook/capture`.
  - Verificare l'header `Authorization: Bearer <TOKEN>` o query string `?token=...`.
  - Mappare il payload in ingresso con validazione e sanitizzazione dello schema.
- [ ] **2.2 Esecuzione Ingestione & Persistenza**:
  - Collegare la richiesta alla logica di `analyze-resource` / `openGraphService`.
  - Scrivere la risorsa su Firestore con il flag `source: "webhook"`.
- [ ] **2.3 Generazione Token nelle Impostazioni UI**:
  - Aggiungere un pannello di gestione Webhook Token nelle impostazioni utente del Vault con snippet `curl` di esempio e codice Bookmarklet pronto all'uso.
- [ ] **2.4 Test di Verifica**:
  - Simulare una chiamata cURL esterna e verificare l'immediata comparsa della risorsa in tempo reale sul Vault via listener `onSnapshot`.

---

## FASE 3: Video Tech Talks & YouTube Intelligence
**Obiettivo**: Gestione completa di conferenze tecniche e video tutorial di YouTube, con player embedded responsive e capitoli semantici.

- [ ] **3.1 Integrazione Player Video nei Componenti UI**:
  - In `src/components/KnowledgeReader.tsx` e `src/components/ResourceModal.tsx`, rilevare `resource.metadata?.mediaType === "video"` o link YouTube.
  - Integrare un player responsive `<iframe>` con lazy loading su `youtube-nocookie.com`.
- [ ] **3.2 Sezione Capitoli & Timeline Concettuale**:
  - Visualizzare i timestamp interattivi con link diretto al minutaggio del video (`&t=...s`).
- [ ] **3.3 Badge & Visualizzazione nelle Card**:
  - Mostrare il badge `Video Talk` con icona dedicata in `ResourceCard.tsx`.
- [ ] **3.4 Test di Verifica**:
  - Testare l'ingestione di un URL YouTube per verificare la thumbnail ad alta risoluzione (`maxresdefault.jpg`) e la riproduzione nel modal.

---

## FASE 4: Batch Migration Engine (Obsidian / Notion `.zip`)
**Obiettivo**: Consentire l'importazione di interi archivi di note in formato Markdown con traduzione automatica dei wikilink in archi del grafo OKF v0.2.

- [ ] **4.1 Servizio di Decompressione e Mappatura (`server/services/batchMigrationService.ts`)**:
  - Decomprimere l'archivio ZIP in memoria.
  - Creare l'indice dei titoli e dei file `.md`.
  - Individuare i pattern `[[titolo]]` e trasformarli in relazioni relazionali `relations: [{ targetTitle, relationType: 'references' }]`.
- [ ] **4.2 Persistenza Batch Firestore**:
  - Eseguire scritture raggruppate (`writeBatch`) per salvaguardare le quote di rete.
- [ ] **4.3 Dialogo UI di Importazione Massiva**:
  - Componente di avanzamento con barra progressiva ed elenco delle schede create e collegate nel grafo.
- [ ] **4.4 Test di Verifica**:
  - Testare un archivio di esempio con 5 note interconnesse e verificare la corretta comparsa dei link nel grafo D3.

---

## Criteri di Validazione & Rollout
1. **Nessun Impatto Negativo sulle Funzionalità Esistenti**: La compilazione deve avere esito positivo (`Build succeeded`) e le rotte esistenti devono mantenere piena retrocompatibilità.
2. **Conformità Assoluta OKF v0.2**: Ogni documento generato da uno dei 4 workflow deve includere il blocco frontmatter YAML valido.
