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


## Checklists, preuves et actions correctives

Dans la définition ou la modification d’une tâche, la section **Checklist d’exécution**
permet d’ajouter jusqu’à 50 étapes : case à cocher, texte, mesure numérique ou photo.
Chaque étape peut être obligatoire ou facultative. Une checklist vide conserve la
validation habituelle en un clic. Les libellés des étapes doivent être renseignés.

Depuis le tableau, **Valider** ouvre la saisie des étapes lorsqu’une checklist est
configurée. Toutes les étapes obligatoires doivent être complétées pour réussir le
contrôle. Une mesure de zéro est une réponse valide. Les photos acceptées sont les
PNG, JPEG et WebP de 5 Mo maximum ; attendre leur enregistrement avant de valider.
Les photos ne sont pas publiées par URL publique : leur téléchargement nécessite
un accès authentifié à la tâche et à son site.

Le bouton **Compte rendu** d’une occurrence terminée présente les réponses et les
libellés enregistrés au moment de l’exécution, même si la définition de la checklist
a changé depuis. Les réponses déjà saisies restent dans la fenêtre si la validation
est refusée par le serveur.

Lors d’un échec, les étapes peuvent rester incomplètes. Cocher **Créer une action
corrective** permet de préciser le travail à réaliser et une échéance facultative.
L’action est attribuée à la personne qui la crée ; un manager peut choisir un autre
membre actif du même site. Le contrôle échoué et l’action sont enregistrés ensemble.
Une relance ne crée pas une deuxième action pour la même occurrence.

La page **Actions correctives** affiche les actions ouvertes et clôturées. Une
personne voit les actions dont elle est responsable ou qu’elle a créées ; les
managers supervisent celles de leurs sites. Le responsable ou un manager peut
clôturer une action en décrivant sa résolution, ou la rouvrir. La clôture conserve
le statut d’échec du contrôle d’origine.

### Déploiement de cette évolution

La migration `20261016000000_task_execution` ajoute des colonnes et des tables sans
supprimer de données. Elle doit être appliquée au déploiement de la version qui
utilise ces fonctions. Les tâches existantes reçoivent une checklist vide.

Les photos sont conservées dans `storage/evidence` sous `TASKMASTER_DATA_DIR`.
Les sauvegardes complètes incluent ce dossier. Les configurations Docker déclarent
un volume `app_evidence` ; l’installateur Windows crée le dossier et donne les droits
au compte `LocalService`. Pour une installation personnalisée, le dossier doit être
persistant et accessible en écriture au compte du service. Les métadonnées seules
sont dans PostgreSQL : une sauvegarde DB seule ne contient pas les fichiers photo.

Les tests PostgreSQL de ce parcours utilisent une base de test distincte nommée
`taskmaster_execution_test`, explicitement fournie via
`TASKMASTER_EXECUTION_TEST_DATABASE_URL`. Ils se lancent avec
`npm -w backend run test:execution:postgres`.

### Vues enregistrées et affichage compact

Le tableau permet d’enregistrer une vue nommée avec ses filtres, sa période,
l’affichage des tâches terminées et son mode compact. Les périodes prédéfinies
restent relatives au jour de réapplication ; les périodes personnalisées conservent
leurs dates. Les vues peuvent être appliquées ou supprimées depuis le dialogue.
Elles sont enregistrées dans ce navigateur, séparément pour chaque compte et site,
et ne sont pas partagées entre postes. Un message signale un stockage indisponible.
Le mode compact réduit l’espace occupé par les lignes sans retirer les actions.
Le mode TV conserve sa présentation habituelle.

### Suivre les actions correctives

La page Actions correctives permet de rechercher dans le titre de l’action,
le nom de la tâche ou celui du responsable. Le filtre **Mes actions** conserve
les actions dont vous êtes responsable. **En retard uniquement** affiche les
actions ouvertes dont l’échéance précède la date du jour dans votre navigateur ;
les actions sans échéance et celles dues aujourd’hui ne sont pas considérées
en retard. Les résultats sont triés par échéance, les actions sans échéance
apparaissant en dernier.

La liste est paginée par 50 résultats, avec le nombre total correspondant aux
filtres. Les recherches portent sur toutes les actions autorisées, y compris
au-delà des 500 premières. Les droits par utilisateur et par site restent
appliqués par le serveur. Une clôture ramène à la première page des résultats.

### Modifier son profil

Depuis le profil, vous pouvez modifier votre nom affiché et l’enregistrer.
Le rôle et l’adresse e-mail restent administrés séparément. En cas d’échec,
la saisie reste présente pour permettre une nouvelle tentative.

L’état MFA affiché correspond au compte connecté. Après une activation ou une
désactivation, la fermeture du dialogue actualise le profil. Les codes de
récupération ne sont affichés qu’au moment de l’activation : conservez-les
avant de fermer le dialogue.

### Navigation et accès aux pages d’administration

Les liens Paramètres et Journal d’audit sont affichés aux super administrateurs.
L’ouverture directe des pages Paramètres, Sauvegardes ou Administration avec
un autre rôle affiche un message d’accès non autorisé et un lien de retour au
tableau de bord. Les autorisations restent également contrôlées par le serveur.

Le titre, le logo, le thème et les options d’affichage de l’application sont
chargés depuis les paramètres publics pour tous les rôles. Leur affichage ne
nécessite pas de charger la configuration administrative ni l’état du serveur
mail. Les changements enregistrés dans les paramètres actualisent l’habillage.
