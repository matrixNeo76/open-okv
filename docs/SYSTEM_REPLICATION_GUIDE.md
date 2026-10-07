---
okf_version: "0.2"
id: "guide-vault-replication-full"
title: "Guida alla Replicazione Completa del Knowledge Vault per LLM e Sviluppatori"
type: "guide"
domain: "Software Engineering & Application Bootstrapping"
tags: ["okf", "guide", "replication", "bootstrap", "react", "express", "vite", "tailwind", "d3", "firestore"]
entities:
  - name: "Knowledge Vault Codebase"
    type: "technology"
    description: "Insieme completo dei sorgenti TypeScript, componenti React, rotte Express e file di configurazione"
  - name: "Vite + Express Runner"
    type: "toolchain"
    description: "Pipeline di esecuzione unificata su porta 3000 con tsx in sviluppo e build compilata in produzione"
  - name: "Firebase Client Configuration"
    type: "specification"
    description: "Configurazione client Firestore con fallback resiliente e supporto multi-utente basato su userId"
  - name: "OKF Parser & Serializer Suite"
    type: "component"
    description: "Moduli TypeScript dedicati al parsing e alla generazione bidirezionale di documenti conformi a OKF v0.2"
relations:
  - targetTitle: "Specifica Formale Ufficiale dello Standard OKF v0.2 (OKF_v0.2_SPECIFICATION)"
    relationType: "references"
    weight: 0.95
    description: "Fornisce la specifica formale dei dati usata in tutta l'applicazione"
  - targetTitle: "Architettura di Sistema del Knowledge Vault (SYSTEM_ARCHITECTURE_OKF)"
    relationType: "implements"
    weight: 1.0
    description: "Costituisce la guida pratica passo-passo per implementare l'architettura di sistema descritta"
---

# Guida alla Replicazione Completa del Knowledge Vault

> **Destinatari**: Modelli Linguistici Autonomi (LLM), Architetti Software, Sviluppatori Full-Stack  
> **Obiettivo**: Ricostruire da zero l'intero applicativo Knowledge Vault con fedeltà funzionale, visiva e architetturale al 100%.

---

## 1. Prerequisiti di Sistema e Dipendenze Primarie

### Requisiti di Runtime:
- **Node.js**: v20.x o superiore (con supporto a ES Modules ed `import`).
- **NPM**: v10.x o superiore.
- **Porta di Rete**: Porta `3000` (unica porta esposta per il traffico client e le API backend).

### Dipendenze `package.json` Fondamentali:
```json
{
  "name": "knowledge-vault-okf",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^0.1.1",
    "d3": "^7.9.0",
    "express": "^4.21.2",
    "firebase": "^10.14.1",
    "lucide-react": "^0.475.0",
    "motion": "^12.4.7",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^9.0.3"
  },
  "devDependencies": {
    "@types/d3": "^7.4.3",
    "@types/express": "^4.17.21",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "esbuild": "^0.24.2",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.5.3",
    "vite": "^5.4.2"
  }
}
```

---

## 2. Struttura del Progetto e Mappa dei File

Per replicare fedelmente l'applicazione, la struttura del repository deve essere organizzata come segue:

