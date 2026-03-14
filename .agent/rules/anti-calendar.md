# Règle d'Intégrité : Anti-Réintroduction du Module "Calendrier"

**Statut :** Suppression définitive et blocage CI ("Kill-Switch").

## Objectif

Empêcher toute régression architecturale ou ajout de dette technique liés à la fonction "Calendrier". Le module Calendrier (route, permissions associées `calendar:read`, endpoints `/calendar/*` et vue de page) a été supprimé suite à un audit et cet usage métier global n'a plus lieu d'exister.

## Règles strictes (Kill-Switch du Calendrier)

1. **Aucun routing :** `CalendarPage`, `GET /calendar`, route API `/api/calendar` interdits.
2. **Aucune permission :** La permission RBAC `calendar:read` (ou `write`) est strictement obsolète.
3. **Usage d'UI non-métier Whitelisté :**
   - L'import de la librairie d'icônes `lucide-react` (ex: `CalendarIcon`, `CalendarClock`, etc.) est **autorisé** lorsqu'il décrit une action liée au calendrier générique.
   - Le composant UI primitif de sélection de dates (par ex. `components/ui/calendar.tsx` de Shadcn UI) est **autorisé** car il intervient dans les popovers (date picker) au sein des autres fonctionnalités (Analytics, Boards, etc.).
   - Le pseudo-sélecteur CSS natif HTML5 au sein d' `index.css` (`::-webkit-calendar-picker-indicator`) est maintenu.

## Procédure d'Exception

S'il advient le besoin vital de lier un mot clé `calendar` à un cas d'usage pur UI ou utilitaire non concerné par la logique "gestion du calendrier global" du projet :

1. Documentez l'exception explicitement en commentaire de votre code.
2. Ajoutez l'occurrence spécifique dans l'allowlist du script CI : `scripts/check-calendar-refs.sh`.

## Surveillance CI

Le script `check-calendar-refs.sh` vérifie activement la réintroduction des chaînes `calendar` ou `calendrier` à chaque Merge (PR/Push). Toute violation non couverte par l'allowlist aboutit à un plantage critique lors du CI et remonte précisément le fichier et la ligne fautifs.
