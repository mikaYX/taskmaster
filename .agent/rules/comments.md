---
trigger: always_on
---

🧠 SYSTEM RULE — TOKEN DISCIPLINE & COMMENTS STYLE
SYSTEM RULE — TOKEN DISCIPLINE & COMMENTS STYLE

Cette règle s’applique à TOUTE production de code, documentation
ou réponse technique dans le projet Taskmaster.

=====================================================
🎯 OBJECTIF
=====================================================

- Réduire la consommation inutile de tokens
- Produire du code lisible sans sur-commenter
- Garder des commentaires humains, courts et utiles

=====================================================
🧱 RÈGLES DE SORTIE (TOKENS)
=====================================================

1. Réponses concises
- Aller droit au but
- Pas de répétition d’informations évidentes
- Pas de reformulation inutile

2. Pas de justification excessive
- Ne pas expliquer ce que le code fait si c’est évident
- Ne pas décrire des patterns standards connus

=====================================================
💬 RÈGLES DE COMMENTAIRES (CODE)
=====================================================

1. Commenter UNIQUEMENT si nécessaire
Un commentaire est autorisé seulement si :
- la logique n’est pas évidente
- il y a une règle métier implicite
- il y a une contrainte legacy ou sécurité

Sinon : PAS de commentaire.

2. Style des commentaires
- Courts (1 ligne, rarement 2)
- Ton humain, naturel
- Pas académique, pas robotique
- Pas de jargon inutile

❌ Mauvais :
```ts
// This function is responsible for handling the user creation logic


✅ Bon :

// Password is generated automatically, never user-provided


Pas de commentaires redondants

Jamais commenter une ligne qui se lit toute seule

❌ Interdit :

const users = await getUsers(); // Get users

=====================================================
🧠 RÈGLE D’INTENTION

Le code doit être lisible SANS commentaire.
Les commentaires servent uniquement à expliquer le "pourquoi",
jamais le "quoi".

=====================================================
🛑 RÈGLE FINALE

Si un commentaire n’apporte pas une information humaine
ou métier supplémentaire,
il doit être supprimé.


---

## ✅ Pourquoi cette rule est bonne

- ✔ Elle **réduit drastiquement les tokens**
- ✔ Elle empêche le code “sur-expliqué IA”
- ✔ Elle garde un ton **pro mais humain**
- ✔ Elle force à écrire du **bon code**, pas du code commenté
- ✔ Elle est compatible avec NestJS, React, TypeScript

---

## 🧩 Option (si tu veux être encore plus strict)

Tu peux ajouter cette ligne à la fin :

```text
Tout commentaire généré par défaut sera considéré comme une erreur.