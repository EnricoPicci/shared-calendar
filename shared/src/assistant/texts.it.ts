import type { AssistantTexts } from './texts';

// The fixed texts in Italian, key by key the ones of the English object. The person is addressed
// with the formal "lei" throughout. The second button is not "Annulla": in a calendar that word
// would read as cancelling the appointment.
export const ASSISTANT_TEXTS_IT: AssistantTexts = {
  cannotAnswer: {
    assistant_limit_reached:
      "Ha raggiunto il limite di messaggi all'assistente per oggi. Sarà di nuovo disponibile domani. Può comunque fare tutto dalle altre pagine.",
    assistant_budget_reached:
      "L'assistente ha raggiunto il suo limite di spesa e per ora non può rispondere. Il suo calendario non ne risente: può comunque fare tutto dalle altre pagine.",
    assistant_unavailable:
      "L'assistente non è disponibile in questo momento. Riprovi tra poco. Può comunque fare tutto dalle altre pagine.",
  },
  nothingChanged: 'Non è stato modificato nulla.',
  answerCutShort: 'La risposta è stata interrotta prima della fine.',
  tooManySteps:
    "L'assistente non è riuscito a completare questa richiesta. Provi a formularla in un altro modo, per esempio chiedendo una cosa alla volta.",
  refused:
    "L'assistente non può rispondere a questa richiesta. Questa conversazione è terminata: il suo prossimo messaggio ne inizierà una nuova.",
  conversationFull: 'Questa conversazione è piena. Per continuare, ne inizi una nuova.',
  proposalQuestion: (changes) => (changes === 1 ? 'Conferma questa modifica?' : `Conferma queste ${changes} modifiche?`),
  confirmLabel: 'Conferma',
  declineLabel: 'Non lo faccia',
  working: 'Ci sto lavorando…',
  reading: {
    settings: 'Sto guardando le impostazioni del calendario…',
    types: 'Sto guardando i tipi di appuntamento…',
    calendar: 'Sto guardando il calendario…',
    appointments: 'Sto guardando gli appuntamenti…',
  },
};
