# Version 1.2.2 (beta) — points à traiter

Liste de travail, à compléter au fil de l'eau. Une fois un point livré, le reporter dans `CHANGELOG.md`.

## 1. Todos : pouvoir assigner à une équipe (groupe)

### Décision

**Option A** : la todo est partagée avec l'équipe, qui la traite entre elle. Tous les membres sont prévenus à l'assignation ; n'importe lequel peut la prendre ou la terminer ; un membre ajouté ou retiré après coup suit la todo automatiquement.

### Livré (à valider en test)

- **Aucune migration** : le modèle `Todo` porte déjà `groupId` (visibilité par les membres du groupe, prise en charge par n'importe lequel). Une colonne `assigneeGroupId` aurait fait doublon, donc elle n'est pas ajoutée.
- Un seul sélecteur « Assignée à » (formulaire de création et dialogue d'édition), avec deux sections : **Équipes** (avec le nombre de membres) puis **Personnes**, et une recherche.
- Une todo va à **une personne ou à une équipe, jamais les deux** : choisir une équipe retire la personne, choisir une personne retire l'équipe. Rien choisi = tout le site, personne en particulier.
- Notifications : à la création d'une todo pour une équipe, ou quand on confie une todo existante à une équipe (`todo.assigned_team`), tous les membres sont prévenus (sauf l'auteur et ceux qui ont désactivé « Tâches collectives de mes groupes »), plus les canaux choisis par l'admin (point 6).
- Filtres et compteurs : inchangés, ils incluent déjà les todos des groupes de l'utilisateur.

### À savoir

- Choisir une personne retire le groupe : la todo devient visible par tout le site (comme avant pour une todo assignée sans groupe).

## 2. Délégations : sélection multiple plus rapide

### Livré (à valider en test)

- Composant partagé `components/target-picker.tsx` (menu à recherche, sections Équipes / Personnes, mode simple ou multiple), utilisé par les todos (point 1) et par `task-delegations-sheet.tsx`.
- Délégations : un seul menu qui reste ouvert et où l'on coche autant d'équipes et de personnes que voulu, avec « Tout sélectionner » / « Tout désélectionner » (appliqués aux résultats filtrés). Les pastilles résument la sélection.
- Les équipes sont en tête, avec leur nombre de membres. Indication : une équipe inclut ses futurs membres.
- Pas de collage de liste (option 4, optionnelle) : à faire seulement si ce n'est pas assez rapide.

## 3. Todos collectives : notification et email à la création

### Constat

Créer une todo collective ne prévenait personne, sauf si elle était assignée à quelqu'un d'autre que son créateur (cloche + pop-up). Aucun email n'était envoyé ; seul le rappel d'échéance en envoie un, et la préférence email du profil est désactivée par défaut.

### Livré (à valider en test)

- Todo assignée à une personne : cloche pour cette personne, plus les canaux secondaires choisis par l'admin (point 6).
- Todo collective sans responsable mais rattachée à un groupe : même chose pour les membres du groupe qui n'ont pas désactivé les notifications collectives (le créateur est exclu).
- Todo pour tout le site sans responsable : pas de cloche (trop bruyant) ; seuls les canaux d'équipe (Slack, Teams…) reçoivent un message.
- Email au design du mail de mot de passe temporaire (en-tête, carte récapitulative, bouton, version FR/EN) : `backend/src/todos/todo-email.template.ts`.
- L'envoi d'email exige que l'envoi d'emails soit activé dans les réglages.

### Reste à faire

- Tests unitaires du gabarit d'email (rendu, échappement HTML).

## 4. Todos collectives : choix du groupe à la création

### Constat

Le formulaire de création n'avait aucun sélecteur de groupe : le groupe n'était pris que dans le filtre de la barre d'outils.

### Livré (à valider en test)

- Sélecteur « Groupe » dans le formulaire de création d'une todo collective (« Tout le site » par défaut), visible pour les gestionnaires.

## 5. Réglage « Rappels » supprimé : rappels d'échéance toujours actifs

Le réglage admin `addons.todolist.reminders.enabled` (interrupteur « Rappels » du module todo) est supprimé : le job horaire de rappel d'échéance tourne dès que le module todo est actif. Chaque personne règle toujours ses canaux dans « Mes rappels » (cloche, pop-up, email).

Une ancienne valeur éventuellement stockée en base pour cette clé est simplement ignorée.

## 6. Todos : canaux de notification secondaires choisis par l'admin

### Besoin

En plus de la cloche, l'admin choisit quels canaux les todos utilisent, parmi ceux configurés dans « Canaux de Notifications ». Désactiver ou supprimer un canal utilisé par les todos doit déclencher un avertissement.

### Livré (à valider en test)

- Nouvel onglet **Réglages > Communication > Notifications des todos**, visible pour le super admin quand le plugin todo est actif. Il liste les canaux configurés, avec un interrupteur par canal.
- Réglage `addons.todolist.notify.channelIds` (liste d'identifiants de canaux, vide par défaut).
- Comportement par type de canal :
  - **Email** : un email personnel (gabarit du point 3) à chaque personne concernée.
  - **Push** : un pop-up navigateur à chaque personne concernée, sauf si elle l'a désactivé dans son profil.
  - **Slack / Teams / Telegram** : un seul message pour l'équipe à chaque création ou assignation.
- Un canal désactivé dans « Canaux de Notifications » est ignoré et apparaît grisé dans l'onglet.
- Garde-fous dans « Canaux de Notifications » :
  - un badge « Lié aux todos » sur les canaux concernés ;
  - une fenêtre d'avertissement avant de désactiver un canal lié (« Désactiver quand même » / « Annuler ») ;
  - un avertissement dans la fenêtre de suppression. À la suppression, le serveur retire aussi le canal du réglage des todos.

### Préférence « Par email » (profil)

- Elle ne concerne que les **rappels d'échéance**. Les emails de création et d'assignation dépendent uniquement du canal Email lié par l'admin : l'utilisateur ne peut pas les couper.
- Cochée par défaut pour les nouveaux comptes : migration `20261027000000_todo_reminder_email_default_on` (nouveau défaut de colonne ; les comptes existants gardent leur choix, donc le plus souvent décoché).

### Impact à connaître

- Le pop-up navigateur des todos (assignation, terminée, commentaire) dépend maintenant d'un canal Push choisi par l'admin. Sans canal Push lié, il n'y a plus de pop-up (avant, il partait par défaut).
- Les rappels d'échéance (point 5) gardent leur fonctionnement actuel (cloche, pop-up et email selon les cases de chacun). Il reste à décider s'ils doivent aussi suivre ce choix.

### Problème repéré

- L'interface propose les types de canal **Discord** et **Webhook**, mais l'enum Prisma `NotificationChannelType` ne les contient pas (`SLACK`, `TEAMS`, `EMAIL`, `TELEGRAM`, `PUSH`). La création d'un tel canal doit donc échouer en base. À corriger (migration ou retrait des options).

## 7. À venir

_Autres points à ajouter plus tard._

## Définition de « terminé » pour 1.2.2

- [ ] Tests unitaires et e2e à jour
- [x] Traductions FR/EN
- [ ] Entrée dans `CHANGELOG.md` (section 1.2.2)
- [ ] Migration Prisma documentée dans le changelog (`20261027000000_todo_reminder_email_default_on` ; le point 1 n'en demande aucune)
