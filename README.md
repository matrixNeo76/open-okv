# open-okv (Open Knowledge Vault)

Versione self-hosted del **Knowledge Vault** (formato OKF v0.2): archivio di conoscenza con grafo semantico, cattura di risorse e strumenti MCP.

*Self-hosted version of **Knowledge Vault** (OKF v0.2): a knowledge base with a semantic graph, resource capture and MCP tooling, being migrated to PostgreSQL 18 and OpenRouter.*

> **Stato: lavori in corso.** Il repository nasce da [`matrixNeo76/KnowledgeVault`](https://github.com/matrixNeo76/KnowledgeVault) (commit `186beb2`), ripulito da dati personali e configurazione, e **non è ancora pronto all'uso**. Il codice dell'applicazione usa ancora Firestore e Gemini; la migrazione è graduale. Il piano completo è in [`ROADMAP.md`](ROADMAP.md).

## Obiettivo

| Oggi (derivato dall'originale) | Obiettivo di `open-okv` |
|---|---|
| Firestore (accesso dal browser) | **PostgreSQL 18** come fonte di verità, con `pgvector` e `Apache AGE`; accesso tramite l'API del server |
| Gemini (Google AI Studio) | **OpenRouter** con *ruoli* configurabili: modello, riserve, parametri e limiti di spesa, da un pannello admin |
| Login Firebase | password admin del Vault, collegamento OIDC opzionale |
| App singola | pacchetto replicabile (`docker compose`) con moduli opzionali: OpenViking, Firecrawl, Tika, RustFS, SearXNG |

Principi: il database è l'unica fonte di verità; vettori, grafo e copia per gli agenti sono **derivati** e ricostruibili; i valori predefiniti sono configurabili; nessun segreto nel repository.

## Stato della migrazione

- [x] **M1 (parte 1)** schema PostgreSQL, migrazioni, ricerca testuale italiano/inglese e importatore del backup
- [x] **M1 (parte 2)** livello dati (`VaultRepository`) e rotte di lettura `/api/data`
- [x] **M1 (parte 3)** scritture con transazioni e rilevamento dei conflitti, operazioni a blocchi, ricerca per prefisso
- [x] **M2a** client LLM unico (OpenRouter): ruoli, registro dei costi e limiti di spesa applicati dal server
- [x] **M2b** PDF e immagini (ruolo `vision`, GPT 6 Luna, tetto di 1 $ al giorno)
- [ ] **M2c** audio, immagini generate, rerank, decisioni, ricerca web
- [ ] **M2d** agente a più passaggi (chiamate a funzioni) · **M2e** pulizia del codice Gemini
- [ ] **M3** frontend senza accesso diretto a Firestore
- [ ] **M4** pannello admin e autenticazione
- [ ] **M5** ricerca vettoriale e grafo (pgvector, AGE)
- [ ] **M6** pacchetto completo e moduli opzionali

Dettagli, decisioni aperte e ordine di lavoro: [`ROADMAP.md`](ROADMAP.md).

## Cosa contiene

```
server/            API Express, pipeline di ingestione, server MCP
server/db/         migrazioni SQL (migrations/) e runner (migrate.ts)
server/scripts/    strumenti da riga di comando (importVaultBackup.ts, ...)
src/               interfaccia React 19 (Vite, Tailwind)
docs/              specifiche OKF v0.2, architettura, piani storici
ROADMAP.md         cosa è fatto e cosa resta da fare
```

## Requisiti

- Node.js e npm (provato con Node 22; `package.json` non fissa una versione)
- PostgreSQL **18** con le estensioni `pg_trgm`, `unaccent`, `pgcrypto`; per le tappe successive anche `vector` (pgvector 0.8.x) e `age` (Apache AGE 1.8.x)
- Un database vuoto e un ruolo proprietario del database

Versioni di riferimento: PostgreSQL 18.6, pgvector 0.8.6, Apache AGE 1.8.0. La build di AGE per PostgreSQL 18 risulta pubblicata come *release candidate*: per questo il grafo è sempre ricostruibile dalle tabelle.

## Avvio rapido (provvisorio)

```bash
npm ci
export DATABASE_URL=postgres://utente:password@host:5432/knowledge_vault

npx tsx server/db/migrate.ts --status     # mostra le migrazioni applicate
npx tsx server/db/migrate.ts              # applica quelle mancanti

# importazione di un backup esistente (prima una prova senza scrivere)
npx tsx server/scripts/importVaultBackup.ts percorso/vault-backup.json --dry-run
npx tsx server/scripts/importVaultBackup.ts percorso/vault-backup.json
```

Note:
- Se il database ha `ag_catalog` nel `search_path`, le migrazioni usano `SET LOCAL search_path TO public`: non serve altro.
- L'importatore è **idempotente**: rilanciarlo non crea duplicati e verifica conteggi e id.
- `npm ci` richiede un `package-lock.json`; il progetto usa `bun.lock`, quindi senza file di blocco usa `npm install` (oppure `bun install`). Vedi le decisioni aperte nella roadmap.

## Controlli di qualità

```bash
npm run lint      # controllo dei tipi (oggi 2 errori noti in server/services/batchMigrationService.ts)
npm test          # codifica UTF-8, suite di contratto e prove del livello dati (lettura e scrittura)
npm run build     # interfaccia (vite) e server (esbuild) in dist/
npm run dev       # server di sviluppo (porta con PORT=3001)
npm run test:data # prove di lettura (con DATABASE_URL anche sul database)
npm run test:data-write # prove di scrittura, in uno schema temporaneo che non tocca i dati veri
npm run test:llm  # prove del client dei modelli con un OpenRouter finto (nessun costo)
```

## Modelli e controllo della spesa

Le chiamate ai modelli passano da **ruoli** (`llm_roles`): ogni ruolo ha modello, riserve, parametri e limiti. Il server controlla i limiti **prima** di ogni chiamata e registra ogni tentativo in `llm_usage`.

| Variabile | Significato |
|---|---|
| `OPENROUTER_API_KEY` | chiave di OpenRouter, solo nell'ambiente del server. Senza chiave nessuna chiamata parte |
| `LLM_DISABLED=1` | interruttore d'emergenza: blocca tutte le chiamate |
| `LLM_PROVIDER=gemini` | (provvisorio, fino a M2c) usa ancora il vecchio percorso Gemini |
| `OPENROUTER_BASE_URL` | solo per i test (OpenRouter finto) |

- Limiti predefiniti: 0,02 $ per richiesta, 1 $ al giorno e 10 $ al mese per ruolo, 2 $ al giorno e 15 $ al mese in totale, 20 richieste al minuto. Sono modificabili in `llm_roles` e `llm_settings`.
- Consumo: `GET /api/llm/usage` (oggi, mese, per ruolo, ultimi problemi).
- **Consiglio:** imposta anche un limite di spesa sulla chiave dal sito di OpenRouter, come ultima difesa.
- **PDF e immagini** (ruolo `vision`): inviati sempre al modello (GPT 6 Luna), motore PDF esplicito (`native` o gratuito, mai OCR a pagamento), tetti di 20 MB, 10 immagini e 100 pagine; massimo 1 $ al giorno.
- Prove con chiamate vere e budget massimo: `npx tsx server/scripts/llmLiveCheck.ts --max-usd 0.05` (testo) e `npx tsx server/scripts/llmLiveCheckVision.ts --image FILE.png --pdf FILE.pdf --max-usd 0.5` (immagini e PDF).

## Configurazione e sicurezza

- Nessun dato personale e nessun segreto vanno nel repository. `data/`, `.env*`, chiavi e file di servizio sono ignorati da git.
- `DATABASE_URL` si passa solo come variabile d'ambiente.
- `firebase-applet-config.json` contiene **solo valori segnaposto**: serve finché il codice lo importa e verrà rimosso in M3.
- Quando sarà attivo il client LLM, le chiavi dei fornitori resteranno solo nell'ambiente del server, mai nel browser né nel repository.

## Documentazione

- [`ROADMAP.md`](ROADMAP.md): piano di sviluppo
- [`docs/KNOWLEDGEVAULT_README.md`](docs/KNOWLEDGEVAULT_README.md): README originale dell'applicazione
- [`docs/OKF_v0.2_SPECIFICATION.md`](docs/OKF_v0.2_SPECIFICATION.md) e [`docs/SYSTEM_ARCHITECTURE_OKF.md`](docs/SYSTEM_ARCHITECTURE_OKF.md): formato e architettura
- [`ARCHITECTURE.md`](ARCHITECTURE.md): architettura del codice ereditato

## Contribuire

Le modifiche passano da pull request su questo repository. Ogni tappa deve chiudersi con tipi, test e build verdi.

## Licenza

[MIT](LICENSE)