```
├── .env.example                     # Template variabili d'ambiente (GEMINI_API_KEY, FIREBASE_CONFIG)
├── package.json                     # Definizione script e dipendenze
├── server.ts                        # Entry point unico: Express API + Vite Middleware
├── server/
│   ├── routes/
│   │   ├── captureRoutes.ts         # Endpoint /api/analyze-resource, convert-file-to-okf, import-vault-archive
│   │   ├── vaultRoutes.ts           # Backup, snapshot ciclici, persistenza atomica (/api/vault/*)
│   │   ├── webhookRoutes.ts         # Inbound Webhook & Remote Capture API (/api/webhook/*)
│   │   ├── mcpRoutes.ts             # Server Model Context Protocol nativo (/api/mcp/*)
│   │   └── telemetryRoutes.ts       # Statistiche e telemetria quote (/api/telemetry/*)
│   └── services/
│       ├── openGraphService.ts      # Scraping metadati HTML, og:title, og:image, YouTube video metadata
│       ├── ipynbParser.ts           # Parser JSON nbformat per Jupyter Notebooks senza output binari
│       ├── batchMigrationService.ts # Estrazione archivi ZIP Obsidian/Notion con risoluzione [[wikilinks]]
│       ├── rssService.ts            # Proxy e parser feed RSS/Atom
│       ├── deterministicGates.ts    # Pre-flight SHA-256 e validazione deterministica
│       ├── cekikjIngestionGate.ts   # Guardrail epistemico e validazione asserzioni
│       └── specializedPipelines.ts  # Pipeline specializzate per Paper accademici e Troubleshooting
├── src/
│   ├── main.tsx                     # Entry point React
│   ├── App.tsx                      # Layout principale, routing a visualizzazioni e tab
│   ├── types.ts                     # Definizioni TypeScript (ResourceItem, OKFEntity, OKFRelation)
│   ├── components/
│   │   ├── CaptureBar.tsx           # Barra di cattura intelligente con selettore tipologia
│   │   ├── KnowledgeGraph.tsx       # Grafo topologico fisico D3.js a 5 forze
│   │   ├── ResourceCard.tsx         # Scheda risorsa con badge, tag, score e azioni rapide
│   │   ├── OKFDocumentViewer.tsx    # Visualizzatore ed editor OKF v0.2 con frontmatter YAML
│   │   ├── VaultIntelligenceDrawer.tsx # Drawer per interrogazione analitica ed export OKF
│   │   └── Sidebar.tsx              # Navigazione, filtri di dominio e stato quota
│   ├── hooks/
│   │   ├── useVaultData.ts          # Sincronizzazione a 3 livelli (IDB -> Backup -> Firestore)
│   │   └── useVaultCapture.ts       # Macchina a stati delle 5 fasi di cattura
│   └── lib/
│       ├── conflictResolver.ts      # De-duplicazione e riconciliazione ID locali e remoti
│       ├── okfParser.ts             # Parser euristico del frontmatter YAML OKF v0.2
│       ├── okfSerializer.ts         # Generatore ed esportatore di file Markdown OKF v0.2
│       └── firebase.ts              # Inizializzazione SDK Firebase e listener Firestore
├── data/
│   ├── vault-backup.json            # Backup locale primario del server
│   └── snapshots/                   # Ring buffer circolare (ultimi 20 snapshot temporizzati)
└── docs/
    ├── OKF_v0.2_SPECIFICATION.md    # Specifica formale dello standard
    ├── SYSTEM_ARCHITECTURE_OKF.md   # Blueprint architetturale completo
    ├── INGESTION_PIPELINE_SPEC.md   # Specifica della pipeline di estrazione
    └── SYSTEM_REPLICATION_GUIDE.md  # Questa guida di replicazione
```

---

## 3. Configurazione del Server Unificato (`server.ts`)

Il backend deve esporre le rotte API `/api/*` prima di montare il middleware Vite:

```typescript
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { captureRouter } from "./server/routes/captureRoutes";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // 1. Registrazione rotte API REST
  app.use("/api", captureRouter);

  // 2. Integrazione Middleware Vite / Static Hosting
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Vault Server] Operativo su http://0.0.0.0:${PORT}`);
  });
}

startServer();
```

---

## 4. Implementazione del Parser e Serializzatore OKF v0.2

Ogni LLM o modulo che interagisce con i file Markdown deve implementare due funzioni fondamentali:

### Parsing del Frontmatter YAML (`okfParser.ts`):
```typescript
export function parseOKFDocument(rawText: string): ParsedOKFDocument {
  const match = rawText.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*([\s\S]*)$/);
  if (!match) {
    return createDefaultDraft(rawText);
  }
  const rawYaml = match[1];
  const bodyMarkdown = match[2].trim();
  // Estrazione di: okf_version, title, type, domain, tags, entities, relations
  return { isValidOKF: true, ...parsedData, bodyMarkdown };
}
```

### Serializzazione e Generazione Frontmatter (`okfSerializer.ts`):
```typescript
export function buildOKFYamlFrontmatter(meta: OKFMetadata): string {
  return [
    "---",
    `okf_version: "0.2"`,
    `id: "${meta.id}"`,
    `title: ${JSON.stringify(meta.title)}`,
    `type: ${JSON.stringify(meta.docType || "concept")}`,
    `domain: ${JSON.stringify(meta.domain || "Technology")}`,
    `tags:\n${meta.tags.map(t => `  - ${JSON.stringify(t)}`).join("\n")}`,
    `entities:\n${meta.entities.map(e => `  - name: ${JSON.stringify(e.name)}\n    type: ${JSON.stringify(e.type)}`).join("\n")}`,
    `relations:\n${meta.relations.map(r => `  - targetTitle: ${JSON.stringify(r.targetTitle)}\n    relationType: ${JSON.stringify(r.relationType)}\n    weight: ${r.weight}`).join("\n")}`,
    "---"
  ].join("\n");
}
```

---

## 5. Procedura di Verifica e Avvio

1. **Installazione**: `npm install`
2. **Controllo Tipi e Sintassi**: `npm run lint` (assicurarsi che non vi siano errori in `tsc --noEmit`).
3. **Avvio in Sviluppo**: `npm run dev` (l'applicazione risponde istantaneamente su `http://localhost:3000`).
4. **Verifica Compilazione di Produzione**: `npm run build` (genera sia l'output statico `dist/` sia il bundle server autonomo `dist/server.cjs`).
5. **Avvio Produzione**: `npm start`
