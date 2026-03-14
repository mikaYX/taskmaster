# Guide d'authentification

Ce guide explique comment choisir, configurer et valider les mécanismes d'authentification pris en charge par Taskmaster.

## Contexte

Taskmaster prend en charge plusieurs modes d'authentification pour s'adapter aux environnements internes comme aux fournisseurs d'identité externes :

| Méthode | Cas d'usage principal | Niveau d'effort | Niveau de sécurité |
| --- | --- | --- | --- |
| `Local` | compte administrateur interne ou usage simple | faible | élevé si les secrets sont bien gérés |
| `OIDC générique` | Keycloak, Auth0, Okta, fournisseur OpenID Connect | moyen | élevé |
| `Google OAuth` | Google Workspace ou comptes Google | faible à moyen | élevé |
| `Azure AD / Entra ID` | Microsoft 365 et annuaires Azure | moyen | élevé |
| `SAML 2.0` | SSO d'entreprise historique | élevé | élevé |
| `LDAP` | Active Directory ou annuaire interne | moyen | moyen à élevé selon l'infra |

Le choix dépend surtout du fournisseur d'identité existant, du niveau d'intégration souhaité et de la stratégie de gestion des comptes.

## Pré-requis

- Disposer d'une instance Taskmaster accessible publiquement si vous utilisez un SSO externe.
- Connaître l'URL publique du backend et celle du frontend.
- Pouvoir modifier la configuration d'authentification dans l'application.
- Avoir un administrateur capable de valider un test de connexion.

## Étapes

### Définir les variables d'environnement communes

Les intégrations SSO reposent au minimum sur :

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `BACKEND_URL` | URL publique de l'API pour les callbacks | `https://api.taskmaster.example` |
| `FRONTEND_URL` | URL publique du frontend pour la redirection finale | `https://app.taskmaster.example` |
| `AUTH_SECRET` | signature des jetons applicatifs | secret long et unique |

Selon le fournisseur, d'autres secrets ou identifiants sont nécessaires dans les paramètres d'authentification de l'application.

### Choisir une méthode adaptée

1. Utilisez `Local` si vous avez seulement besoin d'un accès interne simple.
2. Utilisez `OIDC générique` si votre fournisseur expose OpenID Connect.
3. Utilisez `Google OAuth` pour Google Workspace.
4. Utilisez `Azure AD / Entra ID` pour Microsoft 365.
5. Utilisez `SAML 2.0` si votre SI impose ce standard.
6. Utilisez `LDAP` pour un annuaire interne classique.

### Configurer OIDC générique

1. Récupérez l'URL de l'issuer de votre fournisseur.
2. Créez un client OAuth côté fournisseur d'identité.
3. Déclarez l'URL de callback construite à partir de `BACKEND_URL`.
4. Saisissez l'issuer, le client ID, le client secret et les scopes dans Taskmaster.
5. Testez puis activez le provider.

Points d'attention :

- scopes usuels : `openid email profile`
- vérifiez que l'horloge serveur est correcte
- utilisez des URLs publiques cohérentes avec vos reverse proxies

### Configurer Google OAuth

1. Créez des identifiants OAuth dans Google Cloud Console.
2. Ajoutez l'URI de redirection autorisée basée sur `BACKEND_URL`.
3. Reportez `Client ID` et `Client Secret` dans Taskmaster.
4. Si nécessaire, limitez l'accès via le domaine hébergé.
5. Testez avant activation.

### Configurer Azure AD / Entra ID

1. Créez l'application dans le portail Azure.
2. Renseignez l'URI de redirection basée sur `BACKEND_URL`.
3. Récupérez `Tenant ID`, `Client ID` et le secret applicatif.
4. Saisissez ces valeurs dans Taskmaster.
5. Testez puis activez le provider.

### Configurer SAML 2.0

1. Créez une application SAML dans votre fournisseur d'identité.
2. Déclarez l'ACS URL et, si nécessaire, l'Entity ID de Taskmaster.
3. Importez ou recopiez les métadonnées nécessaires dans Taskmaster.
4. Vérifiez les attributs envoyés pour l'identité utilisateur.
5. Testez avec un compte de recette avant mise en production.

### Configurer LDAP

1. Renseignez l'hôte, le port et le schéma de connexion.
2. Définissez l'utilisateur de bind si nécessaire.
3. Configurez la base de recherche et les filtres d'utilisateurs.
4. Testez la connexion et l'authentification.
5. Activez la méthode uniquement après validation d'un compte réel.

### Préparer le mode local

Le mode local reste utile pour :

- un compte d'administration de secours ;
- un environnement de développement ;
- une stratégie de repli si le SSO externe est indisponible.

Dans ce cas, sécurisez fortement `AUTH_SECRET`, les mots de passe et l'accès administrateur.

## Vérifications

- La redirection vers le fournisseur d'identité fonctionne sans erreur de callback.
- La connexion aboutit avec un compte de test valide.
- L'utilisateur revient bien vers le frontend après authentification.
- Les erreurs de configuration sont visibles dans les logs backend.
- Un plan de repli existe si le provider externe est indisponible.

## Ressources

- Point d'entrée projet : [`../README.md`](../README.md)
- Installation et environnement : [`../SETUP.md`](../SETUP.md)
- Dépannage général : [`./troubleshooting.md`](./troubleshooting.md)
- Tests auth : [`./AUTH_CI_TESTING.md`](./AUTH_CI_TESTING.md)

Notes :

- Les URLs publiques cohérentes entre `BACKEND_URL`, `FRONTEND_URL` et le fournisseur d'identité sont une dépendance implicite de tout SSO.
- Selon le provider choisi, il peut être nécessaire de générer ou de renouveler régulièrement des secrets applicatifs.

## Voir aussi

- [`./AUTH_CI_TESTING.md`](./AUTH_CI_TESTING.md)
- [`./AUTH_GRACE_WINDOW_HARDENING.md`](./AUTH_GRACE_WINDOW_HARDENING.md)
- [`./incident_runbook.md`](./incident_runbook.md)
