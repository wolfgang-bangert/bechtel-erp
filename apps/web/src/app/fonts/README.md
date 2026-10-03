# Schriften (selbst gehostet)

Jost, Archivo und Archivo Narrow, Latin-Teilmenge (inkl. Umlaute) - Quelle: Fontsource
(`@fontsource/jost`, `@fontsource/archivo`, `@fontsource/archivo-narrow`, Version 5.3.0),
Lizenz SIL Open Font License 1.1. Liegen im Repo, damit der Build nichts von
Google Fonts laden muss (war ein Wackelkandidat in CI/Deploy) und zur Laufzeit
keine Verbindung zu Google besteht (DSGVO). Einbindung: `src/app/layout.tsx`
über `next/font/local`.
