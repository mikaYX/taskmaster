# Guide utilisateur Taskmaster

Ce guide décrit l’usage quotidien de Taskmaster : consulter le tableau de bord, valider ou signaler une tâche, utiliser les délégations et la liste des tâches à faire (todos).

---

## Tableau de bord (page d’accueil)

Après connexion, la page **Tableau de bord** (`/tasks`) affiche toutes les occurrences de tâches dans quatre blocs :

- **En retard** : tâches dont la date de réalisation est passée et qui n’ont pas encore été validées, échouées ou marquées manquantes.
- **Aujourd’hui** : tâches à faire aujourd’hui (dans la fenêtre horaire configurée).
- **À venir** : prochaines occurrences à venir.
- **Terminées** : tâches déjà validées (SUCCESS), échouées (FAILED) ou manquées (MISSING). L’affichage des terminées peut être activé/désactivé via un interrupteur en haut de page.

Chaque ligne correspond à **une occurrence** d’une tâche (une date donnée). Vous y voyez notamment :

- Le nom de la tâche et sa description.
- Le type de récurrence (daily, weekly, monthly, etc.) et la priorité (LOW, MEDIUM, HIGH, CRITICAL).
- La plage de date/heure dans laquelle la tâche doit être réalisée.
- Les utilisateurs ou groupes assignés.
- Le statut actuel (En cours, Validé, Échoué, Manquée).
- Un lien ou bouton pour ouvrier/télécharger la procédure associée.

Des **filtres** (utilisateur, groupe, site, recherche texte) permettent de restreindre la liste. Le **mode TV** adapte l’affichage pour un écran mural (rafraîchissement automatique, mise en page simplifiée).

---

## Valider une tâche (marquer comme effectuée)

1. Sur le tableau de bord, repérez une tâche dont le statut est **En cours** (badge « En cours »).
2. Cliquez sur l’icône **coche verte** (✓) en fin de ligne.
3. La tâche passe immédiatement au statut **Validé** et est déplacée dans le bloc **Terminées** (si l’affichage des terminées est activé).

Aucun commentaire n’est demandé pour une validation simple. L’action est enregistrée dans l’audit et prise en compte dans les analytiques (taux de conformité, tendances).

---

## Signaler une tâche en échec (non conforme)

1. Sur le tableau de bord, pour une tâche **En cours**, cliquez sur l’icône **croix rouge** (✕).
2. Une fenêtre s’ouvre pour saisir un **commentaire** (obligatoire) décrivant la non-conformité ou la raison de l’échec.
3. Validez. La tâche passe au statut **Échoué** et rejoint le bloc **Terminées**.

Le commentaire est visible par les managers et administrateurs et reste associé à cette occurrence dans les rapports et l’audit.

---

## Marquer une tâche comme manquée

Une occurrence **En cours** peut être marquée **Manquée** (non réalisée dans les délais) soit :

- Par un administrateur via l’action dédiée (édition de statut depuis le tableau de bord ou l’interface d’administration),  
- Soit en la signalant en **Échoué** avec un commentaire du type « Non réalisée » si votre organisation utilise ce convention.

Selon la configuration des notifications, les alertes (email, web push) peuvent être déclenchées pour les tâches en retard ou manquées.

---

## Délégations de tâches

Une **délégation** permet de confier temporairement une tâche à d’autres utilisateurs ou groupes : ils deviennent responsables de la réalisation (et de la validation/échec) pendant la période indiquée.

### Créer une délégation

1. Allez dans **Définitions de tâches** (`/task-definitions`).
2. Ouvrez la fiche de la tâche concernée (clic sur la ligne ou « Détail »).
3. Ouvrez le panneau **Délégations** (bouton ou onglet prévu à cet effet).
4. Cliquez sur **Ajouter une délégation** (ou équivalent).
5. Renseignez :
   - **Date de début** et **date de fin** de la délégation.
   - **Bénéficiaires** : un ou plusieurs utilisateurs et/ou groupes.
   - **Raison** (optionnel) : congés, absence, réorganisation, etc.
6. Validez. Les utilisateurs ciblés verront la tâche dans leur tableau de bord pendant la période.

### Consulter et supprimer des délégations

Dans le même panneau Délégations, la liste des délégations en cours et passées est affichée. Vous pouvez supprimer une délégation si vous avez les droits nécessaires ; la tâche revient alors aux assignations « normales » (utilisateurs ou groupes définis sur la définition de tâche).

---

## Liste des tâches à faire (Todos)

La section **Todos** (accessible depuis le menu) affiche une liste personnelle et éventuellement collective de tâches à faire. Elle complète le tableau de bord en offrant une vue plus « checklist » pour suivre l’avancement au quotidien. Les tâches cochées sont synchronisées avec les statuts du tableau de bord lorsque cela s’applique.

---

## Analytiques et conformité

La page **Analytiques** (`/analytics`) est réservée aux rôles avec droits (hors invités). Elle affiche notamment :

- **Vue d’ensemble** : nombre de tâches validées, échouées, manquées, en cours, et taux de conformité sur la période choisie.
- **Tendances** : courbes d’évolution (par jour ou par semaine) des succès, échecs et manquées.
- **Par tâche** et **par utilisateur** : performance et conformité par définition de tâche ou par utilisateur.

Vous pouvez exporter les données (CSV, PDF) selon les options disponibles dans l’interface.

---

## Profil et paramètres

- **Profil** (`/profile`) : consultez et modifiez vos informations (nom, mot de passe, préférences). Selon la configuration, l’authentification à deux facteurs (MFA) et les passkeys peuvent être gérés depuis cette page.
- **Paramètres** (`/settings`) : réservés aux administrateurs. Ils regroupent la configuration générale, l’authentification (SSO, LDAP, etc.), les notifications, les sauvegardes et les exports.

---

## Raccourcis utiles

| Action | Où |
|--------|-----|
| Voir toutes mes tâches du jour | Tableau de bord (`/tasks`) |
| Valider une tâche | Coche verte sur la ligne (tableau de bord) |
| Signaler un échec | Croix rouge sur la ligne → commentaire |
| Créer une nouvelle tâche récurrente | Définitions de tâches → Nouvelle tâche (wizard 5 étapes) |
| Déléguer une tâche | Fiche de la tâche → Délégations → Ajouter |
| Consulter les stats | Analytiques (`/analytics`) |

Pour toute question sur les droits (rôles, sites, groupes), contactez votre administrateur Taskmaster.
