# Cas d’usage métier et exemples de planification

Ce document décrit des cas d’usage concrets de Taskmaster et donne des exemples de planification (périodicité, fenêtres horaires, assignations) pour vous en inspirer.

---

## 1. Ronde de sécurité quotidienne (jours ouvrés)

**Contexte** : Une équipe doit effectuer une ronde de sécurité chaque jour ouvré (lundi à vendredi), avec consultation d’une procédure PDF.

**Paramétrage type :**

- **Nom** : Ronde de sécurité quotidienne  
- **Périodicité** : Quotidienne (daily)  
- **Règle** : `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR`  
- **Ignorer week-ends** : Oui  
- **Ignorer jours fériés** : Oui (optionnel, selon la politique)  
- **Priorité** : Haute  
- **Assignation** : Groupe « Sécurité » ou utilisateurs dédiés  
- **Procédure** : Lien ou fichier PDF de la checklist  

Les occurrences sont générées chaque jour ouvré. Les agents voient la tâche dans « Aujourd’hui » et la valident ou la signalent en échec à la fin de la ronde.

---

## 2. Contrôle qualité hebdomadaire (un jour fixe)

**Contexte** : Audit qualité sur un échantillon de production, tous les lundis matin.

**Paramétrage type :**

- **Nom** : Contrôle qualité hebdomadaire  
- **Périodicité** : Hebdomadaire (weekly)  
- **Règle** : `FREQ=WEEKLY;BYDAY=MO`  
- **Fenêtre horaire** : par exemple 08:00–12:00 (si l’application gère les créneaux)  
- **Priorité** : Critique  
- **Assignation** : Responsable qualité ou équipe qualité  
- **Procédure** : Lien vers le protocole d’audit  

Une occurrence par lundi. En cas d’absence, une **délégation** peut être créée vers un autre responsable pour la semaine concernée.

---

## 3. Vérification mensuelle des équipements (jour du mois)

**Contexte** : Vérification des extincteurs et des alarmes le 1er de chaque mois.

**Paramétrage type :**

- **Nom** : Vérification mensuelle des équipements  
- **Périodicité** : Mensuelle (monthly)  
- **Règle** : `FREQ=MONTHLY;BYMONTHDAY=1`  
- **Priorité** : Haute  
- **Assignation** : Techniciens ou groupe « Maintenance »  
- **Procédure** : Checklist ou document de traçabilité  

Une occurrence le 1er de chaque mois. Les analytiques sur 30 ou 90 jours permettent de suivre le taux de réalisation et les éventuels retards.

---

## 4. Revue trimestrielle de conformité

**Contexte** : Revue formelle de conformité réglementaire tous les trois mois (début de trimestre).

**Paramétrage type :**

- **Nom** : Revue trimestrielle conformité  
- **Périodicité** : Mensuelle avec intervalle (monthly, interval = 3)  
- **Règle** : `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1`  
- **Priorité** : Critique  
- **Assignation** : Responsable conformité ou comité  
- **Procédure** : Lien vers le référentiel et le compte-rendu type  

Cela génère une occurrence le 1er janvier, 1er avril, 1er juillet, 1er octobre. Idéal pour les indicateurs de conformité et les rapports annuels.

---

## 5. Nettoyage des zones techniques (plusieurs jours par semaine)

**Contexte** : Nettoyage des locaux techniques le mardi et le vendredi.

**Paramétrage type :**

- **Nom** : Nettoyage des zones techniques  
- **Périodicité** : Hebdomadaire (weekly)  
- **Règle** : `FREQ=WEEKLY;BYDAY=TU,FR`  
- **Priorité** : Basse ou Moyenne  
- **Assignation** : Équipe d’entretien ou prestataire  

Deux occurrences par semaine, toujours les mêmes jours. Les rapports analytiques « par tâche » permettent de vérifier la régularité sur le trimestre.

---

## 6. Point quotidien opérations (tous les jours)

**Contexte** : Point court avec l’équipe chaque jour, sans exclusion week-end (activité 7j/7).

**Paramétrage type :**

- **Nom** : Point quotidien opérations  
- **Périodicité** : Quotidienne (daily)  
- **Règle** : `FREQ=DAILY`  
- **Ignorer week-ends** : Non  
- **Priorité** : Moyenne  
- **Assignation** : Manager de site ou équipe de permanence  

Une occurrence par jour. Utile pour les tableaux de bord en temps réel et le suivi de présence/continuité.

---

## 7. Tâche ponctuelle (une seule date)

**Contexte** : Formation obligatoire ou audit exceptionnel à une date donnée.

**Paramétrage type :**

- **Nom** : Formation sécurité 2026  
- **Périodicité** : Une fois (once)  
- **Date de début** : date unique de l’événement  
- **Priorité** : Haute ou Critique  
- **Assignation** : Liste des participants ou groupe  

Une seule occurrence à la date choisie. Après validation ou échec, la tâche reste dans l’historique et les exports.

---

## 8. Multi-sites et hiérarchie

Lorsque Taskmaster est configuré avec **plusieurs sites** (et éventuellement une hiérarchie parent/enfant) :

- Les tâches peuvent être rattachées à un **site**.
- Les utilisateurs sont affectés à un ou plusieurs sites ; le tableau de bord peut être filtré par site.
- Les **groupes** peuvent être liés à un site pour restreindre les assignations et les délégations.

Exemple : une « Ronde de sécurité » définie pour le site « Entrepôt Nord » n’apparaît qu’aux utilisateurs ayant ce site dans leur périmètre (et selon les filtres appliqués).

---

## 9. Délégations : congés, absences, transfert de charge

**Congés ou absence prolongée**  
Le responsable crée une délégation sur la tâche « Ronde de sécurité quotidienne » (ou autre) : date de début = premier jour d’absence, date de fin = dernier jour. Bénéficiaires = un ou plusieurs collègues. Raison : « Congés » ou « Absence ».

**Transfert temporaire de charge**  
Même principe pour une réorganisation de courte durée : délégation vers une autre équipe ou un autre site sur une période donnée.

Les délégations en cours sont visibles dans le panneau Délégations de la fiche tâche ; les rapports et l’audit gardent la trace des validations effectuées par les délégataires.

---

## 10. Notifications et alertes

Selon la configuration (paramètres, canaux email/web push) :

- **Rappel** : notification avant la fin de la fenêtre de réalisation.  
- **Échec / Manquée** : alerte envoyée aux responsables ou à une liste configurée.  
- **Conformité** : les tableaux Analytics permettent de suivre les tendances et de réagir en cas de baisse de taux de réalisation.

En combinant **définition de tâche** (périodicité, priorité, procédure), **assignations** (utilisateurs/groupes/sites) et **délégations**, Taskmaster couvre des besoins allant du simple contrôle quotidien à la conformité réglementaire et au pilotage multi-sites.
