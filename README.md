# MitRede

**Präsentieren. Fragen. Gemeinsam denken.**

MitRede ergänzt vorhandene PDF-Präsentationen um Live-Umfragen, offene
Fragen und gemeinsam sichtbare Ergebnisse. Moderierende präsentieren im
Browser; Teilnehmende machen anonym per QR-Code oder Raumcode mit.

## Aktueller Stand

Version `0.3.0` enthält einen durchgängigen MVP-Funktionsweg für die drei
Kernbereiche:

- `/app` – Präsentationen verwalten
- `/app/presentations/:id/edit` – PDF-Seiten und Interaktionen bearbeiten
- `/present/:sessionId` – moderieren und Ergebnisse zeigen
- `/join/:roomCode` – auf dem Smartphone abstimmen

Präsentationen und Antworten werden in PostgreSQL gespeichert. PDF-Dateien
werden validiert, lokal abgelegt und nach Seiten erfasst. Neue Live-Sitzungen
erhalten einen sechsstelligen Raumcode; anonyme Antworten erscheinen per
Socket.IO unmittelbar in der Moderationsansicht.

Im visuellen Editor werden echte PDF-Seiten dargestellt. Single-Choice-Seiten
können zwischen PDF-Seiten eingefügt, per Drag-and-drop verschoben, dupliziert,
gelöscht und automatisch gespeichert werden. Der Präsentationsmodus folgt
anschließend genau dieser Reihenfolge.

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

## Mit Docker bereitstellen

Die Produktionskonfiguration baut Web-App und API, führt beim API-Start die
Prisma-Migrationen aus und speichert PostgreSQL-Daten sowie hochgeladene Medien
in Docker-Volumes.

```bash
cp .env.deploy.example .env.deploy
# Passwörter und PUBLIC_ORIGIN in .env.deploy anpassen
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build
```

Mit `HTTP_PORT=80` ist MitRede anschließend unter der in `PUBLIC_ORIGIN`
eingetragenen Adresse erreichbar. Für HTTPS muss ein TLS-Reverse-Proxy
vorgeschaltet und `PUBLIC_ORIGIN=https://…` sowie `COOKIE_SECURE=true` gesetzt
werden. Enthält das Datenbankpasswort URL-Sonderzeichen, müssen diese in
`DATABASE_URL` URL-kodiert werden oder ein URL-kompatibles Passwort verwendet
werden.

Status und Logs lassen sich so prüfen:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml ps
docker compose --env-file .env.deploy -f docker-compose.deploy.yml logs -f api web
```

## Präsentationen übertragen

In der Übersicht kann eine selbstständige `.mitrede.json`-Datei importiert
werden. Der Export befindet sich im Optionsmenü jeder Präsentationskarte. Die
Datei enthält die Seitenstruktur, Verknüpfungen, PDFs und Bilder; Sitzungen,
Teilnehmende und Antworten sind bewusst nicht enthalten. Beim Import wird eine
neue Präsentation mit neuen internen IDs erstellt.

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

Die erste Frage wird beim Upload als Vorlage angelegt und kann anschließend im
Editor angepasst werden. Als nächster Ausbau folgen weitere Fragetypen,
Präsentationsnotizen und die Bearbeitung des Präsentationstitels.

Ausführliche Anforderungen und technische Entscheidungen stehen im Verzeichnis
[`Codex`](./Codex/README.md).
