// Errori del livello dati, tradotti in codici HTTP dalle rotte.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
export class NotFoundError extends Error {
  constructor(what = "risorsa") {
    super(`${what} non trovata`);
    this.name = "NotFoundError";
  }
}
/** La riga e' cambiata dopo l'ultima lettura (updatedAt atteso diverso da quello attuale). */
export class ConflictError extends Error {
  constructor(public readonly currentUpdatedAt?: string) {
    super("conflitto: l'elemento e' stato modificato da un altro client");
    this.name = "ConflictError";
  }
}
export class AlreadyExistsError extends Error {
  constructor() {
    super("id gia' esistente");
    this.name = "AlreadyExistsError";
  }
}
/** Errore di un'operazione dentro un'operazione a blocchi: indica quale. */
export class BatchError extends Error {
  constructor(public readonly opIndex: number, public readonly cause: Error) {
    super(`operazione ${opIndex}: ${cause.message}`);
    this.name = "BatchError";
  }
}
