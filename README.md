# MitRede

**Präsentieren. Fragen. Gemeinsam denken.**

MitRede ergänzt vorhandene PDF-Präsentationen um Live-Umfragen, offene
Fragen und gemeinsam sichtbare Ergebnisse. Moderierende präsentieren im
Browser; Teilnehmende machen anonym per QR-Code oder Raumcode mit.

## Aktueller Stand

Version `0.2.0` enthält einen durchgängigen MVP-Funktionsweg für die drei
Kernbereiche:

- `/app` – Präsentationen verwalten
- `/present/:sessionId` – moderieren und Ergebnisse zeigen
- `/join/:roomCode` – auf dem Smartphone abstimmen

Präsentationen und Antworten werden in PostgreSQL gespeichert. PDF-Dateien
werden validiert, lokal abgelegt und nach Seiten erfasst. Neue Live-Sitzungen
erhalten einen sechsstelligen Raumcode; anonyme Antworten erscheinen per
Socket.IO unmittelbar in der Moderationsansicht.

## Voraussetzungen

- Node.js 22 oder neuer
- pnpm 11
- Docker mit Docker Compose

## Lokal starten

```bash
cp .env.example .env
npm install --global pnpm@11.23.0
pnpm install
pnpm infra:up
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Danach sind erreichbar:

- Web-App: <http://localhost:5173/app>
- API-Status: <http://localhost:3000/api/health>
- API-Dokumentation: <http://localhost:3000/api/docs>
- MinIO-Konsole: <http://localhost:9001>

Der Worker wird bei Bedarf separat mit `pnpm dev:worker` gestartet.

## Projektstruktur

```text
apps/
├── web/          React + Vite: Verwaltung, Präsentation, Teilnahme
├── api/          NestJS: REST, Socket.IO und Prisma
└── worker/       BullMQ: spätere PDF-, Export- und AI-Aufgaben
packages/
├── contracts/    Laufzeitvalidierte DTOs und Echtzeitereignisse
└── domain/       Zustandsautomaten und Domänenregeln
infra/
└── nginx/        Reverse-Proxy-Konfiguration für den Institutsbetrieb
Codex/                Anforderungen und Architekturentscheidungen
```

## Qualitätsprüfung

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Aktueller Funktionsweg

Der erste durchgängige Funktionsweg ist:

```text
PDF hochladen → Seiten erfassen → Single-Choice-Frage anlegen
→ Sitzung starten → anonym beitreten → abstimmen → Live-Ergebnis zeigen
```

Die erste Frage wird beim Upload als Vorlage angelegt. Als
nächster Ausbau folgen PDF-Seitenbilder im Präsentationsmodus, ein visueller
Knoten-Editor und die freie Bearbeitung von Fragen und Antwortoptionen.

Ausführliche Anforderungen und technische Entscheidungen stehen im Verzeichnis
[`Codex`](./Codex/README.md).
