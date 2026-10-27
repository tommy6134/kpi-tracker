/**
 * Le etichette inglesi dei codici che il plugin salva su disco in italiano
 * (eventi, session.json): restano codici stabili, si traducono solo quando
 * si mostrano. I codici che sono già parole inglesi non compaiono.
 */
export const CODES_EN: Readonly<Record<string, string>> = {
  // Tipo di sessione.
  interattiva: 'interactive',
  sconosciuta: 'unknown',
  // Sorgente e fine dei segmenti.
  ricarica: 'reload',
  'cambio sessione': 'session switch',
  interrotta: 'interrupted',
  // Stato mostrato.
  conclusa: 'ended',
  attiva: 'active',
  // Categorie Bash, classi di file, domini e nomi non validi.
  altro: 'other',
  // Chi ha deciso un permesso.
  regola: 'rule',
  modalità: 'mode',
  // Valori mancanti.
  nessuna: 'none',
  nessuno: 'none',
  '(nessuna)': '(none)',
  eredita: 'inherited',
}
