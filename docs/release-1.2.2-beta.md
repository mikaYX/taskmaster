# Version 1.2.2 (beta) — points à traiter

Liste de travail, à compléter au fil de l'eau. Une fois un point livré, le reporter dans `CHANGELOG.md`.

## 1. Todos : pouvoir assigner à une équipe (groupe)

### Constat

Dans une todo, le champ « assigné à » ne propose que des personnes. Le modèle `Todo` ne porte qu'un seul `assigneeId` (relation `TodoAssignee` vers `User`), alors que les groupes (`Group`, `UserGroupMembership`) existent déjà et sont utilisés par les tâches et les délégations.

### Questions à trancher

- **Sémantique** : assigner à un groupe veut dire quoi ?
  - **A. Todo collective partagée** (recommandé) : la todo est visible par tous les membres du groupe, n'importe lequel peut la prendre/terminer. Cohérent avec le marqueur **C** (collective) ajouté en 1.2.1.
  - **B. Duplication** : une todo individuelle créée par membre. Plus lourd, perd le lien entre les copies.
- Un membre ajouté ou retiré du groupe après coup : suit-il la todo ? (avec A : oui, automatiquement.)
- Qui reçoit les notifications ? Tous les membres, ou seulement au moment de la prise en charge ?

### Pistes techniques (option A)

- Backend : ajouter `assigneeGroupId Int?` sur `Todo` (migration Prisma, relation vers `Group`, index), avec la règle « un utilisateur **ou** un groupe, pas les deux » dans le DTO/service.
- Réutiliser la logique de résolution des membres de `BeneficiaryResolverService` pour les droits d'accès et les notifications.
- Filtres de la liste (« mes todos », compteurs du tableau de bord) : inclure les todos des groupes dont l'utilisateur est membre.
- Frontend : le sélecteur d'assigné devient un sélecteur à deux sections « Personnes » / « Équipes » (avec recherche), même composant que pour les délégations (voir point 2).
- Tests : DTO, droits d'accès, filtres, e2e de création d'une todo assignée à un groupe.

## 2. Délégations : sélection multiple plus rapide

### Constat

Le backend accepte déjà plusieurs cibles (`targetUserIds[]`, `targetGroupIds[]`). Mais dans `task-delegations-sheet.tsx`, l'interface oblige à choisir **une personne dans une liste déroulante, puis l'ajouter, puis recommencer** (chips ensuite). Avec beaucoup de bénéficiaires, c'est long.

### Solutions possibles

1. **Liste déroulante à cases à cocher (recommandé)** : un seul menu (combobox) avec recherche, qui reste ouvert et où l'on coche autant de personnes que voulu. Les chips actuels sont conservés pour résumer la sélection. Changement limité au frontend, aucun changement d'API.
2. **Boutons « Tout sélectionner » / « Tout désélectionner »** dans ce même menu, appliqués aux résultats filtrés par la recherche.
3. **Sélectionner par équipe** : cocher un groupe ajoute d'un coup tous ses membres. Déjà possible via `targetGroupIds`, il suffit de mieux le mettre en avant (section « Équipes » en tête du menu, avec le nombre de membres).
4. *(optionnel)* **Coller une liste** de noms ou d'identifiants pour les gros volumes. À ne faire que si 1 à 3 ne suffisent pas.

### Points d'attention

- Choisir entre cibler un groupe (les futurs membres sont inclus) et copier ses membres (liste figée) : à indiquer clairement dans l'interface.
- Le composant multi-sélection devrait être générique et partagé avec le point 1.
- Accessibilité : navigation clavier, `aria-label` conservés, traductions `fr.json` / `en.json`.

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

## 5. Réglage « Rappels » : clarifier le libellé

Le réglage `addons.todolist.reminders.enabled` active seulement le job horaire de rappel d'échéance. Il n'a aucun effet sur les notifications de création ou d'assignation. À préciser dans le libellé et l'aide (« Rappels d'échéance »).

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
- Les rappels d'échéance (réglage « Rappels », point 5) gardent leur fonctionnement actuel. Il reste à décider s'ils doivent aussi suivre ce choix.

### Problème repéré

- L'interface propose les types de canal **Discord** et **Webhook**, mais l'enum Prisma `NotificationChannelType` ne les contient pas (`SLACK`, `TEAMS`, `EMAIL`, `TELEGRAM`, `PUSH`). La création d'un tel canal doit donc échouer en base. À corriger (migration ou retrait des options).

## 7. À venir

_Autres points à ajouter plus tard._

## Définition de « terminé » pour 1.2.2

- [ ] Tests unitaires et e2e à jour
- [ ] Traductions FR/EN
- [ ] Entrée dans `CHANGELOG.md` (section 1.2.2)
- [ ] Migration Prisma documentée dans le changelog si le point 1 est livré
