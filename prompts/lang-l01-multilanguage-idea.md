I want to understand what it would mean to add multilanguage support to the app.

Languages:
- English (the current one) and Italian for now
- other languages may come later, so adding one must be cheap and must not need a change of architecture

Parts to translate:
- the pages (every screen, label, button and message shown to the user)
- the e-mails the app sends (the mailer's)
- the e-mails Cognito sends (e.g. the invitation with the temporary password), if this is not too complex; if it is, say so and propose what to do
- the assistant: it should already answer in the language of the person's first question; check that this is true today and whether its instructions or tools need a change

Choice of the language:
- the language is chosen per user
- the Administrator does not set the language of another user
- the language is a fact of the person, like the other facts in docs/EMAIL_ARCHITECTURE.md: say where it is stored, how a user changes it, which language a new user gets first, and how the page, the mailer and Cognito's e-mails know it

Formats:
- dates, times, weekday and month names, and other formats follow the user's language

Everything else stays in English, and English remains the language of the project: the code, the comments, the documents, the logs, the API's error codes, the tests and the names in the data. Only what a user sees or reads in their own language changes.

You have to write a document in the "docs" folder that describes how the architecture would be and what I have to do. It must say, for each part to translate, what changes and how the translations are kept, checked and added for a new language.
This document must be the base to create an implementation plan once the architecture is finalized.

Ask any questions you may have to clarify any doubt.
Start working only when everything is clear.
