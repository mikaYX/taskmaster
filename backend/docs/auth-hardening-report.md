# Auth Hardening Final Pass - Pre-Merge Report

Ce document synthétise les ultimes ajustements et choix d'architecture opérés pour sécuriser, stabiliser et documenter le module d'authentification avant fusion vers `main`.

---

## 1. Périmètre des Hardenings Appliqués

### 1.1 Stabilisation du code de test Front-End
L'objectif central était d'éliminer les faux-positifs et la fragilité des tests React (vitest/jsdom) sans altérer la logique métier sous-jacente :
- **Injection i18next** : Définition d'un mock standard pour `react-i18next` dans les composants `login-page` et `passkeys-manage-dialog` pour éviter l'erreur `NO_I18NEXT_INSTANCE`.
- **Interopérabilité `localStorage`** : Constat de la corruption du moteur local JSDOM/Zustand en environnement Vitest. Résolution via une surcouche de type *polyfill* injectée via `vi.stubGlobal('localStorage', ...)` qui permet de tester efficacement les opérations (`getItem`, `setItem`) du middleware `persist` sans lever de `TypeError`.
- **Confinement React `act()`** : Ajout explicite d'un wrapper asynchrone pour la résolution asynchrone des composants de vue, étouffant les alertes de state non-encapsulées.

### 1.2 Durcissement de la Gate CI
- **Révocation des Bypasses** : Supression des masques (`|| echo`) sur l'étape de détection de flakiness (`npm run test:auth:flaky`) dans `.github/workflows/auth-non-regression.yml`. 
- **Déterminisme Strict** : La pipeline CI échouera de manière forte et bruyante (`exit 1`) dès lors qu'un test vacille ou si la distribution s'interrompt avec 0 tests exécutés, bloquant le merge natif sur GitHub.

### 1.3 Protection Anti-Abus (MFA / Rate Limiting)
- Fix de la logique de Lockout progressif : Un utilisateur demandant un token MFA voyait jusqu'ici son compteur *brute-force* remis à zéro dès l'introduction du mot de passe réussi (avant la requête MFA). Cela a été corrigé afin de ne vider les métriques conditionnelles qu'***après* validation du jeton MFA**.

### 1.4 Sécurité OIDC (Identity Provider)
- Adoption d'une politique **Stricte-Permissive** : Si un IdP (Identity Provider) extérieur configure activement la clé `email_verified`, elle est obligée d'être `true` sous peine d'un `UnauthorizedException`. S'il ne l'intègre pas dans le scope réclamé, l'authentification procède.

---

## 2. Décisions de Sécurité Retenues

* **Bloquer le bypass par abandon MFA** : En reportant l'acquittement de succès (`redis.del`) après la validation complète, un attaquant ne peut plus valider une liste de mots de passe en boucle sur un compte MFA, puis délaisser l'étape MFA pour effacer ses pénalités.
* **Résilience OIDC rétro-compatible** : Admettre l'absence complète de la *claim* `email_verified` évite la fragmentation du produit pour les instances clientes branchées sur d'anciens serveurs (ex: vieux déploiements LDAP wrappés).
* **Isolation Test/Dev** : En forçant `vi.stubGlobal('localStorage')` uniquement dans les couches tests qui le manipulent, on s'assure que la pollution jsdom n'impacte pas le build vitest tout en respectant l'immutabilité du code métier frontend.

---

## 3. Résultats de Tests Observés

Tous les scénarios (Backend, Frontend, End-to-End Auth) passent sur des environnements fraîchement isolés et non-tolérants.

* `npm run test:backend` :
  * **Status** : ✅ PASS
  * **Test Suites** : 31 passed, 31 total
  * **Tests** : 191 passed, 191 total (y compris la rétention du MFA Lockout)

* `npm run test:frontend` (`vitest`) :
  * **Status** : ✅ PASS (sans erreurs de type ni warnings `act`)
  * **Test Files** : 9 passed (9)
  * **Tests** : 59 passed (59)

---

## 4. Risques Résiduels & Limites Assumées

1. **Responsabilité de l'E-mail Fourni (OIDC)** : Puisque nous intégrons une posture "permissive" si `email_verified` est totalement absent de l'IdP JWT, une mauvaise configuration de l'IdP du client pourrait lier d'anciennes adresses usurpées. *Mitigation : C'est aux clients de contrôler ce qu'ils déclarent via la Capabilities Map.*
2. **Lockout sur NAT (Network Address Translation)** : Une attaque distribuée par relais VPN ou Proxy entreprise pourrait amener au lockout des utilisateurs locaux innocents partageant cette IP, si l'attaquant déclenche le `[AUTH_ALERT_SPIKE_DETECTED]`. Un utilisateur légitime réussissant à s'identifier *réinitialisera* le filtre IP, rendant la mesure de mitigation cyclique.
3. **Flakiness JSDOM Storage** : Le warning `(node:X) Warning: --localstorage-file was provided without a valid path` reste émis (par le processus Node/Vitest) mais il est maîtrisé algorithmiquement grâce à `mockStorage`. Aucun faux-négatif n'est reporté.
