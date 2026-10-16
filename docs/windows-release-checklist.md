# Recette du candidat Windows

Le build actuel produit `Taskmaster-<version>-x64.msi` pour une installation
avec PostgreSQL et Redis/Memurai déjà disponibles. `Setup.exe` et l’ancien
`test-install.ps1` concernent le chemin historique avec prérequis embarqués.
Utiliser le MSI et la procédure ci-dessous pour ce candidat.

## Produire le candidat

Depuis une machine de build Windows, exécuter `installer/build.ps1`, ou lancer
manuellement le workflow **Build Windows installer candidate** sur la révision
à tester. Ce workflow construit un MSI non signé et dépose un artefact de test ;
il ne crée pas de release publique et n’installe rien sur le serveur cible.
Les scripts de vérification et leur dossier `common` sont inclus dans l’artefact.

Le numéro du candidat est celui de `package.json`. Les changements non publiés
figurent dans la section `1.1.7` du changelog. Les versions des trois `package.json` et des
lockfiles sont alignées sur `1.1.7`. Valider ce candidat sur la machine Windows
avant déploiement ; ne pas redistribuer une version déjà publiée avec un contenu
modifié. Signer le MSI de livraison avec le certificat de l’organisation et
recalculer `SHA256SUMS` après signature (`build.ps1 -Sign`).

## Installation et mise à jour sur une VM

1. Utiliser une VM Windows Server jetable avec une base de test et un Redis de
   test. Conserver un instantané de la VM. Vérifier le SHA-256 du MSI téléchargé.
2. Installer la version précédente, puis créer quelques tâches et des statuts,
   un avatar et une procédure. Noter les valeurs attendues sans copier les
   secrets dans le rapport de recette.
3. Dans une console PowerShell administrateur de la VM, conserver l’empreinte du `.env` :

   ```powershell
   $configHash = (Get-FileHash 'C:\ProgramData\Taskmaster\config\.env' -Algorithm SHA256).Hash
   ```

4. Créer une sauvegarde **complète depuis l’interface Taskmaster**. Attendre la
   fin effective du travail et télécharger une copie. Cette opération sollicite
   le compte du service ; lancer `pg_dump` dans une console administrateur ne
   suffit pas à vérifier les droits du service. Si l’ancienne version échoue,
   consigner cet échec et conserver l’instantané de la VM ainsi qu’une copie
   indépendante de la base et des fichiers avant le test de mise à jour.
5. Installer le MSI candidat sur cette VM, puis exécuter :

   ```powershell
   .\installer\verify-installation.ps1 `
     -ExpectedVersion '<version-du-candidat>' `
     -ExpectedEnvHash $configHash `
     -PublicUrl 'https://votre-domaine' `
     -ReportPath '.\recette-installation.json'
   ```

   Le script vérifie service, santé HTTP, outils PostgreSQL, version, conservation
   de la configuration et cohérence des options passkey. Il ne modifie pas les
   services ni la base. Son rapport contient des résultats de contrôles et le
   nom du compte de service, jamais les valeurs du `.env`.
6. Vérifier les anciennes tâches et leur historique. Une tâche sans checklist
   doit rester validable. Créer une checklist, une preuve et une action
   corrective, puis vérifier leur consultation avec les rôles concernés.

## Sauvegarde et restauration

1. Sur l’instance candidate de test, créer une nouvelle sauvegarde complète
   après avoir ajouté des données reconnaissables et une preuve photo.
2. Valider cette archive depuis l’interface. Conserver séparément la clé de
   chiffrement nécessaire ; elle n’est volontairement pas incluse dans l’archive.
3. Restaurer sur une **autre instance jetable isolée**, avec la même version
   applicative et la clé correspondante. Une restauration remplace les données
   de la cible : ne jamais utiliser la production comme cible de recette.
4. Comparer tâches, statuts, checklists, photos, procédures, actions correctives
   et comptes. Vérifier les nouveaux enregistrements après restauration pour
   contrôler aussi les séquences PostgreSQL.
5. Vérifier qu’une archive altérée, non signée ou dépourvue de dump est refusée.
   Ne pas forcer une restauration interversion pour contourner un échec de test.

## Passkeys et validation finale

Depuis un navigateur avec un certificat HTTPS approuvé, utiliser le domaine
public propre à l’installation. Tester création, déconnexion et connexion par
passkey. Le contrôle automatique des options ne remplace pas ce parcours.
Vérifier aussi un compte utilisateur standard, un manager et le mode invité.

Conserver le rapport JSON, le SHA-256 du candidat, les résultats de restauration
et les observations navigateur. Tant que ces vérifications Windows ne sont pas
réalisées, le candidat n’est pas considéré comme validé pour la production.
