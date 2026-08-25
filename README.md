# MitRede

**Präsentieren. Fragen. Gemeinsam denken.**

MitRede ergänzt vorhandene PDF-Präsentationen um Live-Umfragen, offene
Fragen und gemeinsam sichtbare Ergebnisse. Moderierende präsentieren im
Browser; Teilnehmende machen anonym per QR-Code oder Raumcode mit.

## Aktueller Stand

Version `0.1.0` enthält das technische Grundgerüst und einen interaktiven
Oberflächen-Prototypen für die drei Kernbereiche:

- `/app` – Präsentationen verwalten
- `/present/demo` – moderieren und Ergebnisse zeigen
- `/join/483921` – auf dem Smartphone abstimmen

Die Oberfläche arbeitet derzeit mit realistischen Beispieldaten. API,
Echtzeitkanal, Datenmodell und Worker sind vorbereitet; die persistente
PDF-Verarbeitung folgt im nächsten Umsetzungsschritt.

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

## Nächster Meilenstein

Der erste durchgängige Funktionsweg ist:

```text
PDF hochladen → Seiten verarbeiten → Single-Choice-Frage einfügen
→ Sitzung starten → anonym beitreten → abstimmen → Ergebnis zeigen
```

Ausführliche Anforderungen und technische Entscheidungen stehen im Verzeichnis
[`Codex`](./Codex/README.md).

